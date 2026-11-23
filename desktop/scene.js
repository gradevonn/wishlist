import * as THREE from 'three';
import { FlightBuffer } from './motion-light-probes.js?v=20261123-intro-depth-1';
import { buildPhysicalTelevision } from './physical-tv.js?v=20261123-intro-depth-1';
import { buildPhysicalRack, buildPresentationPedestal } from './physical-rack.js?v=20261123-intro-depth-1';
import { RetainedGlass, createPhysicalScreenMaterial, updatePhysicalScreenMaterial } from './physical-screen.js?v=20261123-intro-depth-1';
import { CameraFlight, homeCameraPose, frontCameraPose } from './camera-flight.js?v=20261123-intro-depth-1';
import { addPhysicalStudio, applyStudioReflections, createProductLights } from './studio-light.js?v=20261123-intro-depth-1';
import { placePhysicalTelevision } from './installation.js?v=20261123-intro-depth-1';
import { contactSceneState, contactEase } from './contact-motion.js?v=20261123-intro-depth-1';
import { batchStaticMeshes } from './static-batch.js?v=20261123-intro-depth-1';
import { applyPhysicalLightBudget, updatePhysicalLightBudget } from './physical-light-budget.js?v=20261123-intro-depth-1';
import { prewarmFadeVariants } from './prewarm-fades.js?v=20261123-intro-depth-1';
import { prewarmRenderStates } from './prewarm-render-states.js?v=20261123-intro-depth-1';

const asset = name => new URL(name, import.meta.url).href;
// Layer 1 contains the phosphor surfaces and their real scene lights. The
// retained color/depth buffer allows a new video frame to update only its CRT.
const CRT_LAYER = 1;
const videoFrame = texture => {
  if (!texture?.isVideoTexture) return 0;
  const video = texture.image;
  if (video.requestVideoFrameCallback) return texture.version;
  return video.getVideoPlaybackQuality?.().totalVideoFrames ?? Math.floor(video.currentTime * 30);
};
const damp = (a, b, dt, speed = 9) => a + (b - a) * (1 - Math.exp(-dt * speed));

export class DesktopScene {
  constructor({ canvas, projects, onSelect = () => {}, onHover = () => {}, onReady = () => {} }) {
    Object.assign(this, { canvas, projects, onSelect, onHover, onReady });
    this.active = true; this.ready = false; this.revealed = false; this.disposed = false;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.selected = -1; this.hovered = -1; this.enter = 0; this.focusProgress = 0; this.contactProgress = 0;
    this.frame = null; this.lastTime = 0; this.tvs = []; this.media = []; this.resources = new Set();
    this.batching = []; this.lastRenderTime = -Infinity;
    this.forceRender = true; this.videoOnlyFrame = false;
    this.pointer = new THREE.Vector2(); this.raycaster = new THREE.Raycaster();
    this.scene = new THREE.Scene(); this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(26, 1, .05, 180); this.cameraFlight = new CameraFlight(this.camera);
    const homePose = homeCameraPose();
    this.retreatDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(homePose.quaternion);
    this.retreatViewDistance = -homePose.position.dot(this.retreatDirection);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; this.renderer.shadowMap.needsUpdate = true;
    this.stage = new THREE.Group(); this.stage.name = 'One physical television installation'; this.scene.add(this.stage);
    this.studio = addPhysicalStudio(this.scene, this.renderer);
    this.productLights = createProductLights(this.scene);
    this.scene.traverse(node => { if (node.isLight) node.layers.enable(CRT_LAYER); });
    this._createDiagnostics();
    this._render = this._render.bind(this); this._bind(); this.resize();
    this._load().catch(error => {
      if (this.disposed) return;
      console.error('[re//run] Physical scene failed to load.', error);
      canvas.dispatchEvent(new CustomEvent('rerun:webgl-lost', { bubbles: true }));
    });
  }
  async _texture(url) {
    const t = await new THREE.TextureLoader().loadAsync(url);
    if (this.disposed) { t.dispose(); return t; }
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); this.resources.add(t); return t;
  }
  _materials(root) {
    const originals = new Map();
    root.traverse(n => {
      if (!n.isMesh) return;
      const copy = m => { if (!originals.has(m)) originals.set(m, m.clone()); return originals.get(m); };
      n.material = Array.isArray(n.material) ? n.material.map(copy) : copy(n.material);
    });
    return [...originals.values()].map(material => ({ material, color: material.color?.clone(), emissive: material.emissive?.clone(),
      env: material.envMapIntensity ?? 1, transparent: material.transparent }));
  }
  async _load() {
    const posters = await Promise.all(this.projects.map(p => this._texture(asset(`../assets/work/${p.screenPoster || p.media + ".jpg"}`))));
    if (this.disposed) return;
    const placements = [];
    for (let i = 0; i < Math.min(10, this.projects.length); i++) {
      // Let the logo compositor and input queue advance between model builds.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (this.disposed) return;
      const model = buildPhysicalTelevision(i);
      this.batching.push({ television: i, ...batchStaticMeshes(model.group) });
      const { assembly, placement, screenAspect } = placePhysicalTelevision(model, i);
      assembly.name = `TV ${i + 1} — ${this.projects[i].media}`;
      const oldScreenMaterial = model.screen.material;
      model.screen.material = createPhysicalScreenMaterial(posters[i], screenAspect, { brightness: 1 });
      oldScreenMaterial?.dispose(); model.screen.castShadow = false;
      const records = this._materials(model.group), screenMaterial = model.screen.material;
      const pickMeshes = [];
      model.group.traverse(n => { if (n.isMesh) { n.userData.projectIndex = i; pickMeshes.push(n); } });
      const homeBounds = new THREE.Box3().setFromObject(assembly);
      placements.push(placement);
      this.stage.add(assembly);
      this.tvs.push({ index: i, model, placement, pickMeshes, homeBounds, group: assembly, body: model.group, screen: model.screen, screenMaterial,
        materials: records, bodyMaterials: records.filter(r => r.material !== screenMaterial), opacity: 1 });
      this.media.push(this._medium(this.projects[i], posters[i]));
    }
    this.rack = buildPhysicalRack({ placements }); this.stage.add(this.rack.group);
    this.rack.mounts.forEach((mount, i) => this.batching.push({ mount: i, ...batchStaticMeshes(mount.group) }));
    this.rackMaterials = this._materials(this.rack.sharedGroup || this.rack.group);
    this.columnMaterials = this.rack.column ? this._materials(this.rack.column) : [];
    this.mountMaterials = this.rack.mounts.map(mount => this._materials(mount.group));
    applyStudioReflections(this.stage);
    this.pedestal = buildPresentationPedestal();
    this.stage.add(this.pedestal);
    this.pedestalMaterials = this._materials(this.pedestal);
    applyStudioReflections(this.pedestal);
    this.pedestal.visible = false;
    this.lightBudgets = this.tvs.map(tv => applyPhysicalLightBudget(tv.group, { kind: 'television', index: tv.index }));
    this.rack.mounts.forEach((mount, index) => applyPhysicalLightBudget(mount.group, { kind: 'mount', index }));
    applyPhysicalLightBudget(this.rack.sharedGroup, { kind: 'rack' });
    const compileStart = performance.now();
    this.glassCache = new RetainedGlass(this.renderer, this.scene, this.camera, this.tvs);
    await this.glassCache.prewarm();
    if (this.disposed) return;
    // Keep the same PBR materials, surface normals, roughness and real lighting
    // throughout the flight. Changing to a reflection atlas mid-flight made
    // molded edges appear to change shape, then snap back on arrival.
    this.flightBuffer = new FlightBuffer(this.renderer);
    updatePhysicalLightBudget(this.scene, this.camera);
    if (this.flightBuffer.enabled) await this.flightBuffer.prewarm(this.scene, this.camera);
    else if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) return;
    if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
    this.fadePrewarm = await prewarmFadeVariants(this.renderer, this.scene, this.camera, {
      targets: [null, ...(this.flightBuffer.enabled ? [this.flightBuffer.target] : [])],
      isDisposed: () => this.disposed,
    });
    if (this.disposed) return;
    this.pipelinePrewarm = await prewarmRenderStates(this.renderer, this.scene, this.camera, {
      targets: [null, ...(this.flightBuffer.enabled ? [this.flightBuffer.target] : [])],
      revealRoots: [this.pedestal], isDisposed: () => this.disposed,
      beforeRender: () => updatePhysicalLightBudget(this.scene, this.camera),
    });
    this.prewarmMs = performance.now() - compileStart;
    if (this.disposed) return;
    this.invalidateLighting();
    this.renderer.info.autoReset = false;
    this.ready = true;
    if (this.selected >= 0) this._flyToSelected({ instant: true });
    this.onReady(); this._updatePlayback(); this._requestFrame();
  }
  _medium(p, poster) {
    const m = { poster, texture: poster, video: null, videoTexture: null }; if (!p.motion) return m;
    const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none'; v.src = asset(`../assets/work/${p.media}.mp4`);
    v.addEventListener('loadeddata', () => {
      if (this.disposed) return;
      if (!m.videoTexture) { m.videoTexture = new THREE.VideoTexture(v); m.videoTexture.colorSpace = THREE.SRGBColorSpace; this.resources.add(m.videoTexture); }
      this._updatePlayback(); this._requestFrame(false);
    });
    v.addEventListener('playing', () => { this._updatePlayback(); this._requestFrame(false); }); m.video = v; return m;
  }
  _flyToSelected(options = {}) {
    const tv = this.tvs[this.selected]; if (!tv) return;
    this.productLights.align(tv.placement);
    const pose = frontCameraPose({ model: tv.model, body: tv.body, camera: this.camera });
    this.cameraFlight.moveTo(pose, { ...options, instant: options.instant || this.reducedMotion });
  }
  _interactive() { return this.active && this.ready && this.revealed && this.enter === 1 && this.selected < 0 && this.contactProgress <= .01 && !this.cameraFlight.active; }
  _pick(clientX, clientY, objects) {
    const b = this.canvas.getBoundingClientRect(); if (!b.width || !b.height) return null;
    this.camera.updateMatrixWorld(true);
    this.pointer.set((clientX - b.left) / b.width * 2 - 1, 1 - (clientY - b.top) / b.height * 2); this.raycaster.setFromCamera(this.pointer, this.camera);
    const candidates = objects || this.tvs.filter(tv => this.raycaster.ray.intersectsBox(tv.homeBounds)).flatMap(tv => tv.pickMeshes);
    return this.raycaster.intersectObjects(candidates, false)[0] || null;
  }
  hitTestSelected(clientX, clientY) {
    if (!this.ready || this.selected < 0 || this.contactProgress > .01) return false;
    const meshes = [];
    for (const root of [this.tvs[this.selected].group, this.rack.mounts[this.selected]?.group, this.pedestal.visible ? this.pedestal : this.rack.column]) root?.traverse(n => { if (n.isMesh && n.visible) meshes.push(n); });
    return !!this._pick(clientX, clientY, meshes);
  }
  _clearHover() { const changed = this.hovered !== -1; this.hovered = -1; this.canvas.style.cursor = 'default'; if (changed) this.onHover(null); }
  _hover(clientX, clientY) {
    if (!this._interactive()) { this._clearHover(); return; }
    const hit = this._pick(clientX, clientY), next = hit?.object.userData.projectIndex ?? -1;
    if (next !== this.hovered) { this.hovered = next; this.canvas.style.cursor = next < 0 ? 'default' : 'pointer'; this.onHover(next < 0 ? null : next); this._updatePlayback(); }
  }
  _bind() {
    this.handleMove = e => {
      if (!this._interactive()) return;
      this.pendingPointer = [e.clientX, e.clientY];
      this._requestFrame(false);
    };
    this.handleLeave = () => {
      this.pendingPointer = null;
      if (this.hovered < 0) return;
      this._clearHover(); this._updatePlayback(); this._requestFrame(false);
    };
    this.handleClick = e => { if (!this._interactive()) return; this._hover(e.clientX, e.clientY); if (this.hovered >= 0) this.onSelect(this.hovered); };
    this.handleResize = () => this.resize(); this.handleVisibility = () => { this._updatePlayback(); this._requestFrame(); };
    this.handleContextLoss = e => { e.preventDefault(); this.active = false; this.canvas.dispatchEvent(new CustomEvent('rerun:webgl-lost', { bubbles: true })); };
    this.canvas.addEventListener('pointermove', this.handleMove); this.canvas.addEventListener('pointerleave', this.handleLeave);
    this.canvas.addEventListener('click', this.handleClick); this.canvas.addEventListener('webglcontextlost', this.handleContextLoss);
    window.addEventListener('resize', this.handleResize); document.addEventListener('visibilitychange', this.handleVisibility);
  }
  _updatePlayback() {
    const live = this.ready && this.active && this.revealed && !document.hidden && !this.reducedMotion && contactSceneState(this.contactProgress).opacity > .001;
    for (let i = 0; i < this.media.length; i++) {
      const m = this.media[i], v = m.video; if (!v) continue;
      const chosen = this.selected >= 0 ? i === this.selected : [1, 7, this.hovered < 0 ? 8 : this.hovered].includes(i);
      if (live && chosen) {
        if (v.preload === 'none') { v.preload = 'auto'; v.load(); }
        m.texture = v.readyState >= 2 && m.videoTexture ? m.videoTexture : m.poster;
        if (v.paused) v.play().catch(() => {});
      } else { v.pause(); m.texture = m.poster; }
    }
  }
  reveal({ fromDepth = false, duration = 600, instant = false } = {}) {
    this.revealed = true;
    this.enterFromDepth = fromDepth;
    this.enterDuration = Math.max(1, duration);
    this.enterStartedAt = performance.now();
    this.enter = instant || this.reducedMotion ? 1 : 0;
    this.lastTime = 0;
    this.videoOnlyFrame = false; this.retained = false; this.glassCaptured = false;
    this._updatePlayback(); this._requestFrame();
  }
  finishReveal() {
    if (!this.revealed || this.enter === 1) return;
    this.enter = 1;
    const contact = contactSceneState(this.contactProgress, this.retreatViewDistance);
    this.stage.position.copy(this.retreatDirection).multiplyScalar(contact.depth);
    this.stage.updateWorldMatrix(true, true);
    this.videoOnlyFrame = false;
    this._requestFrame();
  }
  focus(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.projects.length) return;
    if (this.selected === i && this.ready) return;
    // A deep-linked project must frame the settled model, not an intermediate
    // position along the entry path.
    this.finishReveal();
    this.selected = i; this._clearHover(); this._flyToSelected(); this._updatePlayback(); this._requestFrame();
  }
  reset() {
    const hadFocus = this.selected >= 0; this.selected = -1; this._clearHover();
    if (hadFocus) this.cameraFlight.moveTo(homeCameraPose(), { instant: this.reducedMotion });
    this._updatePlayback(); this._requestFrame();
  }
  setContactProgress(progress) { this.contactProgress = THREE.MathUtils.clamp(Number(progress) || 0, 0, 1); if (this.contactProgress > .01) this._clearHover(); this._updatePlayback(); this._requestFrame(); }
  setActive(value) {
    const active = !!value;
    if (this.diagnostics && this.active !== active) {
      this.diagnosticStart = undefined; this.diagnosticTicks = this.diagnosticDraws = 0;
      this.diagnosticIntervals.length = 0;
      if (!active) this.diagnostics.textContent = 'WebGL на паузе';
    }
    this.active = active;
    if (!active && this.frame) { cancelAnimationFrame(this.frame); this.frame = null; this.lastTime = 0; }
    this._updatePlayback(); this._requestFrame();
  }
  setReducedMotion(value) { this.reducedMotion = !!value; if (value) { this.enter = 1; this.cameraFlight.update(0, true); } this._updatePlayback(); this._requestFrame(); }
  resize() {
    this.width = this.canvas.clientWidth || innerWidth; this.height = this.canvas.clientHeight || innerHeight; this.cameraFlight.setAspect(this.width / this.height);
    this.fullPixelRatio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(3200000 / (this.width * this.height)));
    this.renderer.setPixelRatio(this.fullPixelRatio);
    if (this.selected >= 0 && this.ready) this._flyToSelected({ duration: .25 });
    this.renderer.setSize(this.width, this.height, false); this.flightBuffer?.resize(); this._requestFrame();
  }
  getHitRects() { return this.tvs.map(tv => { const b = new THREE.Box3().setFromObject(tv.group), c = b.getCenter(new THREE.Vector3()).project(this.camera), s = b.getSize(new THREE.Vector3()); return { index: tv.index, x: (c.x + 1) / 2, y: (1 - c.y) / 2, width: s.x / 19.2, height: s.y / (19.2 * this.height / this.width) }; }); }
  _requestFrame(invalidate = true) { if (invalidate) this.forceRender = true; if (!this.frame && this.active && !document.hidden && !this.disposed) this.frame = requestAnimationFrame(this._render); }
  invalidateLighting() { if (this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true; this._requestFrame(); }
  _dim(records, value, opacity = 1) {
    this.dimCache ||= new WeakMap();
    const last = this.dimCache.get(records);
    if (last?.value === value && last.opacity === opacity) return;
    this.dimCache.set(records, { value, opacity });
    for (const { material: m, color, emissive, env, transparent: originalTransparent = false } of records) {
      if (color) m.color.copy(color).multiplyScalar(value);
      if (emissive) m.emissive.copy(emissive).multiplyScalar(value);
      if ('envMapIntensity' in m) m.envMapIntensity = env * value;
      m.opacity = opacity;
      const transparent = originalTransparent || opacity < .999;
      if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
      m.depthWrite = !originalTransparent || opacity > .99;
    }
  }
  _render(time) {
    this.frame = null; if (!this.active || document.hidden || this.disposed) { this.lastTime = 0; return; }
    // compileAsync owns first-use shader work until _load marks the scene ready.
    if (!this.ready) { this.lastTime = 0; return; }
    if (this.pendingPointer) { const p = this.pendingPointer; this.pendingPointer = null; this._hover(...p); }
    if (this.diagnostics) this._diagnosticTick(time);
    // A 24/25 fps clip should present every decoded image without imposing
    // a separate 30 Hz clock (which repeats some frames and skips others).
    if (this.videoOnlyFrame && !this.forceRender && !this.cameraFlight.active && !this.tvs.some((tv, i) => {
      const texture = this.media[i].texture;
      return texture !== tv.lastDrawnMap || videoFrame(texture) !== tv.lastDrawnVersion;
    })) {
      this._requestFrame(false); return;
    }
    const dt = Math.min((time - (this.lastTime || time - 16)) / 1000, .12); this.lastTime = time;
    let moving = this.cameraFlight.update(dt, this.reducedMotion);
    if (this.ready) {
      if (this.revealed && this.enter < 1) {
        this.enter = Math.min(1, Math.max(0, (time - this.enterStartedAt) / this.enterDuration));
      }
      const enteringFromDepth = this.revealed && this.enterFromDepth && this.enter < 1;
      const entryRetreat = enteringFromDepth ? 1 - contactEase(this.enter) : 0;
      // The loading reveal follows the same physical path as the contact
      // retreat, in reverse. Translate the whole installation; never scale TVs.
      const contact = contactSceneState(Math.max(this.contactProgress, entryRetreat), this.retreatViewDistance);
      const entryOpacity = this.enterFromDepth ? 1 : 1 - Math.pow(1 - this.enter, 3);
      this.canvas.style.opacity = this.revealed ? String(entryOpacity * contact.opacity) : '0';
      if (enteringFromDepth) moving = true;
      const target = this.selected >= 0 ? 1 : 0;
      this.focusProgress = this.reducedMotion ? target : damp(this.focusProgress, target, dt);
      if (Math.abs(this.focusProgress - target) < .001) this.focusProgress = target; else moving = true;
      this.stage.position.copy(this.retreatDirection).multiplyScalar(contact.depth);
      this.stage.rotation.set(0, 0, 0);
      this.stage.visible = contact.opacity > .001;
      if (this.lastContactDepth !== contact.depth) this.renderer.shadowMap && (this.renderer.shadowMap.needsUpdate = true);
      this.lastContactDepth = contact.depth;
      for (let i = 0; i < this.tvs.length; i++) {
        const tv = this.tvs[i], media = this.media[i], selected = i === this.selected;
        const targetOpacity = this.selected < 0 || selected ? 1 : 0;
        const previousOpacity = tv.opacity;
        tv.opacity = this.reducedMotion ? targetOpacity : damp(tv.opacity, targetOpacity, dt);
        if (Math.abs(tv.opacity - targetOpacity) < .001) tv.opacity = targetOpacity; else moving = true;
        const opacity = tv.opacity;
        tv.group.visible = opacity > .001;
        this.rack.mounts[i].group.visible = opacity > .001;
        if ((previousOpacity > .001) !== tv.group.visible && this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true;
        this._dim(tv.bodyMaterials || tv.materials.filter(r => r.material !== tv.screenMaterial), .06 + .94 * opacity, opacity);
        const texture = this.reducedMotion ? media.poster : media.texture;
        const version = videoFrame(texture);
        const glassChanged = texture !== tv.lastDrawnMap || version !== tv.lastDrawnVersion;
        if (glassChanged) tv.screen.layers.enable(CRT_LAYER);
        else tv.screen.layers.disable(CRT_LAYER);
        updatePhysicalScreenMaterial(tv.screenMaterial, { map: texture, brightness: .03 + .97 * opacity, opacity });
        tv.lastDrawnMap = texture;
        tv.lastDrawnVersion = version;
        tv.screenMaterial.depthWrite = opacity > .99;
        this._dim(this.mountMaterials[i], .12 + .88 * opacity, opacity);
      }
      this._dim(this.rackMaterials, 1 - .58 * this.focusProgress, 1 - this.focusProgress);
      const progress = this.focusProgress;
      this.productLights.setIntensity(progress);
      this._dim(this.columnMaterials, 1 - .8 * progress, 1 - progress);
      this.rack.column.visible = progress < .999;
      if (this.selected >= 0) {
        const mount = this.rack.mounts[this.selected];
        const foot = this.pedestal.position.copy(mount.neck.position);
        foot.y = -mount.thickness - mount.neckLength + .012;
        foot.applyQuaternion(mount.group.quaternion).add(mount.group.position);
        this.pedestal.quaternion.copy(mount.group.quaternion);
      }
      this.pedestal.visible = progress > .001;
      this._dim(this.pedestalMaterials, .35 + .65 * progress, progress);
      for (const part of this.rack.sharedGroup?.children || []) {
        if (part === this.rack.column) continue;
        const visible = this.focusProgress < .999;
        if (part.visible !== visible) { part.visible = visible; if (this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true; }
      }
    }
    this.renderer.info.reset();
    updatePhysicalLightBudget(this.scene, this.camera);
    const submitStart = performance.now(), shadowUpdate = !!this.renderer.shadowMap?.needsUpdate;
    const inContact = this.contactProgress > 0 && this.contactProgress < 1;
    this.inFlight = moving || inContact;
    const cached = this.retained && !this.forceRender && !moving && !shadowUpdate;
    const drew = !cached || this.tvs.some(tv => tv.group.visible && tv.screen.layers.isEnabled(CRT_LAYER));
    // The default framebuffer keeps its multisampled color and depth. Drawing
    // just the changed glass with LEQUAL preserves the original bezel occlusion,
    // shader, studio reflections, shadows and edge antialiasing.
    if (cached && drew) {
      if (!this.glassCaptured) {
        this.glassCache.capture(CRT_LAYER);
        this.glassCaptured = true;
      }
      this.glassCache.draw(CRT_LAYER);
    } else if (!cached) {
      if (this.inFlight && this.flightBuffer.enabled) this.flightBuffer.render(this.scene, this.camera);
      else this.renderer.render(this.scene, this.camera);
      this.glassCaptured = false;
    }
    this.cached = cached;
    this.retained = !moving && !inContact;
    const settled = (!this.revealed || this.enter === 1) && !this.cameraFlight.active && (this.focusProgress === 0 || this.focusProgress === 1);
    const poseName = settled ? this.selected < 0 ? 'home' : String(this.selected + 1) : 'moving';
    if (this.canvas.dataset.pose !== poseName) this.canvas.dataset.pose = poseName;
    this.renderSubmitMs = performance.now() - submitStart;
    if (drew) {
      this.renderIntervalMs = time - this.lastRenderTime;
      this.lastRenderTime = time;
    }
    this.shadowUpdated = shadowUpdate;
    if (shadowUpdate) this.shadowUpdates = (this.shadowUpdates || 0) + 1;
    this.forceRender = false;
    if (this.diagnostics && drew) {
      this.diagnosticDraws++;
      if (Number.isFinite(this.renderIntervalMs)) this.diagnosticIntervals.push(this.renderIntervalMs);
    }
    const playing = this.contactProgress < .999 && this.media.some(m => m.video && !m.video.paused && !m.video.ended);
    this.videoOnlyFrame = !moving && this.enter >= 1 && playing && !this.pendingPointer;
    if (moving || this.revealed && this.enter < 1 || playing || this.pendingPointer) this._requestFrame(false);
    else if (this.diagnostics) this.diagnostics.textContent = 'WebGL на паузе · кадр сохранён';
  }
  _createDiagnostics() {
    const query = new URLSearchParams(location.search);
    if (!query.has('perf') && !query.has('fps')) return;
    this.diagnosticTicks = 0; this.diagnosticDraws = 0; this.diagnosticIntervals = [];
    this.diagnostics = document.createElement('output');
    this.diagnostics.setAttribute('aria-hidden', 'true');
    Object.assign(this.diagnostics.style, { position: 'fixed', left: '8px', bottom: '8px', zIndex: '1000',
      padding: '6px 8px', background: '#000c', color: '#eee', font: '11px monospace', pointerEvents: 'none', whiteSpace: 'pre' });
    document.body.append(this.diagnostics);
  }
  performanceSnapshot() {
    return { draws: this.renderer.info?.render.calls, triangles: this.renderer.info?.render.triangles,
      textures: this.renderer.info?.memory.textures, geometries: this.renderer.info?.memory.geometries,
      pixelRatio: this.renderer.getPixelRatio?.(), renderedFPS: this.renderedFPS || 0,
      displayFPS: this.displayFPS || 0, frameP95Ms: this.frameP95Ms || 0,
      cache: this.cached ? 'CRT' : this.inFlight ? 'flight' : 'scene', frameIntervalMs: this.renderIntervalMs, rendererSubmitMs: this.renderSubmitMs,
      shadowUpdated: this.shadowUpdated, shadowUpdates: this.shadowUpdates || 0,
      drawingBufferPixels: this.canvas.width * this.canvas.height,
      shadedPixels: this.inFlight && this.flightBuffer?.enabled
        ? this.flightBuffer.target.width * this.flightBuffer.target.height : this.canvas.width * this.canvas.height,
      savedDrawCalls: this.batching.reduce((sum, b) => sum + b.savedDrawCalls, 0), prewarmMs: this.prewarmMs };
  }
  _diagnosticTick(time) {
    this.diagnosticStart ??= time;
    this.diagnosticTicks++;
    const duration = time - this.diagnosticStart;
    if (duration < 1000) return;
    this.renderedFPS = this.diagnosticDraws * 1000 / duration;
    this.displayFPS = this.diagnosticTicks * 1000 / duration;
    const intervals = this.diagnosticIntervals.sort((a, b) => a - b);
    this.frameP95Ms = intervals[Math.floor((intervals.length - 1) * .95)] || 0;
    this.diagnosticStart = time;
    this.diagnosticTicks = 0; this.diagnosticDraws = 0; intervals.length = 0;
    const p = this.performanceSnapshot();
    this.diagnostics.textContent = `${p.renderedFPS.toFixed(0)} fps WebGL · ${p.displayFPS.toFixed(0)} fps rAF · ${p.cache}\n${p.frameP95Ms.toFixed(1)} ms p95 · ${p.draws} draws · ${Math.round(p.triangles / 1000)}k triangles\nDPR ${p.pixelRatio.toFixed(2)} · ${(p.shadedPixels / 1e6).toFixed(2)} MP · ${p.rendererSubmitMs.toFixed(1)} ms CPU`;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.active = false; if (this.frame) cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener('pointermove', this.handleMove); this.canvas.removeEventListener('pointerleave', this.handleLeave); this.canvas.removeEventListener('click', this.handleClick); this.canvas.removeEventListener('webglcontextlost', this.handleContextLoss);
    window.removeEventListener('resize', this.handleResize); document.removeEventListener('visibilitychange', this.handleVisibility);
    for (const m of this.media) if (m.video) { m.video.pause(); m.video.removeAttribute('src'); m.video.load(); }
    this.glassCache?.dispose();
    this.flightBuffer?.dispose();
    const geometries = new Set(), materials = new Set(), textures = new Set(this.resources);
    this.scene.traverse(n => { if (n.geometry) geometries.add(n.geometry); if (n.material) for (const m of Array.isArray(n.material) ? n.material : [n.material]) { materials.add(m); for (const v of Object.values(m)) if (v?.isTexture) textures.add(v); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); this.studio.dispose(); this.renderer.dispose();
    this.diagnostics?.remove();
  }
}
