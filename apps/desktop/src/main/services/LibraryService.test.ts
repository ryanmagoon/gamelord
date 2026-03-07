import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

// Mock electron before importing LibraryService
const TEST_DIR = path.join(os.tmpdir(), "gamelord-library-service-test-" + Date.now());
const USER_DATA_DIR = path.join(TEST_DIR, "userData");
const HOME_DIR = path.join(TEST_DIR, "home");
const ROMS_DIR = path.join(TEST_DIR, "roms");

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === "userData") {
        return USER_DATA_DIR;
      }
      if (name === "home") {
        return HOME_DIR;
      }
      return TEST_DIR;
    }),
  },
}));

vi.mock("../logger", () => ({
  libraryLog: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { LibraryService } from "./LibraryService";
import type { ScanProgressEvent } from "./LibraryService";
import { DEFAULT_SYSTEMS } from "../../types/library";
import type { GameSystem, Game } from "../../types/library";

/**
 * The constructor fires off async loadConfig() and loadLibrary() without awaiting them.
 * We need to let those promises settle before interacting with the service.
 */
async function createService(): Promise<LibraryService> {
  const service = new LibraryService();
  // Allow the constructor's async calls (loadConfig, loadLibrary) to settle
  await vi.waitFor(
    async () => {
      // Config is loaded when systems array is populated (default config has DEFAULT_SYSTEMS)
      // or the config file was read successfully
      const config = service.getConfig();
      if (
        config.systems.length === 0 &&
        !fs.existsSync(path.join(USER_DATA_DIR, "library-config.json"))
      ) {
        // Still loading — config hasn't been written yet
        throw new Error("Config not yet loaded");
      }
    },
    { interval: 10, timeout: 2000 },
  );
  // Extra tick to ensure saveConfig completes on first-run path
  await new Promise((resolve) => setTimeout(resolve, 50));
  return service;
}

/** Compute the SHA-256 of a file's content (mirrors computeRomHashes gameId). */
function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Compute the SHA-256 of a string. */
function sha256String(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Compute all ROM hashes for a buffer (mirrors computeRomHashes). */
function computeExpectedHashes(content: Buffer | string): {
  crc32: string;
  md5: string;
  sha1: string;
} {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return {
    crc32: zlib.crc32(buf).toString(16).padStart(8, "0"),
    md5: crypto.createHash("md5").update(buf).digest("hex"),
    sha1: crypto.createHash("sha1").update(buf).digest("hex"),
  };
}

const TEST_NES_SYSTEM: GameSystem = {
  extensions: [".nes", ".fds", ".unf", ".unif"],
  id: "nes",
  name: "Nintendo Entertainment System",
  shortName: "NES",
};

const TEST_SNES_SYSTEM: GameSystem = {
  extensions: [".sfc", ".smc", ".swc", ".fig"],
  id: "snes",
  name: "Super Nintendo Entertainment System",
  shortName: "SNES",
};

const TEST_GB_SYSTEM: GameSystem = {
  extensions: [".gb", ".gbc", ".sgb"],
  id: "gb",
  name: "Game Boy",
  shortName: "GB",
};

beforeAll(() => {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(HOME_DIR, { recursive: true });
  fs.mkdirSync(ROMS_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TEST_DIR, { force: true, recursive: true });
});

beforeEach(() => {
  // Clean userData files between tests so each test starts fresh
  for (const file of [
    "library-config.json", "library-config.json.bak", "library-config.json.tmp",
    "library.json", "library.json.bak", "library.json.tmp",
  ]) {
    const filePath = path.join(USER_DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

// ---------------------------------------------------------------------------
// Constructor / Config
// ---------------------------------------------------------------------------

describe("LibraryService", () => {
  describe("constructor and config", () => {
    it("creates default config with DEFAULT_SYSTEMS when no config file exists", async () => {
      const service = await createService();
      const config = service.getConfig();

      expect(config.systems.length).toBeGreaterThan(0);
      expect(config.scanRecursive).toBe(true);
      expect(config.autoScan).toBe(false);
      expect(config.romsBasePath).toBe(path.join(HOME_DIR, "ROMs"));

      // Verify default config was persisted
      const saved = JSON.parse(
        fs.readFileSync(path.join(USER_DATA_DIR, "library-config.json"), "utf8"),
      );
      expect(saved.systems.length).toBeGreaterThan(0);
    });

    it("loads existing config from disk on construction", async () => {
      const customConfig = {
        autoScan: true,
        romsBasePath: "/custom/roms",
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(customConfig, null, 2),
      );

      const service = await createService();
      const config = service.getConfig();

      // NES should be first (from the saved config), with backfilled defaults after it
      expect(config.systems[0].id).toBe("nes");
      expect(config.systems.length).toBe(DEFAULT_SYSTEMS.length);
      expect(config.romsBasePath).toBe("/custom/roms");
      expect(config.scanRecursive).toBe(false);
      expect(config.autoScan).toBe(true);
    });

    it("config save/load round-trip preserves data", async () => {
      const service = await createService();
      await service.setRomsBasePath("/new/base/path");

      // Create a second service to reload from disk
      const service2 = await createService();
      expect(service2.getConfig().romsBasePath).toBe("/new/base/path");
    });

    it("scaffolds per-system ROM folders on first launch and sets romsPath", async () => {
      const service = await createService();
      const config = service.getConfig();
      const basePath = config.romsBasePath!;

      // Every system in the default config should have a folder created and romsPath set
      for (const system of config.systems) {
        const systemDir = path.join(basePath, system.shortName);
        expect(fs.existsSync(systemDir)).toBe(true);
        expect(system.romsPath).toBe(systemDir);
      }
    });

    it("does not scaffold all folders when config already exists", async () => {
      // Create a config with ALL default systems so backfill has nothing to add
      const customConfig = {
        autoScan: false,
        romsBasePath: path.join(TEST_DIR, "existing-roms"),
        scanRecursive: true,
        systems: DEFAULT_SYSTEMS,
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(customConfig, null, 2),
      );

      await createService();

      // The romsBasePath folder should NOT have been created (no new systems to backfill)
      expect(fs.existsSync(path.join(TEST_DIR, "existing-roms"))).toBe(false);
    });

    it("backfills new systems missing from a saved config", async () => {
      // Simulate an old config that only has NES — missing all other DEFAULT_SYSTEMS
      const oldConfig = {
        autoScan: false,
        romsBasePath: path.join(TEST_DIR, "backfill-roms"),
        scanRecursive: true,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(oldConfig, null, 2),
      );

      const service = await createService();
      const systems = service.getSystems();

      // NES should still be there, plus all the systems from DEFAULT_SYSTEMS
      expect(systems.find((s) => s.id === "nes")).toBeDefined();
      expect(systems.find((s) => s.id === "saturn")).toBeDefined();
      expect(systems.find((s) => s.id === "snes")).toBeDefined();
      expect(systems.length).toBeGreaterThan(1);

      // Folders should have been created and romsPath set for the newly added systems
      const saturnDir = path.join(TEST_DIR, "backfill-roms", "Saturn");
      expect(fs.existsSync(saturnDir)).toBe(true);
      const saturn = systems.find((s) => s.id === "saturn")!;
      expect(saturn.romsPath).toBe(saturnDir);

      // Clean up
      fs.rmSync(path.join(TEST_DIR, "backfill-roms"), { force: true, recursive: true });
    });
  });

  // ---------------------------------------------------------------------------
  // System management
  // ---------------------------------------------------------------------------

  describe("addSystem", () => {
    it("adds a new system to config", async () => {
      const service = await createService();
      const customSystem: GameSystem = {
        extensions: [".cst"],
        id: "custom",
        name: "Custom System",
        shortName: "CUST",
      };

      await service.addSystem(customSystem);
      const systems = service.getSystems();
      const found = systems.find((s) => s.id === "custom");

      expect(found).toBeDefined();
      expect(found!.name).toBe("Custom System");
    });

    it("does not add a duplicate system with the same id", async () => {
      const service = await createService();
      const initialCount = service.getSystems().length;

      // NES is already in DEFAULT_SYSTEMS
      await service.addSystem(TEST_NES_SYSTEM);
      expect(service.getSystems().length).toBe(initialCount);
    });
  });

  describe("removeSystem", () => {
    it("removes system and cascades to delete games from that system", async () => {
      // Seed config with just NES and SNES so we have a known set
      const config = {
        autoScan: false,
        scanRecursive: true,
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      // Seed a library with games from both systems
      const nesRomPath = path.join(ROMS_DIR, "zelda.nes");
      const snesRomPath = path.join(ROMS_DIR, "mario_world.sfc");
      fs.writeFileSync(nesRomPath, "nes-game-data");
      fs.writeFileSync(snesRomPath, "snes-game-data");

      const service = await createService();
      await service.addGame(nesRomPath, "nes");
      await service.addGame(snesRomPath, "snes");

      expect(service.getGames().length).toBe(2);

      await service.removeSystem("nes");

      expect(service.getSystems().find((s) => s.id === "nes")).toBeUndefined();
      expect(service.getGames("nes")).toHaveLength(0);
      expect(service.getGames("snes")).toHaveLength(1);

      // Clean up rom files
      fs.unlinkSync(nesRomPath);
      fs.unlinkSync(snesRomPath);
    });
  });

  describe("updateSystemPath", () => {
    it("updates the romsPath for an existing system", async () => {
      const service = await createService();
      await service.updateSystemPath("nes", "/new/nes/roms");

      const nesSystem = service.getSystems().find((s) => s.id === "nes");
      expect(nesSystem?.romsPath).toBe("/new/nes/roms");

      // Verify it was persisted
      const savedConfig = JSON.parse(
        fs.readFileSync(path.join(USER_DATA_DIR, "library-config.json"), "utf8"),
      );
      const savedNes = savedConfig.systems.find((s: GameSystem) => s.id === "nes");
      expect(savedNes.romsPath).toBe("/new/nes/roms");
    });

    it("does nothing for an unknown system id", async () => {
      const service = await createService();
      const systemsBefore = JSON.stringify(service.getSystems());

      await service.updateSystemPath("nonexistent", "/whatever");

      expect(JSON.stringify(service.getSystems())).toBe(systemsBefore);
    });
  });

  describe("getSystems", () => {
    it("returns all configured systems", async () => {
      const service = await createService();
      const systems = service.getSystems();

      expect(Array.isArray(systems)).toBe(true);
      expect(systems.length).toBeGreaterThan(0);
      expect(systems[0]).toHaveProperty("id");
      expect(systems[0]).toHaveProperty("name");
      expect(systems[0]).toHaveProperty("extensions");
    });
  });

  // ---------------------------------------------------------------------------
  // Game management
  // ---------------------------------------------------------------------------

  describe("getGames", () => {
    it("returns all games when no systemId filter is provided", async () => {
      const nesRom = path.join(ROMS_DIR, "game1.nes");
      const snesRom = path.join(ROMS_DIR, "game1.sfc");
      fs.writeFileSync(nesRom, "nes-content-1");
      fs.writeFileSync(snesRom, "snes-content-1");

      const config = {
        autoScan: false,
        scanRecursive: true,
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      await service.addGame(nesRom, "nes");
      await service.addGame(snesRom, "snes");

      const allGames = service.getGames();
      expect(allGames).toHaveLength(2);

      fs.unlinkSync(nesRom);
      fs.unlinkSync(snesRom);
    });

    it("filters games by systemId when provided", async () => {
      const nesRom = path.join(ROMS_DIR, "game2.nes");
      const snesRom = path.join(ROMS_DIR, "game2.sfc");
      fs.writeFileSync(nesRom, "nes-content-2");
      fs.writeFileSync(snesRom, "snes-content-2");

      const config = {
        autoScan: false,
        scanRecursive: true,
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      await service.addGame(nesRom, "nes");
      await service.addGame(snesRom, "snes");

      expect(service.getGames("nes")).toHaveLength(1);
      expect(service.getGames("snes")).toHaveLength(1);
      expect(service.getGames("nonexistent")).toHaveLength(0);

      fs.unlinkSync(nesRom);
      fs.unlinkSync(snesRom);
    });
  });

  describe("addGame", () => {
    it("creates a game with correct SHA-256 content-based ID and romHashes", async () => {
      const romPath = path.join(ROMS_DIR, "test_game.nes");
      const romContent = "unique-nes-rom-data-for-sha256-test";
      fs.writeFileSync(romPath, romContent);

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      expect(game).not.toBeNull();
      expect(game!.id).toBe(sha256File(romPath));
      expect(game!.id).toHaveLength(64); // SHA-256 hex digest
      expect(game!.title).toBe("test game");
      expect(game!.system).toBe("Nintendo Entertainment System");
      expect(game!.systemId).toBe("nes");
      expect(game!.romPath).toBe(romPath);

      // Verify romHashes
      const expected = computeExpectedHashes(romContent);
      expect(game!.romHashes).toEqual(expected);

      fs.unlinkSync(romPath);
    });

    it("returns null for an unknown system id", async () => {
      const romPath = path.join(ROMS_DIR, "game.nes");
      fs.writeFileSync(romPath, "data");

      const service = await createService();
      const game = await service.addGame(romPath, "unknown-system");

      expect(game).toBeNull();

      fs.unlinkSync(romPath);
    });

    it("returns null when the file extension does not match the system", async () => {
      const romPath = path.join(ROMS_DIR, "game.txt");
      fs.writeFileSync(romPath, "data");

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      expect(game).toBeNull();

      fs.unlinkSync(romPath);
    });

    it("persists the game to the library file on disk", async () => {
      const romPath = path.join(ROMS_DIR, "persist_test.nes");
      fs.writeFileSync(romPath, "persist-data");

      const service = await createService();
      await service.addGame(romPath, "nes");

      const libraryFile = path.join(USER_DATA_DIR, "library.json");
      const savedGames: Array<Game> = JSON.parse(fs.readFileSync(libraryFile, "utf8"));
      expect(savedGames).toHaveLength(1);
      expect(savedGames[0].romPath).toBe(romPath);

      fs.unlinkSync(romPath);
    });
  });

  describe("removeGame", () => {
    it("deletes game from the library", async () => {
      const romPath = path.join(ROMS_DIR, "remove_me.nes");
      fs.writeFileSync(romPath, "remove-data");

      const service = await createService();
      const game = await service.addGame(romPath, "nes");
      expect(service.getGames()).toHaveLength(1);

      await service.removeGame(game!.id);
      expect(service.getGames()).toHaveLength(0);

      // Verify persistence
      const savedGames: Array<Game> = JSON.parse(
        fs.readFileSync(path.join(USER_DATA_DIR, "library.json"), "utf8"),
      );
      expect(savedGames).toHaveLength(0);

      fs.unlinkSync(romPath);
    });
  });

  describe("updateGame", () => {
    it("updates game properties and persists", async () => {
      const romPath = path.join(ROMS_DIR, "update_me.nes");
      fs.writeFileSync(romPath, "update-data");

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      await service.updateGame(game!.id, {
        favorite: true,
        playTime: 3600,
        title: "Updated Title",
      });

      const updated = service.getGames().find((g) => g.id === game!.id);
      expect(updated?.title).toBe("Updated Title");
      expect(updated?.favorite).toBe(true);
      expect(updated?.playTime).toBe(3600);

      fs.unlinkSync(romPath);
    });

    it("does nothing for a non-existent game id", async () => {
      const service = await createService();
      // Should not throw
      await service.updateGame("nonexistent-id", { title: "Ghost" });
      expect(service.getGames()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // scanDirectory
  // ---------------------------------------------------------------------------

  describe("scanDirectory", () => {
    const scanDir = path.join(TEST_DIR, "scan-test");

    beforeAll(() => {
      // Build a directory structure:
      // scan-test/
      //   game_a.nes            (NES ROM)
      //   game_b.sfc            (SNES ROM)
      //   readme.txt            (not a ROM)
      //   NES/
      //     game_c.nes          (NES ROM in system-named folder)
      //   subfolder/
      //     game_d.nes          (NES ROM in generic subfolder)
      fs.mkdirSync(path.join(scanDir, "NES"), { recursive: true });
      fs.mkdirSync(path.join(scanDir, "subfolder"), { recursive: true });

      fs.writeFileSync(path.join(scanDir, "game_a.nes"), "nes-a");
      fs.writeFileSync(path.join(scanDir, "game_b.sfc"), "snes-b");
      fs.writeFileSync(path.join(scanDir, "readme.txt"), "not a rom");
      fs.writeFileSync(path.join(scanDir, "NES", "game_c.nes"), "nes-c");
      fs.writeFileSync(path.join(scanDir, "subfolder", "game_d.nes"), "nes-d");
    });

    afterAll(() => {
      fs.rmSync(scanDir, { force: true, recursive: true });
    });

    it("finds ROMs by extension and creates Game objects with correct titles", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(scanDir);

      // Non-recursive: should find game_a.nes and game_b.sfc at root, skip subdirs
      const titles = games.map((g) => g.title);
      expect(titles).toContain("game a");
      expect(titles).toContain("game b");
      // Should NOT include subdirectory games in non-recursive mode
      expect(titles).not.toContain("game c");
      expect(titles).not.toContain("game d");
    });

    it("recursively scans subdirectories when scanRecursive is true", async () => {
      const config = {
        autoScan: false,
        scanRecursive: true,
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(scanDir);

      const titles = games.map((g) => g.title);
      expect(titles).toContain("game a");
      expect(titles).toContain("game b");
      expect(titles).toContain("game c");
      expect(titles).toContain("game d");
    });

    it("detects system by folder name (shortName match)", async () => {
      const config = {
        autoScan: false,
        scanRecursive: true,
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      // Scan without a specific systemId — folder "NES" should auto-detect
      const games = await service.scanDirectory(scanDir);

      const gameC = games.find((g) => g.title === "game c");
      expect(gameC).toBeDefined();
      expect(gameC!.systemId).toBe("nes");
    });

    it("scans with a specific systemId filter", async () => {
      const config = {
        autoScan: false,
        scanRecursive: true,
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(scanDir, "snes");

      // Only SNES games should be found
      expect(games.every((g) => g.systemId === "snes")).toBe(true);
      const titles = games.map((g) => g.title);
      expect(titles).toContain("game b");
      // .nes files should be excluded when filtering to snes
      expect(titles).not.toContain("game a");
    });

    it("skips non-ROM files", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(scanDir);

      const paths = games.map((g) => g.romPath);
      expect(paths).not.toContain(path.join(scanDir, "readme.txt"));
    });

    it("handles missing directory gracefully (does not throw)", async () => {
      const service = await createService();
      const games = await service.scanDirectory("/nonexistent/path/that/does/not/exist");
      expect(games).toEqual([]);
    });

    it("handles empty directory", async () => {
      const emptyDir = path.join(TEST_DIR, "empty-scan-dir");
      fs.mkdirSync(emptyDir, { recursive: true });

      const service = await createService();
      const games = await service.scanDirectory(emptyDir);
      expect(games).toEqual([]);

      fs.rmSync(emptyDir, { force: true, recursive: true });
    });
  });

  describe("scanDirectory — rescan preserves metadata", () => {
    it("preserves coverArt and metadata when rescanning the same files", async () => {
      const rescanDir = path.join(TEST_DIR, "rescan-preserve");
      fs.mkdirSync(rescanDir, { recursive: true });
      fs.writeFileSync(path.join(rescanDir, "zelda.nes"), "zelda-rom-data");

      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();

      // First scan — discover the game
      const firstScan = await service.scanDirectory(rescanDir);
      expect(firstScan).toHaveLength(1);
      const gameId = firstScan[0].id;

      // Simulate artwork sync by updating the game with coverArt and metadata
      await service.updateGame(gameId, {
        coverArt: "artwork://zelda.png",
        coverArtAspectRatio: 0.714,
        favorite: true,
        metadata: { developer: "Nintendo", genre: "Action-Adventure" },
      });

      // Verify metadata was set
      const beforeRescan = service.getGame(gameId);
      expect(beforeRescan?.coverArt).toBe("artwork://zelda.png");
      expect(beforeRescan?.favorite).toBe(true);

      // Second scan (rescan) — should preserve metadata
      const secondScan = await service.scanDirectory(rescanDir);
      expect(secondScan).toHaveLength(1);

      const afterRescan = service.getGame(gameId);
      expect(afterRescan?.coverArt).toBe("artwork://zelda.png");
      expect(afterRescan?.coverArtAspectRatio).toBe(0.714);
      expect(afterRescan?.metadata?.developer).toBe("Nintendo");
      expect(afterRescan?.metadata?.genre).toBe("Action-Adventure");
      expect(afterRescan?.favorite).toBe(true);

      fs.rmSync(rescanDir, { force: true, recursive: true });
    });
  });

  describe("scanDirectory — compressed ROM extraction", () => {
    it("extracts .zip containing a .gb ROM inside a system-named folder", async () => {
      const zipScanDir = path.join(TEST_DIR, "zip-scan");
      const gbFolder = path.join(zipScanDir, "GB");
      const zipSrcDir = path.join(TEST_DIR, "zip-scan-src");
      fs.mkdirSync(gbFolder, { recursive: true });
      fs.mkdirSync(zipSrcDir, { recursive: true });

      fs.writeFileSync(path.join(zipSrcDir, "Pokemon Red.gb"), "gb-zip-content");
      execFileSync("zip", [
        "-j",
        path.join(gbFolder, "Pokemon Red.zip"),
        path.join(zipSrcDir, "Pokemon Red.gb"),
      ]);
      fs.writeFileSync(path.join(gbFolder, "Tetris.gb"), "gb-native-content");

      const config = {
        autoScan: false,
        scanRecursive: true,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(zipScanDir);

      const titles = games.map((g) => g.title);
      expect(titles).toContain("Pokemon Red");
      expect(titles).toContain("Tetris");

      const zipGame = games.find((g) => g.title === "Pokemon Red");
      expect(zipGame?.systemId).toBe("gb");
      expect(zipGame?.romPath).toContain("roms-cache");

      fs.rmSync(zipScanDir, { force: true, recursive: true });
      fs.rmSync(zipSrcDir, { force: true, recursive: true });
    });

    it("skips .zip for arcade system (treats as native ROM)", async () => {
      const ARCADE_SYSTEM: GameSystem = {
        extensions: [".zip", ".7z"],
        id: "arcade",
        name: "Arcade",
        shortName: "Arcade",
      };

      const arcadeDir = path.join(TEST_DIR, "arcade-zip");
      fs.mkdirSync(arcadeDir, { recursive: true });
      // Arcade zips are passed through as-is (no extraction)
      fs.writeFileSync(path.join(arcadeDir, "pacman.zip"), "arcade-rom-set");

      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [ARCADE_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(arcadeDir, "arcade");

      expect(games).toHaveLength(1);
      expect(games[0].systemId).toBe("arcade");
      // Arcade ROM path should point to the original zip, not roms-cache
      expect(games[0].romPath).toBe(path.join(arcadeDir, "pacman.zip"));

      fs.rmSync(arcadeDir, { force: true, recursive: true });
    });

    it("extracts .zip with explicit systemId", async () => {
      const explicitDir = path.join(TEST_DIR, "explicit-system-zip");
      const explicitSrcDir = path.join(TEST_DIR, "explicit-system-zip-src");
      fs.mkdirSync(explicitDir, { recursive: true });
      fs.mkdirSync(explicitSrcDir, { recursive: true });

      fs.writeFileSync(path.join(explicitSrcDir, "Links Awakening.gb"), "gb-rom-data");
      execFileSync("zip", [
        "-j",
        path.join(explicitDir, "Links Awakening.zip"),
        path.join(explicitSrcDir, "Links Awakening.gb"),
      ]);

      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(explicitDir, "gb");

      expect(games).toHaveLength(1);
      expect(games[0].systemId).toBe("gb");
      expect(games[0].title).toBe("Links Awakening");
      expect(games[0].romPath).toContain("roms-cache");

      fs.rmSync(explicitDir, { force: true, recursive: true });
      fs.rmSync(explicitSrcDir, { force: true, recursive: true });
    });
  });

  // ---------------------------------------------------------------------------
  // scanSystemFolders
  // ---------------------------------------------------------------------------

  describe("scanSystemFolders", () => {
    it("scans all systems that have a romsPath configured", async () => {
      const nesFolderDir = path.join(TEST_DIR, "system-folders", "nes");
      fs.mkdirSync(nesFolderDir, { recursive: true });
      fs.writeFileSync(path.join(nesFolderDir, "sf_game.nes"), "sf-nes-data");

      const config = {
        autoScan: false,
        scanRecursive: true,
        systems: [
          { ...TEST_NES_SYSTEM, romsPath: nesFolderDir },
          TEST_SNES_SYSTEM, // no romsPath — should be skipped
        ],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanSystemFolders();

      expect(games.length).toBeGreaterThanOrEqual(1);
      expect(games[0].systemId).toBe("nes");

      fs.rmSync(path.join(TEST_DIR, "system-folders"), { force: true, recursive: true });
    });
  });

  // ---------------------------------------------------------------------------
  // computeRomHashes
  // ---------------------------------------------------------------------------

  describe("computeRomHashes", () => {
    it("returns correct CRC32, SHA-1, MD5, and SHA-256 game ID for known content", async () => {
      const romPath = path.join(ROMS_DIR, "hash_test.nes");
      const content = "known-content-for-hash-verification";
      fs.writeFileSync(romPath, content);

      const expected = computeExpectedHashes(content);
      const expectedGameId = sha256File(romPath);

      const service = await createService();
      const { gameId, hashes } = await service.computeRomHashes(romPath);

      expect(gameId).toBe(expectedGameId);
      expect(gameId).toHaveLength(64);
      expect(hashes.crc32).toBe(expected.crc32);
      expect(hashes.crc32).toHaveLength(8);
      expect(hashes.sha1).toBe(expected.sha1);
      expect(hashes.sha1).toHaveLength(40);
      expect(hashes.md5).toBe(expected.md5);
      expect(hashes.md5).toHaveLength(32);

      fs.unlinkSync(romPath);
    });

    it("produces the same hashes for files with identical content", async () => {
      const romA = path.join(ROMS_DIR, "identical_a.nes");
      const romB = path.join(ROMS_DIR, "identical_b.nes");
      const content = "identical-rom-content-for-hash-test";
      fs.writeFileSync(romA, content);
      fs.writeFileSync(romB, content);

      const service = await createService();
      const resultA = await service.computeRomHashes(romA);
      const resultB = await service.computeRomHashes(romB);

      expect(resultA.gameId).toBe(resultB.gameId);
      expect(resultA.hashes).toEqual(resultB.hashes);

      fs.unlinkSync(romA);
      fs.unlinkSync(romB);
    });

    it("produces different hashes for files with different content", async () => {
      const romA = path.join(ROMS_DIR, "diff_a.nes");
      const romB = path.join(ROMS_DIR, "diff_b.nes");
      fs.writeFileSync(romA, "content-aaa");
      fs.writeFileSync(romB, "content-bbb");

      const service = await createService();
      const resultA = await service.computeRomHashes(romA);
      const resultB = await service.computeRomHashes(romB);

      expect(resultA.gameId).not.toBe(resultB.gameId);
      expect(resultA.hashes.crc32).not.toBe(resultB.hashes.crc32);
      expect(resultA.hashes.sha1).not.toBe(resultB.hashes.sha1);
      expect(resultA.hashes.md5).not.toBe(resultB.hashes.md5);

      fs.unlinkSync(romA);
      fs.unlinkSync(romB);
    });

    it("throws when the file is unreadable", async () => {
      const service = await createService();
      await expect(service.computeRomHashes("/nonexistent/file.nes")).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // romHashes integration with scan/add
  // ---------------------------------------------------------------------------

  describe("romHashes integration", () => {
    it("populates romHashes on scanned games", async () => {
      const hashDir = path.join(TEST_DIR, "hash-integration");
      fs.mkdirSync(hashDir, { recursive: true });
      const content = "hash-integration-rom-data";
      fs.writeFileSync(path.join(hashDir, "game.nes"), content);

      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(hashDir);

      expect(games).toHaveLength(1);
      const expected = computeExpectedHashes(content);
      expect(games[0].romHashes).toEqual(expected);

      fs.rmSync(hashDir, { force: true, recursive: true });
    });

    it("populates romHashes on addGame", async () => {
      const romPath = path.join(ROMS_DIR, "hash_add_test.nes");
      const content = "hash-add-test-data";
      fs.writeFileSync(romPath, content);

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      expect(game).not.toBeNull();
      const expected = computeExpectedHashes(content);
      expect(game!.romHashes).toEqual(expected);

      fs.unlinkSync(romPath);
    });

    it("preserves existing romHashes on rescan", async () => {
      const rescanDir = path.join(TEST_DIR, "hash-rescan");
      fs.mkdirSync(rescanDir, { recursive: true });
      fs.writeFileSync(path.join(rescanDir, "game.nes"), "hash-rescan-data");

      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const firstScan = await service.scanDirectory(rescanDir);
      expect(firstScan).toHaveLength(1);
      const originalHashes = firstScan[0].romHashes;

      // Rescan — hashes should be preserved
      const secondScan = await service.scanDirectory(rescanDir);
      expect(secondScan).toHaveLength(1);
      expect(secondScan[0].romHashes).toEqual(originalHashes);

      fs.rmSync(rescanDir, { force: true, recursive: true });
    });

    it("skips unreadable ROM files during scan with a warning", async () => {
      const unreadableDir = path.join(TEST_DIR, "unreadable-scan");
      fs.mkdirSync(unreadableDir, { recursive: true });
      const romPath = path.join(unreadableDir, "game.nes");
      fs.writeFileSync(romPath, "data");

      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();

      // Mock computeRomHashes to throw an I/O error, simulating an unreadable file.
      // This is more reliable than chmod 000, which is ignored when running as root.
      vi.spyOn(service, "computeRomHashes").mockRejectedValueOnce(
        Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }),
      );

      const games = await service.scanDirectory(unreadableDir);

      // Game should be skipped, not added
      expect(games).toHaveLength(0);

      fs.rmSync(unreadableDir, { force: true, recursive: true });
    });
  });

  // ---------------------------------------------------------------------------
  // backfillRomHashes
  // ---------------------------------------------------------------------------

  describe("backfillRomHashes", () => {
    it("fills in missing hashes for games loaded from old library.json", async () => {
      const romPath = path.join(ROMS_DIR, "backfill_test.nes");
      const content = "backfill-test-content";
      fs.writeFileSync(romPath, content);

      const gameId = sha256File(romPath);
      // Seed library with a game that has no romHashes (old format)
      const games = [
        {
          id: gameId,
          romPath,
          system: "Nintendo Entertainment System",
          systemId: "nes",
          title: "Backfill Game",
        },
      ];
      fs.writeFileSync(path.join(USER_DATA_DIR, "library.json"), JSON.stringify(games, null, 2));

      const service = await createService();
      // Give time for async backfill to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const loadedGames = service.getGames();
      expect(loadedGames).toHaveLength(1);
      const expected = computeExpectedHashes(content);
      expect(loadedGames[0].romHashes).toEqual(expected);

      fs.unlinkSync(romPath);
    });

    it("fills in missing crc32/sha1 when only md5 exists (partial hashes)", async () => {
      const romPath = path.join(ROMS_DIR, "partial_backfill.nes");
      const content = "partial-backfill-content";
      fs.writeFileSync(romPath, content);

      const gameId = sha256File(romPath);
      const expected = computeExpectedHashes(content);
      // Seed with only MD5 (what ArtworkService used to set)
      const games = [
        {
          id: gameId,
          romHashes: { md5: expected.md5 },
          romPath,
          system: "Nintendo Entertainment System",
          systemId: "nes",
          title: "Partial Hash Game",
        },
      ];
      fs.writeFileSync(path.join(USER_DATA_DIR, "library.json"), JSON.stringify(games, null, 2));

      const service = await createService();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const loadedGames = service.getGames();
      expect(loadedGames).toHaveLength(1);
      expect(loadedGames[0].romHashes).toEqual(expected);

      fs.unlinkSync(romPath);
    });

    it("keeps games whose ROM files are unreadable during backfill", async () => {
      const gameId = sha256String("ghost-content");
      const games = [
        {
          id: gameId,
          romPath: "/nonexistent/path/ghost.nes",
          system: "Nintendo Entertainment System",
          systemId: "nes",
          title: "Ghost Game",
        },
      ];
      fs.writeFileSync(path.join(USER_DATA_DIR, "library.json"), JSON.stringify(games, null, 2));

      const service = await createService();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Game should be preserved — the ROM may be on an unmounted drive
      const loadedGames = service.getGames();
      expect(loadedGames).toHaveLength(1);
      expect(loadedGames[0].title).toBe("Ghost Game");
    });

    it("skips games that already have all three hashes", async () => {
      const romPath = path.join(ROMS_DIR, "complete_hashes.nes");
      fs.writeFileSync(romPath, "complete-hash-data");

      const gameId = sha256File(romPath);
      const hashes = computeExpectedHashes("complete-hash-data");
      const games = [
        {
          id: gameId,
          romHashes: hashes,
          romPath,
          system: "Nintendo Entertainment System",
          systemId: "nes",
          title: "Complete Game",
        },
      ];
      fs.writeFileSync(path.join(USER_DATA_DIR, "library.json"), JSON.stringify(games, null, 2));

      const service = await createService();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const loadedGames = service.getGames();
      expect(loadedGames).toHaveLength(1);
      expect(loadedGames[0].romHashes).toEqual(hashes);

      fs.unlinkSync(romPath);
    });
  });

  // ---------------------------------------------------------------------------
  // Atomic writes and backup fallback
  // ---------------------------------------------------------------------------

  describe('atomic writes and backup', () => {
    it('creates a .bak backup of library.json on save', async () => {
      const romPath = path.join(ROMS_DIR, 'backup_test.nes')
      fs.writeFileSync(romPath, 'backup-test-data')

      const service = await createService()
      await service.addGame(romPath, 'nes')

      // After addGame, saveLibrary should have been called, creating a .bak
      // On first write there's no existing file to back up, so write a second time
      const romPath2 = path.join(ROMS_DIR, 'backup_test2.nes')
      fs.writeFileSync(romPath2, 'backup-test-data-2')
      await service.addGame(romPath2, 'nes')

      const bakPath = path.join(USER_DATA_DIR, 'library.json.bak')
      expect(fs.existsSync(bakPath)).toBe(true)

      // The backup should contain the first game but not the second
      const bakData: Game[] = JSON.parse(fs.readFileSync(bakPath, 'utf-8'))
      expect(bakData).toHaveLength(1)

      // The primary file should have both games
      const primaryData: Game[] = JSON.parse(fs.readFileSync(path.join(USER_DATA_DIR, 'library.json'), 'utf-8'))
      expect(primaryData).toHaveLength(2)

      fs.unlinkSync(romPath)
      fs.unlinkSync(romPath2)
    })

    it('falls back to .bak when primary library.json is corrupt', async () => {
      // Seed a valid backup
      const validGames = [
        {
          id: sha256String('fallback-content'),
          title: 'Fallback Game',
          system: 'Nintendo Entertainment System',
          systemId: 'nes',
          romPath: '/test/fallback.nes',
          romHashes: { crc32: '00000000', sha1: 'a'.repeat(40), md5: 'b'.repeat(32) },
        },
      ]
      fs.writeFileSync(path.join(USER_DATA_DIR, 'library.json.bak'), JSON.stringify(validGames, null, 2))

      // Write corrupt primary
      fs.writeFileSync(path.join(USER_DATA_DIR, 'library.json'), '{invalid json!!!}')

      const service = await createService()
      await new Promise(resolve => setTimeout(resolve, 200))

      const games = service.getGames()
      expect(games).toHaveLength(1)
      expect(games[0].title).toBe('Fallback Game')
    })

    it('starts fresh when both primary and backup are missing', async () => {
      // No library.json or library.json.bak exist (cleaned by beforeEach)
      const service = await createService()
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(service.getGames()).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // cleanGameTitle (tested indirectly through addGame)
  // ---------------------------------------------------------------------------

  describe("cleanGameTitle", () => {
    // We test this indirectly by adding games with various naming conventions
    // and checking the resulting title.

    it("removes content in parentheses", async () => {
      const romPath = path.join(ROMS_DIR, "Super Mario Bros (USA).nes");
      fs.writeFileSync(romPath, "paren-test");

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      expect(game!.title).toBe("Super Mario Bros");

      fs.unlinkSync(romPath);
    });

    it("removes content in square brackets", async () => {
      const romPath = path.join(ROMS_DIR, "Zelda [!].nes");
      fs.writeFileSync(romPath, "bracket-test");

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      expect(game!.title).toBe("Zelda");

      fs.unlinkSync(romPath);
    });

    it("removes content in curly braces", async () => {
      const romPath = path.join(ROMS_DIR, "Metroid {v1.1}.nes");
      fs.writeFileSync(romPath, "brace-test");

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      expect(game!.title).toBe("Metroid");

      fs.unlinkSync(romPath);
    });

    it("replaces underscores with spaces", async () => {
      const romPath = path.join(ROMS_DIR, "Mega_Man_2.nes");
      fs.writeFileSync(romPath, "underscore-test");

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      expect(game!.title).toBe("Mega Man 2");

      fs.unlinkSync(romPath);
    });

    it("collapses multiple spaces and trims", async () => {
      const romPath = path.join(ROMS_DIR, "Final  Fantasy  (USA)  [!].nes");
      fs.writeFileSync(romPath, "spaces-test");

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      expect(game!.title).toBe("Final Fantasy");

      fs.unlinkSync(romPath);
    });
  });

  // ---------------------------------------------------------------------------
  // setRomsBasePath
  // ---------------------------------------------------------------------------

  describe("setRomsBasePath", () => {
    it("updates the romsBasePath in config and persists it", async () => {
      const service = await createService();
      await service.setRomsBasePath("/my/roms");

      expect(service.getConfig().romsBasePath).toBe("/my/roms");

      // Verify persistence
      const savedConfig = JSON.parse(
        fs.readFileSync(path.join(USER_DATA_DIR, "library-config.json"), "utf8"),
      );
      expect(savedConfig.romsBasePath).toBe("/my/roms");
    });
  });

  // ---------------------------------------------------------------------------
  // Library persistence (load existing library)
  // ---------------------------------------------------------------------------

  describe("library persistence", () => {
    it("loads existing games from library.json on construction", async () => {
      const romPath = path.join(ROMS_DIR, "persisted_game.nes");
      const content = "persisted-content";
      fs.writeFileSync(romPath, content);

      const gameId = sha256File(romPath);
      const hashes = computeExpectedHashes(content);
      const games = [
        {
          id: gameId,
          romHashes: hashes,
          romPath,
          system: "Nintendo Entertainment System",
          systemId: "nes",
          title: "Persisted Game",
        },
      ];
      fs.writeFileSync(path.join(USER_DATA_DIR, "library.json"), JSON.stringify(games, null, 2));

      const service = await createService();
      const loadedGames = service.getGames();

      expect(loadedGames).toHaveLength(1);
      expect(loadedGames[0].title).toBe("Persisted Game");
      expect(loadedGames[0].id).toBe(gameId);
      expect(loadedGames[0].romHashes).toEqual(hashes);

      fs.unlinkSync(romPath);
    });
  });

  // ---------------------------------------------------------------------------
  // Migration (old MD5 IDs -> SHA-256)
  // ---------------------------------------------------------------------------

  describe("migrateGameIds", () => {
    it("migrates old 32-char hex IDs to SHA-256 content-based IDs and populates hashes", async () => {
      const romPath = path.join(ROMS_DIR, "migrate_test.nes");
      const content = "migration-content";
      fs.writeFileSync(romPath, content);

      const oldMd5Id = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"; // 32-char hex
      const expectedNewId = sha256File(romPath);
      const expectedHashes = computeExpectedHashes(content);

      const games = [
        {
          id: oldMd5Id,
          romPath,
          system: "Nintendo Entertainment System",
          systemId: "nes",
          title: "Legacy Game",
        },
      ];
      fs.writeFileSync(path.join(USER_DATA_DIR, "library.json"), JSON.stringify(games, null, 2));

      const service = await createService();
      // Give extra time for migration + backfill to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const loadedGames = service.getGames();
      expect(loadedGames).toHaveLength(1);
      expect(loadedGames[0].id).toBe(expectedNewId);
      expect(loadedGames[0].id).toHaveLength(64);
      expect(loadedGames[0].romHashes).toEqual(expectedHashes);

      fs.unlinkSync(romPath);
    });

    it("keeps games whose ROM files are unreadable during migration", async () => {
      const oldMd5Id = "deadbeefcafeface1234567890abcdef"; // 32-char hex (old MD5 format)
      const games = [
        {
          id: oldMd5Id,
          title: "Unmounted Drive Game",
          system: "Nintendo Entertainment System",
          systemId: "nes",
          romPath: "/nonexistent/unmounted/drive/game.nes",
          coverArt: "artwork://some-art.png",
        },
      ];
      fs.writeFileSync(path.join(USER_DATA_DIR, "library.json"), JSON.stringify(games, null, 2));

      const service = await createService();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Game should be preserved with its old ID, not deleted
      const loadedGames = service.getGames();
      expect(loadedGames).toHaveLength(1);
      expect(loadedGames[0].id).toBe(oldMd5Id);
      expect(loadedGames[0].title).toBe("Unmounted Drive Game");
      expect(loadedGames[0].coverArt).toBe("artwork://some-art.png");
    });
  });

  // ---------------------------------------------------------------------------
  // Zip extraction during scan
  // ---------------------------------------------------------------------------

  describe("scanDirectory with zip files", () => {
    const zipScanDir = path.join(TEST_DIR, "zip-scan-test");
    const zipRomsDir = path.join(TEST_DIR, "zip-rom-sources");

    beforeAll(() => {
      fs.mkdirSync(zipScanDir, { recursive: true });
      fs.mkdirSync(zipRomsDir, { recursive: true });

      // Create ROM files to zip
      fs.writeFileSync(path.join(zipRomsDir, "Tetris (World).gb"), "fake-gb-tetris-data");
      fs.writeFileSync(path.join(zipRomsDir, "Links Awakening (USA).gb"), "fake-gb-zelda-data");
      fs.writeFileSync(path.join(zipRomsDir, "game.nes"), "fake-nes-data-in-zip");
      fs.writeFileSync(path.join(zipRomsDir, "readme.txt"), "just a readme");

      // Zip with a single .gb ROM
      execFileSync("zip", [
        "-j",
        path.join(zipScanDir, "tetris.zip"),
        path.join(zipRomsDir, "Tetris (World).gb"),
      ]);

      // Zip with a .nes ROM
      execFileSync("zip", [
        "-j",
        path.join(zipScanDir, "nes-game.zip"),
        path.join(zipRomsDir, "game.nes"),
      ]);

      // Zip with no matching ROM (only .txt)
      execFileSync("zip", [
        "-j",
        path.join(zipScanDir, "no-rom.zip"),
        path.join(zipRomsDir, "readme.txt"),
      ]);

      // Also place a regular unzipped ROM alongside the zips
      fs.writeFileSync(path.join(zipScanDir, "raw-game.gb"), "raw-gb-data");
    });

    afterAll(() => {
      fs.rmSync(zipScanDir, { force: true, recursive: true });
      fs.rmSync(zipRomsDir, { force: true, recursive: true });
      // Clean up roms-cache
      const cacheDir = path.join(USER_DATA_DIR, "roms-cache");
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { force: true, recursive: true });
      }
    });

    it("extracts ROM from zip and creates Game with romPath in roms-cache", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM, TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(zipScanDir);

      const zipGame = games.find((g) => g.title === "Tetris");
      expect(zipGame).toBeDefined();
      expect(zipGame!.romPath).toContain("roms-cache");
      expect(zipGame!.romPath).toContain(".gb");
      expect(fs.existsSync(zipGame!.romPath)).toBe(true);
    });

    it("sets sourceArchivePath on games extracted from zips", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM, TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(zipScanDir);

      const zipGames = games.filter((g) => g.sourceArchivePath !== undefined);
      expect(zipGames.length).toBeGreaterThanOrEqual(1);
      // All zip-extracted games should have a sourceArchivePath ending in .zip
      for (const game of zipGames) {
        expect(game.sourceArchivePath).toMatch(/\.zip$/);
      }
    });

    it("computes game ID from extracted ROM content, not zip content", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(zipScanDir);

      const zipGame = games.find((g) => g.title === "Tetris");
      expect(zipGame).toBeDefined();

      // The ID should be SHA-256 of the ROM content, not the zip file
      const expectedId = sha256String("fake-gb-tetris-data");
      expect(zipGame!.id).toBe(expectedId);
    });

    it("derives title from ROM filename inside zip, not zip filename", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(zipScanDir);

      // Title should come from "Tetris (World).gb" -> cleaned to "Tetris"
      const zipGame = games.find((g) => g.sourceArchivePath?.endsWith("tetris.zip"));
      expect(zipGame).toBeDefined();
      expect(zipGame!.title).toBe("Tetris");
    });

    it("skips zip files with no matching ROM extensions", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(zipScanDir);

      // no-rom.zip only has a .txt — should not produce a game
      const noRomGame = games.find((g) => g.sourceArchivePath?.endsWith("no-rom.zip"));
      expect(noRomGame).toBeUndefined();
    });

    it("also scans regular unzipped ROMs alongside zips", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(zipScanDir);

      const rawGame = games.find((g) => g.title === "raw-game");
      expect(rawGame).toBeDefined();
      expect(rawGame!.romPath).toBe(path.join(zipScanDir, "raw-game.gb"));
      expect(rawGame!.sourceArchivePath).toBeUndefined();
    });

    it("does not re-extract on subsequent scan (deduplication)", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const firstScan = await service.scanDirectory(zipScanDir);
      const firstZipGames = firstScan.filter((g) => g.sourceArchivePath !== undefined);
      expect(firstZipGames.length).toBeGreaterThanOrEqual(1);

      const totalAfterFirst = service.getGames().length;

      // Second scan: zip games returned as cached (not re-extracted),
      // tracked via progress events as isNew: false
      const progressEvents: Array<ScanProgressEvent> = [];
      service.on("scanProgress", (event: ScanProgressEvent) => {
        progressEvents.push(event);
      });

      await service.scanDirectory(zipScanDir);

      // Total game count unchanged — no duplicates
      expect(service.getGames().length).toBe(totalAfterFirst);

      // Zip games in the progress events should be marked as NOT new
      const zipProgress = progressEvents.filter((e) => e.game.sourceArchivePath !== undefined);
      expect(zipProgress.length).toBeGreaterThanOrEqual(1);
      expect(zipProgress.every((e) => !e.isNew)).toBe(true);
    });
  });

  describe("addGame with zip file", () => {
    const addGameZipDir = path.join(TEST_DIR, "add-game-zip-test");

    beforeAll(() => {
      fs.mkdirSync(addGameZipDir, { recursive: true });
      fs.writeFileSync(path.join(addGameZipDir, "rom.gb"), "add-game-gb-data");
      fs.writeFileSync(path.join(addGameZipDir, "readme.txt"), "not a rom");

      execFileSync("zip", [
        "-j",
        path.join(addGameZipDir, "game.zip"),
        path.join(addGameZipDir, "rom.gb"),
      ]);
      execFileSync("zip", [
        "-j",
        path.join(addGameZipDir, "no-rom.zip"),
        path.join(addGameZipDir, "readme.txt"),
      ]);
    });

    afterAll(() => {
      fs.rmSync(addGameZipDir, { force: true, recursive: true });
      const cacheDir = path.join(USER_DATA_DIR, "roms-cache");
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { force: true, recursive: true });
      }
    });

    it("extracts ROM from zip and returns Game", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const game = await service.addGame(path.join(addGameZipDir, "game.zip"), "gb");

      expect(game).not.toBeNull();
      expect(game!.romPath).toContain("roms-cache");
      expect(game!.systemId).toBe("gb");
      expect(game!.sourceArchivePath).toBe(path.join(addGameZipDir, "game.zip"));
    });

    it("returns null for zip with no matching ROM for the given system", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const game = await service.addGame(path.join(addGameZipDir, "no-rom.zip"), "gb");

      expect(game).toBeNull();
    });
  });

  describe("removeGame with cached ROM", () => {
    const removeCacheDir = path.join(TEST_DIR, "remove-cache-test");

    beforeAll(() => {
      fs.mkdirSync(removeCacheDir, { recursive: true });
      fs.writeFileSync(path.join(removeCacheDir, "rom.gb"), "remove-cache-gb-data");
      execFileSync("zip", [
        "-j",
        path.join(removeCacheDir, "game.zip"),
        path.join(removeCacheDir, "rom.gb"),
      ]);
    });

    afterAll(() => {
      fs.rmSync(removeCacheDir, { force: true, recursive: true });
      const cacheDir = path.join(USER_DATA_DIR, "roms-cache");
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { force: true, recursive: true });
      }
    });

    it("deletes the cached ROM file when a zip-extracted game is removed", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const game = await service.addGame(path.join(removeCacheDir, "game.zip"), "gb");
      expect(game).not.toBeNull();
      expect(fs.existsSync(game!.romPath)).toBe(true);

      const cachedRomPath = game!.romPath;
      await service.removeGame(game!.id);

      expect(fs.existsSync(cachedRomPath)).toBe(false);
      expect(service.getGames()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Scan optimizations: mtime caching, new-files-first, progress events
  // ---------------------------------------------------------------------------

  describe("mtime-based scan caching", () => {
    const mtimeDir = path.join(TEST_DIR, "mtime-cache");

    beforeAll(() => {
      fs.mkdirSync(mtimeDir, { recursive: true });
      fs.writeFileSync(path.join(mtimeDir, "game1.nes"), "mtime-game-1");
      fs.writeFileSync(path.join(mtimeDir, "game2.nes"), "mtime-game-2");
    });

    afterAll(() => {
      fs.rmSync(mtimeDir, { force: true, recursive: true });
    });

    it("stores romMtime on games during initial scan", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const games = await service.scanDirectory(mtimeDir);

      expect(games).toHaveLength(2);
      for (const game of games) {
        expect(game.romMtime).toBeDefined();
        expect(typeof game.romMtime).toBe("number");
        expect(game.romMtime).toBeGreaterThan(0);
      }
    });

    it("skips hashing on rescan when file mtime is unchanged", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();

      // First scan — hashes everything
      const firstScan = await service.scanDirectory(mtimeDir);
      expect(firstScan).toHaveLength(2);

      // Spy on computeRomHashes to count calls
      const hashSpy = vi.spyOn(service, "computeRomHashes");

      // Second scan — should skip hashing since mtimes haven't changed
      const secondScan = await service.scanDirectory(mtimeDir);
      expect(secondScan).toHaveLength(2);
      expect(hashSpy).not.toHaveBeenCalled();

      hashSpy.mockRestore();
    });

    it("re-hashes when file content changes (mtime differs)", async () => {
      const rehashDir = path.join(TEST_DIR, "mtime-rehash");
      fs.mkdirSync(rehashDir, { recursive: true });
      fs.writeFileSync(path.join(rehashDir, "mutable.nes"), "original-content");

      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const firstScan = await service.scanDirectory(rehashDir);
      expect(firstScan).toHaveLength(1);
      const originalId = firstScan[0].id;

      // Modify the file to change its mtime (and content)
      // Need a small delay to ensure mtime changes (filesystem resolution)
      await new Promise((resolve) => setTimeout(resolve, 50));
      fs.writeFileSync(path.join(rehashDir, "mutable.nes"), "modified-content");

      const hashSpy = vi.spyOn(service, "computeRomHashes");
      const secondScan = await service.scanDirectory(rehashDir);
      expect(secondScan).toHaveLength(1);
      expect(hashSpy).toHaveBeenCalledTimes(1);
      // ID should change since content changed
      expect(secondScan[0].id).not.toBe(originalId);

      hashSpy.mockRestore();
      fs.rmSync(rehashDir, { force: true, recursive: true });
    });

    it("skips zip extraction and hashing on rescan when zip mtime is unchanged", async () => {
      const zipMtimeDir = path.join(TEST_DIR, "zip-mtime-cache");
      const zipMtimeGbDir = path.join(zipMtimeDir, "GB");
      fs.mkdirSync(zipMtimeGbDir, { recursive: true });
      // Create a .gb ROM and zip it (put zip in system-named folder for detection)
      const tmpRomPath = path.join(zipMtimeDir, "cached.gb");
      fs.writeFileSync(tmpRomPath, "zip-mtime-gb-data");
      execFileSync("zip", ["-j", path.join(zipMtimeGbDir, "cached.zip"), tmpRomPath]);
      fs.unlinkSync(tmpRomPath); // Remove bare ROM so only the zip is scanned

      const config = {
        autoScan: false,
        scanRecursive: true,
        systems: [TEST_GB_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();

      // First scan — extracts and hashes
      const firstScan = await service.scanDirectory(zipMtimeDir);
      const zipGames = firstScan.filter((g) => g.sourceArchivePath !== undefined);
      expect(zipGames).toHaveLength(1);
      expect(zipGames[0].romMtime).toBeDefined();

      // Spy on computeRomHashes — should NOT be called on rescan
      const hashSpy = vi.spyOn(service, "computeRomHashes");

      // Second scan — zip unchanged, should skip extraction + hashing entirely
      await service.scanDirectory(zipMtimeDir);
      expect(hashSpy).not.toHaveBeenCalled();

      // Game count unchanged
      expect(service.getGames().length).toBe(firstScan.length);

      hashSpy.mockRestore();
      fs.rmSync(zipMtimeDir, { force: true, recursive: true });
      const cacheDir = path.join(USER_DATA_DIR, "roms-cache");
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { force: true, recursive: true });
      }
    });
  });

  describe("scanProgress events", () => {
    const progressDir = path.join(TEST_DIR, "progress-events");

    beforeAll(() => {
      fs.mkdirSync(progressDir, { recursive: true });
      fs.writeFileSync(path.join(progressDir, "a.nes"), "progress-a");
      fs.writeFileSync(path.join(progressDir, "b.nes"), "progress-b");
      fs.writeFileSync(path.join(progressDir, "c.nes"), "progress-c");
    });

    afterAll(() => {
      fs.rmSync(progressDir, { force: true, recursive: true });
    });

    it("emits scanProgress for each discovered game", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();
      const progressEvents: Array<ScanProgressEvent> = [];
      service.on("scanProgress", (event: ScanProgressEvent) => {
        progressEvents.push(event);
      });

      const games = await service.scanDirectory(progressDir);

      expect(games).toHaveLength(3);
      expect(progressEvents).toHaveLength(3);

      // All should be marked as new on first scan
      expect(progressEvents.every((e) => e.isNew)).toBe(true);

      // Total should be 3 for all events
      expect(progressEvents.every((e) => e.total === 3)).toBe(true);

      // Processed should increment
      const processedValues = progressEvents.map((e) => e.processed).sort((a, b) => a - b);
      expect(processedValues).toEqual([1, 2, 3]);
    });

    it("marks known games as not new on rescan", async () => {
      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();

      // First scan
      await service.scanDirectory(progressDir);

      // Rescan — listen for progress
      const progressEvents: Array<ScanProgressEvent> = [];
      service.on("scanProgress", (event: ScanProgressEvent) => {
        progressEvents.push(event);
      });

      await service.scanDirectory(progressDir);

      expect(progressEvents).toHaveLength(3);
      // All should be marked as NOT new on rescan
      expect(progressEvents.every((e) => !e.isNew)).toBe(true);
      // All should be skipped via mtime cache
      expect(progressEvents.at(-1)!.skipped).toBe(3);
    });
  });

  describe("new-files-first ordering", () => {
    it("processes new files before known files", async () => {
      const orderDir = path.join(TEST_DIR, "ordering-test");
      fs.mkdirSync(orderDir, { recursive: true });
      fs.writeFileSync(path.join(orderDir, "existing.nes"), "existing-data");

      const config = {
        autoScan: false,
        scanRecursive: false,
        systems: [TEST_NES_SYSTEM],
      };
      fs.writeFileSync(
        path.join(USER_DATA_DIR, "library-config.json"),
        JSON.stringify(config, null, 2),
      );

      const service = await createService();

      // First scan — establish existing.nes as known
      await service.scanDirectory(orderDir);

      // Add a new file
      fs.writeFileSync(path.join(orderDir, "brand_new.nes"), "brand-new-data");

      // Rescan — track order of progress events
      const progressEvents: Array<ScanProgressEvent> = [];
      service.on("scanProgress", (event: ScanProgressEvent) => {
        progressEvents.push(event);
      });

      await service.scanDirectory(orderDir);

      expect(progressEvents).toHaveLength(2);

      // First event should be the NEW game
      expect(progressEvents[0].isNew).toBe(true);
      expect(progressEvents[0].game.title).toBe("brand new");

      // Second event should be the KNOWN game (mtime-cached)
      expect(progressEvents[1].isNew).toBe(false);

      fs.rmSync(orderDir, { force: true, recursive: true });
    });
  });

  describe("addGame stores romMtime", () => {
    it("stores romMtime when adding a single game", async () => {
      const romPath = path.join(ROMS_DIR, "mtime_add_test.nes");
      fs.writeFileSync(romPath, "mtime-add-data");

      const service = await createService();
      const game = await service.addGame(romPath, "nes");

      expect(game).not.toBeNull();
      expect(game!.romMtime).toBeDefined();
      expect(typeof game!.romMtime).toBe("number");

      fs.unlinkSync(romPath);
    });
  });
});
