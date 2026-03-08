import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControllerConfig } from "./ControllerConfig";
import type { ConnectedController } from "./controller-mappings";
import { getDefaultMapping } from "./controller-mappings";

const defaultMapping = getDefaultMapping();

const xboxController: ConnectedController = {
  index: 0,
  id: "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)",
  type: "xbox",
  name: "Xbox Wireless Controller",
  connected: true,
};

const psController: ConnectedController = {
  index: 1,
  id: "DualSense (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)",
  type: "playstation",
  name: "DualSense",
  connected: true,
};

const defaultProps = {
  controllers: [xboxController],
  mapping: defaultMapping,
  onBindingChange: vi.fn(),
  onResetDefaults: vi.fn(),
  selectedControllerIndex: 0,
  onSelectController: vi.fn(),
  buttonStates: {} as Record<number, boolean>,
  axisValues: [0, 0, 0, 0],
  remappingButton: null,
  onStartRemap: vi.fn(),
  onCancelRemap: vi.fn(),
};

describe("ControllerConfig", () => {
  it("shows empty state when no controllers are connected", () => {
    render(<ControllerConfig {...defaultProps} controllers={[]} />);
    expect(screen.getByText("No Controllers Detected")).toBeInTheDocument();
  });

  it("displays connected controller name and type", () => {
    render(<ControllerConfig {...defaultProps} />);
    expect(screen.getByText("Xbox Wireless Controller")).toBeInTheDocument();
    expect(screen.getByText("Xbox")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows PlayStation label for PlayStation controllers", () => {
    render(
      <ControllerConfig
        {...defaultProps}
        controllers={[psController]}
        selectedControllerIndex={0}
      />,
    );
    expect(screen.getByText("PlayStation")).toBeInTheDocument();
    // PlayStation-specific button labels in the binding rows
    expect(screen.getByText("Cross")).toBeInTheDocument();
    expect(screen.getByText("Circle")).toBeInTheDocument();
  });

  it("renders all 16 button bindings", () => {
    const { container } = render(<ControllerConfig {...defaultProps} />);
    expect(screen.getByText("Button Mapping")).toBeInTheDocument();
    // Count binding rows: each is a <button> containing a <span class="font-medium">
    const bindingLabels = container.querySelectorAll("span.font-medium");
    // Binding labels include all 16 bindings (D-Pad Up/Down/Left/Right, A, B, X, Y, etc.)
    expect(bindingLabels.length).toBe(16);
  });

  it("renders multiple controllers", () => {
    render(
      <ControllerConfig
        {...defaultProps}
        controllers={[xboxController, psController]}
      />,
    );
    expect(screen.getByText("Xbox Wireless Controller")).toBeInTheDocument();
    expect(screen.getByText("DualSense")).toBeInTheDocument();
  });

  it("calls onSelectController when clicking a controller card", async () => {
    const user = userEvent.setup();
    const onSelectController = vi.fn();
    render(
      <ControllerConfig
        {...defaultProps}
        controllers={[xboxController, psController]}
        onSelectController={onSelectController}
      />,
    );
    await user.click(screen.getByText("DualSense"));
    expect(onSelectController).toHaveBeenCalledWith(1);
  });

  it("calls onStartRemap when clicking a binding row", async () => {
    const user = userEvent.setup();
    const onStartRemap = vi.fn();
    const { container } = render(
      <ControllerConfig {...defaultProps} onStartRemap={onStartRemap} />,
    );
    // Find a binding row by its label. For Xbox, "View" is unique (the Select button).
    // It only appears in the binding section, not the button tester.
    const bindingLabels = container.querySelectorAll("span.font-medium");
    const viewLabel = Array.from(bindingLabels).find((el) => el.textContent === "View");
    expect(viewLabel).toBeTruthy();
    const viewRow = viewLabel?.closest("button");
    expect(viewRow).toBeTruthy();
    if (viewRow) {
      await user.click(viewRow);
    }
    expect(onStartRemap).toHaveBeenCalledWith(2); // LIBRETRO_BUTTON.SELECT (displayed as "View" on Xbox)
  });

  it("shows remap prompt when remapping a button", () => {
    render(<ControllerConfig {...defaultProps} remappingButton={8} />);
    expect(
      screen.getByText("Press the button you want to bind, or Escape to cancel"),
    ).toBeInTheDocument();
    expect(screen.getByText("Press a button…")).toBeInTheDocument();
  });

  it("calls onResetDefaults when clicking Reset to Defaults", async () => {
    const user = userEvent.setup();
    const onResetDefaults = vi.fn();
    render(<ControllerConfig {...defaultProps} onResetDefaults={onResetDefaults} />);
    await user.click(screen.getByText("Reset to Defaults"));
    expect(onResetDefaults).toHaveBeenCalled();
  });

  it("shows button tester", () => {
    render(<ControllerConfig {...defaultProps} />);
    expect(screen.getByText("Button Tester")).toBeInTheDocument();
    expect(screen.getByText("Press buttons to test your controller")).toBeInTheDocument();
  });

  it("does not show button tester when controller is disconnected", () => {
    const disconnected: ConnectedController = { ...xboxController, connected: false };
    render(
      <ControllerConfig
        {...defaultProps}
        controllers={[disconnected]}
      />,
    );
    expect(screen.queryByText("Button Tester")).not.toBeInTheDocument();
  });

  it("shows Disconnected status for disconnected controller", () => {
    const disconnected: ConnectedController = { ...xboxController, connected: false };
    render(
      <ControllerConfig
        {...defaultProps}
        controllers={[disconnected]}
      />,
    );
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });
});
