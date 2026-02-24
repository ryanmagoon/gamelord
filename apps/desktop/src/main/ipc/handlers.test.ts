import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Mocks — vi.mock calls are hoisted above imports by vitest
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: {
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(() => []),
    fromWebContents: vi.fn(),
  },
  dialog: { showOpenDialog: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp/test') },
}));

vi.mock('fs');
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return { ...actual, default: actual };
});

vi.mock('../emulator/EmulatorManager');
vi.mock('../emulator/LibretroNativeCore');
vi.mock('../emulator/EmulationWorkerClient');
vi.mock('../emulator/resolveAddonPath');
vi.mock('../services/LibraryService');
vi.mock('../services/ArtworkService');
vi.mock('../GameWindowManager');
vi.mock('../logger', () => ({
  ipcLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import { EmulatorManager } from '../emulator/EmulatorManager';
import { EmulationWorkerClient } from '../emulator/EmulationWorkerClient';
import { resolveAddonPath } from '../emulator/resolveAddonPath';
import { LibraryService } from '../services/LibraryService';
import { GameWindowManager } from '../GameWindowManager';
import { IPCHandlers } from './handlers';
import type { Game, GameSystem } from '../../types/library';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a registered ipcMain.handle handler by channel name.
 */
function getHandler(channel: string): ((...args: any[]) => any) | undefined {
  const calls = vi.mocked(ipcMain.handle).mock.calls;
  const match = calls.find(([ch]) => ch === channel);
  return match?.[1] as ((...args: any[]) => any) | undefined;
}

/**
 * Extract a registered ipcMain.on listener by channel name.
 */
function getOnListener(channel: string): ((...args: any[]) => any) | undefined {
  const calls = vi.mocked(ipcMain.on).mock.calls;
  const match = calls.find(([ch]) => ch === channel);
  return match?.[1] as ((...args: any[]) => any) | undefined;
}

/** Stub IpcMainInvokeEvent */
const fakeEvent = {} as any;

// ---------------------------------------------------------------------------
// Test-level state
// ---------------------------------------------------------------------------

let emulatorManagerInstance: any;
let libraryServiceInstance: any;
let gameWindowManagerInstance: any;
let workerClientInstance: any;
let emulatorEmitter: EventEmitter;

const fakeAvInfo = {
  geometry: { baseWidth: 256, baseHeight: 240, maxWidth: 256, maxHeight: 240, aspectRatio: 1.333 },
  timing: { fps: 60, sampleRate: 44100 },
};

beforeEach(() => {
  // Reset mock call history but preserve auto-mock structure
  vi.resetAllMocks();

  // Re-apply electron mock defaults that resetAllMocks wipes
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([]);
  vi.mocked(app).getPath = vi.fn(() => '/tmp/test');

  // Fresh EventEmitter for EmulatorManager event forwarding
  emulatorEmitter = new EventEmitter();

  // Configure EmulatorManager mock constructor
  vi.mocked(EmulatorManager).mockImplementation(function (this: Record<string, unknown>) {
    emulatorManagerInstance = Object.assign(this, {
      on: emulatorEmitter.on.bind(emulatorEmitter),
      emit: emulatorEmitter.emit.bind(emulatorEmitter),
      removeListener: emulatorEmitter.removeListener.bind(emulatorEmitter),
      getCoresForSystem: vi.fn(),
      getCoreDownloader: vi.fn(() => ({ downloadCore: vi.fn() })),
      launchGame: vi.fn(),
      stopEmulator: vi.fn(),
      getAvailableEmulators: vi.fn(),
      isEmulatorRunning: vi.fn(),
      isNativeMode: vi.fn(() => false),
      getCurrentEmulator: vi.fn(),
      getCurrentEmulatorPid: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      reset: vi.fn(),
      saveState: vi.fn(),
      loadState: vi.fn(),
      screenshot: vi.fn(),
      setWorkerClient: vi.fn(),
    });
    return emulatorManagerInstance;
  } as any);

  // Configure EmulationWorkerClient mock constructor
  vi.mocked(EmulationWorkerClient).mockImplementation(function (this: Record<string, unknown>) {
    workerClientInstance = Object.assign(this, {
      init: vi.fn().mockResolvedValue(fakeAvInfo),
      setInput: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      reset: vi.fn(),
      saveState: vi.fn().mockResolvedValue(undefined),
      loadState: vi.fn().mockResolvedValue(undefined),
      saveSram: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn(() => true),
      on: vi.fn(),
    });
    return workerClientInstance;
  } as any);

  // Configure resolveAddonPath mock
  vi.mocked(resolveAddonPath).mockReturnValue('/fake/addon.node');

  // Configure LibraryService mock constructor
  vi.mocked(LibraryService).mockImplementation(function (this: Record<string, unknown>) {
    libraryServiceInstance = Object.assign(this, {
      getSystems: vi.fn(() => []),
      addSystem: vi.fn(),
      removeSystem: vi.fn(),
      updateSystemPath: vi.fn(),
      getGames: vi.fn(() => []),
      addGame: vi.fn(),
      removeGame: vi.fn(),
      updateGame: vi.fn(),
      scanDirectory: vi.fn(),
      scanSystemFolders: vi.fn(),
      getConfig: vi.fn(),
      setRomsBasePath: vi.fn(),
    });
    return libraryServiceInstance;
  } as any);

  // Configure GameWindowManager mock constructor
  vi.mocked(GameWindowManager).mockImplementation(function (this: Record<string, unknown>) {
    gameWindowManagerInstance = Object.assign(this, {
      createNativeGameWindow: vi.fn(),
      createGameWindow: vi.fn(),
      startTrackingRetroArchWindow: vi.fn(),
    });
    gameWindowManagerInstance.on = vi.fn(() => gameWindowManagerInstance);
    return gameWindowManagerInstance;
  } as any);

  // Instantiate IPCHandlers — triggers all handler registrations
  new IPCHandlers('/fake/preload.js');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IPCHandlers', () => {
  // -----------------------------------------------------------------------
  // 1. Registration
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('registers all expected IPC channels', () => {
      const handleCalls = vi.mocked(ipcMain.handle).mock.calls.map(([ch]) => ch);
      const onCalls = vi.mocked(ipcMain.on).mock.calls.map(([ch]) => ch);

      const expectedHandleChannels = [
        'emulator:getCoresForSystem',
        'emulator:downloadCore',
        'emulator:launch',
        'emulator:stop',
        'emulator:getAvailable',
        'emulator:isRunning',
        'emulation:pause',
        'emulation:resume',
        'emulation:reset',
        'emulation:setSpeed',
        'savestate:save',
        'savestate:load',
        'emulation:screenshot',
        'library:getSystems',
        'library:addSystem',
        'library:removeSystem',
        'library:updateSystemPath',
        'library:getGames',
        'library:addGame',
        'library:removeGame',
        'library:updateGame',
        'library:scanDirectory',
        'library:scanSystemFolders',
        'library:getConfig',
        'library:setRomsBasePath',
        'dialog:selectDirectory',
        'dialog:selectRomFile',
      ];

      for (const channel of expectedHandleChannels) {
        expect(handleCalls, `Missing handle channel: ${channel}`).toContain(channel);
      }

      expect(onCalls).toContain('dialog:resumeGameResponse');
    });

    it('registers exactly the expected number of handle channels', () => {
      const handleCalls = vi.mocked(ipcMain.handle).mock.calls;
      expect(handleCalls).toHaveLength(35);
    });
  });

  // -----------------------------------------------------------------------
  // 2. emulator:getCoresForSystem
  // -----------------------------------------------------------------------
  describe('emulator:getCoresForSystem', () => {
    it('delegates to EmulatorManager.getCoresForSystem', async () => {
      const cores = [{ name: 'fceumm', installed: true }];
      emulatorManagerInstance.getCoresForSystem.mockReturnValue(cores);

      const handler = getHandler('emulator:getCoresForSystem')!;
      const result = await handler(fakeEvent, 'nes');

      expect(emulatorManagerInstance.getCoresForSystem).toHaveBeenCalledWith('nes');
      expect(result).toEqual(cores);
    });
  });

  // -----------------------------------------------------------------------
  // 3-4. emulator:downloadCore
  // -----------------------------------------------------------------------
  describe('emulator:downloadCore', () => {
    it('returns success with corePath on successful download', async () => {
      const downloadMock = vi.fn().mockResolvedValue('/cores/fceumm.dylib');
      emulatorManagerInstance.getCoreDownloader.mockReturnValue({ downloadCore: downloadMock });

      const handler = getHandler('emulator:downloadCore')!;
      const result = await handler(fakeEvent, 'fceumm', 'nes');

      expect(downloadMock).toHaveBeenCalledWith('fceumm', 'nes');
      expect(result).toEqual({ success: true, corePath: '/cores/fceumm.dylib' });
    });

    it('returns { success: false, error } on failure', async () => {
      const downloadMock = vi.fn().mockRejectedValue(new Error('Network error'));
      emulatorManagerInstance.getCoreDownloader.mockReturnValue({ downloadCore: downloadMock });

      const handler = getHandler('emulator:downloadCore')!;
      const result = await handler(fakeEvent, 'fceumm', 'nes');

      expect(result).toEqual({ success: false, error: 'Network error' });
    });
  });

  // -----------------------------------------------------------------------
  // 5-6. emulator:launch
  // -----------------------------------------------------------------------
  describe('emulator:launch', () => {
    const fakeGame: Game = {
      id: 'game-1',
      title: 'Super Mario Bros',
      system: 'NES',
      systemId: 'nes',
      romPath: '/roms/smb.nes',
      romHashes: { crc32: 'deadbeef', sha1: 'a'.repeat(40), md5: 'b'.repeat(32) },
    };

    it('launches in native mode successfully', async () => {
      libraryServiceInstance.getGames.mockReturnValue([fakeGame]);
      emulatorManagerInstance.launchGame.mockResolvedValue(undefined);
      emulatorManagerInstance.isNativeMode.mockReturnValue(true);

      const nativeCoreMock = {
        hasAutoSave: vi.fn(() => false),
        deleteAutoSave: vi.fn(),
        getCorePath: vi.fn(() => '/cores/fceumm.dylib'),
        getRomPath: vi.fn(() => '/roms/smb.nes'),
        getSystemDir: vi.fn(() => '/bios'),
        getSaveDir: vi.fn(() => '/saves'),
        getSramDir: vi.fn(() => '/saves'),
        getSaveStatesDir: vi.fn(() => '/savestates'),
      };
      emulatorManagerInstance.getCurrentEmulator.mockReturnValue(nativeCoreMock);
      gameWindowManagerInstance.createNativeGameWindow.mockReturnValue({});

      const handler = getHandler('emulator:launch')!;
      const result = await handler(fakeEvent, '/roms/smb.nes', 'nes', undefined, 'fceumm');

      expect(libraryServiceInstance.getGames).toHaveBeenCalledWith('nes');
      expect(emulatorManagerInstance.launchGame).toHaveBeenCalledWith(
        '/roms/smb.nes', 'nes', undefined, undefined, 'fceumm',
      );
      // Worker client should have been initialized with paths from the native core
      expect(workerClientInstance.init).toHaveBeenCalledWith({
        corePath: '/cores/fceumm.dylib',
        romPath: '/roms/smb.nes',
        systemDir: '/bios',
        saveDir: '/saves',
        sramDir: '/saves',
        saveStatesDir: '/savestates',
        addonPath: '/fake/addon.node',
      });
      expect(emulatorManagerInstance.setWorkerClient).toHaveBeenCalledWith(workerClientInstance);
      expect(gameWindowManagerInstance.createNativeGameWindow).toHaveBeenCalledWith(
        fakeGame, workerClientInstance, fakeAvInfo, false, undefined,
      );
      expect(result).toEqual({ success: true });
    });

    it('launches in legacy overlay mode successfully', async () => {
      libraryServiceInstance.getGames.mockReturnValue([fakeGame]);
      emulatorManagerInstance.launchGame.mockResolvedValue(undefined);
      emulatorManagerInstance.isNativeMode.mockReturnValue(false);
      emulatorManagerInstance.getCurrentEmulatorPid.mockReturnValue(12345);

      const handler = getHandler('emulator:launch')!;
      const result = await handler(fakeEvent, '/roms/smb.nes', 'nes', 'retroarch');

      expect(gameWindowManagerInstance.createGameWindow).toHaveBeenCalledWith(fakeGame);
      expect(gameWindowManagerInstance.startTrackingRetroArchWindow).toHaveBeenCalledWith('game-1', 12345);
      expect(result).toEqual({ success: true });
    });

    it('returns error when game is not found in library', async () => {
      libraryServiceInstance.getGames.mockReturnValue([]);

      const handler = getHandler('emulator:launch')!;
      const result = await handler(fakeEvent, '/roms/missing.nes', 'nes');

      expect(result).toEqual({ success: false, error: 'Game not found in library' });
    });

    it('returns error when launchGame throws', async () => {
      libraryServiceInstance.getGames.mockReturnValue([fakeGame]);
      emulatorManagerInstance.launchGame.mockRejectedValue(new Error('Core not found'));

      const handler = getHandler('emulator:launch')!;
      const result = await handler(fakeEvent, '/roms/smb.nes', 'nes');

      expect(result).toEqual({ success: false, error: 'Core not found' });
    });

    it('does not track RetroArch window when PID is unavailable', async () => {
      libraryServiceInstance.getGames.mockReturnValue([fakeGame]);
      emulatorManagerInstance.launchGame.mockResolvedValue(undefined);
      emulatorManagerInstance.isNativeMode.mockReturnValue(false);
      emulatorManagerInstance.getCurrentEmulatorPid.mockReturnValue(undefined);

      const handler = getHandler('emulator:launch')!;
      const result = await handler(fakeEvent, '/roms/smb.nes', 'nes', 'retroarch');

      expect(gameWindowManagerInstance.createGameWindow).toHaveBeenCalledWith(fakeGame);
      expect(gameWindowManagerInstance.startTrackingRetroArchWindow).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  // -----------------------------------------------------------------------
  // 7. emulator:stop
  // -----------------------------------------------------------------------
  describe('emulator:stop', () => {
    it('returns success on successful stop', async () => {
      emulatorManagerInstance.stopEmulator.mockResolvedValue(undefined);

      const handler = getHandler('emulator:stop')!;
      const result = await handler(fakeEvent);

      expect(emulatorManagerInstance.stopEmulator).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('returns error on failure', async () => {
      emulatorManagerInstance.stopEmulator.mockRejectedValue(new Error('Stop failed'));

      const handler = getHandler('emulator:stop')!;
      const result = await handler(fakeEvent);

      expect(result).toEqual({ success: false, error: 'Stop failed' });
    });
  });

  // -----------------------------------------------------------------------
  // 8. emulator:getAvailable
  // -----------------------------------------------------------------------
  describe('emulator:getAvailable', () => {
    it('delegates to EmulatorManager.getAvailableEmulators', () => {
      const emulators = [{ id: 'retroarch', name: 'RetroArch' }];
      emulatorManagerInstance.getAvailableEmulators.mockReturnValue(emulators);

      const handler = getHandler('emulator:getAvailable')!;
      const result = handler(fakeEvent);

      expect(emulatorManagerInstance.getAvailableEmulators).toHaveBeenCalled();
      expect(result).toEqual(emulators);
    });
  });

  // -----------------------------------------------------------------------
  // 9. emulator:isRunning
  // -----------------------------------------------------------------------
  describe('emulator:isRunning', () => {
    it('delegates to EmulatorManager.isEmulatorRunning', () => {
      emulatorManagerInstance.isEmulatorRunning.mockReturnValue(true);

      const handler = getHandler('emulator:isRunning')!;
      const result = handler(fakeEvent);

      expect(emulatorManagerInstance.isEmulatorRunning).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 10. emulation:pause
  // -----------------------------------------------------------------------
  describe('emulation:pause', () => {
    it('returns success when pause succeeds', async () => {
      emulatorManagerInstance.pause.mockResolvedValue(undefined);

      const handler = getHandler('emulation:pause')!;
      const result = await handler(fakeEvent);

      expect(emulatorManagerInstance.pause).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('returns error when pause fails', async () => {
      emulatorManagerInstance.pause.mockRejectedValue(new Error('No emulator running'));

      const handler = getHandler('emulation:pause')!;
      const result = await handler(fakeEvent);

      expect(result).toEqual({ success: false, error: 'No emulator running' });
    });
  });

  // -----------------------------------------------------------------------
  // 11. emulation:resume
  // -----------------------------------------------------------------------
  describe('emulation:resume', () => {
    it('returns success when resume succeeds', async () => {
      emulatorManagerInstance.resume.mockResolvedValue(undefined);

      const handler = getHandler('emulation:resume')!;
      const result = await handler(fakeEvent);

      expect(emulatorManagerInstance.resume).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('returns error when resume fails', async () => {
      emulatorManagerInstance.resume.mockRejectedValue(new Error('No emulator running'));

      const handler = getHandler('emulation:resume')!;
      const result = await handler(fakeEvent);

      expect(result).toEqual({ success: false, error: 'No emulator running' });
    });
  });

  // -----------------------------------------------------------------------
  // 12. emulation:reset
  // -----------------------------------------------------------------------
  describe('emulation:reset', () => {
    it('returns success when reset succeeds', async () => {
      emulatorManagerInstance.reset.mockResolvedValue(undefined);

      const handler = getHandler('emulation:reset')!;
      const result = await handler(fakeEvent);

      expect(emulatorManagerInstance.reset).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('returns error when reset fails', async () => {
      emulatorManagerInstance.reset.mockRejectedValue(new Error('No emulator running'));

      const handler = getHandler('emulation:reset')!;
      const result = await handler(fakeEvent);

      expect(result).toEqual({ success: false, error: 'No emulator running' });
    });
  });

  // -----------------------------------------------------------------------
  // 12b. emulation:setSpeed
  // -----------------------------------------------------------------------
  describe('emulation:setSpeed', () => {
    it('returns success when setSpeed succeeds', async () => {
      emulatorManagerInstance.setSpeed = vi.fn();

      const handler = getHandler('emulation:setSpeed')!;
      const result = await handler(fakeEvent, 2);

      expect(emulatorManagerInstance.setSpeed).toHaveBeenCalledWith(2);
      expect(result).toEqual({ success: true });
    });

    it('returns error when setSpeed fails', async () => {
      emulatorManagerInstance.setSpeed = vi.fn(() => {
        throw new Error('No emulator running');
      });

      const handler = getHandler('emulation:setSpeed')!;
      const result = await handler(fakeEvent, 4);

      expect(result).toEqual({ success: false, error: 'No emulator running' });
    });
  });

  // -----------------------------------------------------------------------
  // 13. savestate:save
  // -----------------------------------------------------------------------
  describe('savestate:save', () => {
    it('returns success when save state succeeds', async () => {
      emulatorManagerInstance.saveState.mockResolvedValue(undefined);

      const handler = getHandler('savestate:save')!;
      const result = await handler(fakeEvent, 2);

      expect(emulatorManagerInstance.saveState).toHaveBeenCalledWith(2);
      expect(result).toEqual({ success: true });
    });

    it('returns error when save state fails', async () => {
      emulatorManagerInstance.saveState.mockRejectedValue(new Error('Save failed'));

      const handler = getHandler('savestate:save')!;
      const result = await handler(fakeEvent, 1);

      expect(result).toEqual({ success: false, error: 'Save failed' });
    });
  });

  // -----------------------------------------------------------------------
  // 14. savestate:load
  // -----------------------------------------------------------------------
  describe('savestate:load', () => {
    it('returns success when load state succeeds', async () => {
      emulatorManagerInstance.loadState.mockResolvedValue(undefined);

      const handler = getHandler('savestate:load')!;
      const result = await handler(fakeEvent, 3);

      expect(emulatorManagerInstance.loadState).toHaveBeenCalledWith(3);
      expect(result).toEqual({ success: true });
    });

    it('returns error when load state fails', async () => {
      emulatorManagerInstance.loadState.mockRejectedValue(new Error('Slot empty'));

      const handler = getHandler('savestate:load')!;
      const result = await handler(fakeEvent, 0);

      expect(result).toEqual({ success: false, error: 'Slot empty' });
    });
  });

  // -----------------------------------------------------------------------
  // 15. emulation:screenshot
  // -----------------------------------------------------------------------
  describe('emulation:screenshot', () => {
    it('returns success with path when screenshot succeeds', async () => {
      emulatorManagerInstance.screenshot.mockResolvedValue('/screenshots/screen.png');

      const handler = getHandler('emulation:screenshot')!;
      const result = await handler(fakeEvent, '/screenshots/screen.png');

      expect(emulatorManagerInstance.screenshot).toHaveBeenCalledWith('/screenshots/screen.png');
      expect(result).toEqual({ success: true, path: '/screenshots/screen.png' });
    });

    it('uses default output path when none provided', async () => {
      emulatorManagerInstance.screenshot.mockResolvedValue('/tmp/default.png');

      const handler = getHandler('emulation:screenshot')!;
      const result = await handler(fakeEvent);

      expect(emulatorManagerInstance.screenshot).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ success: true, path: '/tmp/default.png' });
    });

    it('returns error when screenshot fails', async () => {
      emulatorManagerInstance.screenshot.mockRejectedValue(new Error('No emulator running'));

      const handler = getHandler('emulation:screenshot')!;
      const result = await handler(fakeEvent);

      expect(result).toEqual({ success: false, error: 'No emulator running' });
    });
  });

  // -----------------------------------------------------------------------
  // 16. library:getSystems
  // -----------------------------------------------------------------------
  describe('library:getSystems', () => {
    it('delegates to LibraryService.getSystems', () => {
      const systems: GameSystem[] = [
        { id: 'nes', name: 'NES', shortName: 'NES', extensions: ['.nes'] },
      ];
      libraryServiceInstance.getSystems.mockReturnValue(systems);

      const handler = getHandler('library:getSystems')!;
      const result = handler(fakeEvent);

      expect(libraryServiceInstance.getSystems).toHaveBeenCalled();
      expect(result).toEqual(systems);
    });
  });

  // -----------------------------------------------------------------------
  // 17. library:addSystem
  // -----------------------------------------------------------------------
  describe('library:addSystem', () => {
    it('delegates to LibraryService.addSystem and returns success', async () => {
      const newSystem: GameSystem = {
        id: 'gba',
        name: 'Game Boy Advance',
        shortName: 'GBA',
        extensions: ['.gba'],
      };
      libraryServiceInstance.addSystem.mockResolvedValue(undefined);

      const handler = getHandler('library:addSystem')!;
      const result = await handler(fakeEvent, newSystem);

      expect(libraryServiceInstance.addSystem).toHaveBeenCalledWith(newSystem);
      expect(result).toEqual({ success: true });
    });
  });

  // -----------------------------------------------------------------------
  // 18. library:removeSystem
  // -----------------------------------------------------------------------
  describe('library:removeSystem', () => {
    it('delegates to LibraryService.removeSystem and returns success', async () => {
      libraryServiceInstance.removeSystem.mockResolvedValue(undefined);

      const handler = getHandler('library:removeSystem')!;
      const result = await handler(fakeEvent, 'nes');

      expect(libraryServiceInstance.removeSystem).toHaveBeenCalledWith('nes');
      expect(result).toEqual({ success: true });
    });
  });

  // -----------------------------------------------------------------------
  // library:updateSystemPath
  // -----------------------------------------------------------------------
  describe('library:updateSystemPath', () => {
    it('delegates to LibraryService.updateSystemPath and returns success', async () => {
      libraryServiceInstance.updateSystemPath.mockResolvedValue(undefined);

      const handler = getHandler('library:updateSystemPath')!;
      const result = await handler(fakeEvent, 'nes', '/roms/nes');

      expect(libraryServiceInstance.updateSystemPath).toHaveBeenCalledWith('nes', '/roms/nes');
      expect(result).toEqual({ success: true });
    });
  });

  // -----------------------------------------------------------------------
  // 19. library:getGames
  // -----------------------------------------------------------------------
  describe('library:getGames', () => {
    it('delegates with systemId filter', () => {
      const games = [{ id: 'g1', title: 'SMB', systemId: 'nes' }];
      libraryServiceInstance.getGames.mockReturnValue(games);

      const handler = getHandler('library:getGames')!;
      const result = handler(fakeEvent, 'nes');

      expect(libraryServiceInstance.getGames).toHaveBeenCalledWith('nes');
      expect(result).toEqual(games);
    });

    it('delegates without systemId to get all games', () => {
      libraryServiceInstance.getGames.mockReturnValue([]);

      const handler = getHandler('library:getGames')!;
      const result = handler(fakeEvent);

      expect(libraryServiceInstance.getGames).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // 20. library:addGame
  // -----------------------------------------------------------------------
  describe('library:addGame', () => {
    it('delegates to LibraryService.addGame and returns the game', async () => {
      const game = { id: 'g1', title: 'Zelda', systemId: 'nes', romPath: '/roms/zelda.nes' };
      libraryServiceInstance.addGame.mockResolvedValue(game);

      const handler = getHandler('library:addGame')!;
      const result = await handler(fakeEvent, '/roms/zelda.nes', 'nes');

      expect(libraryServiceInstance.addGame).toHaveBeenCalledWith('/roms/zelda.nes', 'nes');
      expect(result).toEqual(game);
    });
  });

  // -----------------------------------------------------------------------
  // library:removeGame
  // -----------------------------------------------------------------------
  describe('library:removeGame', () => {
    it('delegates to LibraryService.removeGame and returns success', async () => {
      libraryServiceInstance.removeGame.mockResolvedValue(undefined);

      const handler = getHandler('library:removeGame')!;
      const result = await handler(fakeEvent, 'game-123');

      expect(libraryServiceInstance.removeGame).toHaveBeenCalledWith('game-123');
      expect(result).toEqual({ success: true });
    });
  });

  // -----------------------------------------------------------------------
  // library:updateGame
  // -----------------------------------------------------------------------
  describe('library:updateGame', () => {
    it('delegates to LibraryService.updateGame and returns success', async () => {
      libraryServiceInstance.updateGame.mockResolvedValue(undefined);

      const handler = getHandler('library:updateGame')!;
      const result = await handler(fakeEvent, 'game-123', { favorite: true });

      expect(libraryServiceInstance.updateGame).toHaveBeenCalledWith('game-123', { favorite: true });
      expect(result).toEqual({ success: true });
    });
  });

  // -----------------------------------------------------------------------
  // 21. library:scanDirectory
  // -----------------------------------------------------------------------
  describe('library:scanDirectory', () => {
    it('delegates with directory and optional systemId', async () => {
      const games = [{ id: 'g1', title: 'SMB' }];
      libraryServiceInstance.scanDirectory.mockResolvedValue(games);

      const handler = getHandler('library:scanDirectory')!;
      const result = await handler(fakeEvent, '/roms', 'nes');

      expect(libraryServiceInstance.scanDirectory).toHaveBeenCalledWith('/roms', 'nes');
      expect(result).toEqual(games);
    });

    it('delegates without systemId', async () => {
      libraryServiceInstance.scanDirectory.mockResolvedValue([]);

      const handler = getHandler('library:scanDirectory')!;
      const result = await handler(fakeEvent, '/roms');

      expect(libraryServiceInstance.scanDirectory).toHaveBeenCalledWith('/roms', undefined);
      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // library:scanSystemFolders
  // -----------------------------------------------------------------------
  describe('library:scanSystemFolders', () => {
    it('delegates to LibraryService.scanSystemFolders', async () => {
      const games = [{ id: 'g1', title: 'SMB' }];
      libraryServiceInstance.scanSystemFolders.mockResolvedValue(games);

      const handler = getHandler('library:scanSystemFolders')!;
      const result = await handler(fakeEvent);

      expect(libraryServiceInstance.scanSystemFolders).toHaveBeenCalled();
      expect(result).toEqual(games);
    });
  });

  // -----------------------------------------------------------------------
  // library:getConfig
  // -----------------------------------------------------------------------
  describe('library:getConfig', () => {
    it('delegates to LibraryService.getConfig', () => {
      const config = { systems: [], romsBasePath: '/roms' };
      libraryServiceInstance.getConfig.mockReturnValue(config);

      const handler = getHandler('library:getConfig')!;
      const result = handler(fakeEvent);

      expect(libraryServiceInstance.getConfig).toHaveBeenCalled();
      expect(result).toEqual(config);
    });
  });

  // -----------------------------------------------------------------------
  // library:setRomsBasePath
  // -----------------------------------------------------------------------
  describe('library:setRomsBasePath', () => {
    it('delegates to LibraryService.setRomsBasePath and returns success', async () => {
      libraryServiceInstance.setRomsBasePath.mockResolvedValue(undefined);

      const handler = getHandler('library:setRomsBasePath')!;
      const result = await handler(fakeEvent, '/new/roms');

      expect(libraryServiceInstance.setRomsBasePath).toHaveBeenCalledWith('/new/roms');
      expect(result).toEqual({ success: true });
    });
  });

  // -----------------------------------------------------------------------
  // 22. dialog:selectDirectory
  // -----------------------------------------------------------------------
  describe('dialog:selectDirectory', () => {
    it('returns the selected directory path', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/selected/directory'],
      });

      const handler = getHandler('dialog:selectDirectory')!;
      const result = await handler(fakeEvent);

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory'],
        title: 'Select ROMs Directory',
      });
      expect(result).toBe('/selected/directory');
    });

    it('returns null when dialog is canceled', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const handler = getHandler('dialog:selectDirectory')!;
      const result = await handler(fakeEvent);

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 23. dialog:selectRomFile
  // -----------------------------------------------------------------------
  describe('dialog:selectRomFile', () => {
    it('filters by system extensions when system is found', async () => {
      const nesSystem: GameSystem = {
        id: 'nes',
        name: 'Nintendo Entertainment System',
        shortName: 'NES',
        extensions: ['.nes', '.fds'],
      };
      libraryServiceInstance.getSystems.mockReturnValue([nesSystem]);

      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/roms/smb.nes'],
      });

      const handler = getHandler('dialog:selectRomFile')!;
      const result = await handler(fakeEvent, 'nes');

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openFile'],
        title: 'Select ROM File',
        filters: [
          {
            name: 'Nintendo Entertainment System ROMs',
            extensions: ['nes', 'fds', 'zip'],
          },
        ],
      });
      expect(result).toBe('/roms/smb.nes');
    });

    it('uses empty filters when system is not found', async () => {
      libraryServiceInstance.getSystems.mockReturnValue([]);

      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: ['/roms/game.rom'],
      });

      const handler = getHandler('dialog:selectRomFile')!;
      const result = await handler(fakeEvent, 'unknown');

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openFile'],
        title: 'Select ROM File',
        filters: [],
      });
      expect(result).toBe('/roms/game.rom');
    });

    it('returns null when dialog is canceled', async () => {
      libraryServiceInstance.getSystems.mockReturnValue([]);

      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const handler = getHandler('dialog:selectRomFile')!;
      const result = await handler(fakeEvent, 'nes');

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 24. Event forwarding
  // -----------------------------------------------------------------------
  describe('event forwarding', () => {
    it('forwards emulatorManager events to all BrowserWindows', () => {
      const sendMock = vi.fn();
      const fakeWindow = { webContents: { send: sendMock } };
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([fakeWindow as any]);

      const forwardedEvents = [
        { emitterEvent: 'gameLaunched', ipcEvent: 'emulator:launched', data: { romPath: '/rom' } },
        { emitterEvent: 'emulator:exited', ipcEvent: 'emulator:exited', data: { code: 0 } },
        { emitterEvent: 'emulator:error', ipcEvent: 'emulator:error', data: { message: 'oops' } },
        { emitterEvent: 'emulator:stateSaved', ipcEvent: 'emulator:stateSaved', data: { slot: 1 } },
        { emitterEvent: 'emulator:stateLoaded', ipcEvent: 'emulator:stateLoaded', data: { slot: 1 } },
        { emitterEvent: 'emulator:screenshotTaken', ipcEvent: 'emulator:screenshotTaken', data: { path: '/img.png' } },
        { emitterEvent: 'emulator:paused', ipcEvent: 'emulator:paused', data: undefined },
        { emitterEvent: 'emulator:resumed', ipcEvent: 'emulator:resumed', data: undefined },
        { emitterEvent: 'emulator:reset', ipcEvent: 'emulator:reset', data: undefined },
        { emitterEvent: 'emulator:speedChanged', ipcEvent: 'emulator:speedChanged', data: { multiplier: 2 } },
        { emitterEvent: 'emulator:terminated', ipcEvent: 'emulator:terminated', data: undefined },
        { emitterEvent: 'core:downloadProgress', ipcEvent: 'core:downloadProgress', data: { percent: 50 } },
      ];

      for (const { emitterEvent, ipcEvent, data } of forwardedEvents) {
        sendMock.mockClear();
        emulatorEmitter.emit(emitterEvent, data);
        expect(sendMock).toHaveBeenCalledWith(ipcEvent, data);
      }
    });

    it('forwards events to multiple windows', () => {
      const send1 = vi.fn();
      const send2 = vi.fn();
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
        { webContents: { send: send1 } } as any,
        { webContents: { send: send2 } } as any,
      ]);

      emulatorEmitter.emit('emulator:paused');

      expect(send1).toHaveBeenCalledWith('emulator:paused', undefined);
      expect(send2).toHaveBeenCalledWith('emulator:paused', undefined);
    });
  });

  // -----------------------------------------------------------------------
  // 25. dialog:resumeGameResponse (ipcMain.on)
  // -----------------------------------------------------------------------
  describe('dialog:resumeGameResponse', () => {
    it('registers the resumeGameResponse listener', () => {
      const listener = getOnListener('dialog:resumeGameResponse');
      expect(listener).toBeDefined();
    });

    it('does not throw when called with an unknown requestId', () => {
      const listener = getOnListener('dialog:resumeGameResponse')!;
      expect(() => listener(fakeEvent, 'unknown-id', true)).not.toThrow();
    });
  });
});
