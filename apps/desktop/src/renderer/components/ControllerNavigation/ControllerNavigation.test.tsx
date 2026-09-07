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

it("keeps Start in gameplay and opens the overlay with Select plus Start", () => {
  const menu = vi.fn();
  const { rerender } = render(<ControllerNavigation enabled gameplay onMenu={menu} />);
  act(() => frame(0));
  act(() => {
    (pad.buttons[9] as { pressed: boolean }).pressed = true;
    frame(1);
  });
  expect(menu).not.toHaveBeenCalled();
  act(() => {
    (pad.buttons[0] as { pressed: boolean }).pressed = true;
    (pad.buttons[8] as { pressed: boolean }).pressed = true;
    frame(2);
  });
  expect(menu).toHaveBeenCalledOnce();
  rerender(<ControllerNavigation enabled gameplay={false} onMenu={menu} />);
  act(() => frame(3));
  expect(menu).toHaveBeenCalledOnce();
});

it.each([true, false])("keeps Home available with gameplay=%s", (gameplay) => {
  const menu = vi.fn();
  render(<ControllerNavigation enabled gameplay={gameplay} onMenu={menu} />);
  act(() => frame(0));
  act(() => {
    (pad.buttons[16] as { pressed: boolean }).pressed = true;
    frame(1);
  });
  expect(menu).toHaveBeenCalledOnce();
});
it("keeps the configured single-button menu shortcut in the library", () => {
  const menu = vi.fn();
  render(<ControllerNavigation enabled onMenu={menu} />);
  act(() => frame(0));
  act(() => {
    (pad.buttons[9] as { pressed: boolean }).pressed = true;
    frame(1);
  });
  expect(menu).toHaveBeenCalledOnce();
});
