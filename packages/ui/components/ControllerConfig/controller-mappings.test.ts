import { describe, it, expect, beforeEach } from "vitest";
import {
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
    expect(
      detectControllerType("Controller (STANDARD GAMEPAD Vendor: 045e Product: 0000)"),
    ).toBe("xbox");
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
    expect(
      detectControllerType("Controller (STANDARD GAMEPAD Vendor: 054c Product: 0000)"),
    ).toBe("playstation");
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
    expect(getButtonLabel(LIBRETRO_BUTTON.A, "playstation")).toBe("Cross");
    expect(getButtonLabel(LIBRETRO_BUTTON.B, "playstation")).toBe("Circle");
    expect(getButtonLabel(LIBRETRO_BUTTON.X, "playstation")).toBe("Square");
    expect(getButtonLabel(LIBRETRO_BUTTON.Y, "playstation")).toBe("Triangle");
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
    // Unbind the A button
    const modified = {
      bindings: mapping.bindings.map((b) =>
        b.retroId === LIBRETRO_BUTTON.A ? { ...b, gamepadButtonIndex: null } : b,
      ),
    };
    const array = mappingToArray(modified);
    // Button index 0 was A, should now be null
    expect(array[0]).toBeNull();
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
