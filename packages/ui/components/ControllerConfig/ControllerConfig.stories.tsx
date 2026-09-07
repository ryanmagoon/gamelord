import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, userEvent, within } from "storybook/test";
import { useState } from "react";
import type { RetroSystemId } from "../GamepadArtwork/retroSystems";
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

const playstationController: ConnectedController = {
  index: 1,
  id: "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)",
  type: "playstation",
  name: "DualSense Wireless Controller",
  connected: true,
};

const genericController: ConnectedController = {
  index: 0,
  id: "8BitDo SN30 Pro (STANDARD GAMEPAD Vendor: 2dc8 Product: 6100)",
  type: "generic",
  name: "8BitDo SN30 Pro",
  connected: true,
};

const disconnectedController: ConnectedController = {
  ...xboxController,
  connected: false,
};

const emptyButtonStates: Record<number, boolean> = {};
const emptyAxes: Array<number> = [0, 0, 0, 0];

/** Button states showing A and D-Pad Right pressed. */
const activeButtonStates: Record<number, boolean> = { 0: true, 15: true };

/** Axis values showing left stick tilted right and slightly down. */
const activeAxes: Array<number> = [0.8, 0.3, 0, 0];

const meta = {
  title: "Components/ControllerConfig",
  component: ControllerConfig,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  play: async ({ canvasElement, args }) => {
    if (!args.controllers?.[args.selectedControllerIndex]?.connected) {
      return;
    }
    await waitFor(
      () => {
        expect(
          canvasElement.querySelector('[data-scene-status="ready"] canvas[data-settled="true"]'),
        ).not.toBeNull();
      },
      { timeout: 15_000 },
    );
  },
  decorators: [
    (Story) => (
      <div
        style={{ width: 480, maxHeight: 520, overflow: "auto" }}
        className="bg-background rounded-md border p-6"
      >
        <Story />
      </div>
    ),
  ],
  args: {
    onBindingChange: fn(),
    onResetDefaults: fn(),
    onSelectController: fn(),
    onStartRemap: fn(),
    onCancelRemap: fn(),
  },
} satisfies Meta<typeof ControllerConfig>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoControllers: Story = {
  args: {
    controllers: [],
    mapping: defaultMapping,
    selectedControllerIndex: 0,
    buttonStates: emptyButtonStates,
    axisValues: emptyAxes,
    remappingButton: null,
  },
};

export const OneXboxController: Story = {
  args: {
    controllers: [xboxController],
    mapping: defaultMapping,
    selectedControllerIndex: 0,
    buttonStates: emptyButtonStates,
    axisValues: emptyAxes,
    remappingButton: null,
  },
};

export const OnePlayStationController: Story = {
  args: {
    controllers: [playstationController],
    mapping: defaultMapping,
    selectedControllerIndex: 0,
    buttonStates: emptyButtonStates,
    axisValues: emptyAxes,
    remappingButton: null,
  },
};

export const GenericController: Story = {
  args: {
    controllers: [genericController],
    mapping: defaultMapping,
    selectedControllerIndex: 0,
    buttonStates: emptyButtonStates,
    axisValues: emptyAxes,
    remappingButton: null,
  },
};

export const MultipleControllers: Story = {
  args: {
    controllers: [xboxController, playstationController],
    mapping: defaultMapping,
    selectedControllerIndex: 0,
    buttonStates: emptyButtonStates,
    axisValues: emptyAxes,
    remappingButton: null,
  },
};

export const SecondControllerSelected: Story = {
  args: {
    controllers: [xboxController, playstationController],
    mapping: defaultMapping,
    selectedControllerIndex: 1,
    buttonStates: emptyButtonStates,
    axisValues: emptyAxes,
    remappingButton: null,
  },
};

export const DisconnectedController: Story = {
  args: {
    controllers: [disconnectedController],
    mapping: defaultMapping,
    selectedControllerIndex: 0,
    buttonStates: emptyButtonStates,
    axisValues: emptyAxes,
    remappingButton: null,
  },
};

export const RemappingAButton: Story = {
  args: {
    controllers: [xboxController],
    mapping: defaultMapping,
    selectedControllerIndex: 0,
    buttonStates: emptyButtonStates,
    axisValues: emptyAxes,
    remappingButton: 8, // LIBRETRO_BUTTON.A
  },
};

export const ButtonsPressed: Story = {
  args: {
    controllers: [xboxController],
    mapping: defaultMapping,
    selectedControllerIndex: 0,
    buttonStates: activeButtonStates,
    axisValues: activeAxes,
    remappingButton: null,
  },
};

export const TestControls: Story = {
  args: { ...ButtonsPressed.args },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Test controls" }));
    await expect(canvas.getByRole("button", { name: "Stop testing" })).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-controller-capture="true"]')).not.toBeNull();
  },
};

export const AnalogSticksActive: Story = {
  args: {
    systemId: "psx",
    controllers: [xboxController],
    mapping: defaultMapping,
    selectedControllerIndex: 0,
    buttonStates: emptyButtonStates,
    axisValues: [0.8, -0.6, -0.3, 0.9],
    remappingButton: null,
  },
};

export const SystemSelectionAndRemap: Story = {
  args: { ...OneXboxController.args },
  render: function Interactive(args) {
    const [systemId, setSystemId] = useState<RetroSystemId>("snes");
    const [remapping, setRemapping] = useState<number | null>(null);
    return (
      <ControllerConfig
        {...args}
        systemId={systemId}
        mapping={getDefaultMapping(systemId)}
        onSelectSystem={(next) => {
          setRemapping(null);
          setSystemId(next);
        }}
        remappingButton={remapping}
        onStartRemap={setRemapping}
        onCancelRemap={() => setRemapping(null)}
      />
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Emulated system" }));
    await userEvent.click(
      within(document.body).getByRole("option", { name: "Game Boy", exact: true }),
    );
    await expect(
      canvas.getByRole("img", { name: "Game Boy · DMG-01, live control display" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Map L" })).not.toBeInTheDocument();
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector('[data-scene-status="ready"] canvas[data-settled="true"]'),
        ).not.toBeNull(),
      { timeout: 15_000 },
    );
    await userEvent.click(canvas.getByRole("button", { name: "Map A" }));
    await expect(canvas.getByText("A selected for mapping.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Cancel", exact: true }));
    await expect(canvas.queryByText("A selected for mapping.")).not.toBeInTheDocument();
  },
};
