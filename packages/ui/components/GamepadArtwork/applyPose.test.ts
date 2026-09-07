import { describe, expect, it } from "vitest";
import { Euler, Object3D, Quaternion, Vector3 } from "three";
import { applyPose, bindArticulation } from "./applyPose";

describe("authored controller pivot transforms", () => {
  it("presses along a tilted cap's own normal and restores its exact rest pose", () => {
    const node = new Object3D();
    node.position.set(1, 2, 3);
    node.quaternion.setFromEuler(new Euler(0.35, -0.2, 0.1));
    const binding = bindArticulation(node);
    applyPose(binding, { position: [0, 0, -0.015] }, 16, true);
    const expected = new Vector3(0, 0, -0.015)
      .applyQuaternion(binding.restQuaternion)
      .add(binding.restPosition);
    expect(node.position.distanceTo(expected)).toBeLessThan(1e-10);
    expect(node.quaternion.angleTo(binding.restQuaternion)).toBeLessThan(1e-7);
    applyPose(binding, {}, 16, true);
    expect(node.position.toArray()).toEqual([1, 2, 3]);
  });
  it("composes stick tilt after its authored tangent instead of replacing that orientation", () => {
    const node = new Object3D();
    node.quaternion.setFromEuler(new Euler(0.4, -0.2, 0.15));
    const binding = bindArticulation(node);
    applyPose(binding, { rotation: [0.2, -0.3, 0] }, 16, true);
    const expected = binding.restQuaternion
      .clone()
      .multiply(new Quaternion().setFromEuler(new Euler(0.2, -0.3, 0)));
    expect(node.quaternion.angleTo(expected)).toBeLessThan(1e-7);
    applyPose(binding, {}, 16, true);
    expect(node.quaternion.angleTo(binding.restQuaternion)).toBeLessThan(1e-7);
  });
});
