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

const emission = /* glsl */`
  #ifdef USE_EMISSIVEMAP
    vec3 screenColor = texture2D(uMap, vEmissiveMapUv).rgb;
    if (uVideoSRGB > .5) {
      // r169 uploads video with a linear internal format. Match the built-in
      // map_fragment EOTF once, before Three's normal output color conversion.
      screenColor = mix(pow(screenColor * .9478672986 + vec3(.0521327014), vec3(2.4)),
        screenColor * .0773993808, vec3(lessThanEqual(screenColor, vec3(.04045))));
    }
    totalEmissiveRadiance *= screenColor * uBrightness * uPower;
  #else
    totalEmissiveRadiance = vec3(0.0);
  #endif
`;

class PhysicalScreenMaterial extends THREE.MeshPhysicalMaterial {
  constructor(map = null, aspect = 4 / 3, options = {}) {
    super({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveIntensity: 1,
      emissiveMap: map,
      roughness: .26,
      metalness: 0,
      specularIntensity: .15,
      clearcoat: .03,
      clearcoatRoughness: .25,
      envMapIntensity: .06,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
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
    shader.vertexShader = `uniform vec2 uCrop;\n${shader.vertexShader}`.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_EMISSIVEMAP
        vEmissiveMapUv = (vEmissiveMapUv - .5) * uCrop + .5;
      #endif`,
    );
    shader.fragmentShader = `uniform sampler2D uMap;
      uniform float uPower, uBrightness, uVideoSRGB;\n${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>', emission,
    );
  }

  customProgramCacheKey() {
    return 'rerun-physical-crt-cover-v1';
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
