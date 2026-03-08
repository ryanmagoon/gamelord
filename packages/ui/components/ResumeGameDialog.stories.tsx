import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import { ResumeGameDialog } from "./ResumeGameDialog";

const meta: Meta<typeof ResumeGameDialog> = {
  component: ResumeGameDialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Components/ResumeGameDialog",
  args: {
    gameTitle: "Super Mario Bros. 3",
    onCancel: fn(),
    onResume: fn(),
    onStartFresh: fn(),
    open: true,
  },
};

export default meta;
type Story = StoryObj<typeof ResumeGameDialog>;

export const Default: Story = {};

export const LongTitle: Story = {
  args: {
    gameTitle: "The Legend of Zelda: A Link to the Past — Four Swords Anniversary Edition",
  },
};
