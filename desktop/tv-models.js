import * as THREE from 'three';

/*
 * Single-view reconstruction of the ten different CRT cabinets in the Figma
 * sculpture. These are closed, deep meshes: front bezels surround real holes,
 * the holes have recessed walls, the cabinets have sides and rear caps, and
 * glass and controls are separate geometry. No image plane contains a whole TV.
 *
 * The supplied source texture is a photographic colour / illumination bake.
 * Its UVs are projected once in the reference camera, then stored on vertices;
 * moving a cabinet therefore moves its texture with it. Hidden rear surfaces
 * use ordinary PBR materials. A single picture does not specify the true backs
 * or a physically separated albedo / light solution for arbitrary new lighting.
 *
 * Public coordinates: design pixels, 1920 × 956. Mesh coordinates: 100 px/unit,
 * +Y up, camera on +Z. Each returned group is positioned at its bounds' centre.
 * `screenGeometry` is already local to that group, including its physical depth.
 * Replace `screen.material` to display a VideoTexture; do not reposition it.
 */

const SCALE = 100;
const HOME_SOURCE = { x: 244, y: 54, width: 1432, height: 849 };
const PROJECT_SOURCE = { x: 0, y: 59, width: 1530, height: 897 };
const mix = THREE.MathUtils.lerp;

const CABINETS = [
  {
    name: 'top-left-portable', bounds: [571, 133, 790, 296],
    front: [[572, 157], [728, 135], [730, 279], [572, 286]],
    screen: [[595, 173], [711, 160], [712, 249], [594, 261]],
    shift: [70, 20], depth: .8, taper: .90, radius: .055, slope: .30,
    rearColor: 0x3c3428, shoulders: .35, coverage: 3,
    boxes: [[603, 279, 62, 4, .018]],
  },
  {
    name: 'top-centre-polystar', bounds: [825, 72, 1078, 278],
    front: [[826, 75], [1075, 75], [1075, 270], [825, 270]],
    screen: [[848, 94], [1054, 94], [1062, 227], [844, 227]],
    shift: [0, 6], depth: 1.0, taper: .91, radius: .028, slope: 0,
    rearColor: 0x2f302d, frontTopBulge: 1.5,
    knobs: [[915, 252, 2.1], [938, 252, 2.0], [960, 252, 2.2], [984, 252, 2.1], [994, 254, 2.7]],
    boxes: [[950, 273, 249, 9, .035]],
  },
  {
    name: 'top-right-two-dial', bounds: [1108, 127, 1353, 301],
    front: [[1171, 129], [1341, 150], [1340, 294], [1177, 286]],
    screen: [[1194, 149], [1291, 164], [1296, 245], [1194, 232]],
    shift: [-75, 16], depth: 1.0, taper: .90, radius: .052, slope: -.38,
    rearColor: 0x433b28, shoulders: .35, frontTopBulge: 2,
    knobs: [[1325, 174, 8.0], [1324, 210, 8.9], [1270, 279, 2.9], [1289, 280, 3.0], [1308, 281, 3.0], [1325, 283, 3.0]],
    boxes: [[1348, 196, 6, 68, .055]],
  },
  {
    name: 'middle-left-red-portable', bounds: [388, 331, 638, 518],
    front: [[412, 334], [565, 333], [541, 511], [389, 503]],
    screen: [[407, 383], [530, 380], [528, 488], [401, 483]],
    shift: [94, 14], depth: 1.0, taper: .79, radius: .085, slope: .30,
    rearColor: 0x592312, shoulders: .38, frontLeftBulge: 8, frontTopBulge: 2,
    knobs: [[492, 345, 3.4], [508, 349, 7.2], [537, 346, 9.1]],
  },
  {
    name: 'middle-inner-left-metal', bounds: [669, 334, 924, 521],
    front: [[679, 340], [884, 336], [884, 515], [670, 508]],
    screen: [[687, 353], [867, 351], [873, 468], [683, 466]],
    shift: [53, 16], depth: .9, taper: .88, radius: .052, slope: .13,
    rearColor: 0x302d25, shoulders: .42, frontTopBulge: 3,
    knobs: [[852, 494, 10.0], [748, 503, 2.4], [764, 503, 2.4], [781, 503, 2.4], [801, 503, 2.1]],
  },
  {
    name: 'middle-inner-right-cream', bounds: [982, 351, 1247, 523],
    front: [[1039, 353], [1238, 356], [1243, 517], [1044, 518]],
    screen: [[1055, 378], [1189, 380], [1190, 469], [1053, 468]],
    shift: [-72, 11], depth: 1.0, taper: .88, radius: .079, slope: -.19, coverage: 2.5,
    rearColor: 0x55472a, shoulders: .35, frontTopBulge: 1.5,
    knobs: [[1133, 508, 2.8], [1158, 509, 4.4], [1181, 509, 4.3], [1205, 509, 4.1], [1225, 509, 4.0]],
    boxes: [[1228, 382, 10, 3, .016], [1228, 391, 10, 3, .016], [1228, 400, 10, 3, .016], [1228, 409, 10, 3, .016], [1228, 418, 10, 3, .016], [1228, 427, 10, 3, .016]],
  },
  {
    name: 'middle-right-silver', bounds: [1273, 327, 1542, 525],
    front: [[1343, 328], [1528, 334], [1539, 515], [1353, 525]],
    screen: [[1362, 345], [1509, 350], [1526, 464], [1370, 465]],
    shift: [-86, 13], depth: 1.0, taper: .87, radius: .055, slope: -.33,
    rearColor: 0x393a38, shoulders: .38, frontTopBulge: 4, frontRightBulge: 6,
    knobs: [[1395, 493, 1.35], [1401, 493, 1.35], [1407, 493, 1.35], [1414, 493, 1.35]],
  },
  {
    name: 'bottom-left-sony', bounds: [430, 560, 770, 825],
    front: [[445, 561], [707, 577], [689, 803], [431, 780]],
    screen: [[463, 594], [674, 607], [675, 771], [456, 754]],
    shift: [77, 3], depth: 1.3, taper: .86, radius: .105, slope: .23, rearBulgeX: 20, rearTiltY: 23,
    rearColor: 0x17191a, shoulders: .33, frontTopBulge: 10, frontLeftBulge: 2,
    boxes: [[513, 785, 45, 3, .015]],
  },
  {
    name: 'bottom-centre-sphere', bounds: [813, 569, 1108, 855],
    front: [[813, 569], [1108, 569], [1108, 855], [813, 855]],
    screen: [[870, 638], [1046, 640], [1054, 768], [877, 769]],
    sphere: { centre: [960, 711], radii: [147, 142, 130], z: -.28 },
    depth: 2.6, rearColor: 0x121512,
    knobs: [[1008, 836, 3.5], [1017, 836, 3.4], [1027, 836, 3.2]],
  },
  {
    name: 'bottom-right-blaupunkt', bounds: [1180, 572, 1467, 827],
    front: [[1263, 585], [1456, 575], [1458, 802], [1262, 817]],
    screen: [[1296, 610], [1436, 598], [1432, 725], [1295, 742]],
    shift: [-93, -10], depth: 1.3, taper: .93, radius: .024, slope: -.31,
    rearColor: 0x292824, shoulders: .28,
    knobs: [[1359, 782, 3.0], [1368, 781, 3.0], [1377, 780, 3.0], [1386, 779, 3.0], [1396, 778, 3.0]],
    boxes: [[1203, 620, 44, 15, .08]],
  },
];

const PROJECT_CABINET = {
  name: 'project-open-controls-crt', bounds: [358, 166, 1029, 767],
  front: [[361, 168], [1025, 166], [1029, 754], [358, 756]],
  screen: [[424, 232], [962, 232], [962, 632], [424, 632]],
  screenRadius: .035,
  shift: [-2, 3], depth: 2.45, taper: .84, radius: .018, slope: 0,
  rearColor: 0x312820, coverage: 0,
  feet: [
    [[367, 751], [393, 751], [393, 768], [369, 768]],
    [[1002, 750], [1024, 750], [1023, 768], [1003, 768]],
  ],
  knobs: [[405, 721, 10], [453, 719, 6.7], [495, 729, 3.4], [512, 729, 3.4], [531, 729, 3.4], [567, 729, 3.4], [588, 729, 3.4], [609, 729, 3.4], [630, 729, 3.4], [649, 729, 3.4], [767, 721, 5.0], [795, 720, 5.0], [831, 722, 5.0], [859, 720, 5.0], [975, 723, 15]],
  boxes: [[556, 750, 365, 13, .055]],
};

function quadPoint(quad, u, v) {
  return [
    mix(mix(quad[0][0], quad[1][0], u), mix(quad[3][0], quad[2][0], u), v),
    mix(mix(quad[0][1], quad[1][1], u), mix(quad[3][1], quad[2][1], u), v),
  ];
}

function roundedParameters(radius = .05, steps = 12) {
  const points = [];
  const r = Math.min(.30, Math.max(.001, radius));
  const corners = [[r, r, Math.PI], [1 - r, r, Math.PI * 1.5], [1 - r, 1 - r, 0], [r, 1 - r, Math.PI * .5]];
  for (let corner = 0; corner < corners.length; corner++) {
    const [x, y, a] = corners[corner];
    for (let i = 0; i <= steps; i++) {
      const angle = a + (Math.PI / 2) * i / steps;
      points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]);
    }
    const end = points[points.length - 1], [nx, ny, nextAngle] = corners[(corner + 1) % corners.length];
    const next = [nx + Math.cos(nextAngle) * r, ny + Math.sin(nextAngle) * r];
    for (let i = 1; i < steps; i++) points.push([mix(end[0], next[0], i / steps), mix(end[1], next[1], i / steps)]);
  }
  return points;
}

function contextFor(spec, texture, source) {
  const [left, top, right, bottom] = spec.bounds;
  const centre = [(left + right) / 2, (top + bottom) / 2];
  const projected = new THREE.MeshBasicMaterial({ map: texture || null, color: 0xffffff, toneMapped: false });
  const rear = new THREE.MeshStandardMaterial({ color: spec.rearColor, roughness: .64, metalness: .12 });
  const inside = new THREE.MeshStandardMaterial({ color: 0x050605, roughness: .35 });
  const group = new THREE.Group();
  group.name = spec.name;
  group.position.set((centre[0] - 960) / SCALE, (478 - centre[1]) / SCALE, 0);
  const zAt = (x) => ((x - centre[0]) / SCALE) * (spec.slope || 0);
  const localPoint = (x, y, z = zAt(x)) => [(x - centre[0]) / SCALE, (centre[1] - y) / SCALE, z];
  const sourceUV = (x, y) => [(x - source.x) / source.width, 1 - (y - source.y) / source.height];
  return { spec, centre, source, group, projected, rear, inside, zAt, localPoint, sourceUV };
}

function meshFrom(context, positions, indices, material, name, screenUV = null) {
  const xyz = [], uv = [];
  for (let i = 0; i < positions.length; i++) {
    const [x, y, z] = positions[i];
    xyz.push(...context.localPoint(x, y, z));
    uv.push(...(screenUV ? screenUV[i] : context.sourceUV(x, y)));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  context.group.add(mesh);
  return mesh;
}

function loft(context, rings, material, name, reverse = false) {
  const positions = rings.flat(), indices = [], count = rings[0].length;
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < count; i++) {
      const a = j * count + i, b = j * count + (i + 1) % count, c = a + count, d = b + count;
      // Image Y points down; front annuli and cavity walls use reverse=true.
      if (reverse) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  return meshFrom(context, positions, indices, material, name);
}

function cap(context, contour, material, name, reverse = false, apex = null) {
  const centre = apex || contour.reduce((p, q) => p.map((v, i) => v + q[i] / contour.length), [0, 0, 0]);
  const positions = [centre, ...contour], indices = [];
  for (let i = 0; i < contour.length; i++) {
    const a = i + 1, b = (i + 1) % contour.length + 1;
    if (reverse) indices.push(0, a, b); else indices.push(0, b, a);
  }
  return meshFrom(context, positions, indices, material, name);
}

function buildBoxShell(context) {
  const { spec, zAt } = context;
  const outerUV = roundedParameters(spec.radius), innerUV = roundedParameters(spec.screenRadius ?? .075);
  const coverage = spec.coverage === undefined ? 2 : spec.coverage;
  const outer = outerUV.map(([u, v]) => {
    const [x, y] = quadPoint(spec.front, u, v);
    // Preserve the narrow rounded cabinet lips that extend just outside the
    // four fitted front-plane corners, without moving the aperture or glass.
    return [
      x + (u - .5) * 2 * coverage + Math.sin(Math.PI * v) * (u * (spec.frontRightBulge || 0) - (1 - u) * (spec.frontLeftBulge || 0)),
      y + (v - .5) * 2 * coverage - Math.sin(Math.PI * u) * (1 - v) * (spec.frontTopBulge || 0),
    ];
  });
  const aperture = innerUV.map(([u, v]) => quadPoint(spec.screen, u, v));
  const front = outer.map(([x, y]) => [x, y, zAt(x)]);
  const inner = aperture.map(([x, y]) => [x, y, zAt(x) - .024]);
  const bevel = outer.map(([x, y], i) => [mix(x, aperture[i][0], .06), mix(y, aperture[i][1], .06), zAt(x) + .025]);
  loft(context, [front, bevel, inner], context.projected, 'cabinet-front-bezel', true);

  const c = quadPoint(spec.front, .5, .5), [sx, sy] = spec.shift;
  const shoulder = outer.map(([x, y]) => [
    mix(c[0], x, .99) + sx * (spec.shoulders || .18),
    mix(c[1], y, .99) + sy * .20,
    zAt(x) - spec.depth * .23,
  ]);
  const back = outer.map(([x, y], i) => [
    mix(c[0], x, spec.taper) + sx + Math.sin(Math.PI * outerUV[i][1]) * (spec.rearBulgeX || 0),
    mix(c[1], y, spec.taper) + sy + (outerUV[i][1] - .5) * (spec.rearTiltY || 0),
    zAt(x) - spec.depth,
  ]);
  // Both visible and hidden cabinet sides are actual geometry. The projection
  // is kept on the sides seen by the source camera; the rear cap is unbaked PBR.
  loft(context, [front, shoulder, back], context.projected, 'cabinet-side-walls');
  cap(context, back, context.rear, 'cabinet-rear-cap', true);
  const recess = aperture.map(([x, y]) => [x, y, zAt(x) - .15]);
  loft(context, [inner, recess], context.projected, 'screen-aperture-walls', true);
  cap(context, recess, context.inside, 'screen-cavity-back');
}

function sphereZ(spec, x, y) {
  const { centre: [cx, cy], radii: [rx, ry, rz], z } = spec.sphere;
  return z + Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2)) * rz / SCALE;
}

function densifyContour(contour, maximumEdge = 5) {
  const dense = [];
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    const divisions = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maximumEdge));
    for (let j = 0; j < divisions; j++) dense.push([mix(a[0], b[0], j / divisions), mix(a[1], b[1], j / divisions)]);
  }
  return dense;
}

function buildSphereShell(context) {
  const { spec } = context;
  const { centre: [cx, cy], radii: [rx, ry, rz], z: cz } = spec.sphere;
  // A rounded rectangle still has long straight edges. Sample those before
  // projecting the contour onto an ellipse; otherwise the sphere's top becomes
  // a chord between its two upper corners and loses about 38 px of silhouette.
  const aperture = densifyContour(roundedParameters(.11).map(([u, v]) => quadPoint(spec.screen, u, v)));
  const outer = aperture.map(([x, y]) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, length = Math.hypot(dx, dy);
    return [cx + dx / length * rx, cy + dy / length * ry, cz];
  });
  const frontRings = [];
  for (let j = 0; j <= 16; j++) {
    const t = j / 16;
    frontRings.push(outer.map(([ox, oy], i) => {
      const x = mix(ox, aperture[i][0], t), y = mix(oy, aperture[i][1], t);
      return [x, y, sphereZ(spec, x, y) - t ** 12 * .02];
    }));
  }
  loft(context, frontRings, context.projected, 'ellipsoid-front-shell', true);
  const rearRings = [];
  for (let j = 0; j < 22; j++) {
    const angle = Math.PI / 2 + (Math.PI / 2) * j / 22;
    rearRings.push(outer.map(([x, y]) => [cx + (x - cx) * Math.sin(angle), cy + (y - cy) * Math.sin(angle), cz + Math.cos(angle) * rz / SCALE]));
  }
  loft(context, rearRings, context.rear, 'ellipsoid-rear-shell');
  cap(context, rearRings[rearRings.length - 1], context.rear, 'ellipsoid-rear-pole', true, [cx, cy, cz - rz / SCALE]);
  const inner = frontRings[frontRings.length - 1];
  const recess = aperture.map(([x, y]) => [x, y, .15]);
  loft(context, [inner, recess], context.projected, 'ellipsoid-aperture-walls', true);
  cap(context, recess, context.inside, 'ellipsoid-screen-cavity-back');

  // The Videosphere's rectangular receiver / control plinth has its own depth.
  const foot = { ...spec, name: 'sphere-control-plinth', front: [[850, 815], [1056, 815], [1054, 847], [850, 847]], screen: [[854, 819], [1052, 819], [1050, 843], [854, 843]], radius: .06, shift: [0, -8], taper: .96, depth: .52, slope: 0 };
  const fc = { ...context, spec: foot, zAt: () => .20 };
  const contour = roundedParameters(.06).map(([u, v]) => {
    const [x, y] = quadPoint(foot.front, u, v); return [x, y, .20];
  });
  const back = contour.map(([x, y]) => [x, y - 8, -.32]);
  cap(fc, contour, context.projected, 'sphere-control-front');
  loft(fc, [contour, back], context.projected, 'sphere-control-sides');
  cap(fc, back, context.rear, 'sphere-control-rear', true);

  // A flared, closed foot supports the receiver rather than ending its body at
  // the narrow control panel. It is distinct from the sculpture's metal shelf.
  const baseQuad = [[850, 811], [1072, 811], [1094, 853], [828, 853]];
  const baseFront = roundedParameters(.055).map(([u, v]) => {
    const [x, y] = quadPoint(baseQuad, u, v); return [x, y, .065];
  });
  const baseBack = baseFront.map(([x, y]) => [x, y - 10, -.56]);
  cap(context, baseFront, context.projected, 'sphere-foot-front');
  loft(context, [baseFront, baseBack], context.projected, 'sphere-foot-side-walls');
  cap(context, baseBack, context.rear, 'sphere-foot-rear-cap', true);
}

function buildGlass(context) {
  const { spec, zAt } = context;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const width = (distance(spec.screen[0], spec.screen[1]) + distance(spec.screen[3], spec.screen[2])) / 2;
  const height = (distance(spec.screen[0], spec.screen[3]) + distance(spec.screen[1], spec.screen[2])) / 2;
  const nx = Math.max(48, Math.ceil(width / 3)), regularRows = Math.max(40, Math.ceil(height / 3));
  const radius = spec.screenRadius ?? (spec.sphere ? .11 : .075);
  const rowValues = Array.from({ length: regularRows + 1 }, (_, i) => i / regularRows);
  // The first few pixels of a rounded corner have the most curvature. Uniform
  // grid rows alone leave visible straight chamfers there, even in a dense CRT.
  for (let i = 0; i <= 16; i++) {
    const v = radius * (1 - Math.cos(i * Math.PI / 32));
    rowValues.push(v, 1 - v);
  }
  const rows = [...new Set(rowValues.map(v => Math.round(v * 1e10) / 1e10))].sort((a, b) => a - b);
  const ny = rows.length - 1, positions = [], uv = [], indices = [];
  for (let row = 0; row <= ny; row++) {
    const v = rows[row];
    const edge = Math.min(v, 1 - v);
    const inset = edge < radius ? radius - Math.sqrt(Math.max(0, radius ** 2 - (radius - edge) ** 2)) : 0;
    for (let col = 0; col <= nx; col++) {
      const u = mix(inset, 1 - inset, col / nx);
      const [x, y] = quadPoint(spec.screen, u, v);
      const bulge = .065 * (1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2);
      const z = spec.sphere ? sphereZ(spec, x, y) + .016 : zAt(x) + .018 + bulge;
      positions.push([x, y, z]); uv.push([u, 1 - v]);
      if (col < nx && row < ny) {
        const a = row * (nx + 1) + col, b = a + 1, c = a + nx + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const glass = new THREE.MeshBasicMaterial({ color: 0x050605, toneMapped: false });
  const screen = meshFrom(context, positions, indices, glass, 'screen', uv);
  screen.userData.screen = true;
  screen.castShadow = false;
  return screen;
}

function addSupportFeet(context) {
  for (const [i, quad] of (context.spec.feet || []).entries()) {
    const front = roundedParameters(.08).map(([u, v]) => {
      const [x, y] = quadPoint(quad, u, v); return [x, y, context.zAt(x) - .025];
    });
    const back = front.map(([x, y, z]) => [x, y - 3, z - .38]);
    cap(context, front, context.projected, `support-foot-${i}-front`);
    loft(context, [front, back], context.projected, `support-foot-${i}-side-walls`);
    cap(context, back, context.rear, `support-foot-${i}-rear-cap`, true);
  }
}

function projectedPrimitive(context, geometry, x, y, z, name) {
  const p = geometry.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const gx = x + p.getX(i) * SCALE, gy = y - p.getY(i) * SCALE;
    const [u, v] = context.sourceUV(gx, gy);
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geometry, context.projected);
  mesh.position.set(...context.localPoint(x, y, z));
  mesh.name = name;
  mesh.castShadow = true; mesh.receiveShadow = true;
  context.group.add(mesh);
  return mesh;
}

function addControls(context) {
  const { spec, zAt } = context;
  for (const [i, [x, y, r]] of (spec.knobs || []).entries()) {
    const depth = Math.max(.018, Math.min(.065, r / 110));
    const geometry = new THREE.CylinderGeometry(r / SCALE, r / SCALE * .96, depth, 28, 1);
    geometry.rotateX(Math.PI / 2);
    projectedPrimitive(context, geometry, x, y, spec.sphere ? .23 : zAt(x) + depth / 2 + .016, `control-knob-${i}`);
  }
  for (const [i, [x, y, w, h, depth]] of (spec.boxes || []).entries()) {
    const geometry = new THREE.BoxGeometry(w / SCALE, h / SCALE, depth);
    projectedPrimitive(context, geometry, x, y, zAt(x) + depth / 2 + .008, `control-panel-${i}`);
  }
}

function build(spec, texture, source) {
  const context = contextFor(spec, texture, source);
  if (spec.sphere) buildSphereShell(context); else buildBoxShell(context);
  addSupportFeet(context);
  addControls(context);
  const screen = buildGlass(context);
  context.group.userData = {
    reconstructed: true,
    photographicBake: true,
    referenceBounds: [...spec.bounds],
    referenceScreen: spec.screen.map(p => [...p]),
  };
  const [left, top, right, bottom] = spec.bounds;
  return {
    group: context.group,
    screen,
    screenGeometry: screen.geometry,
    screenPosition: new THREE.Vector3(),
    screenQuad: spec.screen.map(p => [...p]),
    screenRadius: spec.screenRadius ?? (spec.sphere ? .11 : .075),
    bounds: { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top },
    pivot: { x: context.centre[0], y: context.centre[1] },
    sourceRect: { ...source },
    depth: spec.depth,
  };
}

export function buildTelevision(index, { texture } = {}) {
  if (!Number.isInteger(index) || !CABINETS[index]) throw new RangeError(`Unknown television ${index}`);
  return build(CABINETS[index], texture, HOME_SOURCE);
}

export function buildProjectTelevision({ texture } = {}) {
  return build(PROJECT_CABINET, texture, PROJECT_SOURCE);
}

export const televisionCount = CABINETS.length;

/* Selected views use a separate rectified cabinet. The approved Home builders
 * above are intentionally unchanged: a camera cannot undo perspective already
 * encoded into a photographed quadrilateral. Rectification removes that baked
 * XY skew while keeping the source image attached through inverse-photo UVs.
 */
function photographedQuadTransform(quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const perspective = Math.abs(dx3) + Math.abs(dy3) > 1e-9;
  const g = perspective ? (dx3 * dy2 - dx2 * dy3) / determinant : 0;
  const h = perspective ? (dx1 * dy3 - dx3 * dy1) / determinant : 0;
  const matrix = new THREE.Matrix3().set(x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1);
  const inverse = matrix.clone().invert();
  const point = (m, x, y) => {
    const p = new THREE.Vector3(x, y, 1).applyMatrix3(m);
    return [p.x / p.z, p.y / p.z];
  };
  return { toPhoto: (u, v) => point(matrix, u, v), toUnit: (x, y) => point(inverse, x, y) };
}

function originalFaceFrame(spec) {
  const centre = [(spec.bounds[0] + spec.bounds[2]) / 2, (spec.bounds[1] + spec.bounds[3]) / 2];
  if (spec.sphere) {
    return {
      origin: new THREE.Vector3((spec.sphere.centre[0] - centre[0]) / SCALE, (centre[1] - spec.sphere.centre[1]) / SCALE, spec.sphere.z + spec.sphere.radii[2] / SCALE),
      right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0, 0, 1),
      width: spec.sphere.radii[0] * 2 / SCALE, height: spec.sphere.radii[1] * 2 / SCALE,
    };
  }
  const corners = spec.front.map(([x, y]) => new THREE.Vector3((x - centre[0]) / SCALE, (centre[1] - y) / SCALE, (x - centre[0]) / SCALE * (spec.slope || 0)));
  const normal = new THREE.Vector3(-(spec.slope || 0), 0, 1).normalize();
  const right = corners[1].clone().sub(corners[0]).add(corners[2].clone().sub(corners[3])).normalize();
  const up = normal.clone().cross(right).normalize();
  // Remove numerical drift so makeBasis(right, up, normal) is a pure rotation.
  right.copy(up).cross(normal).normalize();
  return {
    origin: corners.reduce((p, q) => p.addScaledVector(q, .25), new THREE.Vector3()), right, up, normal,
    width: (corners[0].distanceTo(corners[1]) + corners[3].distanceTo(corners[2])) / 2,
    height: (Math.abs(corners[0].clone().sub(corners[3]).dot(up)) + Math.abs(corners[1].clone().sub(corners[2]).dot(up))) / 2,
  };
}

function alignFocusedControlsWithBezel(model, photoAtLocal) {
  const bezel = model.group.getObjectByName('cabinet-front-bezel');
  if (!bezel) return;
  const geometry = bezel.geometry, uv = geometry.attributes.uv, p = geometry.attributes.position, index = geometry.index;
  const triangles = [];
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const q = ids.map(j => [uv.getX(j), uv.getY(j)]);
    const denominator = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]);
    if (Math.abs(denominator) < 1e-14) continue;
    triangles.push({ ids, q, denominator, minU: Math.min(...q.map(v => v[0])), maxU: Math.max(...q.map(v => v[0])), minV: Math.min(...q.map(v => v[1])), maxV: Math.max(...q.map(v => v[1])) });
  }
  const mapped = (triangle, u, v) => {
    const { q, denominator, ids } = triangle;
    const a = ((q[1][1] - q[2][1]) * (u - q[2][0]) + (q[2][0] - q[1][0]) * (v - q[2][1])) / denominator;
    const b = ((q[2][1] - q[0][1]) * (u - q[2][0]) + (q[0][0] - q[2][0]) * (v - q[2][1])) / denominator;
    const c = 1 - a - b;
    return { a, b, c, point: new THREE.Vector3().fromBufferAttribute(p, ids[0]).multiplyScalar(a).addScaledVector(new THREE.Vector3().fromBufferAttribute(p, ids[1]), b).addScaledVector(new THREE.Vector3().fromBufferAttribute(p, ids[2]), c) };
  };
  const locate = (u, v) => {
    for (const triangle of triangles) {
      if (u < triangle.minU - 1e-6 || u > triangle.maxU + 1e-6 || v < triangle.minV - 1e-6 || v > triangle.maxV + 1e-6) continue;
      const hit = mapped(triangle, u, v);
      if (Math.min(hit.a, hit.b, hit.c) >= -1e-5) return { triangle, ...hit };
    }
    return null;
  };
  model.group.traverse(mesh => {
    if (!mesh.isMesh || !/^control-(knob|panel)-/.test(mesh.name)) return;
    const [u, v] = photoAtLocal(mesh.position.x, mesh.position.y), centre = locate(u, v);
    if (!centre) return; // A foot/trim outside the bezel keeps its authored pose.
    const vertices = mesh.geometry.attributes.position, sourceUV = mesh.geometry.attributes.uv;
    for (let i = 0; i < vertices.count; i++) {
      const a = sourceUV.getX(i), b = sourceUV.getY(i);
      const hit = locate(a, b) || mapped(centre.triangle, a, b);
      vertices.setXYZ(i, hit.point.x - mesh.position.x, hit.point.y - mesh.position.y, vertices.getZ(i) + hit.point.z);
    }
    vertices.needsUpdate = true;
    mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  });
}

function addFocusedInnerLiner(model, spec, original, centre) {
  const radius = spec.screenRadius ?? (spec.sphere ? .11 : .075), parameters = roundedParameters(radius, 32);
  const rawWidth = (Math.hypot(...original.screen[1].map((x, i) => x - original.screen[0][i])) + Math.hypot(...original.screen[2].map((x, i) => x - original.screen[3][i]))) / 2;
  const rawHeight = (Math.hypot(...original.screen[3].map((x, i) => x - original.screen[0][i])) + Math.hypot(...original.screen[2].map((x, i) => x - original.screen[1][i]))) / 2;
  const width = spec.screen[1][0] - spec.screen[0][0], height = spec.screen[3][1] - spec.screen[0][1];
  const padX = 6 * width / rawWidth, padY = 6 * height / rawHeight;
  const contours = [[], [], [], []];
  for (const [u, v] of parameters) {
    const [x, y] = quadPoint(spec.screen, u, v);
    let nx, ny;
    if (v < 1e-7) { nx = 0; ny = -1; }
    else if (v > 1 - 1e-7) { nx = 0; ny = 1; }
    else if (u < 1e-7) { nx = -1; ny = 0; }
    else if (u > 1 - 1e-7) { nx = 1; ny = 0; }
    else { nx = (u - (u < .5 ? radius : 1 - radius)) / radius; ny = (v - (v < .5 ? radius : 1 - radius)) / radius; }
    const inner = [x + nx * padX / 600, y + ny * padY / 600], outer = [x + nx * padX, y + ny * padY];
    const z = (point, offset) => (spec.sphere ? sphereZ(spec, ...point) : 0) + offset;
    contours[0].push([...outer, z(outer, .035)]); contours[1].push([...inner, z(inner, .014)]);
    contours[2].push([...outer, z(outer, .015)]); contours[3].push([...inner, z(inner, -.006)]);
  }
  const count = parameters.length, indices = [];
  const join = (first, second, reverse) => {
    for (let i = 0; i < count; i++) {
      const a = first * count + i, b = first * count + (i + 1) % count, c = second * count + i, d = second * count + (i + 1) % count;
      if (reverse) indices.push(a, c, b, b, c, d); else indices.push(a, b, c, b, d, c);
    }
  };
  join(0, 1, true); join(2, 3, false); join(0, 2, false); join(1, 3, true);
  const context = contextFor(spec, null, HOME_SOURCE);
  context.group = model.group;
  context.localPoint = (x, y, z) => [(x - centre[0]) / SCALE, (centre[1] - y) / SCALE, z];
  const material = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: .77, metalness: .02 });
  const liner = meshFrom(context, contours.flat(), indices, material, 'focused-closed-crt-inner-liner');
  liner.userData.closedPhysicalSolid = true;
  liner.userData.sourcePixelsPadding = 6;
  context.projected.dispose(); context.rear.dispose(); context.inside.dispose();
}

/**
 * A genuine, independently built front-facing version of the chosen Home CRT.
 * group.position=0 and scale=1. Camera integration should orient this group with
 * homeFaceFrame, then fly the actual camera onto faceFrame.normal.
 * Screen UV: u→right, v→up, 0–1 covers the rounded glass itself. uvReference is
 * already the source photograph projection and must not be recomputed from XY.
 */
export function buildFocusedTelevision(index, { texture } = {}) {
  if (!Number.isInteger(index) || !CABINETS[index]) throw new RangeError(`Unknown television ${index}`);
  const original = CABINETS[index], homeFaceFrame = originalFaceFrame(original);
  const spec = JSON.parse(JSON.stringify(original));
  const transform = photographedQuadTransform(original.front);
  const width = homeFaceFrame.width * SCALE, height = homeFaceFrame.height * SCALE;
  let toCanonical, toPhoto, centre;
  if (original.sphere) {
    // The sphere already has a symmetric physical body; retain its shell and
    // distinctive flared receiver foot while squaring only its glass aperture.
    centre = [...original.sphere.centre];
    toCanonical = (x, y) => [x, y];
    toPhoto = (x, y) => [x, y];
    const q = original.screen;
    const left = (q[0][0] + q[3][0]) / 2, right = (q[1][0] + q[2][0]) / 2;
    const top = (q[0][1] + q[1][1]) / 2, bottom = (q[2][1] + q[3][1]) / 2;
    spec.screen = [[left, top], [right, top], [right, bottom], [left, bottom]];
  } else {
    centre = [960, 478];
    toCanonical = (x, y) => {
      const [u, v] = transform.toUnit(x, y);
      return [centre[0] + (u - .5) * width, centre[1] + (v - .5) * height];
    };
    toPhoto = (x, y) => transform.toPhoto((x - centre[0]) / width + .5, (y - centre[1]) / height + .5);
    spec.front = [[960 - width / 2, 478 - height / 2], [960 + width / 2, 478 - height / 2], [960 + width / 2, 478 + height / 2], [960 - width / 2, 478 + height / 2]];
    spec.bounds = [960 - width / 2, 478 - height / 2, 960 + width / 2, 478 + height / 2];
    const q = original.screen.map(p => toCanonical(...p));
    const left = (q[0][0] + q[3][0]) / 2, right = (q[1][0] + q[2][0]) / 2;
    const top = (q[0][1] + q[1][1]) / 2, bottom = (q[2][1] + q[3][1]) / 2;
    spec.screen = [[left, top], [right, top], [right, bottom], [left, bottom]];
    spec.slope = 0; spec.shift = [0, 0];
    spec.rearBulgeX = 0; spec.rearTiltY = 0;
    if (original.knobs) spec.knobs = original.knobs.map(([x, y, radius]) => {
      const [cx, cy] = toCanonical(x, y), a = toCanonical(x + radius, y), b = toCanonical(x, y + radius);
      const r = (Math.hypot(a[0] - cx, a[1] - cy) + Math.hypot(b[0] - cx, b[1] - cy)) / 2;
      return [cx, cy, r];
    });
    if (original.boxes) spec.boxes = original.boxes.filter(([x, y]) => {
      const [u] = transform.toUnit(x, y); return u >= -.015 && u <= 1.015;
    }).map(([x, y, w, h, d]) => {
      const [cx, cy] = toCanonical(x, y), a = toCanonical(x - w / 2, y), b = toCanonical(x + w / 2, y), c = toCanonical(x, y - h / 2), e = toCanonical(x, y + h / 2);
      return [cx, cy, Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(e[0] - c[0], e[1] - c[1]), d];
    });
    if (original.feet) spec.feet = original.feet.map(q => q.map(p => toCanonical(...p)));
  }
  const model = build(spec, texture, HOME_SOURCE);
  if (original.sphere) {
    const oldCentre = [(original.bounds[0] + original.bounds[2]) / 2, (original.bounds[1] + original.bounds[3]) / 2];
    for (const mesh of model.group.children) mesh.position.add(new THREE.Vector3((oldCentre[0] - centre[0]) / SCALE, (centre[1] - oldCentre[1]) / SCALE, 0));
  }
  model.group.position.set(0, 0, 0);
  model.group.name = `focused-canonical-${original.name}`;
  model.group.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  model.group.traverse(mesh => {
    if (!mesh.isMesh || mesh === model.screen) return;
    const position = mesh.geometry.attributes.position, uv = [];
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const [x, y] = toPhoto(centre[0] + point.x * SCALE, centre[1] - point.y * SCALE);
      uv.push((x - HOME_SOURCE.x) / HOME_SOURCE.width, 1 - (y - HOME_SOURCE.y) / HOME_SOURCE.height);
    }
    mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  });
  if (!original.sphere) {
    // The rectified aperture is deliberately square, so the outer homography
    // alone cannot bind its inner edge to the photographed opening exactly.
    // These rings keep identical topology: use their source-shell UVs vertex
    // for vertex to prevent a strip of the old film leaking beside live video.
    const reference = contextFor(original, texture, HOME_SOURCE);
    buildBoxShell(reference);
    for (const name of ['cabinet-front-bezel', 'screen-aperture-walls']) {
      const sourceMesh = reference.group.getObjectByName(name), target = model.group.getObjectByName(name);
      if (sourceMesh && target && sourceMesh.geometry.attributes.uv.count === target.geometry.attributes.uv.count) {
        target.geometry.setAttribute('uv', sourceMesh.geometry.attributes.uv.clone());
      }
    }
    const temporaryMaterials = new Set();
    reference.group.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) temporaryMaterials.add(m);
    });
    temporaryMaterials.forEach(m => m.dispose());
  }
  if (!original.sphere) alignFocusedControlsWithBezel(model, (x, y) => {
    const [px, py] = toPhoto(centre[0] + x * SCALE, centre[1] - y * SCALE);
    return [(px - HOME_SOURCE.x) / HOME_SOURCE.width, 1 - (py - HOME_SOURCE.y) / HOME_SOURCE.height];
  });
  addFocusedInnerLiner(model, spec, original, centre);
  const mediaUV = model.screen.geometry.attributes.uv, referenceUV = [];
  for (let i = 0; i < mediaUV.count; i++) {
    const [x, y] = quadPoint(original.screen, mediaUV.getX(i), 1 - mediaUV.getY(i));
    referenceUV.push((x - HOME_SOURCE.x) / HOME_SOURCE.width, 1 - (y - HOME_SOURCE.y) / HOME_SOURCE.height);
  }
  model.screen.geometry.setAttribute('uvReference', new THREE.Float32BufferAttribute(referenceUV, 2));
  const bounds = new THREE.Box3().setFromObject(model.group), size = bounds.getSize(new THREE.Vector3());
  const screenWidth = (spec.screen[1][0] - spec.screen[0][0]) / SCALE;
  const screenHeight = (spec.screen[3][1] - spec.screen[0][1]) / SCALE;
  model.faceFrame = {
    origin: new THREE.Vector3(0, 0, original.sphere ? original.sphere.z + original.sphere.radii[2] / SCALE : 0),
    right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0, 0, 1),
    width: width / SCALE, height: height / SCALE, screenWidth, screenHeight,
    cabinetBottom: bounds.min.y, cabinetWidth: size.x, cabinetHeight: size.y, depth: size.z, bounds: bounds.clone(),
  };
  model.homeFaceFrame = homeFaceFrame;
  model.localBounds = bounds.clone();
  model.physicalScreenAspect = model.screenAspect = screenWidth / screenHeight;
  model.sourceScreenQuad = original.screen.map(p => [...p]);
  model.screenQuad = original.screen.map(p => [...p]);
  model.group.userData.focusedCanonical = true;
  model.group.userData.sourceTelevisionIndex = index;
  model.group.userData.rectifiedPhotographicUV = true;
  return model;
}
