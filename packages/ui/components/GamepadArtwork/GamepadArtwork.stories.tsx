import type { Meta, StoryObj } from "@storybook/react-vite";
import { GamepadArtwork } from "./GamepadArtwork";
const meta = {
  title: "Controllers/GamepadArtwork",
  component: GamepadArtwork,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div
        style={{
          width: 660,
          padding: 40,
          borderRadius: 24,
          background: "#171b23",
          color: "#e9eef5",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GamepadArtwork>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Xbox: Story = { args: { model: "xbox" } };
export const DualSense: Story = { args: { model: "dualsense" } };
export const DualShock: Story = { args: { model: "dualshock" } };
export const SwitchPro: Story = { args: { model: "switch" } };
export const UnknownController: Story = { args: { model: "generic" } };
export const LiveInput: Story = {
  args: {
    model: "dualsense",
    buttonStates: { 0: true, 6: true, 15: true },
    axisValues: [0.75, -0.5, -0.5, 0.5],
  },
};
export const Remapping: Story = { args: { model: "xbox", highlightedButton: 3 } };
export const Small: Story = {
  args: { model: "dualsense" },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
};
