import * as THREE from 'three';

// The rack is a collection of closed metal solids. Its bronze finish is baked
// from the reference camera; an orbit exposes the physical depth and the PBR
// reverse faces rather than an image card. Coordinates below are reference px.
const HOME_SOURCE = { x: 244, y: 54, width: 1432, height: 849 };
const PROJECT_SOURCE = { x: 0, y: 59, width: 1530, height: 897 };
const worldX = (x) => (x - 960) / 100;
const worldY = (y) => (478 - y) / 100;

function materials(texture) {
  return [
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    new THREE.MeshStandardMaterial({ color: 0x392719, metalness: .88, roughness: .31 }),
  ];
}

function meshWithProjection(geometry, finish, source, name) {
  // Projection is expressed in the same global space as the reference camera.
  // Linear UVs preserve its pixel positions on curved and tilted surfaces too.
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.computeVertexNormals();
  const p = g.attributes.position;
  const normals = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i) * 100 + 960;
    const py = 478 - p.getY(i) * 100;
    uv[i * 2] = (px - source.x) / source.width;
    uv[i * 2 + 1] = 1 - (py - source.y) / source.height;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.clearGroups();
  let previous = -1;
  let start = 0;
  for (let i = 0; i < p.count; i += 3) {
    const visible = normals.getZ(i) + normals.getZ(i + 1) + normals.getZ(i + 2) > .0001;
    const material = visible ? 0 : 1;
    if (material !== previous) {
      if (previous !== -1) g.addGroup(start, i - start, previous);
      previous = material;
      start = i;
    }
  }
  g.addGroup(start, p.count - start, previous);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, finish);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.referenceProjected = true;
  return mesh;
}

function pathShape(commands) {
  const shape = new THREE.Shape();
  for (const [op, ...v] of commands) {
    if (op === 'M') shape.moveTo(worldX(v[0]), worldY(v[1]));
    else if (op === 'L') shape.lineTo(worldX(v[0]), worldY(v[1]));
    else if (op === 'Q') shape.quadraticCurveTo(worldX(v[0]), worldY(v[1]), worldX(v[2]), worldY(v[3]));
    else if (op === 'C') shape.bezierCurveTo(worldX(v[0]), worldY(v[1]), worldX(v[2]), worldY(v[3]), worldX(v[4]), worldY(v[5]));
  }
  shape.closePath();
  return shape;
}

function shelf(group, finish, source, name, commands, { thickness = 5, front = -.30, rear = -1.50 } = {}) {
  // A tilted horizontal plate: front/back are 120px apart in actual depth.
  // Its projected footprint follows the asymmetric elliptical reference edge.
  // The upper skin, underside and continuous rim form a watertight cabinet shelf.
  const shape = pathShape(commands);
  const top = new THREE.ShapeGeometry(shape, 24);
  const points = shape.extractPoints(24).shape;
  if (points[0].distanceToSquared(points[points.length - 1]) < 1e-12) points.pop();
  top.computeBoundingBox();
  const maxY = top.boundingBox.max.y;
  const minY = top.boundingBox.min.y;
  const span = Math.max(.001, maxY - minY);
  const depthAt = (y) => rear + ((maxY - y) / span) * (front - rear);
  const positions = [];
  const upper = top.index ? top.toNonIndexed() : top;
  const p = upper.attributes.position;
  for (let i = 0; i < p.count; i++) positions.push(p.getX(i), p.getY(i), depthAt(p.getY(i)));
  for (let i = 0; i < p.count; i += 3) {
    for (const j of [i + 2, i + 1, i]) positions.push(p.getX(j), p.getY(j) - thickness / 100, depthAt(p.getY(j)));
  }
  // Triangulate each rim quad with a consistent outward winding.
  const clockwise = THREE.ShapeUtils.isClockWise(points);
  const ring = clockwise ? [...points].reverse() : points;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const va = [a.x, a.y, depthAt(a.y)], vb = [b.x, b.y, depthAt(b.y)];
    const ba = [a.x, a.y - thickness / 100, depthAt(a.y)], bb = [b.x, b.y - thickness / 100, depthAt(b.y)];
    positions.push(...va, ...ba, ...vb, ...vb, ...ba, ...bb);
  }
  if (upper !== top) upper.dispose();
  top.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.add(meshWithProjection(geometry, finish, source, name));
}

function tube(group, finish, source, name, pixels, radius = 4, z = -.95) {
  const curve = new THREE.CatmullRomCurve3(pixels.map(([x, y, depth]) => new THREE.Vector3(worldX(x), worldY(y), depth ?? z)));
  const geometry = new THREE.TubeGeometry(curve, Math.max(30, pixels.length * 12), radius / 100, 12, false);
  // TubeGeometry leaves its ends open; add solid caps in the endpoint planes.
  group.add(meshWithProjection(geometry, finish, source, name));
  for (const [t, suffix] of [[0, 'start'], [1, 'end']]) {
    const point = curve.getPointAt(t);
    const direction = curve.getTangentAt(t).multiplyScalar(t === 0 ? -1 : 1);
    const cap = new THREE.CircleGeometry(radius / 100, 12);
    cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction));
    cap.translate(point.x, point.y, point.z);
    group.add(meshWithProjection(cap, finish, source, `${name}-${suffix}-cap`));
  }
}

function beam(group, finish, source, name, commands, front = -.48, rear = -1.48) {
  // Bent rectangular steel members have a broad front web, unlike a round bar.
  // Extrusion preserves the traced curved outline and closes both depth faces.
  const geometry = new THREE.ExtrudeGeometry(pathShape(commands), {
    depth: front - rear, bevelEnabled: false, curveSegments: 30, steps: 1,
  });
  geometry.translate(0, 0, rear);
  group.add(meshWithProjection(geometry, finish, source, name));
}

function cylinder(group, finish, source, name, x, top, bottom, radius, z = -1.25) {
  const geometry = new THREE.CylinderGeometry(radius / 100, radius / 100, (bottom - top) / 100, 48, 1, false);
  geometry.translate(worldX(x), worldY((top + bottom) / 2), z);
  group.add(meshWithProjection(geometry, finish, source, name));
}

function collar(group, finish, source, name, x, top, bottom, radius, z = -1.25) {
  const height = (bottom - top) / 100;
  const r = radius / 100;
  const profile = [
    new THREE.Vector2(0, -height / 2), new THREE.Vector2(r * .87, -height / 2),
    new THREE.Vector2(r, -height / 2 + .018), new THREE.Vector2(r, height / 2 - .018),
    new THREE.Vector2(r * .87, height / 2), new THREE.Vector2(0, height / 2),
  ];
  const geometry = new THREE.LatheGeometry(profile, 48);
  geometry.translate(worldX(x), worldY((top + bottom) / 2), z);
  group.add(meshWithProjection(geometry, finish, source, name));
}

export function buildRack({ texture }) {
  const group = new THREE.Group();
  group.name = 'reference-bronze-rack';
  const finish = materials(texture);
  const source = HOME_SOURCE;

  cylinder(group, finish, source, 'central-steel-upright', 954, 290, 579, 11.5, -1.4);
  collar(group, finish, source, 'upper-locking-collar', 954, 319, 334, 29, -1.24);
  collar(group, finish, source, 'middle-locking-collar', 954, 430, 444, 27, -1.24);
  collar(group, finish, source, 'lower-locking-collar', 954, 518, 548, 34, -1.24);

  // Individual top tiers, each with its own asymmetric, turned front lip.
  shelf(group, finish, source, 'top-left-shelf', [
    ['M', 575, 292], ['Q', 674, 279, 785, 289], ['L', 789, 298],
    ['Q', 689, 308, 575, 302],
  ], { thickness: 5 });
  shelf(group, finish, source, 'top-center-shelf', [
    ['M', 825, 280], ['Q', 951, 269, 1074, 280], ['L', 1075, 289],
    ['Q', 956, 304, 827, 291],
  ], { thickness: 5 });
  shelf(group, finish, source, 'top-right-shelf', [
    ['M', 1109, 291], ['Q', 1220, 279, 1339, 294], ['L', 1339, 302],
    ['Q', 1240, 314, 1108, 301],
  ], { thickness: 5 });
  const dish = new THREE.LatheGeometry([
    new THREE.Vector2(0, worldY(319)), new THREE.Vector2(.29, worldY(318)),
    new THREE.Vector2(.67, worldY(310)), new THREE.Vector2(1.04, worldY(296)),
    new THREE.Vector2(1.08, worldY(292)), new THREE.Vector2(0, worldY(292)),
  ], 72);
  dish.scale(1, 1, .55);
  dish.translate(worldX(953), 0, -.9);
  group.add(meshWithProjection(dish, finish, source, 'upper-center-turned-support-dish'));
  beam(group, finish, source, 'upper-left-curved-arm', [
    ['M', 662, 296], ['L', 675, 297], ['L', 675, 305], ['Q', 696, 300, 714, 302],
    ['C', 794, 304, 862, 313, 946, 316], ['L', 946, 329],
    ['C', 850, 322, 764, 320, 682, 316], ['L', 665, 316], ['Q', 661, 314, 662, 307],
  ]);
  beam(group, finish, source, 'upper-right-curved-arm', [
    ['M', 1238, 296], ['L', 1254, 297], ['L', 1252, 314], ['Q', 1249, 321, 1227, 321],
    ['C', 1138, 322, 1062, 324, 969, 330], ['L', 968, 316],
    ['C', 1068, 315, 1148, 305, 1207, 303], ['Q', 1228, 302, 1238, 296],
  ]);
  cylinder(group, finish, source, 'center-tv-mount', 953, 289, 319, 6.5, -.72);

  shelf(group, finish, source, 'middle-left-shelf', [
    ['M', 391, 515], ['Q', 510, 511, 640, 517], ['L', 643, 524],
    ['Q', 534, 536, 390, 522],
  ], { thickness: 6 });
  shelf(group, finish, source, 'middle-center-left-shelf', [
    ['M', 670, 526], ['Q', 792, 516, 917, 526], ['L', 918, 532],
    ['Q', 795, 542, 670, 534],
  ], { thickness: 4 });
  shelf(group, finish, source, 'middle-center-right-shelf', [
    ['M', 1022, 522], ['Q', 1136, 517, 1240, 523], ['L', 1242, 530],
    ['Q', 1134, 539, 1021, 530],
  ], { thickness: 5 });
  shelf(group, finish, source, 'middle-right-shelf', [
    ['M', 1266, 523], ['Q', 1398, 516, 1530, 520], ['L', 1531, 528],
    ['Q', 1408, 541, 1265, 530],
  ], { thickness: 4 });
  beam(group, finish, source, 'middle-outer-left-arm', [
    ['M', 458, 522], ['L', 470, 524], ['L', 470, 536],
    ['C', 622, 542, 778, 548, 934, 528], ['L', 938, 540],
    ['C', 784, 561, 622, 552, 472, 549], ['Q', 460, 549, 458, 540],
  ], -.68);
  beam(group, finish, source, 'middle-inner-left-arm', [
    ['M', 763, 535], ['L', 779, 538], ['L', 778, 553], ['Q', 790, 557, 803, 552],
    ['L', 934, 533], ['L', 939, 543], ['L', 803, 566], ['Q', 777, 571, 766, 563],
  ], -.46);
  beam(group, finish, source, 'middle-inner-right-arm', [
    ['M', 1133, 533], ['L', 1152, 535], ['L', 1150, 560], ['Q', 1145, 569, 1132, 566],
    ['L', 974, 543], ['L', 978, 532], ['L', 1125, 553], ['Q', 1134, 555, 1133, 547],
  ], -.46);
  beam(group, finish, source, 'middle-outer-right-arm', [
    ['M', 1437, 530], ['L', 1451, 531], ['L', 1448, 549], ['Q', 1447, 555, 1437, 554],
    ['C', 1263, 560, 1104, 550, 977, 539], ['L', 980, 527],
    ['C', 1139, 546, 1275, 546, 1437, 542],
  ], -.68);

  shelf(group, finish, source, 'bottom-left-shelf', [
    ['M', 429, 793], ['Q', 568, 771, 752, 798], ['Q', 792, 804, 812, 817],
    ['Q', 741, 839, 622, 840], ['Q', 495, 827, 427, 803],
  ], { thickness: 7 });
  shelf(group, finish, source, 'bottom-right-shelf', [
    ['M', 1164, 799], ['Q', 1288, 775, 1478, 783], ['Q', 1492, 791, 1480, 803],
    ['Q', 1389, 834, 1263, 834], ['Q', 1192, 825, 1162, 810],
  ], { thickness: 7 });
  // The lower crescent is a closed, deep curved beam, separate from the plates.
  shelf(group, finish, source, 'bottom-curved-crossmember', [
    ['M', 544, 822], ['C', 697, 839, 807, 851, 958, 850],
    ['C', 1107, 851, 1237, 833, 1378, 817], ['L', 1378, 842],
    ['C', 1234, 866, 1091, 878, 958, 879], ['C', 810, 878, 688, 861, 544, 842],
  ], { thickness: 4 });
  shelf(group, finish, source, 'bottom-center-shelf', [
    ['M', 834, 842], ['Q', 959, 832, 1086, 843], ['L', 1093, 854],
    ['Q', 960, 865, 827, 855],
  ], { thickness: 5, front: -.20 });
  tube(group, finish, source, 'bottom-left-diagonal-brace', [[584, 838], [584, 850], [667, 853]], 4, -1.08);
  tube(group, finish, source, 'bottom-right-diagonal-brace', [[1367, 829], [1366, 841], [1270, 853]], 4, -1.08);
  group.userData.sourceBounds = { ...source };
  group.userData.closedPhysicalSolids = true;
  return group;
}

export function buildProjectRack({ texture }) {
  const group = new THREE.Group();
  group.name = 'reference-project-pedestal';
  const finish = materials(texture);
  const source = PROJECT_SOURCE;

  cylinder(group, finish, source, 'project-pedestal-column', 692.5, 814, 980, 38, -1.4);
  collar(group, finish, source, 'project-column-collar', 692, 815, 853, 68, -1.18);
  // Broad bent rectangular members retain the whole illuminated join. Their
  // silhouette includes the turned vertical webs and the sloping lower beam.
  beam(group, finish, source, 'project-left-bracket', [
    ['M', 414, 799], ['L', 451, 799], ['L', 451, 822], ['Q', 451, 830, 459, 827],
    ['L', 652, 810], ['L', 657, 832], ['L', 440, 849], ['Q', 416, 852, 414, 840],
  ], -.48, -1.48);
  beam(group, finish, source, 'project-right-bracket', [
    ['M', 948, 799], ['L', 987, 799], ['L', 987, 840], ['Q', 985, 852, 966, 849],
    ['L', 733, 832], ['L', 735, 810], ['L', 940, 827], ['Q', 948, 829, 948, 822],
  ], -.48, -1.48);
  shelf(group, finish, source, 'project-large-platform', [
    ['M', 304, 773], ['Q', 493, 759, 691, 766], ['Q', 890, 761, 1081, 773],
    ['L', 1083, 791], ['Q', 888, 800, 692, 798], ['Q', 490, 800, 302, 791],
  ], { thickness: 5, front: -.30, rear: -1.50 });
  beam(group, finish, source, 'project-left-platform-end-cap', [
    ['M', 303, 774], ['L', 310, 773], ['L', 310, 800], ['L', 303, 798],
  ], -.28, -1.48);
  beam(group, finish, source, 'project-right-platform-end-cap', [
    ['M', 1076, 773], ['L', 1083, 774], ['L', 1083, 798], ['L', 1076, 800],
  ], -.28, -1.48);
  // Small front screw heads remain physical round fasteners.
  for (const [x, y, radius] of [[692, 790, 7], [692, 840, 5]]) {
    const geometry = new THREE.SphereGeometry(radius / 100, 20, 12);
    geometry.scale(1, 1, .35);
    geometry.translate(worldX(x), worldY(y), -.22);
    group.add(meshWithProjection(geometry, finish, source, `project-front-fastener-${y}`));
  }
  group.userData.sourceBounds = { ...source };
  group.userData.closedPhysicalSolids = true;
  return group;
}

/** A real selected-TV platform, brackets, collar and column in canonical TV
 * coordinates. Photo UVs stay attached to the original Figma pedestal surfaces.
 * Pass project-source.webp as texture; Home p0 geometry is never changed. */
export function buildSelectedSupport(index, { faceFrame, texture } = {}) {
  if (!Number.isInteger(index) || index < 0 || index >= 10) throw new RangeError(`Unknown television ${index}`);
  if (!faceFrame || !Number.isFinite(faceFrame.cabinetBottom)) throw new TypeError('buildSelectedSupport requires the focused television faceFrame');
  const group = buildProjectRack({ texture: texture || null });
  group.name = `selected-support-${index}`;
  const originalBounds = new THREE.Box3().setFromObject(group);
  const width = Math.max(.5, faceFrame.cabinetWidth || faceFrame.width);
  const scale = width * 1.18 / (originalBounds.max.x - originalBounds.min.x);
  const shelfY = faceFrame.cabinetBottom - .035;
  const depthScale = (Math.max(.55, faceFrame.depth || .8) + .15) / 1.2;
  const transform = new THREE.Matrix4().makeScale(scale, scale, depthScale);
  transform.setPosition(-worldX(692.5) * scale, shelfY - originalBounds.max.y * scale, .06 + .30 * depthScale);
  const fallback = texture ? null : new THREE.MeshStandardMaterial({ color: 0x8b5930, metalness: .60, roughness: .32 });
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.applyMatrix4(transform);
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
    if (fallback) mesh.material = mesh.material.map(m => m.isMeshBasicMaterial ? fallback : m);
  });
  group.position.set(0, 0, 0); group.scale.set(1, 1, 1);
  const platform = group.getObjectByName('project-large-platform');
  if (platform) {
    // Preserve the complete warm photographic tabletop and front lip. Make the
    // narrow source-image receiver rail a genuine closed mounting part instead
    // of replacing the whole upward metal surface with a flat brown material.
    const originalTop = worldY(759), originalBottom = worldY(791), railY = worldY(768.5);
    const railZ = -1.50 + ((originalTop - railY) / (originalTop - originalBottom)) * 1.20;
    const railGeometry = new THREE.BoxGeometry(6.57, .09, .12);
    railGeometry.translate(worldX(695.5), railY, railZ + .04);
    const rail = meshWithProjection(railGeometry, materials(texture || null), PROJECT_SOURCE, 'selected-closed-mounting-rail');
    rail.geometry.applyMatrix4(transform);
    rail.geometry.computeVertexNormals(); rail.geometry.computeBoundingBox(); rail.geometry.computeBoundingSphere();
    if (fallback) rail.material = rail.material.map(m => m.isMeshBasicMaterial ? fallback : m);
    group.add(rail);
    group.updateMatrixWorld(true);
    // Seat the platform directly against the cabinet's own base. The curved
    // reference platform is tilted in depth, so its AABB top alone is not the
    // contact surface at the visible front edge of the receiver.
    const contactZ = 0;
    const desiredY = faceFrame.cabinetBottom + .008;
    const ray = new THREE.Raycaster(new THREE.Vector3(0, desiredY + 1, contactZ), new THREE.Vector3(0, -1, 0));
    const contact = ray.intersectObject(platform, false)[0];
    if (contact) group.position.y += desiredY - contact.point.y;
  }
  const bounds = new THREE.Box3().setFromObject(group);
  group.userData.selectedSupport = true;
  group.userData.closedPhysicalSolids = true;
  group.userData.sourceTelevisionIndex = index;
  group.userData.photographicBake = !!texture;
  return { group, bounds, shelfY: shelfY + group.position.y, columnBottomY: bounds.min.y, width, depth: bounds.max.z - bounds.min.z, sourceRect: { ...PROJECT_SOURCE } };
}
