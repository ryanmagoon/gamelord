import { ipcMain, IpcMainInvokeEvent, BrowserWindow, dialog } from 'electron';
import { EmulatorManager } from '../emulator/EmulatorManager';
import { LibretroNativeCore } from '../emulator/LibretroNativeCore';
import { EmulationWorkerClient } from '../emulator/EmulationWorkerClient';
import { resolveAddonPath } from '../emulator/resolveAddonPath';
import { LibraryService } from '../services/LibraryService';
import { ArtworkService } from '../services/ArtworkService';
import { GameWindowManager } from '../GameWindowManager';
import { GameSystem } from '../../types/library';
import { ipcLog } from '../logger';

export class IPCHandlers {
  private emulatorManager: EmulatorManager;
  private libraryService: LibraryService;
  private artworkService: ArtworkService;
  private gameWindowManager: GameWindowManager;
  private pendingResumeDialogs = new Map<string, (shouldResume: boolean) => void>();

  constructor(preloadPath: string) {
    this.emulatorManager = new EmulatorManager();
    this.libraryService = new LibraryService();
    this.artworkService = new ArtworkService(this.libraryService);
    this.gameWindowManager = new GameWindowManager(preloadPath);
    this.setupHandlers();
    this.setupEmulatorEventForwarding();
    this.setupLibraryHandlers();
    this.setupArtworkHandlers();
    this.setupDialogHandlers();
  }

  private setupHandlers(): void {
    // Emulator management
    ipcMain.handle('emulator:getCoresForSystem', async (event: IpcMainInvokeEvent, systemId: string) => {
      return this.emulatorManager.getCoresForSystem(systemId);
    });

    ipcMain.handle('emulator:downloadCore', async (event: IpcMainInvokeEvent, coreName: string, systemId: string) => {
      try {
        const corePath = await this.emulatorManager.getCoreDownloader().downloadCore(coreName, systemId);
        return { success: true, corePath };
      } catch (error) {
        ipcLog.error('Failed to download core:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('emulator:launch', async (event: IpcMainInvokeEvent, romPath: string, systemId: string, emulatorId?: string, coreName?: string) => {
      try {
        // Find the game in the library to get full metadata
        const games = this.libraryService.getGames(systemId);
        const game = games.find(g => g.romPath === romPath);

        if (!game) {
          throw new Error('Game not found in library');
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
              shouldResume = await this.showResumeGameDialog(mainWindow, game.title);
              if (!shouldResume) {
                nativeCore.deleteAutoSave();
              }
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

          this.gameWindowManager.createNativeGameWindow(game, workerClient, avInfo, shouldResume);
        } else {
          // Legacy overlay mode: external RetroArch process
          this.gameWindowManager.createGameWindow(game);

          // Start tracking RetroArch window to overlay our controls
          const pid = this.emulatorManager.getCurrentEmulatorPid();
          if (pid) {
            this.gameWindowManager.startTrackingRetroArchWindow(game.id, pid);
          } else {
            ipcLog.warn('Could not get emulator PID for window tracking');
          }
        }

        return { success: true };
      } catch (error) {
        ipcLog.error('Failed to launch emulator:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('emulator:stop', async () => {
      try {
        await this.emulatorManager.stopEmulator();
        return { success: true };
      } catch (error) {
        ipcLog.error('Failed to stop emulator:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('emulator:getAvailable', () => {
      return this.emulatorManager.getAvailableEmulators();
    });

    ipcMain.handle('emulator:isRunning', () => {
      return this.emulatorManager.isEmulatorRunning();
    });

    // Emulation control
    ipcMain.handle('emulation:pause', async () => {
      try {
        await this.emulatorManager.pause();
        return { success: true };
      } catch (error) {
        ipcLog.error('Failed to pause emulation:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('emulation:resume', async () => {
      try {
        await this.emulatorManager.resume();
        return { success: true };
      } catch (error) {
        ipcLog.error('Failed to resume emulation:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('emulation:reset', async () => {
      try {
        await this.emulatorManager.reset();
        return { success: true };
      } catch (error) {
        ipcLog.error('Failed to reset emulation:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Save states
    ipcMain.handle('savestate:save', async (event, slot: number) => {
      try {
        await this.emulatorManager.saveState(slot);
        return { success: true };
      } catch (error) {
        ipcLog.error('Failed to save state:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('savestate:load', async (event, slot: number) => {
      try {
        await this.emulatorManager.loadState(slot);
        return { success: true };
      } catch (error) {
        ipcLog.error('Failed to load state:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Screenshot
    ipcMain.handle('emulation:screenshot', async (event, outputPath?: string) => {
      try {
        const path = await this.emulatorManager.screenshot(outputPath);
        return { success: true, path };
      } catch (error) {
        ipcLog.error('Failed to take screenshot:', error);
        return { success: false, error: (error as Error).message };
      }
    });
  }

  private setupEmulatorEventForwarding(): void {
    // Forward emulator events to all renderer windows
    const forwardEvent = (eventName: string, data?: any) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: BrowserWindow) => {
        window.webContents.send(eventName, data);
      });
    };

    this.emulatorManager.on('gameLaunched', (data) => forwardEvent('emulator:launched', data));
    this.emulatorManager.on('emulator:exited', (data) => forwardEvent('emulator:exited', data));
    this.emulatorManager.on('emulator:error', (error) => forwardEvent('emulator:error', error));
    this.emulatorManager.on('emulator:stateSaved', (data) => forwardEvent('emulator:stateSaved', data));
    this.emulatorManager.on('emulator:stateLoaded', (data) => forwardEvent('emulator:stateLoaded', data));
    this.emulatorManager.on('emulator:screenshotTaken', (data) => forwardEvent('emulator:screenshotTaken', data));
    this.emulatorManager.on('emulator:paused', () => forwardEvent('emulator:paused'));
    this.emulatorManager.on('emulator:resumed', () => forwardEvent('emulator:resumed'));
    this.emulatorManager.on('emulator:reset', () => forwardEvent('emulator:reset'));
    this.emulatorManager.on('emulator:terminated', () => forwardEvent('emulator:terminated'));
    this.emulatorManager.on('core:downloadProgress', (data) => forwardEvent('core:downloadProgress', data));
  }

  private setupLibraryHandlers(): void {
    // System management
    ipcMain.handle('library:getSystems', () => {
      return this.libraryService.getSystems();
    });

    ipcMain.handle('library:addSystem', async (event, system: GameSystem) => {
      await this.libraryService.addSystem(system);
      return { success: true };
    });

    ipcMain.handle('library:removeSystem', async (event, systemId: string) => {
      await this.libraryService.removeSystem(systemId);
      return { success: true };
    });

    ipcMain.handle('library:updateSystemPath', async (event, systemId: string, romsPath: string) => {
      await this.libraryService.updateSystemPath(systemId, romsPath);
      return { success: true };
    });

    // Game management
    ipcMain.handle('library:getGames', (event, systemId?: string) => {
      return this.libraryService.getGames(systemId);
    });

    ipcMain.handle('library:addGame', async (event, romPath: string, systemId: string) => {
      const game = await this.libraryService.addGame(romPath, systemId);
      return game;
    });

    ipcMain.handle('library:removeGame', async (event, gameId: string) => {
      await this.libraryService.removeGame(gameId);
      return { success: true };
    });

    ipcMain.handle('library:updateGame', async (event, gameId: string, updates: any) => {
      await this.libraryService.updateGame(gameId, updates);
      return { success: true };
    });

    // Scanning
    ipcMain.handle('library:scanDirectory', async (event, directoryPath: string, systemId?: string) => {
      const games = await this.libraryService.scanDirectory(directoryPath, systemId);
      return games;
    });

    ipcMain.handle('library:scanSystemFolders', async () => {
      const games = await this.libraryService.scanSystemFolders();
      return games;
    });

    // Config
    ipcMain.handle('library:getConfig', () => {
      return this.libraryService.getConfig();
    });

    ipcMain.handle('library:setRomsBasePath', async (event, basePath: string) => {
      await this.libraryService.setRomsBasePath(basePath);
      return { success: true };
    });

    // File dialogs
    ipcMain.handle('dialog:selectDirectory', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select ROMs Directory'
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    });

    ipcMain.handle('dialog:selectRomFile', async (event, systemId: string) => {
      const system = this.libraryService.getSystems().find(s => s.id === systemId);
      const filters = system ? [
        {
          name: `${system.name} ROMs`,
          extensions: system.extensions.map(ext => ext.substring(1)) // Remove dots
        }
      ] : [];

      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: 'Select ROM File',
        filters
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    });
  }

  private setupArtworkHandlers(): void {
    // Forward artwork progress events to all renderer windows
    const forwardEvent = (eventName: string, data?: unknown) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: BrowserWindow) => {
        window.webContents.send(eventName, data);
      });
    };

    this.artworkService.on('progress', (data) => forwardEvent('artwork:progress', data));
    this.artworkService.on('syncComplete', (data) => forwardEvent('artwork:syncComplete', data));

    ipcMain.handle('artwork:syncGame', async (_event, gameId: string) => {
      try {
        const success = await this.artworkService.syncGame(gameId);
        return { success };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('artwork:syncAll', () => {
      // Start sync in background — attach error handler to catch unhandled rejections
      const syncPromise = this.artworkService.syncAllGames();
      syncPromise.catch((error) => {
        ipcLog.error('Artwork sync failed:', error);
        forwardEvent('artwork:syncError', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return { success: true };
    });

    ipcMain.handle('artwork:syncGames', (_event, gameIds: string[]) => {
      // Start targeted sync in background for auto-sync after import
      const syncPromise = this.artworkService.syncGames(gameIds);
      syncPromise.catch((error) => {
        ipcLog.error('Artwork sync for imported games failed:', error);
        forwardEvent('artwork:syncError', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return { success: true };
    });

    ipcMain.handle('artwork:cancelSync', () => {
      this.artworkService.cancelSync();
      return { success: true };
    });

    ipcMain.handle('artwork:getSyncStatus', () => {
      return this.artworkService.getSyncStatus();
    });

    ipcMain.handle('artwork:getCredentials', () => {
      return { hasCredentials: this.artworkService.hasCredentials() };
    });

    ipcMain.handle('artwork:setCredentials', async (_event, userId: string, userPassword: string) => {
      try {
        // Validate credentials against ScreenScraper before saving
        const validation = await this.artworkService.validateCredentials(userId, userPassword);
        if (!validation.valid) {
          return { success: false, error: validation.error, errorCode: validation.errorCode };
        }

        await this.artworkService.setCredentials(userId, userPassword);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('artwork:clearCredentials', async () => {
      try {
        await this.artworkService.clearCredentials();
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });
  }

  private setupDialogHandlers(): void {
    // Handle resume game dialog response from renderer
    ipcMain.on('dialog:resumeGameResponse', (event, requestId: string, shouldResume: boolean) => {
      const resolver = this.pendingResumeDialogs.get(requestId);
      if (resolver) {
        resolver(shouldResume);
        this.pendingResumeDialogs.delete(requestId);
      }
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
  }

  /**
   * Show a custom resume game dialog in the renderer and wait for response.
   */
  private showResumeGameDialog(window: BrowserWindow, gameTitle: string): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = `resume-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.pendingResumeDialogs.set(requestId, resolve);

      window.webContents.send('dialog:showResumeGame', {
        requestId,
        gameTitle,
      });

      // Timeout fallback: if no response after 30 seconds, default to not resuming
      setTimeout(() => {
        if (this.pendingResumeDialogs.has(requestId)) {
          this.pendingResumeDialogs.delete(requestId);
          resolve(false);
        }
      }, 30000);
    });
  }
}