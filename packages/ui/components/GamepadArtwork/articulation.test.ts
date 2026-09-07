import { describe, expect, it, vi } from "vitest";
import {
  buttonAmount,
  controlPose,
  readControlMetadata,
  dpadButtonAtPoint,
  createDemandLoop,
  settle,
} from "./articulation";

describe("controller articulation", () => {
  it("uses the asset's trigger ID without turning mapping selection into a press", () => {
    const trigger = readControlMetadata({ gamepadButtonIndex: 12, hingeAxis: "X" })!;
    const pose = controlPose(trigger, { buttonValues: { 12: 0.5 }, highlightedButton: 0 });
    expect(pose.rotation?.[0]).toBeCloseTo(0.14);
    const button = readControlMetadata({ gamepadButtonIndex: 0 })!;
    expect(controlPose(button, { highlightedButton: 0 }).position?.[2]).toBeCloseTo(0);
    expect(buttonAmount({ buttonStates: { 12: true }, buttonValues: { 12: 0.2 } }, 12)).toBe(0.2);
  });
  it("tilts only the authored stick axes, preserving separate click travel and clamping bad values", () => {
    const left = readControlMetadata({ axisIndices: [0, 1], gamepadButtonIndex: 14 })!;
    const right = readControlMetadata({ axisIndices: [2, 3] })!;
    const input = { axisValues: [2, -1, Number.NaN, Infinity], buttonStates: { 14: true } };
    expect(controlPose(left, input).rotation).toEqual([-0.3, 0.3, 0]);
    expect(controlPose(left, input).position?.[2]).toBe(-0.015);
    expect(controlPose(right, input).rotation).toEqual([0, 0, 0]);
  });
  it("slides a PSP nub in its local plane without inventing a second stick or tilt", () => {
    const nub = readControlMetadata({
      axisIndices: [0, 1],
      axisMode: "translate",
      axisTravel: 0.022,
    })!;
    const pose = controlPose(nub, { axisValues: [1, -0.5] });
    expect(pose.position).toEqual([0.022, 0.011, 0]);
    expect(pose.rotation).toEqual([0, 0, 0]);
  });
  it("rocks a retro dpad using its semantic directions and avoids pressing rocker children twice", () => {
    const rocker = readControlMetadata({ controlRole: "dpad" })!;
    expect(controlPose(rocker, { buttonStates: { 4: true, 5: true, 6: true } }).rotation).toEqual([
      0, -0.09, 0,
    ]);
    expect(controlPose(rocker, { buttonStates: { 12: true } }).rotation).toEqual([0, 0, 0]);
    const up = readControlMetadata({ dpadDirection: "up" })!;
    expect(up.buttonIndex).toBe(4);
    expect(controlPose(up, { buttonStates: { 4: true } }, true).position).toEqual([0, 0, 0]);
    expect(controlPose(up, { buttonStates: { 4: true } }).position?.[2]).toBe(-0.015);
    expect(dpadButtonAtPoint(0.2, 0.1)).toBe(7);
  });
  it("accepts virtual N64 C controls and rejects malformed metadata", () => {
    const cRight = readControlMetadata({ gamepadButtonIndex: 19 })!;
    expect(controlPose(cRight, { buttonStates: { 19: true } }).position?.[2]).toBe(-0.015);
    expect(
      readControlMetadata({ gamepadButtonIndex: "0", axisIndices: [Number.NaN, 1] }),
    ).toBeNull();
    expect(readControlMetadata({ gamepadButtonIndex: -1 })).toBeNull();
  });
  it("settles fully and honors reduced motion", () => {
    let current = 0;
    let frames = 0;
    while (current !== 0.3 && frames < 100) {
      current = settle(current, 0.3, 16, false);
      frames++;
    }
    expect(current).toBe(0.3);
    expect(frames).toBeLessThan(20);
    expect(settle(0, 0.3, 1, true)).toBe(0.3);
  });
  it("coalesces input bursts, stops idle draws, and cancels disposal", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let id = 0;
    const request = vi.fn((callback: FrameRequestCallback) => {
      callbacks.set(++id, callback);
      return id;
    });
    const cancel = vi.fn((frame: number) => callbacks.delete(frame));
    const draw = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const loop = createDemandLoop(draw, request, cancel);
    loop.invalidate();
    loop.invalidate();
    loop.invalidate();
    expect(request).toHaveBeenCalledTimes(1);
    callbacks.get(1)!(16);
    callbacks.get(2)!(32);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(2);
    loop.invalidate();
    loop.dispose();
    expect(cancel).toHaveBeenCalledWith(3);
    callbacks.get(2)!(48);
    loop.invalidate();
    expect(draw).toHaveBeenCalledTimes(2);
  });
});
