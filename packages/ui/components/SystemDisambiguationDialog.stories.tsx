import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SystemDisambiguationDialog } from "./SystemDisambiguationDialog";

const PSX = { id: "psx", name: "Sony PlayStation", shortName: "PSX" };
const SATURN = { id: "saturn", name: "Sega Saturn", shortName: "Saturn" };
const DREAMCAST = { id: "dreamcast", name: "Sega Dreamcast", shortName: "DC" };
const PS2 = { id: "ps2", name: "Sony PlayStation 2", shortName: "PS2" };

const meta: Meta<typeof SystemDisambiguationDialog> = {
  component: SystemDisambiguationDialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Components/SystemDisambiguationDialog",
  args: {
    onResolve: fn(),
    open: true,
  },
};

export default meta;
type Story = StoryObj<typeof SystemDisambiguationDialog>;

/** A single .chd file matching two systems — the most common case. */
export const SingleFileTwoSystems: Story = {
  args: {
    files: [
      {
        ext: ".chd",
        fullPath: "/Games/Panzer Dragoon Saga (Disc 1).chd",
        matchingSystems: [PSX, SATURN],
        mtimeMs: 1_710_000_000_000,
      },
    ],
  },
};

/** A single file matching three systems. */
export const SingleFileThreeSystems: Story = {
  args: {
    files: [
      {
        ext: ".bin",
        fullPath: "/Games/SonicAdventure.bin",
        matchingSystems: [PSX, SATURN, DREAMCAST],
        mtimeMs: 1_710_000_000_000,
      },
    ],
  },
};

/** Multiple .chd files — shows the "apply to all" checkbox. */
export const MultipleFilesApplyToAll: Story = {
  args: {
    files: [
      {
        ext: ".chd",
        fullPath: "/Games/Saturn/Panzer Dragoon Saga (Disc 1).chd",
        matchingSystems: [PSX, SATURN],
        mtimeMs: 1_710_000_000_000,
      },
      {
        ext: ".chd",
        fullPath: "/Games/Saturn/Panzer Dragoon Saga (Disc 2).chd",
        matchingSystems: [PSX, SATURN],
        mtimeMs: 1_710_000_000_000,
      },
      {
        ext: ".chd",
        fullPath: "/Games/Saturn/Panzer Dragoon Saga (Disc 3).chd",
        matchingSystems: [PSX, SATURN],
        mtimeMs: 1_710_000_000_000,
      },
      {
        ext: ".chd",
        fullPath: "/Games/Saturn/Panzer Dragoon Saga (Disc 4).chd",
        matchingSystems: [PSX, SATURN],
        mtimeMs: 1_710_000_000_000,
      },
    ],
  },
};

/** Mixed extensions — .chd and .iso files from different systems. */
export const MixedExtensions: Story = {
  args: {
    files: [
      {
        ext: ".chd",
        fullPath: "/Games/NiGHTS into Dreams.chd",
        matchingSystems: [PSX, SATURN],
        mtimeMs: 1_710_000_000_000,
      },
      {
        ext: ".iso",
        fullPath: "/Games/Shadow of the Colossus.iso",
        matchingSystems: [PSX, PS2],
        mtimeMs: 1_710_000_000_000,
      },
      {
        ext: ".chd",
        fullPath: "/Games/Radiant Silvergun.chd",
        matchingSystems: [PSX, SATURN],
        mtimeMs: 1_710_000_000_000,
      },
    ],
  },
};

/** Long filename that may overflow the dialog. */
export const LongFilename: Story = {
  args: {
    files: [
      {
        ext: ".chd",
        fullPath:
          "/Users/player/Documents/Games/Retro Collection 2024/Sega Saturn ISOs (NTSC-J)/Panzer Dragoon Saga (Japan) (Disc 1 of 4) [AZEL - Panzer Dragoon RPG].chd",
        matchingSystems: [PSX, SATURN],
        mtimeMs: 1_710_000_000_000,
      },
    ],
  },
};
