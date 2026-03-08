import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Module mocks (hoisted before imports) ---

vi.mock("electron", () => ({
  powerSaveBlocker: {
    start: vi.fn(() => 42),
    stop: vi.fn(),
    isStarted: vi.fn(() => true),
  },
  app: {
    getPath: vi.fn(() => "/tmp/test"),
    getAppPath: vi.fn(() => "/tmp/test-app"),
  },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
  mkdirSync: vi.fn(),
}));

vi.mock("os", () => ({
  homedir: vi.fn(() => "/home/test"),
}));

vi.mock("./CoreDownloader", async () => {
  const { EventEmitter } = await import("node:events");
  class FakeCoreDownloader extends EventEmitter {
    getCoresDirectory() {
      return "/tmp/cores";
    }
    getCoresForSystem() {
      return [];
    }
    getCorePath() {
      return "/tmp/cores/test_libretro.dylib";
    }
    async downloadCore() {
      return "/tmp/cores/test_libretro.dylib";
    }
    async downloadCoreForSystem() {
      return "/tmp/cores/test_libretro.dylib";
    }
  }
  return { CoreDownloader: FakeCoreDownloader };
});

vi.mock("./RetroArchCore");
vi.mock("./LibretroNativeCore", async () => {
  const { EventEmitter } = await import("node:events");
  class FakeLibretroNativeCore extends EventEmitter {
    isActive() {
      return false;
    }
    async launch() {
      /* no-op */
    }
    async terminate() {
      /* no-op */
    }
  }
  return { LibretroNativeCore: FakeLibretroNativeCore };
});

vi.mock("./EmulationWorkerClient");

import { powerSaveBlocker } from "electron";
import * as fs from "node:fs";
import { EmulatorManager } from "./EmulatorManager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function internals(mgr: EmulatorManager) {
  return mgr as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EmulatorManager — power save blocker", () => {
  let manager: EmulatorManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(powerSaveBlocker.start).mockReturnValue(42);
    vi.mocked(powerSaveBlocker.isStarted).mockReturnValue(true);
    manager = new EmulatorManager();
  });

  it("starts a power save blocker when launching a game", async () => {
    await manager.launchGame("/rom.nes", "nes");

    expect(powerSaveBlocker.start).toHaveBeenCalledWith("prevent-display-sleep");
    expect(internals(manager).powerSaveBlockerId).toBe(42);
  });

  it("stops the power save blocker when stopping the emulator", async () => {
    await manager.launchGame("/rom.nes", "nes");
    await manager.stopEmulator();

    expect(powerSaveBlocker.stop).toHaveBeenCalledWith(42);
    expect(internals(manager).powerSaveBlockerId).toBeNull();
  });

  it("does not start duplicate blockers on consecutive launches", async () => {
    await manager.launchGame("/rom.nes", "nes");
    await manager.launchGame("/rom2.nes", "nes");

    // start is called once; the second launch sees the existing blocker
    expect(powerSaveBlocker.start).toHaveBeenCalledTimes(1);
  });

  it("handles stopEmulator gracefully when no blocker is active", async () => {
    await manager.stopEmulator();

    expect(powerSaveBlocker.stop).not.toHaveBeenCalled();
  });

  it('releases the blocker when the emulator emits "exited"', async () => {
    await manager.launchGame("/rom.nes", "nes");
    const emulator = internals(manager).currentEmulator as import("events").EventEmitter;
    emulator.emit("exited", { code: 0 });

    expect(powerSaveBlocker.stop).toHaveBeenCalledWith(42);
    expect(internals(manager).powerSaveBlockerId).toBeNull();
  });

  it('releases the blocker when the emulator emits "terminated"', async () => {
    await manager.launchGame("/rom.nes", "nes");
    const emulator = internals(manager).currentEmulator as import("events").EventEmitter;
    emulator.emit("terminated");

    expect(powerSaveBlocker.stop).toHaveBeenCalledWith(42);
    expect(internals(manager).powerSaveBlockerId).toBeNull();
  });

  it("handles already-stopped blocker gracefully", async () => {
    await manager.launchGame("/rom.nes", "nes");

    // Simulate the blocker having been stopped externally
    vi.mocked(powerSaveBlocker.isStarted).mockReturnValue(false);

    await manager.stopEmulator();

    // stop() should not be called since isStarted returned false
    expect(powerSaveBlocker.stop).not.toHaveBeenCalled();
    expect(internals(manager).powerSaveBlockerId).toBeNull();
  });
});

describe("EmulatorManager — BIOS validation", () => {
  let manager: EmulatorManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new EmulatorManager();
  });

  it("returns valid for systems without BIOS requirements", () => {
    const result = manager.validateBios("nes");
    expect(result.valid).toBe(true);
    expect(result.missingFiles).toEqual([]);
  });

  it("returns valid when all BIOS files exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = manager.validateBios("saturn");
    expect(result.valid).toBe(true);
    expect(result.missingFiles).toEqual([]);
  });

  it("returns missing files when BIOS files are absent", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = manager.validateBios("saturn");
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toEqual(["sega_101.bin", "mpr-17933.bin"]);
    expect(result.systemName).toBe("Sega Saturn");
    expect(result.biosDir).toContain("BIOS");
  });

  it("detects partial BIOS files", () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
      String(p).endsWith("sega_101.bin"),
    );
    const result = manager.validateBios("saturn");
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toEqual(["mpr-17933.bin"]);
  });
});
