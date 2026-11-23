import * as THREE from 'three';

// Three r169's compile() traverses hidden meshes too, so the pedestal and
// disappearing cabinets use the same materials/objects here as at runtime.
// No clones, changed feature defines, new lights or alternate shaders are used.
export async function prewarmFadeVariants(renderer, scene, camera, {
  targets = [null], isDisposed = () => false, warmOpaque = false,
  productRig = scene.getObjectByName('Single television product lighting'),
} = {}) {
  const started = performance.now(), programsBefore = renderer.info?.programs?.length || 0;
  const originalTarget = renderer.getRenderTarget();
  const cubeFace = renderer.getActiveCubeFace?.() || 0, mipLevel = renderer.getActiveMipmapLevel?.() || 0;
  const materials = new Set(), snapshots = [], products = [];
  let cancelled = !!isDisposed(), passes = 0;
  const observedPrograms = new Set();
  const stopped = () => (cancelled ||= !!isDisposed());
  scene.traverse(node => {
    if (node.material) for (const material of [].concat(node.material)) materials.add(material);
  });
  for (const material of materials) {
    // Only NormalBlending/opaque changes the OPAQUE shader define. Existing
    // transparent screens, shadow receivers and custom blits need no variant.
    if (!material.transparent && material.blending === THREE.NormalBlending && !material.alphaToCoverage) {
      snapshots.push({ material, transparent: material.transparent, opacity: material.opacity });
    }
  }
  productRig?.traverse(light => {
    if (light.isLight) products.push({ light, intensity: light.intensity });
  });
  async function compileAt(target) {
    if (stopped()) return;
    renderer.setRenderTarget(target);
    // Use the pinned renderer's compile + program readiness rather than its
    // unguarded compileAsync polling. Disposing during await must not leave a
    // timer reading released materialProperties.currentProgram indefinitely.
    const compiling = renderer.compile(scene, camera);
    // Double-sided transparent materials prepare both BackSide and FrontSide.
    // currentProgram only points at the last one; wait for the renderer's full
    // program collection so the first rear-face draw cannot trigger a hitch.
    const pending = new Set(renderer.info?.programs || []);
    for (const material of compiling) {
      const program = renderer.properties.get(material).currentProgram;
      if (program) pending.add(program);
    }
    for (const program of pending) observedPrograms.add(program);
    passes++;
    while (pending.size && !stopped()) {
      for (const program of pending) if (program.isReady()) pending.delete(program);
      if (pending.size) await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  try {
    if (!stopped()) {
      // Intensity is a uniform, not a shader feature. Keep the same light count
      // and exercise the existing product sources without adding program keys.
      for (const { light, intensity } of products) light.intensity = intensity || 1;
      const uniqueTargets = [...new Set(targets)];
      if (warmOpaque) for (const target of uniqueTargets) await compileAt(target);
      if (!stopped()) {
        for (const { material } of snapshots) {
          material.transparent = true; material.opacity = .5; material.needsUpdate = true;
        }
        for (const target of uniqueTargets) await compileAt(target);
      }
    }
  } finally {
    for (const { material, transparent, opacity } of snapshots) {
      const changed = material.transparent !== transparent;
      material.transparent = transparent; material.opacity = opacity;
      if (changed) material.needsUpdate = true;
    }
    for (const { light, intensity } of products) light.intensity = intensity;
    if (!stopped()) renderer.setRenderTarget(originalTarget, cubeFace, mipLevel);
  }
  return { cancelled, passes, opaqueMaterials: snapshots.length, productLights: products.length,
    waitedPrograms: observedPrograms.size,
    programsBefore, programsAfter: renderer.info?.programs?.length || 0,
    durationMs: performance.now() - started };
}
