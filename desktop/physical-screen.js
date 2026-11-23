import * as THREE from 'three';

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;

/** Centered cover, expressed only in the physical screen's 0–1 media UV. */
export function physicalScreenCrop(aspect, mediaAspect = 16 / 9) {
  if (!(Number.isFinite(aspect) && aspect > 0 && Number.isFinite(mediaAspect) && mediaAspect > 0)) {
    throw new RangeError('Physical screen and source aspect ratios must be positive.');
  }
  return [Math.min(1, aspect / mediaAspect), Math.min(1, mediaAspect / aspect)];
}

function mediaAspect(texture) {
  const image = texture?.image || texture?.source?.data;
  const width = image?.videoWidth || image?.naturalWidth || image?.displayWidth || image?.width;
  const height = image?.videoHeight || image?.naturalHeight || image?.displayHeight || image?.height;
  return positive(width / height, 16 / 9);
}

export const phosphorEmission = /* glsl */`
  #ifdef USE_EMISSIVEMAP
    vec3 screenColor = texture2D(uMap, vEmissiveMapUv).rgb;
    if (uVideoSRGB > .5) {
      // r169 uploads video with a linear internal format. Match the built-in
      // map_fragment EOTF once, before Three's normal output color conversion.
      screenColor = mix(pow(screenColor * .9478672986 + vec3(.0521327014), vec3(2.4)),
        screenColor * .0773993808, vec3(lessThanEqual(screenColor, vec3(.04045))));
    }
    // The thicker corners of the faceplate absorb more of the raster. Most
    // of the picture sees the same transmission through the central glass.
    vec2 glass = abs(vGlassUv * 2.0 - 1.0);
    float edge = smoothstep(.84, .998, max(glass.x, glass.y));
    float corner = smoothstep(1.02, 1.40, length(glass));
    float transmission = (1.0 - .11 * edge) * (1.0 - .08 * corner);
    // At television viewing distance individual scan lines are unresolved.
    // Suppress the pattern before it reaches Nyquist as the camera recedes.
    float line = vGlassUv.y * 240.;
    float resolve = 1.0 - smoothstep(.25, .50, fwidth(line));
    float beam = 1. - .018 * resolve * (.5 + .5 * cos(6.2831853 * line));
    float luma = dot(screenColor, vec3(.2126, .7152, .0722));
    screenColor = mix(screenColor, vec3(luma), .035) * vec3(1., .997, .984);
    totalEmissiveRadiance *= screenColor * transmission * beam * uBrightness * uPower;
  #else
    totalEmissiveRadiance = vec3(0.0);
  #endif
`;

class PhysicalScreenMaterial extends THREE.MeshPhysicalMaterial {
  constructor(map = null, aspect = 4 / 3, options = {}) {
    super({
      color: 0x121916,
      emissive: 0xffffff,
      emissiveIntensity: .87,
      emissiveMap: map,
      roughness: .19,
      metalness: 0,
      ior: 1.52,
      // The tinted, anti-reflective face is lit by the same nearby strips as
      // the cabinet. Keep their reflection below the phosphor image.
      specularIntensity: .28,
      specularColor: 0xe8f3ef,
      clearcoat: .048,
      clearcoatRoughness: .16,
      envMapIntensity: .54,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      toneMapped: true,
    });
    this.name = 'Physical CRT glass with emissive video';
    this.uniforms = {
      uMap: { value: map },
      uCrop: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: 1 },
      uPower: { value: 1 },
      uBrightness: { value: 1 },
      uVideoSRGB: { value: 0 },
    };
    this.userData.physicalScreen = { aspect: positive(aspect, 4 / 3) };
    updatePhysicalScreenMaterial(this, options);
  }

  onBeforeCompile(shader) {
    for (const [key, uniform] of Object.entries(this.uniforms)) shader.uniforms[key] = uniform;
    shader.vertexShader = `uniform vec2 uCrop; varying vec2 vGlassUv;\n${shader.vertexShader}`.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_EMISSIVEMAP
        vGlassUv = uv;
        vEmissiveMapUv = (vEmissiveMapUv - .5) * uCrop + .5;
      #endif`,
    );
    shader.fragmentShader = `uniform sampler2D uMap;
      varying vec2 vGlassUv; uniform float uPower, uBrightness, uVideoSRGB;\n${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>', phosphorEmission,
    );
  }

  customProgramCacheKey() {
    return 'rerun-physical-crt-glass-v5';
  }

  onBeforeRender() {
    updatePhysicalScreenMaterial(this);
  }

  copy(source) {
    super.copy(source);
    if (source.uniforms) {
      this.uniforms = Object.fromEntries(Object.entries(source.uniforms).map(([key, uniform]) => [key, {
        value: uniform.value?.isTexture ? uniform.value : uniform.value?.clone ? uniform.value.clone() : uniform.value,
      }]));
    }
    return this;
  }
}

/**
 * The TV supplies the curved aperture geometry and UV (U right, V up).
 * The surface is opaque across that whole aperture; its sole texture is media.
 * Gloss comes from the real scene lights/environment, not a drawn reflection.
 * Texture transforms and resource ownership remain unchanged.
 */
export function createPhysicalScreenMaterial(map, aspect, options = {}) {
  return new PhysicalScreenMaterial(map, aspect, options);
}

export function updatePhysicalScreenMaterial(material, patch = {}) {
  const uniforms = material.uniforms;
  const state = material.userData.physicalScreen;
  if (has(patch, 'map')) uniforms.uMap.value = patch.map;
  if (has(patch, 'aspect')) state.aspect = positive(patch.aspect, state.aspect);
  for (const [option, uniform, max] of [
    ['opacity', 'uOpacity', 1], ['power', 'uPower', 1], ['brightness', 'uBrightness', 4],
  ]) if (Number.isFinite(patch[option])) uniforms[uniform].value = THREE.MathUtils.clamp(patch[option], 0, max);

  const texture = uniforms.uMap.value;
  const wasEnabled = Boolean(material.emissiveMap);
  material.emissiveMap = texture;
  if (wasEnabled !== Boolean(texture)) material.needsUpdate = true;
  uniforms.uCrop.value.set(...physicalScreenCrop(state.aspect, mediaAspect(texture)));
  uniforms.uVideoSRGB.value = texture?.isVideoTexture && texture.colorSpace === THREE.SRGBColorSpace ? 1 : 0;
  material.opacity = uniforms.uOpacity.value;
  return material;
}

// At a fixed camera the only changing term in the glass BRDF is phosphor
// emission. Retain the actual incident/reflected radiance in linear HDR, then
// combine each newly decoded frame with it before ACES and output conversion.
export class RetainedGlass {
  constructor(renderer, scene, camera, televisions) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.tvs = televisions;
    this.invBuffer = new THREE.Vector2();
    this.target = renderer.extensions.has('EXT_color_buffer_float') ? new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    }) : null;
    this.surfaces = this.target ? televisions.map(({ screenMaterial: m }) => new THREE.ShaderMaterial({
      name: 'Curved CRT with retained studio illumination',
      uniforms: { ...m.uniforms, illumination: { value: this.target.texture },
        emissive: { value: m.emissive.clone().multiplyScalar(m.emissiveIntensity) },
        clearcoat: { value: m.clearcoat }, invBuffer: { value: this.invBuffer } },
      vertexShader: `
        uniform vec2 uCrop;
        varying vec2 vGlassUv, vEmissiveMapUv;
        varying vec3 vGlassNormal, vGlassView;
        void main() {
          vGlassUv = uv;
          vEmissiveMapUv = (uv - .5) * uCrop + .5;
          vec4 view = modelViewMatrix * vec4(position, 1.);
          vGlassNormal = normalMatrix * normal;
          vGlassView = -view.xyz;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        #include <common>
        #define USE_EMISSIVEMAP
        uniform sampler2D illumination, uMap;
        uniform vec2 invBuffer;
        uniform vec3 emissive;
        uniform float clearcoat, uVideoSRGB, uPower, uBrightness;
        varying vec2 vGlassUv, vEmissiveMapUv;
        varying vec3 vGlassNormal, vGlassView;
        void main() {
          vec4 light = texture2D(illumination, gl_FragCoord.xy * invBuffer);
          vec3 totalEmissiveRadiance = emissive;
          ${phosphorEmission}
          float facing = saturate(dot(normalize(vGlassNormal), normalize(vGlassView)));
          vec3 emitted = totalEmissiveRadiance * (1. - clearcoat * F_Schlick(.04, 1., facing));
          gl_FragColor = vec4(light.rgb / max(light.a, .001) + emitted, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })) : [];
  }
  async prewarm() {
    if (!this.target || !this.renderer.compileAsync) return;
    const samples = new THREE.Group();
    for (const tv of this.tvs) samples.add(new THREE.Mesh(tv.screen.geometry, tv.screenMaterial));
    this.renderer.setRenderTarget(this.target);
    const physical = this.renderer.compileAsync(samples, this.camera, this.scene);
    this.renderer.setRenderTarget(null);
    samples.children.forEach((sample, i) => { sample.material = this.surfaces[i]; });
    await Promise.all([physical, this.renderer.compileAsync(samples, this.camera, this.scene)]);
  }
  capture(layer) {
    if (!this.target) return;
    const renderer = this.renderer, camera = this.camera;
    const size = renderer.getDrawingBufferSize(this.invBuffer);
    // Specular lighting is continuous on the polished glass. Keep the whole
    // video at native resolution; only the reflection field is filtered.
    const scale = Math.min(1, Math.sqrt(1000000 / (size.x * size.y)));
    this.target.setSize(Math.max(1, Math.round(size.x * scale)), Math.max(1, Math.round(size.y * scale)));
    this.invBuffer.set(1 / size.x, 1 / size.y);
    const cameraMask = camera.layers.mask;
    const snapshots = this.tvs.map(tv => {
      const state = [tv.screen.layers.mask, tv.screenMaterial.uniforms.uPower.value];
      tv.screen.layers.enable(layer);
      tv.screenMaterial.uniforms.uPower.value = 0;
      return state;
    });
    renderer.setRenderTarget(this.target);
    camera.layers.set(layer);
    renderer.render(this.scene, camera);
    renderer.setRenderTarget(null);
    camera.layers.mask = cameraMask;
    this.tvs.forEach((tv, i) => {
      tv.screen.layers.mask = snapshots[i][0];
      tv.screenMaterial.uniforms.uPower.value = snapshots[i][1];
    });
  }
  draw(layer) {
    if (this.target) this.tvs.forEach((tv, i) => { tv.screen.material = this.surfaces[i]; });
    this.camera.layers.set(layer);
    this.renderer.autoClear = false;
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = true;
    this.camera.layers.set(0);
    if (this.target) this.tvs.forEach(tv => { tv.screen.material = tv.screenMaterial; });
  }
  dispose() {
    this.target?.dispose();
    this.surfaces.forEach(material => material.dispose());
  }
}
