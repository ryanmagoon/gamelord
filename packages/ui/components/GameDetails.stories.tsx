import type { Meta, StoryObj } from '@storybook/react';
import { GameDetails } from './GameDetails';

const meta = {
  title: 'Components/GameDetails',
  component: GameDetails,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    onPlay: { action: 'play' },
    onSettings: { action: 'settings' },
  },
} satisfies Meta<typeof GameDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    game: {
      id: '1',
      title: 'Super Mario Bros.',
      platform: 'NES',
      genre: 'Platform',
      romPath: '/Users/username/ROMs/NES/Super Mario Bros.nes',
      lastPlayed: new Date(),
      playTime: 7200, // 2 hours
    },
  },
};

export const WithCoverArt: Story = {
  args: {
    game: {
      id: '2',
      title: 'The Legend of Zelda: A Link to the Past',
      platform: 'SNES',
      genre: 'Adventure',
      coverArt: 'https://via.placeholder.com/300x400',
      romPath: '/Users/username/ROMs/SNES/zelda-alttp.smc',
      lastPlayed: new Date(Date.now() - 86400000), // Yesterday
      playTime: 36000, // 10 hours
    },
  },
};

export const NeverPlayed: Story = {
  args: {
    game: {
      id: '3',
      title: 'Sonic the Hedgehog',
      platform: 'Genesis',
      genre: 'Platform',
      coverArt: 'https://via.placeholder.com/300x400',
      romPath: '/Users/username/ROMs/Genesis/sonic.md',
    },
  },
};