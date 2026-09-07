import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ControllerNavigation } from "./ControllerNavigation";
import { defaultUIBindings, UI_BINDINGS_KEY } from "../../lib/navigation/gamepadCommands";

let frame: FrameRequestCallback;
let pad: Gamepad;
beforeEach(() => {
  localStorage.clear();
  pad = {
    id: "DualSense",
    index: 0,
    mapping: "standard",
    connected: true,
    axes: [0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  } as unknown as Gamepad;
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  vi.stubGlobal("navigator", { getGamepads: () => [pad] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("recognizes controller modality on a held connection without activating its button", () => {
  const menu = vi.fn();
  (pad.buttons[9] as { pressed: boolean }).pressed = true;
  render(<ControllerNavigation enabled onMenu={menu} />);
  act(() => frame(0));
  expect(document.documentElement.dataset.inputDevice).toBe("gamepad");
  expect(screen.getByLabelText("Controller shortcuts")).toBeDefined();
  expect(menu).not.toHaveBeenCalled();
});
it("updates visible glyphs immediately after menu bindings change", () => {
  (pad.buttons[9] as { pressed: boolean }).pressed = true;
  render(<ControllerNavigation enabled onMenu={() => {}} />);
  act(() => frame(0));
  const prompts = screen.getByLabelText("Controller shortcuts");
  expect(within(prompts).getByRole("img", { name: "Cross" })).toBeDefined();
  act(() => {
    localStorage.setItem(
      UI_BINDINGS_KEY,
      JSON.stringify({ ...defaultUIBindings, confirm: 2, context: 0 }),
    );
    window.dispatchEvent(new Event("gamelord:ui-bindings"));
  });
  expect(within(prompts).getByRole("img", { name: "Square" })).toBeDefined();
  expect(within(prompts).queryByRole("img", { name: "Cross" })).toBeNull();
});
