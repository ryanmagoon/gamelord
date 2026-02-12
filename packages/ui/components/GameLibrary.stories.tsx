import { useRef } from 'react';
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

// Generate a large library for virtualization testing
const platforms = ['NES', 'SNES', 'Genesis', 'GB', 'GBA', 'N64', 'PS1'];
const genres = ['Platform', 'Action', 'RPG', 'Adventure', 'Fighting', 'Puzzle', 'Sports'];
const aspectRatios = [0.667, 0.714, 0.75, 0.8, 0.9, 1.0, 1.2, 1.33, 1.4];

const largeLibrary = Array.from({ length: 500 }, (_, i) => ({
  id: `large-${i}`,
  title: `Game Title ${String(i + 1).padStart(3, '0')}`,
  platform: platforms[i % platforms.length],
  genre: genres[i % genres.length],
  coverArtAspectRatio: aspectRatios[i % aspectRatios.length],
  romPath: `/roms/game_${i}.rom`,
}));

/**
 * Large library story (500 items) to test virtualization.
 * Uses a scroll container wrapper to simulate the real LibraryView layout.
 */
function LargeLibraryRenderer() {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={scrollRef} className="bg-background h-screen overflow-auto p-4">
      <GameLibrary
        games={largeLibrary}
        onPlayGame={() => { /* storybook action placeholder */ }}
        scrollContainerRef={scrollRef}
      />
    </div>
  );
}

export const LargeLibrary: Story = {
  args: {
    games: largeLibrary,
    onPlayGame() { /* storybook action placeholder */ },
  },
  render: () => <LargeLibraryRenderer />,
};