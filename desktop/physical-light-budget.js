import * as THREE from 'three';
import { STUDIO_AREAS, STUDIO_ACCENTS } from './studio-light.js?v=20261123-intro-depth-1';

// A fixed light list for each physical object, not a camera-dependent shading
// proxy. Kept lights still run Three's actual PBR/LTC calculation every frame.
// The large environment, hemisphere and all directional/shadow lights remain
// unchanged. The final three area lights belong to the movable product rig.
const PRODUCT_AREAS = [0, 1, 2].map(i => STUDIO_AREAS.length + i);
const LOCAL_AREAS = [[14], [4, 15], [16], [2], [], [17], [1, 3], [5, 8, 9], [7, 10, 11], [12, 13]];
const installed = new WeakMap();
const luminance = hex => {
  const color = new THREE.Color(hex);
  return .2126 * color.r + .7152 * color.g + .0722 * color.b;
};
const areaSources = STUDIO_AREAS.map(([name, color, intensity, width, height, position, aim], index) => {
  const center = new THREE.Vector3(...position);
  return { index, name, center, normal: new THREE.Vector3(...aim).sub(center).normalize(),
    area: width * height, radiance: intensity * luminance(color) };
});
const pointSources = STUDIO_ACCENTS.map(([x, y, z, intensity, color], index) => ({
  index, name: `Warm rack accent ${index + 1}`, center: new THREE.Vector3(x, y, z), power: intensity * luminance(color),
}));

function sampleBounds(root) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error('A physical light budget needs non-empty world bounds.');
  const points = [bounds.getCenter(new THREE.Vector3())];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
    for (const z of [bounds.min.z, bounds.max.z]) points.push(new THREE.Vector3(x, y, z));
  }
  return { bounds, points };
}

function rankAreas(points) {
  return areaSources.map(source => {
    let sum = 0, peak = 0;
    for (const point of points) {
      const offset = point.clone().sub(source.center), distance2 = offset.lengthSq();
      const facing = Math.max(0, offset.normalize().dot(source.normal));
      // Projected emitter area over distance squared is only a conservative
      // ranking heuristic. The report does not claim a measured pixel error.
      const contribution = source.radiance * source.area * facing / (distance2 + .25 * source.area);
      sum += contribution; peak = Math.max(peak, contribution);
    }
    return { index: source.index, name: source.name, score: .5 * (sum / points.length + peak) };
  }).sort((a, b) => b.score - a.score);
}

function rankPoints(points) {
  return pointSources.map(source => {
    let sum = 0, peak = 0;
    for (const point of points) {
      const distance2 = point.distanceToSquared(source.center);
      const cutoff = Math.max(0, 1 - (distance2 / (5.5 * 5.5)) ** 2) ** 2;
      const contribution = source.power * cutoff / Math.max(.01, distance2);
      sum += contribution; peak = Math.max(peak, contribution);
    }
    return { index: source.index, name: source.name, score: .5 * (sum / points.length + peak) };
  }).sort((a, b) => b.score - a.score);
}

function choose(ranked, count, required = []) {
  const keep = new Set(required.filter(index => ranked.some(row => row.index === index && row.score > 0)));
  for (const row of ranked) {
    if (keep.size >= count) break;
    if (row.score > 0) keep.add(row.index);
  }
  const total = ranked.reduce((sum, row) => sum + row.score, 0);
  const kept = ranked.reduce((sum, row) => sum + (keep.has(row.index) ? row.score : 0), 0);
  return { indices: [...keep].sort((a, b) => a - b), estimatedCoverage: total > 0 ? kept / total : 1,
    omitted: ranked.filter(row => !keep.has(row.index)).map(row => ({ ...row })) };
}

export function planPhysicalLightBudget(root, { kind = 'television', index = -1,
  areaLimit = kind === 'rack' ? 10 : 8, pointLimit = kind === 'rack' ? 8 : 3,
  requiredAreas = [], includeProduct = true } = {}) {
  const { bounds, points } = sampleBounds(root);
  const protectedAreas = [...(LOCAL_AREAS[index] || []), ...requiredAreas];
  const areas = choose(rankAreas(points), Math.max(1, Math.floor(areaLimit)), protectedAreas);
  const pointLights = choose(rankPoints(points), Math.max(0, Math.floor(pointLimit)));
  const areaIndices = [...areas.indices, ...(includeProduct ? PRODUCT_AREAS : [])];
  return { kind, index, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    areaIndices, pointIndices: pointLights.indices,
    areaCapacity: Math.max(areas.indices.length, Math.max(1, Math.floor(areaLimit))) + (includeProduct ? 3 : 0),
    pointCapacity: Math.max(pointLights.indices.length, Math.max(0, Math.floor(pointLimit))),
    studioAreaCount: areas.indices.length, productAreaCount: includeProduct ? 3 : 0,
    estimatedAreaCoverage: areas.estimatedCoverage, estimatedPointCoverage: pointLights.estimatedCoverage,
    omittedAreas: areas.omitted, omittedPoints: pointLights.omitted,
    estimateOnly: 'Coverage is a world-space emitter ranking estimate; verify appearance against the full rig.' };
}

const pointStart = '#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )';
const spotStart = '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )';
const areaStart = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
const indirectStart = '#if defined( RE_IndirectDiffuse )';
const original = THREE.ShaderChunk.lights_fragment_begin;
const originalPoint = original.slice(original.indexOf(pointStart), original.indexOf(spotStart));
const originalArea = original.slice(original.indexOf(areaStart), original.indexOf(indirectStart));
if (!originalPoint.includes('pointLights[ i ]') || !originalArea.includes('rectAreaLights[ i ]')) {
  throw new Error('Three light chunk changed; update the fixed physical light budget before using it.');
}

// Packed structs retain a short, fully unrolled PBR loop while sharing one
// program among all objects with the same budget. Unlike a 21-source mask loop,
// omitted sources never enter the generated fragment program.
const sceneBudgets = new WeakMap();
const productNames = ['Top edge strip', 'Vertical white card', 'Lower fascia bounce'];
const makeArea = () => ({ color: new THREE.Color(0), position: new THREE.Vector3(),
  halfWidth: new THREE.Vector3(), halfHeight: new THREE.Vector3() });
const makePoint = () => ({ color: new THREE.Color(0), position: new THREE.Vector3(), distance: 0, decay: 2 });
const zeroArea = makeArea(), zeroPoint = makePoint();

function owningScene(root, explicit) {
  if (explicit?.isScene) return explicit;
  let node = root;
  while (node && !node.isScene) node = node.parent;
  if (!node) throw new Error('Attach a light-budget root to its scene first, or pass options.scene.');
  return node;
}

function runtimeFor(scene) {
  let runtime = sceneBudgets.get(scene);
  if (!runtime) {
    const lightsByName = new Map();
    scene.traverse(node => { if (node.isLight) lightsByName.set(node.name, node); });
    runtime = {
      areaLights: [...STUDIO_AREAS.map(source => source[0]), ...productNames].map(name => lightsByName.get(name)),
      pointLights: STUDIO_ACCENTS.map((_, i) => lightsByName.get(`Warm rack accent ${i + 1}`)),
      areas: Array.from({ length: STUDIO_AREAS.length + 3 }, makeArea),
      points: Array.from({ length: STUDIO_ACCENTS.length }, makePoint),
      viewLight: new THREE.Matrix4(), rotation: new THREE.Matrix4(), updates: 0,
    };
    sceneBudgets.set(scene, runtime);
  }
  return runtime;
}

/** Run after camera/light transforms change, before renderer.render/capture. */
export function updatePhysicalLightBudget(scene, camera) {
  const runtime = sceneBudgets.get(scene);
  if (!runtime) return;
  camera.updateWorldMatrix(true, false);
  const view = camera.matrixWorldInverse;
  const visible = light => {
    for (let node = light; node; node = node.parent) if (!node.visible) return false;
    return light.layers.test(camera.layers);
  };
  runtime.areaLights.forEach((light, i) => {
    const target = runtime.areas[i];
    if (!light || !visible(light)) { target.color.setRGB(0, 0, 0); return; }
    light.updateWorldMatrix(true, false);
    target.color.copy(light.color).multiplyScalar(light.intensity);
    target.position.setFromMatrixPosition(light.matrixWorld).applyMatrix4(view);
    // Exact pinned Three r169 WebGLLights.setupView procedure: normalize the
    // view-space rotation columns, then rotate the physical half-size vectors.
    runtime.viewLight.copy(light.matrixWorld).premultiply(view);
    runtime.rotation.identity().extractRotation(runtime.viewLight);
    target.halfWidth.set(light.width * .5, 0, 0).applyMatrix4(runtime.rotation);
    target.halfHeight.set(0, light.height * .5, 0).applyMatrix4(runtime.rotation);
  });
  runtime.pointLights.forEach((light, i) => {
    const target = runtime.points[i];
    if (!light || !visible(light)) { target.color.setRGB(0, 0, 0); return; }
    light.updateWorldMatrix(true, false);
    target.color.copy(light.color).multiplyScalar(light.intensity);
    target.position.setFromMatrixPosition(light.matrixWorld).applyMatrix4(view);
    target.distance = light.distance; target.decay = light.decay;
  });
  runtime.updates++;
  return { updates: runtime.updates, areas: runtime.areaLights.length, points: runtime.pointLights.length };
}

export function physicalLightBudgetChunk({ areaCapacity, pointCapacity }) {
  const area = `${areaStart}
  RectAreaLight rectAreaLight;
  #pragma unroll_loop_start
  for (int i = 0; i < ${areaCapacity}; i ++) {
    rectAreaLight = physicalAreaLights[ i ];
    if (any(greaterThan(rectAreaLight.color, vec3(0.0)))) {
      RE_Direct_RectArea(rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
  }
  #pragma unroll_loop_end
#endif
`;
  const point = `#if NUM_POINT_LIGHT_SHADOWS > 0
${originalPoint}#else
${pointStart}
  PointLight pointLight;
${pointCapacity ? `  #pragma unroll_loop_start
  for (int i = 0; i < ${pointCapacity}; i ++) {
    pointLight = physicalPointLights[ i ];
    getPointLightInfo(pointLight, geometryPosition, directLight);
    if (directLight.visible) {
      RE_Direct(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
  }
  #pragma unroll_loop_end` : ''}
#endif
#endif
`;
  return original.replace(originalPoint, point).replace(originalArea, area);
}

function packRecords(target, indices, records, zero, capacity) {
  target.length = capacity;
  for (let i = 0; i < capacity; i++) target[i] = records[indices[i]] || zero;
}

/** Apply after material cloning/studio hooks, before prewarm. Root must be attached. */
export function applyPhysicalLightBudget(root, options = {}) {
  const report = planPhysicalLightBudget(root, options), scene = owningScene(root, options.scene);
  const runtime = runtimeFor(scene);
  const key = `packed-physical-lights-v3:a${report.areaCapacity}:p${report.pointCapacity}`;
  const chunk = physicalLightBudgetChunk(report), materials = new Set();
  root.traverse(node => {
    if (node.isMesh) for (const material of [].concat(node.material)) {
      if (material?.isMeshStandardMaterial) materials.add(material);
    }
  });
  for (const material of materials) {
    let record = installed.get(material);
    if (!record) {
      const compile = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
      record = { areas: [], points: [], key, chunk, areaCapacity: report.areaCapacity, pointCapacity: report.pointCapacity };
      const bound = record;
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        if (!shader.fragmentShader.includes('#include <lights_fragment_begin>')
          || !shader.fragmentShader.includes('#include <lights_pars_begin>')) {
          throw new Error(`Physical light budget cannot find the PBR light chunks in ${material.name}.`);
        }
        shader.uniforms.physicalAreaLights = { value: bound.areas };
        shader.uniforms.physicalPointLights = { value: bound.points };
        const declarations = `#include <lights_pars_begin>
#if NUM_RECT_AREA_LIGHTS > 0
uniform RectAreaLight physicalAreaLights[${bound.areaCapacity}];
#endif
${bound.pointCapacity ? `#if NUM_POINT_LIGHTS > 0
uniform PointLight physicalPointLights[${bound.pointCapacity}];
#endif` : ''}`;
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_pars_begin>', declarations)
          .replace('#include <lights_fragment_begin>', bound.chunk);
      };
      material.customProgramCacheKey = () => `${previousKey}/${bound.key}`;
      installed.set(material, record);
    }
    record.key = key; record.chunk = chunk;
    record.areaCapacity = report.areaCapacity; record.pointCapacity = report.pointCapacity;
    packRecords(record.areas, report.areaIndices, runtime.areas, zeroArea, report.areaCapacity);
    packRecords(record.points, report.pointIndices, runtime.points, zeroPoint, report.pointCapacity);
    material.userData.physicalLightBudget = { areaIndices: report.areaIndices, pointIndices: report.pointIndices };
    material.needsUpdate = true;
  }
  report.materialCount = materials.size;
  report.sharedShaderKey = key;
  root.userData.physicalLightBudget = report;
  return report;
}
