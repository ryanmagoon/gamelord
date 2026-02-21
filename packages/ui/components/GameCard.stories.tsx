import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within, userEvent, fn } from 'storybook/test';
import { GameCard } from './GameCard';
import superMarioBrosBox from '../assets/super-mario-bros-box.png';

const meta = {
  title: 'Components/GameCard',
  component: GameCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onPlay: { action: 'play' },
    onOptions: { action: 'options' },
  },
} satisfies Meta<typeof GameCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    game: {
      id: '1',
      title: 'Super Mario Bros.',
      platform: 'NES',
      genre: 'Platform',
      coverArt: superMarioBrosBox,
      romPath: '/roms/smb.nes',
    },
    onPlay() { /* storybook action placeholder */ },
  },
};

export const WithCoverArt: Story = {
  args: {
    game: {
      id: '2',
      title: 'The Legend of Zelda',
      platform: 'NES',
      genre: 'Adventure',
      coverArt: superMarioBrosBox,
      romPath: '/roms/zelda.nes',
    },
    onPlay() { /* storybook action placeholder */ },
  },
};

export const LongTitle: Story = {
  args: {
    game: {
      id: '3',
      title: 'Super Mario World 2: Yoshi\'s Island - Special Edition',
      platform: 'SNES',
      genre: 'Platform',
      romPath: '/roms/yoshi.smc',
    },
    onPlay() { /* storybook action placeholder */ },
  },
};

export const RecentlyPlayed: Story = {
  args: {
    game: {
      id: '4',
      title: 'Sonic the Hedgehog',
      platform: 'Genesis',
      genre: 'Platform',
      coverArt: superMarioBrosBox,
      romPath: '/roms/sonic.md',
      lastPlayed: new Date(),
      playTime: 7200, // 2 hours
    },
    onPlay() { /* storybook action placeholder */ },
  },
};

export const Favorited: Story = {
  args: {
    game: {
      id: '6',
      title: 'Super Mario Bros.',
      platform: 'NES',
      genre: 'Platform',
      coverArt: superMarioBrosBox,
      romPath: '/roms/smb.nes',
      favorite: true,
    },
    onPlay: fn(),
    onToggleFavorite: fn(),
  },
};

export const NotFavorited: Story = {
  args: {
    game: {
      id: '7',
      title: 'Metroid',
      platform: 'NES',
      genre: 'Action',
      romPath: '/roms/metroid.nes',
      favorite: false,
    },
    onPlay: fn(),
    onToggleFavorite: fn(),
  },
};

/** Test that accessibility features work correctly */
export const AccessibilityTest: Story = {
  args: {
    game: {
      id: '5',
      title: 'Test Game',
      platform: 'NES',
      romPath: '/roms/test.nes',
    },
    onPlay: fn(),
    onOptions: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Play button should have aria-label with game title
    const playButton = canvas.getByRole('button', { name: /play test game/i });
    await expect(playButton).toBeInTheDocument();

    // Options button should have aria-label with game title
    const optionsButton = canvas.getByRole('button', { name: /options for test game/i });
    await expect(optionsButton).toBeInTheDocument();

    // Options button should have focus:opacity-100 for keyboard accessibility
    await expect(optionsButton.className).toContain('focus:opacity-100');

    // Test keyboard navigation - tab to Play button
    await userEvent.tab();
    await expect(playButton).toHaveFocus();

    // Tab to Options button
    await userEvent.tab();
    await expect(optionsButton).toHaveFocus();

    // Click Play button and verify callback
    await userEvent.click(playButton);
    await expect(args.onPlay).toHaveBeenCalled();

    // Click Options button and verify callback
    await userEvent.click(optionsButton);
    await expect(args.onOptions).toHaveBeenCalled();
  },
};
