// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AVInfo, SaveStateMetadata } from "./core-worker-protocol";
import { listSaveStates, writeSaveState, type SaveStateCore } from "./save-state-files";
import { decodePng, makeFrame, pixelAt } from "./png-test-helpers";

const RED: [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];

const AV_INFO: AVInfo = {
  geometry: { baseWidth: 640, baseHeight: 480, maxWidth: 640, maxHeight: 480, aspectRatio: 4 / 3 },
  timing: { fps: 60, sampleRate: 44_100 },
};

function fakeCore(stateData: Uint8Array | null = new Uint8Array([1, 2, 3, 4])): SaveStateCore {
  return {
    serializeState: () => stateData,
    getSystemInfo: () => ({
      libraryName: "TestCore",
      libraryVersion: "1.0",
      validExtensions: "nes",
      needFullpath: false,
      blockExtract: false,
    }),
    getAVInfo: () => AV_INFO,
  };
}

function readSidecar(statePath: string): SaveStateMetadata {
  return JSON.parse(fs.readFileSync(statePath.replace(/\.sav$/, ".json"), "utf8"));
}

let romDir: string;
let statePath: string;
let pngPath: string;

beforeEach(() => {
  romDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gamelord-savestates-")), "Game");
  statePath = path.join(romDir, "state-0.sav");
  pngPath = path.join(romDir, "state-0.png");
});

afterEach(() => {
  fs.rmSync(path.dirname(romDir), { recursive: true, force: true });
});

describe("writeSaveState", () => {
  it("writes nothing when serialization fails", async () => {
    await expect(
      writeSaveState({
        core: fakeCore(null),
        statePath,
        slot: 0,
        romName: "Game",
        frame: makeFrame(640, 480, () => RED),
      }),
    ).rejects.toThrow("Failed to serialize state");

    expect(fs.existsSync(statePath)).toBe(false);
    expect(fs.existsSync(pngPath)).toBe(false);
    expect(fs.existsSync(statePath.replace(/\.sav$/, ".json"))).toBe(false);
  });

  it("still saves when thumbnail encoding fails, and records no thumbnail", async () => {
    const result = await writeSaveState({
      core: fakeCore(),
      statePath,
      slot: 0,
      romName: "Game",
      frame: { data: new Uint8Array(4), width: 640, height: 480 },
    });

    expect(result.thumbnailError).toMatch(/buffer/i);
    expect(fs.readFileSync(statePath)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(readSidecar(statePath).hasThumbnail).toBe(false);
    expect(fs.existsSync(pngPath)).toBe(false);
  });

  it("saves without a thumbnail when no frame has been displayed yet", async () => {
    const result = await writeSaveState({
      core: fakeCore(),
      statePath,
      slot: 0,
      romName: "Game",
      frame: null,
    });

    expect(result.thumbnailError).toMatch(/no frame/i);
    expect(fs.existsSync(statePath)).toBe(true);
    expect(readSidecar(statePath).hasThumbnail).toBe(false);
    expect(fs.existsSync(pngPath)).toBe(false);
  });

  it("removes a stale thumbnail when overwriting a slot without a new one", async () => {
    await writeSaveState({
      core: fakeCore(),
      statePath,
      slot: 0,
      romName: "Game",
      frame: makeFrame(640, 480, () => RED),
    });
    expect(fs.existsSync(pngPath)).toBe(true);

    await writeSaveState({ core: fakeCore(), statePath, slot: 0, romName: "Game", frame: null });

    expect(fs.existsSync(pngPath)).toBe(false);
    expect(readSidecar(statePath).hasThumbnail).toBe(false);
  });

  it("keeps the newest thumbnail when two saves to the same slot overlap", async () => {
    // Noise deflates far slower than a solid color, so the first save's
    // encode finishes after the second's — the ordering a stale write needs.
    const noise = (x: number, y: number): [number, number, number] => {
      const n = (x * 7919 + y * 104_729) ^ ((x * y) % 251);
      return [n & 255, (n >> 8) & 255, (n >> 16) & 255];
    };
    const first = writeSaveState({
      core: fakeCore(new Uint8Array([1])),
      statePath,
      slot: 0,
      romName: "Game",
      frame: makeFrame(640, 480, noise),
    });
    const second = writeSaveState({
      core: fakeCore(new Uint8Array([2])),
      statePath,
      slot: 0,
      romName: "Game",
      frame: makeFrame(640, 480, () => BLUE),
    });
    await Promise.all([first, second]);

    expect(fs.readFileSync(statePath)).toEqual(Buffer.from([2]));
    expect(pixelAt(decodePng(fs.readFileSync(pngPath)), 0, 0)).toEqual(BLUE);
    expect(readSidecar(statePath).hasThumbnail).toBe(true);
    expect(readSidecar(statePath).stateSize).toBe(1);
  });

  it("writes a downscaled PNG thumbnail next to the save and records it in the sidecar", async () => {
    const result = await writeSaveState({
      core: fakeCore(),
      statePath,
      slot: 0,
      romName: "Game",
      frame: makeFrame(640, 480, () => RED),
    });

    expect(result.thumbnailError).toBeNull();
    const image = decodePng(fs.readFileSync(pngPath));
    expect([image.width, image.height]).toEqual([320, 240]);
    expect(pixelAt(image, 160, 120)).toEqual(RED);
    expect(readSidecar(statePath)).toMatchObject({
      slot: 0,
      coreName: "TestCore",
      coreVersion: "1.0",
      romName: "Game",
      stateSize: 4,
      hasThumbnail: true,
    });
  });

  it("names the autosave thumbnail after the autosave file", async () => {
    const autosavePath = path.join(romDir, "autosave.sav");
    await writeSaveState({
      core: fakeCore(),
      statePath: autosavePath,
      slot: 99,
      romName: "Game",
      frame: makeFrame(640, 480, () => RED),
    });

    expect(fs.existsSync(path.join(romDir, "autosave.png"))).toBe(true);
  });
});

describe("listSaveStates", () => {
  it("returns an empty list when the game has no save directory", () => {
    expect(listSaveStates(romDir, "Game")).toEqual([]);
  });

  it("reports no thumbnail for legacy saves without a sidecar", () => {
    fs.mkdirSync(romDir, { recursive: true });
    fs.writeFileSync(statePath, Buffer.from([1, 2, 3]));

    const [state] = listSaveStates(romDir, "Game");
    expect(state).toMatchObject({ slot: 0, stateSize: 3, hasThumbnail: false });
  });

  it("reports no thumbnail for sidecars written before thumbnails existed", () => {
    fs.mkdirSync(romDir, { recursive: true });
    fs.writeFileSync(statePath, Buffer.from([1]));
    fs.writeFileSync(
      statePath.replace(/\.sav$/, ".json"),
      JSON.stringify({
        slot: 0,
        createdAt: "2026-04-10T00:00:00.000Z",
        coreName: "TestCore",
        coreVersion: "1.0",
        playTimeSeconds: null,
        romName: "Game",
        stateSize: 1,
      }),
    );

    const [state] = listSaveStates(romDir, "Game");
    expect(state).toMatchObject({ coreName: "TestCore", hasThumbnail: false });
  });

  it("reports no thumbnail when the sidecar claims one but the PNG is gone", async () => {
    await writeSaveState({
      core: fakeCore(),
      statePath,
      slot: 0,
      romName: "Game",
      frame: makeFrame(640, 480, () => RED),
    });
    fs.rmSync(pngPath);

    const [state] = listSaveStates(romDir, "Game");
    expect(state.hasThumbnail).toBe(false);
  });

  it("reports the thumbnail for saves that have one, sorted by slot", async () => {
    for (const slot of [2, 0]) {
      await writeSaveState({
        core: fakeCore(),
        statePath: path.join(romDir, `state-${slot}.sav`),
        slot,
        romName: "Game",
        frame: makeFrame(640, 480, () => RED),
      });
    }

    const states = listSaveStates(romDir, "Game");
    expect(states.map((state) => [state.slot, state.hasThumbnail])).toEqual([
      [0, true],
      [2, true],
    ]);
  });
});
