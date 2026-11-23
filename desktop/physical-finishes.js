import * as THREE from 'three';

// Own procedural reflectance/height fields only. Nothing is sampled from a
// photograph, screenshot, Figma export, canvas or external texture service.
// A bundle is shared across TVs; materials themselves belong to each factory
// call so clone/dimming on one cabinet cannot recolor a neighbouring cabinet.
const SIZE = 256;
const textureBundles = new Map();
const clamp01 = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * t;
const fade = t => t * t * (3 - 2 * t);

function hash(x, y, seed) {
  let value = Math.imul(x ^ seed, 374761393) ^ Math.imul(y + 1013904223, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

// Periodic value noise: an actual repeat seam has the same statistics and
// continuity as every other part of the texture, rather than a cloudy border.
function noise(u, v, cells, seed) {
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
  const at = (a, b) => hash((a + cells) % cells, (b + cells) % cells, seed);
  return lerp(lerp(at(ix, iy), at(ix + 1, iy), fade(x - ix)),
    lerp(at(ix, iy + 1), at(ix + 1, iy + 1), fade(x - ix)), fade(y - iy));
}

function texture(data, name, role, repeat, colorSpace = THREE.NoColorSpace) {
  const result = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  result.name = `Generated ${name} — ${role}`;
  result.colorSpace = colorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(...repeat);
  result.magFilter = THREE.LinearFilter;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.generateMipmaps = true;
  result.anisotropy = 4;
  result.userData = { generated: true, photographic: false, proceduralFinish: name, role };
  result.needsUpdate = true;
  return result;
}

function gray(data, index, value) {
  const byte = Math.round(clamp01(value) * 255), offset = index * 4;
  data[offset] = data[offset + 1] = data[offset + 2] = byte;
  data[offset + 3] = 255;
}

// Sparse, directional handling marks. These modify microsurface reflectance;
// they contain no object-space shadow, reflection or photographic body detail.
// Rasterise once per shared tile, with wraparound at every repeat boundary.
function surfaceWear(seed, horizontal = false) {
  const scratch = new Float32Array(SIZE * SIZE), polished = new Float32Array(SIZE * SIZE);
  const wrap = value => (value % SIZE + SIZE) % SIZE;
  for (let mark = 0; mark < 30; mark++) {
    const cx = hash(mark, 0, seed) * SIZE, cy = hash(mark, 1, seed) * SIZE;
    const angle = (horizontal ? 0 : Math.PI / 2) + (hash(mark, 2, seed) - .5) * .32;
    const dx = Math.cos(angle), dy = Math.sin(angle), half = (mark < 4 ? 15 : 2) + hash(mark, 3, seed) * (mark < 4 ? 12 : 4);
    const width = .55 + hash(mark, 4, seed) * .25, radius = Math.ceil(half + 2);
    for (let y = Math.floor(cy) - radius; y <= cy + radius; y++) for (let x = Math.floor(cx) - radius; x <= cx + radius; x++) {
      const px = x + .5 - cx, py = y + .5 - cy, along = px * dx + py * dy;
      if (Math.abs(along) > half) continue;
      const cross = Math.abs(px * dy - py * dx);
      if (cross > width) continue;
      const fadeEnds = Math.min(1, (half - Math.abs(along)) / 3);
      const value = (1 - cross / width) * fadeEnds * (.25 + hash(mark, 5, seed) * .45);
      const index = wrap(y) * SIZE + wrap(x); scratch[index] = Math.max(scratch[index], value);
    }
  }
  for (let mark = 0; mark < 3; mark++) {
    const cx = hash(mark, 11, seed) * SIZE, cy = hash(mark, 12, seed) * SIZE;
    const angle = (horizontal ? 0 : Math.PI / 2) + (hash(mark, 13, seed) - .5) * .5;
    const dx = Math.cos(angle), dy = Math.sin(angle), major = 16 + hash(mark, 14, seed) * 18, minor = 4 + hash(mark, 15, seed) * 5;
    const radius = Math.ceil(major + 1);
    for (let y = Math.floor(cy) - radius; y <= cy + radius; y++) for (let x = Math.floor(cx) - radius; x <= cx + radius; x++) {
      const px = x + .5 - cx, py = y + .5 - cy;
      const distance = ((px * dx + py * dy) / major) ** 2 + ((px * dy - py * dx) / minor) ** 2;
      if (distance >= 1) continue;
      const value = (1 - distance) ** 2 * (.45 + hash(mark, 16, seed) * .35);
      const index = wrap(y) * SIZE + wrap(x); polished[index] = Math.max(polished[index], value);
    }
  }
  return { scratch, polished };
}

function finishMaps(profile) {
  if (textureBundles.has(profile)) return textureBundles.get(profile);
  const brushed = profile === 'satin-brushing';
  const red = profile === 'red-pebbled-ABS';
  const molded = profile === 'injection-molded-graphite';
  const black = profile === 'black-stippled-ABS' || molded;
  const enamel = profile === 'gloss-enamel';
  const rubber = profile === 'dry-rubber';
  const seed = brushed ? 73019 : red ? 30473 : black ? 81139 : enamel ? 41903 : rubber ? 51263 : 19657;
  const roughness = new Uint8Array(SIZE * SIZE * 4);
  const height = new Uint8Array(SIZE * SIZE * 4);
  const albedo = new Uint8Array(SIZE * SIZE * 4);
  const coat = new Uint8Array(SIZE * SIZE * 4);
  const wear = surfaceWear(seed + 137, brushed);
  const phaseA = hash(0, 31, seed), phaseB = hash(0, 32, seed);

  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE, fine = hash(x, y, seed) - .5;
    const index = y * SIZE + x, scratch = wear.scratch[index], polish = wear.polished[index];
    const age = .63 * noise(u, v, 5, seed + 17) + .37 * noise(u, v, 13, seed + 29);
    const haze = Math.max(0, (age - .42) * 1.55);
    let rough, bump, diffuse;
    if (molded) {
      const pore = noise(u, v, 124, seed + 43) - .5;
      // Injection-molded graphite has fine grain and a low-contrast sheen.
      // Large cloudy variations on a broad curved face resemble dents.
      rough = .85 + pore * .14 + fine * .025 + haze * .045 - polish * .035;
      bump = .50 + pore * .145 + fine * .018 - scratch * .014;
      diffuse = .976 + pore * .025 - haze * .029 - scratch * .031;
    } else if (brushed) {
      // Satin aluminium, with fine tooling rather than broad striped albedo.
      const line = ((hash(0, y, seed + 7) - .5) * .64
        + (hash(0, (y + SIZE - 1) % SIZE, seed + 7) - .5) * .36)
        * (.46 + .54 * noise(u, v, 11, seed + 103));
      rough = .86 + line * .10 + fine * .022 + haze * .06 + scratch * .12 - polish * .07;
      bump = .5 + line * .034 + fine * .012 - scratch * .024;
      diffuse = .993 + line * .010 - haze * .025 - scratch * .035;
    } else if (enamel) {
      const peel = noise(u, v, 96, seed + 53) - .5;
      rough = .83 + peel * .065 + (age - .5) * .06 + haze * .05 + scratch * .10 - polish * .06;
      bump = .5 + peel * .024 - scratch * .012;
      diffuse = .985 - haze * .055 - scratch * .028 + polish * .008;
    } else if (rubber) {
      const pore = noise(u, v, 80, seed + 37) - .5;
      rough = .94 + pore * .07 + fine * .025;
      bump = .5 + pore * .12 + fine * .025;
      diffuse = .983 + pore * .012;
    } else {
      const cells = red ? 96 : black ? 120 : 104;
      const middle = noise(u, v, cells, seed + 37) - .5;
      // The moulded case has fine handling marks, not broad painted shadows.
      // Large correlated colour/roughness clouds read as dents when a moving
      // reflection crosses the cabinet, even when the mesh is perfectly flat.
      rough = .86 + middle * .07 + fine * .025 + haze * (black ? .08 : .06)
        + scratch * .15 - polish * .08;
      bump = .5 + middle * (red ? .09 : black ? .045 : .060)
        + fine * .010 - scratch * .037;
      diffuse = .985 + middle * .016 - haze * .045 - scratch * .055 + polish * .008;
    }
    gray(roughness, index, rough);
    gray(height, index, bump);
    gray(albedo, index, diffuse);
    // Independent, periodic soft sweeps in the clear layer. They move the
    // reflected sheen at macro scale without changing albedo or normals.
    const tau = Math.PI * 2;
    const sweep = .55 * Math.sin(tau * (u + .20 * Math.sin(tau * v) + phaseA))
      + .45 * Math.sin(tau * (v + .17 * Math.sin(tau * u) + phaseB));
    const amplitude = molded ? .025 : black ? .035 : enamel ? .06 : .04;
    gray(coat, index, .69 + sweep * amplitude * .52 + haze * .035 + scratch * .08 - polish * .06);
  }

  const repeat = brushed ? [1, 4] : enamel ? [2.5, 2.5] : black || rubber ? [3.5, 3.5] : [3, 3];
  const bundle = {
    roughness: texture(roughness, profile, 'procedural-roughness', repeat),
    bump: texture(height, profile, 'procedural-height', repeat),
    // Ordinary sRGB reflectance variation. No dirt, object edge highlights,
    // reflections, directional lighting or photographic surface is baked in.
    albedo: texture(albedo, profile, 'procedural-albedo', repeat, THREE.SRGBColorSpace),
    coat: texture(coat, `${profile} clearcoat`, 'procedural-roughness', repeat),
  };
  const channelMean = data => {
    let sum = 0; for (let i = 0; i < data.length; i += 4) sum += data[i];
    return sum / (SIZE * SIZE * 255);
  };
  bundle.roughness.userData.channelMean = channelMean(roughness);
  bundle.coat.userData.channelMean = channelMean(coat);
  bundle.coat.userData.surfaceLayer = 'independent-macro-clearcoat';
  textureBundles.set(profile, bundle);
  // A disposed scene must not pin its GPU-resource wrappers in a module cache.
  // Resource owners deduplicate these shared textures before disposing them.
  for (const map of Object.values(bundle)) map.addEventListener('dispose', () => {
    if (textureBundles.get(profile) === bundle) textureBundles.delete(profile);
  });
  return bundle;
}

const BODY_COLOR = [
  0xa37c45,
  0xbcb5aa,
  0x806739,
  0xbe2707,
  0x464036,
  0xa27b37,
  0xaaa8ab,
  0x38393b,
  0x151513,
  0x393938,
];

// Reference-driven reflectance families. Partial metalness models metallic
// paint/lacquer; the Figma target is the authority for its warm reflected finish.
const BODY_FINISH = {
  gold: { roughness: .34, metalness: .42, clearcoat: .32, clearcoatRoughness: .19, bumpScale: .00065, envMapIntensity: 1.12 },
  cream: { roughness: .31, metalness: .24, clearcoat: .35, clearcoatRoughness: .21, bumpScale: .00060, envMapIntensity: 1.14 },
  silver: { roughness: .31, metalness: .90, clearcoat: .06, clearcoatRoughness: .24, bumpScale: .00035, envMapIntensity: 1.16 },
  red: { roughness: .37, metalness: .035, clearcoat: .27, clearcoatRoughness: .17, bumpScale: .00080, envMapIntensity: 1.08 },
  brown: { roughness: .34, metalness: .23, clearcoat: .22, clearcoatRoughness: .22, bumpScale: .00050, envMapIntensity: 1.10 },
  black: { roughness: .38, metalness: .025, clearcoat: .12, clearcoatRoughness: .24, bumpScale: .00040, envMapIntensity: 1.08 },
  orb: { roughness: .33, metalness: .045, clearcoat: .16, clearcoatRoughness: .29, bumpScale: .00031, envMapIntensity: .93 },
};

/**
 * Native material contract consumed by physical-tv.js.
 *
 * const m = makeTelevisionFinishes(spec, index);
 * const resources = new Set(m.resources); // add generated label textures later
 *
 * `front` means the broad cabinet fascia. Separate brushed control strips use
 * `silver` or `brass`; body coatings are independently tuned to the reference.
 * `grain`/`brushed` remain texture aliases for older resource bookkeeping.
 * Materials are independent per call; generated maps are shared and immutable.
 */
export function makeTelevisionFinishes(spec, index = -1) {
  if (!spec || typeof spec !== 'object') throw new TypeError('A television finish requires its model specification.');
  const modelIndex = Number.isInteger(index) && index >= 0 && index < BODY_COLOR.length ? index : -1;
  const family = spec.finish || 'black';
  const fine = finishMaps('fine-aged-ABS');
  const stippled = finishMaps('black-stippled-ABS');
  const satin = finishMaps('satin-brushing');
  const dryRubber = finishMaps('dry-rubber');
  const bodyMaps = family === 'black' ? finishMaps('injection-molded-graphite')
    : family === 'red' ? finishMaps('red-pebbled-ABS')
    : family === 'orb' ? finishMaps('gloss-enamel')
    : family === 'black' || family === 'brown' ? stippled : fine;
  const resources = new Set();
  for (const bundle of [fine, stippled, satin, dryRubber, bodyMaps]) for (const map of Object.values(bundle)) resources.add(map);

  const plastic = (name, color, maps = fine, roughness = .35, bumpScale = .0006, extra = {}) => {
    const parameters = {
      color, map: maps.albedo, metalness: .015, roughness, roughnessMap: maps.roughness,
      bumpMap: maps.bump, bumpScale, ior: 1.50, specularIntensity: 1.0,
      clearcoat: .15, clearcoatRoughness: .22, clearcoatRoughnessMap: maps.coat,
      envMapIntensity: 1.08, ...extra,
    };
    // Preserve the preceding mean sheen when replacing the shared base field
    // with a lower-mean independent coat map. The scalar leaves headroom for
    // both softer and sharper patches rather than clipping every lighter patch.
    const meanCoatRoughness = parameters.clearcoatRoughness * maps.roughness.userData.channelMean;
    parameters.clearcoatRoughness = Math.min(1, meanCoatRoughness / maps.coat.userData.channelMean);
    const material = new THREE.MeshPhysicalMaterial(parameters);
    material.name = name;
    material.userData.physicalFinish = { family, kind: 'lacquered-or-painted-surface', photographic: false,
      meanCoatRoughness, independentCoatMap: true };
    return material;
  };
  const metal = (name, color, roughness = .30, extra = {}) => {
    const material = new THREE.MeshPhysicalMaterial({
      color, map: satin.albedo, metalness: .94, roughness, roughnessMap: satin.roughness,
      bumpMap: satin.bump, bumpScale: .00010, anisotropy: .38,
      clearcoat: 0, envMapIntensity: 1.18, ...extra,
    });
    material.name = name;
    material.userData.physicalFinish = { family, kind: 'satin-brushed-metal', photographic: false };
    return material;
  };

  const color = modelIndex >= 0 ? BODY_COLOR[modelIndex] : (spec.color ?? 0x292a25);
  const coating = BODY_FINISH[family] || BODY_FINISH.black;
  const body = plastic(`${spec.name || family} — aged cabinet finish`, color, bodyMaps,
    coating.roughness, coating.bumpScale, coating);
  if (family === 'orb') {
    // Black enamel has a neutral dielectric reflection; the studio's amber
    // sources supply the warm edge. A bronze specular tint doubled that colour.
    body.specularColor.setHex(0xffffff);
    body.clearcoat = .13;
  }
  if(modelIndex===7){
    // The reference Sony is dark satin, while the silver sets remain bright.
    // Its broad molded shoulder must not read as a chrome picture frame.
    body.roughness=.41;body.specularIntensity=.68;body.clearcoat=.12;body.envMapIntensity=.97;
  }
  body.userData.physicalFinish.kind = family === 'silver' ? 'satin-aluminium'
    : family === 'gold' || family === 'cream' ? 'lacquered-metallic-paint'
      : family === 'red' ? 'semi-gloss-enamel' : family === 'orb' ? 'deep-gloss-lacquer' : 'aged-coated-charcoal';
  const rearColor = family === 'silver' ? (modelIndex === 6 ? 0x494037 : 0x68645a)
    : family === 'gold' ? (modelIndex === 0 ? 0x614c37 : 0x5b4e37) : family === 'cream' ? 0x685331
      : family === 'red' ? 0x972807 : 0x20221e;
  const rear = plastic('Aged satin rear cover', rearColor, stippled, .49, .0007,
    { clearcoat: .04, clearcoatRoughness: .30, metalness: family === 'gold' ? .22 : .025, envMapIntensity: .78 });
  if(modelIndex===2||modelIndex===5){
    rear.color.copy(body.color).multiplyScalar(.79);
    rear.metalness=body.metalness*.91;rear.roughness=body.roughness+.055;
    rear.clearcoat=body.clearcoat*.65;rear.envMapIntensity=body.envMapIntensity*.92;
  }
  const dark = plastic('Polished black aperture enamel', 0x17150f, fine, .29, .00027,
    { clearcoat: .22, clearcoatRoughness: .22, envMapIntensity: .99 });
  let apertureLip = family === 'orb' ? plastic('Black enamel CRT surround', 0x161715, bodyMaps, .32, .00033,
    { clearcoat: .12, clearcoatRoughness: .29, metalness: .08, specularIntensity: .58, envMapIntensity: 1.0 }) : dark;
  const rubber = plastic('Dry black recess rubber', 0x10120f, dryRubber, .89, .0012,
    { metalness: 0, clearcoat: 0, specularIntensity: .36, envMapIntensity: .24 });
  const silverColor = modelIndex === 1 ? 0xc3bbb6 : modelIndex === 6 ? 0x9099a8
    : modelIndex === 9 ? 0xa4a2a2 : 0xacaea6;
  const silverRoughness = modelIndex === 6 ? .32 : modelIndex === 9 ? .34 : .30;
  const silver = metal('Reflective satin aluminium strip', silverColor, silverRoughness,
    { metalness: modelIndex === 9 ? .68 : .96 });
  const brass = metal('Warm rubbed brass detail', 0x9d875d, .29, { metalness: .90 });
  const chrome = metal('Lightly worn control chrome', 0xbfc2bd, .17,
    { metalness: .98, bumpScale: .00004, anisotropy: .06, envMapIntensity: 1.20 });

  let front = body;
  if (family === 'cream' || family === 'gold') {
    const enamelColor = modelIndex === 0 ? 0xc09b6a : modelIndex === 2 ? 0xdfcf9c : 0xe4c481;
    front = plastic('Enamelled front casting', enamelColor, fine, .28, .00042,
      { metalness: .34, clearcoat: .36, clearcoatRoughness: .20 });
    front.metalness = .20;
  } else if (modelIndex === 7) front = plastic('Graphite Sony face molding', 0x26272a, bodyMaps, .39, .00038,
    { clearcoat: .085, clearcoatRoughness: .21, specularIntensity: .72 });
  else if (family === 'red') front = plastic('Satin black Philips faceplate',0x110f10,fine,.46,.00025,
    { metalness:0,clearcoat:.035,specularIntensity:.40,envMapIntensity:.54 });
  else if (family === 'silver') front = metal('Reflective silver front fascia', modelIndex === 6 ? 0x898b91 : silverColor, modelIndex === 6 ? .40 : .32, { metalness: modelIndex === 6 ? .79 : .87 });
  else if (family === 'brown') front = plastic('Dark lacquered control fascia', 0x24251f, fine, .30, .00045,
    { clearcoat: .18, clearcoatRoughness: .21 });

  let trim = dark;
  if (family === 'silver') trim = metal('Graphite plated aperture trim', 0x4d5550, .25, { metalness: .86 });
  else if (family === 'brown') trim = metal('Warm brushed control chassis', 0x85786b, .39, { metalness: .83 });
  else if (family === 'gold') trim = metal('Aged satin brass edge', 0x7a6547, .38, { metalness: .76 });

  if (modelIndex === 2 || modelIndex === 5 || modelIndex === 4) {
    dark.color.setHex(modelIndex===5?0x282b30:0x232327);
    dark.roughness=.40;dark.metalness=.015;dark.clearcoat=.095;dark.specularIntensity=.65;
    apertureLip=plastic('Graphite rolled socket return',0x1c1c20,fine,.36,.00021,
      {clearcoat:.11,specularIntensity:.65});
  }
  if(modelIndex===3){
    body.roughness=.43;body.clearcoat=.16;body.specularIntensity=.84;
    dark.color.setHex(0x171718);dark.clearcoat=.09;dark.specularIntensity=.72;
  }
  if(modelIndex===6){
    // The Samsung face is silver-painted ABS, not brushed aluminium sheet.
    front.color.setHex(0xacacb1);front.metalness=.28;front.anisotropy=.04;
    front.roughness=.46;front.bumpScale=.00004;
  }
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x101714, metalness: 0, roughness: .16, ior: 1.52,
    specularIntensity: .15, clearcoat: .03, clearcoatRoughness: .25, envMapIntensity: .06,
  });
  glass.name = 'Unpowered CRT glass — media material replaces this surface';
  const amber = new THREE.MeshPhysicalMaterial({
    color: 0xc67c2a, emissive: 0xff680e, emissiveIntensity: 1.6,
    metalness: 0, roughness: .34, clearcoat: .08, clearcoatRoughness: .36,
  });
  amber.name = 'Small warm translucent indicator';

  return { body, rear, dark, rubber, silver, brass, chrome, front, trim, apertureLip, glass, amber,
    grain: bodyMaps.roughness, brushed: satin.roughness, resources };
}

// Reflectance of each manufactured finish, under the common studio rig.
// Values multiply linear base RGB, roughness, dielectric specular and IBL.
// They are constant across the entire part and independent of the camera.
const cabinetReflectance = {
  0: {
    "Cabinet": [0.94, 1.16, 1.52, 1.20, 0.90, 1.38],
    "Aged satin rear cover": [0.96, 1.15, 1.29, 1.06, 0.93, 0.99],
    "Polished black aperture enamel": [1.88, 1.75, 1.36, 1.37, 0.84, 0.83],
  },
  1: {
    "Cabinet": [1.06, 0.87, 0.92, 1.37, 1.00, 0.57],
    "Reflective silver front fascia": [0.74, 0.76, 0.79, 1.18, 0.99, 1.26],
    "Polished black aperture enamel": [1.56, 1.54, 1.32, 1.28, 1.50, 1.56],
    "Reflective satin aluminium strip": [0.95, 0.98, 1.02, 1.24, 1.00, 1.12],
    "Satin perforated sheet — geometric microdetail": [1.88, 1.66, 1.89, 1.21, 1.06, 1.15],
  },
  2: {
    "Cabinet": [1.08, 1.31, 1.68, 1.23, 0.95, 0.66],
    "Aged satin rear cover": [1.14, 1.27, 1.31, 1.37, 0.79, 0.62],
    "Enamelled front casting": [0.81, 0.87, 0.94, 1.03, 0.95, 0.57],
    "Polished black aperture enamel": [1.64, 1.76, 1.70, 1.30, 0.57, 0.71],
    "Graphite rolled socket return": [1.32, 1.38, 1.33, 1.37, 1.34, 1.08],
    "Satin graphite tuner housing": [1.36, 1.29, 1.17, 1.11, 0.89, 1.03],
  },
  3: {
    "Cabinet": [0.80, 1.49, 1.03, 1.09, 0.85, 0.76],
    "Aged satin rear cover": [0.44, 1.01, 1.00, 1.09, 1.04, 0.95],
    "Polished black aperture enamel": [1.61, 1.50, 1.28, 1.17, 0.97, 1.14],
  },
  4: {
    "Dark lacquered control fascia": [1.04, 1.02, 1.03, 1.37, 0.50, 0.74],
    "Warm brushed control chassis": [0.98, 0.99, 1.00, 1.22, 1.00, 0.57],
    "Polished black aperture enamel": [1.46, 1.54, 1.47, 1.37, 0.55, 1.18],
  },
  5: {
    "Cabinet": [0.63, 0.87, 1.22, 1.37, 0.57, 0.61],
    "Aged satin rear cover": [0.73, 1.22, 1.36, 1.20, 0.62, 0.58],
    "Enamelled front casting": [0.44, 0.57, 0.76, 1.17, 0.85, 0.57],
    "Polished black aperture enamel": [1.88, 1.90, 1.58, 1.37, 1.11, 1.45],
    "Graphite rolled socket return": [1.56, 1.46, 1.25, 1.13, 1.42, 1.08],
    "Gunmetal preset-key mounting plate": [1.04, 1.14, 1.18, 1.08, 1.06, 1.05],
  },
  6: {
    "Cabinet": [1.23, 1.16, 1.00, 1.37, 0.99, 1.13],
    "Aged satin rear cover": [1.22, 1.31, 1.36, 1.01, 0.72, 0.83],
    "Reflective silver front fascia": [0.76, 0.81, 0.82, 1.13, 0.99, 0.82],
  },
  8: {
    "Cabinet": [1.68, 1.58, 1.34, 1.37, 0.73, 1.01],
    "JVC graphite receiver console": [1.26, 1.41, 1.54, 1.05, 1.04, 1.20],
  },
  9: {
    "Blaupunkt satin graphite tube mask": [1.25, 1.32, 1.32, 1.22, 0.98, 1.06],
  },
};

export function applyCabinetReflectance(group, index) {
  const finishes = cabinetReflectance[index];
  if (!finishes) return;
  const seen = new Set();
  group.traverse(part => {
    if (!part.isMesh) return;
    for (const material of [].concat(part.material)) {
      if (!material.isMeshPhysicalMaterial || seen.has(material)) continue;
      seen.add(material);
      const name = material.name.endsWith(' — aged cabinet finish') ? 'Cabinet' : material.name;
      const recipe = finishes[name];
      if (!recipe) continue;
      const [r, g, b, roughness, specular, environment] = recipe;
      material.color.r *= r; material.color.g *= g; material.color.b *= b;
      material.roughness = Math.min(1, material.roughness * roughness);
      material.specularIntensity = Math.min(1, material.specularIntensity * specular);
      material.envMapIntensity *= environment;
    }
  });
}
