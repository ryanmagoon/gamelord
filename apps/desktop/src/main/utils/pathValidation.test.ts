import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { validateCorePath, validateRomPath } from './pathValidation'
import fs from 'fs'
import path from 'path'
import os from 'os'

const TEST_DIR = path.join(os.tmpdir(), 'gamelord-path-validation-test')
const CORES_DIR = path.join(TEST_DIR, 'cores')
const ROMS_DIR = path.join(TEST_DIR, 'roms')

beforeAll(() => {
  fs.mkdirSync(CORES_DIR, { recursive: true })
  fs.mkdirSync(ROMS_DIR, { recursive: true })

  // Create fake core files
  fs.writeFileSync(path.join(CORES_DIR, 'fceumm_libretro.dylib'), 'fake core')
  fs.writeFileSync(path.join(CORES_DIR, 'snes9x_libretro.so'), 'fake core')
  fs.writeFileSync(path.join(CORES_DIR, 'genesis_libretro.dll'), 'fake core')
  fs.writeFileSync(path.join(CORES_DIR, 'not_a_core.txt'), 'not a core')

  // Create fake ROM files
  fs.writeFileSync(path.join(ROMS_DIR, 'game.nes'), 'fake rom')
  fs.writeFileSync(path.join(ROMS_DIR, 'game.smc'), 'fake rom')
})

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('validateCorePath', () => {
  it('accepts a valid .dylib core within allowed directory', () => {
    const corePath = path.join(CORES_DIR, 'fceumm_libretro.dylib')
    expect(validateCorePath(corePath, [CORES_DIR])).toBe(corePath)
  })

  it('accepts a valid .so core within allowed directory', () => {
    const corePath = path.join(CORES_DIR, 'snes9x_libretro.so')
    expect(validateCorePath(corePath, [CORES_DIR])).toBe(corePath)
  })

  it('accepts a valid .dll core within allowed directory', () => {
    const corePath = path.join(CORES_DIR, 'genesis_libretro.dll')
    expect(validateCorePath(corePath, [CORES_DIR])).toBe(corePath)
  })

  it('rejects relative paths', () => {
    expect(() => validateCorePath('cores/fceumm_libretro.dylib', [CORES_DIR])).toThrow(
      'Path must be absolute',
    )
  })

  it('rejects paths outside allowed directories', () => {
    const outsidePath = path.join(TEST_DIR, 'elsewhere', 'evil.dylib')
    fs.mkdirSync(path.dirname(outsidePath), { recursive: true })
    fs.writeFileSync(outsidePath, 'evil')

    expect(() => validateCorePath(outsidePath, [CORES_DIR])).toThrow(
      'Path is outside allowed directories',
    )

    fs.rmSync(path.dirname(outsidePath), { recursive: true })
  })

  it('rejects path traversal attempts', () => {
    const traversalPath = path.join(CORES_DIR, '..', 'roms', 'game.nes')
    expect(() => validateCorePath(traversalPath, [CORES_DIR])).toThrow(
      'Path is outside allowed directories',
    )
  })

  it('rejects files with invalid extensions', () => {
    const textPath = path.join(CORES_DIR, 'not_a_core.txt')
    expect(() => validateCorePath(textPath, [CORES_DIR])).toThrow('Invalid core file extension')
  })

  it('rejects non-existent core files', () => {
    const missingPath = path.join(CORES_DIR, 'nonexistent_libretro.dylib')
    expect(() => validateCorePath(missingPath, [CORES_DIR])).toThrow('Core file does not exist')
  })

  it('accepts path when multiple allowed directories are given', () => {
    const corePath = path.join(CORES_DIR, 'fceumm_libretro.dylib')
    expect(validateCorePath(corePath, ['/some/other/dir', CORES_DIR])).toBe(corePath)
  })
})

describe('validateRomPath', () => {
  it('accepts a valid ROM file', () => {
    const romPath = path.join(ROMS_DIR, 'game.nes')
    expect(validateRomPath(romPath)).toBe(romPath)
  })

  it('rejects relative paths', () => {
    expect(() => validateRomPath('roms/game.nes')).toThrow('ROM path must be absolute')
  })

  it('rejects non-existent ROM files', () => {
    const missingPath = path.join(ROMS_DIR, 'nonexistent.nes')
    expect(() => validateRomPath(missingPath)).toThrow('ROM file does not exist')
  })

  it('rejects directories', () => {
    expect(() => validateRomPath(ROMS_DIR)).toThrow('ROM path is not a file')
  })
})
