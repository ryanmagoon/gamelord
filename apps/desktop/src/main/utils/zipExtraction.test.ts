import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { listZipContents, findRomInZip, extractFileFromZip } from './zipExtraction'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'

const TEST_DIR = path.join(os.tmpdir(), 'gamelord-zip-extraction-test')
const ZIPS_DIR = path.join(TEST_DIR, 'zips')
const ROMS_DIR = path.join(TEST_DIR, 'roms')
const EXTRACT_DIR = path.join(TEST_DIR, 'extract')

beforeAll(() => {
  fs.mkdirSync(ZIPS_DIR, { recursive: true })
  fs.mkdirSync(ROMS_DIR, { recursive: true })
  fs.mkdirSync(EXTRACT_DIR, { recursive: true })

  // Create fake ROM files to zip
  fs.writeFileSync(path.join(ROMS_DIR, 'game.gb'), 'fake gb rom data')
  fs.writeFileSync(path.join(ROMS_DIR, 'game.nes'), 'fake nes rom data')
  fs.writeFileSync(path.join(ROMS_DIR, 'readme.txt'), 'not a rom')
  fs.writeFileSync(path.join(ROMS_DIR, 'game.GBC'), 'fake gbc rom uppercase')

  // Create a subdirectory with a ROM (to test nested entries)
  fs.mkdirSync(path.join(ROMS_DIR, 'subdir'), { recursive: true })
  fs.writeFileSync(path.join(ROMS_DIR, 'subdir', 'nested.sfc'), 'fake snes rom')

  // Create __MACOSX junk
  fs.mkdirSync(path.join(ROMS_DIR, '__MACOSX'), { recursive: true })
  fs.writeFileSync(path.join(ROMS_DIR, '__MACOSX', '._game.gb'), 'macos resource fork')

  // zip containing a single .gb ROM
  execFileSync('zip', ['-j', path.join(ZIPS_DIR, 'single-gb.zip'), path.join(ROMS_DIR, 'game.gb')])

  // zip containing a .nes ROM and a .txt (non-ROM)
  execFileSync('zip', ['-j', path.join(ZIPS_DIR, 'nes-with-txt.zip'),
    path.join(ROMS_DIR, 'game.nes'), path.join(ROMS_DIR, 'readme.txt')])

  // zip containing only a .txt (no ROM)
  execFileSync('zip', ['-j', path.join(ZIPS_DIR, 'no-rom.zip'), path.join(ROMS_DIR, 'readme.txt')])

  // zip with uppercase extension ROM
  execFileSync('zip', ['-j', path.join(ZIPS_DIR, 'uppercase-ext.zip'), path.join(ROMS_DIR, 'game.GBC')])

  // zip with __MACOSX junk and a real ROM
  execFileSync('zip', ['-r', path.join(ZIPS_DIR, 'macosx-junk.zip'), 'game.gb', '__MACOSX'], { cwd: ROMS_DIR })

  // zip with nested directory structure
  execFileSync('zip', ['-r', path.join(ZIPS_DIR, 'nested.zip'), 'subdir/nested.sfc'], { cwd: ROMS_DIR })
})

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('listZipContents', () => {
  it('lists all files in a valid zip', async () => {
    const contents = await listZipContents(path.join(ZIPS_DIR, 'nes-with-txt.zip'))
    expect(contents).toContain('game.nes')
    expect(contents).toContain('readme.txt')
    expect(contents).toHaveLength(2)
  })

  it('filters out __MACOSX/ resource fork entries', async () => {
    const contents = await listZipContents(path.join(ZIPS_DIR, 'macosx-junk.zip'))
    expect(contents).toContain('game.gb')
    expect(contents.some(e => e.includes('__MACOSX'))).toBe(false)
  })

  it('includes files from nested directories', async () => {
    const contents = await listZipContents(path.join(ZIPS_DIR, 'nested.zip'))
    expect(contents).toContain('subdir/nested.sfc')
  })

  it('throws for non-existent zip path', async () => {
    await expect(listZipContents('/nonexistent/file.zip')).rejects.toThrow()
  })
})

describe('findRomInZip', () => {
  it('finds .gb file when matching extensions are provided', async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, 'single-gb.zip'), ['.gb', '.gbc'])
    expect(result).not.toBeNull()
    expect(result!.entryName).toBe('game.gb')
    expect(result!.extension).toBe('.gb')
  })

  it('finds .nes file and ignores non-matching .txt', async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, 'nes-with-txt.zip'), ['.nes'])
    expect(result).not.toBeNull()
    expect(result!.entryName).toBe('game.nes')
    expect(result!.extension).toBe('.nes')
  })

  it('returns null when no matching extension exists', async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, 'no-rom.zip'), ['.gb', '.nes'])
    expect(result).toBeNull()
  })

  it('ignores __MACOSX/ resource fork entries', async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, 'macosx-junk.zip'), ['.gb'])
    expect(result).not.toBeNull()
    expect(result!.entryName).toBe('game.gb')
  })

  it('matches extensions case-insensitively', async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, 'uppercase-ext.zip'), ['.gbc'])
    expect(result).not.toBeNull()
    expect(result!.entryName).toBe('game.GBC')
    expect(result!.extension).toBe('.gbc')
  })

  it('finds ROM in nested directory inside zip', async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, 'nested.zip'), ['.sfc'])
    expect(result).not.toBeNull()
    expect(result!.entryName).toBe('subdir/nested.sfc')
    expect(result!.extension).toBe('.sfc')
  })
})

describe('extractFileFromZip', () => {
  it('extracts a specific file to the destination directory', async () => {
    const extractedPath = await extractFileFromZip(
      path.join(ZIPS_DIR, 'single-gb.zip'),
      'game.gb',
      EXTRACT_DIR,
    )
    expect(extractedPath).toBe(path.join(EXTRACT_DIR, 'game.gb'))
    expect(fs.existsSync(extractedPath)).toBe(true)
    expect(fs.readFileSync(extractedPath, 'utf-8')).toBe('fake gb rom data')
  })

  it('extracts flat, stripping internal directory paths', async () => {
    const extractedPath = await extractFileFromZip(
      path.join(ZIPS_DIR, 'nested.zip'),
      'subdir/nested.sfc',
      EXTRACT_DIR,
    )
    // Should be flat in EXTRACT_DIR, not in EXTRACT_DIR/subdir/
    expect(extractedPath).toBe(path.join(EXTRACT_DIR, 'nested.sfc'))
    expect(fs.existsSync(extractedPath)).toBe(true)
    expect(fs.readFileSync(extractedPath, 'utf-8')).toBe('fake snes rom')
  })

  it('throws when entry does not exist in the zip', async () => {
    await expect(
      extractFileFromZip(path.join(ZIPS_DIR, 'single-gb.zip'), 'nonexistent.nes', EXTRACT_DIR),
    ).rejects.toThrow()
  })
})
