import fs from 'node:fs'

interface ImageDimensions {
  width: number
  height: number
}

/**
 * Reads image dimensions from the file header without loading the full image.
 * Supports PNG and JPEG. Returns null for unrecognized formats or read errors.
 */
export async function readImageDimensions(filePath: string): Promise<ImageDimensions | null> {
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      // Read the first 1KB — enough for PNG IHDR and most JPEG SOF markers
      const headerBuffer = Buffer.alloc(1024)
      const bytesRead = fs.readSync(fd, headerBuffer, 0, 1024, 0)
      if (bytesRead < 8) return null // Need at least 8 bytes for PNG signature detection

      const header = headerBuffer.subarray(0, bytesRead)

      // PNG: 8-byte signature + IHDR chunk with width/height at bytes 16–23
      if (isPng(header)) {
        return parsePngDimensions(header)
      }

      // JPEG: starts with 0xFF 0xD8
      if (isJpeg(header)) {
        return parseJpegDimensions(filePath)
      }

      return null
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

/** PNG signature: 137 80 78 71 13 10 26 10 */
function isPng(header: Buffer): boolean {
  return (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4E &&
    header[3] === 0x47 &&
    header[4] === 0x0D &&
    header[5] === 0x0A &&
    header[6] === 0x1A &&
    header[7] === 0x0A
  )
}

/** JPEG starts with SOI marker: 0xFF 0xD8 */
function isJpeg(header: Buffer): boolean {
  return header[0] === 0xFF && header[1] === 0xD8
}

/**
 * PNG IHDR chunk: width is big-endian uint32 at byte 16, height at byte 20.
 */
function parsePngDimensions(header: Buffer): ImageDimensions | null {
  if (header.length < 24) return null
  const width = header.readUInt32BE(16)
  const height = header.readUInt32BE(20)
  if (width === 0 || height === 0) return null
  return { width, height }
}

/**
 * JPEG: scan for a Start of Frame marker (SOF0 0xFFC0 through SOF15 0xFFCF,
 * excluding DHT 0xFFC4 and JPG 0xFFC8). Height and width follow the marker.
 *
 * Reads the full file since SOF can appear well past the first 1KB in JPEGs
 * with large EXIF/APP1 segments.
 */
function parseJpegDimensions(filePath: string): ImageDimensions | null {
  const data = fs.readFileSync(filePath)
  let offset = 2 // Skip SOI marker (0xFF 0xD8)

  while (offset < data.length - 1) {
    // Find next marker (0xFF followed by non-0x00)
    if (data[offset] !== 0xFF) {
      offset++
      continue
    }

    const marker = data[offset + 1]

    // Skip padding bytes (0xFF 0xFF ...)
    if (marker === 0xFF) {
      offset++
      continue
    }

    // SOF markers: 0xC0–0xCF, excluding 0xC4 (DHT) and 0xC8 (JPG extension)
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8) {
      // SOF segment: marker(2) + length(2) + precision(1) + height(2) + width(2)
      if (offset + 9 >= data.length) return null
      const height = data.readUInt16BE(offset + 5)
      const width = data.readUInt16BE(offset + 7)
      if (width === 0 || height === 0) return null
      return { width, height }
    }

    // Skip to next marker using segment length
    if (offset + 3 >= data.length) return null
    const segmentLength = data.readUInt16BE(offset + 2)
    offset += 2 + segmentLength
  }

  return null
}
