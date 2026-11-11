import * as THREE from 'three';

export const HOME_WIDTH = 19.2;
const HOME_POSITION = new THREE.Vector3(0, 2.4, 23);
const HOME_TARGET = new THREE.Vector3(0, 0, -.5);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function homeCameraPose() {
  return {
    position: HOME_POSITION.clone(),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(HOME_POSITION, HOME_TARGET, new THREE.Vector3(0, 1, 0))),
    filmOffset: 0,
  };
}

// A lens shift frames the subject beside the HTML while the camera itself
// stays on the normal of its real front face. No object is warped or replaced.
export function frontCameraPose({ model, body, camera }) {
  body.updateWorldMatrix(true, true);
  const local = model.bounds?.isBox3 ? model.bounds : new THREE.Box3(
    new THREE.Vector3(-model.dimensions.width / 2, 0, -model.dimensions.depth),
    new THREE.Vector3(model.dimensions.width / 2, model.dimensions.height, .1),
  );
  const scale = body.getWorldScale(new THREE.Vector3());
  const rotation = body.getWorldQuaternion(new THREE.Quaternion());
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
  const size = local.getSize(new THREE.Vector3()).multiply(scale);
  const centre = local.getCenter(new THREE.Vector3()); centre.z = local.max.z; centre.applyMatrix4(body.matrixWorld);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect;
  const distance = Math.max(size.x / (2 * tanH * (780 / 1920)), size.y / (2 * tanV * (620 / 956)), 2.3);
  return {
    position: centre.clone().addScaledVector(normal, distance),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal)),
    filmOffset: (1 - 2 * 690 / 1920) * tanH * camera.getFilmWidth(),
    normal, centre, distance,
  };
}

export class CameraFlight {
  constructor(camera, aspect = 1920 / 956) {
    this.camera = camera; this.active = false; this.progress = 1;
    const pose = homeCameraPose(); camera.position.copy(pose.position); camera.quaternion.copy(pose.quaternion);
    this.setAspect(aspect); this.from = this.snapshot(); this.target = this.snapshot();
  }
  snapshot() { return { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), filmOffset: this.camera.filmOffset }; }
  setAspect(aspect) {
    this.camera.aspect = Math.max(.1, aspect);
    const width = Math.max(HOME_WIDTH, 9.56 * this.camera.aspect);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(width / (2 * HOME_POSITION.distanceTo(HOME_TARGET) * this.camera.aspect)));
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld(true);
  }
  moveTo(pose, { instant = false, duration = .95 } = {}) {
    this.from = this.snapshot(); this.target = { position: pose.position.clone(), quaternion: pose.quaternion.clone(), filmOffset: pose.filmOffset || 0 };
    this.duration = Math.max(.01, duration); this.progress = instant ? 1 : 0; this.active = !instant;
    if (instant) this.apply(1);
  }
  apply(t) {
    const f = ease(t), c = this.camera;
    c.position.lerpVectors(this.from.position, this.target.position, f);
    c.quaternion.slerpQuaternions(this.from.quaternion, this.target.quaternion, f);
    c.filmOffset = THREE.MathUtils.lerp(this.from.filmOffset, this.target.filmOffset, f);
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
  }
  update(dt, instant = false) {
    if (!this.active) return false;
    this.progress = instant ? 1 : Math.min(1, this.progress + Math.max(0, dt) / this.duration);
    this.apply(this.progress); if (this.progress === 1) this.active = false; return this.active;
  }
}
