import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ControlsOverlay } from "./ControlsOverlay";

const meta: Meta<typeof ControlsOverlay> = {
  component: ControlsOverlay,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Components/ControlsOverlay",
  args: {
    onClose: fn(),
    open: true,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          background: "#111",
        }}
      >
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ControlsOverlay>;

export const Open: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};

export const NES: Story = {
  args: { systemId: "nes" },
};

export const SNES: Story = {
  args: { systemId: "snes" },
};

export const Genesis: Story = {
  args: { systemId: "genesis" },
};

export const GameBoy: Story = {
  args: { systemId: "gb" },
};

export const GBA: Story = {
  args: { systemId: "gba" },
};

export const N64: Story = {
  args: { systemId: "n64" },
};

export const PS1: Story = {
  args: { systemId: "psx" },
};

export const PSP: Story = {
  args: { systemId: "psp" },
};

export const NDS: Story = {
  args: { systemId: "nds" },
};

export const Saturn: Story = {
  args: { systemId: "saturn" },
};

export const Arcade: Story = {
  args: { systemId: "arcade" },
};
