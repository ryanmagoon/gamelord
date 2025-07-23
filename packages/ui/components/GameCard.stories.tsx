import type { Meta, StoryObj } from '@storybook/react';
import { GameCard } from './GameCard';

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
      romPath: '/roms/smb.nes',
    },
  },
};

export const WithCoverArt: Story = {
  args: {
    game: {
      id: '2',
      title: 'The Legend of Zelda',
      platform: 'NES',
      genre: 'Adventure',
      coverArt: 'https://via.placeholder.com/300x400',
      romPath: '/roms/zelda.nes',
    },
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
  },
};

export const RecentlyPlayed: Story = {
  args: {
    game: {
      id: '4',
      title: 'Sonic the Hedgehog',
      platform: 'Genesis',
      genre: 'Platform',
      coverArt: 'https://via.placeholder.com/300x400',
      romPath: '/roms/sonic.md',
      lastPlayed: new Date(),
      playTime: 7200, // 2 hours
    },
  },
};