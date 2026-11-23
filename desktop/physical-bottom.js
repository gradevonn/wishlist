import * as THREE from 'three';

// Bottom-row proportions are fitted to the visible reference, while every
// casing, recess, control and rear remains real, independently lit geometry.
export const BOTTOM_TV_SPECS = {
  7: { name: 'black-rounded-sony', brand: 'SONY', dimensions: { width: 2.849, height: 2.28, depth: 2.078 },
    screen: { width: 2.376, height: 1.585, x: 0, y: 1.228, radius: .088 },
    radius: .15, bevel: .045, taper: .86, color: 0x252621, finish: 'black', recess: .082 },
  8: { name: 'retro-orb', brand: 'JVC', dimensions: { width: 2.85, height: 2.75, depth: 1.72 },
    screen: { width: 1.7813333333, height: 1.336, x: 0, y: 1.443, radius: .142 },
    radius: .13, bevel: .025, taper: .86, color: 0x20221e, finish: 'orb', recess: .035 },
  9: { name: 'black-blaupunkt', brand: 'BLAUPUNKT', dimensions: { width: 2.30, height: 2.30, depth: 1.90 },
    screen: { width: 1.8533333333, height: 1.39, x: 0, y: 1.419, radius: .094 },
    radius: .035, bevel: .022, taper: .91, color: 0x292923, finish: 'black', recess: .15 },
};

const mix = THREE.MathUtils.lerp;

function loop(width, height, radius, z = 0, cx = 0, cy = 0, segments = 12, edgeSteps = 10) {
  const r = Math.min(width / 2 - 1e-5, height / 2 - 1e-5, radius), points = [];
  const corners = [[-width / 2 + r, height / 2 - r, Math.PI / 2], [-width / 2 + r, -height / 2 + r, Math.PI],
    [width / 2 - r, -height / 2 + r, Math.PI * 1.5], [width / 2 - r, height / 2 - r, 0]];
  for (let corner = 0; corner < 4; corner++) {
    const [x, y, a] = corners[corner];
    for (let j = 0; j <= segments; j++) {
      const angle = a + j / segments * Math.PI / 2;
      points.push([cx + x + Math.cos(angle) * r, cy + y + Math.sin(angle) * r, z]);
    }
    const end = points.at(-1), [nx, ny, na] = corners[(corner + 1) % 4];
    const next = [cx + nx + Math.cos(na) * r, cy + ny + Math.sin(na) * r];
    for (let j = 1; j < edgeSteps; j++) points.push([mix(end[0], next[0], j / edgeSteps), mix(end[1], next[1], j / edgeSteps), z]);
  }
  return points;
}

class Solid {
  constructor() { this.positions = []; this.uv = []; this.indices = []; this.groups = []; }
  point(p, u = 0, v = 0) { const i = this.positions.length / 3; this.positions.push(...p); this.uv.push(u, v); return i; }
  strip(rings, material = 0, reverse = false) {
    const n = rings[0].length, base = this.positions.length / 3, start = this.indices.length;
    rings.forEach((ring, j) => { if (ring.length !== n) throw new Error('Bottom TV loft ring mismatch'); ring.forEach((p, i) => this.point(p, i / n, j / (rings.length - 1))); });
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
      const a = base + j * n + i, b = base + j * n + (i + 1) % n, c = a + n, d = b + n;
      this.indices.push(...(reverse ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
    }
    this.groups.push({ start, count: this.indices.length - start, materialIndex: material }); return this;
  }
  cap(ring, material = 0, reverse = false, centre) {
    centre ||= ring.reduce((a, p) => a.map((v, i) => v + p[i] / ring.length), [0, 0, 0]);
    const minX = Math.min(...ring.map(p => p[0])), maxX = Math.max(...ring.map(p => p[0]));
    const minY = Math.min(...ring.map(p => p[1])), maxY = Math.max(...ring.map(p => p[1]));
    const uv = p => [(p[0] - minX) / Math.max(1e-6, maxX - minX), (p[1] - minY) / Math.max(1e-6, maxY - minY)];
    const c = this.point(centre, ...uv(centre)), base = this.positions.length / 3, start = this.indices.length;
    ring.forEach(p => this.point(p, ...uv(p)));
    for (let i = 0; i < ring.length; i++) this.indices.push(...(reverse ? [c, base + (i + 1) % ring.length, base + i] : [c, base + i, base + (i + 1) % ring.length]));
    this.groups.push({ start, count: this.indices.length - start, materialIndex: material }); return this;
  }
  finish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); geometry.setIndex(this.indices);
    for (const group of this.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  }
}

function attach(group, builder, materials, name, H, adjustNormals) {
  const source = builder.finish();
  adjustNormals?.(source);
  const geometry = H.physicalGrainUV ? H.physicalGrainUV(source) : source;
  if(geometry!==source)source.dispose();
  return H.mesh(group,geometry,materials,name);
}

// The clear opening of a CRT rolls in towards the corners on both axes.
// Use the same contour on the glass and on the tool that forms the aperture.
function tubePoint(x, y, screen, horizontalRoll, verticalRoll) {
  const u = (x - screen.x) / (screen.width / 2);
  const v = (y - screen.y) / (screen.height / 2);
  return [x - horizontalRoll * u * v * v, y - verticalRoll * v * u * u];
}

// The mold and the glass share these very same XYZ vertices. A rounded tube
// has less depth at its corners than at the midpoints of its four edges.
function pictureTube(screen, rollX, rollY, crest, sagX, sagY, upperSag = 0) {
  const { width, height, x: cx, y: cy, radius } = screen;
  const z = (x, y) => crest - sagX * ((x - cx) / (width / 2)) ** 2
    - (sagY + (y > cy ? upperSag : 0)) * ((y - cy) / (height / 2)) ** 2;
  const contour = (dw = 0, dh = 0, dr = 0, lift = 0) =>
    loop(width + dw, height + dh, radius + dr, 0, cx, cy).map(([x, y]) => {
      const [px, py] = tubePoint(x, y, screen, rollX, rollY);
      return [px, py, z(px, py) + lift];
    });
  const edge = contour(), rings = [edge];
  for (let layer = 1; layer < 24; layer++) {
    const t = 1 - layer / 24;
    rings.push(edge.map(([x, y]) => {
      const px = mix(cx, x, t), py = mix(cy, y, t);
      return [px, py, z(px, py)];
    }));
  }
  const geometry = new Solid().strip(rings).cap(rings.at(-1), 0, false, [cx, cy, crest]).finish();
  const { position, uv, normal } = geometry.attributes, n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) - cx, y = position.getY(i) - cy;
    uv.setXY(i, .5 + x / width, .5 + y / height);
    n.set(8 * sagX * x / (width * width), 8 * (sagY + (y > 0 ? upperSag : 0)) * y / (height * height), 1).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  return { edge, contour, crest, geometry };
}

// One gently crowned casting. Its surface height depends on position on the
// cabinet, so it remains continuous across the corners of the square bezel.
function sonyFaceZ(x, y) {
  const halfWidth = BOTTOM_TV_SPECS[7].dimensions.width / 2;
  const u = x / halfWidth, v = (y - 1.195) / 1.085;
  // A bilaterally symmetric tool: the home camera supplies perspective.
  // The shallow crown breaks into a compact exterior roll instead of a
  // pillow-shaped fascia. No photographed skew is baked into the cabinet.
  return .104 - .030 * u * u - .014 * v - .035 * v * v
    - .120 * u ** 14 - (v < 0 ? .040 * v ** 22 : .112 * v ** 8);
}

function sonyShell(group, spec, m, H, tube) {
  const { width: w, height: h, depth: d } = spec.dimensions, s = spec.screen;
  const bottom = .11, cy = (bottom + h) / 2;
  function contour(width, height, radius, z, rearFactor = 0) {
    return loop(width, height, radius, z, 0, cy).map(([x, y]) => {
      const v = (y - cy) / ((h - bottom) / 2);
      const waist = 1 - (v > 0 ? .031 + rearFactor * .057 : .032 + rearFactor * .004) * v * v;
      const px = x * waist;
      // The top of the molding slopes up onto the rear cover. The lower
      // corners finish above the inset chassis molding and its support feet.
      const py = y - Math.max(0, v) ** 3 * .074 * (1 - rearFactor)
        + Math.max(0, -v) ** 5 * .032 * (1 - rearFactor)
        - .050 * Math.max(0, -v) ** 10 * (1 - (x / (w / 2)) ** 2) ** 2 * (1 - rearFactor);
      return [px, py, z + sonyFaceZ(px, py) * (1 - rearFactor)];
    });
  }
  const front = contour(w - .065, h - bottom - .05, .115, 0);
  const skin = [front];
  for (let j = 1; j <= 6; j++) {
    const a = j / 6 * Math.PI / 2;
    skin.push(contour(w - .065 + Math.sin(a) * .065,
      h - bottom - .05 + Math.sin(a) * .05, .115 + .025 * Math.sin(a),
      -.085 * (1 - Math.cos(a))));
  }
  skin.push(contour(w * .997, (h - bottom) * .996, .155, -d * .34, .35));
  skin.push(contour(w * .952, (h - bottom) * .963, .16, -d * .70, .72));
  skin.push(contour(w * spec.taper, (h - bottom) * .89, .13, -d + .042, 1));
  skin.push(contour(w * spec.taper - .045, (h - bottom) * .89 - .044, .105, -d, 1));
  const shoulder = tube.contour(.150, .165, .052);
  const seal = tube.contour(.026, .030, .011, .016);
  const skirt = tube.edge.map(([x, y, z]) => [x, y, z - .11]);
  const face = [front];
  for (let j = 1; j <= 9; j++) {
    const t = j / 9;
    face.push(front.map(([x, y], i) => {
      const px = mix(x, shoulder[i][0], t), py = mix(y, shoulder[i][1], t);
      return [px, py, sonyFaceZ(px, py)];
    }));
  }
  // A small roundover at the inner edge runs tangent to the broad face,
  // then drops sharply to the independent black gasket around the tube.
  for (let j = 1; j <= 10; j++) {
    const theta = j * Math.PI / 20, t = Math.sin(theta);
    face.push(shoulder.map(([x, y], i) => {
      const [endX, endY, endZ] = seal[i];
      const px = mix(x, endX, t), py = mix(y, endY, t);
      return [px, py, sonyFaceZ(px, py) + (endZ - sonyFaceZ(endX, endY)) * (1 - Math.cos(theta))];
    }));
  }
  const g = new Solid();
  g.strip(skin, 0, true).cap(skin.at(-1), 1, true);
  g.strip(face, 3).strip([seal, tube.edge, skirt], 2).cap(skirt, 2);
  m.body.color.setHex(0x282a2b); m.body.roughness = .48; m.body.specularIntensity = .43; m.body.metalness = .012;
  m.body.bumpScale = .00075; m.body.clearcoat = .04;
  m.front.color.setHex(0x292b2d); m.front.roughness = .39; m.front.clearcoat = .06;
  // Preserve the graphite mold's independent roughness and lacquer fields.
  // At close range its tiny pores break up the softbox across the satin face.
  m.front.bumpScale = .00081;
  const polishedEdge = m.front.clone();
  polishedEdge.name = 'Sony smooth rolled cabinet edge'; polishedEdge.roughness = .25; polishedEdge.bumpScale = .00063;
  polishedEdge.clearcoat = .095; polishedEdge.clearcoatRoughness = .16;
  polishedEdge.specularIntensity = .65; polishedEdge.envMapIntensity = .90;
  const lid = m.body.clone();
  lid.name = 'Sony fine-stippled non-glare top';
  lid.roughness = .57; lid.clearcoat = .018; lid.envMapIntensity = .105;
  attach(group, g, [m.body, m.rear, m.rubber, m.front, polishedEdge, lid], 'sony-closed-slanted-molded-cabinet', H, geometry => {
    // The narrow exterior roll catches a sharper highlight than the stippled
    // case. The continuous surface keeps its normals across the finish change.
    const side = geometry.groups[0], rollCount = front.length * 6 * 6;
    // The upper and lower covers have the same closed casting. The upper
    // cover has a finer, glare-resistant grain, up to its polished front edge.
    const index = geometry.index.array, top = [], flanks = [];
    for (let k = rollCount; k < side.count; k += 3) {
      const normals = geometry.attributes.normal;
      const isTop = Math.min(normals.getY(index[k]), normals.getY(index[k + 1]), normals.getY(index[k + 2])) > .60;
      (isTop ? top : flanks).push(index[k], index[k + 1], index[k + 2]);
    }
    index.set(flanks, rollCount); index.set(top, rollCount + flanks.length);
    geometry.groups.splice(0, 1, { start: 0, count: rollCount, materialIndex: 4 },
      { start: rollCount, count: flanks.length, materialIndex: 0 },
      { start: rollCount + flanks.length, count: top.length, materialIndex: 5 });
    // The exterior roll and face share a tangent even at the split between
    // their two paint finishes. Set this normal from the mold's actual slope.
    const { position, normal } = geometry.attributes, n = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i);
      if (Math.abs(position.getZ(i) - sonyFaceZ(x, y)) > .00001) continue;
      const halfWidth = spec.dimensions.width / 2;
      const u = x / halfWidth, v = (y - 1.195) / 1.085;
      const verticalSlope = v < 0 ? .880 * v ** 21 : .896 * v ** 7;
      n.set((.060 * u + 1.680 * u ** 13) / halfWidth,
        (.014 + .070 * v + verticalSlope) / 1.085, 1).normalize();
      normal.setXYZ(i, n.x, n.y, n.z);
    }
  });
  const chassis = m.rear.clone();
  chassis.name = 'Sony charcoal support plinth';
  chassis.color.setHex(0x111215); chassis.roughness = .74; chassis.clearcoat = 0;
  chassis.specularIntensity = .30; chassis.envMapIntensity = .25;
  const widthRatio = w / 2.71, depthRatio = d / 1.57;
  H.box(group, chassis, 'sony-inset-bottom-chassis', 0, .094, -.61 * depthRatio, 2.34 * widthRatio, .136, 1.08 * depthRatio, .048, .015);
  for (const x of [-.87, .87]) H.box(group, m.rubber, 'sony-integrated-support-foot', x * widthRatio, .05, -.61 * depthRatio, .42, .10, .78 * depthRatio, .028, .009);
}

function sonySpeaker(parent, m, H) {
  // This acoustic insert occupies the lower rear quadrant of the flank.
  // The front edge sweeps upward toward the back, above a flattened sill.
  const shape = new THREE.Shape();
  shape.moveTo(-.975, -.64);
  shape.bezierCurveTo(-1.01, -.86, -.74, -.97, -.39, -.98);
  shape.bezierCurveTo(.06, -1.02, .57, -.97, .77, -.83);
  shape.bezierCurveTo(.97, -.64, 1.01, .19, .93, .69);
  shape.bezierCurveTo(.92, .93, .88, 1.01, .69, .99);
  shape.bezierCurveTo(.19, .91, -.76, .17, -.975, -.64);
  // Shape proportions belong to the casting; keep the punched holes circular.
  const path = shape.getPoints(14).slice(0, -1).map(p => new THREE.Vector2(p.x * .94, p.y * .79));
  const contour = (sx, sy, z, cx = 0, cy = 0) =>
    path.map(p => [cx + p.x * sx, cy + p.y * sy, z]);
  const sheetZ = .037, rx = .418, ry = .348;
  const rim = contour(rx + .012, ry + .009, sheetZ + .007);
  const edge = contour(rx, ry, sheetZ), felt = contour(rx, ry, sheetZ - .012);
  const flare = [contour(.65, .545, -.175, -.070, .046), contour(.603, .512, -.092, -.060, .035),
    contour(.538, .483, -.025, -.040, .029), contour(.496, .431, .021, -.025, .017),
    contour(.456, .387, .044, -.010, .006), rim];
  // Pull the hidden tooling flange back from the front wall at its widest
  // point; the visible fairing joins the flank well behind the CRT gasket.
  for (const ring of flare) for (const point of ring) {
    if (point[0] < -.45) point[0] = -.45 + .30 * (point[0] + .45);
  }
  const casework = new Solid();
  casework.strip(flare).cap(flare[0], 0, true).strip([rim, edge, felt], 1).cap(felt, 2);
  // This formed acoustic housing has a matte lower return. Its warmer finish
  // rolls around the lower edge with the molding, independent of the cabinet
  // bevel underneath it. Interpolate pigment across the continuous casting.
  const housing = m.body.clone();
  housing.name = 'Sony matte graphite acoustic housing with bronzed lower return';
  housing.color.setHex(0xffffff); housing.vertexColors = true;
  housing.roughness = .61; housing.clearcoat = .025; housing.metalness = .035;
  housing.specularIntensity = .30; housing.envMapIntensity = .72;
  attach(parent, casework, [housing, m.rear, m.rubber], 'sony-swept-acoustic-fairing', H, geometry => {
    const normal = geometry.attributes.normal, position = geometry.attributes.position;
    const rgb = new Float32Array(position.count * 3);
    const base = new THREE.Color(0x292b2d), bronze = new THREE.Color(0x4d4437), tint = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const inclination = -normal.getY(i);
      const weight = THREE.MathUtils.smoothstep(inclination, .06, .53)
        * (1 - .62 * THREE.MathUtils.smoothstep(inclination, .69, .92))
        * THREE.MathUtils.smoothstep(-position.getY(i), .14, .36);
      tint.lerpColors(base, bronze, weight).toArray(rgb, 3 * i);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  });

  // Stamping exposes a narrow rim of bronze at each opening in the black
  // acoustic mesh. The eight-sided punched edge is under two pixels wide
  // in the home camera. The original triangle budget is preserved per cell.
  const pitch = .0225, hole = pitch * .275, outer = [], mouth = [], inner = [], back = [];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, x = Math.cos(a), y = Math.sin(a), k = 1 / Math.max(Math.abs(x), Math.abs(y));
    outer.push([x * k * pitch / 2, y * k * pitch / 2, 0]);
    mouth.push([x * pitch * .34, y * pitch * .34, 0]);
    inner.push([x * hole, y * hole, -.0016]); back.push([x * hole, y * hole, -.0056]);
  }
  function inside(x, y) {
    let result = false;
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const a = path[i], b = path[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  }
  const tile = new Solid().strip([outer, mouth]).strip([mouth, inner, back], 1).finish(), offsets = [];
  const angle = .34, cos = Math.cos(angle), sin = Math.sin(angle);
  for (let row = -21; row <= 21; row++) for (let col = -24; col <= 24; col++) {
    const gridX = (col + .5 * (row & 1)) * pitch, gridY = row * pitch;
    const x = cos * gridX - sin * gridY, y = sin * gridX + cos * gridY;
    if (inside(x / (rx - pitch / 2), y / (ry - pitch / 2))) offsets.push([x, y]);
  }
  const sheet = m.body.clone();
  sheet.name = 'Sony perforated acoustic sheet';
  sheet.color.setHex(0x262527); sheet.metalness = .22; sheet.roughness = .46;
  sheet.bumpMap = null; sheet.roughnessMap = null; sheet.map = null;
  const stamp = sheet.clone();
  stamp.name = 'Sony exposed acoustic perforation lips';
  stamp.color.setHex(0x93794e); stamp.metalness = .56; stamp.roughness = .30;
  const cells = new THREE.InstancedMesh(tile, [sheet, stamp], offsets.length), matrix = new THREE.Matrix4().makeRotationZ(angle);
  offsets.forEach(([x, y], i) => cells.setMatrixAt(i, matrix.setPosition(x, y, sheetZ)));
  cells.name = 'sony-real-circular-speaker-perforations'; cells.castShadow = false; cells.receiveShadow = false;
  cells.instanceMatrix.needsUpdate = true; cells.userData.realSpeakerOpenings = true; parent.add(cells);
}

// The four raised letters are extruded solids. All measurements here are in
// the units of a 48-unit cap height, before the badge is scaled to the fascia.
function sonyWordmark(group, material, H) {
  const shapes = [];
  function polygon(points) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath(); return shape;
  }
  const letterS = new THREE.Shape();
  letterS.moveTo(3, 2); letterS.lineTo(3, 17); letterS.lineTo(7.2, 17);
  letterS.bezierCurveTo(9, 7, 23, 4.5, 35, 5.2);
  letterS.bezierCurveTo(48, 5.6, 52, 13.9, 41, 16.3);
  letterS.lineTo(20, 20.5); letterS.bezierCurveTo(-6, 25.2, -.5, 47, 22, 49);
  letterS.bezierCurveTo(32, 50.3, 43, 48.0, 49.7, 45.4);
  letterS.lineTo(51, 48.7); letterS.lineTo(54.2, 48.7); letterS.lineTo(54.2, 35);
  letterS.lineTo(50, 35); letterS.bezierCurveTo(46, 43.7, 33.3, 45.4, 23.4, 44.3);
  letterS.bezierCurveTo(12, 43, 11.3, 36.4, 19.4, 34.7); letterS.lineTo(42, 30.2);
  letterS.bezierCurveTo(65, 25.9, 63, 3.1, 40.4, .5);
  letterS.bezierCurveTo(28.2, -.9, 17.4, .8, 9.1, 4.7);
  letterS.lineTo(7.3, 1.9); letterS.closePath(); shapes.push(letterS);
  const letterO = new THREE.Shape(), hole = new THREE.Path();
  letterO.absellipse(94, 25, 32, 24.6, 0, Math.PI * 2, false);
  hole.absellipse(94, 25, 16.9, 19.8, 0, Math.PI * 2, true);
  letterO.holes.push(hole); shapes.push(letterO);
  shapes.push(polygon([[129,48],[151,48],[179.5,15],[179.5,42.3],[171.8,43.7],[171.8,48],
    [194,48],[194,43.7],[186.3,42.3],[186.3,1.3],[175.4,1.3],[143.2,37.9],[143.2,7.2],
    [151.3,5.8],[151.3,1.3],[129,1.3],[129,5.8],[136.3,7.2],[136.3,42.4],[129,43.7]]));
  shapes.push(polygon([[195,48],[226,48],[226,43.8],[218.6,42.7],[231.1,25.6],
    [243.7,42.7],[236.9,43.8],[236.9,48],[259.0,48],[259,43.8],[252.8,42.7],[234.4,20.6],
    [234.4,7.1],[243.7,5.7],[243.7,1.3],[211.0,1.3],[211,5.7],[220.8,7.1],[220.8,20.4],
    [202.0,42.7],[195,43.8]]));
  const geometry = new THREE.ExtrudeGeometry(shapes, {depth: 1.8, bevelEnabled: true,
    bevelSize: .36, bevelThickness: .38, bevelSegments: 2, curveSegments: 14, steps: 1});
  geometry.translate(-130, -25, 0);
  geometry.scale(.00112, .00099, .0011);
  return H.mesh(group, geometry, material, 'sony-cast-metal-wordmark', 0, .333, .0024);
}

function sonyDetails(group, spec, m, H, resources) {
  const widthRatio = spec.dimensions.width / 2.71, depthRatio = spec.dimensions.depth / 1.57;
  const fittings = H.fixture(group, 'sony-formed-front-fittings', 0, 0, 0);
  const alloy = m.silver.clone();
  alloy.name = 'Sony warm nickel lettering'; alloy.color.setHex(0xcac5b4);
  alloy.metalness = .53; alloy.roughness = .36; alloy.bumpMap = null; alloy.roughnessMap = null;
  sonyWordmark(fittings, alloy, H);
  // Small raised Trinitron emblem above its two-line signature.
  const mark = new THREE.Shape();
  mark.moveTo(-.045, -.016); mark.lineTo(-.020, .025); mark.lineTo(.009, .025);
  mark.lineTo(.025, .038); mark.lineTo(.052, .038); mark.lineTo(.031, .010);
  mark.lineTo(.018, .010); mark.lineTo(.022, .019); mark.lineTo(.001, .015);
  mark.lineTo(-.009, -.001); mark.lineTo(-.023, -.001); mark.lineTo(-.020, .008);
  mark.lineTo(-.033, -.009); mark.lineTo(.018, -.009); mark.lineTo(.014, -.016); mark.closePath();
  const emblem = new THREE.ExtrudeGeometry(mark, {depth: .0016, bevelEnabled: false});
  H.mesh(fittings, emblem, alloy, 'sony-cast-trinitron-emblem', -1.035 * widthRatio, 2.148, .0015);
  H.label(fittings, 'Trinitron', -1.040 * widthRatio, 2.112, .0016, .020, 0xb5b0a1, resources);

  const panel = m.front.clone();
  panel.name = 'Fine grain graphite switch door'; panel.color.setHex(0x212222);
  panel.roughness = .53; panel.clearcoat = .055;
  const keys = H.fixture(fittings, 'sony-lower-key-bank', -.095, .197, 0);
  H.box(keys, m.rubber, 'sony-fascia-parting-line', 0, 0, -.0050, 1.075, .131, .018, .036, .004);
  H.box(keys, panel, 'sony-flush-lower-control-fascia', 0, .001, -.0010, 1.064, .119, .019, .030, .004);
  H.box(keys, m.rubber, 'sony-oval-control-recess', -.005, -.004, .0068, .442, .052, .014, .023, .004);
  for (const [index, x] of [-.146, -.001, .144].entries()) {
    H.box(keys, m.rear, 'sony-low-travel-key', x, -.005, .0175, .111, .035, .016, .011, .004);
    H.box(keys, alloy, 'sony-key-tactile-mark', x, -.004, .0255, index === 1 ? .020 : .012, .0048, .0022, .0013, .0006);
  }
  H.label(keys, 'POWER', -.410, -.003, .0090, .015, 0x96968c, resources);
  H.cylinder(keys, m.dark, 'sony-power-key', -.315, -.004, .010, .013, .005, 24);
  H.box(keys, m.dark, 'sony-remote-receiver', .380, .001, .009, .048, .022, .006, .009, .002);
  H.cylinder(keys, alloy, 'sony-standby-indicator-ring', .454, .001, .008, .0105, .005, 24);
  H.cylinder(keys, m.rubber, 'sony-standby-indicator-core', .454, .001, .011, .0070, .003, 24);
  // All control relief is measured from the same curved casting as the
  // picture tube. Clone cached primitives before forming individual parts.
  group.updateMatrixWorld(true);
  const p = new THREE.Vector3(), inverse = new THREE.Matrix4();
  fittings.traverse(part => {
    if (!part.isMesh) return;
    if (part.userData.printedMark) {
      p.setFromMatrixPosition(part.matrixWorld);
      part.position.z += sonyFaceZ(p.x, p.y);
      return;
    }
    const geometry = part.geometry.clone(), positions = geometry.attributes.position;
    inverse.copy(part.matrixWorld).invert();
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
      p.z += sonyFaceZ(p.x, p.y);
      p.applyMatrix4(inverse);
      positions.setXYZ(i, p.x, p.y, p.z);
    }
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    part.geometry = geometry;
  });
  // The lower flank swells around the acoustic chamber. Its perforated face
  // tips toward the front, and the back of the fairing sinks into the cabinet.
  const speaker = H.fixture(group, 'sony-flush-sidewall-acoustic-face', 1.351 * widthRatio, .797, -.645 * depthRatio,
    new THREE.Vector3(1, .040, .12));
  sonySpeaker(speaker, m, H);
}

function orbShell(group, spec, m, H, tube) {
  const { width, height, depth } = spec.dimensions, s = spec.screen;
  const rx = width / 2, ry = 1.27, cy = height - ry, cz = -.845, frontDepth = .875, rearDepth = depth + cz;
  // The lower cheeks retain their width as the ball meets its receiver.
  const cheekScale = v => {
    if(v>-.42)return 1;
    // Shallow, almost vertical cheek below the sill, tangent to the upper ball.
    const sphere=rx*Math.sqrt(Math.max(.0001,1-v*v)), y=cy+ry*v;
    const neck=1.018+.112*y, d=sphere-neck;
    return Math.min(1.85,(sphere+neck+Math.sqrt(d*d+.0025))/(2*sphere));
  };
  const surfaceZ = (x, y, rear = false) => {
    const v = (y - cy) / ry;
    return cz + (rear ? -rearDepth : frontDepth) *
      Math.sqrt(Math.max(0, 1 - (x / (rx * cheekScale(v))) ** 2 - v * v));
  };
  // Half of the tooling profile, from the upper arch to the lower sill.
  // Following a ray through it pairs every point on the hood with its own
  // point on the glass. This also avoids crossed quads around the cheeks.
  const half = [[0, 2.399], [.400, 2.366], [.715, 2.284], [.917, 2.155],
    [1.038, 1.905], [1.128, 1.490], [1.109, 1.148], [1.053, .922],
    [.973, .765], [.871, .675], [.560, .591], [0, .531]];
  const path = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  const profile = new THREE.CatmullRomCurve3(path.map(([x, y]) => new THREE.Vector3(x, y, 0)), true);
  const samples = profile.getPoints(384).map(p => [p.x, p.y - s.y]);
  const rim = tube.edge.map(([x, y]) => {
    const dx = x - s.x, dy = y - s.y;
    for (let j = 0; j < samples.length - 1; j++) {
      const [ax, ay] = samples[j], [bx, by] = samples[j + 1], ex = bx - ax, ey = by - ay;
      const det = dx * ey - dy * ex;
      if (Math.abs(det) < 1e-8) continue;
      const t = (ax * ey - ay * ex) / det, u = (ax * dy - ay * dx) / det;
      if (t <= 0 || u < -1e-6 || u > 1.000001) continue;
      const px = dx * t * 1.035, py = s.y + dy * t;
      // Even the deepest corner of the hood projects in front of the tube.
      // The lower sill has a gently flared leading edge.
      const v = (py - s.y) / .95;
      return [px, py, -.132 - .030 * (px / 1.13) ** 2 + .073 * v * v - .013 * v];
    }
    throw new Error('Unclosed CRT hood section');
  });
  const edge = rim.map(([x, y, z]) => [x * 1.017, s.y + (y - s.y) * 1.017, z - .013]);
  const roundover = rim.map(([x, y, z]) => [x * 1.008, s.y + (y - s.y) * 1.008, z - .001]);
  // Redistribute samples towards equal angular spacing over the dome. At
  // the lip the original points still mate exactly with the glass surround.
  const angles = [];
  for (const [x,y] of edge) {
    let angle = Math.atan2((y-cy)/ry, x/rx);
    while (angles.length && angle < angles.at(-1)) angle += 2*Math.PI;
    angles.push(angle);
  }
  const even = angles.map((a,i) => angles[0] + i * 2*Math.PI / angles.length);
  const shellPoint = (azimuth, latitude) => {
    const v = Math.sin(azimuth)*Math.cos(latitude);
    return [rx*cheekScale(v)*Math.cos(azimuth)*Math.cos(latitude), cy+ry*v, cz+frontDepth*Math.sin(latitude)];
  };
  const equator = even.map(a => shellPoint(a,0));
  const skin = [];
  for (let j=0; j<=32; j++) {
    const t = j/32, weight = t*t*(3-2*t);
    skin.push(edge.map(([x,y,z],i) => {
      const v = (y-cy)/ry, u = x/(rx*cheekScale(v));
      const endLatitude = Math.acos(Math.min(1,Math.hypot(u,v)));
      let endAzimuth = Math.atan2(v,u);
      endAzimuth += Math.round((angles[i]-endAzimuth)/(2*Math.PI))*2*Math.PI;
      const p = shellPoint(mix(even[i],endAzimuth,weight),t*endLatitude);
      p[2] += (z-surfaceZ(x,y))*weight;
      return p;
    }));
  }
  const back = [equator];
  for (let j=1; j<28; j++) {
    const a = -j/28*Math.PI/2;
    back.push(even.map(phi => {
      const p = shellPoint(phi,a); p[2] = cz + rearDepth*Math.sin(a); return p;
    }));
  }
  const seal = tube.contour(.037, .034, .012, .018);
  // The reference hood has a narrow lip followed by a broad, almost
  // straight reveal. Keep the lip and the reveal separate at their crease;
  // smoothing the whole transition made the shell read as a rubber torus.
  const returnLip = rim.map((p, i) => [
    mix(p[0], seal[i][0], .035), mix(p[1], seal[i][1], .035), p[2] - .012,
  ]);
  const revealEnd = rim.map((p, i) => [
    mix(p[0], seal[i][0], .91), mix(p[1], seal[i][1], .91), seal[i][2] + .013,
  ]);
  const surround = [returnLip, revealEnd];
  const cavity = tube.edge.map(([x, y, z]) => [x, y, z - .10]);
  const g = new Solid();
  g.strip([...skin, roundover, rim], 0).strip(back, 0, true).cap(back.at(-1), 0, true, [0, cy, -depth]);
  g.strip([rim, returnLip], 3).strip(surround, 1).strip([revealEnd, seal], 1)
    .strip([seal, tube.edge, cavity], 2).cap(cavity, 2);
  m.body.color.setHex(0x191917);
  m.body.roughness = .405; m.body.metalness = .025; m.body.specularIntensity = .38;
  m.body.clearcoat = .085; m.body.clearcoatRoughness = .31; m.body.envMapIntensity = .75;
  m.body.specularColor.setHex(0xffffff);
  const enamel = m.apertureLip.clone();
  enamel.name = 'Black lacquered CRT hood';
  enamel.color.setHex(0x191a19); enamel.roughness = .32; enamel.metalness = .035;
  enamel.specularIntensity = .48; enamel.envMapIntensity = .80;
  const lipFinish = enamel.clone();
  lipFinish.name = 'JVC narrow polished aperture edge';
  lipFinish.roughness = .22; lipFinish.specularIntensity = .65;
  // Cut the hooded ball above its foot. A second solid intersecting an
  // ellipsoid leaves a second jaw-line and two disjoint specular highlights.
  const joinY=.411, casting=g.finish();
  const {upper,edge:section}=H.cutCastingSection(casting,p=>p[1]-joinY);
  casting.dispose();
  const upperSurface=H.physicalGrainUV(upper);upper.dispose();
  H.mesh(group,upperSurface,[m.body,enamel,m.rubber,lipFinish],'orb-closed-ellipsoid-with-deep-integral-aperture');
  const centreZ=-.775;
  const footRings=[[.005,1.205,.010,7],[.026,1.225,.018,7],[.095,1.220,.011,7],
    [.116,1.208,.002,6.6],[.221,1.169,-.035,5.7],[.307,1.130,-.072,4.5],
    [.373,1.100,-.107,3.5]].map(([y,r,front,power])=>section.map(([x,,z])=>{
    const dz=z-centreZ,length=Math.hypot(x,dz),u=x/length,v=dz/length;
    const depth=v>0?front-centreZ:1.53+centreZ;
    const radius=(Math.abs(u/r)**power+Math.abs(v/depth)**power)**(-1/power);
    const t=THREE.MathUtils.smoothstep(y,.19,joinY);
    return [mix(radius*u,x,t),y,mix(centreZ+radius*v,z,t)];
  }));
  const baseCoat=m.body.clone();baseCoat.name='JVC moulded graphite receiver base';
  baseCoat.color.setHex(0x151615);baseCoat.roughness=.55;baseCoat.clearcoat=.035;baseCoat.specularIntensity=.36;
  const foot=new Solid().strip([...footRings,section]).cap(footRings[0],0,true);
  attach(group,foot,baseCoat,'orb-flared-bell-receiver-skirt',H);
  return { cy, surfaceZ };
}

function orbDetails(group, spec, m, H, resources, shell) {
  const panel = H.fixture(group, 'orb-receiver-console', 0, -.025, .088);
  const face = m.body.clone();
  face.name = 'JVC graphite receiver console'; face.color.setHex(0x34322e);
  face.roughness = .44; face.metalness = .13; face.clearcoat = .075; face.specularIntensity = .54;
  // Across this wide face the curved receiver must carry intermediate
  // vertices: an eight-corner box would cut across the controls as a chord.
  const mould=new Solid(), front=[], reverseFace=[];
  for(let k=0;k<=36;k++){
    const x=(k/36-.5)*1.6376, t=1-Math.min(1,(.8188-Math.abs(x))/.040);
    const inset=.021*(1-Math.sqrt(1-t*t));
    front.push([[x,.130+inset,-.024],[x,.370-inset,-.024]]);
    reverseFace.push([[x,.136+inset,-.059],[x,.364-inset,-.059]]);
  }
  for(let j=0;j<36;j++){
    const a=front[j],b=front[j+1],c=reverseFace[j],d=reverseFace[j+1];
    for(const q of [[a[0],b[0],b[1],a[1]],[d[0],c[0],c[1],d[1]],
        [c[0],d[0],b[0],a[0]],[a[1],b[1],d[1],c[1]]]){
      const v=q.map(p=>mould.point(p));mould.indices.push(v[0],v[1],v[2],v[0],v[2],v[3]);
    }
  }
  for(const j of [0,36]){
    const a=front[j],b=reverseFace[j],q=j?[a[0],b[0],b[1],a[1]]:[b[0],a[0],a[1],b[1]];
    const v=q.map(p=>mould.point(p));mould.indices.push(v[0],v[1],v[2],v[0],v[2],v[3]);
  }
  attach(panel,mould,face,'orb-recessed-receiver-control-face',H);
  H.label(panel, spec.brand, -.77, .274, -.029, .019, 0xaca591, resources);
  H.label(panel, 'COLOR', -.77, .213, -.029, .011, 0x767b6c, resources);
  H.box(panel, m.rubber, 'orb-small-left-slide-switch', -.77, .247, -.012, .13, .021, .010, .005, .001);
  H.box(panel, m.silver, 'orb-slide-tab', -.80, .247, -.012, .024, .016, .012, .004, .001);
  for (const [x, r] of [[-.55, .017], [-.43, .023], [-.29, .018]]) H.button(panel, m, x, .245, r, { metal: true, z: -.028 });
  H.box(panel, m.rubber, 'orb-tuning-window', -.02, .248, -.025, .39, .047, .012, .008, .002);
  for (let i = 0; i < 11; i++) H.box(panel, i === 5 ? m.amber : m.trim, 'orb-tuning-scale-mark', -.17 + i * .030, .248, -.016, .005, i % 5 === 0 ? .026 : .015, .004, .001, .0005);
  for (const [x, r] of [[.34, .030], [.46, .021], [.58, .023]]) H.button(panel, m, x, .245, r, { metal: false, z: -.028 });
  H.box(panel, m.agedChrome || m.trim, 'orb-recessed-vertical-slider-track', .72, .245, -.025, .035, .145, .012, .006, .002);
  H.box(panel, m.rear, 'orb-vertical-slider-tab', .72, .254, -.014, .027, .035, .012, .004, .001);
  H.box(panel, m.rubber, 'orb-small-right-rocker', .84, .25, -.023, .065, .047, .013, .006, .002);
  // A rigid cap is seated on the curved receiver at its own tangent.
  // Circular keys keep their radius when the camera moves off the front.
  H.box(panel,m.silver,'orb-tuning-dial-pointer',.105,.251,-.010,.026,.018,.012,.003,.001);
  H.box(panel,m.chrome,'orb-vertical-slider-thumb',.72,.249,-.001,.023,.129,.021,.006,.002);
  H.label(panel,'VOLUME',-.45,.304,-.022,.013,0x9f9787,resources);
  H.label(panel,'TUNING',.00,.304,-.022,.013,0xb3a590,resources);
  for (const x of [.34,.46,.58]) H.cylinder(panel,m.trim,'orb-push-key-socket',x,.245,-.029,.041,.013,32);
  const world = new THREE.Vector3(), inverse = new THREE.Matrix4();
  for (const part of panel.children) {
    if (part.name !== 'orb-recessed-receiver-control-face') {
      // Compress the layout, never the mechanics or glyphs themselves.
      part.position.x *= .89;
      const x = part.position.x;
      part.position.z -= .072 * x * x;
      part.position.y += .030 * x * x;
      const tangent = new THREE.Vector3(.144 * x, 0, 1).normalize();
      part.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent));
      continue;
    }
    panel.updateMatrixWorld(true);
    const geo = part.geometry.clone(), positions = geo.attributes.position;
    inverse.copy(part.matrixWorld).invert();
    for (let i = 0; i < positions.count; i++) {
      world.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
      world.z -= .072 * world.x ** 2;
      world.y += .030 * world.x ** 2;
      world.applyMatrix4(inverse); positions.setXYZ(i, world.x, world.y, world.z);
    }
    geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere(); part.geometry = geo;
  }
  // A curved service cover conforms to the sphere instead of floating behind it.
  const ring = Array.from({ length: 64 }, (_, i) => {
    const a = i * Math.PI * 2 / 64, x = Math.cos(a) * .38, y = shell.cy + Math.sin(a) * .38;
    return [x, y, shell.surfaceZ(x, y, true) - .008];
  });
  const underside = ring.map(([x, y, z]) => [x, y, z + .025]);
  attach(group, new Solid().strip([ring, underside]).cap(ring, 0, true, [0, shell.cy, -spec.dimensions.depth - .008]).cap(underside), m.rear,
    'orb-curved-closed-rear-service-cover', H);
  const rear = H.fixture(group, 'orb-rear-service-vents', 0, shell.cy + .04, -spec.dimensions.depth - .013, new THREE.Vector3(0, 0, -1));
  H.grille(rear, m, 0, .06, .008, .49, .20, { pitch: .021, material: m.rear });
  H.label(rear, spec.brand, 0, -.14, .009, .026, 0x8d9182, resources);
  const ports = H.fixture(group, 'orb-receiver-rear-sockets', 0, .245, -.926, new THREE.Vector3(0, 0, -1));
  H.box(ports, m.rubber, 'orb-rear-connector-recess', 0, 0, 0, .53, .105, .018, .014, .004);
  for (const x of [-.15, 0, .15]) H.cylinder(ports, m.chrome, 'orb-real-connector-barrel', x, 0, .022, .022, .025, 24);
}

function blauShell(group, spec, m, H, tube) {
  const {width:w,depth:d}=spec.dimensions, h=2.358, s=spec.screen, bottom=.08, cy=(h+bottom)/2;
  const front = loop(w - .022, h - bottom - .02, .025, 0, 0, cy);
  const shoulder = loop(w, h - bottom, .046, -.035, 0, cy);
  const collar = loop(w, h - bottom, .037, -.192, 0, cy);
  const seam = loop(w - .010, h - bottom - .010, .028, -.204, 0, cy);
  const joint = loop(w - .004, h - bottom - .006, .032, -.215, 0, cy);
  const sideFront = loop(w-.017,h-bottom-.014,.042,-.222,0,cy);
  const sideRear = loop(w-.028,h-bottom-.080,.047,-1.333,0,cy+.008);
  const folded = loop(w-.044,h-bottom-.10,.053,-1.355,0,cy+.012);
  const returnFlange = loop(w-.23,h-bottom-.32,.080,-1.373,0,cy+.016);
  const rearBell = loop(w*.88,(h-bottom)*.84,.078,-1.66,0,cy+.011);
  const back = loop(w*.83,(h-bottom)*.78,.080,-d,0,cy+.008);
  const panel = loop(2.207,1.79,.031,.016,0,1.407);
  const reveal = loop(2.18,1.767,.030,.007,0,1.407);
  const rim = loop(2.145,1.736,.033,.025,0,1.410);
  const step = loop(s.width+.19,s.height+.17,.063,.013,s.x,s.y);
  const inner = tube.contour(.087, .084, .012, .051);
  const bead = tube.contour(.030, .030, .009, .018);
  const cavity = tube.edge.map(([x, y, z]) => [x, y, z - .11]);
  const g = new Solid();
  g.strip([front, shoulder, collar], 2, true).strip([collar, seam, joint], 3, true);
  g.strip([joint,sideFront],2,true).strip([sideFront,sideRear,folded],0,true);
  g.strip([folded,returnFlange,rearBell,back],1,true).cap(back,1,true);
  g.strip([front,panel],2).strip([panel,reveal,rim],3).strip([rim,step,inner],2);
  g.strip([inner,bead,tube.edge,cavity],2).cap(cavity,2);
  m.body.color.setHex(0x36332e); m.body.roughness=.49; m.body.specularIntensity=.55;
  m.body.clearcoat=.13; m.body.clearcoatRoughness=.32;
  const bezel=m.dark.clone(), beadFinish=m.dark.clone();
  bezel.name='Blaupunkt satin graphite tube mask'; bezel.color.setHex(0x242428);
  bezel.roughness=.42;bezel.clearcoat=.13;bezel.specularIntensity=.72;bezel.envMapIntensity=.93;
  beadFinish.name='Blaupunkt graphite mould parting beads';beadFinish.color.setHex(0x333337);
  beadFinish.roughness=.34;beadFinish.metalness=.22;
  attach(group,g,[m.body,m.rear,bezel,beadFinish],'blaupunkt-closed-box-and-four-stepped-black-bezel',H);
  const brightRail=H.box(group,m.silver,'blaupunkt-thin-silver-upper-case-rail',-.018,2.327,.017,2.25,.057,.034,.016,.005);
  // The stamped rail is straight in cabinet space; tilt comes from its pose.
  const lid=loop(w-.08,1.10,.040,0).map(([x,z])=>[x,h-.010,-.714+z]);
  const lidCrown=lid.map(([x,y,z])=>[x*.985,y+.018,-.714+(z+.714)*.96]);
  attach(group,new Solid().strip([lid,lidCrown],0,true).cap(lidCrown,0,true).cap(lid),m.body,'blaupunkt-stamped-top-cover',H);
  H.box(group, m.rubber, 'blaupunkt-integral-black-bottom-plinth', 0, .04, -.63, 2.06, .08, 1.15, .020, .006);
}

function blauDetails(group, spec, m, H, resources) {
  const strip=m.dark.clone(); strip.name='Blaupunkt inset control nameplate';strip.color.setHex(0x202022);
  H.box(group,strip,'blaupunkt-brand-and-sensor-escutcheon',0,.619,.015,2.13,.126,.035,.025,.005);
  H.label(group,spec.brand,-.70,.609,.039,.043,0xd2ced3,resources);
  H.box(group, m.rubber, 'blaupunkt-small-remote-window', .12, .624, .041, .27, .035, .011, .007, .002);
  // The stamped aluminium band is folded just around the front edge. The
  // broad return belongs to the charcoal cabinet collar. Six domed caps sit above it and catch the light along their tops.
  const silver=m.silver, sheetZ=.041;
  const outline = new THREE.Shape(), half=1.147, y0=.163,y1=.474;
  outline.moveTo(-half+.012,y0);outline.lineTo(half-.012,y0);
  outline.quadraticCurveTo(half,y0,half,y0+.012);outline.lineTo(half,y1-.012);
  outline.quadraticCurveTo(half,y1,half-.012,y1);outline.lineTo(-half+.012,y1);
  outline.quadraticCurveTo(-half,y1,-half,y1-.012);outline.lineTo(-half,y0+.012);
  outline.quadraticCurveTo(-half,y0,-half+.012,y0);
  const left=-.94,right=-.48,low=.184,high=.459;
  const hole=new THREE.Path();hole.moveTo(left,low);hole.lineTo(left,high);
  hole.lineTo(right,high);hole.lineTo(right,low);hole.closePath();outline.holes.push(hole);
  const band=new THREE.ExtrudeGeometry(outline,{depth:.037,bevelEnabled:false,curveSegments:4});
  H.mesh(group,H.physicalGrainUV(band),silver,'blaupunkt-stamped-aluminium-face',0,0,sheetZ-.037);band.dispose();
  const fold=silver.clone();fold.name='Blaupunkt folded side of the aluminium fascia';fold.color.setHex(0x777577);
  for(const sign of [-1,1]) H.box(group,fold,'blaupunkt-folded-fascia-return',sign*1.145,(y0+y1)/2,-.085,.012,y1-y0,.246,.004,.001);
  // The holes are punched in the band itself. Each ring has a short bore,
  // with vertical grain continuing through the metal between the holes.
  const perforations=new Solid(),cols=35,rows=21,w=(right-left)/cols,h=(high-low)/rows;
  const quad=(a,b,c,d)=>perforations.indices.push(a,b,c,a,c,d);
  for(let j=0;j<rows;j++) for(let i=0;i<cols;i++) {
    const x=left+(i+.5)*w,y=low+(j+.5)*h;
    const outside=((i-25)/23)**2+((j-13)/16)**2>1 && i<25;
    if(outside){
      const ids=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>perforations.point([x+u*w,y+v*h,sheetZ]));
      quad(...ids);continue;
    }
    const cut=[],rim=[],bore=[];
    for(let k=0;k<8;k++){
      const a=k*Math.PI/4,c=Math.cos(a),s=Math.sin(a),l=.5/Math.max(Math.abs(c),Math.abs(s));
      cut.push(perforations.point([x+c*l*w,y+s*l*h,sheetZ]));
      rim.push(perforations.point([x+(.325*c+.07*(j%2-.5))*w,y+.35*s*h,sheetZ]));
      bore.push(perforations.point([x+(.325*c+.07*(j%2-.5))*w,y+.35*s*h,sheetZ-.005]));
    }
    for(let k=0;k<8;k++){const n=(k+1)%8;quad(cut[k],cut[n],rim[n],rim[k]);quad(rim[k],rim[n],bore[n],bore[k]);}
  }
  // The apertures have flat metal lands surrounding their sharp punched walls.
  // Split normals at their mouths instead of rounding the entire sheet.
  const formed=perforations.finish(),flat=formed.toNonIndexed();flat.computeVertexNormals();
  const metalFace=H.physicalGrainUV(flat);formed.dispose();flat.dispose();
  const grille=H.mesh(group,metalFace,silver,'blaupunkt-punched-aluminium-grille');
  grille.castShadow=false;grille.receiveShadow=false;
  H.box(group,m.rubber,'blaupunkt-acoustic-felt',(left+right)/2,(low+high)/2,sheetZ-.015,right-left,high-low,.009,.003,.001);
  const caps = m.silver.clone();
  caps.name = 'Brushed aluminium domed key caps';
  caps.color.setHex(0xdbd9d9); caps.metalness = .72; caps.roughness = .29;
  const capProfile = [[0, 0], [.031, 0], [.036, .008], [.035, .019], [.030, .027], [.019, .032], [0, .035]];
  const capGeometry = new THREE.LatheGeometry(capProfile.map(([r, z]) => new THREE.Vector2(r, z)), 32);
  capGeometry.rotateX(Math.PI / 2);
  for (const x of [-.01, .103, .216, .329, .442, .555]) {
    H.cylinder(group, m.rubber, 'blaupunkt-key-socket', x, .335, .047, .043, .020, 40);
    H.mesh(group, capGeometry, caps, 'blaupunkt-domed-channel-key', x, .335, .059);
  }
  H.box(group, m.rubber, 'blaupunkt-power-rocker-slot', .94, .346, .044, .115, .035, .013, .005, .002);
  H.box(group, m.silver, 'blaupunkt-recessed-power-rocker', .961, .346, .055, .037, .016, .014, .004, .001);
  H.box(group, m.blackPanel || m.dark, 'blaupunkt-lower-auxiliary-key-zone', -.15, .131, .018, 1.52, .074, .016, .008, .003);
  for (const x of [-.73, -.62, -.51, -.40, -.29, -.18]) H.box(group, m.rear, 'blaupunkt-small-bottom-key', x, .137, .030, .046, .021, .011, .004, .001);
  const handle = H.fixture(group, 'blaupunkt-left-carry-handle', -1.137, 1.980, -1.039, new THREE.Vector3(-1, 0, 0));
  const ferrule=m.dark.clone();ferrule.name='Blaupunkt black phenolic carry handle';
  ferrule.color.setHex(0x101113);ferrule.roughness=.39;ferrule.clearcoat=.09;
  for (const x of [-.322,.322]) H.box(handle,ferrule,'side-handle-anchor',x,0,.076,.072,.16,.166,.022,.007);
  H.box(handle,ferrule,'solid-raised-carry-handle',0,0,.169,.751,.173,.071,.026,.009);
}

export function buildBottomTelevision(index, { spec = BOTTOM_TV_SPECS[index], materials: m, helpers: H, resources = new Set() } = {}) {
  if (!BOTTOM_TV_SPECS[index] || !m || !H) throw new TypeError('Bottom television requires index 7–9, materials and geometry helpers');
  for (const texture of [m.grain, m.brushed, ...(m.resources || [])]) if (texture?.isTexture) resources.add(texture);
  const group = new THREE.Group(); group.name = `Physical TV ${index + 1} — ${spec.name}`;
  const tube = index === 7 ? pictureTube(spec.screen, .042, .025, -.018, .045, .012)
    : index === 8 ? pictureTube(spec.screen, .051, .029, -.269, .055, .042)
    : pictureTube(spec.screen, .035, .024, -.076, .036, .033);
  if (index === 7) { sonyShell(group, spec, m, H, tube); sonyDetails(group, spec, m, H, resources); }
  else if (index === 8) { const shell = orbShell(group, spec, m, H, tube); orbDetails(group, spec, m, H, resources, shell); }
  else { blauShell(group, spec, m, H, tube); blauDetails(group, spec, m, H, resources); }
  if (index !== 8 && H.rearHardware) H.rearHardware(group, spec, m, resources, index);
  const screen = H.mesh(group, tube.geometry, m.glass, 'screen');
  screen.castShadow = false; screen.userData.screen = true;
  H.seatPrintedLabels?.(group);
  group.userData = { physicalTelevision: true, televisionIndex: index, family: spec.name, photographicTextures: false, canonicalFrontAxis: '+Z', supportY: 0 };
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3()), screenAspect = spec.screen.width / spec.screen.height;
  const faceFrame = { origin: new THREE.Vector3(spec.screen.x, spec.screen.y, tube.crest), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0, 0, 1),
    width: size.x, height: size.y, screenWidth: spec.screen.width, screenHeight: spec.screen.height };
  return { group, screen, screenAspect, physicalScreenAspect: screenAspect, faceFrame, bounds, dimensions: { width: size.x, height: size.y, depth: size.z }, supportY: 0, resources, spec };
}
