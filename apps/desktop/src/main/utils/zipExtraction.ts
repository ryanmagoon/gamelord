import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

/**
 * Lists all file entries inside a zip archive.
 * Uses `unzip -Z1` (zipinfo mode, filenames only).
 * Filters out directory entries and macOS resource fork junk (`__MACOSX/`).
 */
export async function listZipContents(zipPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('unzip', ['-Z1', zipPath])
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.endsWith('/') && !line.startsWith('__MACOSX/'))
}

/**
 * Finds the first file inside a zip whose extension matches one of the
 * provided native ROM extensions (e.g. `.gb`, `.nes`).
 * Returns the matching entry name and extension, or null if no match.
 */
export async function findRomInZip(
  zipPath: string,
  nativeExtensions: string[],
): Promise<{ entryName: string; extension: string } | null> {
  const entries = await listZipContents(zipPath)
  const extensionSet = new Set(nativeExtensions.map(ext => ext.toLowerCase()))

  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase()
    if (extensionSet.has(ext)) {
      return { entryName: entry, extension: ext }
    }
  }

  return null
}

/**
 * Extracts a single file from a zip archive to a destination directory.
 * Uses `unzip -o -j` to overwrite existing files and strip internal
 * directory paths (extracts flat).
 * Returns the absolute path to the extracted file.
 */
export async function extractFileFromZip(
  zipPath: string,
  entryName: string,
  destDir: string,
): Promise<string> {
  await execFileAsync('unzip', ['-o', '-j', zipPath, entryName, '-d', destDir])
  return path.join(destDir, path.basename(entryName))
}
