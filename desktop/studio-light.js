import * as THREE from 'three';
import { RectAreaLightUniformsLib } from '../vendor/lights/RectAreaLightUniformsLib.js';

export const STUDIO_ACCENTS = [
  [-.30, 1.60, .095, 0.841, 0xffb85f], [.08, -.70, -.93, 0.322, 0xff9e32],
  [-1.36, -3.74, .73, 0.240, 0xffb85f], [1.82, -3.74, .78, 0.178, 0xffbb64],
  [-3.56, 1.71, .49, 0.059, 0xffb354], [-2.56, -3.55, .18, 0.224, 0xff9437],
  [-1.36, -3.43, -.45, 0.270, 0xffb466], [1.41, -3.39, -.31, 0.232, 0xffc274],
];

// Width and height are world units. RGB color and radiance are kept separate.
export const STUDIO_AREAS = [
  ['Overhead silk', 0xffdcb9, 4.046, 6.0, 2.25, [-1.8, 6.1, 3.4], [0, .4, 0]],
  ['Vertical silver card', 0xf1f1ff, 6.166, 1.15, 4.4, [5.9, 2.0, 4.3], [2.6, .7, 0]],
  ['Left edge strip', 0xffc997, 0.882, .72, 4.7, [-5.9, 1.4, 2.6], [-2.8, .4, 0]],
  ['Tall bounce on the tuner rails', 0xfff0d9, 1.962, .64, 6.5, [5.55, .15, 1.05], [2.8, -.7, 0]],
  ['Polystar front strip', 0xffd7bb, 5.293, .65, 1.30, [.14, 2.67, 1.65], [.02, 2.56, -.18]],
  ['Narrow silk on the rolled Sony bezel', 0xfff8f4, 13.0, .097, 1.83, [-2.30, -1.38, 1.79], [-2.45, -1.55, 1.03]],
  ['Vertical card on lower sets', 0xf3f5ff, 5.7, .24, 1.85, [-3.98, -.15, 2.26], [-2.62, -1.25, .90]],
  ['Amber reflection in the spherical receiver', 0xff9b43, 28.566, .31, .47, [-.36, -1.803, -.231], [-.381, -2.895, .131]],
  ['Rear strip on the Sony silhouette', 0xffc488, 27.0, .039, 3.88, [-5.62, -1.32, -1.25], [-5.20, -1.75, -.64]],
  ['Low amber strip along the Sony chassis', 0xff5000, 29.0, 1.65, .055, [-2.12, -3.44, -.27], [-2.45, -3.00, -.24]],
  ['Strip above the curved receiver crown', 0xffb46b, 2.375, 2.35, .14, [-.48, -.37, -1.52], [-.38, -.98, -.35]],
  ['Right rear strip on the receiver', 0xffd6b4, 3.721, .14, 1.62, [1.97, -2.46, -1.48], [1.47, -2.26, -.30]],
  ['Raking silk over Blaupunkt lid', 0xffbc81, 2.022, 1.76, .36, [3.02, -.90, -1.24], [2.79, -.99, -.006]],
  ['Horizontal silk below the console', 0xffe2c1, 10.423, 1.3, .39, [1.65, -1.77, 2.54], [3.45, -2.88, .06]],
  ['National bezel return', 0xffe2b4, 9.93, 0.12, 1.55, [-3.801, 2.930, 1.399], [-2.168, 2.757, 0.662]],
  ['Polystar brushed top', 0xffcd9e, 2.48, 0.94, 0.36, [0.082, 4.306, 1.204], [-0.019, 3.947, -0.145]],
  ['Goldstar outer casting', 0xffe7c7, 13.26, 0.12, 1.55, [3.395, 3.055, 0.099], [2.125, 2.959, 0.679]],
  ['JVC champagne rim', 0xffdfa4, 8.46, 0.17, 1.35, [2.142, 0.658, 0.617], [0.827, 0.586, 0.434]],
];

export const STUDIO_DIRECTIONS = [
  ['Shadow key', 0xffe7ca, 0.32, [-4.7, 6.3, 6.2], [0, 0, -.5]],
  ['Neutral fill', 0xeaf0fa, 0.12, [6, 2.8, 7], [0, 0, 0]],
  ['Back rim', 0xffb478, 0.34, [-2, 6, -6], [0, 0, 0]],
];

export const STUDIO_REFLECTIONS = [
  ['Warm upper left softbox', 3.1, 6.2, [-5.2, 5.8, 6.4], [8.8, 7.1, 5.0]],
  ['Cooler steel fill from the right', 2.7, 7.9, [7.9, 3.4, 7.4], [2.8, 3.05, 3.6]],
  ['Mirrored warm upper edge', 5.8, .56, [-1.3, 5.5, 6.4], [10.2, 7.2, 5.1]],
  ['Champagne front mids', 3.4, 2.4, [.2, 3.4, 11], [1.4, 1.09, .89]],
  ['Warm curved case reflection left', 2.2, 5.0, [-7.8, .6, 6.5], [4.7, 3.0, 1.66]],
  ['Large dim neutral bounce', 9.8, 7.4, [0, 1.85, 14], [.42, .39, .36]],
  ['Low copper reflection', 7.2, .6, [-.7, -5.6, 4.0], [3.9, 2.4, 1.15]],
  ['Short warm reflection below curved glass', 2.1, .39, [-1.0, -3.9, 4.35], [8.0, 4.5, 1.48]],
  ['Warm back edge strip', 1.1, 6.7, [-3.3, 1, -4.7], [8, 2.7, .62]],
];

export const STUDIO_ENVIRONMENT_INTENSITY = .63;
export const STUDIO_HEMISPHERE = [0xdcd2c0, 0x3b2618, .145];

// The PMREM is captured at the stand's centre. Intersect its reflection ray
// with the finite studio so a softbox travels across a wide panel in close-up.
export function applyStudioReflections(root) {
  const materials = new Set();
  root.traverse(node => {
    if (node.isMesh) for (const m of [].concat(node.material)) {
      if (m.isMeshStandardMaterial) materials.add(m);
    }
  });
  const radiance = THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
    'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );',
    `vec3 surface = cameraPosition - ( vViewPosition * mat3( viewMatrix ) );
     const float studioRadius = 9.0;
     float b = dot( surface, reflectVec );
     float c = dot( surface, surface ) - studioRadius * studioRadius;
     float distanceToWall = -b + sqrt( max( 0.0, b * b - c ) );
     if ( c < 0.0 ) reflectVec = normalize( surface + reflectVec * distanceToWall );
     vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );`,
  );
  const environment = radiance.replaceAll('envMapColor.rgb * envMapIntensity', 'envMapColor.rgb * envMapIntensity * surfaceIBL');
  for (const material of materials) {
    const compile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      // r169 replaces envMapIntensity with scene.environmentIntensity when
      // the material uses the shared environment. Preserve its local response.
      shader.uniforms.surfaceIBL = { get value() { return material.envMap ? 1 : material.envMapIntensity; } };
      shader.fragmentShader = 'uniform float surfaceIBL;\n' + shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>', environment);
    };
    material.customProgramCacheKey = () => previousKey + '/local-studio-v2';
  }
}

// Match the Figma product render: negative fill, narrow warm highlights and
// amber light beneath the bronze decks. PMREM is built once; no HDRI or FX,
// object photograph, emissive cabinet coating or additional shadow pass.
export function addPhysicalStudio(scene, renderer, { floorY = -4.45 } = {}) {
  if (!THREE.UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();
  const studio = new THREE.Scene(); studio.background = new THREE.Color(.006, .0045, .0038);
  const size=64, pixels=new Uint8Array(size*size*4);
  const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const edgeX=Math.abs((x+.5)/size*2-1),edgeY=Math.abs((y+.5)/size*2-1);
    const value=Math.round(255*(1-smooth(.60,1,edgeX))*(1-smooth(.60,1,edgeY))),i=(y*size+x)*4;
    pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;
  }
  const feather=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
  feather.magFilter=THREE.LinearFilter;feather.minFilter=THREE.LinearMipmapLinearFilter;
  feather.generateMipmaps=true;feather.needsUpdate=true;
  const panel = (name, w, h, p, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), map:feather, side: THREE.DoubleSide }));
    m.name = name; m.position.set(...p); m.lookAt(0, 0, 0); studio.add(m);
  };
  for (const source of STUDIO_REFLECTIONS) panel(...source);
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromScene(studio, .012, .1, 100);
  environment.texture.name = 'Figma warm strip-light / negative-fill PMREM';
  scene.environment = environment.texture; scene.environmentIntensity = STUDIO_ENVIRONMENT_INTENSITY;
  studio.traverse(n => { n.geometry?.dispose(); n.material?.dispose(); }); feather.dispose(); pmrem.dispose();
  const lights = new THREE.Group(); lights.name = 'Physical studio lights';
  lights.userData.lookdev = { key: 'warm', fill: 'negative', rim: 'amber underlight', shadowCasters: 1, externalHDRI: false };
  lights.add(new THREE.HemisphereLight(...STUDIO_HEMISPHERE));
  const directions = STUDIO_DIRECTIONS.map(([name, color, intensity, position, aim]) => {
    const light = new THREE.DirectionalLight(color, intensity);
    light.name = name; light.position.set(...position); light.target.position.set(...aim);
    lights.add(light, light.target);
    return light;
  });
  const key = directions[0]; key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -9, right: 9, top: 7, near: .5, far: 40, bottom: -7 });
  key.shadow.bias = -.00006; key.shadow.normalBias = .0025; key.shadow.radius = 2;
  // Finite emitters create different highlights across the width of a fascia.
  // The strips below the sets also reflect off the rolled lip of the CRT.
  const softbox = (name, color, intensity, width, height, position, target) => {
    const light = new THREE.RectAreaLight(color, intensity, width, height);
    light.name = name;
    light.position.set(...position);
    light.lookAt(...target);
    lights.add(light);
  };
  for (const source of STUDIO_AREAS) softbox(...source);
  // Local falloff gives each tier a hot centre and quieter outer supports,
  // rather than painting every underside the same orange with a distant sun.
  // Small sources sit below and in front of the bronze. Their steep falloff
  // picks out collars and footplates while keeping the upright in shadow.
  for (const [i, [x, y, z, power, color]] of STUDIO_ACCENTS.entries()) {
    const under = new THREE.PointLight(color, power, 5.5, 2);
    under.name = `Warm rack accent ${i + 1}`;
    under.position.set(x, y, z);
    lights.add(under);
  }
  scene.add(lights);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ color: 0, opacity: .30, depthWrite: false }));
  floor.name = 'Physical shadow receiver'; floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; floor.receiveShadow = true; scene.add(floor);
  return { environment, lights, key, floor, dispose() { environment.dispose(); floor.geometry.dispose(); floor.material.dispose(); lights.traverse(n => n.shadow?.dispose()); } };
}

// Product-page studio. Distances and panel dimensions are relative to the
// selected cabinet so the small sets keep the same softbox angular size.
export function createProductLights(scene) {
  const rig = new THREE.Group();
  rig.name = 'Single television product lighting';
  const panels = [
    ['Top edge strip', 0xffd5a8, 4.8, 1.12, .095, [-.28, 1.46, .23], [0, .92, -.12]],
    ['Vertical white card', 0xeaf1ff, 2.9, .20, .94, [.96, .65, .68], [.34, .52, 0]],
    ['Lower fascia bounce', 0xffead9, 1.05, .74, .20, [-.22, .13, 1.02], [0, .14, .02]],
  ].map(([name, color, luminance, width, height, position, aim]) => {
    const light = new THREE.RectAreaLight(color, 0, width, height);
    light.name = name; rig.add(light);
    return { light, luminance, width, height, position: new THREE.Vector3(...position), aim: new THREE.Vector3(...aim) };
  });
  scene.add(rig);
  const target = new THREE.Vector3();
  return {
    align(placement) {
      rig.position.copy(placement.position); rig.quaternion.copy(placement.quaternion);
      const { width, height } = placement.dimensions;
      for (const panel of panels) {
        const { light } = panel;
        light.width = panel.width * width; light.height = panel.height * height;
        light.position.copy(panel.position).multiply(new THREE.Vector3(width, height, width));
        target.copy(panel.aim).multiply(new THREE.Vector3(width, height, width));
        // Set orientation in the same local frame before the parent rotation.
        light.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(light.position, target, light.up));
      }
    },
    setIntensity(progress) {
      for (const { light, luminance } of panels) light.intensity = luminance * progress;
    },
  };
}
