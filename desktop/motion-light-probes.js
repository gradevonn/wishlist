import * as THREE from 'three';
import { applyStudioReflections } from './studio-light.js?v=20261123-intro-depth-1';
import { phosphorEmission } from './physical-screen.js?v=20261123-intro-depth-1';

const TILE = 64;
const sphere = new THREE.SphereGeometry(1, 40, 24);
const vertex = /* glsl */`
  #include <common>
  varying vec3 vWorldNormal, vWorldView;
  varying vec2 vProbeFraction;
  uniform mat4 probeBounds;
  #ifdef PHOSPHOR
    uniform vec2 uCrop;
    varying vec2 vGlassUv, vEmissiveMapUv;
  #endif
  #ifdef USE_COLOR
    varying vec3 vAlbedo;
  #endif
  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    vec3 transformed = position;
    #include <project_vertex>
    vec4 localPoint = vec4(transformed, 1.);
    #ifdef USE_INSTANCING
      localPoint = instanceMatrix * localPoint;
    #endif
    vProbeFraction = (probeBounds * modelMatrix * localPoint).xy;
    vWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
    vWorldView = inverseTransformDirection(-mvPosition.xyz, viewMatrix);
    #ifdef PHOSPHOR
      vGlassUv = uv;
      vEmissiveMapUv = (uv - .5) * uCrop + .5;
    #endif
    #ifdef USE_COLOR
      vAlbedo = color.rgb;
    #endif
  }`;
const fragment = /* glsl */`
  #include <common>
  varying vec3 vWorldNormal, vWorldView;
  varying vec2 vProbeFraction;
  uniform sampler2D lightField;
  uniform mat3 worldToProbe;
  uniform vec4 grid;
  uniform float gain, opacity;
  #ifdef USE_COLOR
    varying vec3 vAlbedo;
  #endif
  #ifdef PHOSPHOR
    #define USE_EMISSIVEMAP
    uniform sampler2D uMap;
    uniform float uVideoSRGB, uBrightness, uPower;
    varying vec2 vGlassUv, vEmissiveMapUv;
  #endif
  vec3 sampleLight(float slot, vec2 normal) {
    vec2 ij = vec2(mod(slot, grid.w), floor(slot / grid.w));
    vec2 uv = (ij + .5 + normal * .459) / grid.w;
    vec4 light = texture2D(lightField, uv);
    return light.rgb / max(light.a, .001);
  }
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 eye = normalize(vWorldView);
    vec3 ray = reflect(-eye,n);
    vec3 probeNormal = normalize(worldToProbe * ray + vec3(0.,0.,1.));
    vec2 f = clamp(vProbeFraction, 0., 1.);
    vec3 color = sampleLight(grid.x, probeNormal.xy);
    if (grid.y > 1.) color = mix(color, sampleLight(grid.x + 1., probeNormal.xy), f.x);
    if (grid.z > 1.) {
      vec3 upper = sampleLight(grid.x + grid.y, probeNormal.xy);
      if (grid.y > 1.) upper = mix(upper, sampleLight(grid.x + grid.y + 1., probeNormal.xy), f.x);
      color = mix(color, upper, f.y);
    }
    color *= gain;
    #ifdef USE_COLOR
      color *= vAlbedo;
    #endif
    #ifdef PHOSPHOR
      vec3 totalEmissiveRadiance = vec3(.87);
      ${phosphorEmission}
      color += totalEmissiveRadiance * (1. - .048 * F_Schlick(.04, 1., saturate(dot(n,eye))));
    #endif
    gl_FragColor = vec4(color, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function makeProxy(source, texture, grid, orientation, bounds) {
  const glass = source.userData.physicalScreen;
  const material = new THREE.ShaderMaterial({
    name: 'Moving camera • ' + source.name, vertexShader: vertex, fragmentShader: fragment,
    defines: glass ? { PHOSPHOR: 1 } : {}, side: source.side, vertexColors: source.vertexColors,
    transparent: source.transparent, depthTest: source.depthTest, polygonOffset: source.polygonOffset,
    polygonOffsetFactor: source.polygonOffsetFactor, polygonOffsetUnits: source.polygonOffsetUnits,
    uniforms: { ...source.uniforms, lightField: { value: texture }, grid: { value: grid }, probeBounds: { value: bounds },
      worldToProbe: { value: orientation }, gain: { value: 1 }, opacity: { value: 1 } },
  });
  return material;
}

// Integrate the actual BRDF in the installation's light rig for each material
// and cabinet location. The atlas represents radiance by reflection direction.
// During flights the original 3D meshes, scales, depth and media UV stay live.
export class MotionLightProbes {
  constructor(renderer, scene, studio, roots, camera) {
    this.meshes = [];
    this.proxies = new Map();
    const sources = new Map();
    for (const root of roots) {
      root.updateWorldMatrix(true, true);
      const inverse = root.matrixWorld.clone().invert();
      root.traverse(node => {
        if (!node.isMesh) return;
        const originals = [].concat(node.material);
        if (!originals.some(m => m.isMeshStandardMaterial)) return;
        const boundsOwner = node.isInstancedMesh ? node : node.geometry;
        if (!boundsOwner.boundingBox) boundsOwner.computeBoundingBox();
        const box = boundsOwner.boundingBox.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld));
        for (const source of originals) if (source.isMeshStandardMaterial) {
          if (!sources.has(source)) sources.set(source, { root, box: new THREE.Box3(), inverse });
          sources.get(source).box.union(box);
        }
        this.meshes.push({ node, original: node.material });
      });
    }
    let slots = 0;
    for (const entry of sources.values()) {
      entry.span = entry.box.getSize(new THREE.Vector3());
      entry.nx = entry.span.x > .62 ? 2 : 1;
      entry.ny = entry.span.y > .62 ? 2 : 1;
      entry.slot = slots;
      slots += entry.nx * entry.ny;
    }
    const columns = Math.ceil(Math.sqrt(slots)), size = columns * TILE;
    this.target = new THREE.WebGLRenderTarget(size, size, {
      type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
    });
    const probeScene = new THREE.Scene();
    probeScene.environment = studio.environment.texture;
    probeScene.environmentIntensity = scene.environmentIntensity;
    const lights = studio.lights.clone();
    lights.traverse(l => { l.castShadow = false; });
    probeScene.add(lights);
    const captures = [];
    const averages = new Map();
    const meanChannel = (texture, channel) => {
      let channels = averages.get(texture);
      if (!channels) { channels = []; averages.set(texture, channels); }
      if (channels[channel] !== undefined) return channels[channel];
      const data = texture.image?.data;
      if (!(data instanceof Uint8Array)) return 1;
      let sum = 0, count = 0;
      for (let i = channel; i < data.length; i += 4 * 37) {
        const v = data[i] / 255;
        const srgb = texture.colorSpace === THREE.SRGBColorSpace;
        sum += srgb && v > .04045 ? ((v + .055) / 1.055) ** 2.4 : srgb ? v / 12.92 : v;
        count++;
      }
      const value = sum / count;
      channels[channel] = value;
      return value;
    };
    for (const [source, { root, box, span, nx, ny, slot, inverse }] of sources) {
      const localCenter = box.getCenter(new THREE.Vector3());
      localCenter.z += .29 * span.z;
      const center = localCenter.clone().applyMatrix4(root.matrixWorld);
      const basis = new THREE.Matrix4().lookAt(camera.position, center, camera.up);
      const orientation = new THREE.Matrix3().setFromMatrix4(basis).transpose();
      const lower = box.min.clone().addScaledVector(span, .16);
      const bounds = new THREE.Matrix4().makeScale(1 / Math.max(.001, .68 * span.x), 1 / Math.max(.001, .68 * span.y), 1)
        .multiply(new THREE.Matrix4().makeTranslation(-lower.x, -lower.y, 0)).multiply(inverse);
      for (let i = 0; i < nx * ny; i++) {
        const point = localCenter.clone();
        if (nx > 1) point.x = lower.x + .68 * span.x * (i % nx);
        if (ny > 1) point.y = lower.y + .68 * span.y * Math.floor(i / nx);
        point.applyMatrix4(root.matrixWorld);
        const j = slot + i;
        const tile = new THREE.Vector3((j % columns + .5) / columns, (Math.floor(j / columns) + .5) / columns, .47 / columns);
        const probe = source.clone();
        // Integrate the mean finish here. Cast letters, perforations and
        // vertex contact shading remain on the original meshes during flight.
        if (source.map) probe.color.multiply(new THREE.Color(
          meanChannel(source.map, 0), meanChannel(source.map, 1), meanChannel(source.map, 2)));
        if (source.roughnessMap) probe.roughness *= meanChannel(source.roughnessMap, 1);
        if (source.metalnessMap) probe.metalness *= meanChannel(source.metalnessMap, 2);
        probe.map = probe.normalMap = probe.bumpMap = probe.roughnessMap = probe.metalnessMap = probe.alphaMap = null;
        probe.envMap = studio.environment.texture;
        probe.envMapIntensity = source.envMapIntensity * scene.environmentIntensity;
        probe.emissiveMap = null; probe.emissive.set(0); probe.vertexColors = false;
        probe.transparent = false; probe.opacity = 1; probe.side = THREE.FrontSide;
        probe.onBeforeCompile = shader => {
          shader.uniforms.probeTile = { value: tile };
          shader.vertexShader = 'uniform vec3 probeTile;\n' + shader.vertexShader.replace('#include <project_vertex>',
          `#include <project_vertex>
           gl_Position = vec4((probeTile.xy + position.xy * probeTile.z) * 2. - 1., -position.z * .5, 1.);`);
        };
        probe.customProgramCacheKey = () => 'rerun-motion-probe-v1';
        const ball = new THREE.Mesh(sphere, probe);
        ball.position.copy(point); ball.quaternion.setFromRotationMatrix(basis); ball.scale.setScalar(.02); ball.frustumCulled = false;
        probeScene.add(ball); captures.push(probe);
      }
      const grid = new THREE.Vector4(slot, nx, ny, columns);
      this.proxies.set(source, makeProxy(source, this.target.texture, grid, orientation, bounds));
    }
    applyStudioReflections(probeScene);
    for (const item of this.meshes) {
      item.moving = Array.isArray(item.original) ? item.original.map(m => this.proxies.get(m) || m) : this.proxies.get(item.original);
    }
    this.capture = async () => {
      const previous = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(this.target);
        if (renderer.compileAsync) await renderer.compileAsync(probeScene, camera);
        if (!this.disposed) renderer.render(probeScene, camera);
      } finally {
        renderer.setRenderTarget(previous);
        captures.forEach(material => material.dispose());
      }
    };
  }
  setFade(material, gain, opacity) {
    const proxy = this.proxies.get(material);
    if (!proxy) return;
    proxy.uniforms.gain.value = gain;
    proxy.uniforms.opacity.value = opacity;
    proxy.transparent = material.transparent;
    proxy.depthWrite = material.depthWrite;
  }
  moving(enabled) {
    if (this.active === enabled) return;
    this.active = enabled;
    for (const { node, original, moving } of this.meshes) node.material = enabled ? moving : original;
  }
  dispose() {
    this.disposed = true;
    this.moving(false);
    this.target.dispose();
    for (const proxy of this.proxies.values()) proxy.dispose();
  }
}

// Keep the DOM canvas and its retained full-resolution depth buffer at a
// constant size. A reusable linear target handles subsecond camera movement.
export class FlightBuffer {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = renderer.extensions.has('EXT_color_buffer_float') ? new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      samples: 2, resolveDepthBuffer: false,
    }) : null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0], 3));
    this.blit = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: { frame: { value: this.target?.texture } },
      vertexShader: 'varying vec2 frameUV; void main(){ frameUV = position.xy * .5 + .5; gl_Position=vec4(position,1.); }',
      fragmentShader: `
        varying vec2 frameUV;
        uniform sampler2D frame;
        void main(){
          vec4 color = texture2D(frame, frameUV);
          gl_FragColor = vec4(color.rgb / max(color.a, .00001), color.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb *= color.a;
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.blit.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.blit);
    this.camera = new THREE.Camera();
    this.resize();
  }
  resize() {
    if (!this.target) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    // Bound fragment work during camera motion; geometry, PBR and lighting are
    // identical. The settled frame returns to the full-resolution framebuffer.
    const scale = Math.min(1, Math.sqrt(600000 / (size.x * size.y)));
    this.enabled = scale < .93;
    if (!this.enabled) return;
    this.target.setSize(Math.round(size.x * scale), Math.round(size.y * scale));
    this.renderer.initRenderTarget(this.target);
  }
  async prewarm(scene, camera) {
    if (!this.enabled || !this.renderer.compileAsync) return;
    this.renderer.setRenderTarget(this.target);
    const shaded = this.renderer.compileAsync(scene, camera);
    this.renderer.setRenderTarget(null);
    await Promise.all([shaded, this.renderer.compileAsync(this.scene, this.camera)]);
    if (this.disposed) return;
    // First use also uploads the real mesh buffers and creates the multisample
    // resolve pipeline. Pay this once while the portfolio is still loading.
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
  }
  render(scene, camera) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() { this.disposed = true; this.target?.dispose(); this.blit.geometry.dispose(); this.blit.material.dispose(); }
}
