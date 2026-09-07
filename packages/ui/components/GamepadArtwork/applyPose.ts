import { Euler, Quaternion, Vector3, type Object3D } from "three";
import { settle, type ControlPose } from "./articulation";

export function bindArticulation(node: Object3D) {
  return {
    node,
    restPosition: node.position.clone(),
    restQuaternion: node.quaternion.clone(),
    position: new Vector3(),
    rotation: new Euler(),
    quaternion: new Quaternion(),
  };
}

/** Keep the artist's tangent orientation while articulating in the pivot's local space. */
export function applyPose(
  binding: ReturnType<typeof bindArticulation>,
  target: ControlPose,
  elapsed: number,
  reducedMotion: boolean,
) {
  let moving = false;
  for (const [index, axis] of (["x", "y", "z"] as const).entries()) {
    const position = target.position?.[index] ?? 0;
    const rotation = target.rotation?.[index] ?? 0;
    binding.position[axis] = settle(binding.position[axis], position, elapsed, reducedMotion);
    binding.rotation[axis] = settle(binding.rotation[axis], rotation, elapsed, reducedMotion);
    moving ||= binding.position[axis] !== position || binding.rotation[axis] !== rotation;
  }
  binding.node.position
    .copy(binding.position)
    .applyQuaternion(binding.restQuaternion)
    .add(binding.restPosition);
  binding.quaternion.setFromEuler(binding.rotation);
  binding.node.quaternion.copy(binding.restQuaternion).multiply(binding.quaternion);
  return moving;
}
