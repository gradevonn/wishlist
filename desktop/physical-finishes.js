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

function finishMaps(profile) {
  if (textureBundles.has(profile)) return textureBundles.get(profile);
  const brushed = profile === 'satin-brushing';
  const red = profile === 'red-pebbled-ABS';
  const black = profile === 'black-stippled-ABS';
  const seed = brushed ? 73019 : red ? 30473 : black ? 81139 : 19657;
  const roughness = new Uint8Array(SIZE * SIZE * 4);
  const height = new Uint8Array(SIZE * SIZE * 4);
  const albedo = new Uint8Array(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE, fine = hash(x, y, seed) - .5;
    const slow = noise(u, v, 8, seed + 101) - .5;
    let rough, bump, diffuse;
    if (brushed) {
      // Horizontal tooling grain. Scratches stay sub-pixel/fine; they are not
      // albedo gouges and cannot create large grunge patches on tiny bevels.
      const line = (hash(0, y, seed + 7) - .5) * .72
        + (hash(0, (y + SIZE - 1) % SIZE, seed + 7) - .5) * .28;
      const abrasion = hash(0, y, seed + 19) > .986
        ? (noise(u, v, 16, seed + 71) - .5) : 0;
      rough = .955 + line * .075 + fine * .018 + abrasion * .018;
      bump = .5 + line * .13 + fine * .016 + abrasion * .025;
      diffuse = .993 + line * .006 + slow * .002;
    } else {
      const cells = red ? 86 : black ? 104 : 96;
      const middle = noise(u, v, cells, seed + 37) - .5;
      const pebble = red ? .5 - Math.abs(middle * 2) : middle;
      // Orange peel / mould stipple must survive a 600px cabinet close-up.
      // Keep the broad sheen field low contrast; short tooling/handling marks
      // affect the gloss more than the paint color and never become big stains.
      const wear = noise(u, v, 32, seed + 53) > .87 ? .35 : 0;
      const sheen = noise(u, v, 12, seed + 79) - .5;
      const scuff = hash(0, y, seed + 89) > .978 && noise(u, v, 16, seed + 97) > .64 ? .5 : 0;
      rough = .915 + middle * (red ? .20 : black ? .14 : .16)
        + fine * .045 + sheen * .05 - wear * .035 - scuff * .045;
      bump = .5 + (red ? pebble * .20 : middle * (black ? .12 : .20))
        + fine * .030 - scuff * .006;
      diffuse = Math.max(.972, Math.min(1,
        .986 + slow * .027 + middle * .013 + fine * .003 + wear * .005 + scuff * .004));
    }
    const index = y * SIZE + x;
    gray(roughness, index, rough);
    gray(height, index, bump);
    gray(albedo, index, diffuse);
  }

  const repeat = brushed ? [2, 8] : black ? [5, 5] : [6, 6];
  const bundle = {
    roughness: texture(roughness, profile, 'procedural-roughness', repeat),
    bump: texture(height, profile, 'procedural-height', repeat),
    // Ordinary sRGB base-color modulation, bounded to 2.8% encoded variation
    // on ABS. No large dirt/age patches are painted into the cabinet surface.
    albedo: texture(albedo, profile, 'procedural-albedo', repeat, THREE.SRGBColorSpace),
  };
  textureBundles.set(profile, bundle);
  // A disposed scene must not pin its GPU-resource wrappers in a module cache.
  // Resource owners deduplicate these shared textures before disposing them.
  for (const map of Object.values(bundle)) map.addEventListener('dispose', () => {
    if (textureBundles.get(profile) === bundle) textureBundles.delete(profile);
  });
  return bundle;
}

const BODY_COLOR = [
  0x9e825b, // aged warm painted ABS, not an electrically conducting gold alloy
  0xaaa9a1,
  0x9a885e,
  0xa3301e,
  0x302b24,
  0xb6a77c,
  0xa3a6a1,
  0x111413,
  0x141712,
  0x292823,
];

/**
 * Native material contract consumed by physical-tv.js.
 *
 * const m = makeTelevisionFinishes(spec, index);
 * const resources = new Set(m.resources); // add generated label textures later
 *
 * `front` means the broad cabinet fascia. Separate brushed control strips use
 * `silver` or `brass`; selecting a metal strip never makes an ABS case metallic.
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
  const bodyMaps = family === 'red' ? finishMaps('red-pebbled-ABS')
    : family === 'black' || family === 'orb' || family === 'brown' ? stippled : fine;
  const resources = new Set();
  for (const bundle of [fine, stippled, satin, bodyMaps]) for (const map of Object.values(bundle)) resources.add(map);

  const plastic = (name, color, maps = fine, roughness = .57, bumpScale = .0024, extra = {}) => {
    const material = new THREE.MeshPhysicalMaterial({
      color, map: maps.albedo, metalness: .015, roughness, roughnessMap: maps.roughness,
      bumpMap: maps.bump, bumpScale, ior: 1.48, specularIntensity: .82,
      clearcoat: .015, clearcoatRoughness: .55, envMapIntensity: .72, ...extra,
    });
    material.name = name;
    material.userData.physicalFinish = { family, kind: 'painted-or-molded-ABS', photographic: false };
    return material;
  };
  const metal = (name, color, roughness = .47, extra = {}) => {
    const material = new THREE.MeshPhysicalMaterial({
      color, map: satin.albedo, metalness: .80, roughness, roughnessMap: satin.roughness,
      bumpMap: satin.bump, bumpScale: .00020,
      clearcoat: 0, envMapIntensity: .86, ...extra,
    });
    material.name = name;
    material.userData.physicalFinish = { family, kind: 'satin-brushed-metal', photographic: false };
    return material;
  };

  const color = modelIndex >= 0 ? BODY_COLOR[modelIndex] : (spec.color ?? 0x292a25);
  const body = plastic(`${spec.name || family} — aged cabinet finish`, color, bodyMaps,
    family === 'red' ? .53 : family === 'orb' ? .30 : family === 'black' ? .54 : .55,
    family === 'red' ? .0022 : family === 'black' ? .0010 : family === 'orb' ? .0010 : .0018,
    family === 'silver' ? { metalness: .13, roughness: .54 }
      : family === 'orb' ? { clearcoat: .16, clearcoatRoughness: .30, envMapIntensity: .92 } : {});
  const rearColor = family === 'silver' ? (modelIndex === 6 ? 0x504b41 : 0x68645a)
    : family === 'gold' ? 0x8c744d : family === 'cream' ? 0x9e8b5d
      : family === 'red' ? 0x8a2a18 : 0x20221e;
  const rear = plastic('Matte ABS rear cover', rearColor, stippled, .73, .0032,
    { clearcoat: 0, envMapIntensity: .48 });
  const dark = plastic('Soft satin charcoal fascia', 0x141410, fine, .34, .0008,
    { clearcoat: .07, clearcoatRoughness: .35, envMapIntensity: .70 });
  const rubber = plastic('Dry black recess rubber', 0x10120f, stippled, .88, .0025,
    { metalness: 0, clearcoat: 0, specularIntensity: .45, envMapIntensity: .30 });
  const silver = metal('Satin brushed aluminium strip', 0xb0b1aa, .49, { metalness: .72 });
  const brass = metal('Mellow aged brass detail', 0x9d875d, .48, { metalness: .76 });
  const chrome = metal('Lightly worn control chrome', 0xb3b5ae, .28,
    { metalness: .92, bumpScale: .000065, envMapIntensity: .92 });

  let front = body;
  if (family === 'red') front = dark;
  else if (family === 'silver') front = metal('Satin silver front fascia', 0xadafa8, .47, { metalness: .62 });
  else if (family === 'brown') front = plastic('Dark aged control fascia', 0x24251f, fine, .55, .0022);

  let trim = dark;
  if (family === 'silver') trim = metal('Graphite plated aperture trim', 0x4d5550, .43, { metalness: .45 });
  else if (family === 'brown') trim = metal('Warm brushed control chassis', 0x8d826d, .48, { metalness: .68 });
  // The gold/cream mouldings are paint and dark CRT rubber, not gold chrome.

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x101714, metalness: 0, roughness: .16, ior: 1.52,
    specularIntensity: .15, clearcoat: .03, clearcoatRoughness: .25, envMapIntensity: .06,
  });
  glass.name = 'Unpowered CRT glass — media material replaces this surface';
  const amber = new THREE.MeshPhysicalMaterial({
    color: 0xae6a25, emissive: 0xe37b23, emissiveIntensity: .42,
    metalness: 0, roughness: .34, clearcoat: .08, clearcoatRoughness: .36,
  });
  amber.name = 'Small warm translucent indicator';

  return { body, rear, dark, rubber, silver, brass, chrome, front, trim, glass, amber,
    grain: bodyMaps.roughness, brushed: satin.roughness, resources };
}
