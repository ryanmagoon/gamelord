import type { Meta, StoryObj } from '@storybook/react-vite';
import { GameLibrary } from './GameLibrary';

const meta = {
  title: 'Components/GameLibrary',
  component: GameLibrary,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    onPlayGame: { action: 'play' },
    onGameOptions: { action: 'options' },
  },
} satisfies Meta<typeof GameLibrary>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleGames = [
  {
    id: '1',
    title: 'Super Mario Bros.',
    platform: 'NES',
    genre: 'Platform',
    coverArtAspectRatio: 0.714,
    romPath: '/roms/smb.nes',
    lastPlayed: new Date('2024-01-15'),
  },
  {
    id: '2',
    title: 'The Legend of Zelda',
    platform: 'NES',
    genre: 'Adventure',
    coverArt: 'https://via.placeholder.com/300x400',
    coverArtAspectRatio: 0.75,
    romPath: '/roms/zelda.nes',
    lastPlayed: new Date('2024-01-20'),
  },
  {
    id: '3',
    title: 'Sonic the Hedgehog',
    platform: 'Genesis',
    genre: 'Platform',
    coverArt: 'https://via.placeholder.com/400x300',
    coverArtAspectRatio: 1.33,
    romPath: '/roms/sonic.md',
  },
  {
    id: '4',
    title: 'Super Metroid',
    platform: 'SNES',
    genre: 'Action',
    coverArt: 'https://via.placeholder.com/300x400',
    coverArtAspectRatio: 0.667,
    romPath: '/roms/metroid.smc',
    lastPlayed: new Date('2024-01-10'),
  },
  {
    id: '5',
    title: 'Mega Man X',
    platform: 'SNES',
    genre: 'Action',
    coverArtAspectRatio: 0.8,
    romPath: '/roms/mmx.smc',
  },
  {
    id: '6',
    title: 'Street Fighter II',
    platform: 'SNES',
    genre: 'Fighting',
    coverArt: 'https://via.placeholder.com/400x300',
    coverArtAspectRatio: 1.4,
    romPath: '/roms/sf2.smc',
  },
  {
    id: '7',
    title: 'Pokemon Red',
    platform: 'GB',
    genre: 'RPG',
    coverArtAspectRatio: 0.9,
    romPath: '/roms/pokemon_red.gb',
  },
  {
    id: '8',
    title: 'Castlevania',
    platform: 'NES',
    genre: 'Action',
    coverArt: 'https://via.placeholder.com/300x400',
    coverArtAspectRatio: 0.714,
    romPath: '/roms/castlevania.nes',
  },
];

export const Default: Story = {
  args: {
    games: sampleGames,
    onPlayGame() { /* storybook action placeholder */ },
  },
  decorators: [
    (Story) => (
      <div className="p-8 bg-background min-h-screen">
        <Story />
      </div>
    ),
  ],
};

export const Empty: Story = {
  args: {
    games: [],
    onPlayGame() { /* storybook action placeholder */ },
  },
  decorators: [
    (Story) => (
      <div className="p-8 bg-background min-h-screen">
        <Story />
      </div>
    ),
  ],
};

export const SinglePlatform: Story = {
  args: {
    games: sampleGames.filter(game => game.platform === 'NES'),
    onPlayGame() { /* storybook action placeholder */ },
  },
  decorators: [
    (Story) => (
      <div className="p-8 bg-background min-h-screen">
        <Story />
      </div>
    ),
  ],
};