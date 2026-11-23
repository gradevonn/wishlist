import * as THREE from 'three';
import { GLYPHS } from './physical-type.js';

// Pad-printed ink follows the real molded panel. The outlines have physical
// dimensions, survive a close camera, and export as ordinary mesh geometry.
export function makePrintedMark(text, height, color) {
  const shapes = [];
  let cursor = 0;
  for (const letter of text) {
    const [advance, commands] = GLYPHS[letter] || GLYPHS[letter.toUpperCase()] || GLYPHS[' '];
    const path = new THREE.ShapePath();
    for (const [type, ax, ay, bx, by, cx, cy] of commands) {
      if (type === 0) path.moveTo(cursor + ax, ay);
      else if (type === 1) path.lineTo(cursor + ax, ay);
      else if (type === 2) path.quadraticCurveTo(cursor + ax, ay, cursor + bx, by);
      else if (type === 3) path.bezierCurveTo(cursor + ax, ay, cursor + bx, by, cursor + cx, cy);
      else path.currentPath?.closePath();
    }
    shapes.push(...path.toShapes());
    cursor += advance + 22;
  }
  const geometry = new THREE.ShapeGeometry(shapes, 8);
  const scale = height * .80 / 512;
  geometry.translate(-(cursor - 22) / 2, -256, 0);
  geometry.scale(scale, scale, scale);
  const ink = new THREE.MeshStandardMaterial({ color, roughness: .67, metalness: .08 });
  ink.name = 'Pad-printed ' + text;
  const mark = new THREE.Mesh(geometry, ink);
  mark.name = 'printed-' + text;
  mark.userData.printedMark = true;
  return mark;
}

// Printed marks follow their actual panel. A flat decal at a guessed Z was
// cutting into sloping fascias and floating above curved molded surfaces.
export function seatPrintedLabels(root) {
  root.updateMatrixWorld(true);
  const labels = [], surfaces = [];
  root.traverse(node => {
    if (!node.isMesh) return;
    if (node.userData.printedMark) labels.push(node);
    else if (!node.isInstancedMesh && !node.userData.screen && !node.material?.transparent) surfaces.push(node);
  });
  const ray = new THREE.Raycaster(), normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  for (const label of labels) {
    normal.set(0, 0, 1).transformDirection(label.matrixWorld);
    const centre = new THREE.Vector3().setFromMatrixPosition(label.matrixWorld);
    ray.set(centre.clone().addScaledVector(normal, .09), normal.clone().negate()); ray.far = .20;
    const hits = ray.intersectObjects(surfaces, false).filter(hit => {
      if (!hit.face) return false;
      const facing = hit.face.normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld));
      return facing.dot(normal) > .45;
    });
    hits.sort((a, b) => Math.abs(.09 - a.distance) - Math.abs(.09 - b.distance));
    const host = hits[0]?.object; if (!host) continue;
    // Only triangles directly underneath this inscription can receive its ink.
    // Project that small patch into lettering coordinates once. Raycasting the
    // entire cabinet for every curve vertex made vector lettering slow to load.
    const toLabel = new THREE.Matrix4().copy(label.matrixWorld).invert().multiply(host.matrixWorld);
    const geometry = host.geometry, position = geometry.attributes.position, indices = geometry.index;
    const front = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const p = label.geometry.attributes.position;
    label.geometry.computeBoundingBox();
    const { min, max } = label.geometry.boundingBox;
    const scale = new THREE.Vector3().setFromMatrixColumn(label.matrixWorld, 2).length();
    const count = indices ? indices.count : position.count;
    const vertex = (point, i) => point.fromBufferAttribute(position, indices ? indices.getX(i) : i).applyMatrix4(toLabel);
    for (let i = 0; i < count; i += 3) {
      vertex(a, i); vertex(b, i + 1); vertex(c, i + 2);
      if (Math.max(a.x,b.x,c.x) < min.x || Math.min(a.x,b.x,c.x) > max.x ||
          Math.max(a.y,b.y,c.y) < min.y || Math.min(a.y,b.y,c.y) > max.y) continue;
      const bx = b.x - a.x, by = b.y - a.y, cx = c.x - a.x, cy = c.y - a.y;
      const area = bx * cy - by * cx;
      if (area > 1e-12) front.push([a.x, a.y, a.z, bx, by, b.z-a.z, cx, cy, c.z-a.z, 1/area]);
    }
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let top = -Infinity;
      for (const [ax,ay,az,bx,by,bz,cx,cy,cz,invArea] of front) {
        const u = ((x-ax)*cy - (y-ay)*cx) * invArea;
        const v = (bx*(y-ay) - by*(x-ax)) * invArea;
        if (u < -1e-6 || v < -1e-6 || u+v > 1.000001) continue;
        const hit = az + bz*u + cz*v;
        if (hit <= z+.09/scale && hit >= z-.11/scale) top = Math.max(top, hit);
      }
      if (Number.isFinite(top)) p.setZ(i, top+.0015/scale);
    }
    p.needsUpdate = true; label.geometry.computeVertexNormals();
    label.geometry.computeBoundingBox(); label.geometry.computeBoundingSphere();
    label.userData.printedOn = host.name;
    label.userData.printClearance = .0015;
  }
}
