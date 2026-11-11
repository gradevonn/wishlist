import * as THREE from 'three';

const DEFAULT_MEDIA_ASPECT = 16 / 9;
const clamp = THREE.MathUtils.clamp;
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * Geometry UV is the entire physical glass: U left→right, V bottom→top.
 * `aspect` is its canonical physical width/height, never a projected XY quad.
 * The returned affine transform maps glass UV to centered source-media UV.
 * Cover crops source pixels; contain preserves the complete source with bars.
 */
export function getScreenFitTransform(aspect, mediaAspect = DEFAULT_MEDIA_ASPECT, fit = 'cover') {
  if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(mediaAspect) || mediaAspect <= 0) {
    throw new RangeError('Screen and media aspect ratios must be finite and positive.');
  }
  if (fit !== 'cover' && fit !== 'contain') throw new RangeError(`Unsupported screen fit: ${fit}`);
  const scale = fit === 'contain'
    ? [Math.max(1, aspect / mediaAspect), Math.max(1, mediaAspect / aspect)]
    : [Math.min(1, aspect / mediaAspect), Math.min(1, mediaAspect / aspect)];
  const content = fit === 'contain'
    ? [(.5 - .5 / scale[0]), (.5 - .5 / scale[1]), (.5 + .5 / scale[0]), (.5 + .5 / scale[1])]
    : [0, 0, 1, 1];
  return { scale, offset: [(1 - scale[0]) / 2, (1 - scale[1]) / 2], content };
}

/** Intrinsic image/video dimensions, independent of its CSS or projected size. */
export function getScreenMediaAspect(map, fallback = DEFAULT_MEDIA_ASPECT) {
  const image = map?.image || map?.source?.data;
  const width = image?.videoWidth || image?.naturalWidth || image?.displayWidth || image?.width;
  const height = image?.videoHeight || image?.naturalHeight || image?.displayHeight || image?.height;
  return positive(width / height, fallback);
}

const vertexShader = /* glsl */`
  attribute vec2 uvReference;
  varying vec2 vUv;
  varying vec2 vReference;
  void main() {
    vUv = uv;
    vReference = uvReference;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D uMap;
  uniform sampler2D uReference;
  uniform vec2 uCrop;
  uniform vec2 uFlip;
  uniform float uFitContain;
  uniform float uDecodeVideo;
  uniform float uPreserveHomeLook;
  uniform float uReferenceMode;
  uniform float uRadius;
  uniform float uBrightness;
  uniform float uPower;
  uniform float uHover;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec2 vReference;

  vec3 decodeSRGBVideo(vec3 value) {
    // Three r169 forces a linear GPU format for VideoTexture. Its built-in
    // map_fragment applies this EOTF; a custom sampler must do the same once.
    return mix(pow(value * 0.9478672986 + vec3(0.0521327014), vec3(2.4)),
      value * 0.0773993808, vec3(lessThanEqual(value, vec3(0.04045))));
  }

  void main() {
    vec3 color;
    if (uReferenceMode > .5) {
      // This UV is authored with the model and survives its canonical reshape.
      // Never derive it again from the focused model's current world position.
      color = texture2D(uReference, vReference).rgb;
    } else {
      vec2 oriented = mix(vUv, 1.0 - vUv, uFlip);
      vec2 mediaUV = (oriented - .5) * uCrop + .5;
      if (uPreserveHomeLook > .5) {
        // Explicit compatibility mode for the previously accepted home view.
        // The focused/project view does not use this legacy optical treatment.
        vec2 p = oriented - .5;
        mediaUV += p * dot(p, p) * .012;
        color = texture2D(uMap, clamp(mediaUV, .001, .999)).rgb;
        float vignette = 1.0 - .30 * pow(length(p * 1.42), 2.0);
        float scan = .985 + .015 * sin(oriented.y * 790.0);
        vec2 corner = abs(p) - vec2(.5 - uRadius);
        float edgeDistance = length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - uRadius;
        float glassEdge = smoothstep(0.0, .012, -edgeDistance);
        color *= vignette * scan * uBrightness * uPower * glassEdge;
        float reflection = pow(max(0.0, 1.0 - length((oriented - vec2(.15, .94)) * vec2(1.25, 2.7))), 7.0);
        color += vec3(.018, .021, .024) * reflection;
        color *= 1.0 + uHover * .065;
      } else {
        color = texture2D(uMap, clamp(mediaUV, 0.0, 1.0)).rgb;
        if (uDecodeVideo > .5) color = decodeSRGBVideo(color);
        if (uFitContain > .5) {
          float inPicture = step(0.0, mediaUV.x) * step(mediaUV.x, 1.0)
            * step(0.0, mediaUV.y) * step(mediaUV.y, 1.0);
          // Bars are part of the same opaque glass surface, not an alpha hole
          // or a second rounded border. Complete source pixels remain visible.
          color *= inPicture;
        }
        color *= uBrightness * uPower * (1.0 + uHover * .025);
        // The curved mesh supplies the CRT shape. No barrel warp, scanlines,
        // vignette, shader inset or rounded mask trims its physical aperture.
      }
    }
    gl_FragColor = vec4(color, uOpacity);
    #include <colorspace_fragment>
  }
`;

/**
 * Drop-in uniforms preserve scene fades and map swaps. The prototype callback
 * also survives ShaderMaterial.clone(), so a later poster→video swap updates
 * color decoding and media dimensions even when the scene sets uMap directly.
 */
class ScreenMaterial extends THREE.ShaderMaterial {
  constructor(options = {}) {
    super({
      vertexShader, fragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: {
        uMap: { value: null }, uReference: { value: null },
        uReferenceMode: { value: 0 }, uRadius: { value: .075 },
        uCrop: { value: new THREE.Vector2(1, 1) }, uFlip: { value: new THREE.Vector2(0, 0) },
        uFitContain: { value: 0 }, uDecodeVideo: { value: 0 }, uPreserveHomeLook: { value: 0 },
        uPower: { value: 1 }, uBrightness: { value: 1 }, uHover: { value: 0 }, uOpacity: { value: 1 },
      },
    });
    this.name = 'Curved CRT media — physical aperture';
    this.userData.screenMaterial = { aspect: 4 / 3, mediaAspect: null, fit: 'cover' };
    updateScreenMaterial(this, options);
  }

  onBeforeRender() {
    updateScreenMaterial(this);
  }
}

/**
 * Focus preview: {aspect: tv.physicalScreenAspect, fit:'cover', brightness:1}.
 * The external film action opens the complete original; contain remains an
 * optional fit for other surfaces, not the focused-preview recommendation.
 * Existing home: {aspect, fit:'cover', preserveHomeLook:true, brightness:.77}.
 * uvReference must already be attached to the glass for referenceMode.
 * Texture ownership, orientation (Texture.flipY) and disposal remain with scene.
 */
export function createScreenMaterial(options = {}) {
  return new ScreenMaterial(options);
}

export function updateScreenMaterial(material, patch = {}) {
  const uniforms = material.uniforms;
  const state = material.userData.screenMaterial ||= { aspect: 4 / 3, mediaAspect: null, fit: 'cover' };
  if (owns(patch, 'map')) uniforms.uMap.value = patch.map;
  if (owns(patch, 'reference')) uniforms.uReference.value = patch.reference;
  if (owns(patch, 'aspect')) state.aspect = positive(patch.aspect, state.aspect);
  if (owns(patch, 'mediaAspect')) state.mediaAspect = positive(patch.mediaAspect, null);
  if (owns(patch, 'fit')) {
    if (patch.fit !== 'cover' && patch.fit !== 'contain') throw new RangeError(`Unsupported screen fit: ${patch.fit}`);
    state.fit = patch.fit;
  }
  const aspect = state.mediaAspect || getScreenMediaAspect(uniforms.uMap.value);
  const transform = getScreenFitTransform(state.aspect, aspect, state.fit);
  uniforms.uCrop.value.set(...transform.scale);
  uniforms.uFitContain.value = state.fit === 'contain' ? 1 : 0;
  const map = uniforms.uMap.value;
  uniforms.uDecodeVideo.value = map?.isVideoTexture && map.colorSpace === THREE.SRGBColorSpace ? 1 : 0;
  for (const [option, uniform] of [['referenceMode', 'uReferenceMode'], ['preserveHomeLook', 'uPreserveHomeLook']]) {
    if (owns(patch, option)) uniforms[uniform].value = patch[option] ? 1 : 0;
  }
  for (const [option, uniform, limit] of [
    ['brightness', 'uBrightness', 4], ['power', 'uPower', 1], ['opacity', 'uOpacity', 1],
    ['hover', 'uHover', 1], ['radius', 'uRadius', .49],
  ]) if (Number.isFinite(patch[option])) uniforms[uniform].value = clamp(patch[option], 0, limit);
  if (owns(patch, 'flipX')) uniforms.uFlip.value.x = patch.flipX ? 1 : 0;
  if (owns(patch, 'flipY')) uniforms.uFlip.value.y = patch.flipY ? 1 : 0;
  state.resolvedMediaAspect = aspect;
  return material;
}
