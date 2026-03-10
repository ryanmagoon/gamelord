import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { UpdateNotification } from "./UpdateNotification";

const meta = {
  title: "Components/UpdateNotification",
  component: UpdateNotification,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    onRestart: { action: "restart" },
    onDismiss: { action: "dismiss" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 600 }} className="bg-background rounded-md border overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UpdateNotification>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checking: Story = {
  args: {
    status: "checking",
    onRestart: fn(),
    onDismiss: fn(),
  },
};

export const Available: Story = {
  args: {
    status: "available",
    version: "1.2.0",
    onRestart: fn(),
    onDismiss: fn(),
  },
};

export const DownloadingEarly: Story = {
  args: {
    status: "downloading",
    version: "1.2.0",
    progress: {
      percent: 12,
      bytesPerSecond: 2_500_000,
      transferred: 3_600_000,
      total: 30_000_000,
    },
    onRestart: fn(),
    onDismiss: fn(),
  },
};

export const DownloadingMidway: Story = {
  args: {
    status: "downloading",
    version: "1.2.0",
    progress: {
      percent: 52,
      bytesPerSecond: 5_100_000,
      transferred: 15_600_000,
      total: 30_000_000,
    },
    onRestart: fn(),
    onDismiss: fn(),
  },
};

export const DownloadingAlmostDone: Story = {
  args: {
    status: "downloading",
    version: "1.2.0",
    progress: {
      percent: 94,
      bytesPerSecond: 4_800_000,
      transferred: 28_200_000,
      total: 30_000_000,
    },
    onRestart: fn(),
    onDismiss: fn(),
  },
};

export const Downloaded: Story = {
  args: {
    status: "downloaded",
    version: "1.2.0",
    onRestart: fn(),
    onDismiss: fn(),
  },
};

export const Error: Story = {
  args: {
    status: "error",
    error: "Network error: unable to reach update server",
    onRestart: fn(),
    onDismiss: fn(),
  },
};

export const ErrorDefaultMessage: Story = {
  args: {
    status: "error",
    onRestart: fn(),
    onDismiss: fn(),
  },
};

export const Idle: Story = {
  args: {
    status: "idle",
    onRestart: fn(),
    onDismiss: fn(),
  },
};

export const AccessibilityTest: Story = {
  args: {
    status: "downloaded",
    version: "1.2.0",
    onRestart: fn(),
    onDismiss: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Restart button should be present in downloaded state
    const restartButton = canvas.getByRole("button", { name: /restart now/i });
    await expect(restartButton).toBeInTheDocument();

    // Dismiss button should be present with aria-label
    const dismissButton = canvas.getByRole("button", { name: /dismiss/i });
    await expect(dismissButton).toBeInTheDocument();

    // Click Restart and verify callback
    await userEvent.click(restartButton);
    await expect(args.onRestart).toHaveBeenCalled();

    // Click Dismiss and verify callback
    await userEvent.click(dismissButton);
    await expect(args.onDismiss).toHaveBeenCalled();
  },
};
