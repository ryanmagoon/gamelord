import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/test-cheat-persistence") },
}));

// Must import after mocks are set up
import { CheatPersistenceService } from "./CheatPersistenceService";

// Mock fs for controlled testing
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no existing config file
  vi.mocked(fs.readFileSync).mockImplementation(() => {
    throw new Error("ENOENT");
  });
});

describe("CheatPersistenceService", () => {
  describe("getGameState", () => {
    it("returns empty state for unknown game", () => {
      const service = new CheatPersistenceService();
      const state = service.getGameState("game-123");

      expect(state).toEqual({ enabledIndices: [], customCheats: [] });
    });

    it("returns persisted state from config file", () => {
      const config = {
        games: {
          "game-123": {
            enabledIndices: [0, 2],
            customCheats: [{ description: "Custom", code: "ABC", enabled: true }],
          },
        },
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

      const service = new CheatPersistenceService();
      const state = service.getGameState("game-123");

      expect(state.enabledIndices).toEqual([0, 2]);
      expect(state.customCheats).toHaveLength(1);
    });
  });

  describe("setCheatEnabled", () => {
    it("enables a cheat by adding its index", () => {
      const service = new CheatPersistenceService();
      service.setCheatEnabled("game-1", 3, true);

      const state = service.getGameState("game-1");
      expect(state.enabledIndices).toContain(3);
    });

    it("disables a cheat by removing its index", () => {
      const config = {
        games: { "game-1": { enabledIndices: [0, 2, 5], customCheats: [] } },
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

      const service = new CheatPersistenceService();
      service.setCheatEnabled("game-1", 2, false);

      const state = service.getGameState("game-1");
      expect(state.enabledIndices).toEqual([0, 5]);
    });

    it("keeps indices sorted", () => {
      const service = new CheatPersistenceService();
      service.setCheatEnabled("game-1", 5, true);
      service.setCheatEnabled("game-1", 1, true);
      service.setCheatEnabled("game-1", 3, true);

      const state = service.getGameState("game-1");
      expect(state.enabledIndices).toEqual([1, 3, 5]);
    });

    it("persists to disk on every toggle", () => {
      const service = new CheatPersistenceService();
      service.setCheatEnabled("game-1", 0, true);

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.renameSync).toHaveBeenCalled();
    });
  });

  describe("addCustomCheat", () => {
    it("adds a custom cheat with enabled=true", () => {
      const service = new CheatPersistenceService();
      service.addCustomCheat("game-1", "Infinite Lives", "APEETPEY");

      const state = service.getGameState("game-1");
      expect(state.customCheats).toEqual([
        { description: "Infinite Lives", code: "APEETPEY", enabled: true },
      ]);
    });

    it("appends to existing custom cheats", () => {
      const config = {
        games: {
          "game-1": {
            enabledIndices: [],
            customCheats: [{ description: "First", code: "AAA", enabled: true }],
          },
        },
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

      const service = new CheatPersistenceService();
      service.addCustomCheat("game-1", "Second", "BBB");

      const state = service.getGameState("game-1");
      expect(state.customCheats).toHaveLength(2);
      expect(state.customCheats[1]?.description).toBe("Second");
    });
  });

  describe("removeCustomCheat", () => {
    it("removes a custom cheat by index", () => {
      const config = {
        games: {
          "game-1": {
            enabledIndices: [],
            customCheats: [
              { description: "A", code: "AAA", enabled: true },
              { description: "B", code: "BBB", enabled: true },
            ],
          },
        },
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

      const service = new CheatPersistenceService();
      service.removeCustomCheat("game-1", 0);

      const state = service.getGameState("game-1");
      expect(state.customCheats).toHaveLength(1);
      expect(state.customCheats[0]?.description).toBe("B");
    });

    it("ignores out-of-bounds index", () => {
      const service = new CheatPersistenceService();
      service.addCustomCheat("game-1", "Test", "AAA");
      service.removeCustomCheat("game-1", 99);

      const state = service.getGameState("game-1");
      expect(state.customCheats).toHaveLength(1);
    });
  });

  describe("setCustomCheatEnabled", () => {
    it("toggles a custom cheat", () => {
      const service = new CheatPersistenceService();
      service.addCustomCheat("game-1", "Test", "AAA");
      service.setCustomCheatEnabled("game-1", 0, false);

      const state = service.getGameState("game-1");
      expect(state.customCheats[0]?.enabled).toBe(false);
    });
  });

  describe("loadConfig", () => {
    it("handles corrupt config gracefully", () => {
      vi.mocked(fs.readFileSync).mockReturnValue("not json{{{");

      const service = new CheatPersistenceService();
      const state = service.getGameState("any");

      expect(state).toEqual({ enabledIndices: [], customCheats: [] });
    });

    it("handles config with missing games field", () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: 1 }));

      const service = new CheatPersistenceService();
      const state = service.getGameState("any");

      expect(state).toEqual({ enabledIndices: [], customCheats: [] });
    });
  });
});
