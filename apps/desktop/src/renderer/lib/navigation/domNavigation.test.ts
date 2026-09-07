import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeScope, focusables, moveFocus } from "./domNavigation";

describe("controller DOM navigation", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      {},
    ] as unknown as DOMRectList);
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });
  it("uses the open nested overlay and ignores disabled and inert controls", () => {
    document.body.innerHTML =
      '<button>Library</button><div role="dialog"><button>Settings</button><button disabled>No</button><div inert><button>No</button></div></div><div role="listbox"><button role="option" tabindex="-1">Choice</button></div><div role="dialog" data-state="closed"><button>Closing</button></div>';
    expect(activeScope().getAttribute("role")).toBe("listbox");
    expect(focusables(activeScope()).map((el) => el.textContent)).toEqual(["Choice"]);
    expect(focusables(document.querySelector('[role="dialog"]')!)).toHaveLength(1);
  });
  it("forwards arrows to composite widgets instead of escaping their scope", () => {
    document.body.innerHTML = '<div role="listbox"><button role="option">Choice</button></div>';
    const choice = document.querySelector("button")!;
    choice.focus();
    const pressed = vi.fn();
    choice.addEventListener("keydown", pressed);
    moveFocus("down");
    expect(pressed.mock.calls[0][0].key).toBe("ArrowDown");
    expect(document.activeElement).toBe(choice);
  });
  it("keeps vertical movement in a settings panel while allowing lateral exits", () => {
    document.body.innerHTML =
      '<nav data-controller-region><button id="tab">Tab</button></nav><section data-controller-region><button id="device">Device</button><button id="mapping">Mapping</button></section>';
    const tab = document.getElementById("tab")!;
    const device = document.getElementById("device")!;
    const mapping = document.getElementById("mapping")!;
    for (const [element, x, y] of [
      [tab, 0, 70],
      [device, 200, 0],
      [mapping, 200, 400],
    ] as const) {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
        x,
        y,
        width: 100,
        height: 40,
      } as DOMRect);
    }
    device.focus();
    moveFocus("down");
    expect(document.activeElement).toBe(mapping);
    moveFocus("left");
    expect(document.activeElement).toBe(tab);
  });
  it("changes range values through input events and clamps to the endpoint", () => {
    document.body.innerHTML = '<input type="range" min="0" max="1" step="0.1" value="0.9">';
    const range = document.querySelector("input")!;
    const changed = vi.fn();
    range.addEventListener("input", changed);
    range.focus();
    moveFocus("right");
    moveFocus("right");
    expect(range.value).toBe("1");
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
