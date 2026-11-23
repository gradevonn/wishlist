import * as THREE from 'three';

// Shader linking does not initialise every driver pipeline. Exercise the real
// opaque/fading draw states once, before reveal, in a one-pixel scissor. The
// existing framebuffer formats/MSAA targets and the real PBR shaders are kept.
export async function prewarmRenderStates(renderer, scene, camera, {
  targets = [null], revealRoots = [], isDisposed = () => false,
  beforeRender = () => {},
  productRig = scene.getObjectByName('Single television product lighting'),
} = {}) {
  const started = performance.now(), programsBefore = renderer.info?.programs?.length || 0;
  const target = renderer.getRenderTarget(), cubeFace = renderer.getActiveCubeFace?.() || 0;
  const mipLevel = renderer.getActiveMipmapLevel?.() || 0;
  const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest(), autoClear = renderer.autoClear;
  const materials = new Set(), materialState = [], objects = [], lights = [], passes = [];
  let cancelled = false;
  const stopped = () => (cancelled ||= !!isDisposed());
  scene.traverse(node => {
    if (node.isMesh) {
      objects.push({ node, frustumCulled: node.frustumCulled });
      for (const material of [].concat(node.material)) materials.add(material);
    }
  });
  for (const material of materials) materialState.push({ material, transparent: material.transparent,
    opacity: material.opacity, depthWrite: material.depthWrite });
  const visibility = revealRoots.filter(Boolean).map(node => ({ node, visible: node.visible }));
  productRig?.traverse(light => { if (light.isLight) lights.push({ light, intensity: light.intensity }); });
  const restoreMaterials = () => {
    for (const item of materialState) {
      const changed = item.material.transparent !== item.transparent;
      Object.assign(item.material, { transparent: item.transparent, opacity: item.opacity, depthWrite: item.depthWrite });
      if (changed) item.material.needsUpdate = true;
    }
  };
  async function waitForGPU() {
    const gl = renderer.getContext();
    if (!gl.fenceSync || stopped() || gl.isContextLost()) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) return;
    gl.flush();
    try {
      while (!stopped() && !gl.isContextLost()) {
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED || status === gl.WAIT_FAILED) break;
        await new Promise(resolve => setTimeout(resolve, 8));
      }
    } finally { gl.deleteSync(sync); }
  }
  try {
    for (const { node } of visibility) node.visible = true;
    for (const { node } of objects) node.frustumCulled = false;
    for (const { light, intensity } of lights) light.intensity = intensity || 1;
    renderer.autoClear = true;
    for (const state of ['opaque', 'fade']) {
      if (stopped()) break;
      restoreMaterials();
      if (state === 'fade') for (const { material, transparent } of materialState) {
        if (!transparent && material.blending === THREE.NormalBlending && !material.alphaToCoverage) {
          material.transparent = true; material.opacity = .5; material.needsUpdate = true;
        }
      }
      for (const destination of [...new Set(targets)]) {
        if (stopped()) break;
        renderer.setRenderTarget(destination);
        renderer.setViewport(0, 0, 1, 1); renderer.setScissor(0, 0, 1, 1); renderer.setScissorTest(true);
        // Hidden presentation supports were linked by compile(), but their
        // real depth/shadow and vertex buffers have never been drawn yet.
        if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
        const before = renderer.info?.programs?.length || 0, drawStart = performance.now();
        beforeRender(scene, camera);
        renderer.render(scene, camera);
        const submitMs = performance.now() - drawStart, waitStart = performance.now();
        await waitForGPU();
        passes.push({ state, target: destination ? 'render-target' : 'canvas', submitMs,
          waitMs: performance.now() - waitStart, newPrograms: (renderer.info?.programs?.length || 0) - before });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } finally {
    restoreMaterials();
    for (const { node, frustumCulled } of objects) node.frustumCulled = frustumCulled;
    for (const { node, visible } of visibility) node.visible = visible;
    for (const { light, intensity } of lights) light.intensity = intensity;
    renderer.autoClear = autoClear;
    if (!stopped()) {
      renderer.setRenderTarget(target, cubeFace, mipLevel);
      renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      // Restore the actual home image and its shadow map before the canvas is
      // revealed; no diagnostic render survives in the default framebuffer.
      if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
      beforeRender(scene, camera);
      renderer.render(scene, camera);
      await waitForGPU();
    }
  }
  return { cancelled, passes, programsBefore, programsAfter: renderer.info?.programs?.length || 0,
    durationMs: performance.now() - started };
}
