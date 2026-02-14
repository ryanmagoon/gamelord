import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execFileSync } from 'child_process'

// Mock electron before importing LibraryService
const TEST_DIR = path.join(os.tmpdir(), 'gamelord-library-service-test-' + Date.now())
const USER_DATA_DIR = path.join(TEST_DIR, 'userData')
const HOME_DIR = path.join(TEST_DIR, 'home')
const ROMS_DIR = path.join(TEST_DIR, 'roms')

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return USER_DATA_DIR
      if (name === 'home') return HOME_DIR
      return TEST_DIR
    }),
  },
}))

vi.mock('../logger', () => ({
  libraryLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { LibraryService } from './LibraryService'
import type { GameSystem, Game } from '../../types/library'

/**
 * The constructor fires off async loadConfig() and loadLibrary() without awaiting them.
 * We need to let those promises settle before interacting with the service.
 */
async function createService(): Promise<LibraryService> {
  const service = new LibraryService()
  // Allow the constructor's async calls (loadConfig, loadLibrary) to settle
  await vi.waitFor(
    async () => {
      // Config is loaded when systems array is populated (default config has DEFAULT_SYSTEMS)
      // or the config file was read successfully
      const config = service.getConfig()
      if (config.systems.length === 0 && !fs.existsSync(path.join(USER_DATA_DIR, 'library-config.json'))) {
        // Still loading — config hasn't been written yet
        throw new Error('Config not yet loaded')
      }
    },
    { timeout: 2000, interval: 10 },
  )
  // Extra tick to ensure saveConfig completes on first-run path
  await new Promise(resolve => setTimeout(resolve, 50))
  return service
}

/** Compute the SHA-256 of a file's content (mirrors generateGameId). */
function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

/** Compute the SHA-256 of a string (mirrors path-based fallback). */
function sha256String(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const TEST_NES_SYSTEM: GameSystem = {
  id: 'nes',
  name: 'Nintendo Entertainment System',
  shortName: 'NES',
  extensions: ['.nes', '.fds', '.unf', '.unif'],
}

const TEST_SNES_SYSTEM: GameSystem = {
  id: 'snes',
  name: 'Super Nintendo Entertainment System',
  shortName: 'SNES',
  extensions: ['.sfc', '.smc', '.swc', '.fig'],
}

const TEST_GB_SYSTEM: GameSystem = {
  id: 'gb',
  name: 'Game Boy',
  shortName: 'GB',
  extensions: ['.gb', '.gbc', '.sgb'],
}

beforeAll(() => {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true })
  fs.mkdirSync(HOME_DIR, { recursive: true })
  fs.mkdirSync(ROMS_DIR, { recursive: true })
})

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  // Clean userData files between tests so each test starts fresh
  for (const file of ['library-config.json', 'library.json']) {
    const filePath = path.join(USER_DATA_DIR, file)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
})

// ---------------------------------------------------------------------------
// Constructor / Config
// ---------------------------------------------------------------------------

describe('LibraryService', () => {
  describe('constructor and config', () => {
    it('creates default config with DEFAULT_SYSTEMS when no config file exists', async () => {
      const service = await createService()
      const config = service.getConfig()

      expect(config.systems.length).toBeGreaterThan(0)
      expect(config.scanRecursive).toBe(true)
      expect(config.autoScan).toBe(false)
      expect(config.romsBasePath).toBe(path.join(HOME_DIR, 'ROMs'))

      // Verify default config was persisted
      const saved = JSON.parse(fs.readFileSync(path.join(USER_DATA_DIR, 'library-config.json'), 'utf-8'))
      expect(saved.systems.length).toBeGreaterThan(0)
    })

    it('loads existing config from disk on construction', async () => {
      const customConfig = {
        systems: [TEST_NES_SYSTEM],
        romsBasePath: '/custom/roms',
        scanRecursive: false,
        autoScan: true,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(customConfig, null, 2),
      )

      const service = await createService()
      const config = service.getConfig()

      expect(config.systems).toHaveLength(1)
      expect(config.systems[0].id).toBe('nes')
      expect(config.romsBasePath).toBe('/custom/roms')
      expect(config.scanRecursive).toBe(false)
      expect(config.autoScan).toBe(true)
    })

    it('config save/load round-trip preserves data', async () => {
      const service = await createService()
      await service.setRomsBasePath('/new/base/path')

      // Create a second service to reload from disk
      const service2 = await createService()
      expect(service2.getConfig().romsBasePath).toBe('/new/base/path')
    })
  })

  // ---------------------------------------------------------------------------
  // System management
  // ---------------------------------------------------------------------------

  describe('addSystem', () => {
    it('adds a new system to config', async () => {
      const service = await createService()
      const customSystem: GameSystem = {
        id: 'custom',
        name: 'Custom System',
        shortName: 'CUST',
        extensions: ['.cst'],
      }

      await service.addSystem(customSystem)
      const systems = service.getSystems()
      const found = systems.find(s => s.id === 'custom')

      expect(found).toBeDefined()
      expect(found!.name).toBe('Custom System')
    })

    it('does not add a duplicate system with the same id', async () => {
      const service = await createService()
      const initialCount = service.getSystems().length

      // NES is already in DEFAULT_SYSTEMS
      await service.addSystem(TEST_NES_SYSTEM)
      expect(service.getSystems().length).toBe(initialCount)
    })
  })

  describe('removeSystem', () => {
    it('removes system and cascades to delete games from that system', async () => {
      // Seed config with just NES and SNES so we have a known set
      const config = {
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
        scanRecursive: true,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      // Seed a library with games from both systems
      const nesRomPath = path.join(ROMS_DIR, 'zelda.nes')
      const snesRomPath = path.join(ROMS_DIR, 'mario_world.sfc')
      fs.writeFileSync(nesRomPath, 'nes-game-data')
      fs.writeFileSync(snesRomPath, 'snes-game-data')

      const service = await createService()
      await service.addGame(nesRomPath, 'nes')
      await service.addGame(snesRomPath, 'snes')

      expect(service.getGames().length).toBe(2)

      await service.removeSystem('nes')

      expect(service.getSystems().find(s => s.id === 'nes')).toBeUndefined()
      expect(service.getGames('nes')).toHaveLength(0)
      expect(service.getGames('snes')).toHaveLength(1)

      // Clean up rom files
      fs.unlinkSync(nesRomPath)
      fs.unlinkSync(snesRomPath)
    })
  })

  describe('updateSystemPath', () => {
    it('updates the romsPath for an existing system', async () => {
      const service = await createService()
      await service.updateSystemPath('nes', '/new/nes/roms')

      const nesSystem = service.getSystems().find(s => s.id === 'nes')
      expect(nesSystem?.romsPath).toBe('/new/nes/roms')

      // Verify it was persisted
      const savedConfig = JSON.parse(
        fs.readFileSync(path.join(USER_DATA_DIR, 'library-config.json'), 'utf-8'),
      )
      const savedNes = savedConfig.systems.find((s: GameSystem) => s.id === 'nes')
      expect(savedNes.romsPath).toBe('/new/nes/roms')
    })

    it('does nothing for an unknown system id', async () => {
      const service = await createService()
      const systemsBefore = JSON.stringify(service.getSystems())

      await service.updateSystemPath('nonexistent', '/whatever')

      expect(JSON.stringify(service.getSystems())).toBe(systemsBefore)
    })
  })

  describe('getSystems', () => {
    it('returns all configured systems', async () => {
      const service = await createService()
      const systems = service.getSystems()

      expect(Array.isArray(systems)).toBe(true)
      expect(systems.length).toBeGreaterThan(0)
      expect(systems[0]).toHaveProperty('id')
      expect(systems[0]).toHaveProperty('name')
      expect(systems[0]).toHaveProperty('extensions')
    })
  })

  // ---------------------------------------------------------------------------
  // Game management
  // ---------------------------------------------------------------------------

  describe('getGames', () => {
    it('returns all games when no systemId filter is provided', async () => {
      const nesRom = path.join(ROMS_DIR, 'game1.nes')
      const snesRom = path.join(ROMS_DIR, 'game1.sfc')
      fs.writeFileSync(nesRom, 'nes-content-1')
      fs.writeFileSync(snesRom, 'snes-content-1')

      const config = {
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
        scanRecursive: true,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      await service.addGame(nesRom, 'nes')
      await service.addGame(snesRom, 'snes')

      const allGames = service.getGames()
      expect(allGames).toHaveLength(2)

      fs.unlinkSync(nesRom)
      fs.unlinkSync(snesRom)
    })

    it('filters games by systemId when provided', async () => {
      const nesRom = path.join(ROMS_DIR, 'game2.nes')
      const snesRom = path.join(ROMS_DIR, 'game2.sfc')
      fs.writeFileSync(nesRom, 'nes-content-2')
      fs.writeFileSync(snesRom, 'snes-content-2')

      const config = {
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
        scanRecursive: true,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      await service.addGame(nesRom, 'nes')
      await service.addGame(snesRom, 'snes')

      expect(service.getGames('nes')).toHaveLength(1)
      expect(service.getGames('snes')).toHaveLength(1)
      expect(service.getGames('nonexistent')).toHaveLength(0)

      fs.unlinkSync(nesRom)
      fs.unlinkSync(snesRom)
    })
  })

  describe('addGame', () => {
    it('creates a game with correct SHA-256 content-based ID', async () => {
      const romPath = path.join(ROMS_DIR, 'test_game.nes')
      const romContent = 'unique-nes-rom-data-for-sha256-test'
      fs.writeFileSync(romPath, romContent)

      const service = await createService()
      const game = await service.addGame(romPath, 'nes')

      expect(game).not.toBeNull()
      expect(game!.id).toBe(sha256File(romPath))
      expect(game!.id).toHaveLength(64) // SHA-256 hex digest
      expect(game!.title).toBe('test game')
      expect(game!.system).toBe('Nintendo Entertainment System')
      expect(game!.systemId).toBe('nes')
      expect(game!.romPath).toBe(romPath)

      fs.unlinkSync(romPath)
    })

    it('returns null for an unknown system id', async () => {
      const romPath = path.join(ROMS_DIR, 'game.nes')
      fs.writeFileSync(romPath, 'data')

      const service = await createService()
      const game = await service.addGame(romPath, 'unknown-system')

      expect(game).toBeNull()

      fs.unlinkSync(romPath)
    })

    it('returns null when the file extension does not match the system', async () => {
      const romPath = path.join(ROMS_DIR, 'game.txt')
      fs.writeFileSync(romPath, 'data')

      const service = await createService()
      const game = await service.addGame(romPath, 'nes')

      expect(game).toBeNull()

      fs.unlinkSync(romPath)
    })

    it('persists the game to the library file on disk', async () => {
      const romPath = path.join(ROMS_DIR, 'persist_test.nes')
      fs.writeFileSync(romPath, 'persist-data')

      const service = await createService()
      await service.addGame(romPath, 'nes')

      const libraryFile = path.join(USER_DATA_DIR, 'library.json')
      const savedGames: Game[] = JSON.parse(fs.readFileSync(libraryFile, 'utf-8'))
      expect(savedGames).toHaveLength(1)
      expect(savedGames[0].romPath).toBe(romPath)

      fs.unlinkSync(romPath)
    })
  })

  describe('removeGame', () => {
    it('deletes game from the library', async () => {
      const romPath = path.join(ROMS_DIR, 'remove_me.nes')
      fs.writeFileSync(romPath, 'remove-data')

      const service = await createService()
      const game = await service.addGame(romPath, 'nes')
      expect(service.getGames()).toHaveLength(1)

      await service.removeGame(game!.id)
      expect(service.getGames()).toHaveLength(0)

      // Verify persistence
      const savedGames: Game[] = JSON.parse(
        fs.readFileSync(path.join(USER_DATA_DIR, 'library.json'), 'utf-8'),
      )
      expect(savedGames).toHaveLength(0)

      fs.unlinkSync(romPath)
    })
  })

  describe('updateGame', () => {
    it('updates game properties and persists', async () => {
      const romPath = path.join(ROMS_DIR, 'update_me.nes')
      fs.writeFileSync(romPath, 'update-data')

      const service = await createService()
      const game = await service.addGame(romPath, 'nes')

      await service.updateGame(game!.id, {
        title: 'Updated Title',
        favorite: true,
        playTime: 3600,
      })

      const updated = service.getGames().find(g => g.id === game!.id)
      expect(updated?.title).toBe('Updated Title')
      expect(updated?.favorite).toBe(true)
      expect(updated?.playTime).toBe(3600)

      fs.unlinkSync(romPath)
    })

    it('does nothing for a non-existent game id', async () => {
      const service = await createService()
      // Should not throw
      await service.updateGame('nonexistent-id', { title: 'Ghost' })
      expect(service.getGames()).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // scanDirectory
  // ---------------------------------------------------------------------------

  describe('scanDirectory', () => {
    const scanDir = path.join(TEST_DIR, 'scan-test')

    beforeAll(() => {
      // Build a directory structure:
      // scan-test/
      //   game_a.nes            (NES ROM)
      //   game_b.sfc            (SNES ROM)
      //   readme.txt            (not a ROM)
      //   NES/
      //     game_c.nes          (NES ROM in system-named folder)
      //   subfolder/
      //     game_d.nes          (NES ROM in generic subfolder)
      fs.mkdirSync(path.join(scanDir, 'NES'), { recursive: true })
      fs.mkdirSync(path.join(scanDir, 'subfolder'), { recursive: true })

      fs.writeFileSync(path.join(scanDir, 'game_a.nes'), 'nes-a')
      fs.writeFileSync(path.join(scanDir, 'game_b.sfc'), 'snes-b')
      fs.writeFileSync(path.join(scanDir, 'readme.txt'), 'not a rom')
      fs.writeFileSync(path.join(scanDir, 'NES', 'game_c.nes'), 'nes-c')
      fs.writeFileSync(path.join(scanDir, 'subfolder', 'game_d.nes'), 'nes-d')
    })

    afterAll(() => {
      fs.rmSync(scanDir, { recursive: true, force: true })
    })

    it('finds ROMs by extension and creates Game objects with correct titles', async () => {
      const config = {
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(scanDir)

      // Non-recursive: should find game_a.nes and game_b.sfc at root, skip subdirs
      const titles = games.map(g => g.title)
      expect(titles).toContain('game a')
      expect(titles).toContain('game b')
      // Should NOT include subdirectory games in non-recursive mode
      expect(titles).not.toContain('game c')
      expect(titles).not.toContain('game d')
    })

    it('recursively scans subdirectories when scanRecursive is true', async () => {
      const config = {
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
        scanRecursive: true,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(scanDir)

      const titles = games.map(g => g.title)
      expect(titles).toContain('game a')
      expect(titles).toContain('game b')
      expect(titles).toContain('game c')
      expect(titles).toContain('game d')
    })

    it('detects system by folder name (shortName match)', async () => {
      const config = {
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
        scanRecursive: true,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      // Scan without a specific systemId — folder "NES" should auto-detect
      const games = await service.scanDirectory(scanDir)

      const gameC = games.find(g => g.title === 'game c')
      expect(gameC).toBeDefined()
      expect(gameC!.systemId).toBe('nes')
    })

    it('scans with a specific systemId filter', async () => {
      const config = {
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
        scanRecursive: true,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(scanDir, 'snes')

      // Only SNES games should be found
      expect(games.every(g => g.systemId === 'snes')).toBe(true)
      const titles = games.map(g => g.title)
      expect(titles).toContain('game b')
      // .nes files should be excluded when filtering to snes
      expect(titles).not.toContain('game a')
    })

    it('skips non-ROM files', async () => {
      const config = {
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(scanDir)

      const paths = games.map(g => g.romPath)
      expect(paths).not.toContain(path.join(scanDir, 'readme.txt'))
    })

    it('handles missing directory gracefully (does not throw)', async () => {
      const service = await createService()
      const games = await service.scanDirectory('/nonexistent/path/that/does/not/exist')
      expect(games).toEqual([])
    })

    it('handles empty directory', async () => {
      const emptyDir = path.join(TEST_DIR, 'empty-scan-dir')
      fs.mkdirSync(emptyDir, { recursive: true })

      const service = await createService()
      const games = await service.scanDirectory(emptyDir)
      expect(games).toEqual([])

      fs.rmSync(emptyDir, { recursive: true, force: true })
    })
  })

  describe('scanDirectory — rescan preserves metadata', () => {
    it('preserves coverArt and metadata when rescanning the same files', async () => {
      const rescanDir = path.join(TEST_DIR, 'rescan-preserve')
      fs.mkdirSync(rescanDir, { recursive: true })
      fs.writeFileSync(path.join(rescanDir, 'zelda.nes'), 'zelda-rom-data')

      const config = {
        systems: [TEST_NES_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()

      // First scan — discover the game
      const firstScan = await service.scanDirectory(rescanDir)
      expect(firstScan).toHaveLength(1)
      const gameId = firstScan[0].id

      // Simulate artwork sync by updating the game with coverArt and metadata
      await service.updateGame(gameId, {
        coverArt: 'artwork://zelda.png',
        coverArtAspectRatio: 0.714,
        metadata: { developer: 'Nintendo', genre: 'Action-Adventure' },
        favorite: true,
      })

      // Verify metadata was set
      const beforeRescan = service.getGame(gameId)
      expect(beforeRescan?.coverArt).toBe('artwork://zelda.png')
      expect(beforeRescan?.favorite).toBe(true)

      // Second scan (rescan) — should preserve metadata
      const secondScan = await service.scanDirectory(rescanDir)
      expect(secondScan).toHaveLength(1)

      const afterRescan = service.getGame(gameId)
      expect(afterRescan?.coverArt).toBe('artwork://zelda.png')
      expect(afterRescan?.coverArtAspectRatio).toBe(0.714)
      expect(afterRescan?.metadata?.developer).toBe('Nintendo')
      expect(afterRescan?.metadata?.genre).toBe('Action-Adventure')
      expect(afterRescan?.favorite).toBe(true)

      fs.rmSync(rescanDir, { recursive: true, force: true })
    })
  })

  describe('scanDirectory — compressed ROM extraction', () => {
    it('extracts .zip containing a .gb ROM inside a system-named folder', async () => {
      const zipScanDir = path.join(TEST_DIR, 'zip-scan')
      const gbFolder = path.join(zipScanDir, 'GB')
      const zipSrcDir = path.join(TEST_DIR, 'zip-scan-src')
      fs.mkdirSync(gbFolder, { recursive: true })
      fs.mkdirSync(zipSrcDir, { recursive: true })

      fs.writeFileSync(path.join(zipSrcDir, 'Pokemon Red.gb'), 'gb-zip-content')
      execFileSync('zip', ['-j', path.join(gbFolder, 'Pokemon Red.zip'),
        path.join(zipSrcDir, 'Pokemon Red.gb')])
      fs.writeFileSync(path.join(gbFolder, 'Tetris.gb'), 'gb-native-content')

      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: true,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(zipScanDir)

      const titles = games.map(g => g.title)
      expect(titles).toContain('Pokemon Red')
      expect(titles).toContain('Tetris')

      const zipGame = games.find(g => g.title === 'Pokemon Red')
      expect(zipGame?.systemId).toBe('gb')
      expect(zipGame?.romPath).toContain('roms-cache')

      fs.rmSync(zipScanDir, { recursive: true, force: true })
      fs.rmSync(zipSrcDir, { recursive: true, force: true })
    })

    it('skips .zip for arcade system (treats as native ROM)', async () => {
      const ARCADE_SYSTEM: GameSystem = {
        id: 'arcade',
        name: 'Arcade',
        shortName: 'Arcade',
        extensions: ['.zip', '.7z'],
      }

      const arcadeDir = path.join(TEST_DIR, 'arcade-zip')
      fs.mkdirSync(arcadeDir, { recursive: true })
      // Arcade zips are passed through as-is (no extraction)
      fs.writeFileSync(path.join(arcadeDir, 'pacman.zip'), 'arcade-rom-set')

      const config = {
        systems: [ARCADE_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(arcadeDir, 'arcade')

      expect(games).toHaveLength(1)
      expect(games[0].systemId).toBe('arcade')
      // Arcade ROM path should point to the original zip, not roms-cache
      expect(games[0].romPath).toBe(path.join(arcadeDir, 'pacman.zip'))

      fs.rmSync(arcadeDir, { recursive: true, force: true })
    })

    it('extracts .zip with explicit systemId', async () => {
      const explicitDir = path.join(TEST_DIR, 'explicit-system-zip')
      const explicitSrcDir = path.join(TEST_DIR, 'explicit-system-zip-src')
      fs.mkdirSync(explicitDir, { recursive: true })
      fs.mkdirSync(explicitSrcDir, { recursive: true })

      fs.writeFileSync(path.join(explicitSrcDir, 'Links Awakening.gb'), 'gb-rom-data')
      execFileSync('zip', ['-j', path.join(explicitDir, 'Links Awakening.zip'),
        path.join(explicitSrcDir, 'Links Awakening.gb')])

      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(explicitDir, 'gb')

      expect(games).toHaveLength(1)
      expect(games[0].systemId).toBe('gb')
      expect(games[0].title).toBe('Links Awakening')
      expect(games[0].romPath).toContain('roms-cache')

      fs.rmSync(explicitDir, { recursive: true, force: true })
      fs.rmSync(explicitSrcDir, { recursive: true, force: true })
    })
  })

  // ---------------------------------------------------------------------------
  // scanSystemFolders
  // ---------------------------------------------------------------------------

  describe('scanSystemFolders', () => {
    it('scans all systems that have a romsPath configured', async () => {
      const nesFolderDir = path.join(TEST_DIR, 'system-folders', 'nes')
      fs.mkdirSync(nesFolderDir, { recursive: true })
      fs.writeFileSync(path.join(nesFolderDir, 'sf_game.nes'), 'sf-nes-data')

      const config = {
        systems: [
          { ...TEST_NES_SYSTEM, romsPath: nesFolderDir },
          TEST_SNES_SYSTEM, // no romsPath — should be skipped
        ],
        scanRecursive: true,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanSystemFolders()

      expect(games.length).toBeGreaterThanOrEqual(1)
      expect(games[0].systemId).toBe('nes')

      fs.rmSync(path.join(TEST_DIR, 'system-folders'), { recursive: true, force: true })
    })
  })

  // ---------------------------------------------------------------------------
  // generateGameId (tested indirectly through addGame)
  // ---------------------------------------------------------------------------

  describe('generateGameId (content-based hashing)', () => {
    it('produces the same ID for files with identical content', async () => {
      const romA = path.join(ROMS_DIR, 'identical_a.nes')
      const romB = path.join(ROMS_DIR, 'identical_b.nes')
      const content = 'identical-rom-content-for-hash-test'
      fs.writeFileSync(romA, content)
      fs.writeFileSync(romB, content)

      const service = await createService()
      const gameA = await service.addGame(romA, 'nes')
      const gameB = await service.addGame(romB, 'nes')

      expect(gameA).not.toBeNull()
      expect(gameB).not.toBeNull()
      expect(gameA!.id).toBe(gameB!.id)

      fs.unlinkSync(romA)
      fs.unlinkSync(romB)
    })

    it('produces different IDs for files with different content', async () => {
      const romA = path.join(ROMS_DIR, 'diff_a.nes')
      const romB = path.join(ROMS_DIR, 'diff_b.nes')
      fs.writeFileSync(romA, 'content-aaa')
      fs.writeFileSync(romB, 'content-bbb')

      const service = await createService()
      const gameA = await service.addGame(romA, 'nes')
      const gameB = await service.addGame(romB, 'nes')

      expect(gameA).not.toBeNull()
      expect(gameB).not.toBeNull()
      expect(gameA!.id).not.toBe(gameB!.id)

      fs.unlinkSync(romA)
      fs.unlinkSync(romB)
    })
  })

  // ---------------------------------------------------------------------------
  // cleanGameTitle (tested indirectly through addGame)
  // ---------------------------------------------------------------------------

  describe('cleanGameTitle', () => {
    // We test this indirectly by adding games with various naming conventions
    // and checking the resulting title.

    it('removes content in parentheses', async () => {
      const romPath = path.join(ROMS_DIR, 'Super Mario Bros (USA).nes')
      fs.writeFileSync(romPath, 'paren-test')

      const service = await createService()
      const game = await service.addGame(romPath, 'nes')

      expect(game!.title).toBe('Super Mario Bros')

      fs.unlinkSync(romPath)
    })

    it('removes content in square brackets', async () => {
      const romPath = path.join(ROMS_DIR, 'Zelda [!].nes')
      fs.writeFileSync(romPath, 'bracket-test')

      const service = await createService()
      const game = await service.addGame(romPath, 'nes')

      expect(game!.title).toBe('Zelda')

      fs.unlinkSync(romPath)
    })

    it('removes content in curly braces', async () => {
      const romPath = path.join(ROMS_DIR, 'Metroid {v1.1}.nes')
      fs.writeFileSync(romPath, 'brace-test')

      const service = await createService()
      const game = await service.addGame(romPath, 'nes')

      expect(game!.title).toBe('Metroid')

      fs.unlinkSync(romPath)
    })

    it('replaces underscores with spaces', async () => {
      const romPath = path.join(ROMS_DIR, 'Mega_Man_2.nes')
      fs.writeFileSync(romPath, 'underscore-test')

      const service = await createService()
      const game = await service.addGame(romPath, 'nes')

      expect(game!.title).toBe('Mega Man 2')

      fs.unlinkSync(romPath)
    })

    it('collapses multiple spaces and trims', async () => {
      const romPath = path.join(ROMS_DIR, 'Final  Fantasy  (USA)  [!].nes')
      fs.writeFileSync(romPath, 'spaces-test')

      const service = await createService()
      const game = await service.addGame(romPath, 'nes')

      expect(game!.title).toBe('Final Fantasy')

      fs.unlinkSync(romPath)
    })
  })

  // ---------------------------------------------------------------------------
  // setRomsBasePath
  // ---------------------------------------------------------------------------

  describe('setRomsBasePath', () => {
    it('updates the romsBasePath in config and persists it', async () => {
      const service = await createService()
      await service.setRomsBasePath('/my/roms')

      expect(service.getConfig().romsBasePath).toBe('/my/roms')

      // Verify persistence
      const savedConfig = JSON.parse(
        fs.readFileSync(path.join(USER_DATA_DIR, 'library-config.json'), 'utf-8'),
      )
      expect(savedConfig.romsBasePath).toBe('/my/roms')
    })
  })

  // ---------------------------------------------------------------------------
  // Library persistence (load existing library)
  // ---------------------------------------------------------------------------

  describe('library persistence', () => {
    it('loads existing games from library.json on construction', async () => {
      const romPath = path.join(ROMS_DIR, 'persisted_game.nes')
      fs.writeFileSync(romPath, 'persisted-content')

      const gameId = sha256File(romPath)
      const games: Game[] = [
        {
          id: gameId,
          title: 'Persisted Game',
          system: 'Nintendo Entertainment System',
          systemId: 'nes',
          romPath,
        },
      ]
      fs.writeFileSync(path.join(USER_DATA_DIR, 'library.json'), JSON.stringify(games, null, 2))

      const service = await createService()
      const loadedGames = service.getGames()

      expect(loadedGames).toHaveLength(1)
      expect(loadedGames[0].title).toBe('Persisted Game')
      expect(loadedGames[0].id).toBe(gameId)

      fs.unlinkSync(romPath)
    })
  })

  // ---------------------------------------------------------------------------
  // Migration (old MD5 IDs -> SHA-256)
  // ---------------------------------------------------------------------------

  describe('migrateGameIds', () => {
    it('migrates old 32-char hex IDs to SHA-256 content-based IDs', async () => {
      const romPath = path.join(ROMS_DIR, 'migrate_test.nes')
      fs.writeFileSync(romPath, 'migration-content')

      const oldMd5Id = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' // 32-char hex
      const expectedNewId = sha256File(romPath)

      const games: Game[] = [
        {
          id: oldMd5Id,
          title: 'Legacy Game',
          system: 'Nintendo Entertainment System',
          systemId: 'nes',
          romPath,
        },
      ]
      fs.writeFileSync(path.join(USER_DATA_DIR, 'library.json'), JSON.stringify(games, null, 2))

      const service = await createService()
      // Give extra time for migration to complete
      await new Promise(resolve => setTimeout(resolve, 100))

      const loadedGames = service.getGames()
      expect(loadedGames).toHaveLength(1)
      expect(loadedGames[0].id).toBe(expectedNewId)
      expect(loadedGames[0].id).toHaveLength(64)

      fs.unlinkSync(romPath)
    })
  })

  // ---------------------------------------------------------------------------
  // Zip extraction during scan
  // ---------------------------------------------------------------------------

  describe('scanDirectory with zip files', () => {
    const zipScanDir = path.join(TEST_DIR, 'zip-scan-test')
    const zipRomsDir = path.join(TEST_DIR, 'zip-rom-sources')

    beforeAll(() => {
      fs.mkdirSync(zipScanDir, { recursive: true })
      fs.mkdirSync(zipRomsDir, { recursive: true })

      // Create ROM files to zip
      fs.writeFileSync(path.join(zipRomsDir, 'Tetris (World).gb'), 'fake-gb-tetris-data')
      fs.writeFileSync(path.join(zipRomsDir, 'Links Awakening (USA).gb'), 'fake-gb-zelda-data')
      fs.writeFileSync(path.join(zipRomsDir, 'game.nes'), 'fake-nes-data-in-zip')
      fs.writeFileSync(path.join(zipRomsDir, 'readme.txt'), 'just a readme')

      // Zip with a single .gb ROM
      execFileSync('zip', ['-j', path.join(zipScanDir, 'tetris.zip'),
        path.join(zipRomsDir, 'Tetris (World).gb')])

      // Zip with a .nes ROM
      execFileSync('zip', ['-j', path.join(zipScanDir, 'nes-game.zip'),
        path.join(zipRomsDir, 'game.nes')])

      // Zip with no matching ROM (only .txt)
      execFileSync('zip', ['-j', path.join(zipScanDir, 'no-rom.zip'),
        path.join(zipRomsDir, 'readme.txt')])

      // Also place a regular unzipped ROM alongside the zips
      fs.writeFileSync(path.join(zipScanDir, 'raw-game.gb'), 'raw-gb-data')
    })

    afterAll(() => {
      fs.rmSync(zipScanDir, { recursive: true, force: true })
      fs.rmSync(zipRomsDir, { recursive: true, force: true })
      // Clean up roms-cache
      const cacheDir = path.join(USER_DATA_DIR, 'roms-cache')
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true })
      }
    })

    it('extracts ROM from zip and creates Game with romPath in roms-cache', async () => {
      const config = {
        systems: [TEST_NES_SYSTEM, TEST_SNES_SYSTEM, TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(zipScanDir)

      const zipGame = games.find(g => g.title === 'Tetris')
      expect(zipGame).toBeDefined()
      expect(zipGame!.romPath).toContain('roms-cache')
      expect(zipGame!.romPath).toContain('.gb')
      expect(fs.existsSync(zipGame!.romPath)).toBe(true)
    })

    it('sets sourceArchivePath on games extracted from zips', async () => {
      const config = {
        systems: [TEST_NES_SYSTEM, TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(zipScanDir)

      const zipGames = games.filter(g => g.sourceArchivePath !== undefined)
      expect(zipGames.length).toBeGreaterThanOrEqual(1)
      // All zip-extracted games should have a sourceArchivePath ending in .zip
      for (const game of zipGames) {
        expect(game.sourceArchivePath).toMatch(/\.zip$/)
      }
    })

    it('computes game ID from extracted ROM content, not zip content', async () => {
      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(zipScanDir)

      const zipGame = games.find(g => g.title === 'Tetris')
      expect(zipGame).toBeDefined()

      // The ID should be SHA-256 of the ROM content, not the zip file
      const expectedId = sha256String('fake-gb-tetris-data')
      expect(zipGame!.id).toBe(expectedId)
    })

    it('derives title from ROM filename inside zip, not zip filename', async () => {
      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(zipScanDir)

      // Title should come from "Tetris (World).gb" -> cleaned to "Tetris"
      const zipGame = games.find(g => g.sourceArchivePath?.endsWith('tetris.zip'))
      expect(zipGame).toBeDefined()
      expect(zipGame!.title).toBe('Tetris')
    })

    it('skips zip files with no matching ROM extensions', async () => {
      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(zipScanDir)

      // no-rom.zip only has a .txt — should not produce a game
      const noRomGame = games.find(g => g.sourceArchivePath?.endsWith('no-rom.zip'))
      expect(noRomGame).toBeUndefined()
    })

    it('also scans regular unzipped ROMs alongside zips', async () => {
      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const games = await service.scanDirectory(zipScanDir)

      const rawGame = games.find(g => g.title === 'raw-game')
      expect(rawGame).toBeDefined()
      expect(rawGame!.romPath).toBe(path.join(zipScanDir, 'raw-game.gb'))
      expect(rawGame!.sourceArchivePath).toBeUndefined()
    })

    it('does not re-extract on subsequent scan (deduplication)', async () => {
      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const firstScan = await service.scanDirectory(zipScanDir)
      const firstZipGames = firstScan.filter(g => g.sourceArchivePath !== undefined)
      expect(firstZipGames.length).toBeGreaterThanOrEqual(1)

      const totalAfterFirst = service.getGames().length

      // Second scan: zip-extracted games should NOT be re-added
      const secondScan = await service.scanDirectory(zipScanDir)
      const secondZipGames = secondScan.filter(g => g.sourceArchivePath !== undefined)
      expect(secondZipGames).toHaveLength(0)

      // Total game count unchanged (regular ROMs may be re-set but not duplicated)
      expect(service.getGames().length).toBe(totalAfterFirst)
    })
  })

  describe('addGame with zip file', () => {
    const addGameZipDir = path.join(TEST_DIR, 'add-game-zip-test')

    beforeAll(() => {
      fs.mkdirSync(addGameZipDir, { recursive: true })
      fs.writeFileSync(path.join(addGameZipDir, 'rom.gb'), 'add-game-gb-data')
      fs.writeFileSync(path.join(addGameZipDir, 'readme.txt'), 'not a rom')

      execFileSync('zip', ['-j', path.join(addGameZipDir, 'game.zip'),
        path.join(addGameZipDir, 'rom.gb')])
      execFileSync('zip', ['-j', path.join(addGameZipDir, 'no-rom.zip'),
        path.join(addGameZipDir, 'readme.txt')])
    })

    afterAll(() => {
      fs.rmSync(addGameZipDir, { recursive: true, force: true })
      const cacheDir = path.join(USER_DATA_DIR, 'roms-cache')
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true })
      }
    })

    it('extracts ROM from zip and returns Game', async () => {
      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const game = await service.addGame(path.join(addGameZipDir, 'game.zip'), 'gb')

      expect(game).not.toBeNull()
      expect(game!.romPath).toContain('roms-cache')
      expect(game!.systemId).toBe('gb')
      expect(game!.sourceArchivePath).toBe(path.join(addGameZipDir, 'game.zip'))
    })

    it('returns null for zip with no matching ROM for the given system', async () => {
      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const game = await service.addGame(path.join(addGameZipDir, 'no-rom.zip'), 'gb')

      expect(game).toBeNull()
    })
  })

  describe('removeGame with cached ROM', () => {
    const removeCacheDir = path.join(TEST_DIR, 'remove-cache-test')

    beforeAll(() => {
      fs.mkdirSync(removeCacheDir, { recursive: true })
      fs.writeFileSync(path.join(removeCacheDir, 'rom.gb'), 'remove-cache-gb-data')
      execFileSync('zip', ['-j', path.join(removeCacheDir, 'game.zip'),
        path.join(removeCacheDir, 'rom.gb')])
    })

    afterAll(() => {
      fs.rmSync(removeCacheDir, { recursive: true, force: true })
      const cacheDir = path.join(USER_DATA_DIR, 'roms-cache')
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true })
      }
    })

    it('deletes the cached ROM file when a zip-extracted game is removed', async () => {
      const config = {
        systems: [TEST_GB_SYSTEM],
        scanRecursive: false,
        autoScan: false,
      }
      fs.writeFileSync(
        path.join(USER_DATA_DIR, 'library-config.json'),
        JSON.stringify(config, null, 2),
      )

      const service = await createService()
      const game = await service.addGame(path.join(removeCacheDir, 'game.zip'), 'gb')
      expect(game).not.toBeNull()
      expect(fs.existsSync(game!.romPath)).toBe(true)

      const cachedRomPath = game!.romPath
      await service.removeGame(game!.id)

      expect(fs.existsSync(cachedRomPath)).toBe(false)
      expect(service.getGames()).toHaveLength(0)
    })
  })
})
