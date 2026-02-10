import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

/**
 * Resolve the path to the native libretro addon without loading it.
 *
 * Searches the same candidate locations as `LibretroNativeCore.loadNativeAddon()`
 * but only checks file existence — the addon itself is loaded inside the
 * emulation worker process, not the main process.
 *
 * @returns Absolute path to the `.node` addon file.
 * @throws If no addon file is found at any candidate path.
 */
export function resolveAddonPath(): string {
  const possiblePaths = [
    // Development: node-gyp build output
    path.join(__dirname, '../../native/build/Release/gamelord_libretro.node'),
    // Packaged: extraResource places it directly in Resources/
    path.join(process.resourcesPath || '', 'gamelord_libretro.node'),
    // Fallback: relative to app root
    path.join(app.getAppPath(), 'native/build/Release/gamelord_libretro.node'),
  ]

  for (const candidatePath of possiblePaths) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath
    }
  }

  throw new Error(
    'Failed to locate libretro native addon. Searched:\n' +
      possiblePaths.join('\n'),
  )
}
