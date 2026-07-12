import type { Meta, StoryObj } from "@storybook/react-vite";
import { Controller3D } from "./Controller3D";
import type { ControllerButtonId } from "./controllerLayout";

const meta = {
  title: "Components/Controller3D",
  component: Controller3D,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: "100vh", background: "#0b0b0d" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Controller3D>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Staged, slowly-rotating controller — the default showcase view. */
export const Staged: Story = {
  args: {
    autoRotate: true,
    enableControls: true,
  },
};

/** Static framing with auto-rotate off, for inspecting the resting pose. */
export const Static: Story = {
  args: {
    autoRotate: false,
    enableControls: true,
  },
};

/**
 * Preview of the future highlight state (A + D-Pad pressed). Not yet wired to
 * live gamepad input — this story exists to polish the pressed look.
 */
export const Highlighted: Story = {
  args: {
    autoRotate: false,
    enableControls: true,
    highlightedButtons: new Set<ControllerButtonId>(["a", "up", "right"]),
  },
};
