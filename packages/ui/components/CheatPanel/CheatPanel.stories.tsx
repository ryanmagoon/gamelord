import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CheatPanel } from "./CheatPanel";
import type { CheatItem, CustomCheatItem } from "./CheatPanel";

const SAMPLE_CHEATS: Array<CheatItem> = [
  { index: 0, description: "Infinite Lives", code: "APEETPEY", enabled: false },
  { index: 1, description: "Start With 9 Lives", code: "092-17F", enabled: true },
  { index: 2, description: "Moon Jump", code: "DDA7-136A+DDA9-12DA", enabled: false },
  { index: 3, description: "Infinite Health", code: "7E0F28:FF", enabled: false },
  { index: 4, description: "Max Coins", code: "AEUGNSSL", enabled: true },
];

const MANY_CHEATS: Array<CheatItem> = Array.from({ length: 30 }, (_, i) => ({
  index: i,
  description: `Cheat Code ${i + 1} — ${["Infinite Lives", "God Mode", "Max Ammo", "No Clip", "Speed Boost", "One Hit Kill"][i % 6]}`,
  code: `${String(i).padStart(4, "0")}-${String(i * 7).padStart(4, "0")}`,
  enabled: i % 5 === 0,
}));

const SAMPLE_CUSTOM_CHEATS: Array<CustomCheatItem> = [
  { description: "Custom Infinite Ammo", code: "7E1490:FF", enabled: true },
  { description: "Debug Mode", code: "XYZZY", enabled: false },
];

const meta: Meta<typeof CheatPanel> = {
  component: CheatPanel,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "Components/CheatPanel",
  args: {
    open: true,
    onClose: fn(),
    onToggleCheat: fn(),
    onToggleCustomCheat: fn(),
    onAddCustomCheat: fn(),
    onRemoveCustomCheat: fn(),
    cheats: SAMPLE_CHEATS,
    customCheats: [],
    gameTitle: "Super Mario Bros.",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          background: "#111",
        }}
      >
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCustomCheats: Story = {
  args: {
    customCheats: SAMPLE_CUSTOM_CHEATS,
  },
};

export const ManyCheats: Story = {
  args: {
    cheats: MANY_CHEATS,
    gameTitle: "The Legend of Zelda: A Link to the Past",
  },
};

export const EmptyState: Story = {
  args: {
    cheats: [],
    customCheats: [],
    gameTitle: "Homebrew Test ROM",
  },
};

export const CustomCheatsOnly: Story = {
  args: {
    cheats: [],
    customCheats: SAMPLE_CUSTOM_CHEATS,
    gameTitle: "Unknown Game",
  },
};

export const DatabaseNotDownloaded: Story = {
  args: {
    cheats: [],
    customCheats: [],
    gameTitle: "Resident Evil",
    databaseStatus: "not-downloaded",
    onDownloadDatabase: fn(),
  },
};

export const DatabaseDownloading: Story = {
  args: {
    cheats: [],
    customCheats: [],
    gameTitle: "Resident Evil",
    databaseStatus: "downloading",
  },
};

export const DatabaseError: Story = {
  args: {
    cheats: [],
    customCheats: [],
    gameTitle: "Resident Evil",
    databaseStatus: "error",
    onDownloadDatabase: fn(),
  },
};
