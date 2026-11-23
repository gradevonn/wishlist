import * as THREE from 'three';

// Optional, offline-baked prototype. Importing this module does not alter a TV.
// Bake and attach before runtime batching; no ray casting or texture upload here.
export function physicalAOGeometryKey(geometry) {
  let hash = 2166136261;
  for (const attribute of [geometry.attributes.position, geometry.attributes.normal, geometry.index]) {
    if (!attribute) { hash = Math.imul(hash ^ 255, 16777619); continue; }
    const bytes = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  }
  return `${geometry.attributes.position.count}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function decode(record) {
  const encoded = Uint8Array.from(atob(record.values), c => c.charCodeAt(0));
  if (record.encoding === 'raw-u8') {
    if (encoded.length !== record.count) throw new Error('Physical AO length mismatch');
    return encoded;
  }
  if (record.encoding === 'packbits-u8') {
    const result = new Uint8Array(record.count); let input = 0, output = 0;
    while (input < encoded.length) {
      const header = encoded[input++];
      if (header < 128) {
        const count = header + 1;
        if (input + count > encoded.length || output + count > result.length) throw new Error('Invalid physical AO literal');
        result.set(encoded.subarray(input, input + count), output); input += count; output += count;
      } else if (header > 128) {
        const count = 257 - header;
        if (input >= encoded.length || output + count > result.length) throw new Error('Invalid physical AO repeat');
        result.fill(encoded[input++], output, output + count); output += count;
      }
    }
    if (output !== result.length) throw new Error('Truncated physical AO record');
    return result;
  }
  if (record.encoding !== 'rle16-u8' || encoded.length % 3) throw new Error('Unknown physical AO encoding');
  const result = new Uint8Array(record.count); let offset = 0;
  for (let i = 0; i < encoded.length; i += 3) {
    const count = encoded[i] | encoded[i + 1] << 8;
    if (!count || offset + count > result.length) throw new Error('Invalid physical AO run');
    result.fill(encoded[i + 2], offset, offset + count); offset += count;
  }
  if (offset !== result.length) throw new Error('Truncated physical AO record');
  return result;
}

const indirectAO = `
  float physicalOcclusion = mix(1.0, clamp(vPhysicalAO, 0.45, 1.0), uPhysicalAOStrength);
  reflectedLight.indirectDiffuse *= physicalOcclusion;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= physicalOcclusion;
  #endif
  #if defined( USE_SHEEN )
    sheenSpecularIndirect *= physicalOcclusion;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    reflectedLight.indirectSpecular *= computeSpecularOcclusion(
      saturate(dot(geometryNormal, geometryViewDir)), physicalOcclusion, material.roughness);
  #endif
`;

const materialClasses = new Map();
function aoMaterial(source, strength) {
  const Base = source.isMeshPhysicalMaterial ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  if (!materialClasses.has(Base)) materialClasses.set(Base, class extends Base {
    constructor(original, value = 1) {
      super(); this.physicalAOStrength = { value };
      if (original) this.copy(original);
    }
    copy(original) {
      super.copy(original);
      this.physicalAOStrength = { value: original.physicalAOStrength?.value ?? this.physicalAOStrength?.value ?? 1 };
      this.previousAOCompile = original.previousAOCompile || original.onBeforeCompile;
      this.previousAOKey = original.previousAOKey || original.customProgramCacheKey();
      this.userData.physicalAO = { mode: 'indirect-only', baked: true };
      return this;
    }
    onBeforeCompile(shader, renderer) {
      this.previousAOCompile?.call(this, shader, renderer);
      if (!shader.fragmentShader.includes('#include <aomap_fragment>')) throw new Error('Physical AO expects a standard PBR shader');
      shader.uniforms.uPhysicalAOStrength = this.physicalAOStrength;
      shader.vertexShader = `attribute float physicalAO; varying float vPhysicalAO;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPhysicalAO = physicalAO;');
      shader.fragmentShader = `varying float vPhysicalAO; uniform float uPhysicalAOStrength;\n${shader.fragmentShader}`
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${indirectAO}`);
    }
    customProgramCacheKey() { return `physical-vertex-ao-v1:${this.previousAOKey || ''}`; }
  });
  return new (materialClasses.get(Base))(source, strength);
}

/** Records are per TV or per mount; geometry-key mismatches are skipped safely. */
export function applyPhysicalAO(root, records, { strength = 1, mode = 'indirect' } = {}) {
  if (!['indirect', 'vertex-color'].includes(mode)) throw new Error('Unknown physical AO material mode');
  strength = THREE.MathUtils.clamp(Number(strength) || 0, 0, 1);
  const lookup = new Map(records.map(r => [`${r.name}#${r.ordinal}`, r]));
  const ordinals = new Map(), materialCache = new Map();
  const result = { applied: [], mismatched: [], missing: [], alreadyApplied: [] };
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh) return;
    const ordinal = ordinals.get(mesh.name) || 0; ordinals.set(mesh.name, ordinal + 1);
    const record = lookup.get(`${mesh.name}#${ordinal}`); if (!record) return;
    lookup.delete(`${mesh.name}#${ordinal}`);
    if (physicalAOGeometryKey(mesh.geometry) !== record.key) { result.mismatched.push(mesh.name); return; }
    if (mesh.userData.physicalAO?.key === record.key && mesh.userData.physicalAO.mode === mode
      && mesh.userData.physicalAO.strength === strength) { result.alreadyApplied.push(mesh.name); return; }
    const values = decode(record), geometry = mesh.geometry.clone();
    geometry.setAttribute('physicalAO', new THREE.Uint8BufferAttribute(values, 1, true));
    const wrap = material => {
      if (!materialCache.has(material)) {
        const copy = mode === 'vertex-color' ? material.clone() : aoMaterial(material, strength);
        if (mode === 'vertex-color') { copy.vertexColors = true; copy.userData.physicalAO = { mode, baked: true }; }
        materialCache.set(material, copy);
      }
      return materialCache.get(material);
    };
    if (mode === 'vertex-color') {
      const source = geometry.attributes.color, colors = new Uint8Array(values.length * 3);
      for (let i = 0; i < values.length; i++) for (let c = 0; c < 3; c++) {
        const original = source ? (c === 0 ? source.getX(i) : c === 1 ? source.getY(i) : source.getZ(i)) : 1;
        colors[i * 3 + c] = Math.round(THREE.MathUtils.clamp(original * (1 - strength + strength * values[i] / 255), 0, 1) * 255);
      }
      geometry.setAttribute('color', new THREE.Uint8BufferAttribute(colors, 3, true));
    }
    mesh.geometry = geometry;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(wrap) : wrap(mesh.material);
    mesh.userData.physicalAO = { key: record.key, mode, strength };
    result.applied.push({ name: mesh.name, count: values.length });
  });
  result.missing = [...lookup.keys()]; return result;
}

export function setPhysicalAOStrength(root, strength) {
  const value = THREE.MathUtils.clamp(Number(strength) || 0, 0, 1);
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material.physicalAOStrength) material.physicalAOStrength.value = value;
    }
  });
}
