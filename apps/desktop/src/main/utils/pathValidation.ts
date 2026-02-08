import path from 'path'
import fs from 'fs'

const CORE_EXTENSIONS = ['.dylib', '.dll', '.so']

/**
 * Validate that a file path is absolute, exists, and resolves to a location
 * within one of the allowed base directories. Prevents path traversal attacks
 * where a crafted path like "/allowed/../etc/passwd" escapes the sandbox.
 */
function validatePathWithinDirs(filePath: string, allowedDirs: string[]): string {
  if (!path.isAbsolute(filePath)) {
    throw new Error(`Path must be absolute: ${filePath}`)
  }

  const resolved = path.resolve(filePath)

  const withinAllowed = allowedDirs.some((dir) => {
    const resolvedDir = path.resolve(dir)
    return resolved.startsWith(resolvedDir + path.sep) || resolved === resolvedDir
  })

  if (!withinAllowed) {
    throw new Error(
      `Path is outside allowed directories: ${resolved}`,
    )
  }

  return resolved
}

/**
 * Validate a libretro core path. Ensures it:
 * - Is an absolute path
 * - Resolves within one of the allowed core directories
 * - Has a valid shared library extension (.dylib, .dll, .so)
 * - Exists on disk
 */
export function validateCorePath(corePath: string, allowedCoreDirs: string[]): string {
  const resolved = validatePathWithinDirs(corePath, allowedCoreDirs)

  const ext = path.extname(resolved).toLowerCase()
  if (!CORE_EXTENSIONS.includes(ext)) {
    throw new Error(`Invalid core file extension "${ext}". Expected one of: ${CORE_EXTENSIONS.join(', ')}`)
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Core file does not exist: ${resolved}`)
  }

  return resolved
}

/**
 * Validate a ROM file path. Ensures it:
 * - Is an absolute path
 * - Resolves without traversal to an existing file
 * - Exists on disk
 */
export function validateRomPath(romPath: string): string {
  if (!path.isAbsolute(romPath)) {
    throw new Error(`ROM path must be absolute: ${romPath}`)
  }

  const resolved = path.resolve(romPath)

  if (!fs.existsSync(resolved)) {
    throw new Error(`ROM file does not exist: ${resolved}`)
  }

  // Ensure it's a file, not a directory
  const stat = fs.statSync(resolved)
  if (!stat.isFile()) {
    throw new Error(`ROM path is not a file: ${resolved}`)
  }

  return resolved
}
