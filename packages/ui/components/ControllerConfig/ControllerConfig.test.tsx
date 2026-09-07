import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(
      screen.getByText("Connect a controller to test and assign controls."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Map A" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Emulated system" })).toBeEnabled();
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
    expect(screen.getAllByText("Cross")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Circle")[0]).toBeInTheDocument();
  });

  it("shows only the selected retro system controls", () => {
    render(<ControllerConfig {...defaultProps} />);
    expect(screen.getByText("Button Mapping")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Map / })).toHaveLength(12);
    expect(screen.queryByRole("button", { name: "Map L3" })).not.toBeInTheDocument();
  });

  it("renders multiple controllers", () => {
    render(<ControllerConfig {...defaultProps} controllers={[xboxController, psController]} />);
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
    render(<ControllerConfig {...defaultProps} onStartRemap={onStartRemap} />);
    await user.click(screen.getByRole("button", { name: "Map Select" }));
    expect(onStartRemap).toHaveBeenCalledWith(2);
  });

  it("shows remap prompt when remapping a button", () => {
    render(<ControllerConfig {...defaultProps} remappingButton={8} />);
    expect(
      screen.getByText("Release all buttons, then press a button to bind. Home or Escape cancels."),
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
    expect(
      screen.getByRole("img", {
        name: "Super Nintendo Controller · SNS-005, live control display",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a control to assign it, or test your current mappings."),
    ).toBeInTheDocument();
  });

  it("captures menu controls while testing and exits on Home", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<ControllerConfig {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Test controls" }));
    expect(container.querySelector('[data-controller-capture="true"]')).not.toBeNull();
    rerender(<ControllerConfig {...defaultProps} buttonStates={{ 1: true }} />);
    expect(screen.getByRole("button", { name: "Stop testing" })).toBeInTheDocument();
    rerender(<ControllerConfig {...defaultProps} buttonStates={{ 16: true }} />);
    expect(container.querySelector('[data-controller-capture="true"]')).toBeNull();
  });

  it("consumes Escape when testing or remapping so Settings stays open", async () => {
    const user = userEvent.setup();
    const onCancelRemap = vi.fn();
    const { rerender } = render(<ControllerConfig {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Test controls" }));
    const outerEscape = vi.fn();
    document.addEventListener("keydown", outerEscape);
    try {
      fireEvent.keyDown(screen.getByRole("button", { name: "Stop testing" }), { key: "Escape" });
      expect(screen.getByRole("button", { name: "Test controls" })).toBeInTheDocument();
      expect(outerEscape).not.toHaveBeenCalled();
      rerender(
        <ControllerConfig {...defaultProps} remappingButton={8} onCancelRemap={onCancelRemap} />,
      );
      fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
      expect(onCancelRemap).toHaveBeenCalledOnce();
      expect(outerEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", outerEscape);
    }
  });

  it("releases test capture when changing system or losing the selected controller", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<ControllerConfig {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Test controls" }));
    rerender(<ControllerConfig {...defaultProps} systemId="gb" />);
    expect(container.querySelector('[data-controller-capture="true"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: "Test controls" }));
    rerender(<ControllerConfig {...defaultProps} systemId="gb" controllers={[]} />);
    expect(container.querySelector('[data-controller-capture="true"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop testing" })).not.toBeInTheDocument();
  });

  it("keeps the target hardware visible and disables mapping when disconnected", () => {
    const disconnected: ConnectedController = { ...xboxController, connected: false };
    render(<ControllerConfig {...defaultProps} controllers={[disconnected]} />);
    expect(
      screen.getByRole("img", {
        name: "Super Nintendo Controller · SNS-005, live control display",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Map A" })).toBeDisabled();
  });

  it("shows Disconnected status for disconnected controller", () => {
    const disconnected: ConnectedController = { ...xboxController, connected: false };
    render(<ControllerConfig {...defaultProps} controllers={[disconnected]} />);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });
});
