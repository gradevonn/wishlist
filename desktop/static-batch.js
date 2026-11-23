import * as THREE from 'three';

const triangleCount = geometry => (geometry.index?.count ?? geometry.attributes.position.count) / 3;
const attributesKey = geometry => Object.entries(geometry.attributes).map(([name, a]) =>
  `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join('|');

/** Reorder complete opaque triangle groups; keep every vertex attribute intact. */
export function consolidateOpaqueMaterialGroups(root) {
  const cache = new Map();
  let meshes = 0, geometries = 0, groupsBefore = 0, groupsAfter = 0;
  root.traverse(mesh => {
    const source = mesh.geometry, materials = mesh.material;
    if (!mesh.isMesh || !source || !Array.isArray(materials) || source.groups.length < 2
      || source.drawRange.start !== 0 || Number.isFinite(source.drawRange.count)) return;
    // Transparent objects rely on render order. Never reorder their triangles,
    // even if another opaque mesh shares this same BufferGeometry.
    if (source.groups.some(group => {
      const material = materials[group.materialIndex];
      return !material || material.transparent || material.opacity < 1 || material.blending !== THREE.NormalBlending;
    })) return;
    const count = source.index?.count ?? source.attributes.position?.count;
    if (!count || count % 3) return;
    const materialOrder = [...new Set(source.groups.map(group => group.materialIndex))];
    if (materialOrder.length === source.groups.length) return;
    // Require an exact partition. Partial, overlapping or deliberately repeated
    // groups may encode special drawing semantics, and must remain untouched.
    let cursor = 0;
    for (const group of [...source.groups].sort((a, b) => a.start - b.start)) {
      if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start !== cursor
        || group.start % 3 || group.count % 3 || group.count <= 0) return;
      cursor += group.count;
    }
    if (cursor !== count) return;
    let consolidated = cache.get(source);
    if (!consolidated) {
      consolidated = source.clone();
      const indices = source.index
        ? new source.index.array.constructor(count)
        : new (count > 65535 ? Uint32Array : Uint16Array)(count);
      consolidated.clearGroups();
      let offset = 0;
      for (const materialIndex of materialOrder) {
        const start = offset;
        for (const group of source.groups) if (group.materialIndex === materialIndex) {
          for (let i = group.start; i < group.start + group.count; i++) indices[offset++] = source.index ? source.index.getX(i) : i;
        }
        consolidated.addGroup(start, offset - start, materialIndex);
      }
      consolidated.setIndex(new THREE.BufferAttribute(indices, 1));
      cache.set(source, consolidated); geometries++;
    }
    meshes++; groupsBefore += source.groups.length; groupsAfter += consolidated.groups.length;
    mesh.geometry = consolidated;
  });
  return { meshes, geometries, groupsBefore, groupsAfter, savedDrawCalls: groupsBefore - groupsAfter };
}

/** Bake only small, static opaque parts before their first GPU upload. */
export function batchStaticMeshes(root, { maxTriangles = 2400, minParts = 2, onBatch } = {}) {
  const materialGroups = consolidateOpaqueMaterialGroups(root);
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), buckets = new Map();
  let eligibleParts = 0;
  root.traverse(mesh => {
    const g = mesh.geometry, m = mesh.material;
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.screen || mesh.name === 'screen'
      || Array.isArray(m) || !m || m.transparent || m.opacity < 1 || m.alphaTest > 0
      || !mesh.visible || !g || triangleCount(g) > maxTriangles || Object.keys(g.morphAttributes).length
      || mesh.animations.length || g.drawRange.start !== 0 || Number.isFinite(g.drawRange.count)
      || Object.values(g.attributes).some(a => a.isInterleavedBufferAttribute)) return;
    const key = [m.uuid, mesh.castShadow, mesh.receiveShadow, mesh.layers.mask,
      mesh.renderOrder, mesh.frustumCulled, attributesKey(g)].join(';');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ mesh, matrix: inverse.clone().multiply(mesh.matrixWorld) });
    eligibleParts++;
  });
  let sourceParts = 0, batches = 0, triangles = 0;
  for (const parts of buckets.values()) {
    if (parts.length < minParts) continue;
    const first = parts[0].mesh, baked = parts.map(({ mesh, matrix }) => {
      const g = mesh.geometry.clone().applyMatrix4(matrix);
      const index = g.index ? Array.from(g.index.array)
        : Array.from({ length: g.attributes.position.count }, (_, i) => i);
      if (matrix.determinant() < 0) {
        for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
        const tangent = g.attributes.tangent;
        if (tangent) for (let i = 0; i < tangent.count; i++) tangent.setW(i, -tangent.getW(i));
      }
      return { geometry: g, index };
    });
    const merged = new THREE.BufferGeometry();
    for (const [name, template] of Object.entries(baked[0].geometry.attributes)) {
      const array = new template.array.constructor(baked.reduce((sum, p) => sum + p.geometry.attributes[name].array.length, 0));
      let offset = 0;
      for (const p of baked) { const a = p.geometry.attributes[name].array; array.set(a, offset); offset += a.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(array, template.itemSize, template.normalized));
    }
    const indices = []; let vertexOffset = 0;
    for (const p of baked) {
      for (const i of p.index) indices.push(i + vertexOffset);
      vertexOffset += p.geometry.attributes.position.count;
      p.geometry.dispose();
    }
    merged.setIndex(indices); merged.computeBoundingBox(); merged.computeBoundingSphere();
    const batch = new THREE.Mesh(merged, first.material);
    batch.name = `static-batch-${batches + 1}`;
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.layers.mask = first.layers.mask; batch.renderOrder = first.renderOrder; batch.frustumCulled = first.frustumCulled;
    batch.userData.staticBatch = { sourceParts: parts.length };
    root.add(batch);
    onBatch?.({ sources: parts.map(p => p.mesh), mesh: batch });
    // Source geometries have never been uploaded here. Removed nodes and their
    // unreferenced CPU buffers can be collected; shared geometry is not disposed.
    for (const { mesh } of parts) mesh.removeFromParent();
    sourceParts += parts.length; batches++; triangles += indices.length / 3;
  }
  root.updateWorldMatrix(true, true);
  return { eligibleParts, sourceParts, batches, savedDrawCalls: sourceParts - batches + materialGroups.savedDrawCalls, triangles, materialGroups };
}
