// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerCommand, WorkerEvent } from "./core-worker-protocol";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({ writeFileSync: vi.fn(), clock: 0 }));
vi.mock("node:fs", () => ({
  existsSync: () => false,
  mkdirSync: vi.fn(),
  writeFileSync: mocks.writeFileSync,
}));
vi.mock("node:perf_hooks", () => ({ performance: { now: () => ++mocks.clock } }));

describe("worker screenshots", () => {
  const originalPort = Object.getOwnPropertyDescriptor(process, "parentPort");
  let receive: (event: { data: WorkerCommand }) => void;
  let events: Array<WorkerEvent>;
  let nextFrame: { data: Uint8Array; width: number; height: number } | null;
  let fixtureDir: string;
  const frame = { data: new Uint8Array([10, 20, 30, 255]), width: 1, height: 1 };

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.clock = 0;
    mocks.writeFileSync.mockClear();
    events = [];
    nextFrame = null;
    Object.defineProperty(process, "parentPort", {
      configurable: true,
      value: {
        on: (_name: string, listener: typeof receive) => {
          receive = listener;
        },
        postMessage: (event: WorkerEvent) => events.push(event),
      },
    });
    vi.stubGlobal(
      "__workerScreenshotCore",
      class {
        setSystemDirectory() {}
        setSaveDirectory() {}
        loadCore() {
          return true;
        }
        loadGame() {
          return true;
        }
        getLogMessages() {
          return [];
        }
        getDiscLabel() {
          return null;
        }
        getAVInfo() {
          return { timing: { fps: 60, sampleRate: 44_100 } };
        }
        getMemoryData() {
          return null;
        }
        run() {
          nextFrame = frame;
        }
        getVideoFrame() {
          const result = nextFrame;
          nextFrame = null;
          return result;
        }
        getAudioBuffer() {
          return null;
        }
      },
    );
    fixtureDir = await mkdtemp(join(tmpdir(), "gamelord-worker-test-"));
    const addonPath = join(fixtureDir, "addon.cjs");
    await writeFile(
      addonPath,
      "module.exports = { LibretroCore: globalThis.__workerScreenshotCore }",
    );
    await import("./core-worker");
    receive({
      data: {
        action: "init",
        addonPath,
        corePath: "/mock/core",
        romPath: "/roms/test.nes",
        systemDir: "/system",
        saveDir: "/saves",
        sramDir: "/sram",
        saveStatesDir: "/profile/states",
      },
    });
    expect(
      events.some((event) => event.type === "ready"),
      JSON.stringify(events),
    ).toBe(true);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalPort) {
      Object.defineProperty(process, "parentPort", originalPort);
    } else {
      Reflect.deleteProperty(process, "parentPort");
    }
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it.each([1, 4])(
    "captures the displayed frame after rendering at %ix speed and pausing",
    (multiplier) => {
      receive({ data: { action: "setSpeed", multiplier } });
      vi.advanceTimersToNextTimer();
      expect(events.some((event) => event.type === "videoFrame")).toBe(true);
      expect(nextFrame).toBeNull();
      receive({ data: { action: "pause" } });
      receive({ data: { action: "screenshot", requestId: "paused-shot" } });
      expect(events.at(-1)).toMatchObject({
        type: "response",
        requestId: "paused-shot",
        success: true,
      });
      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("screenshots/"),
        Buffer.from(frame.data),
      );
      receive({ data: { action: "screenshot", requestId: "second-shot" } });
      expect(events.at(-1)).toMatchObject({ requestId: "second-shot", success: true });
    },
  );

  it("reports no frame before the core has rendered", () => {
    receive({ data: { action: "screenshot", requestId: "early-shot" } });
    expect(events.at(-1)).toMatchObject({
      requestId: "early-shot",
      success: false,
      error: "No frame available",
    });
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });
});
