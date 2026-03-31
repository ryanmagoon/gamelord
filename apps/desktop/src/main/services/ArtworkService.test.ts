// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock electron before importing ArtworkService
vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name === "userData") {
        return "/tmp/gamelord-test";
      }
      return "/tmp";
    },
  },
}));

// vi.hoisted ensures these are available when vi.mock factory runs (which is hoisted)
const {
  mockCreateReadStream,
  mockCreateWriteStream,
  mockExistsSync,
  mockMkdirSync,
  mockUnlink,
  mockReadFile,
  mockWriteFile,
} = vi.hoisted(() => ({
  mockCreateReadStream: vi.fn(),
  mockCreateWriteStream: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockMkdirSync: vi.fn(),
  mockUnlink: vi.fn(),
  mockReadFile: vi.fn().mockResolvedValue("{}"),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("fs", () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    createReadStream: mockCreateReadStream,
    createWriteStream: mockCreateWriteStream,
    unlink: mockUnlink,
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  createReadStream: mockCreateReadStream,
  createWriteStream: mockCreateWriteStream,
  unlink: mockUnlink,
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
  },
}));

// vi.hoisted mock for ScreenScraperClient — lets us control API responses per test
const { mockFetchByHash, mockFetchByName, mockValidateCredentials } = vi.hoisted(() => ({
  mockFetchByHash: vi.fn(),
  mockFetchByName: vi.fn(),
  mockValidateCredentials: vi.fn(),
}));

vi.mock("./ScreenScraperClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ScreenScraperClient")>();

  // Use a real class so `new ScreenScraperClient(...)` works
  class MockScreenScraperClient {
    fetchByHash = mockFetchByHash;
    fetchByName = mockFetchByName;
    validateCredentials = mockValidateCredentials;
  }

  return {
    ...actual,
    ScreenScraperClient: MockScreenScraperClient,
  };
});

import { ArtworkService } from "./ArtworkService";
import { ScreenScraperError } from "./ScreenScraperClient";
import { LibraryService } from "./LibraryService";
import type { Game } from "../../types/library";
import type { ArtworkProgress } from "../../types/artwork";

function createMockLibraryService(games: Array<Game> = []): LibraryService {
  const gameMap = new Map(games.map((g) => [g.id, { ...g }]));
  return {
    getGame: vi.fn((id: string) => gameMap.get(id)),
    getGames: vi.fn(() => [...gameMap.values()]),
    updateGame: vi.fn(async (id: string, updates: Partial<Game>) => {
      const game = gameMap.get(id);
      if (game) {
        Object.assign(game, updates);
      }
    }),
    updateGameBatched: vi.fn((id: string, updates: Partial<Game>) => {
      const game = gameMap.get(id);
      if (game) {
        Object.assign(game, updates);
      }
    }),
    flushSave: vi.fn(async () => {}),
  } as unknown as LibraryService;
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game1",
    title: "Super Mario Bros.",
    system: "Nintendo Entertainment System",
    systemId: "nes",
    romPath: "/roms/smb.nes",
    romHashes: {
      crc32: "deadbeef",
      sha1: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      md5: "d41d8cd98f00b204e9800998ecf8427e",
    },
    ...overrides,
  };
}

/**
 * Wait for any pending microtasks/promises so the constructor's
 * async loadConfig() resolves before we interact with the service.
 */
async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ArtworkService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue("{}");
    mockWriteFile.mockResolvedValue(undefined);
    mockFetchByHash.mockResolvedValue(null);
    mockFetchByName.mockResolvedValue(null);
    mockValidateCredentials.mockResolvedValue(undefined);

    // Provide dev credentials so createClient() doesn't bail out.
    // The ScreenScraperClient is mocked, so these values are never sent to the API.
    process.env.SCREENSCRAPER_DEV_ID = "test-dev-id";
    process.env.SCREENSCRAPER_DEV_PASSWORD = "test-dev-password";

    // Stub the internal sleep/rate-limit to avoid real delays in tests.
    // The prototype methods are patched so every ArtworkService instance is fast.
    vi.spyOn(
      ArtworkService.prototype as unknown as Record<string, () => Promise<void>>,
      "sleep",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      ArtworkService.prototype as unknown as Record<string, () => Promise<void>>,
      "waitForRateLimit",
    ).mockResolvedValue(undefined);
  });

  describe("credentials management", () => {
    it("reports no credentials initially", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      expect(service.hasCredentials()).toBe(false);
    });

    it("reports credentials after setting them", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      await service.setCredentials("user", "pass");
      expect(service.hasCredentials()).toBe(true);
    });

    it("removes credentials on clear", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      await service.setCredentials("user", "pass");
      await service.clearCredentials();
      expect(service.hasCredentials()).toBe(false);
    });

    it("persists credentials to config file", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      await service.setCredentials("myuser", "mypass");
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/tmp/gamelord-test/artwork-config.json",
        expect.stringContaining('"myuser"'),
      );
    });
  });

  describe("credential prompt dismissal", () => {
    it("is not dismissed by default", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      expect(service.isCredentialPromptDismissed()).toBe(false);
    });

    it("reports dismissed after calling dismissCredentialPrompt", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      await service.dismissCredentialPrompt();
      expect(service.isCredentialPromptDismissed()).toBe(true);
    });

    it("persists dismissal to config file", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      await service.dismissCredentialPrompt();
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/tmp/gamelord-test/artwork-config.json",
        expect.stringContaining('"credentialPromptDismissed": true'),
      );
    });

    it("loads dismissed state from persisted config", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ credentialPromptDismissed: true }));
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      expect(service.isCredentialPromptDismissed()).toBe(true);
    });
  });

  describe("syncAllGames", () => {
    it("returns immediately if already syncing", async () => {
      const game = makeGame();
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();

      (service as unknown as Record<string, boolean>).syncing = true;

      const status = await service.syncAllGames();
      expect(status.inProgress).toBe(true);
      expect(status.total).toBe(0);
    });

    it("skips games that already have cover art", async () => {
      const game = makeGame({ coverArt: "artwork://game1.png" });
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();

      const status = await service.syncAllGames();
      expect(status.processed).toBe(0);
      expect(status.total).toBe(0);
    });

    it("emits syncComplete event when done", async () => {
      const service = new ArtworkService(createMockLibraryService([]));
      await flushPromises();

      const syncCompletePromise = new Promise<{ inProgress: boolean }>((resolve) => {
        service.on("syncComplete", resolve);
      });

      await service.syncAllGames();
      const status = await syncCompletePromise;
      expect(status.inProgress).toBe(false);
    });

    it("respects cancellation between games", async () => {
      const games = [
        makeGame({ id: "game1", title: "Game 1" }),
        makeGame({ id: "game2", title: "Game 2" }),
        makeGame({ id: "game3", title: "Game 3" }),
      ];
      const service = new ArtworkService(createMockLibraryService(games));
      await flushPromises();

      const progressEvents: Array<ArtworkProgress> = [];
      service.on("progress", (p: ArtworkProgress) => {
        progressEvents.push(p);
        if (p.current === 1) {
          service.cancelSync();
        }
      });

      await service.syncAllGames();

      // Should have processed at most 1 game before cancellation took effect
      const uniqueGames = new Set(progressEvents.map((p) => p.gameId));
      expect(uniqueGames.size).toBeLessThanOrEqual(1);
    });
  });

  describe("getSyncStatus", () => {
    it("reports not syncing by default", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      expect(service.getSyncStatus().inProgress).toBe(false);
    });
  });

  describe("getImageExtension", () => {
    it("extracts .png extension from URL", async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as unknown as Record<string, (url: string) => string>).getImageExtension(
        "https://example.com/image.png",
      );
      expect(ext).toBe(".png");
    });

    it("extracts .jpg extension from URL", async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as unknown as Record<string, (url: string) => string>).getImageExtension(
        "https://example.com/image.jpg",
      );
      expect(ext).toBe(".jpg");
    });

    it("defaults to .png for unknown extensions", async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as unknown as Record<string, (url: string) => string>).getImageExtension(
        "https://example.com/image.bmp",
      );
      expect(ext).toBe(".png");
    });

    it("handles URLs with query parameters", async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as unknown as Record<string, (url: string) => string>).getImageExtension(
        "https://example.com/image.jpeg?quality=80",
      );
      expect(ext).toBe(".jpeg");
    });
  });

  describe("withMaxWidth", () => {
    it("appends maxwidth param to URL without query string", async () => {
      const service = new ArtworkService(createMockLibraryService());
      const result = (service as unknown as Record<string, (url: string) => string>).withMaxWidth(
        "https://screenscraper.fr/medias/box2d.png",
      );
      expect(result).toBe("https://screenscraper.fr/medias/box2d.png?maxwidth=640");
    });

    it("appends maxwidth param to URL with existing query string", async () => {
      const service = new ArtworkService(createMockLibraryService());
      const result = (service as unknown as Record<string, (url: string) => string>).withMaxWidth(
        "https://screenscraper.fr/medias/box2d.png?format=png",
      );
      expect(result).toBe("https://screenscraper.fr/medias/box2d.png?format=png&maxwidth=640");
    });
  });

  describe("syncGame", () => {
    it("skips game that already has cover art when force is false", async () => {
      const game = makeGame({ coverArt: "artwork://game1.png" });
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();

      const result = await service.syncGame("game1", false);
      expect(result).toBe(true);
    });

    it("returns false for unknown game ID", async () => {
      const service = new ArtworkService(createMockLibraryService([]));
      await flushPromises();

      const result = await service.syncGame("nonexistent");
      expect(result).toBe(false);
    });

    it("throws when no credentials are configured", async () => {
      const game = makeGame();
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();

      await expect(service.syncGame("game1")).rejects.toThrow(
        "ScreenScraper user credentials are not configured",
      );
    });

    it("throws ScreenScraperError when hash lookup returns auth error", async () => {
      const game = makeGame();
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockRejectedValue(
        new ScreenScraperError("Invalid username or password.", 401, "auth-failed"),
      );

      await expect(service.syncGame("game1")).rejects.toThrow("Invalid username or password.");
      // Should NOT fall through to name search after auth failure
      expect(mockFetchByName).not.toHaveBeenCalled();
    });

    it("throws ScreenScraperError when name search returns auth error", async () => {
      const game = makeGame();
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();
      await service.setCredentials("user", "pass");

      // Hash lookup returns null (not found), but name search hits auth error
      mockFetchByHash.mockResolvedValue(null);
      mockFetchByName.mockRejectedValue(
        new ScreenScraperError("Invalid username or password.", 403, "auth-failed"),
      );

      await expect(service.syncGame("game1")).rejects.toThrow("Invalid username or password.");
    });

    it("updates system to regional name when ScreenScraper returns JP region for SNES game", async () => {
      const game = makeGame({
        id: "jp-snes-game",
        title: "Some Japanese Game",
        system: "Super Nintendo Entertainment System",
        systemId: "snes",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockResolvedValue({
        title: "スーパーマリオワールド",
        region: "jp",
        developer: "Nintendo",
        publisher: "Nintendo",
        genre: "Platform",
        players: 1,
        rating: 0.9,
        releaseDate: "1990-11-21",
        media: {},
      });

      await service.syncGame("jp-snes-game");

      expect(libraryService.updateGame).toHaveBeenCalledWith(
        "jp-snes-game",
        expect.objectContaining({ system: "Super Famicom" }),
      );
    });

    it("prefers ROM-level region over title-level region for system name", async () => {
      const game = makeGame({
        id: "jp-rom-ss-title",
        title: "Albert Odyssey",
        system: "Super Nintendo Entertainment System",
        systemId: "snes",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      // Simulates a JP-only game where the title region resolves to "ss"
      // (ScreenScraper default) because of REGION_PRIORITY, but the ROM's
      // actual region is "jp".
      mockFetchByHash.mockResolvedValue({
        title: "Albert Odyssey",
        region: "ss",
        romRegions: ["jp"],
        developer: "Sunsoft",
        publisher: "Sunsoft",
        genre: "RPG",
        players: 1,
        rating: 0.7,
        releaseDate: "1993-03-05",
        media: {},
      });

      await service.syncGame("jp-rom-ss-title");

      expect(libraryService.updateGame).toHaveBeenCalledWith(
        "jp-rom-ss-title",
        expect.objectContaining({ system: "Super Famicom" }),
      );
    });

    it("persists romRegions on the game record when present in API response", async () => {
      const game = makeGame({
        id: "persist-rom-regions",
        title: "Albert Odyssey",
        system: "Super Nintendo Entertainment System",
        systemId: "snes",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockResolvedValue({
        title: "Albert Odyssey",
        region: "ss",
        romRegions: ["jp"],
        developer: "Sunsoft",
        publisher: "Sunsoft",
        genre: "RPG",
        players: 1,
        rating: 0.7,
        releaseDate: "1993-03-05",
        media: {},
      });

      await service.syncGame("persist-rom-regions");

      expect(libraryService.updateGame).toHaveBeenCalledWith(
        "persist-rom-regions",
        expect.objectContaining({ romRegions: ["jp"] }),
      );
    });

    it("does not include romRegions in update when absent from API response", async () => {
      const game = makeGame({
        id: "no-rom-regions",
        title: "Search Result Game",
        system: "Super Nintendo Entertainment System",
        systemId: "snes",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockResolvedValue({
        title: "Search Result Game",
        region: "us",
        developer: "Dev",
        publisher: "Pub",
        genre: "Action",
        players: 1,
        rating: 0.8,
        releaseDate: "1993-01-01",
        media: {},
      });

      await service.syncGame("no-rom-regions");

      const updateCall = vi.mocked(libraryService.updateGame).mock.calls[0][1];
      expect(updateCall).not.toHaveProperty("romRegions");
    });

    it("falls back to title region when romRegions is absent", async () => {
      const game = makeGame({
        id: "jp-title-only",
        title: "Some Japanese Game",
        system: "Super Nintendo Entertainment System",
        systemId: "snes",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockResolvedValue({
        title: "Some Japanese Game",
        region: "jp",
        developer: "Dev",
        publisher: "Pub",
        genre: "RPG",
        players: 1,
        rating: 0.8,
        releaseDate: "1993-01-01",
        media: {},
      });

      await service.syncGame("jp-title-only");

      expect(libraryService.updateGame).toHaveBeenCalledWith(
        "jp-title-only",
        expect.objectContaining({ system: "Super Famicom" }),
      );
    });

    it("updates system to Mega Drive for Genesis game with EU region", async () => {
      const game = makeGame({
        id: "eu-genesis-game",
        title: "Sonic The Hedgehog",
        system: "Sega Genesis",
        systemId: "genesis",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockResolvedValue({
        title: "Sonic The Hedgehog",
        region: "eu",
        developer: "Sonic Team",
        publisher: "Sega",
        genre: "Platform",
        players: 1,
        rating: 0.85,
        releaseDate: "1991-06-23",
        media: {},
      });

      await service.syncGame("eu-genesis-game");

      expect(libraryService.updateGame).toHaveBeenCalledWith(
        "eu-genesis-game",
        expect.objectContaining({ system: "Mega Drive" }),
      );
    });

    it("does not set system field when region has no variant for that system", async () => {
      const game = makeGame({
        id: "jp-gb-game",
        title: "Pokemon Red",
        system: "Game Boy",
        systemId: "gb",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockResolvedValue({
        title: "Pocket Monsters Red",
        region: "jp",
        developer: "Game Freak",
        publisher: "Nintendo",
        genre: "RPG",
        players: 1,
        rating: 0.9,
        releaseDate: "1996-02-27",
        media: {},
      });

      await service.syncGame("jp-gb-game");

      // updateGame should NOT contain a 'system' key since Game Boy has no regional variants
      const updateCall = vi.mocked(libraryService.updateGame).mock.calls[0][1];
      expect(updateCall).not.toHaveProperty("system");
    });

    it("falls through to name search on non-auth errors from hash lookup", async () => {
      const game = makeGame();
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();
      await service.setCredentials("user", "pass");

      // Hash lookup times out, but name search succeeds
      mockFetchByHash.mockRejectedValue(new ScreenScraperError("Timed out", 0, "timeout"));
      mockFetchByName.mockResolvedValue(null);

      // Should not throw — timeout on hash is recoverable
      const result = await service.syncGame("game1");
      expect(result).toBe(false);
      expect(mockFetchByName).toHaveBeenCalled();
    });
  });

  describe("validateCredentials", () => {
    it("returns valid: true when credentials are accepted", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      mockValidateCredentials.mockResolvedValue(undefined);

      const result = await service.validateCredentials("user", "pass");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns valid: false with auth-failed errorCode on 401", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      mockValidateCredentials.mockRejectedValue(
        new ScreenScraperError("Invalid username or password.", 401, "auth-failed"),
      );

      const result = await service.validateCredentials("baduser", "badpass");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid username or password.");
      expect(result.errorCode).toBe("auth-failed");
    });

    it("returns valid: false with timeout errorCode on timeout", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      mockValidateCredentials.mockRejectedValue(
        new ScreenScraperError("Request timed out.", 0, "timeout"),
      );

      const result = await service.validateCredentials("user", "pass");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("timeout");
    });

    it("handles non-ScreenScraperError exceptions", async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      mockValidateCredentials.mockRejectedValue(new Error("DNS resolution failed"));

      const result = await service.validateCredentials("user", "pass");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("DNS resolution failed");
      expect(result.errorCode).toBeUndefined();
    });
  });

  describe("syncGames (targeted sync)", () => {
    it("only processes specified game IDs", async () => {
      const games = [
        makeGame({ id: "game1", title: "Game 1" }),
        makeGame({ id: "game2", title: "Game 2" }),
        makeGame({ id: "game3", title: "Game 3" }),
      ];
      const service = new ArtworkService(createMockLibraryService(games));
      await flushPromises();

      const progressEvents: Array<ArtworkProgress> = [];
      service.on("progress", (p: ArtworkProgress) => progressEvents.push(p));

      const status = await service.syncGames(["game1", "game3"]);

      // Should only have progress for game1 and game3, not game2
      const syncedIds = new Set(progressEvents.map((p) => p.gameId));
      expect(syncedIds.has("game2")).toBe(false);
      expect(status.total).toBe(2);
    });

    it("skips games that already have cover art", async () => {
      const games = [
        makeGame({ id: "game1", title: "Game 1", coverArt: "artwork://game1.png" }),
        makeGame({ id: "game2", title: "Game 2" }),
      ];
      const service = new ArtworkService(createMockLibraryService(games));
      await flushPromises();

      const status = await service.syncGames(["game1", "game2"]);
      // game1 should be filtered out since it has cover art
      expect(status.total).toBe(1);
    });

    it("returns immediately if already syncing", async () => {
      const service = new ArtworkService(createMockLibraryService([]));
      await flushPromises();
      (service as unknown as Record<string, boolean>).syncing = true;

      const status = await service.syncGames(["game1"]);
      expect(status.inProgress).toBe(true);
      expect(status.total).toBe(0);
    });
  });

  describe("batch sync error handling", () => {
    it("stops batch on auth-failed error", async () => {
      const games = [
        makeGame({ id: "game1", title: "Game 1" }),
        makeGame({ id: "game2", title: "Game 2" }),
        makeGame({ id: "game3", title: "Game 3" }),
      ];
      const service = new ArtworkService(createMockLibraryService(games));
      await flushPromises();
      await service.setCredentials("baduser", "badpass");

      mockFetchByHash.mockRejectedValue(
        new ScreenScraperError("Invalid username or password.", 401, "auth-failed"),
      );

      const progressEvents: Array<ArtworkProgress> = [];
      service.on("progress", (p: ArtworkProgress) => progressEvents.push(p));

      const status = await service.syncAllGames();

      // Should stop after first game's auth failure — not process all 3
      expect(status.errors).toBe(1);
      expect(status.processed).toBeLessThanOrEqual(1);

      // Verify the error event has the correct errorCode
      const errorEvent = progressEvents.find((p) => p.phase === "error");
      if (!errorEvent) {
        throw new Error("Expected an error progress event");
      }
      expect(errorEvent.errorCode).toBe("auth-failed");
    });

    it("continues batch on non-auth errors", async () => {
      const games = [
        makeGame({ id: "game1", title: "Game 1" }),
        makeGame({ id: "game2", title: "Game 2" }),
      ];
      const service = new ArtworkService(createMockLibraryService(games));
      await flushPromises();
      await service.setCredentials("user", "pass");

      // Timeout errors should NOT stop the batch
      mockFetchByHash.mockRejectedValue(new ScreenScraperError("Timed out", 0, "timeout"));
      mockFetchByName.mockResolvedValue(null);

      const status = await service.syncAllGames();

      // Both games should be processed (not-found, since no artwork URL returned)
      expect(status.processed).toBe(2);
    });

    it("emits progress with not-found when API lookups fail with non-auth errors", async () => {
      const game = makeGame();
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();
      await service.setCredentials("user", "pass");

      // Timeout errors are non-fatal and fall through to name search
      mockFetchByHash.mockRejectedValue(new ScreenScraperError("Timed out", 0, "timeout"));
      // Name search also fails with a non-auth error — gets swallowed
      mockFetchByName.mockRejectedValue(new ScreenScraperError("Timed out", 0, "timeout"));

      const progressEvents: Array<ArtworkProgress> = [];
      service.on("progress", (p: ArtworkProgress) => progressEvents.push(p));

      await service.syncAllGames();

      // Game should show as not-found since both lookups failed non-fatally
      const lastEvent = progressEvents.at(-1);
      expect(lastEvent).toBeDefined();
      expect(lastEvent?.phase).toBe("not-found");
    });
  });

  describe("gameplay-aware sync", () => {
    it("defers flushSave during gameplay", async () => {
      // Create 12 games so we cross the 10-game flush threshold
      const games = Array.from({ length: 12 }, (_, i) =>
        makeGame({ id: `g${i}`, title: `Game ${i}`, coverArt: undefined }),
      );
      const lib = createMockLibraryService(games);
      const service = new ArtworkService(lib);
      await flushPromises();
      await service.setCredentials("user1", "pass1");
      await flushPromises();

      mockFetchByHash.mockResolvedValue(null);

      // Activate gameplay mode before starting sync
      service.setGameplayActive(true);
      expect(service.isGameplayActive()).toBe(true);

      await service.syncAllGames();

      // flushSave should NOT have been called at the 10-game checkpoint
      // (only the final flush at the end of the batch)
      expect(lib.flushSave).toHaveBeenCalledTimes(1);
    });

    it("flushes normally when gameplay is not active", async () => {
      const games = Array.from({ length: 12 }, (_, i) =>
        makeGame({ id: `g${i}`, title: `Game ${i}`, coverArt: undefined }),
      );
      const lib = createMockLibraryService(games);
      const service = new ArtworkService(lib);
      await flushPromises();
      await service.setCredentials("user1", "pass1");
      await flushPromises();

      mockFetchByHash.mockResolvedValue(null);

      await service.syncAllGames();

      // 10-game checkpoint flush + final flush = 2 calls
      expect(lib.flushSave).toHaveBeenCalledTimes(2);
    });

    it("flushes deferred writes when gameplay ends", async () => {
      const lib = createMockLibraryService([]);
      const service = new ArtworkService(lib);
      await flushPromises();

      // Simulate: sync is running and gameplay was active
      // setGameplayActive(false) should trigger a flush
      // We need to fake the syncing state
      const games = [makeGame({ id: "g1", title: "Game 1", coverArt: undefined })];
      const libWithGame = createMockLibraryService(games);
      const serviceWithGame = new ArtworkService(libWithGame);
      await flushPromises();
      await serviceWithGame.setCredentials("user1", "pass1");
      await flushPromises();

      // Stall the sync so we can test gameplay toggle mid-sync
      const stallControl = { resolve: () => {} };
      mockFetchByHash.mockImplementation(
        () =>
          new Promise<null>((resolve) => {
            stallControl.resolve = () => resolve(null);
          }),
      );

      serviceWithGame.setGameplayActive(true);
      const syncPromise = serviceWithGame.syncAllGames();
      await flushPromises();

      // End gameplay while sync is in progress — should trigger flush
      serviceWithGame.setGameplayActive(false);
      expect(libWithGame.flushSave).toHaveBeenCalled();

      stallControl.resolve();
      await syncPromise;
    });

    it("getSyncStatus reflects inProgress state", async () => {
      const lib = createMockLibraryService([]);
      const service = new ArtworkService(lib);
      await flushPromises();

      const status = service.getSyncStatus();
      expect(status).toEqual({ inProgress: false });
    });

    it("continues syncing during gameplay instead of pausing", async () => {
      const games = [
        makeGame({ id: "g1", title: "Game 1", coverArt: undefined }),
        makeGame({ id: "g2", title: "Game 2", coverArt: undefined }),
      ];
      const lib = createMockLibraryService(games);
      const service = new ArtworkService(lib);
      await flushPromises();
      await service.setCredentials("user1", "pass1");
      await flushPromises();

      let callCount = 0;
      mockFetchByHash.mockImplementation(async () => {
        callCount++;
        return null;
      });

      // Activate gameplay before sync
      service.setGameplayActive(true);

      await service.syncAllGames();

      // Both games should have been processed — sync was not blocked
      // Each game: 1 fetchByHash call, 2 games = 2 calls
      expect(callCount).toBe(2);
    });
  });

  describe("batched saves during sync", () => {
    it("uses updateGameBatched during sync instead of updateGame", async () => {
      const game = makeGame({ id: "g1", coverArt: undefined });
      const lib = createMockLibraryService([game]);
      const service = new ArtworkService(lib);
      await flushPromises();
      await service.setCredentials("user1", "pass1");
      await flushPromises();

      mockFetchByHash.mockResolvedValue({
        title: "Test Game",
        media: {},
      });

      await service.syncAllGames();

      expect(lib.updateGameBatched).toHaveBeenCalled();
      expect(lib.updateGame).not.toHaveBeenCalled();
      expect(lib.flushSave).toHaveBeenCalled();
    });

    it("uses updateGame for single syncGame (not batch)", async () => {
      const game = makeGame({ id: "g1", coverArt: undefined });
      const lib = createMockLibraryService([game]);
      const service = new ArtworkService(lib);
      await flushPromises();
      await service.setCredentials("user1", "pass1");
      await flushPromises();

      mockFetchByHash.mockResolvedValue({
        title: "Test Game",
        media: {},
      });

      await service.syncGame("g1");

      expect(lib.updateGame).toHaveBeenCalled();
      expect(lib.updateGameBatched).not.toHaveBeenCalled();
    });
  });
});
