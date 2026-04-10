import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { SaveStateToast } from "./SaveStateToast";

const meta = {
  title: "Components/SaveStateToast",
  component: SaveStateToast,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [(Story) => (
    <div className="relative w-96 h-48 bg-black/90 rounded-lg overflow-hidden">
      <Story />
    </div>
  )],
} satisfies Meta<typeof SaveStateToast>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SaveSuccess: Story = { args: { status: "save-success", slot: 2, onDismiss: fn(), dismissAfterMs: 99999 } };
export const LoadSuccess: Story = { args: { status: "load-success", slot: 2, onDismiss: fn(), dismissAfterMs: 99999 } };
export const SaveError: Story = { args: { status: "error", slot: 1, errorMessage: "No core loaded", onDismiss: fn(), dismissAfterMs: 99999 } };
export const SerializationError: Story = { args: { status: "error", slot: 3, errorMessage: "Serialization failure", onDismiss: fn(), dismissAfterMs: 99999 } };
export const EmptySlot: Story = { args: { status: "empty-slot", slot: 4, onDismiss: fn(), dismissAfterMs: 99999 } };
export const Idle: Story = { args: { status: "idle", onDismiss: fn() } };

export const AccessibilityTest: Story = {
  args: { status: "save-success", slot: 2, onDismiss: fn(), dismissAfterMs: 99999 },
  play: async ({ canvasElement }) => {
    const toast = within(canvasElement).getByRole("status");
    await expect(toast).toBeInTheDocument();
    await expect(toast).toHaveAttribute("aria-live", "polite");
    await expect(toast).toHaveTextContent("State saved");
  },
};
