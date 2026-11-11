import * as THREE from 'three';

// Real light sources and reflections; no image of an object is projected.
export function addPhysicalStudio(scene, renderer, { floorY = -4.45 } = {}) {
  const studio = new THREE.Scene(); studio.background = new THREE.Color(.025, .027, .032);
  const panel = (w, h, p, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.DoubleSide }));
    m.position.set(...p); m.lookAt(0, 0, 0); studio.add(m);
  };
  panel(3, 9, [-6, 6, 7], [7, 4.8, 2.6]); panel(2, 8, [7, 3, 5], [2.6, 2.9, 3.3]);
  panel(10, 2, [0, 9, 0], [3.8, 3.3, 2.7]); panel(2, 8, [-3, 2, -7], [3.8, 2.25, 1.0]); panel(11, 8, [0, 1, 13], [.10, .105, .115]);
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromScene(studio, .035, .1, 100);
  scene.environment = environment.texture;
  studio.traverse(n => { n.geometry?.dispose(); n.material?.dispose(); }); pmrem.dispose();
  const lights = new THREE.Group(); lights.name = 'Physical studio lights';
  lights.add(new THREE.HemisphereLight(0xcad4e5, 0x463323, .26));
  const key = new THREE.DirectionalLight(0xffd7a1, 2.5); key.position.set(-5, 6, 8); key.target.position.set(0, 0, -.5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -7, near: .5, far: 40 });
  key.shadow.bias = -.00025; key.shadow.normalBias = .012; key.shadow.radius = 3; lights.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xbac9de, .38); fill.position.set(6, 3, 7); lights.add(fill);
  const rim = new THREE.DirectionalLight(0xffc078, 1.1); rim.position.set(0, 6, -5); lights.add(rim); scene.add(lights);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ color: 0, opacity: .35, depthWrite: false }));
  floor.name = 'Physical shadow receiver'; floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; floor.receiveShadow = true; scene.add(floor);
  return { environment, lights, key, floor, dispose() { environment.dispose(); floor.geometry.dispose(); floor.material.dispose(); lights.traverse(n => n.shadow?.dispose()); } };
}
