import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Settings, RefreshCw, Sun, Moon } from "lucide-react";
import { CommandPalette, type CommandAction } from "./CommandPalette";
import { Button } from "./ui/button";
import type { Game } from "./GameCard";
import { modifierKey } from "../hooks/usePlatform";

const sampleGames: Array<Game> = [
  { id: "1", title: "Super Mario Bros.", platform: "NES", romPath: "/roms/smb.nes" },
  { id: "2", title: "The Legend of Zelda", platform: "NES", romPath: "/roms/zelda.nes" },
  { id: "3", title: "Sonic the Hedgehog", platform: "Genesis", romPath: "/roms/sonic.md" },
  { id: "4", title: "Street Fighter II", platform: "SNES", romPath: "/roms/sf2.sfc" },
  { id: "5", title: "Super Metroid", platform: "SNES", romPath: "/roms/metroid.sfc" },
  { id: "6", title: "Chrono Trigger", platform: "SNES", romPath: "/roms/chrono.sfc" },
  { id: "7", title: "Final Fantasy VI", platform: "SNES", romPath: "/roms/ff6.sfc" },
  { id: "8", title: "Pokemon Red", platform: "GB", romPath: "/roms/pokemon.gb" },
  {
    id: "9",
    title: "Castlevania: Symphony of the Night",
    platform: "PS1",
    romPath: "/roms/sotn.bin",
  },
  { id: "10", title: "Metal Gear Solid", platform: "PS1", romPath: "/roms/mgs.bin" },
];

const sampleActions: Array<CommandAction> = [
  {
    id: "settings",
    label: "Open Settings",
    group: "Actions",
    icon: <Settings className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />,
    onSelect: () => console.log("Open Settings"),
  },
  {
    id: "scan",
    label: "Scan Library",
    group: "Actions",
    icon: <RefreshCw className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />,
    onSelect: () => console.log("Scan Library"),
  },
  {
    id: "theme-dark",
    label: "Switch to Dark Mode",
    group: "Settings",
    icon: <Moon className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />,
    onSelect: () => console.log("Dark mode"),
    keywords: ["theme", "dark", "toggle"],
  },
  {
    id: "theme-light",
    label: "Switch to Light Mode",
    group: "Settings",
    icon: <Sun className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />,
    onSelect: () => console.log("Light mode"),
    keywords: ["theme", "light", "toggle"],
  },
];

const meta: Meta<typeof CommandPalette> = {
  title: "Components/CommandPalette",
  component: CommandPalette,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof CommandPalette>;

function InteractivePalette({
  games = sampleGames,
  actions = sampleActions,
  startOpen = false,
}: {
  games?: Array<Game>;
  actions?: Array<CommandAction>;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);

  return (
    <div className="min-h-[500px] p-8">
      <Button onClick={() => setOpen(true)}>
        Open Command Palette
        <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {modifierKey()}K
        </kbd>
      </Button>

      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        games={games}
        onSelectGame={(game) => console.log("Selected game:", game.title)}
        actions={actions}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <InteractivePalette />,
};

export const Open: Story = {
  render: () => <InteractivePalette startOpen />,
};

export const EmptyLibrary: Story = {
  render: () => <InteractivePalette games={[]} startOpen />,
};

export const NoActions: Story = {
  render: () => <InteractivePalette actions={[]} startOpen />,
};

export const LargeLibrary: Story = {
  render: () => {
    const manyGames: Array<Game> = Array.from({ length: 100 }, (_, i) => ({
      id: `game-${i}`,
      title: `Game Title ${i + 1}`,
      platform: ["NES", "SNES", "Genesis", "GB", "GBA", "N64", "PS1"][i % 7],
      romPath: `/roms/game-${i}.rom`,
    }));
    return <InteractivePalette games={manyGames} startOpen />;
  },
};
