import { ipcMain, IpcMainInvokeEvent, BrowserWindow, dialog } from "electron";
import { EmulatorManager } from "../emulator/EmulatorManager";
import { LibretroNativeCore } from "../emulator/LibretroNativeCore";
import { EmulationWorkerClient } from "../emulator/EmulationWorkerClient";
import { resolveAddonPath } from "../emulator/resolveAddonPath";
import { LibraryService } from "../services/LibraryService";
import { ArtworkService } from "../services/ArtworkService";
import { HomebrewService } from "../services/HomebrewService";
import { CheatDatabaseService } from "../services/CheatDatabaseService";
import { CheatPersistenceService } from "../services/CheatPersistenceService";
import { ScreenScraperError } from "../services/ScreenScraperClient";
import { GameWindowManager } from "../GameWindowManager";
import type { AutoUpdaterService } from "../services/AutoUpdaterService";
import { Game, GameSystem } from "../../types/library";
import type { AmbiguousRomFile } from "../services/LibraryService";
import { ipcLog } from "../logger";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ResumeDialogResponse {
  action: "resume" | "start-fresh" | "cancel";
  remember: boolean;
}

export class IPCHandlers {
  private emulatorManager: EmulatorManager;
  private libraryService: LibraryService;
  private artworkService: ArtworkService;
  private homebrewService: HomebrewService;
  private gameWindowManager: GameWindowManager;
  private cheatDatabaseService: CheatDatabaseService;
  private cheatPersistenceService: CheatPersistenceService;
  private autoUpdater: AutoUpdaterService | null = null;
  private pendingResumeDialogs = new Map<string, (response: ResumeDialogResponse) => void>();
  /** Whether the homebrew import check has finished (imported, skipped, or errored). */
  private homebrewDone = false;
  private pendingDisambiguations = new Map<
    string,
    (response: Array<{ fullPath: string; systemId: string; mtimeMs: number }>) => void
  >();

  constructor(preloadPath: string) {
    this.emulatorManager = new EmulatorManager();
    this.libraryService = new LibraryService();
    this.artworkService = new ArtworkService(this.libraryService);
    this.homebrewService = new HomebrewService(this.libraryService);
    this.cheatDatabaseService = new CheatDatabaseService();
    this.cheatPersistenceService = new CheatPersistenceService();
    this.gameWindowManager = new GameWindowManager(preloadPath);
    this.setupHandlers();
    this.setupEmulatorEventForwarding();
    this.setupLibraryHandlers();
    this.setupArtworkHandlers();
    this.setupDialogHandlers();

    // Import bundled homebrew ROMs on first launch (async, non-blocking).
    // Notifies the renderer when done so it can reload the library.
    // Also sets homebrewDone so late-loading renderers can query the state
    // via library:isHomebrewDone (the event may fire before they register).
    this.homebrewService
      .importIfNeeded()
      .then((imported) => {
        if (imported) {
          ipcLog.info("Homebrew ROMs imported, notifying renderer");
        }
        this.homebrewDone = true;
        const windows = BrowserWindow.getAllWindows();
        for (const window of windows) {
          window.webContents.send("library:homebrewImported");
        }
      })
      .catch((error) => {
        ipcLog.error("Homebrew import failed:", error);
        this.homebrewDone = true;
        // Still dismiss the setup screen so the user isn't stuck
        const windows = BrowserWindow.getAllWindows();
        for (const window of windows) {
          window.webContents.send("library:homebrewImported");
        }
      });
  }

  private setupHandlers(): void {
    // Emulator management
    ipcMain.handle(
      "emulator:getCoresForSystem",
      async (event: IpcMainInvokeEvent, systemId: string) => {
        return this.emulatorManager.getCoresForSystem(systemId);
      },
    );

    ipcMain.handle(
      "emulator:downloadCore",
      async (event: IpcMainInvokeEvent, coreName: string, systemId: string) => {
        try {
          const corePath = await this.emulatorManager
            .getCoreDownloader()
            .downloadCore(coreName, systemId);
          return { success: true, corePath };
        } catch (error) {
          ipcLog.error("Failed to download core:", error);
          return { success: false, error: errorMessage(error) };
        }
      },
    );

    ipcMain.handle(
      "emulator:launch",
      async (
        event: IpcMainInvokeEvent,
        romPath: string,
        systemId: string,
        emulatorId?: string,
        coreName?: string,
        cardBounds?: { x: number; y: number; width: number; height: number },
      ) => {
        try {
          // Find the game in the library to get full metadata
          const games = this.libraryService.getGames(systemId);
          const game = games.find((g) => g.romPath === romPath);

          if (!game) {
            throw new Error("Game not found in library");
          }

          // Validate BIOS files before attempting to launch
          const biosCheck = this.emulatorManager.validateBios(systemId);
          if (!biosCheck.valid) {
            const fileList = biosCheck.missingFiles.join(", ");
            return {
              success: false,
              error: `${biosCheck.systemName} requires BIOS files that are missing: ${fileList}. Place them in: ${biosCheck.biosDir}`,
            };
          }

          // Ensure cheat database is downloaded (non-blocking background task)
          this.cheatDatabaseService.ensureDatabase().catch((error) => {
            ipcLog.warn("Cheat database download failed:", error);
          });

          // Convert renderer-relative card bounds to screen coordinates
          let cardScreenBounds: { x: number; y: number; width: number; height: number } | undefined;
          if (cardBounds) {
            const senderWindow = BrowserWindow.fromWebContents(event.sender);
            if (senderWindow) {
              const windowBounds = senderWindow.getContentBounds();
              cardScreenBounds = {
                x: windowBounds.x + cardBounds.x,
                y: windowBounds.y + cardBounds.y,
                width: cardBounds.width,
                height: cardBounds.height,
              };
            }
          }

          // Launch the emulator with optional specific core
          await this.emulatorManager.launchGame(romPath, systemId, emulatorId, undefined, coreName);

          if (this.emulatorManager.isNativeMode()) {
            // Native mode: single window, game renders inside BrowserWindow canvas
            const nativeCore = this.emulatorManager.getCurrentEmulator() as LibretroNativeCore;

            // Check for autosave and prompt user with custom dialog
            let shouldResume = false;
            if (nativeCore.hasAutoSave()) {
              const mainWindow = BrowserWindow.getFocusedWindow();
              if (mainWindow) {
                const response = await this.showResumeGameDialog(mainWindow, game.id, game.title);

                if (response.action === "cancel") {
                  await this.emulatorManager.stopEmulator();
                  return { success: false, error: "cancelled" };
                }

                shouldResume = response.action === "resume";
                if (!shouldResume) {
                  nativeCore.deleteAutoSave();
                }

                // If remember was true, the renderer saves the preference to
                // localStorage before sending the IPC response (same pattern
                // as core-preference). On subsequent launches the renderer
                // auto-responds without showing the dialog.
              }
            }

            // Spawn the emulation worker process
            const workerClient = new EmulationWorkerClient();
            const addonPath = resolveAddonPath();
            const avInfo = await workerClient.init({
              corePath: nativeCore.getCorePath(),
              romPath: nativeCore.getRomPath(),
              systemDir: nativeCore.getSystemDir(),
              saveDir: nativeCore.getSaveDir(),
              sramDir: nativeCore.getSramDir(),
              saveStatesDir: nativeCore.getSaveStatesDir(),
              addonPath,
            });

            // Store the worker client on the emulator manager for control routing
            this.emulatorManager.setWorkerClient(workerClient);

            // Auto-apply persisted cheats (non-blocking)
            this.autoApplyCheats(workerClient, game).catch((error) => {
              ipcLog.warn("Failed to auto-apply cheats:", error);
            });

            this.gameWindowManager.createNativeGameWindow(
              game,
              workerClient,
              avInfo,
              shouldResume,
              cardScreenBounds,
            );
          } else {
            // Legacy overlay mode: external RetroArch process
            this.gameWindowManager.createGameWindow(game);

            // Start tracking RetroArch window to overlay our controls
            const pid = this.emulatorManager.getCurrentEmulatorPid();
            if (pid) {
              this.gameWindowManager.startTrackingRetroArchWindow(game.id, pid);
            } else {
              ipcLog.warn("Could not get emulator PID for window tracking");
            }
          }

          return { success: true };
        } catch (error) {
          ipcLog.error("Failed to launch emulator:", error);
          return { success: false, error: errorMessage(error) };
        }
      },
    );

    ipcMain.handle("emulator:stop", async () => {
      try {
        await this.emulatorManager.stopEmulator();
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to stop emulator:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle("emulator:getAvailable", () => {
      return this.emulatorManager.getAvailableEmulators();
    });

    ipcMain.handle("emulator:isRunning", () => {
      return this.emulatorManager.isEmulatorRunning();
    });

    // Emulation control
    ipcMain.handle("emulation:pause", async () => {
      try {
        await this.emulatorManager.pause();
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to pause emulation:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle("emulation:resume", async () => {
      try {
        await this.emulatorManager.resume();
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to resume emulation:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle("emulation:reset", async () => {
      try {
        await this.emulatorManager.reset();
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to reset emulation:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle("emulation:setSpeed", (_event, multiplier: number) => {
      try {
        this.emulatorManager.setSpeed(multiplier);
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to set emulation speed:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle("emulation:setFastForwardAudio", (_event, enabled: boolean) => {
      try {
        this.emulatorManager.setFastForwardAudio(enabled);
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to set fast-forward audio:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    // Save states
    ipcMain.handle("savestate:save", async (event, slot: number) => {
      try {
        await this.emulatorManager.saveState(slot);
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to save state:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle("savestate:load", async (event, slot: number) => {
      try {
        await this.emulatorManager.loadState(slot);
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to load state:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    // Screenshot
    ipcMain.handle("emulation:screenshot", async (event, outputPath?: string) => {
      try {
        const path = await this.emulatorManager.screenshot(outputPath);
        return { success: true, path };
      } catch (error) {
        ipcLog.error("Failed to take screenshot:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    // Cheats
    ipcMain.handle(
      "cheats:listForGame",
      async (event: IpcMainInvokeEvent, systemId: string, romFilename: string) => {
        try {
          // Pass the CD-ROM serial and core ID for chtdb serial-based lookup.
          // Chtdb cheats are only included when the active core is DuckStation,
          // since its extended code types are incompatible with other cores.
          const workerClient = this.emulatorManager.getWorkerClient();
          const serial = workerClient?.getDetectedSerial() ?? undefined;
          const coreId = this.emulatorManager.getActiveCoreId() ?? undefined;
          const cheats = this.cheatDatabaseService.getCheatsForGame(
            systemId,
            romFilename,
            serial,
            coreId,
          );
          return { success: true, cheats };
        } catch (error) {
          ipcLog.error("Failed to list cheats:", error);
          return { success: false, error: errorMessage(error), cheats: [] };
        }
      },
    );

    ipcMain.handle("cheats:databaseStatus", () => {
      return {
        present: this.cheatDatabaseService.isDatabasePresent(),
        downloading: this.cheatDatabaseService.isDownloading(),
      };
    });

    ipcMain.handle("cheats:downloadDatabase", async () => {
      try {
        await this.cheatDatabaseService.ensureDatabase();
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to download cheat database:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle(
      "cheats:set",
      async (event: IpcMainInvokeEvent, index: number, enabled: boolean, code: string) => {
        try {
          const workerClient = this.emulatorManager.getWorkerClient();
          if (!workerClient) {
            return { success: false, error: "No emulator running" };
          }
          await workerClient.cheatSet(index, enabled, code);
          return { success: true };
        } catch (error) {
          ipcLog.error("Failed to set cheat:", error);
          return { success: false, error: errorMessage(error) };
        }
      },
    );

    ipcMain.handle("cheats:reset", async () => {
      try {
        const workerClient = this.emulatorManager.getWorkerClient();
        if (!workerClient) {
          return { success: false, error: "No emulator running" };
        }
        await workerClient.cheatReset();
        return { success: true };
      } catch (error) {
        ipcLog.error("Failed to reset cheats:", error);
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle("cheats:getGameState", async (event: IpcMainInvokeEvent, gameId: string) => {
      try {
        const state = this.cheatPersistenceService.getGameState(gameId);
        return { success: true, state };
      } catch (error) {
        return { success: false, error: errorMessage(error), state: null };
      }
    });

    ipcMain.handle(
      "cheats:toggleCheat",
      async (event: IpcMainInvokeEvent, gameId: string, index: number, enabled: boolean) => {
        try {
          this.cheatPersistenceService.setCheatEnabled(gameId, index, enabled);
          return { success: true };
        } catch (error) {
          return { success: false, error: errorMessage(error) };
        }
      },
    );

    ipcMain.handle(
      "cheats:toggleCustomCheat",
      async (event: IpcMainInvokeEvent, gameId: string, customIndex: number, enabled: boolean) => {
        try {
          this.cheatPersistenceService.setCustomCheatEnabled(gameId, customIndex, enabled);
          return { success: true };
        } catch (error) {
          return { success: false, error: errorMessage(error) };
        }
      },
    );

    ipcMain.handle(
      "cheats:addCustomCheat",
      async (event: IpcMainInvokeEvent, gameId: string, description: string, code: string) => {
        try {
          this.cheatPersistenceService.addCustomCheat(gameId, description, code);
          return { success: true };
        } catch (error) {
          return { success: false, error: errorMessage(error) };
        }
      },
    );

    ipcMain.handle(
      "cheats:removeCustomCheat",
      async (event: IpcMainInvokeEvent, gameId: string, customIndex: number) => {
        try {
          this.cheatPersistenceService.removeCustomCheat(gameId, customIndex);
          return { success: true };
        } catch (error) {
          return { success: false, error: errorMessage(error) };
        }
      },
    );
  }

  private setupEmulatorEventForwarding(): void {
    // Forward emulator events to all renderer windows
    const forwardEvent = (eventName: string, data?: any) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: BrowserWindow) => {
        window.webContents.send(eventName, data);
      });
    };

    this.emulatorManager.on("gameLaunched", (data) => {
      forwardEvent("emulator:launched", data);
      // Tell artwork sync to defer disk flushes during gameplay.
      // Sync continues (API calls + image downloads are non-blocking),
      // but we skip flushSave() to avoid any remaining event loop pressure.
      this.artworkService.setGameplayActive(true);
    });
    this.emulatorManager.on("emulator:exited", (data) => {
      forwardEvent("emulator:exited", data);
      this.artworkService.setGameplayActive(false);
    });
    this.emulatorManager.on("emulator:error", (error) => forwardEvent("emulator:error", error));
    this.emulatorManager.on("emulator:stateSaved", (data) =>
      forwardEvent("emulator:stateSaved", data),
    );
    this.emulatorManager.on("emulator:stateLoaded", (data) =>
      forwardEvent("emulator:stateLoaded", data),
    );
    this.emulatorManager.on("emulator:screenshotTaken", (data) =>
      forwardEvent("emulator:screenshotTaken", data),
    );
    this.emulatorManager.on("emulator:paused", () => forwardEvent("emulator:paused"));
    this.emulatorManager.on("emulator:resumed", () => forwardEvent("emulator:resumed"));
    this.emulatorManager.on("emulator:reset", () => forwardEvent("emulator:reset"));
    this.emulatorManager.on("emulator:speedChanged", (data) =>
      forwardEvent("emulator:speedChanged", data),
    );
    this.emulatorManager.on("emulator:terminated", () => {
      forwardEvent("emulator:terminated");
      this.artworkService.setGameplayActive(false);
    });
    this.emulatorManager.on("core:downloadProgress", (data) =>
      forwardEvent("core:downloadProgress", data),
    );
    this.cheatDatabaseService.on("progress", (data) =>
      forwardEvent("cheats:downloadProgress", data),
    );

    // Native mode: game window close doesn't go through EmulatorManager events,
    // so we listen on GameWindowManager directly to end gameplay mode.
    this.gameWindowManager.on("gameWindowClosed", () => {
      this.artworkService.setGameplayActive(false);
    });
  }

  private setupLibraryHandlers(): void {
    // Forward scan progress events to all renderer windows
    this.libraryService.on("scanProgress", (data) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: BrowserWindow) => {
        window.webContents.send("library:scanProgress", data);
      });
    });

    // Homebrew import status — lets the renderer check if the import check
    // has already completed (the event may have fired before the renderer loaded).
    ipcMain.handle("library:isHomebrewDone", () => {
      return this.homebrewDone;
    });

    // Forward ambiguous file events — the renderer shows a disambiguation dialog
    this.libraryService.on("scanAmbiguous", (files: Array<AmbiguousRomFile>) => {
      const requestId = `disambiguate-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Serialize system data for IPC (strip non-serializable fields)
      const serializedFiles = files.map((f) => ({
        ext: f.ext,
        fullPath: f.fullPath,
        matchingSystems: f.matchingSystems.map((s) => ({
          id: s.id,
          name: s.name,
          shortName: s.shortName,
        })),
        mtimeMs: f.mtimeMs,
      }));

      // Set up a promise that resolves when the renderer responds
      const responsePromise = new Promise<
        Array<{ fullPath: string; systemId: string; mtimeMs: number }>
      >((resolve) => {
        this.pendingDisambiguations.set(requestId, resolve);

        // Timeout: if no response in 60 seconds, skip all ambiguous files
        setTimeout(() => {
          if (this.pendingDisambiguations.has(requestId)) {
            this.pendingDisambiguations.delete(requestId);
            resolve([]);
          }
        }, 60_000);
      });

      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: BrowserWindow) => {
        window.webContents.send("library:scanAmbiguous", { requestId, files: serializedFiles });
      });

      // Process resolved files when the renderer responds
      responsePromise.then(async (resolved) => {
        if (resolved.length === 0) {
          return;
        }
        const games = await this.libraryService.processResolvedFiles(resolved);
        if (games.length > 0) {
          // Emit progress events for newly added games so the library grid updates
          for (const game of games) {
            this.libraryService.emit("scanProgress", {
              game,
              isNew: true,
              processed: 1,
              skipped: 0,
              total: 1,
            } satisfies import("../services/LibraryService").ScanProgressEvent);
          }
        }
      });
    });

    // System management
    ipcMain.handle("library:getSystems", () => {
      return this.libraryService.getSystems();
    });

    ipcMain.handle("library:addSystem", async (event, system: GameSystem) => {
      await this.libraryService.addSystem(system);
      return { success: true };
    });

    ipcMain.handle("library:removeSystem", async (event, systemId: string) => {
      await this.libraryService.removeSystem(systemId);
      return { success: true };
    });

    ipcMain.handle(
      "library:updateSystemPath",
      async (event, systemId: string, romsPath: string) => {
        await this.libraryService.updateSystemPath(systemId, romsPath);
        return { success: true };
      },
    );

    // Game management
    ipcMain.handle("library:getGames", (event, systemId?: string) => {
      return this.libraryService.getGames(systemId);
    });

    ipcMain.handle("library:addGame", async (event, romPath: string, systemId: string) => {
      const game = await this.libraryService.addGame(romPath, systemId);
      return game;
    });

    ipcMain.handle("library:removeGame", async (event, gameId: string) => {
      await this.libraryService.removeGame(gameId);
      return { success: true };
    });

    ipcMain.handle("library:updateGame", async (event, gameId: string, updates: Partial<Game>) => {
      await this.libraryService.updateGame(gameId, updates);
      return { success: true };
    });

    // Scanning
    ipcMain.handle(
      "library:scanDirectory",
      async (event, directoryPath: string, systemId?: string) => {
        const games = await this.libraryService.scanDirectory(directoryPath, systemId);
        return games;
      },
    );

    ipcMain.handle("library:scanSystemFolders", async () => {
      const games = await this.libraryService.scanSystemFolders();
      return games;
    });

    // Config
    ipcMain.handle("library:getConfig", () => {
      return this.libraryService.getConfig();
    });

    ipcMain.handle("library:setRomsBasePath", async (event, basePath: string) => {
      await this.libraryService.setRomsBasePath(basePath);
      return { success: true };
    });

    // File dialogs
    ipcMain.handle("dialog:selectDirectory", async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
        title: "Select ROMs Directory",
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    });

    ipcMain.handle("dialog:selectRomFile", async (event, systemId: string) => {
      const system = this.libraryService.getSystems().find((s) => s.id === systemId);
      const filters = system
        ? [
            {
              name: `${system.name} ROMs`,
              extensions: [
                ...system.extensions.map((ext) => ext.slice(1)), // Remove dots
                ...(systemId !== "arcade" ? ["zip"] : []),
              ],
            },
          ]
        : [];

      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        title: "Select ROM File",
        filters,
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    });
  }

  private setupArtworkHandlers(): void {
    // Forward artwork events only to non-game windows (library UI).
    // Broadcasting to game windows wastes IPC bandwidth and adds event loop
    // pressure during gameplay — the game window doesn't use these events.
    const forwardToLibraryWindows = (eventName: string, data?: unknown) => {
      const windows = BrowserWindow.getAllWindows();
      for (const window of windows) {
        if (!this.gameWindowManager.isGameWindow(window)) {
          window.webContents.send(eventName, data);
        }
      }
    };

    this.artworkService.on("progress", (data) => forwardToLibraryWindows("artwork:progress", data));
    this.artworkService.on("syncComplete", (data) =>
      forwardToLibraryWindows("artwork:syncComplete", data),
    );

    ipcMain.handle("artwork:syncGame", async (_event, gameId: string) => {
      try {
        const success = await this.artworkService.syncGame(gameId);
        return { success };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle("artwork:syncAll", () => {
      // Start sync in background — attach error handler to catch unhandled rejections
      const syncPromise = this.artworkService.syncAllGames();
      syncPromise.catch((error) => {
        ipcLog.error("Artwork sync failed:", error);
        forwardToLibraryWindows("artwork:syncError", {
          error: error instanceof Error ? error.message : String(error),
          errorCode: error instanceof ScreenScraperError ? error.errorCode : undefined,
        });
      });
      return { success: true };
    });

    ipcMain.handle("artwork:syncGames", (_event, gameIds: Array<string>) => {
      // Start targeted sync in background for auto-sync after import
      const syncPromise = this.artworkService.syncGames(gameIds);
      syncPromise.catch((error) => {
        ipcLog.error("Artwork sync for imported games failed:", error);
        forwardToLibraryWindows("artwork:syncError", {
          error: error instanceof Error ? error.message : String(error),
          errorCode: error instanceof ScreenScraperError ? error.errorCode : undefined,
        });
      });
      return { success: true };
    });

    ipcMain.handle("artwork:cancelSync", () => {
      this.artworkService.cancelSync();
      return { success: true };
    });

    ipcMain.handle("artwork:getSyncStatus", () => {
      return this.artworkService.getSyncStatus();
    });

    ipcMain.handle("artwork:getCredentials", () => {
      return { hasCredentials: this.artworkService.hasCredentials() };
    });

    ipcMain.handle(
      "artwork:setCredentials",
      async (_event, userId: string, userPassword: string) => {
        try {
          // Validate credentials against ScreenScraper before saving
          const validation = await this.artworkService.validateCredentials(userId, userPassword);
          if (!validation.valid) {
            return { success: false, error: validation.error, errorCode: validation.errorCode };
          }

          await this.artworkService.setCredentials(userId, userPassword);
          return { success: true };
        } catch (error) {
          return { success: false, error: errorMessage(error) };
        }
      },
    );

    ipcMain.handle("artwork:clearCredentials", async () => {
      try {
        await this.artworkService.clearCredentials();
        return { success: true };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    });

    ipcMain.handle("artwork:isCredentialPromptDismissed", () => {
      return this.artworkService.isCredentialPromptDismissed();
    });

    ipcMain.handle("artwork:dismissCredentialPrompt", async () => {
      await this.artworkService.dismissCredentialPrompt();
      return { success: true };
    });
  }

  private setupDialogHandlers(): void {
    // Handle resume game dialog response from renderer
    ipcMain.on(
      "dialog:resumeGameResponse",
      (event, requestId: string, response: ResumeDialogResponse) => {
        const resolver = this.pendingResumeDialogs.get(requestId);
        if (resolver) {
          resolver(response);
          this.pendingResumeDialogs.delete(requestId);
        }
      },
    );

    // Handle system disambiguation dialog response from renderer
    ipcMain.on(
      "dialog:disambiguateResponse",
      (
        _event: Electron.IpcMainEvent,
        requestId: string,
        resolved: Array<{ fullPath: string; systemId: string; mtimeMs: number }>,
      ) => {
        const resolver = this.pendingDisambiguations.get(requestId);
        if (resolver) {
          resolver(resolved);
          this.pendingDisambiguations.delete(requestId);
        }
      },
    );
  }

  /**
   * Connect the auto-updater service so IPC handlers can trigger
   * manual update checks and quit-and-install from the renderer.
   */
  setAutoUpdater(service: AutoUpdaterService): void {
    this.autoUpdater = service;
    this.setupAutoUpdateHandlers();
  }

  private setupAutoUpdateHandlers(): void {
    ipcMain.handle("updates:checkNow", async () => {
      await this.autoUpdater?.checkForUpdates();
    });

    ipcMain.handle("updates:quitAndInstall", () => {
      this.autoUpdater?.quitAndInstall();
    });
  }

  /**
   * Gracefully shut down any running emulator. Called during app quit
   * to prevent the worker exit handler from emitting an unhandled error.
   */
  async cleanup(): Promise<void> {
    // Synchronously suppress the "exited unexpectedly" error before the
    // async shutdown — the utility process can be torn down by Electron
    // before the shutdown handshake completes.
    this.emulatorManager.prepareForQuit();
    await this.emulatorManager.stopEmulator();

    // Stop any in-progress artwork sync and flush pending batched library
    // writes so artwork downloaded during this session isn't lost on quit.
    this.artworkService.cancelSync();
    await this.libraryService.flushSave();
  }

  /**
   * Show a custom resume game dialog in the renderer and wait for response.
   */
  private showResumeGameDialog(
    window: BrowserWindow,
    gameId: string,
    gameTitle: string,
  ): Promise<ResumeDialogResponse> {
    return new Promise((resolve) => {
      const requestId = `resume-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.pendingResumeDialogs.set(requestId, resolve);

      window.webContents.send("dialog:showResumeGame", {
        requestId,
        gameId,
        gameTitle,
      });

      // Timeout fallback: if no response after 30 seconds, default to cancel
      setTimeout(() => {
        if (this.pendingResumeDialogs.has(requestId)) {
          this.pendingResumeDialogs.delete(requestId);
          resolve({ action: "cancel", remember: false });
        }
      }, 30_000);
    });
  }

  /**
   * Apply any previously-enabled cheats for a game after the emulation
   * worker is initialized. Runs cheatReset first, then sets each enabled cheat.
   */
  private async autoApplyCheats(workerClient: EmulationWorkerClient, game: Game): Promise<void> {
    const romFilename = game.romPath.split("/").pop() || game.romPath;
    const serial = workerClient.getDetectedSerial() ?? undefined;
    const coreId = this.emulatorManager.getActiveCoreId() ?? undefined;
    const enabledCheats = this.cheatPersistenceService.getEnabledCheats(
      game.id,
      this.cheatDatabaseService,
      game.systemId,
      romFilename,
      serial,
      coreId,
    );

    if (enabledCheats.length === 0) {
      return;
    }

    await workerClient.cheatReset();
    for (const cheat of enabledCheats) {
      await workerClient.cheatSet(cheat.index, true, cheat.code);
    }

    ipcLog.info(`Auto-applied ${enabledCheats.length} cheat(s) for ${game.title}`);
  }
}
