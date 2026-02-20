import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import * as path from 'path'

// --- Module mocks (must be hoisted before any imports that use them) ---

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((type: string) => {
      if (type === 'userData') return '/tmp/test-userdata'
      return '/tmp/test'
    }),
    getAppPath: vi.fn(() => '/tmp/test-app'),
  },
}))

vi.mock('../utils/pathValidation', () => ({
  validateRomPath: vi.fn((p: string) => p),
  validateCorePath: vi.fn((p: string) => p),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

import * as fs from 'fs'
import { LibretroNativeCore } from './LibretroNativeCore'
import { validateRomPath, validateCorePath } from '../utils/pathValidation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Access private/protected fields on a LibretroNativeCore for test injection. */
function internals(c: LibretroNativeCore) {
  return c as unknown as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LibretroNativeCore', () => {
  let core: LibretroNativeCore

  beforeEach(() => {
    vi.clearAllMocks()
    core = new LibretroNativeCore('/cores')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates save state, SRAM, and BIOS directories', () => {
      const mkdirSync = fs.mkdirSync as Mock
      expect(mkdirSync).toHaveBeenCalledWith(
        path.join('/tmp/test-userdata', 'savestates'),
        { recursive: true },
      )
      expect(mkdirSync).toHaveBeenCalledWith(
        path.join('/tmp/test-userdata', 'saves'),
        { recursive: true },
      )
      expect(mkdirSync).toHaveBeenCalledWith(
        path.join('/tmp/test-userdata', 'BIOS'),
        { recursive: true },
      )
    })

    it('inherits name and emulatorPath from EmulatorCore', () => {
      expect(core.name).toBe('LibretroNative')
      expect(core.emulatorPath).toBe('/cores')
    })
  })

  // -----------------------------------------------------------------------
  // launch()
  // -----------------------------------------------------------------------

  describe('launch', () => {
    it('throws if emulator is already running', async () => {
      internals(core).isRunning = true
      await expect(core.launch('/roms/game.nes', { corePath: '/cores/core.dylib' }))
        .rejects.toThrow('Emulator is already running')
    })

    it('throws if corePath is not provided', async () => {
      await expect(core.launch('/roms/game.nes'))
        .rejects.toThrow('Core path is required')
    })

    it('throws if corePath is explicitly undefined', async () => {
      await expect(core.launch('/roms/game.nes', {}))
        .rejects.toThrow('Core path is required')
    })

    it('validates paths and stores them for the worker', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await core.launch('/roms/TestGame.nes', { corePath: '/cores/snes9x.dylib' })

      expect(validateRomPath).toHaveBeenCalledWith('/roms/TestGame.nes')
      expect(validateCorePath).toHaveBeenCalledWith('/cores/snes9x.dylib', expect.any(Array))
      expect(core.isActive()).toBe(true)
    })

    it('emits launched event with validated paths', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      const launchedSpy = vi.fn()
      core.on('launched', launchedSpy)

      await core.launch('/roms/TestGame.nes', { corePath: '/cores/snes9x.dylib' })

      expect(launchedSpy).toHaveBeenCalledWith({
        romPath: '/roms/TestGame.nes',
        corePath: '/cores/snes9x.dylib',
      })
    })

    it('stores paths accessible via getters', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await core.launch('/roms/TestGame.nes', { corePath: '/cores/snes9x.dylib' })

      expect(core.getCorePath()).toBe('/cores/snes9x.dylib')
      expect(core.getRomPath()).toBe('/roms/TestGame.nes')
      expect(core.getSystemDir()).toBe(path.join('/tmp/test-userdata', 'BIOS'))
    })
  })

  // -----------------------------------------------------------------------
  // Path getters — before launch
  // -----------------------------------------------------------------------

  describe('path getters before launch', () => {
    it('getCorePath throws before launch', () => {
      expect(() => core.getCorePath()).toThrow('Core not launched')
    })

    it('getRomPath throws before launch', () => {
      expect(() => core.getRomPath()).toThrow('Core not launched')
    })

    it('getSystemDir throws before launch', () => {
      expect(() => core.getSystemDir()).toThrow('Core not launched')
    })

    it('getSaveDir returns the saves directory', () => {
      expect(core.getSaveDir()).toBe(path.join('/tmp/test-userdata', 'saves'))
    })

    it('getSramDir returns the saves directory', () => {
      expect(core.getSramDir()).toBe(path.join('/tmp/test-userdata', 'saves'))
    })

    it('getSaveStatesDir returns the savestates directory', () => {
      expect(core.getSaveStatesDir()).toBe(path.join('/tmp/test-userdata', 'savestates'))
    })
  })

  // -----------------------------------------------------------------------
  // Worker-delegated stubs
  // -----------------------------------------------------------------------

  describe('worker-delegated stubs', () => {
    it('saveState throws — handled by worker', async () => {
      await expect(core.saveState(0)).rejects.toThrow('handled by the emulation worker')
    })

    it('loadState throws — handled by worker', async () => {
      await expect(core.loadState(0)).rejects.toThrow('handled by the emulation worker')
    })

    it('screenshot throws — handled by worker', async () => {
      await expect(core.screenshot()).rejects.toThrow('handled by the emulation worker')
    })
  })

  // -----------------------------------------------------------------------
  // pause() / resume()
  // -----------------------------------------------------------------------

  describe('pause', () => {
    it('emits paused event', async () => {
      const spy = vi.fn()
      core.on('paused', spy)

      await core.pause()

      expect(spy).toHaveBeenCalledOnce()
    })
  })

  describe('resume', () => {
    it('emits resumed event', async () => {
      const spy = vi.fn()
      core.on('resumed', spy)

      await core.resume()

      expect(spy).toHaveBeenCalledOnce()
    })
  })

  // -----------------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------------

  describe('reset', () => {
    it('emits reset event', async () => {
      const spy = vi.fn()
      core.on('reset', spy)

      await core.reset()

      expect(spy).toHaveBeenCalledOnce()
    })
  })

  // -----------------------------------------------------------------------
  // terminate()
  // -----------------------------------------------------------------------

  describe('terminate', () => {
    it('calls cleanup and emits terminated', async () => {
      internals(core).isRunning = true
      const spy = vi.fn()
      core.on('terminated', spy)

      await core.terminate()

      expect(spy).toHaveBeenCalledOnce()
      expect(core.isActive()).toBe(false)
    })

    it('handles terminate when not running', async () => {
      const spy = vi.fn()
      core.on('terminated', spy)

      await expect(core.terminate()).resolves.toBeUndefined()
      expect(spy).toHaveBeenCalledOnce()
    })
  })

  // -----------------------------------------------------------------------
  // hasAutoSave()
  // -----------------------------------------------------------------------

  describe('hasAutoSave', () => {
    it('checks the correct autosave file path', () => {
      internals(core).romPath = '/roms/TestGame.nes'
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = core.hasAutoSave()

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'TestGame', 'autosave.sav')
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath)
      expect(result).toBe(true)
    })

    it('returns false when autosave does not exist', () => {
      internals(core).romPath = '/roms/TestGame.nes'
      vi.mocked(fs.existsSync).mockReturnValue(false)

      expect(core.hasAutoSave()).toBe(false)
    })

    it('uses "unknown" when romPath is not set', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      core.hasAutoSave()

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'unknown', 'autosave.sav')
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath)
    })
  })

  // -----------------------------------------------------------------------
  // hasAutoSaveForRom()
  // -----------------------------------------------------------------------

  describe('hasAutoSaveForRom', () => {
    it('checks the correct path for a given ROM', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = core.hasAutoSaveForRom('/roms/Zelda.sfc')

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'Zelda', 'autosave.sav')
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath)
      expect(result).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // deleteAutoSave()
  // -----------------------------------------------------------------------

  describe('deleteAutoSave', () => {
    it('removes the autosave file when it exists', () => {
      internals(core).romPath = '/roms/TestGame.nes'
      vi.mocked(fs.existsSync).mockReturnValue(true)

      core.deleteAutoSave()

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'TestGame', 'autosave.sav')
      expect(fs.unlinkSync).toHaveBeenCalledWith(expectedPath)
    })

    it('does nothing when autosave does not exist', () => {
      internals(core).romPath = '/roms/TestGame.nes'
      vi.mocked(fs.existsSync).mockReturnValue(false)

      core.deleteAutoSave()

      expect(fs.unlinkSync).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // deleteAutoSaveForRom()
  // -----------------------------------------------------------------------

  describe('deleteAutoSaveForRom', () => {
    it('removes the autosave file for a specific ROM', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      core.deleteAutoSaveForRom('/roms/Metroid.sfc')

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'Metroid', 'autosave.sav')
      expect(fs.unlinkSync).toHaveBeenCalledWith(expectedPath)
    })

    it('does nothing when the autosave does not exist for the ROM', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      core.deleteAutoSaveForRom('/roms/Metroid.sfc')

      expect(fs.unlinkSync).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // cleanup()
  // -----------------------------------------------------------------------

  describe('cleanup', () => {
    it('resets internal state and emits terminated', () => {
      internals(core).isRunning = true
      internals(core)._corePath = '/cores/core.dylib'
      internals(core)._systemDir = '/cores'

      const spy = vi.fn()
      core.on('terminated', spy)

      const cleanup = (internals(core).cleanup as () => void).bind(core)
      cleanup()

      expect(core.isActive()).toBe(false)
      expect(spy).toHaveBeenCalledOnce()
    })
  })

  // -----------------------------------------------------------------------
  // isActive()
  // -----------------------------------------------------------------------

  describe('isActive', () => {
    it('returns true when running', () => {
      internals(core).isRunning = true
      expect(core.isActive()).toBe(true)
    })

    it('returns false when not running', () => {
      expect(core.isActive()).toBe(false)
    })

    it('returns false after terminate', async () => {
      internals(core).isRunning = true
      await core.terminate()
      expect(core.isActive()).toBe(false)
    })
  })
})
