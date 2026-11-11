import * as THREE from 'three';

/* A real bronze structure. No photograph, projected UV or image-backed material
 * participates in these meshes. TV placements already contain the initial world
 * scale in dimensions; the rack never changes a TV or adds spacer blocks. */

const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_COLUMN = { x: 0, z: -1.05, bottomY: -4.10, topY: 1.90, radius: .095 };

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

function bronzeMaterials(overrides = {}) {
  const create = (name, color, roughness, metalness) => {
    const material = overrides[name]?.isMaterial ? overrides[name].clone()
      : new THREE.MeshPhysicalMaterial({ color, roughness, metalness,
        roughnessMap: brushedGrain(), anisotropy: .35,
        clearcoat: name === 'top' ? .025 : .04, clearcoatRoughness: .38 });
    material.name = `bronze-${name}`;
    return material;
  };
  // Each mount owns its finish so opacity/dimming cannot affect another shelf.
  return {
    top: create('top', 0x29241f, .47, .74),
    edge: create('edge', 0x7b6852, .33, .91),
    polished: create('polished', 0xb38a53, .23, .95),
    structure: create('structure', 0x705137, .35, .89),
    inset: create('inset', 0x33291f, .43, .76),
  };
}

let grainTexture;
function brushedGrain() {
  if (grainTexture) return grainTexture;
  const size = 128, pixels = new Uint8Array(size * size * 4);
  let seed = 7193;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (let y = 0; y < size; y++) {
    const line = (random() - .5) * 13 + Math.sin(y * 1.73) * 3;
    for (let x = 0; x < size; x++) {
      const value = Math.round(226 + line + (random() - .5) * 7), i = (y * size + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value; pixels[i + 3] = 255;
    }
  }
  grainTexture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  grainTexture.name = 'Own generated fine brushed-bronze micro-roughness';
  grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.repeat.set(2, 7); grainTexture.needsUpdate = true;
  return grainTexture;
}

function platformGeometry(width, depth, thickness) {
  // A dark horizontal deck, narrow brushed fascia and two machined chamfers.
  // The top stays exactly y=0; metal is entirely below the television bottom.
  const bevel = Math.min(.010, thickness * .18), radius = Math.min(.12, depth * .105);
  const rings = [[-thickness, bevel], [-thickness + bevel, 0], [-bevel, 0], [0, bevel]];
  const positions = [], uv = [], indices = [], ring = roundedProfile(width, depth, radius, 10).length;
  for (const [y, inset] of rings) {
    let k = 0;
    for (const [x, z] of roundedProfile(width - inset * 2, depth - inset * 2, radius - inset, 10)) {
      positions.push(x, y, z); uv.push(k++ / ring, (y + thickness) / thickness);
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
    // Separate cap vertices keep the broad machined top perfectly planar.
    const start = positions.length / 3, centre = start + ring;
    for (let k = 0; k < ring; k++) {
      const p = (j * ring + k) * 3; positions.push(...positions.slice(p, p + 3));
      uv.push(positions[p] / width + .5, positions[p + 2] / depth + .5);
    }
    positions.push(0, rings[j][0], 0); uv.push(.5, .5);
    for (let k = 0; k < ring; k++) {
      const a = start + k, b = start + (k + 1) % ring;
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

function underPlatformCradle(mount, finish, plateWidth, plateDepth, centre, thickness, index) {
  const span = plateWidth * .355, drop = Math.min(.175, Math.max(.135, plateWidth * .063));
  const centreY = -thickness - drop * .65, brackets = [];
  for (const side of [-1, 1]) {
    const z = centre.z + side * plateDepth * .20;
    // One bent flat bar makes the two uprights and sloping lower saddle.
    // Its ends are embedded into the underside, never above contact y=0.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-span, -thickness + .010, z), new THREE.Vector3(-span, -thickness - drop * .72, z),
      new THREE.Vector3(-span + .035, -thickness - drop, z), new THREE.Vector3(0, centreY, z),
      new THREE.Vector3(span - .035, -thickness - drop, z), new THREE.Vector3(span, -thickness - drop * .72, z),
      new THREE.Vector3(span, -thickness + .010, z),
    ], false, 'centripetal');
    brackets.push(addMesh(mount, curvedBeamGeometry(curve, .043, .093,
      { segments: 84, up: new THREE.Vector3(0, 0, 1) }), finish.structure,
    `physical-platform-${index}-symmetric-cradle-${side < 0 ? 'rear' : 'front'}`));
  }
  const bridge = new THREE.LineCurve3(new THREE.Vector3(0, centreY, centre.z - plateDepth * .22),
    new THREE.Vector3(0, centreY, centre.z + plateDepth * .22));
  addMesh(mount, curvedBeamGeometry(bridge, .105, .062, { segments: 1 }), finish.structure,
    `physical-platform-${index}-cradle-cross-bridge`);
  return { brackets, drop, centreY };
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
  const thickness = options.thickness ?? .07, columnSpec = { ...DEFAULT_COLUMN, ...options.column };
  const group = new THREE.Group(); group.name = 'physical-bronze-television-rack';
  const sharedGroup = new THREE.Group(); sharedGroup.name = 'physical-rack-shared-column-and-crossbars'; group.add(sharedGroup);
  const sharedFinish = bronzeMaterials(options.materials);
  const column = addMesh(sharedGroup, new THREE.CylinderGeometry(columnSpec.radius * .92, columnSpec.radius, columnSpec.topY - columnSpec.bottomY, 64, 1, false), sharedFinish.structure,
    'physical-central-bronze-shaft', new THREE.Vector3(columnSpec.x, (columnSpec.bottomY + columnSpec.topY) / 2, columnSpec.z));
  const tierHeights = options.tierHeights || [1.70, -.55, -3.65];
  const mounts = placements.map((placement, i) => {
    const dimensions = dimensionsOf(placement.dimensions), position = vector(placement.position), quaternion = placementQuaternion(placement);
    const tier = Number.isInteger(placement.tier) ? placement.tier : i < 3 ? 0 : i < 7 ? 1 : 2;
    const mount = new THREE.Group(); mount.name = `physical-tv-platform-${i + 1}`;
    mount.position.copy(position); mount.quaternion.copy(quaternion); group.add(mount);
    mount.userData.televisionIndex = placement.index ?? i;
    const finish = bronzeMaterials(options.materials), plateWidth = dimensions.width + .22, plateDepth = dimensions.depth + .26;
    const plateCentre = new THREE.Vector3(0, 0, -dimensions.depth * .45);
    const platform = addMesh(mount, platformGeometry(plateWidth, plateDepth, thickness), [finish.top, finish.edge, finish.polished, finish.inset], `physical-platform-${i + 1}`, plateCentre);
    platform.userData.pickProtect = true;
    const neckLength = options.neckLength ?? (tier === 2 ? .35 : .41);
    const neckRadius = Math.max(.068, Math.min(.092, dimensions.width * .033));
    const cradle = underPlatformCradle(mount, finish, plateWidth, plateDepth, plateCentre, thickness, i + 1);
    const neckTop = cradle.centreY - .018, neckBottom = -thickness - neckLength, shaftHeight = neckTop - neckBottom;
    const neck = addMesh(mount, turnedGeometry(neckRadius, shaftHeight), finish.structure, `physical-platform-${i + 1}-neck`,
      new THREE.Vector3(0, (neckTop + neckBottom) / 2, plateCentre.z));
    collar(mount, finish, new THREE.Vector3(0, neckTop + .008, plateCentre.z), neckRadius * 1.9, .075, `physical-platform-${i + 1}-upper-collar`);
    collar(mount, finish, new THREE.Vector3(0, -thickness - neckLength + .035, plateCentre.z), neckRadius * 1.35, .06, `physical-platform-${i + 1}-lower-collar`);
    // The visible centre screw is sunk into the narrow front fascia.
    frontFastener(mount, finish, new THREE.Vector3(0, -thickness / 2, plateCentre.z + plateDepth / 2 + .001),
      `physical-platform-${i + 1}-front-fastener`, .019);
    mount.updateMatrix();
    const matrix = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)), inverse = matrix.clone().invert();
    const anchor = new THREE.Vector3(0, -thickness - neckLength + .018, plateCentre.z).applyMatrix4(matrix);
    const start = new THREE.Vector3(columnSpec.x, tierHeights[tier] ?? tierHeights[2], columnSpec.z);
    const c1 = start.clone().lerp(anchor, .28); c1.y = start.y - .055;
    const c2 = start.clone().lerp(anchor, .82); c2.y = anchor.y - .075;
    const localCurve = new THREE.CubicBezierCurve3(...[start, c1, c2, anchor].map(p => p.applyMatrix4(inverse)));
    const localUp = UP.clone().applyQuaternion(quaternion.clone().invert());
    const arm = addMesh(mount, curvedBeamGeometry(localCurve, .17, .095, { up: localUp, segments: 40 }), finish.structure, `physical-platform-${i + 1}-curved-radial-arm`);
    const pickMeshes = []; mount.traverse(node => { if (node.isMesh) { node.userData.pickProtect = true; node.userData.televisionIndex = placement.index ?? i; pickMeshes.push(node); } });
    return { index: placement.index ?? i, group: mount, platform, neck, arm, armStub: neck, cradle: cradle.brackets, pickMeshes, materials: new Set(Object.values(finish)),
      dimensions, tier, supportY: position.y, supportTopY: position.y, thickness, neckLength, position: position.clone(), quaternion: quaternion.clone() };
  });

  const tierRecords = [];
  for (let tier = 0; tier < 3; tier++) {
    const row = mounts.filter(m => m.tier === tier);
    if (!row.length) continue;
    const jointY = tierHeights[tier], left = row.reduce((a, b) => a.position.x < b.position.x ? a : b), right = row.reduce((a, b) => a.position.x > b.position.x ? a : b);
    // The lower member bows below the central sphere, rather than cutting
    // through the television's base. Other tiers retain their higher joint.
    const centreY = tier === 2 ? Math.min(jointY, ...row.map(m => m.position.y - .17)) : jointY;
    const leftPoint = new THREE.Vector3(left.position.x, left.position.y - thickness - .16, columnSpec.z + .30);
    const rightPoint = new THREE.Vector3(right.position.x, right.position.y - thickness - .16, columnSpec.z + .30);
    const centre = new THREE.Vector3(columnSpec.x, centreY, columnSpec.z);
    const curve = new THREE.CatmullRomCurve3([leftPoint, leftPoint.clone().lerp(centre, .45).add(new THREE.Vector3(0, -.055, -.04)), centre,
      centre.clone().lerp(rightPoint, .55).add(new THREE.Vector3(0, -.055, -.04)), rightPoint]);
    const crossbar = addMesh(sharedGroup, curvedBeamGeometry(curve, .22, .10, { segments: 64 }), sharedFinish.structure, `physical-tier-${tier + 1}-curved-crossmember`);
    collar(sharedGroup, sharedFinish, new THREE.Vector3(columnSpec.x, jointY, columnSpec.z), .19 + tier * .01, .16, `physical-tier-${tier + 1}-shaft-collar`);
    if (Math.abs(centreY - jointY) > .08) collar(sharedGroup, sharedFinish, centre, .19, .13, `physical-tier-${tier + 1}-lower-beam-collar`);
    tierRecords.push({ tier, crossbar, centreY, jointY });
  }
  group.updateMatrixWorld(true);
  for (const mount of mounts) {
    mount.bounds = new THREE.Box3().setFromObject(mount.group);
    mount.platformBounds = new THREE.Box3().setFromObject(mount.platform);
    // A local envelope for camera fitting, excluding the long radial arm.
    mount.localFocusBounds = new THREE.Box3(new THREE.Vector3(-mount.dimensions.width / 2 - .11, -thickness - mount.neckLength - .04, -mount.dimensions.depth * .95 - .13),
      new THREE.Vector3(mount.dimensions.width / 2 + .11, 0, mount.dimensions.depth * .05 + .13));
    mount.focusBounds = mount.localFocusBounds.clone().applyMatrix4(mount.group.matrixWorld);
  }
  const sharedPickMeshes = []; sharedGroup.traverse(node => { if (node.isMesh) { node.userData.pickProtect = true; sharedPickMeshes.push(node); } });
  group.userData.physicalPBR = true; group.userData.photographicBake = false;
  group.userData.shelfContact = 'actual upper surface at TV bottom; no spacer blocks';
  return { group, mounts, column, sharedGroup, sharedPickMeshes, tiers: tierRecords, bounds: new THREE.Box3().setFromObject(group), materials: new Set(Object.values(sharedFinish)) };
}
