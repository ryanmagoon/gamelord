import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollLetterIndicator } from "./ScrollLetterIndicator";

const meta = {
  component: ScrollLetterIndicator,
  decorators: [
    (Story) => (
      <div className="bg-background min-h-screen">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Components/ScrollLetterIndicator",
} satisfies Meta<typeof ScrollLetterIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {
  args: {
    isVisible: true,
    letter: "A",
  },
};

export const Hidden: Story = {
  args: {
    isVisible: false,
    letter: "A",
  },
};

export const NumberSymbol: Story = {
  args: {
    isVisible: true,
    letter: "#",
  },
};

export const LetterM: Story = {
  args: {
    isVisible: true,
    letter: "M",
  },
};

export const NullLetter: Story = {
  args: {
    isVisible: true,
    letter: null,
  },
};
