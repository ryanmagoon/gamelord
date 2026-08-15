import eightBitTableTennisCover from "../../desktop/resources/homebrew/8bit-table-tennis.png";
import lawnMowerCover from "../../desktop/resources/homebrew/lawn-mower.png";
import nesertGolfingCover from "../../desktop/resources/homebrew/nesert-golfing.png";
import type { ImportedGameRecord } from "./romLibrary";

interface GameDetails {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly accent: string;
}

interface BundledMiniappGame extends GameDetails {
  readonly source: "bundled";
  readonly coverUrl: string;
  readonly romPath: string;
}

interface ImportedMiniappGame extends GameDetails {
  readonly source: "imported";
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly romBase64: string;
}

export type MiniappGame = BundledMiniappGame | ImportedMiniappGame;

export const MINIAPP_GAMES: ReadonlyArray<MiniappGame> = [
  {
    id: "nesert-golfing",
    source: "bundled",
    title: "Nesert Golfing",
    subtitle: "Desert golf, one shot at a time",
    coverUrl: nesertGolfingCover,
    romPath: "static/roms/nesert-golfing.nes",
    accent: "#f4b94f",
  },
  {
    id: "lawn-mower",
    source: "bundled",
    title: "Lawn Mower",
    subtitle: "Cut clean lines against the clock",
    coverUrl: lawnMowerCover,
    romPath: "static/roms/lawn-mower.nes",
    accent: "#89d37d",
  },
  {
    id: "8bit-table-tennis",
    source: "bundled",
    title: "8-Bit Table Tennis",
    subtitle: "Fast rallies in a tiny arena",
    coverUrl: eightBitTableTennisCover,
    romPath: "static/roms/8bit-table-tennis.nes",
    accent: "#ee725d",
  },
];

const importedAccents = ["#72c8ff", "#bc8cff", "#5ed6b3", "#ff8ebd"] as const;

const formatRomSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  return `${Math.round(bytes / 1024)} KB`;
};

export const toMiniappGame = (record: ImportedGameRecord): MiniappGame => ({
  id: record.id,
  source: "imported",
  title: record.title,
  subtitle: `${formatRomSize(record.sizeBytes)} · Personal cartridge`,
  fileName: record.fileName,
  sizeBytes: record.sizeBytes,
  romBase64: record.romBase64,
  accent: importedAccents[Number.parseInt(record.sha256.slice(0, 2), 16) % importedAccents.length],
});
