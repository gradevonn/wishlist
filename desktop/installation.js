import * as THREE from 'three';

// Position, yaw, uniform physical scale, roll and pitch, fixed for each set.
// Cabinet proportions belong to the model itself. The installation must never
// stretch a finished television: circular knobs and the CRT retain their shape
// when the camera leaves the reference view. The repeated scale components
// preserve the export format used by the editable Blender/GLB pipeline.
export const PHYSICAL_INSTALLATION = [
  [-2.98348, 1.90051, -0.08, -24.22306, [0.87637, 0.87637, 0.87637], 3.24407, -0.99459],
  [-0.04774, 2.01729, -0.18, -2.67005, [1.05004, 1.05004, 1.05004], -0.04479, 0.67476],
  [2.95126, 1.86356, -0.04, 29.9555, [0.94111, 0.94111, 0.94111], -2.83888, -1.6628],
  [-4.8655, -0.29506, 0.05, -33.19685, [1.02292, 1.02292, 1.02292], -0.38536, -2.40984],
  [-1.77852, -0.35124, 0.03, -15.77386, [0.96369, 0.96369, 0.96369], 1.24902, -4.75792],
  [1.79582, -0.38071, 0.06, 18.11599, [0.94587, 0.94587, 0.94587], -1.00619, -4.26545],
  [4.82516, -0.34065, 0.08, 26.24264, [0.9548, 0.9548, 0.9548], -0.58217, -6.2962],
  [-3.89305, -3.17968, 0.33, -21.07268, [1.02782, 1.02782, 1.02782], -1.84217, -1.4085],
  [0.07557, -3.58171, 0.44, 0.48888, [1.00933, 1.00933, 1.00933], 0.75714, -5.6901],
  [4.0893, -3.20605, 0.33, 29.86071, [0.97048, 0.97048, 0.97048], -0.21751, -3.02337],
];

export function placePhysicalTelevision(model, index) {
  const [x, y, z, yaw, [width, height, depth], roll, pitch] = PHYSICAL_INSTALLATION[index];
  if (!(Number.isFinite(width) && width > 0) || width !== height || width !== depth) {
    throw new RangeError('Television placement requires one uniform positive scale.');
  }
  const radians = THREE.MathUtils.degToRad;
  const assembly = new THREE.Group();
  assembly.position.set(x, y, z);
  assembly.rotation.set(radians(pitch), radians(yaw), radians(roll), 'YXZ');
  model.group.scale.setScalar(width);
  assembly.add(model.group);
  const dimensions = {
    width: model.dimensions.width * width,
    height: model.dimensions.height * height,
    depth: model.dimensions.depth * depth,
  };
  return {
    assembly,
    placement: { index, position: assembly.position.clone(), quaternion: assembly.quaternion.clone(), dimensions },
    screenAspect: model.screenAspect,
  };
}
