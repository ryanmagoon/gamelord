import { describe, it, expect, beforeEach } from "vitest";
import {
  subscribeMappingChanges,
  detectControllerType,
  getControllerDisplayName,
  getButtonLabel,
  getGamepadButtonLabel,
  getDefaultMapping,
  loadMapping,
  saveMapping,
  clearMapping,
  mappingToArray,
  LIBRETRO_BUTTON,
  STANDARD_GAMEPAD_MAPPING,
} from "./controller-mappings";

describe("detectControllerType", () => {
  it("detects Xbox controllers by name", () => {
    expect(
      detectControllerType(
        "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)",
      ),
    ).toBe("xbox");
  });

  it("detects Xbox controllers by XInput string", () => {
    expect(detectControllerType("xinput controller")).toBe("xbox");
  });

  it("detects Xbox controllers by vendor ID", () => {
    expect(detectControllerType("Controller (STANDARD GAMEPAD Vendor: 045e Product: 0000)")).toBe(
      "xbox",
    );
  });

  it("detects PlayStation controllers by name", () => {
    expect(
      detectControllerType(
        "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)",
      ),
    ).toBe("playstation");
  });

  it("detects PlayStation DualShock controllers", () => {
    expect(detectControllerType("DualShock 4 Controller")).toBe("playstation");
  });

  it("detects PlayStation controllers by vendor ID", () => {
    expect(detectControllerType("Controller (STANDARD GAMEPAD Vendor: 054c Product: 0000)")).toBe(
      "playstation",
    );
  });

  it("returns generic for unknown controllers", () => {
    expect(
      detectControllerType("8BitDo SN30 Pro (STANDARD GAMEPAD Vendor: 2dc8 Product: 6100)"),
    ).toBe("generic");
  });

  it("returns generic for empty string", () => {
    expect(detectControllerType("")).toBe("generic");
  });
});

describe("getControllerDisplayName", () => {
  it("extracts name from Chrome-style id", () => {
    expect(
      getControllerDisplayName(
        "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)",
      ),
    ).toBe("Xbox Wireless Controller");
  });

  it("extracts name from Firefox-style id", () => {
    expect(getControllerDisplayName("045e-02fd-Xbox Wireless Controller")).toBe(
      "Xbox Wireless Controller",
    );
  });

  it("returns the full string when no pattern matches", () => {
    expect(getControllerDisplayName("My Custom Controller")).toBe("My Custom Controller");
  });
});

describe("getButtonLabel", () => {
  it("returns PlayStation labels for PlayStation controllers", () => {
    // Libretro SNES naming: B=bottom=Cross, A=right=Circle, Y=left=Square, X=top=Triangle
    expect(getButtonLabel(LIBRETRO_BUTTON.B, "playstation")).toBe("Cross");
    expect(getButtonLabel(LIBRETRO_BUTTON.A, "playstation")).toBe("Circle");
    expect(getButtonLabel(LIBRETRO_BUTTON.Y, "playstation")).toBe("Square");
    expect(getButtonLabel(LIBRETRO_BUTTON.X, "playstation")).toBe("Triangle");
    expect(getButtonLabel(LIBRETRO_BUTTON.L, "playstation")).toBe("L1");
    expect(getButtonLabel(LIBRETRO_BUTTON.R, "playstation")).toBe("R1");
    expect(getButtonLabel(LIBRETRO_BUTTON.SELECT, "playstation")).toBe("Share");
    expect(getButtonLabel(LIBRETRO_BUTTON.START, "playstation")).toBe("Options");
  });

  it("returns Xbox labels for Xbox controllers", () => {
    expect(getButtonLabel(LIBRETRO_BUTTON.SELECT, "xbox")).toBe("View");
    expect(getButtonLabel(LIBRETRO_BUTTON.START, "xbox")).toBe("Menu");
    // Face buttons fall through to defaults
    expect(getButtonLabel(LIBRETRO_BUTTON.A, "xbox")).toBe("A");
  });

  it("returns generic labels for generic controllers", () => {
    expect(getButtonLabel(LIBRETRO_BUTTON.A, "generic")).toBe("A");
    expect(getButtonLabel(LIBRETRO_BUTTON.UP, "generic")).toBe("D-Pad Up");
  });
});

describe("getGamepadButtonLabel", () => {
  it("returns known labels for standard indices", () => {
    expect(getGamepadButtonLabel(0)).toBe("A / Cross");
    expect(getGamepadButtonLabel(8)).toBe("Back / Share");
    expect(getGamepadButtonLabel(12)).toBe("D-Pad Up");
  });

  it("returns fallback for unknown indices", () => {
    expect(getGamepadButtonLabel(99)).toBe("Button 99");
  });
});

describe("getDefaultMapping", () => {
  it("returns all 16 libretro buttons", () => {
    const mapping = getDefaultMapping();
    expect(mapping.bindings).toHaveLength(16);
  });

  it("each binding has a valid retroId and label", () => {
    const mapping = getDefaultMapping();
    for (const binding of mapping.bindings) {
      expect(typeof binding.retroId).toBe("number");
      expect(typeof binding.label).toBe("string");
      expect(binding.label.length).toBeGreaterThan(0);
    }
  });

  it("each binding has a gamepadButtonIndex matching STANDARD_GAMEPAD_MAPPING", () => {
    const mapping = getDefaultMapping();
    for (const binding of mapping.bindings) {
      if (binding.gamepadButtonIndex !== null) {
        expect(STANDARD_GAMEPAD_MAPPING[binding.gamepadButtonIndex]).toBe(binding.retroId);
      }
    }
  });
});

describe("mappingToArray", () => {
  it("converts default mapping to match STANDARD_GAMEPAD_MAPPING", () => {
    const mapping = getDefaultMapping();
    const array = mappingToArray(mapping);
    expect(array).toEqual(STANDARD_GAMEPAD_MAPPING);
  });

  it("produces null entries for unbound buttons", () => {
    const mapping = getDefaultMapping();
    // Unbind the A button (right face, gamepad index 1)
    const modified = {
      bindings: mapping.bindings.map((b) =>
        b.retroId === LIBRETRO_BUTTON.A ? { ...b, gamepadButtonIndex: null } : b,
      ),
    };
    const array = mappingToArray(modified);
    // A is at gamepad index 1 (right face), should now be null
    expect(array[1]).toBeNull();
  });
});

describe("localStorage persistence", () => {
  const testControllerId = "test-controller-id";

  beforeEach(() => {
    clearMapping(testControllerId);
  });

  it("loadMapping returns null when no mapping is saved", () => {
    expect(loadMapping(testControllerId)).toBeNull();
  });

  it("saveMapping and loadMapping round-trip correctly", () => {
    const mapping = getDefaultMapping();
    saveMapping(testControllerId, mapping);
    const loaded = loadMapping(testControllerId);
    expect(loaded).toEqual(mapping);
  });

  it("clearMapping removes the saved mapping", () => {
    const mapping = getDefaultMapping();
    saveMapping(testControllerId, mapping);
    clearMapping(testControllerId);
    expect(loadMapping(testControllerId)).toBeNull();
  });

  it("loadMapping returns null for invalid JSON", () => {
    localStorage.setItem(`gamelord:controller-mapping:${testControllerId}`, "not json");
    expect(loadMapping(testControllerId)).toBeNull();
  });

  it("loadMapping returns null for JSON without bindings array", () => {
    localStorage.setItem(
      `gamelord:controller-mapping:${testControllerId}`,
      JSON.stringify({ foo: "bar" }),
    );
    expect(loadMapping(testControllerId)).toBeNull();
  });
});

describe("system mapping persistence", () => {
  beforeEach(() => localStorage.clear());
  const custom = (button: number) => ({
    bindings: [{ retroId: 8, label: "A", gamepadButtonIndex: button }],
  });
  it("isolates saves and resets while retaining legacy mappings on migration", () => {
    saveMapping("pad:with:colon", custom(3));
    expect(loadMapping("pad:with:colon", "nes")).toEqual(custom(3));
    saveMapping("pad:with:colon", custom(4), "nes");
    expect(loadMapping("pad:with:colon", "snes")).toEqual(custom(3));
    expect(loadMapping("pad:with:colon", "nes")).toEqual(custom(4));
    clearMapping("pad:with:colon", "nes");
    expect(loadMapping("pad:with:colon", "nes")).toEqual(getDefaultMapping());
    expect(loadMapping("pad:with:colon", "snes")).toEqual(custom(3));
    expect(loadMapping("pad:with:colon")).toEqual(custom(3));
  });
  it("reports same-window and cross-window system identity without splitting controller IDs", () => {
    const changes: Array<[string | null, string | undefined]> = [];
    const unsubscribe = subscribeMappingChanges((id, system) => changes.push([id, system]));
    saveMapping("pad:with:colon", custom(2), "psx");
    const key = localStorage.key(0);
    window.dispatchEvent(new StorageEvent("storage", { key }));
    window.dispatchEvent(
      new StorageEvent("storage", { key: "gamelord:controller-mapping:pad:with:colon" }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "gamelord:system-controller-mapping:invalid" }),
    );
    expect(changes).toEqual([
      ["pad:with:colon", "psx"],
      ["pad:with:colon", "psx"],
      ["pad:with:colon", undefined],
    ]);
    unsubscribe();
  });
});

it("adds remappable N64 C targets to new and legacy mappings", () => {
  localStorage.clear();
  const targets = getDefaultMapping("n64").bindings.filter((binding) => binding.retroId >= 16);
  expect(targets.map((binding) => [binding.retroId, binding.gamepadButtonIndex])).toEqual([
    [16, null],
    [17, null],
    [18, null],
    [19, null],
  ]);
  saveMapping("n64-pad", getDefaultMapping());
  expect(loadMapping("n64-pad", "n64")?.bindings.slice(-4)).toEqual(targets);
});
