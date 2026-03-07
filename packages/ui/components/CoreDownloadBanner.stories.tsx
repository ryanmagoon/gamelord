import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { CoreDownloadBanner } from "./CoreDownloadBanner";

const meta = {
  title: "Components/CoreDownloadBanner",
  component: CoreDownloadBanner,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    onRetry: { action: "retry" },
    onDismiss: { action: "dismiss" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 600 }} className="bg-background rounded-md border overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CoreDownloadBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Downloading: Story = {
  args: {
    coreName: "mesen_libretro",
    phase: "downloading",
    percent: 45,
    onRetry: fn(),
    onDismiss: fn(),
  },
};

export const DownloadingAlmostDone: Story = {
  args: {
    coreName: "mesen_libretro",
    phase: "downloading",
    percent: 95,
    onRetry: fn(),
    onDismiss: fn(),
  },
};

export const Extracting: Story = {
  args: {
    coreName: "mesen_libretro",
    phase: "extracting",
    percent: 70,
    onRetry: fn(),
    onDismiss: fn(),
  },
};

export const Error: Story = {
  args: {
    coreName: "mesen_libretro",
    phase: "error",
    percent: 0,
    onRetry: fn(),
    onDismiss: fn(),
  },
};

export const AccessibilityTest: Story = {
  args: {
    coreName: "test_core",
    phase: "error",
    percent: 0,
    onRetry: fn(),
    onDismiss: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Retry button should be present in error state
    const retryButton = canvas.getByRole("button", { name: /retry/i });
    await expect(retryButton).toBeInTheDocument();

    // Dismiss button should be present with aria-label
    const dismissButton = canvas.getByRole("button", { name: /dismiss error/i });
    await expect(dismissButton).toBeInTheDocument();

    // Error message should show the core name
    await expect(canvas.getByText(/failed to download test_core/i)).toBeInTheDocument();

    // Click Retry and verify callback
    await userEvent.click(retryButton);
    await expect(args.onRetry).toHaveBeenCalled();

    // Click Dismiss and verify callback
    await userEvent.click(dismissButton);
    await expect(args.onDismiss).toHaveBeenCalled();
  },
};
