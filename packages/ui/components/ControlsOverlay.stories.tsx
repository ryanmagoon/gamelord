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
