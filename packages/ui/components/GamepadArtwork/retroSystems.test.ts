import { describe, expect, it } from "vitest";
import { getDefaultMapping } from "../ControllerConfig/controller-mappings";
import { mappedRetroInput, retroSystem } from "./retroSystems";

describe("retro control presentation", () => {
  it("poses the remapped target rather than the physical button position", () => {
    const mapping = getDefaultMapping();
    mapping.bindings.find((binding) => binding.retroId === 8)!.gamepadButtonIndex = 4;
    const result = mappedRetroInput(mapping, { 4: true }, { 4: 0.7 }, [], "snes");
    expect(result.buttonStates[8]).toBe(true);
    expect(result.buttonValues[8]).toBe(0.7);
    expect(result.buttonStates[4]).toBe(false);
  });
  it("keeps a mapped D-pad button active when the analog stick is centered", () => {
    const result = mappedRetroInput(getDefaultMapping(), { 15: true }, {}, [0, 0], "nes");
    expect(result.buttonStates[7]).toBe(true);
    expect(result.buttonValues[7]).toBe(1);
  });
  it("shows N64 C buttons from combined mapped buttons and right-stick input", () => {
    const mapping = getDefaultMapping("n64");
    mapping.bindings.find((binding) => binding.retroId === 19)!.gamepadButtonIndex = 5;
    expect(mappedRetroInput(mapping, { 5: true }, {}, [0, 0, -1, 0], "n64").buttonStates[19]).toBe(
      false,
    );
    const right = mappedRetroInput(mapping, { 5: true }, {}, [0, 0, 0.5, 0], "n64");
    expect(right.axisValues[2]).toBe(1);
    expect(right.buttonStates[19]).toBe(true);
    expect(right.buttonStates[18]).toBe(false);
    const up = mappedRetroInput(mapping, {}, {}, [0, 0, 0, -0.9], "n64");
    expect(up.buttonStates[16]).toBe(true);
    expect(up.buttonStates[0]).toBe(false);
  });
  it("uses the target system labels and excludes controls absent from the hardware", () => {
    expect(retroSystem("nes").controls.map((control) => control.label)).not.toContain("L");
    expect(retroSystem("saturn").controls.find((control) => control.id === 11)?.label).toBe("C");
    expect(retroSystem("genesis").controls.find((control) => control.id === 11)?.label).toBe("Z");
    expect(retroSystem("gamecube").controls.find((control) => control.id === 12)?.label).toBe("L");
  });
  it("shows GameCube half presses as half travel without claiming a full digital press", () => {
    const result = mappedRetroInput(getDefaultMapping(), { 10: true }, {}, [], "gamecube");
    expect(result.buttonValues[12]).toBe(0.5);
    expect(result.buttonStates[12]).toBe(false);
    expect(result.buttonStates[14]).toBe(true);
  });
  it.each([
    [0, 17],
    [1, 19],
    [2, 18],
    [3, 16],
  ])("shows physical face button %i as C target %i while mapped R2 is held", (physical, target) => {
    const result = mappedRetroInput(
      getDefaultMapping("n64"),
      { 7: true, [physical]: true },
      {},
      [],
      "n64",
    );
    expect(result.buttonStates[target]).toBe(true);
    expect(result.buttonValues[target]).toBe(1);
    expect(result.buttonStates[0]).toBe(false);
    expect(result.buttonStates[1]).toBe(false);
    expect(result.buttonValues[0]).toBe(0);
    expect(result.buttonValues[1]).toBe(0);
  });
  it("uses remapped R2 mode and preserves analog C input alongside face C input", () => {
    const mapping = getDefaultMapping("n64");
    mapping.bindings.find((binding) => binding.retroId === 13)!.gamepadButtonIndex = 4;
    const result = mappedRetroInput(mapping, { 4: true, 0: true }, {}, [0, 0, -1, 0], "n64");
    expect(result.buttonStates[17]).toBe(true);
    expect(result.buttonStates[18]).toBe(true);
    expect(result.buttonStates[0]).toBe(false);
    const released = mappedRetroInput(mapping, { 0: true }, {}, [], "n64");
    expect(released.buttonStates[0]).toBe(true);
    expect(released.buttonStates[17]).toBe(false);
  });
  it("matches the core integer C-stick threshold after gameplay axis rounding", () => {
    for (const [axis, expected] of [
      [16_384 / 32_767, false],
      [16_385 / 32_767, true],
    ] as const) {
      const result = mappedRetroInput(getDefaultMapping("n64"), {}, {}, [0, 0, axis, -axis], "n64");
      expect(result.buttonStates[19]).toBe(expected);
      expect(result.buttonStates[16]).toBe(expected);
    }
  });
});
