import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { CoreManager } from '../core/CoreManager';
import { CoreOptions } from '../core/CoreManager';

export class IPCHandlers {
  private coreManager: CoreManager;

  constructor() {
    this.coreManager = new CoreManager();
    this.setupHandlers();
    this.setupCoreEventForwarding();
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
      const windows = require('electron').BrowserWindow.getAllWindows();
      windows.forEach(window => {
        window.webContents.send('video:frame', frame);
      });
    });

    // Forward audio samples to renderer
    this.coreManager.on('audioSamples', (samples) => {
      const windows = require('electron').BrowserWindow.getAllWindows();
      windows.forEach(window => {
        window.webContents.send('audio:samples', samples);
      });
    });

    // Forward state changes
    this.coreManager.on('stateChanged', (data) => {
      const windows = require('electron').BrowserWindow.getAllWindows();
      windows.forEach(window => {
        window.webContents.send('core:stateChanged', data);
      });
    });

    // Forward errors
    this.coreManager.on('error', (error) => {
      const windows = require('electron').BrowserWindow.getAllWindows();
      windows.forEach(window => {
        window.webContents.send('core:error', error);
      });
    });
  }
}