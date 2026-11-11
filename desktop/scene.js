import * as THREE from 'three';
import { buildPhysicalTelevision } from './physical-tv.js?v=20261111-details-final2';
import { buildPhysicalRack } from './physical-rack.js?v=20261111-details-final2';
import { createPhysicalScreenMaterial, updatePhysicalScreenMaterial } from './physical-screen.js?v=20261111-details-final2';
import { CameraFlight, homeCameraPose, frontCameraPose } from './camera-flight.js?v=20261111-details-final2';
import { addPhysicalStudio } from './studio-light.js?v=20261111-details-final2';
import { PHYSICAL_INSTALLATION as INSTALLATION } from './installation.js?v=20261111-details-final2';
import { contactSceneState } from './contact-motion.js?v=20261111-retreat';

const asset = name => new URL(name, import.meta.url).href;
const damp = (a, b, dt, speed = 9) => a + (b - a) * (1 - Math.exp(-dt * speed));

export class DesktopScene {
  constructor({ canvas, projects, onSelect = () => {}, onHover = () => {}, onReady = () => {} }) {
    Object.assign(this, { canvas, projects, onSelect, onHover, onReady });
    this.active = true; this.ready = false; this.revealed = false; this.disposed = false;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.selected = -1; this.hovered = -1; this.enter = 0; this.focusProgress = 0; this.contactProgress = 0;
    this.frame = null; this.lastTime = 0; this.tvs = []; this.media = []; this.resources = new Set(); this.pickMeshes = [];
    this.pointer = new THREE.Vector2(); this.raycaster = new THREE.Raycaster();
    this.scene = new THREE.Scene(); this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(26, 1, .05, 180); this.cameraFlight = new CameraFlight(this.camera);
    const homePose = homeCameraPose();
    this.retreatDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(homePose.quaternion);
    this.retreatViewDistance = -homePose.position.dot(this.retreatDirection);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0, 0); this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.stage = new THREE.Group(); this.stage.name = 'One physical television installation'; this.scene.add(this.stage);
    this.studio = addPhysicalStudio(this.scene, this.renderer);
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
    return [...originals.values()].map(material => ({ material, color: material.color?.clone(), emissive: material.emissive?.clone(), env: material.envMapIntensity ?? 1 }));
  }
  async _load() {
    const posters = await Promise.all(this.projects.map(p => this._texture(asset(`../assets/work/${p.media}.jpg`))));
    if (this.disposed) return;
    const placements = [];
    for (let i = 0; i < Math.min(10, this.projects.length); i++) {
      const model = buildPhysicalTelevision(i), [x, y, z, angle, scale] = INSTALLATION[i];
      const assembly = new THREE.Group(); assembly.name = `TV ${i + 1} — ${this.projects[i].media}`;
      assembly.position.set(x, y, z); assembly.rotation.y = THREE.MathUtils.degToRad(angle);
      model.group.scale.setScalar(scale); assembly.add(model.group);
      const oldScreenMaterial = model.screen.material;
      model.screen.material = createPhysicalScreenMaterial(posters[i], model.screenAspect, { brightness: 1 });
      oldScreenMaterial?.dispose(); model.screen.castShadow = false;
      const records = this._materials(model.group), screenMaterial = model.screen.material;
      model.group.traverse(n => { if (n.isMesh) { n.userData.projectIndex = i; this.pickMeshes.push(n); } });
      const dimensions = Object.fromEntries(Object.entries(model.dimensions).map(([key, value]) => [key, value * scale]));
      placements.push({ index: i, position: assembly.position.clone(), quaternion: assembly.quaternion.clone(), yaw: assembly.rotation.y, dimensions });
      this.stage.add(assembly);
      this.tvs.push({ index: i, model, group: assembly, body: model.group, screen: model.screen, screenMaterial, materials: records, opacity: 1 });
      this.media.push(this._medium(this.projects[i], posters[i]));
    }
    this.rack = buildPhysicalRack({ placements }); this.stage.add(this.rack.group);
    this.rackMaterials = this._materials(this.rack.sharedGroup || this.rack.group);
    this.columnMaterials = this.rack.column ? this._materials(this.rack.column) : [];
    this.mountMaterials = this.rack.mounts.map(mount => this._materials(mount.group));
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
      this._updatePlayback(); this._requestFrame();
    });
    v.addEventListener('playing', () => { this._updatePlayback(); this._requestFrame(); }); m.video = v; return m;
  }
  _flyToSelected(options = {}) {
    const tv = this.tvs[this.selected]; if (!tv) return;
    const pose = frontCameraPose({ model: tv.model, body: tv.body, camera: this.camera });
    this.cameraFlight.moveTo(pose, { ...options, instant: options.instant || this.reducedMotion });
  }
  _interactive() { return this.active && this.ready && this.revealed && this.selected < 0 && this.contactProgress <= .01 && !this.cameraFlight.active; }
  _pick(clientX, clientY, objects = this.pickMeshes) {
    const b = this.canvas.getBoundingClientRect(); if (!b.width || !b.height) return null;
    this.camera.updateMatrixWorld(true); this.scene.updateMatrixWorld(true);
    this.pointer.set((clientX - b.left) / b.width * 2 - 1, 1 - (clientY - b.top) / b.height * 2); this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objects, false)[0] || null;
  }
  hitTestSelected(clientX, clientY) {
    if (!this.ready || this.selected < 0 || this.contactProgress > .01) return false;
    const meshes = [];
    for (const root of [this.tvs[this.selected].group, this.rack.mounts[this.selected]?.group, this.rack.column]) root?.traverse(n => { if (n.isMesh && n.visible) meshes.push(n); });
    return !!this._pick(clientX, clientY, meshes);
  }
  _clearHover() { const changed = this.hovered !== -1; this.hovered = -1; this.canvas.style.cursor = 'default'; if (changed) this.onHover(null); }
  _hover(clientX, clientY) {
    if (!this._interactive()) { this._clearHover(); return; }
    const hit = this._pick(clientX, clientY), next = hit?.object.userData.projectIndex ?? -1;
    if (next !== this.hovered) { this.hovered = next; this.canvas.style.cursor = next < 0 ? 'default' : 'pointer'; this.onHover(next < 0 ? null : next); this._updatePlayback(); }
  }
  _bind() {
    this.handleMove = e => { this.pendingPointer = [e.clientX, e.clientY]; this._requestFrame(); };
    this.handleLeave = () => { this.pendingPointer = null; this._clearHover(); this._updatePlayback(); this._requestFrame(); };
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
  reveal() { this.revealed = true; this.enter = this.reducedMotion ? 1 : 0; this._updatePlayback(); this._requestFrame(); }
  focus(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.projects.length) return;
    if (this.selected === i && this.ready) return;
    this.selected = i; this._clearHover(); this._flyToSelected(); this._updatePlayback(); this._requestFrame();
  }
  reset() {
    const hadFocus = this.selected >= 0; this.selected = -1; this._clearHover();
    if (hadFocus) this.cameraFlight.moveTo(homeCameraPose(), { instant: this.reducedMotion });
    this._updatePlayback(); this._requestFrame();
  }
  setContactProgress(progress) { this.contactProgress = THREE.MathUtils.clamp(Number(progress) || 0, 0, 1); if (this.contactProgress > .01) this._clearHover(); this._updatePlayback(); this._requestFrame(); }
  setActive(value) {
    this.active = !!value; if (!this.active && this.frame) { cancelAnimationFrame(this.frame); this.frame = null; this.lastTime = 0; }
    this._updatePlayback(); this._requestFrame();
  }
  setReducedMotion(value) { this.reducedMotion = !!value; if (value) { this.enter = 1; this.cameraFlight.update(0, true); } this._updatePlayback(); this._requestFrame(); }
  resize() {
    this.width = this.canvas.clientWidth || innerWidth; this.height = this.canvas.clientHeight || innerHeight; this.cameraFlight.setAspect(this.width / this.height);
    if (this.selected >= 0 && this.ready) this._flyToSelected({ duration: .25 });
    this.renderer.setSize(this.width, this.height, false); this._requestFrame();
  }
  getHitRects() { return this.tvs.map(tv => { const b = new THREE.Box3().setFromObject(tv.group), c = b.getCenter(new THREE.Vector3()).project(this.camera), s = b.getSize(new THREE.Vector3()); return { index: tv.index, x: (c.x + 1) / 2, y: (1 - c.y) / 2, width: s.x / 19.2, height: s.y / (19.2 * this.height / this.width) }; }); }
  _requestFrame() { if (!this.frame && this.active && !document.hidden && !this.disposed) this.frame = requestAnimationFrame(this._render); }
  _dim(records, value, opacity = 1) { for (const { material: m, color, emissive, env } of records) { if (color) m.color.copy(color).multiplyScalar(value); if (emissive) m.emissive.copy(emissive).multiplyScalar(value); if ('envMapIntensity' in m) m.envMapIntensity = env * value; m.opacity = opacity; m.transparent = opacity < .999; m.depthWrite = opacity > .99; } }
  _render(time) {
    this.frame = null; if (!this.active || document.hidden || this.disposed) { this.lastTime = 0; return; }
    const dt = Math.min((time - (this.lastTime || time - 16)) / 1000, .04); this.lastTime = time;
    let moving = this.cameraFlight.update(dt, this.reducedMotion);
    if (this.ready) {
      if (this.revealed) this.enter = Math.min(1, this.enter + dt / .6);
      const contact = contactSceneState(this.contactProgress, this.retreatViewDistance);
      this.canvas.style.opacity = this.revealed ? String((1 - Math.pow(1 - this.enter, 3)) * contact.opacity) : '0';
      const target = this.selected >= 0 ? 1 : 0; this.focusProgress = this.reducedMotion ? target : damp(this.focusProgress, target, dt);
      if (Math.abs(this.focusProgress - target) < .001) this.focusProgress = target; else moving = true;
      this.stage.position.copy(this.retreatDirection).multiplyScalar(contact.depth);
      this.stage.rotation.set(0, 0, 0);
      this.stage.visible = contact.opacity > .001;
      if (this.pendingPointer) { const p = this.pendingPointer; this.pendingPointer = null; this._hover(...p); }
      for (let i = 0; i < this.tvs.length; i++) {
        const tv = this.tvs[i], media = this.media[i], selected = i === this.selected;
        const targetOpacity = this.selected < 0 || selected ? 1 : 0;
        tv.opacity = this.reducedMotion ? targetOpacity : damp(tv.opacity, targetOpacity, dt);
        if (Math.abs(tv.opacity - targetOpacity) < .001) tv.opacity = targetOpacity; else moving = true;
        const opacity = tv.opacity;
        tv.group.visible = opacity > .001;
        this.rack.mounts[i].group.visible = opacity > .001;
        this._dim(tv.materials.filter(r => r.material !== tv.screenMaterial), .06 + .94 * opacity, opacity);
        updatePhysicalScreenMaterial(tv.screenMaterial, { map: this.reducedMotion ? media.poster : media.texture, brightness: .03 + .97 * opacity, opacity });
        tv.screenMaterial.depthWrite = opacity > .99;
        this._dim(this.mountMaterials[i], .12 + .88 * opacity, opacity);
      }
      this._dim(this.rackMaterials, 1 - .58 * this.focusProgress, 1 - this.focusProgress);
      this._dim(this.columnMaterials, 1 - .8 * this.focusProgress);
    }
    this.renderer.render(this.scene, this.camera);
    const playing = this.contactProgress < .999 && this.media.some(m => m.video && !m.video.paused && !m.video.ended);
    if (moving || this.revealed && this.enter < 1 || playing || this.pendingPointer) this._requestFrame();
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.active = false; if (this.frame) cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener('pointermove', this.handleMove); this.canvas.removeEventListener('pointerleave', this.handleLeave); this.canvas.removeEventListener('click', this.handleClick); this.canvas.removeEventListener('webglcontextlost', this.handleContextLoss);
    window.removeEventListener('resize', this.handleResize); document.removeEventListener('visibilitychange', this.handleVisibility);
    for (const m of this.media) if (m.video) { m.video.pause(); m.video.removeAttribute('src'); m.video.load(); }
    const geometries = new Set(), materials = new Set(), textures = new Set(this.resources);
    this.scene.traverse(n => { if (n.geometry) geometries.add(n.geometry); if (n.material) for (const m of Array.isArray(n.material) ? n.material : [n.material]) { materials.add(m); for (const v of Object.values(m)) if (v?.isTexture) textures.add(v); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); this.studio.dispose(); this.renderer.dispose();
  }
}
