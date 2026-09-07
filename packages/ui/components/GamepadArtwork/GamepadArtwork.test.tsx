import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { detectGamepadModel, GamepadArtwork, physicalButtonLabel } from "./GamepadArtwork";
describe("physical controller graphics", () => {
  it("handles long repeated device names without a backtracking pattern", () => {
    expect(detectGamepadModel("054c".repeat(20_000))).toBe("generic");
    expect(detectGamepadModel("switch".repeat(20_000))).toBe("generic");
    expect(detectGamepadModel("057e".repeat(20_000))).toBe("generic");
  });
  it("distinguishes Sony models by product ID without inventing an unknown model", () => {
    expect(detectGamepadModel("Wireless Controller (Vendor: 054c Product: 0ce6)")).toBe(
      "dualsense",
    );
    expect(detectGamepadModel("Wireless Controller (Vendor: 054c Product: 09cc)")).toBe(
      "dualshock",
    );
    expect(detectGamepadModel("Unknown Wireless Controller")).toBe("generic");
  });
  it("keeps Nintendo positions distinct from Xbox labels", () => {
    expect(physicalButtonLabel(0, "switch")).toBe("B");
    expect(physicalButtonLabel(0, "xbox")).toBe("A");
    expect(physicalButtonLabel(0, "dualsense")).toBe("Cross");
  });
  it("names the reported auxiliary controls by physical family", () => {
    expect(physicalButtonLabel(17, "dualsense")).toBe("Touchpad");
    expect(physicalButtonLabel(18, "dualsense")).toBe("Mute");
    expect(physicalButtonLabel(17, "xbox")).toBe("Share");
    expect(physicalButtonLabel(17, "switch")).toBe("Capture");
    expect(physicalButtonLabel(17, "generic")).toBe("Button 17");
  });
  it("exposes the active physical button in live input artwork", () => {
    render(<GamepadArtwork systemId="snes" buttonStates={{ 0: true }} />);
    expect(screen.getByLabelText("B pressed")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Super Nintendo Controller · SNS-005, live control display",
      }),
    ).toBeInTheDocument();
  });
});
