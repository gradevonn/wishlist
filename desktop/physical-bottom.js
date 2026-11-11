import * as THREE from 'three';

// Bottom-row proportions are fitted to the visible reference, while every
// casing, recess, control and rear remains real, independently lit geometry.
export const BOTTOM_TV_SPECS = {
  7: { name: 'black-rounded-sony', brand: 'SONY', dimensions: { width: 2.70, height: 2.25, depth: 1.52 },
    screen: { width: 2.23, height: 1.565, x: -.035, y: 1.18, radius: .105 },
    radius: .15, bevel: .045, taper: .86, color: 0x252621, finish: 'black', recess: .082 },
  8: { name: 'retro-orb', brand: 'JVC', dimensions: { width: 2.85, height: 2.75, depth: 1.72 },
    screen: { width: 1.76, height: 1.26, x: 0, y: 1.45, radius: .105 },
    radius: .13, bevel: .025, taper: .86, color: 0x20221e, finish: 'orb', recess: .035 },
  9: { name: 'black-blaupunkt', brand: 'BLAUPUNKT', dimensions: { width: 2.30, height: 2.30, depth: 1.48 },
    screen: { width: 1.72, height: 1.35, x: .035, y: 1.43, radius: .075 },
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

function attach(group, builder, materials, name, H) {
  const source=builder.finish(),geometry=H.physicalGrainUV?H.physicalGrainUV(source):source;
  if(geometry!==source)source.dispose();
  return H.mesh(group,geometry,materials,name);
}

function sonyShell(group, spec, m, H) {
  const { width: w, height: h, depth: d } = spec.dimensions, s = spec.screen, bottom = .10, cy = (bottom + h) / 2;
  // A restrained molded fillet and nearly rectangular façade replace the old
  // capsule. The upper face leans back; the rear shoulder stays substantially
  // full-sized instead of collapsing to a narrow generic CRT tail.
  const faceZ = y => .025 - .060 * (y - bottom) / (h - bottom);
  const front = loop(w - .055, h - bottom - .035, .135, 0, 0, cy).map(([x, y]) => [x, y, faceZ(y)]);
  const skin = [front];
  for (let j = 1; j <= 5; j++) {
    const a = j / 5 * Math.PI / 2;
    skin.push(loop(w - .055 + Math.sin(a) * .055, h - bottom - .035 + Math.sin(a) * .035, .135 + Math.sin(a) * .025, 0, 0, cy)
      .map(([x, y]) => [x, y, faceZ(y) - (1 - Math.cos(a)) * .060]));
  }
  skin.push(loop(w * .995, (h - bottom) * .995, .17, -d * .35, 0, cy + .008));
  skin.push(loop(w * spec.taper, (h - bottom) * .89, .13, -d + .055, 0, cy + .035));
  skin.push(loop(w * spec.taper - .045, (h - bottom) * .89 - .04, .11, -d, 0, cy + .035));
  const nose = loop(s.width + .21, s.height + .20, s.radius + .045, -.006, s.x, s.y);
  const blackLip = loop(s.width + .075, s.height + .065, s.radius + .018, -.020, s.x, s.y);
  const aperture = loop(s.width, s.height, s.radius, -.082, s.x, s.y), cavity = aperture.map(([x, y]) => [x, y, -.18]);
  const g = new Solid();
  g.strip(skin, 0, true).cap(skin.at(-1), 1, true);
  g.strip([front, nose], 0).strip([nose, blackLip], 0).strip([blackLip, aperture], 2).strip([aperture, cavity], 2).cap(cavity, 2);
  attach(group, g, [m.body, m.rear, m.blackPanel || m.dark], 'sony-closed-slanted-molded-cabinet', H);
  for (const x of [-.87, .87]) H.box(group, m.rubber, 'sony-integrated-support-foot', x, .05, -.61, .42, .10, .78, .028, .009);
  return -.0812;
}

function circularPerforations(parent, m, H, radius = .325) {
  H.cylinder(parent, m.rubber, 'speaker-felt-behind-real-holes', 0, 0, -.015, radius, .018, 64);
  H.mesh(parent, new THREE.TorusGeometry(radius + .008, .012, 8, 80), m.rear, 'speaker-round-molded-lip');
  const pitch = .023, hole = pitch * .29, outer = [], inner = [], back = [];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI * 2 / 12, x = Math.cos(a), y = Math.sin(a), k = 1 / Math.max(Math.abs(x), Math.abs(y));
    outer.push([x * k * pitch / 2, y * k * pitch / 2, 0]); inner.push([x * hole, y * hole, 0]); back.push([x * hole, y * hole, -.004]);
  }
  const tile = new Solid().strip([outer, inner, back]).finish(), positions = [];
  const count = Math.ceil(radius / pitch);
  for (let row = -count; row <= count; row++) for (let col = -count; col <= count; col++) {
    const x = col * pitch, y = row * pitch;
    if (Math.hypot(Math.abs(x) + pitch / 2, Math.abs(y) + pitch / 2) < radius) positions.push([x, y, .005]);
  }
  const sheet=m.rear.clone();sheet.name='Sony perforated acoustic sheet — geometric relief';sheet.bumpMap=null;sheet.roughnessMap=null;sheet.map=null;
  const cells = new THREE.InstancedMesh(tile, sheet, positions.length), matrix = new THREE.Matrix4();
  positions.forEach((p, i) => cells.setMatrixAt(i, matrix.makeTranslation(...p)));
  cells.name = 'sony-real-circular-speaker-perforations'; cells.castShadow = false; cells.receiveShadow = false; cells.instanceMatrix.needsUpdate = true;
  cells.userData.realSpeakerOpenings = true; parent.add(cells);
}

function sonyDetails(group, spec, m, H, resources) {
  H.label(group, spec.brand, -.02, .315, .029, .048, 0xb5afa0, resources);
  H.box(group, m.blackPanel || m.dark, 'sony-flush-lower-control-fascia', -.10, .17, .019, 1.62, .135, .025, .025, .006);
  H.label(group, 'POWER', -.71, .175, .035, .012, 0x85877d, resources);
  H.box(group, m.rubber, 'sony-oval-control-recess', -.12, .171, .035, .75, .052, .012, .024, .003);
  for (const x of [-.35, -.16, .025]) H.box(group, m.rear, 'sony-low-travel-key', x, .171, .046, .075, .023, .014, .008, .003);
  H.box(group, m.rubber, 'sony-remote-receiver', .48, .176, .036, .15, .032, .011, .008, .002);
  H.button(group, m, .71, .173, .009, { z: .034 });
  // The speaker pod is intersecting molded casework, with its acoustic face on
  // the actual right side rather than a painted oval on the front.
  const pod = new THREE.SphereGeometry(1, 44, 30); pod.scale(.165, .405, .43);
  H.mesh(group, pod, m.body, 'sony-integrated-asymmetric-acoustic-pod', 1.30, .78, -.76);
  const speaker = H.fixture(group, 'sony-right-side-acoustic-face', 1.455, .78, -.735, new THREE.Vector3(1, 0, .085).normalize());
  circularPerforations(speaker, m, H);
}

function orbShell(group, spec, m, H) {
  const { width, height, depth } = spec.dimensions, s = spec.screen;
  const rx = width / 2, ry = 1.26, cy = height - ry, cz = -.845, frontDepth = .875, rearDepth = depth + cz;
  const surfaceZ = (x, y, rear = false) => cz + (rear ? -rearDepth : frontDepth) * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2));
  const lipXY = loop(s.width + .07, s.height + .07, s.radius + .025, 0, s.x, s.y);
  const equator = lipXY.map(([x, y]) => {
    const k = Math.hypot(x / rx, (y - cy) / ry); return [x / k, cy + (y - cy) / k, cz];
  });
  const skin = [];
  for (let j = 0; j <= 40; j++) {
    const t = j / 40;
    skin.push(equator.map(([ox, oy], i) => {
      const x = mix(ox, lipXY[i][0], t), y = mix(oy, lipXY[i][1], t); return [x, y, surfaceZ(x, y)];
    }));
  }
  const back = [equator];
  for (let j = 1; j < 32; j++) {
    const a = j / 32 * Math.PI / 2;
    back.push(equator.map(([x, y]) => [x * Math.cos(a), cy + (y - cy) * Math.cos(a), cz - rearDepth * Math.sin(a)]));
  }
  // Every point of the aperture and glass follows the ellipsoid. A planar
  // rectangle would sit ahead of the sphere at its corners when seen at 45°.
  const innerLip = loop(s.width + .018, s.height + .018, s.radius + .006, 0, s.x, s.y).map(([x,y])=>[x,y,surfaceZ(x,y)-.016]);
  const aperture = loop(s.width, s.height, s.radius, 0, s.x, s.y).map(([x,y])=>[x,y,surfaceZ(x,y)-spec.recess]);
  const cavity = aperture.map(([x, y, z]) => [x, y, z-.09]);
  const g = new Solid();
  g.strip([...skin, innerLip], 0);
  const frontSection = g.groups.pop(), bodyIndices = (skin.length - 1) * skin[0].length * 6;
  g.groups.push({ start: frontSection.start, count: bodyIndices, materialIndex: 0 },
    { start: frontSection.start + bodyIndices, count: frontSection.count - bodyIndices, materialIndex: 1 });
  g.strip(back, 0, true).cap(back.at(-1), 0, true, [0, cy, -depth]);
  g.strip([innerLip, aperture], 1).strip([aperture, cavity], 1).cap(cavity, 1);
  attach(group, g, [m.body, m.blackPanel || m.dark], 'orb-closed-ellipsoid-with-deep-integral-aperture', H);
  H.box(group, m.body, 'orb-integrated-low-receiver-body', 0, .245, -.55, 2.10, .29, .98, .055, .016);
  H.box(group, m.dark, 'orb-thin-flared-integral-base', 0, .06, -.65, 2.50, .12, 1.24, .055, .012);
  return { z: surfaceZ(s.x,s.y)-spec.recess+.0008, cy, surfaceZ };
}

function orbDetails(group, spec, m, H, resources, shell) {
  H.box(group, m.blackPanel || m.dark, 'orb-recessed-receiver-control-face', 0, .247, -.045, 1.94, .192, .025, .015, .005);
  H.label(group, spec.brand, -.77, .274, -.029, .019, 0xaca591, resources);
  H.label(group, 'COLOR', -.77, .213, -.029, .011, 0x767b6c, resources);
  H.box(group, m.rubber, 'orb-small-left-slide-switch', -.77, .247, -.020, .13, .021, .010, .005, .001);
  H.box(group, m.silver, 'orb-slide-tab', -.80, .247, -.012, .024, .016, .012, .004, .001);
  for (const [x, r] of [[-.55, .017], [-.43, .023], [-.29, .018]]) H.button(group, m, x, .245, r, { metal: true, z: -.028 });
  H.box(group, m.rubber, 'orb-tuning-window', -.02, .248, -.025, .39, .047, .012, .008, .002);
  for (let i = 0; i < 11; i++) H.box(group, i === 5 ? m.amber : m.trim, 'orb-tuning-scale-mark', -.17 + i * .030, .248, -.016, .005, i % 5 === 0 ? .026 : .015, .004, .001, .0005);
  for (const [x, r] of [[.34, .030], [.46, .021], [.58, .023]]) H.button(group, m, x, .245, r, { metal: false, z: -.028 });
  H.box(group, m.agedChrome || m.trim, 'orb-recessed-vertical-slider-track', .72, .245, -.025, .035, .145, .012, .006, .002);
  H.box(group, m.rear, 'orb-vertical-slider-tab', .72, .254, -.014, .027, .035, .012, .004, .001);
  H.box(group, m.rubber, 'orb-small-right-rocker', .84, .25, -.023, .065, .047, .013, .006, .002);
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
  const ports = H.fixture(group, 'orb-receiver-rear-sockets', 0, .245, -1.045, new THREE.Vector3(0, 0, -1));
  H.box(ports, m.rubber, 'orb-rear-connector-recess', 0, 0, 0, .53, .105, .018, .014, .004);
  for (const x of [-.15, 0, .15]) H.cylinder(ports, m.chrome, 'orb-real-connector-barrel', x, 0, .022, .022, .025, 24);
}

function blauShell(group, spec, m, H) {
  const { width: w, height: h, depth: d } = spec.dimensions, s = spec.screen, bottom = .08, cy = (h + bottom) / 2;
  const front = loop(w - .022, h - bottom - .02, .025, 0, 0, cy);
  const shoulder = loop(w, h - bottom, .035, -.035, 0, cy);
  const flank = loop(w * .998, (h - bottom) * .998, .035, -d * .56, 0, cy);
  const back = loop(w * spec.taper, (h - bottom) * .94, .030, -d, 0, cy + .025);
  const panel = loop(2.17, 1.76, .025, .012, 0, 1.405);
  const rim = loop(s.width + .30, s.height + .28, .040, .027, s.x, s.y);
  const step = loop(s.width + .19, s.height + .17, .045, .006, s.x, s.y);
  const inner = loop(s.width + .08, s.height + .07, .065, -.095, s.x, s.y);
  const aperture = loop(s.width, s.height, s.radius, -.150, s.x, s.y), cavity = aperture.map(([x, y]) => [x, y, -.25]);
  const g = new Solid();
  g.strip([front, shoulder, flank, back], 0, true).cap(back, 1, true);
  g.strip([front, panel], 0).strip([panel, rim], 2).strip([rim, step], 3).strip([step, inner], 2).strip([inner, aperture], 2).strip([aperture, cavity], 2).cap(cavity, 2);
  attach(group, g, [m.body, m.rear, m.blackPanel || m.dark, m.trim], 'blaupunkt-closed-box-and-four-stepped-black-bezel', H);
  H.box(group, m.silver, 'blaupunkt-thin-silver-upper-case-rail', 0, 2.282, .012, 2.28, .032, .028, .005, .002);
  H.box(group, m.rubber, 'blaupunkt-integral-black-bottom-plinth', 0, .04, -.63, 2.06, .08, 1.15, .020, .006);
  return -.1492;
}

function blauDetails(group, spec, m, H, resources) {
  H.label(group, spec.brand, -.70, .624, .042, .028, 0xc4c1b2, resources);
  H.box(group, m.rubber, 'blaupunkt-small-remote-window', .12, .624, .041, .27, .035, .011, .007, .002);
  // The silver strip is deliberately a separate satin-metal component. Using
  // m.front here would turn it black on the black-cabinet finish.
  H.box(group, m.silver, 'blaupunkt-satin-silver-lower-control-strip', 0, .353, .018, 2.11, .322, .042, .012, .004);
  const perforate = H.perforatedGrille || H.grille;
  perforate(group, m, -.68, .353, .043, .62, .236, { pitch: .021, material: m.silver, name: 'blaupunkt-real-perforated-silver-speaker' });
  for (const [x, r] of [[-.04, .041], [.11, .039], [.26, .042], [.41, .036], [.56, .034], [.71, .035]]) H.button(group, m, x, .369, r, { metal: true, z: .047 });
  H.box(group, m.rubber, 'blaupunkt-power-rocker-slot', .94, .382, .044, .115, .035, .013, .005, .002);
  H.box(group, m.dark, 'blaupunkt-recessed-power-rocker', .922, .382, .053, .050, .022, .014, .004, .001);
  H.box(group, m.blackPanel || m.dark, 'blaupunkt-lower-auxiliary-key-zone', -.15, .131, .018, 1.52, .074, .016, .008, .003);
  for (const x of [-.73, -.62, -.51, -.40, -.29, -.18]) H.box(group, m.rear, 'blaupunkt-small-bottom-key', x, .137, .030, .046, .021, .011, .004, .001);
  const handle = H.fixture(group, 'blaupunkt-left-carry-handle', -1.160, 1.77, -.72, new THREE.Vector3(-1, 0, 0));
  H.box(handle, m.dark, 'closed-side-handle-mount', 0, 0, .012, .62, .16, .045, .014, .005);
  H.box(handle, m.rubber, 'inset-side-handle-grip', 0, 0, .038, .50, .105, .022, .010, .003);
}

export function buildBottomTelevision(index, { spec = BOTTOM_TV_SPECS[index], materials: m, helpers: H, resources = new Set() } = {}) {
  if (!BOTTOM_TV_SPECS[index] || !m || !H) throw new TypeError('Bottom television requires index 7–9, materials and geometry helpers');
  for (const texture of [m.grain, m.brushed, ...(m.resources || [])]) if (texture?.isTexture) resources.add(texture);
  const group = new THREE.Group(); group.name = `Physical TV ${index + 1} — ${spec.name}`;
  let screenZ,orbSurface;
  if (index === 7) { screenZ = sonyShell(group, spec, m, H); sonyDetails(group, spec, m, H, resources); }
  else if (index === 8) { const shell = orbShell(group, spec, m, H); screenZ = shell.z; orbSurface=shell.surfaceZ; orbDetails(group, spec, m, H, resources, shell); }
  else { screenZ = blauShell(group, spec, m, H); blauDetails(group, spec, m, H, resources); }
  if (index !== 8 && H.rearHardware) H.rearHardware(group, spec, m, resources, index);
  const screen = H.mesh(group, H.glassGeometry(spec.screen, screenZ, index === 8 ? .056 : .048), m.glass, 'screen');
  if(orbSurface){
    const geometry=screen.geometry,positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++)positions.setZ(i,orbSurface(positions.getX(i),positions.getY(i))-spec.recess+.0008);
    positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  }
  screen.castShadow = false; screen.userData.screen = true;
  group.userData = { physicalTelevision: true, televisionIndex: index, family: spec.name, photographicTextures: false, canonicalFrontAxis: '+Z', supportY: 0 };
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3()), screenAspect = spec.screen.width / spec.screen.height;
  const faceFrame = { origin: new THREE.Vector3(spec.screen.x, spec.screen.y, screenZ), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0, 0, 1),
    width: size.x, height: size.y, screenWidth: spec.screen.width, screenHeight: spec.screen.height };
  return { group, screen, screenAspect, physicalScreenAspect: screenAspect, faceFrame, bounds, dimensions: { width: size.x, height: size.y, depth: size.z }, supportY: 0, resources, spec };
}
