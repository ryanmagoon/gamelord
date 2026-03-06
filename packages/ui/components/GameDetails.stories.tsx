import type { Meta, StoryObj } from "@storybook/react-vite";
import { GameDetails } from "./GameDetails";

const meta = {
  argTypes: {
    onPlay: { action: "play" },
    onSettings: { action: "settings" },
  },
  component: GameDetails,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Components/GameDetails",
} satisfies Meta<typeof GameDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    game: {
      genre: "Platform",
      id: "1",
      lastPlayed: new Date(),
      platform: "NES",
      playTime: 7200, // 2 hours
      romPath: "/Users/username/ROMs/NES/Super Mario Bros.nes",
      title: "Super Mario Bros.",
    },
    onPlay() {
      /* storybook action placeholder */
    },
  },
};

export const WithCoverArt: Story = {
  args: {
    game: {
      coverArt: "https://via.placeholder.com/300x400",
      genre: "Adventure",
      id: "2",
      lastPlayed: new Date(Date.now() - 86_400_000), // Yesterday
      platform: "SNES",
      playTime: 36_000, // 10 hours
      romPath: "/Users/username/ROMs/SNES/zelda-alttp.smc",
      title: "The Legend of Zelda: A Link to the Past",
    },
    onPlay() {
      /* storybook action placeholder */
    },
  },
};

export const NeverPlayed: Story = {
  args: {
    game: {
      coverArt: "https://via.placeholder.com/300x400",
      genre: "Platform",
      id: "3",
      platform: "Genesis",
      romPath: "/Users/username/ROMs/Genesis/sonic.md",
      title: "Sonic the Hedgehog",
    },
    onPlay() {
      /* storybook action placeholder */
    },
  },
};
