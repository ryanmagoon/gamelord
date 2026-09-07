import { describe, expect, it } from "vitest";
import { defaultUIBindings, GamepadCommands, remapUIBinding } from "./gamepadCommands";

function pad(buttons: Array<number> = [], axes = [0, 0], index = 0): Gamepad {
  return {
    id: `Xbox ${index}`,
    index,
    connected: true,
    mapping: "standard",
    timestamp: 0,
    vibrationActuator: null as unknown as GamepadHapticActuator,
    hapticActuators: [],
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: buttons.includes(i),
      touched: false,
      value: buttons.includes(i) ? 1 : 0,
    })),
  } as Gamepad;
}

describe("controller UI commands", () => {
  it("requires release after connecting or re-enabling with a held button", () => {
    const input = new GamepadCommands();
    expect(input.sample([pad([0])], 0, true, defaultUIBindings)).toEqual([]);
    input.sample([pad()], 1, true, defaultUIBindings);
    expect(input.sample([pad([0])], 2, true, defaultUIBindings).map((e) => e.command)).toEqual([
      "confirm",
    ]);
    input.sample([pad([0])], 3, false, defaultUIBindings);
    expect(input.sample([pad([0])], 4, true, defaultUIBindings)).toEqual([]);
  });
  it("repeats directions after a delay but never repeats confirm", () => {
    const input = new GamepadCommands();
    input.sample([pad()], 0, true, defaultUIBindings);
    expect(input.sample([pad([0, 13])], 1, true, defaultUIBindings)).toHaveLength(2);
    expect(input.sample([pad([0, 13])], 300, true, defaultUIBindings)).toEqual([]);
    expect(
      input.sample([pad([0, 13])], 401, true, defaultUIBindings).map((e) => e.command),
    ).toEqual(["down"]);
    expect(
      input.sample([pad([0, 13])], 491, true, defaultUIBindings).map((e) => e.command),
    ).toEqual(["down"]);
  });
  it("stops repeat immediately on disconnect, including sparse gamepad indices", () => {
    const input = new GamepadCommands();
    input.sample([null, null, pad([], [0, 0], 2)], 0, true, defaultUIBindings);
    expect(
      input.sample([null, null, pad([13], [0, 0], 2)], 1, true, defaultUIBindings),
    ).toHaveLength(1);
    expect(input.sample([], 500, true, defaultUIBindings)).toEqual([]);
    expect(input.sample([null, null, pad([13], [0, 0], 2)], 600, true, defaultUIBindings)).toEqual(
      [],
    );
  });
  it("combines physical d-pad and stick without duplicate commands", () => {
    const input = new GamepadCommands();
    input.sample([pad()], 0, true, defaultUIBindings);
    expect(
      input.sample([pad([15], [0.9, 0.6])], 1, true, defaultUIBindings).map((e) => e.command),
    ).toEqual(["right"]);
    expect(input.sample([pad([], [0.9, 0.6])], 2, true, defaultUIBindings)).toEqual([]);
  });
  it("swaps conflicting bindings so back remains reachable", () => {
    expect(remapUIBinding(defaultUIBindings, "confirm", 1)).toMatchObject({ confirm: 1, back: 0 });
  });
});

describe("gameplay menu ownership", () => {
  it("leaves short Start and Select presses to gameplay", () => {
    const input = new GamepadCommands();
    input.sample([pad()], 0, true, defaultUIBindings, true);
    expect(input.sample([pad([9])], 1, true, defaultUIBindings, true)).toEqual([]);
    input.sample([pad()], 2, true, defaultUIBindings, true);
    expect(input.sample([pad([8])], 3, true, defaultUIBindings, true)).toEqual([]);
  });
  it.each([8, 9])("opens once for the chord starting with button %i", (first) => {
    const input = new GamepadCommands();
    input.sample([pad()], 0, true, defaultUIBindings, true);
    input.sample([pad([first])], 1, true, defaultUIBindings, true);
    expect(
      input.sample([pad([0, 8, 9])], 2, true, defaultUIBindings, true).map((e) => e.command),
    ).toEqual(["menu"]);
    expect(input.sample([pad([8, 9])], 1000, true, defaultUIBindings, true)).toEqual([]);
  });
  it("reserves Home and the fixed chord despite customized UI bindings", () => {
    const input = new GamepadCommands();
    const bindings = remapUIBinding(defaultUIBindings, "menu", 2);
    input.sample([pad()], 0, true, bindings, true);
    expect(input.sample([pad([2])], 1, true, bindings, true)).toEqual([]);
    expect(input.sample([pad([16])], 2, true, bindings, true).map((e) => e.command)).toEqual([
      "menu",
    ]);
    input.sample([pad()], 3, true, bindings, true);
    expect(input.sample([pad([8, 9])], 4, true, bindings, true).map((e) => e.command)).toEqual([
      "menu",
    ]);
  });
  it("consumes held menu input across gameplay, capture, and connection transitions", () => {
    const input = new GamepadCommands();
    input.sample([pad()], 0, true, defaultUIBindings, true);
    input.sample([pad([8, 9])], 1, true, defaultUIBindings, true);
    expect(input.sample([pad([8, 9])], 2, true, defaultUIBindings, false)).toEqual([]);
    expect(input.sample([pad([8, 9])], 3, true, defaultUIBindings, true)).toEqual([]);
    input.sample([pad([8, 9])], 4, false, defaultUIBindings, true);
    expect(input.sample([pad([8, 9])], 5, true, defaultUIBindings, true)).toEqual([]);
    input.sample([], 6, true, defaultUIBindings, true);
    expect(input.sample([pad([8, 9])], 7, true, defaultUIBindings, true)).toEqual([]);
    input.sample([pad()], 8, true, defaultUIBindings, true);
    expect(input.sample([pad([8, 9])], 9, true, defaultUIBindings, true)).toHaveLength(1);
  });
  it("does not combine chord members from separate controllers", () => {
    const input = new GamepadCommands();
    input.sample([pad(), pad([], [0, 0], 1)], 0, true, defaultUIBindings, true);
    expect(input.sample([pad([8]), pad([9], [0, 0], 1)], 1, true, defaultUIBindings, true)).toEqual(
      [],
    );
    expect(
      input.sample([pad([8]), pad([8, 9], [0, 0], 1)], 2, true, defaultUIBindings, true),
    ).toEqual([{ command: "menu", controllerId: "Xbox 1" }]);
  });
});
