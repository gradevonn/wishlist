import * as THREE from 'three';
import { applyPhysicalAO } from './physical-ao.js';
import { PHYSICAL_AO_DATA } from './physical-ao-data.js?v=20261123-intro-depth-1';

/* TV placements already contain the installed world scale in dimensions. */

const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_COLUMN = { x: -.02, z: -1.05, bottomY: -4.27, topY: 1.92, radius: .162 };

function vector(value, fallback = [0, 0, 0]) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(...value);
  if (value && typeof value === 'object') return new THREE.Vector3(value.x || 0, value.y || 0, value.z || 0);
  return new THREE.Vector3(...fallback);
}

function placementQuaternion(placement) {
  if (placement.quaternion?.isQuaternion) return placement.quaternion.clone().normalize();
  if (Array.isArray(placement.quaternion)) return new THREE.Quaternion(...placement.quaternion).normalize();
  if (placement.rotation?.isEuler) return new THREE.Quaternion().setFromEuler(placement.rotation);
  const yaw = placement.yawDegrees !== undefined ? THREE.MathUtils.degToRad(placement.yawDegrees)
    : placement.yawDeg !== undefined ? THREE.MathUtils.degToRad(placement.yawDeg) : (placement.yaw || 0);
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw);
}

function dimensionsOf(value = {}) {
  const width = value.width ?? value.x ?? value[0];
  const height = value.height ?? value.y ?? value[1];
  const depth = value.depth ?? value.z ?? value[2];
  if (![width, height, depth].every(v => Number.isFinite(v) && v > 0)) throw new TypeError('Physical rack placement needs positive width, height and depth');
  return { width, height, depth };
}

// The top decks have an oxidised, dark sealing coat. The lip and shafts expose
// brushed metal; their warmer highlights come from the lights under the trays.
const BRONZE_FINISHES = {
  // colour, roughness, metalness, anisotropy, environment strength, relief
  top:       [0x191510, .69, .87, .16, .24, .00031],
  edge:      [0x463b33, .44, .94, .39, .78, .00022],
  polished:  [0xa18c76, .235, .96, .29, .86, .00008],
  structure: [0x5a4b3d, .345, .95, .44, .87, .00022],
  shaft:     [0x493b31, .28, .94, .53, .80, .00022],
  inset:     [0x2c221b, .62, .81, .12, .38, .00031],
};

let bronzeGrain;

function brushedBronzeGrain() {
  if (bronzeGrain) return bronzeGrain;
  const width = 256, height = 128, tau = 2 * Math.PI;
  const roughness = new Uint8Array(width * height * 4), relief = new Uint8Array(roughness.length);
  let seed = 7193;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296 - .5;
  };
  for (let y = 0; y < height; y++) {
    const v = y / height, cut = noise();
    for (let x = 0; x < width; x++) {
      const u = x / width;
      // Fine lathe cuts run parallel to the lip. Slower periodic variations
      // interrupt a few cuts across the band without placing painted highlights.
      const longCut = Math.sin(tau * (34 * v + .036 * Math.sin(tau * u)));
      const patch = .6 * Math.sin(tau * (2 * u + v)) + .4 * Math.cos(tau * (u - 3 * v));
      const at = (y * width + x) * 4;
      const r = Math.round(221 + 14 * patch + 15 * cut + 4 * longCut + 4 * noise());
      const h = Math.round(126 + 26 * cut + 10 * longCut + 3 * patch + 4 * noise());
      for (let channel = 0; channel < 3; channel++) {
        roughness[at + channel] = r; relief[at + channel] = h;
      }
      roughness[at + 3] = relief[at + 3] = 255;
    }
  }
  const make = (pixels, role) => {
    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
    texture.name = 'Directional brushed bronze — ' + role;
    texture.userData.role = role;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, .85);
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
    return texture;
  };
  bronzeGrain = { roughness: make(roughness, 'procedural-roughness'), relief: make(relief, 'procedural-height') };
  return bronzeGrain;
}

function bronzeMaterials(overrides = {}) {
  const grain = brushedBronzeGrain(), result = {};
  for (const [name, [color, roughness, metalness, anisotropy, envMapIntensity, bumpScale]] of Object.entries(BRONZE_FINISHES)) {
    const material = overrides[name]?.isMaterial ? overrides[name].clone()
      : new THREE.MeshPhysicalMaterial({ color, roughness, metalness, anisotropy, envMapIntensity,
        roughnessMap: grain.roughness, bumpMap: grain.relief, bumpScale,
        clearcoat: name === 'top' ? .012 : .035, clearcoatRoughness: .39 });
    material.name = 'bronze-' + name;
    result[name] = material;
  }
  return result;
}

// Individual bronzework follows the footprint of each set. The lower Sony and
// Blaupunkt stand on trays with bowed fronts; the round receiver has a smaller
// tray that nests inside the common curved plinth.
const TRAY_FOOTPRINTS = [
  // width / cabinet width, depth / cabinet depth, centre x, centre z / depth, front bow
  [.97, .98, -.05, -.47, .018], [1.005, 1.02, 0, -.48, .020], [.91, .98, .05, -.46, .022],
  [.98, .93, -.02, -.46, .030], [.95, .91, -.09, -.46, .018], [.99, .91, .05, -.45, .026],
  [.95, .95, .03, -.45, .058], [1.01, .91, -.08, -.43, .105], [.90, .88, -.04, -.46, .034],
  [1.055, 1.08, .02, -.50, .108],
];

// Small asymmetric offsets (in world units) at the actual outside edges of
// the cast decks. Each row follows the front left, front right, back right
// and back left corners, then the centre of the bowed front fascia.
const DECK_OFFSETS = [
  [[-.01,.02],[-.05,.01],[-.06,-.05],[.07,-.02],[0,0]],
  [[-.02,-.047],[.02,-.034],[.02,-.043],[-.02,-.045],[0,-.014]],
  [[.04,.035],[.085,.041],[.06,.05],[.14,-.066],[0,0]],
  [[0,-.06],[.02,-.034],[-.03,-.03],[.01,-.035],[0,-.005]],
  [[-.045,-.052],[.075,-.093],[-.02,-.064],[-.045,-.065],[0,-.005]],
  [[.05,-.035],[-.01,-.014],[.01,.065],[.075,.080],[0,-.005]],
  [[-.04,.014],[-.012,.074],[-.005,.04],[.085,.035],[0,-.01]],
  [[0,.105],[-.285,-.04],[-.10,.115],[-.03,.105],[0,-.047]],
  [[.005,.068],[.045,.047],[.01,.015],[0,.015],[0,-.024]],
  [[.105,-.016],[.105,.04],[.015,.082],[.105,.11],[0,-.025]],
];

// Three-dimensional centre lines of the forged arms. The middle arms form
// two distinct levels and curl upwards into their seats. Recessing the lower
// diagonal stays behind the round receiver keeps its front annulus exposed.
const ARM_PATHS = [
  [[-.020,1.572,-1.05],[-.920,1.603,-1.13],[-1.943,1.652,-1],[-2.775,1.692,-.90],[-2.884,1.701,-.88],[-2.900,1.741,-.85],[-2.899,1.862,-.85]],
  null,
  [[-.020,1.572,-1.05],[.909,1.603,-1.10],[1.927,1.633,-1.05],[2.839,1.683,-1],[2.910,1.703,-1],[2.940,1.785,-1],[2.939,1.866,-1]],
  [[-.021,-.606,-1.05],[-1.096,-.706,-1.25],[-2.626,-.754,-1.45],[-4.007,-.735,-1.36],[-4.953,-.696,-1.27],[-5.050,-.690,-1.19],[-5.080,-.648,-1.19],[-5.079,-.493,-1.19]],
  [[-.021,-.606,-1.05],[-.637,-.671,-.72],[-1.232,-.752,-.50],[-1.665,-.802,-.38],[-1.774,-.802,-.38],[-1.824,-.782,-.38],[-1.823,-.562,-.38]],
  [[-.021,-.596,-1.05],[.446,-.644,-.76],[1.133,-.725,-.53],[1.725,-.783,-.39],[1.835,-.793,-.39],[1.875,-.773,-.39],[1.884,-.563,-.39]],
  [[-.021,-.565,-1.05],[1.092,-.668,-1.17],[2.655,-.741,-1.42],[4.104,-.748,-1.37],[4.928,-.736,-1.23],[5.000,-.721,-1.18],[5.020,-.680,-1.18],[5.029,-.556,-1.18]],
  [[-.021,-3.671,-1.05],[-.829,-3.296,-2.12],[-1.356,-3.335,-1.70],[-2.073,-3.394,-.92],[-2.846,-3.434,-.11],[-3.643,-3.590,0],[-3.692,-3.570,0],[-3.691,-3.460,0]],
  null,
  [[-.021,-3.671,-1.05],[.807,-3.293,-2.10],[1.369,-3.324,-1.75],[2.234,-3.379,-.89],[2.881,-3.427,-.07],[3.682,-3.561,.01],[3.741,-3.541,.01],[3.740,-3.441,.01]],
];

function deckOffset(index, u, v, inverseRotation) {
  const [fl, fr, br, bl, bow] = DECK_OFFSETS[index];
  const coordinates = [0, 1].map(k => THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(bl[k], br[k], u),
    THREE.MathUtils.lerp(fl[k], fr[k], u) + 4 * u * (1-u) * bow[k], v));
  return new THREE.Vector3(...coordinates, 0).applyQuaternion(inverseRotation);
}

function fitCastDeck(geometry, index, width, depth, quaternion) {
  const p = geometry.attributes.position, inverse = quaternion.clone().invert();
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const u = THREE.MathUtils.clamp(v.x / width + .5, 0, 1);
    const t = THREE.MathUtils.clamp(v.z / depth + .5, 0, 1);
    v.add(deckOffset(index, u, t, inverse));
    // Only the exposed rolled perimeter follows the asymmetric silhouette.
    // The hidden bearing land remains flush with the four actual rubber feet.
    if (i >= geometry.userData.bearingStart) v.y = 0;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function deckPerimeter(width, depth, radius, bow) {
  const outline = roundedProfile(width, depth, radius, 8), result = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const steps = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / (width / 16)));
    for (let step = 0; step < steps; step++) {
      const x = THREE.MathUtils.lerp(a[0], b[0], step / steps);
      const z = THREE.MathUtils.lerp(a[1], b[1], step / steps);
      const lift = bow * (1 - (2 * x / width) ** 2) * Math.max(0, 2 * z / depth);
      result.push([x, z + lift]);
    }
  }
  return result;
}

function platformGeometry(width, depth, thickness, bow) {
  // A dark horizontal deck, narrow brushed fascia and two machined chamfers.
  // The top stays exactly y=0; metal is entirely below the television bottom.
  const bevel = Math.min(.012, thickness * .12), radius = Math.min(.22, depth * .15);
  const rings = [[-thickness, bevel], [-thickness + bevel, 0], [-bevel, 0], [0, bevel]];
  const positions = [], uv = [], indices = [], ring = deckPerimeter(width, depth, radius, bow).length;
  for (const [y, inset] of rings) {
    let k = 0;
    for (const [x, z] of deckPerimeter(width, depth, radius, bow)) {
      positions.push(x * (1 - 2 * inset / width), y, z * (1 - 2 * inset / depth)); uv.push(k++ / ring, (y + thickness) / thickness);
    }
  }
  const geometry = new THREE.BufferGeometry();
  const group = (material, add) => { const start = indices.length; add(); geometry.addGroup(start, indices.length - start, material); };
  for (let j = 0; j < 3; j++) group(j === 1 ? 1 : 2, () => {
    for (let k = 0; k < ring; k++) {
      const a = j * ring + k, b = j * ring + (k + 1) % ring, c = a + ring, d = b + ring;
      indices.push(a, c, b, b, c, d);
    }
  });
  for (const [j, material] of [[0, 3], [3, 0]]) group(material, () => {
    const start = positions.length / 3;
    for (let k = 0; k < ring; k++) {
      const p = (j * ring + k) * 3;
      positions.push(...positions.slice(p, p + 3));
      uv.push(positions[p] / width + .5, positions[p + 2] / depth + .5);
    }
    let inner = start;
    if (j === 3) {
      inner = positions.length / 3;
      geometry.userData.bearingStart = inner;
      for (let k = 0; k < ring; k++) {
        const p = (start + k) * 3;
        const x = positions[p] * .92, z = positions[p + 2] * .94;
        positions.push(x, 0, z); uv.push(x / width + .5, z / depth + .5);
        const next = (k + 1) % ring;
        indices.push(start + k, inner + k, start + next, start + next, inner + k, inner + next);
      }
    }
    const centre = positions.length / 3;
    positions.push(0, rings[j][0], 0); uv.push(.5, .5);
    for (let k = 0; k < ring; k++) {
      const a = inner + k, b = inner + (k + 1) % ring;
      if (j === 3) indices.push(centre, b, a); else indices.push(centre, a, b);
    }
  });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function turnedGeometry(radius, height, segments = 48) {
  const b = Math.min(.022, height * .16);
  const profile = [[radius * .9, -height / 2], [radius, -height / 2 + b], [radius, height / 2 - b], [radius * .9, height / 2]];
  const positions = [], uv = [], indices = [];
  for (const [r, y] of profile) for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2; positions.push(Math.sin(a) * r, y, Math.cos(a) * r); uv.push(i / segments, y / height + .5);
  }
  for (let j = 0; j < profile.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * segments + i, b = j * segments + (i + 1) % segments, c = a + segments, d = b + segments;
    indices.push(a, b, c, b, d, c);
  }
  for (const j of [0, 3]) {
    const start = positions.length / 3;
    for (let i = 0; i < segments; i++) {
      const p = (j * segments + i) * 3; positions.push(...positions.slice(p, p + 3));
      uv.push(positions[p] / (2 * radius) + .5, positions[p + 2] / (2 * radius) + .5);
    }
    const centre = positions.length / 3; positions.push(0, profile[j][1], 0); uv.push(.5, .5);
    for (let i = 0; i < segments; i++) {
      const a = start + i, b = start + (i + 1) % segments;
      if (j === 0) indices.push(centre, b, a); else indices.push(centre, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function socketGeometry(radius, height) {
  // Recessed screw socket, including its real cavity floor and back cap.
  const segments = 36, bevel = height * .16;
  const profile = [[radius * .86, -height / 2], [radius, -height / 2 + bevel],
    [radius, height / 2 - bevel], [radius * .9, height / 2],
    [radius * .39, height / 2], [radius * .39, -height * .04]];
  const positions = [], uv = [], indices = [];
  for (const [j, [r, y]] of profile.entries()) for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2; positions.push(Math.sin(a) * r, y, Math.cos(a) * r); uv.push(i / segments, j / (profile.length - 1));
  }
  for (let j = 0; j < profile.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * segments + i, b = j * segments + (i + 1) % segments, c = a + segments, d = b + segments;
    indices.push(a, b, c, b, d, c);
  }
  for (const j of [0, 5]) {
    const start = positions.length / 3;
    for (let i = 0; i < segments; i++) {
      const p = (j * segments + i) * 3; positions.push(...positions.slice(p, p + 3));
      uv.push(positions[p] / (2 * radius) + .5, positions[p + 2] / (2 * radius) + .5);
    }
    const centre = positions.length / 3; positions.push(0, profile[j][1], 0); uv.push(.5, .5);
    for (let i = 0; i < segments; i++) {
      const a = start + i, b = start + (i + 1) % segments;
      if (j === 0) indices.push(centre, b, a); else indices.push(centre, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function frontFastener(group, finish, position, name, radius = .018) {
  const geometry = socketGeometry(radius, .012); geometry.rotateX(Math.PI / 2);
  return addMesh(group, geometry, finish.polished, name, position);
}

function addMesh(group, geometry, material, name, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  if (position) mesh.position.copy(position);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.physicalRack = true;
  group.add(mesh);
  return mesh;
}

function roundedProfile(width, height, radius, samples = 5) {
  const r = Math.min(radius, width / 2, height / 2), points = [];
  const corners = [[width / 2 - r, height / 2 - r, 0], [-width / 2 + r, height / 2 - r, Math.PI / 2],
    [-width / 2 + r, -height / 2 + r, Math.PI], [width / 2 - r, -height / 2 + r, Math.PI * 1.5]];
  for (const [x, y, angle] of corners) for (let i = 0; i <= samples; i++) {
    const a = angle + i / samples * Math.PI / 2;
    points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  return points;
}

/** Closed rounded rectangular metal beam following an actual 3D curve. */
function curvedBeamGeometry(curve, width, height, { segments = 36, up = UP } = {}) {
  const profile = roundedProfile(width, height, Math.min(width, height) * .24), ring = profile.length;
  const positions = [], uv = [], indices = [];
  for (let j = 0; j <= segments; j++) {
    const t = j / segments, centre = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
    let vertical = up.clone().addScaledVector(tangent, -up.dot(tangent));
    if (vertical.lengthSq() < 1e-7) vertical = new THREE.Vector3(0, 0, 1).addScaledVector(tangent, -tangent.z);
    vertical.normalize();
    const horizontal = vertical.clone().cross(tangent).normalize();
    for (let k = 0; k < ring; k++) {
      const [x, y] = profile[k], point = centre.clone().addScaledVector(horizontal, x).addScaledVector(vertical, y);
      positions.push(point.x, point.y, point.z); uv.push(k / ring, t);
      if (j < segments) {
        const a = j * ring + k, b = j * ring + (k + 1) % ring, c = a + ring, d = b + ring;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  for (const j of [0, segments]) {
    const start = positions.length / 3;
    for (let k = 0; k < ring; k++) {
      const p = (j * ring + k) * 3; positions.push(...positions.slice(p, p + 3));
      uv.push(profile[k][0] / width + .5, profile[k][1] / height + .5);
    }
    const centre = curve.getPoint(j / segments), centreId = positions.length / 3;
    positions.push(centre.x, centre.y, centre.z); uv.push(.5, .5);
    for (let k = 0; k < ring; k++) {
      const a = start + k, b = start + (k + 1) % ring;
      if (j === 0) indices.push(centreId, b, a); else indices.push(centreId, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function collar(group, finish, position, radius, height, name) {
  addMesh(group, turnedGeometry(radius, height), finish.structure, name, position);
  // Machined narrow lips frame the brushed compression sleeve.
  for (const sign of [-1, 1]) addMesh(group, turnedGeometry(radius * 1.018, .010), finish.polished,
    `${name}-machined-lip-${sign}`, position.clone().add(new THREE.Vector3(0, height * .36 * sign, 0)));
  frontFastener(group, finish, position.clone().add(new THREE.Vector3(0, 0, radius + .001)), `${name}-recessed-lock-screw`, Math.min(.025, height * .21));
}

function underPlatformCradle(mount, finish, plateWidth, centre, thickness, index, neckLength) {
  // One cast strap with upturned ends, as seen under the front-facing set.
  const span = plateWidth * .346, drop = Math.min(neckLength * .70, .20);
  const z = centre.z, top = -thickness + .012, bottom = -thickness - drop;
  const centreY = bottom + drop * .3;
  const point = (x, y) => new THREE.Vector3(centre.x + x, y, z);
  const curve = new THREE.CatmullRomCurve3([
    point(-span, top), point(-span, bottom + .025), point(-span + .025, bottom),
    point(0, centreY), point(span - .025, bottom), point(span, bottom + .025), point(span, top),
  ], false, 'centripetal');
  const bracket = addMesh(mount, curvedBeamGeometry(curve, .055, .102,
    { segments: 54, up: new THREE.Vector3(0, 0, 1) }), finish.structure, `physical-platform-${index}-saddle`);
  return { brackets: [bracket], centreY, span, bottom };
}

function baseApronGeometry(curve, depth, height) {
  // A wide solid bronze sector with a horizontal top and a machined leading
  // edge. Each face has its own vertices so flat faces retain a planar normal.
  const b = .013, d = depth / 2, h = height / 2, steps = 72;
  const profile = [[d-b,-h],[d,-h+b],[d,h-b],[d-b,h],[-d+b,h],[-d,h-b],[-d,-h+b],[-d+b,-h]];
  const materials = [2,1,2,0,2,1,2,3], positions = [], uv = [], indices = [];
  const geometry = new THREE.BufferGeometry();
  for (let side = 0; side < profile.length; side++) {
    const start = indices.length, base = positions.length / 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, c = curve.getPoint(t), tangent = curve.getTangent(t);
      const across = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      for (let j = 0; j < 2; j++) {
        const [z, y] = profile[(side + j) % profile.length];
        positions.push(c.x + across.x*z, c.y + y, c.z + across.z*z);
        uv.push(t, j);
      }
      if (i < steps) { const a = base + 2 * i; indices.push(a, a+1, a+2, a+1, a+3, a+2); }
    }
    geometry.addGroup(start, indices.length-start, materials[side]);
  }
  const capStart = indices.length;
  for (const t of [0, 1]) {
    const base = positions.length / 3, c = curve.getPoint(t), tangent = curve.getTangent(t);
    const across = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    positions.push(c.x,c.y,c.z); uv.push(.5,.5);
    for (const [z,y] of profile) {
      positions.push(c.x + across.x*z, c.y+y, c.z + across.z*z); uv.push(z/depth+.5,y/height+.5);
    }
    for (let j = 0; j < profile.length; j++) {
      const a = base + 1 + j, b = base + 1 + (j+1)%profile.length;
      if (t) indices.push(base,a,b); else indices.push(base,b,a);
    }
  }
  geometry.addGroup(capStart, indices.length-capStart, 1);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/**
 * buildPhysicalRack({ placements, column?, tierHeights?, thickness?, materials? })
 * placement: { position:Vector3|[x,bottomY,z], quaternion|yaw, dimensions:{width,height,depth}, tier? }.
 * dimensions already include the initial TV world scale. Local TV front is +Z,
 * its cabinet extends backwards; every shelf's actual upper surface is y=0.
 */
export function buildPhysicalRack(input = {}, extraOptions = {}) {
  const options = Array.isArray(input) ? { ...extraOptions, placements: input } : input;
  const placements = options.placements || [];
  if (!placements.length) throw new TypeError('buildPhysicalRack requires TV placements');
  const thickness = options.thickness ?? .104, columnSpec = { ...DEFAULT_COLUMN, ...options.column };
  const group = new THREE.Group(); group.name = 'physical-bronze-television-rack';
  const sharedGroup = new THREE.Group(); sharedGroup.name = 'physical-rack-shared-column-and-crossbars'; group.add(sharedGroup);
  const sharedFinish = bronzeMaterials(options.materials);
  const column = addMesh(sharedGroup, new THREE.CylinderGeometry(columnSpec.radius * .92, columnSpec.radius, columnSpec.topY - columnSpec.bottomY, 64, 1, false), sharedFinish.shaft,
    'physical-central-bronze-shaft', new THREE.Vector3(columnSpec.x, (columnSpec.bottomY + columnSpec.topY) / 2, columnSpec.z));
  const tierHeights = options.tierHeights || [1.55, -.585, -3.68];
  // The calibrated arm paths apply to the complete installation. Standalone
  // mounts and custom column/tier arrangements calculate their own spans.
  const fullInstallation = placements.length === 10 && !options.column && !options.tierHeights;
  const mounts = placements.map((placement, i) => {
    const dimensions = dimensionsOf(placement.dimensions), position = vector(placement.position), quaternion = placementQuaternion(placement);
    const tier = Number.isInteger(placement.tier) ? placement.tier : i < 3 ? 0 : i < 7 ? 1 : 2;
    const mount = new THREE.Group(); mount.name = `physical-tv-platform-${i + 1}`;
    mount.position.copy(position); mount.quaternion.copy(quaternion); group.add(mount);
    mount.userData.televisionIndex = placement.index ?? i;
    const index = placement.index ?? i;
    const [w, d, x, setback, bow] = TRAY_FOOTPRINTS[index] || [1.02, 1.04, 0, -.49, .02];
    const finish = bronzeMaterials(options.materials), plateWidth = dimensions.width * w, plateDepth = dimensions.depth * d;
    const plateCentre = new THREE.Vector3(x, 0, dimensions.depth * setback);
    const blank = platformGeometry(plateWidth, plateDepth, thickness, bow);
    if (fullInstallation) fitCastDeck(blank, index, plateWidth, plateDepth, quaternion);
    const platform = addMesh(mount, blank, [finish.top, finish.edge, finish.polished, finish.inset], `physical-platform-${i + 1}`, plateCentre);
    platform.userData.pickProtect = true;
    const innerMiddle = tier === 1 && Math.abs(position.x - columnSpec.x) < 3;
    const neckLength = options.neckLength ?? (innerMiddle ? .265 : tier === 2 ? .16 : .145);
    const neckRadius = Math.max(.056, Math.min(.084, dimensions.width * .029));
    const cradle = underPlatformCradle(mount, finish, plateWidth, plateCentre, thickness, i + 1, neckLength);
    if (placements.length > 1 && placement.index === 1) {
      const cup = new THREE.LatheGeometry([
        [0, -.245], [.22, -.245], [.40, -.220], [.63, -.179],
        [.86, -.126], [.97, -.055], [.96, -.024], [.90, -.012],
        [.72, -.076], [.41, -.13], [.17, -.148], [0, -.148],
      ].map(([r, y]) => new THREE.Vector2(r, y * .83)), 72);
      cup.scale(1.14, 1.12, .79);
      addMesh(mount, cup, finish.polished, 'turned-upper-saddle', new THREE.Vector3(0, -thickness - .036, plateCentre.z));
    }
    const neckTop = cradle.centreY + .015, neckBottom = -thickness - neckLength, shaftHeight = neckTop - neckBottom;
    const neck = addMesh(mount, turnedGeometry(neckRadius, shaftHeight), finish.structure, `physical-platform-${i + 1}-neck`,
      new THREE.Vector3(plateCentre.x, (neckTop + neckBottom) / 2, plateCentre.z));
    collar(mount, finish, new THREE.Vector3(plateCentre.x, neckTop, plateCentre.z), neckRadius * 1.5, .045, `physical-platform-${i + 1}-upper-collar`);
    const fasciaCentre = new THREE.Vector3(plateCentre.x, -thickness / 2, plateCentre.z + plateDepth / 2 + bow + .001);
    if (fullInstallation) fasciaCentre.add(deckOffset(index, .5, 1, quaternion.clone().invert()));
    frontFastener(mount, finish, fasciaCentre,
      `physical-platform-${i + 1}-front-fastener`, .016);
    mount.updateMatrix();
    const matrix = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)), inverse = matrix.clone().invert();
    // The radial strip meets the end of the saddle on each outer tray. The
    // short central receivers sit directly above the shaft and bottom apron.
    const distanceToAxis = position.x - columnSpec.x;
    const bearing = Math.abs(distanceToAxis) < .4 ? 0 : Math.sign(distanceToAxis) * cradle.span * (tier === 0 || innerMiddle ? .40 : .75);
    const anchor = new THREE.Vector3(plateCentre.x + bearing, bearing ? cradle.bottom + .016 : neckBottom + .016, plateCentre.z).applyMatrix4(matrix);
    const start = new THREE.Vector3(columnSpec.x, tierHeights[tier] ?? tierHeights[2], columnSpec.z);
    const c1 = start.clone().lerp(anchor, .34); c1.y = start.y; c1.z -= .25;
    const c2 = start.clone().lerp(anchor, .84); c2.y = anchor.y - .024; c2.z -= .16;
    const path = fullInstallation && ARM_PATHS[index];
    const localCurve = path
      ? new THREE.CatmullRomCurve3(path.map(([x, y, z]) => new THREE.Vector3(x, y + (tier === 0 ? .025 : 0), z).applyMatrix4(inverse)), false, 'centripetal')
      : new THREE.CubicBezierCurve3(...[start, c1, c2, anchor].map(p => p.applyMatrix4(inverse)));
    const localUp = (path ? new THREE.Vector3(0,0,1) : UP.clone()).applyQuaternion(quaternion.clone().invert());
    const section = path ? [tier === 2 ? .093 : tier === 0 ? .150 : innerMiddle ? .146 : .124, .190] : [tier === 2 ? .15 : .205, tier === 2 ? .062 : .076];
    const arm = addMesh(mount, curvedBeamGeometry(localCurve, ...section,
      { up: localUp, segments: path ? 80 : 36 }), sharedFinish.structure, `physical-platform-${i + 1}-curved-radial-arm`);
    const pickMeshes = []; mount.traverse(node => { if (node.isMesh && node !== arm) { node.userData.pickProtect = true; node.userData.televisionIndex = placement.index ?? i; pickMeshes.push(node); } });
    return { index: placement.index ?? i, group: mount, platform, neck, arm, armStub: neck, cradle: cradle.brackets, pickMeshes, materials: new Set(Object.values(finish)),
      dimensions, tier, supportY: position.y, supportTopY: position.y, thickness, neckLength, position: position.clone(), quaternion: quaternion.clone() };
  });

  // The radial arms are part of the shared stand. Their world transforms
  // stay seated at the individual mounts, which can be lit on their own.
  group.updateMatrixWorld(true);
  for (const mount of mounts) sharedGroup.attach(mount.arm);

  const tierRecords = [];
  for (let tier = 0; tier < 3; tier++) {
    const row = mounts.filter(m => m.tier === tier);
    if (!row.length) continue;
    const jointY = tierHeights[tier], left = row.reduce((a, b) => a.position.x < b.position.x ? a : b), right = row.reduce((a, b) => a.position.x > b.position.x ? a : b);
    const centreY = jointY, axis = new THREE.Vector3(columnSpec.x, jointY, columnSpec.z);
    const jointRadius = columnSpec.radius * [1.79, 2.10, 1.62][tier];
    collar(sharedGroup, sharedFinish, axis, jointRadius, tier === 1 ? .198 : .143, `physical-tier-${tier + 1}-shaft-collar`);
    // The strips running from the hub to the individual saddles are the
    // crossmembers on the upper tiers. A second full-width bar would cross
    // the same open space and make a lattice between the television sets.
    let crossbar = left.arm;
    if (tier === 2 && row.length > 1) {
      const centreMount = row.reduce((a, b) => Math.abs(a.position.x) < Math.abs(b.position.x) ? a : b);
      const depth = Math.min(1.48, centreMount.dimensions.depth * .72);
      const centre = new THREE.Vector3(columnSpec.x, centreMount.position.y - thickness - .033, centreMount.position.z - depth / 2 + .15);
      const end = m => m.group.localToWorld(new THREE.Vector3(0, -thickness - .077, -m.dimensions.depth * .32));
      const from = end(left), to = end(right);
      const arc = new THREE.CatmullRomCurve3([from,
        from.clone().lerp(centre, .46).add(new THREE.Vector3(0, -.063, .16)), centre,
        to.clone().lerp(centre, .46).add(new THREE.Vector3(0, -.063, .16)), to]);
      crossbar = addMesh(sharedGroup, baseApronGeometry(arc, depth, .164),
        [sharedFinish.top, sharedFinish.edge, sharedFinish.polished, sharedFinish.inset], 'swept-bronze-base');
      for (const t of [.10, .29, .50, .71, .90]) {
        const point = arc.getPoint(t), tangent = arc.getTangent(t);
        const face = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        point.addScaledVector(face, depth / 2 + .002);
        const screw = frontFastener(sharedGroup, sharedFinish, point, 'slotted-base-fastener', .031);
        screw.rotation.y = Math.atan2(face.x, face.z);
      }
    }
    tierRecords.push({ tier, crossbar, centreY, jointY });
  }
  if (mounts.length > 1) {
    collar(sharedGroup, sharedFinish, new THREE.Vector3(columnSpec.x, .40, columnSpec.z),
      columnSpec.radius * 1.56, .128, 'mid-shaft-locking-collar');
  }
  group.updateMatrixWorld(true);
  for (const mount of mounts) {
    mount.bounds = new THREE.Box3().setFromObject(mount.group);
    mount.platformBounds = new THREE.Box3().setFromObject(mount.platform);
    // A local envelope for camera fitting, excluding the long radial arm.
    mount.localFocusBounds = new THREE.Box3(new THREE.Vector3(-mount.dimensions.width / 2 - .15, -thickness - mount.neckLength - .04, -mount.dimensions.depth * .97 - .16),
      new THREE.Vector3(mount.dimensions.width / 2 + .15, 0, mount.dimensions.depth * .03 + .16));
    mount.focusBounds = mount.localFocusBounds.clone().applyMatrix4(mount.group.matrixWorld);
  }
  const sharedPickMeshes = []; sharedGroup.traverse(node => { if (node.isMesh) { node.userData.pickProtect = true; sharedPickMeshes.push(node); } });
  group.userData.physicalPBR = true; group.userData.photographicBake = false;
  group.userData.shelfContact = 'actual upper surface at TV bottom; no spacer blocks';
  if(options.ambientOcclusion!==false)for(const mount of mounts){
    try{mount.group.userData.physicalAOReport=applyPhysicalAO(mount.group,PHYSICAL_AO_DATA.models[mount.index]?.mount||[],{mode:'vertex-color',strength:.75});}
    catch(error){mount.group.userData.physicalAOReport={applied:[],mismatched:[],missing:[],error:String(error?.message||error)};}
  }
  return { group, mounts, column, sharedGroup, sharedPickMeshes, tiers: tierRecords, bounds: new THREE.Box3().setFromObject(group), materials: new Set(Object.values(sharedFinish)) };
}

// The isolated project view in Figma is presented on a single pedestal. Its
// ferrule meets the selected saddle at the same joint as the radial structure.
export function buildPresentationPedestal() {
  const group = new THREE.Group(), finish = bronzeMaterials();
  group.name = 'Single-set presentation pedestal';
  addMesh(group, turnedGeometry(.102, 4.2), finish.structure, 'turned-pedestal-shaft', new THREE.Vector3(0, -2.13, 0));
  collar(group, finish, new THREE.Vector3(0, -.055, 0), .149, .12, 'pedestal-locking-collar');
  return group;
}
