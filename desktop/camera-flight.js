import * as THREE from 'three';

const HOME_WIDTH = 19.2;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function homeCameraPose() {
  return { position: new THREE.Vector3(0, 0, 30), quaternion: new THREE.Quaternion(), width: HOME_WIDTH };
}

function asVector(value, fallback) {
  return value?.isVector3 ? value.clone() : Array.isArray(value) ? new THREE.Vector3(...value) : fallback.clone();
}

/** A camera normal to the actual selected cabinet face, with off-centre framing. */
export function frontCameraPose({ group, faceFrame, bounds, aspect = 1920 / 956 }) {
  group.updateWorldMatrix(true, true);
  const frame = faceFrame || {};
  const localRight = asVector(frame.right, new THREE.Vector3(1, 0, 0)).normalize();
  const localUp = asVector(frame.up, new THREE.Vector3(0, 1, 0)).normalize();
  const localNormal = asVector(frame.normal, new THREE.Vector3(0, 0, 1)).normalize();
  const rotation = group.getWorldQuaternion(new THREE.Quaternion());
  const right = localRight.applyQuaternion(rotation).normalize();
  const normal = localNormal.applyQuaternion(rotation).normalize();
  const up = new THREE.Vector3().crossVectors(normal, right).normalize();
  right.crossVectors(up, normal).normalize();
  // Keep the handedness and authored top of the front face.
  if (up.dot(localUp.applyQuaternion(rotation)) < 0) { up.negate(); right.negate(); }

  const box = bounds?.isBox3 ? bounds.clone() : new THREE.Box3(
    new THREE.Vector3(-frame.width / 2 || -1, -frame.height / 2 || -1, -.6),
    new THREE.Vector3(frame.width / 2 || 1, frame.height / 2 || 1, .1),
  );
  const centre = box.getCenter(new THREE.Vector3()).applyMatrix4(group.matrixWorld);
  const extents = new THREE.Box3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(group.matrixWorld).sub(centre);
    extents.expandByPoint(new THREE.Vector3(p.dot(right), p.dot(up), p.dot(normal)));
  }
  const size = extents.getSize(new THREE.Vector3());
  // Cabinet fits the left project area, with its own support continuing below.
  const width = Math.max(size.x / (780 / 1920), size.y * aspect / (620 / 956), .5);
  const height = width / aspect;
  const aim = centre.clone()
    .addScaledVector(right, (.5 - 690 / 1920) * width)
    .addScaledVector(up, (480 / 956 - .5) * height);
  const distance = Math.max(6, size.z + 4);
  const position = aim.clone().addScaledVector(normal, distance);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
  return { position, quaternion, width, aim, normal, right, up, distance };
}

/** Moves the real camera and its projection. Scene objects are never scaled. */
export class CameraFlight {
  constructor(camera, aspect = 1920 / 956) {
    this.camera = camera; this.aspect = aspect; this.width = camera.right - camera.left;
    this.active = false; this.progress = 1; this.duration = .85;
    this.from = this._snapshot(); this.target = this._snapshot();
    this._projection();
  }
  _snapshot() {
    return { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), width: this.width };
  }
  _projection() {
    const camera = this.camera;
    camera.left = -this.width / 2; camera.right = this.width / 2;
    camera.top = this.width / this.aspect / 2; camera.bottom = -camera.top;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  setAspect(aspect) {
    this.aspect = Math.max(.1, aspect); this._projection();
  }
  moveTo(pose, { instant = false, duration = .85 } = {}) {
    this.from = this._snapshot();
    this.target = { position: pose.position.clone(), quaternion: pose.quaternion.clone(), width: pose.width };
    this.duration = Math.max(.01, duration); this.progress = instant ? 1 : 0; this.active = !instant;
    if (instant) this._apply(1);
  }
  _apply(t) {
    const f = ease(t);
    this.camera.position.lerpVectors(this.from.position, this.target.position, f);
    this.camera.quaternion.slerpQuaternions(this.from.quaternion, this.target.quaternion, f);
    this.width = THREE.MathUtils.lerp(this.from.width, this.target.width, f);
    this._projection();
  }
  update(dt, instant = false) {
    if (!this.active) return false;
    this.progress = instant ? 1 : Math.min(1, this.progress + Math.max(0, dt) / this.duration);
    this._apply(this.progress);
    if (this.progress === 1) this.active = false;
    return this.active;
  }
}
