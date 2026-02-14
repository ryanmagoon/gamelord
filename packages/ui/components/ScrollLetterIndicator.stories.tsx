import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollLetterIndicator } from './ScrollLetterIndicator';

const meta = {
  title: 'Components/ScrollLetterIndicator',
  component: ScrollLetterIndicator,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="bg-background min-h-screen">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScrollLetterIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {
  args: {
    letter: 'A',
    isVisible: true,
  },
};

export const Hidden: Story = {
  args: {
    letter: 'A',
    isVisible: false,
  },
};

export const NumberSymbol: Story = {
  args: {
    letter: '#',
    isVisible: true,
  },
};

export const LetterM: Story = {
  args: {
    letter: 'M',
    isVisible: true,
  },
};

export const NullLetter: Story = {
  args: {
    letter: null,
    isVisible: true,
  },
};
