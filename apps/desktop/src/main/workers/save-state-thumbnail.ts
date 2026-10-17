/**
 * Save state thumbnail generation: downscale an RGBA video frame and encode
 * it as a PNG using only Node built-ins (zlib deflate + crc32).
 *
 * Deflate runs on the libuv threadpool, so the worker's event loop (and the
 * emulation loop it drives) only pays for the downscale, which is bounded by
 * the thumbnail size rather than the source frame size.
 */

import { promisify } from "node:util";
import { crc32, deflate } from "node:zlib";

export interface RgbaFrame {
  data: Uint8Array;
  width: number;
  height: number;
}

export const THUMBNAIL_MAX_WIDTH = 320;

const deflateAsync = promisify(deflate);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Downscale `frame` to at most `maxWidth` pixels wide at the given display
 * aspect ratio and encode it as an 8-bit RGB PNG.
 *
 * @param aspectRatio Display aspect ratio (width / height) from the core's AV
 *   info. Non-positive values fall back to the frame's pixel dimensions.
 */
export async function createThumbnailPng(
  frame: RgbaFrame,
  aspectRatio: number,
  maxWidth = THUMBNAIL_MAX_WIDTH,
): Promise<Buffer> {
  const { width, height, data } = frame;
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid frame dimensions ${width}x${height}`);
  }
  if (data.length < width * height * 4) {
    throw new Error(`Frame buffer too small: ${data.length} bytes for ${width}x${height} RGBA`);
  }

  const displayRatio = aspectRatio > 0 ? aspectRatio : width / height;
  const outWidth = Math.min(maxWidth, width);
  const outHeight = Math.max(1, Math.round(outWidth / displayRatio));

  return encodePng(downscale(frame, outWidth, outHeight), outWidth, outHeight);
}

/**
 * Box-filter resample from RGBA to RGB. Each output pixel averages the source
 * pixels it covers; when an axis is stretched rather than shrunk, the span is
 * a single source pixel (nearest neighbour), which keeps pixel art crisp.
 * Rows are prefixed with a PNG filter byte (0 = none) so the result can be
 * deflated directly.
 */
function downscale(frame: RgbaFrame, outWidth: number, outHeight: number): Uint8Array {
  const { data, width, height } = frame;
  const stride = outWidth * 3 + 1;
  const out = new Uint8Array(stride * outHeight);

  for (let oy = 0; oy < outHeight; oy++) {
    const y0 = Math.floor((oy * height) / outHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * height) / outHeight));
    let o = oy * stride + 1;

    for (let ox = 0; ox < outWidth; ox++) {
      const x0 = Math.floor((ox * width) / outWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * width) / outWidth));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      out[o++] = Math.round(r / count);
      out[o++] = Math.round(g / count);
      out[o++] = Math.round(b / count);
    }
  }

  return out;
}

async function encodePng(filteredRows: Uint8Array, width: number, height: number): Promise<Buffer> {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: truecolor RGB
  // compression, filter method, interlace: all 0

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", await deflateAsync(filteredRows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}
