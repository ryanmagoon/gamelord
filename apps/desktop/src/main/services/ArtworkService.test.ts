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
  mockReadFile,
  mockUnlink,
  mockWriteFile,
} = vi.hoisted(() => ({
  mockCreateReadStream: vi.fn(),
  mockCreateWriteStream: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockMkdirSync: vi.fn(),
  mockReadFile: vi.fn().mockResolvedValue("{}"),
  mockUnlink: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("fs", () => ({
  createReadStream: mockCreateReadStream,
  createWriteStream: mockCreateWriteStream,
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    createReadStream: mockCreateReadStream,
    createWriteStream: mockCreateWriteStream,
    unlink: mockUnlink,
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
  },
  unlink: mockUnlink,
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
  } as unknown as LibraryService;
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game1",
    romHashes: {
      crc32: "deadbeef",
      sha1: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      md5: "d41d8cd98f00b204e9800998ecf8427e",
    },
    romPath: "/roms/smb.nes",
    system: "Nintendo Entertainment System",
    systemId: "nes",
    title: "Super Mario Bros.",
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
    vi.spyOn(ArtworkService.prototype as any, "sleep").mockResolvedValue(undefined);
    vi.spyOn(ArtworkService.prototype as any, "waitForRateLimit").mockResolvedValue(undefined);
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

  describe("syncAllGames", () => {
    it("returns immediately if already syncing", async () => {
      const game = makeGame();
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();

      (service as any).syncing = true;

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

      const syncCompletePromise = new Promise<any>((resolve) => {
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
      const ext = (service as any).getImageExtension("https://example.com/image.png");
      expect(ext).toBe(".png");
    });

    it("extracts .jpg extension from URL", async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as any).getImageExtension("https://example.com/image.jpg");
      expect(ext).toBe(".jpg");
    });

    it("defaults to .png for unknown extensions", async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as any).getImageExtension("https://example.com/image.bmp");
      expect(ext).toBe(".png");
    });

    it("handles URLs with query parameters", async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as any).getImageExtension("https://example.com/image.jpeg?quality=80");
      expect(ext).toBe(".jpeg");
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
        system: "Super Nintendo Entertainment System",
        systemId: "snes",
        title: "Some Japanese Game",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockResolvedValue({
        developer: "Nintendo",
        genre: "Platform",
        media: {},
        players: 1,
        publisher: "Nintendo",
        rating: 0.9,
        region: "jp",
        releaseDate: "1990-11-21",
        title: "スーパーマリオワールド",
      });

      await service.syncGame("jp-snes-game");

      expect(libraryService.updateGame).toHaveBeenCalledWith(
        "jp-snes-game",
        expect.objectContaining({ system: "Super Famicom" }),
      );
    });

    it("updates system to Mega Drive for Genesis game with EU region", async () => {
      const game = makeGame({
        id: "eu-genesis-game",
        system: "Sega Genesis",
        systemId: "genesis",
        title: "Sonic The Hedgehog",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockResolvedValue({
        developer: "Sonic Team",
        genre: "Platform",
        media: {},
        players: 1,
        publisher: "Sega",
        rating: 0.85,
        region: "eu",
        releaseDate: "1991-06-23",
        title: "Sonic The Hedgehog",
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
        system: "Game Boy",
        systemId: "gb",
        title: "Pokemon Red",
      });
      const libraryService = createMockLibraryService([game]);
      const service = new ArtworkService(libraryService);
      await flushPromises();
      await service.setCredentials("user", "pass");

      mockFetchByHash.mockResolvedValue({
        developer: "Game Freak",
        genre: "RPG",
        media: {},
        players: 1,
        publisher: "Nintendo",
        rating: 0.9,
        region: "jp",
        releaseDate: "1996-02-27",
        title: "Pocket Monsters Red",
      });

      await service.syncGame("jp-gb-game");

      // updateGame should NOT contain a 'system' key since Game Boy has no regional variants
      const updateCall = (libraryService.updateGame as any).mock.calls[0][1];
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
        makeGame({ coverArt: "artwork://game1.png", id: "game1", title: "Game 1" }),
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
      (service as any).syncing = true;

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
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.errorCode).toBe("auth-failed");
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
      const lastEvent = progressEvents.at(-1)!;
      expect(lastEvent.phase).toBe("not-found");
    });
  });
});
