import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { detectGamepadModel, GamepadArtwork, physicalButtonLabel } from "./GamepadArtwork";
describe("physical controller graphics", () => {
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
  it("exposes the active physical button in live input artwork", () => {
    render(<GamepadArtwork model="dualsense" buttonStates={{ 0: true }} />);
    expect(screen.getByLabelText("Cross pressed")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "DualSense, live button and stick display" }),
    ).toBeInTheDocument();
  });
});
