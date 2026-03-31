import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CheatEntry } from "../../types/library";
import { CheatDatabaseService } from "./CheatDatabaseService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomCheat {
  description: string;
  code: string;
  enabled: boolean;
}

export interface GameCheatState {
  /** Indices of enabled database cheats */
  enabledIndices: Array<number>;
  /** User-defined custom cheats */
  customCheats: Array<CustomCheat>;
}

interface CheatConfig {
  games: Record<string, GameCheatState>;
}

// ---------------------------------------------------------------------------
// CheatPersistenceService
// ---------------------------------------------------------------------------

/**
 * Persists per-game cheat state: which database cheats are enabled and
 * any user-defined custom cheats. Stored in `<userData>/cheat-config.json`.
 */
export class CheatPersistenceService {
  private configPath: string;
  private config: CheatConfig;

  constructor() {
    this.configPath = path.join(app.getPath("userData"), "cheat-config.json");
    this.config = this.loadConfig();
  }

  /** Get the persisted cheat state for a game. */
  getGameState(gameId: string): GameCheatState {
    return (
      this.config.games[gameId] ?? {
        enabledIndices: [],
        customCheats: [],
      }
    );
  }

  /** Toggle a database cheat on or off for a game. */
  setCheatEnabled(gameId: string, index: number, enabled: boolean): void {
    const state = this.ensureGameState(gameId);
    const set = new Set(state.enabledIndices);

    if (enabled) {
      set.add(index);
    } else {
      set.delete(index);
    }

    state.enabledIndices = [...set].sort((a, b) => a - b);
    this.saveConfig();
  }

  /** Add a custom cheat for a game. */
  addCustomCheat(gameId: string, description: string, code: string): void {
    const state = this.ensureGameState(gameId);
    state.customCheats.push({ description, code, enabled: true });
    this.saveConfig();
  }

  /** Remove a custom cheat by index within the customCheats array. */
  removeCustomCheat(gameId: string, customIndex: number): void {
    const state = this.ensureGameState(gameId);
    if (customIndex >= 0 && customIndex < state.customCheats.length) {
      state.customCheats.splice(customIndex, 1);
      this.saveConfig();
    }
  }

  /** Toggle a custom cheat on or off. */
  setCustomCheatEnabled(gameId: string, customIndex: number, enabled: boolean): void {
    const state = this.ensureGameState(gameId);
    const cheat = state.customCheats[customIndex];
    if (cheat) {
      cheat.enabled = enabled;
      this.saveConfig();
    }
  }

  /**
   * Get all enabled cheats for a game, merged from database + custom.
   * Used to auto-apply cheats on game launch.
   */
  getEnabledCheats(
    gameId: string,
    cheatDatabaseService: CheatDatabaseService,
    systemId: string,
    romFilename: string,
  ): Array<{ index: number; code: string }> {
    const state = this.getGameState(gameId);
    const dbCheats = cheatDatabaseService.getCheatsForGame(systemId, romFilename);

    const result: Array<{ index: number; code: string }> = [];
    let cheatIndex = 0;

    // Database cheats with their original indices
    for (const cheat of dbCheats) {
      if (state.enabledIndices.includes(cheat.index)) {
        result.push({ index: cheatIndex, code: cheat.code });
      }
      cheatIndex++;
    }

    // Custom cheats appended after database cheats
    for (const custom of state.customCheats) {
      if (custom.enabled) {
        result.push({ index: cheatIndex, code: custom.code });
      }
      cheatIndex++;
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private ensureGameState(gameId: string): GameCheatState {
    let state = this.config.games[gameId];
    if (!state) {
      state = { enabledIndices: [], customCheats: [] };
      this.config.games[gameId] = state;
    }
    return state;
  }

  private loadConfig(): CheatConfig {
    try {
      const raw = fs.readFileSync(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as CheatConfig;
      if (parsed.games && typeof parsed.games === "object") {
        return parsed;
      }
    } catch {
      // File doesn't exist or is corrupt — start fresh
    }
    return { games: {} };
  }

  private saveConfig(): void {
    const tmpPath = `${this.configPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.config, null, 2), "utf8");
    fs.renameSync(tmpPath, this.configPath);
  }
}
