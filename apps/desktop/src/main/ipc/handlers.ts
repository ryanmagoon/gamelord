import { ipcMain, IpcMainInvokeEvent, BrowserWindow, dialog } from 'electron';
import { CoreManager } from '../core/CoreManager';
import { CoreOptions } from '../core/CoreManager';
import { LibraryService } from '../services/LibraryService';
import { GameSystem } from '../../types/library';

export class IPCHandlers {
  private coreManager: CoreManager;
  private libraryService: LibraryService;

  constructor() {
    this.coreManager = new CoreManager();
    this.libraryService = new LibraryService();
    this.setupHandlers();
    this.setupCoreEventForwarding();
    this.setupLibraryHandlers();
  }

  private setupHandlers(): void {
    // Core management
    ipcMain.handle('core:load', async (event: IpcMainInvokeEvent, options: CoreOptions) => {
      try {
        await this.coreManager.loadCore(options);
        return { success: true };
      } catch (error) {
        console.error('Failed to load core:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('core:unload', async () => {
      try {
        await this.coreManager.unloadCore();
        return { success: true };
      } catch (error) {
        console.error('Failed to unload core:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Emulation control
    ipcMain.handle('emulation:pause', () => {
      this.coreManager.pauseEmulation();
      return { success: true };
    });

    ipcMain.handle('emulation:resume', () => {
      this.coreManager.resumeEmulation();
      return { success: true };
    });

    // Save states
    ipcMain.handle('savestate:save', (event, slot: number) => {
      this.coreManager.saveState(slot);
      return { success: true };
    });

    ipcMain.handle('savestate:load', (event, slot: number) => {
      this.coreManager.loadState(slot);
      return { success: true };
    });

    // Input handling
    ipcMain.on('input:button', (event, playerId: number, button: string, pressed: boolean) => {
      this.coreManager.sendInput(playerId, button, pressed);
    });
  }

  private setupCoreEventForwarding(): void {
    // Forward video frames to renderer
    this.coreManager.on('videoFrame', (frame) => {
      // Send to all renderer windows
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: BrowserWindow) => {
        window.webContents.send('video:frame', frame);
      });
    });

    // Forward audio samples to renderer
    this.coreManager.on('audioSamples', (samples) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: BrowserWindow) => {
        window.webContents.send('audio:samples', samples);
      });
    });

    // Forward state changes
    this.coreManager.on('stateChanged', (data) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: BrowserWindow) => {
        window.webContents.send('core:stateChanged', data);
      });
    });

    // Forward errors
    this.coreManager.on('error', (error) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window: BrowserWindow) => {
        window.webContents.send('core:error', error);
      });
    });
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
}