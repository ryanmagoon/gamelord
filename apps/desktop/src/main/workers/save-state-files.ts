/**
 * On-disk save state layout, shared by the emulation worker:
 *
 *   <saveStatesDir>/<romName>/state-<slot>.sav   serialized core state
 *   <saveStatesDir>/<romName>/state-<slot>.json  SaveStateMetadata sidecar
 *   <saveStatesDir>/<romName>/state-<slot>.png   thumbnail (optional)
 *
 * The autosave slot (99) uses `autosave.*` with the same extensions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { NativeLibretroCore, SaveStateMetadata } from "./core-worker-protocol";
import { createThumbnailPng, type RgbaFrame } from "./save-state-thumbnail";

export type SaveStateCore = Pick<
  NativeLibretroCore,
  "serializeState" | "getSystemInfo" | "getAVInfo"
>;

/**
 * Latest save generation per state path. A slower thumbnail encode from an
 * earlier save must not overwrite the thumbnail of a newer save to the same
 * slot (e.g. rapid quicksaves).
 */
const latestGeneration = new Map<string, number>();

function sidecarPath(statePath: string): string {
  return statePath.replace(/\.sav$/, ".json");
}

function thumbnailPath(statePath: string): string {
  return statePath.replace(/\.sav$/, ".png");
}

/**
 * Serialize the core into `statePath`, write its metadata sidecar, then
 * encode `frame` as a thumbnail.
 *
 * Serialization and the `.sav`/`.json` writes happen synchronously before the
 * first await, so the state matches `frame` (no emulation frame can run in
 * between). Thumbnail failures never fail the save: the sidecar keeps
 * `hasThumbnail: false` and the reason is returned for logging.
 *
 * @param frame The last frame displayed to the user, or null if none yet.
 */
export async function writeSaveState(options: {
  core: SaveStateCore;
  statePath: string;
  slot: number;
  romName: string;
  frame: RgbaFrame | null;
}): Promise<{ thumbnailError: string | null }> {
  const { core, statePath, slot, romName, frame } = options;

  const stateData = core.serializeState();
  if (!stateData) {
    throw new Error("Failed to serialize state");
  }

  const generation = (latestGeneration.get(statePath) ?? 0) + 1;
  latestGeneration.set(statePath, generation);

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, Buffer.from(stateData.buffer));

  const systemInfo = core.getSystemInfo();
  const metadata: SaveStateMetadata = {
    slot,
    createdAt: new Date().toISOString(),
    coreName: systemInfo?.libraryName ?? "Unknown",
    coreVersion: systemInfo?.libraryVersion ?? "Unknown",
    playTimeSeconds: null,
    romName,
    stateSize: stateData.byteLength,
    hasThumbnail: false,
  };
  // Drop any thumbnail from a previous save in this slot so it can't be
  // mistaken for this one if encoding fails.
  fs.rmSync(thumbnailPath(statePath), { force: true });
  fs.writeFileSync(sidecarPath(statePath), JSON.stringify(metadata, null, 2));

  if (!frame) {
    return { thumbnailError: "No frame available for thumbnail" };
  }

  try {
    const png = await createThumbnailPng(frame, core.getAVInfo()?.geometry.aspectRatio ?? 0);
    if (latestGeneration.get(statePath) !== generation) {
      return { thumbnailError: null };
    }
    fs.writeFileSync(thumbnailPath(statePath), png);
    fs.writeFileSync(
      sidecarPath(statePath),
      JSON.stringify({ ...metadata, hasThumbnail: true }, null, 2),
    );
    return { thumbnailError: null };
  } catch (error) {
    return { thumbnailError: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * List all save states in `romDir`, sorted by slot. Saves without a sidecar
 * (legacy) fall back to file stats. `hasThumbnail` is only true when the
 * sidecar records one and the PNG is actually on disk.
 */
export function listSaveStates(romDir: string, romName: string): Array<SaveStateMetadata> {
  if (!fs.existsSync(romDir)) {
    return [];
  }

  const states: Array<SaveStateMetadata> = [];

  for (const entry of fs.readdirSync(romDir)) {
    if (!entry.endsWith(".sav")) {
      continue;
    }

    const savPath = path.join(romDir, entry);
    const metaPath = sidecarPath(savPath);

    // Derive slot number from filename
    let slot: number;
    if (entry === "autosave.sav") {
      slot = 99;
    } else {
      const match = entry.match(/^state-(\d+)\.sav$/);
      if (!match) {
        continue;
      }
      slot = Number.parseInt(match[1], 10);
    }

    if (fs.existsSync(metaPath)) {
      try {
        const raw = fs.readFileSync(metaPath, "utf8");
        const metadata = JSON.parse(raw) as SaveStateMetadata;
        states.push({
          ...metadata,
          hasThumbnail: metadata.hasThumbnail === true && fs.existsSync(thumbnailPath(savPath)),
        });
        continue;
      } catch {
        // Fall through to stat-based fallback
      }
    }

    // Fallback for legacy saves without metadata sidecar
    const stat = fs.statSync(savPath);
    states.push({
      slot,
      createdAt: stat.mtime.toISOString(),
      coreName: "Unknown",
      coreVersion: "Unknown",
      playTimeSeconds: null,
      romName,
      stateSize: stat.size,
      hasThumbnail: false,
    });
  }

  return states.sort((a, b) => a.slot - b.slot);
}
