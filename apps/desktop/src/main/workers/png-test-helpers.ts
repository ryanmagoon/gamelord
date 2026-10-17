import { crc32, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface DecodedPng {
  width: number;
  height: number;
  /** Tightly packed RGB pixels, row-major from the top-left. */
  rgb: Uint8Array;
}

/**
 * Minimal PNG decoder for tests. Validates the signature and every chunk
 * CRC, and supports exactly what the thumbnail encoder emits (8-bit RGB,
 * non-interlaced, filter type 0). Throws a descriptive error on anything else
 * so a format change in the encoder fails loudly instead of decoding garbage.
 */
export function decodePng(file: Buffer): DecodedPng {
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a PNG: bad signature");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Array<Buffer> = [];
  let sawEnd = false;

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    const storedCrc = file.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(file.subarray(offset + 4, offset + 8 + length));
    if (storedCrc !== actualCrc) {
      throw new Error(`Bad CRC on ${type} chunk`);
    }

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [bitDepth, colorType, compression, filter, interlace] = data.subarray(8, 13);
      if (
        bitDepth !== 8 ||
        colorType !== 2 ||
        compression !== 0 ||
        filter !== 0 ||
        interlace !== 0
      ) {
        throw new Error(
          `Unsupported IHDR: depth=${bitDepth} color=${colorType} interlace=${interlace}`,
        );
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      sawEnd = true;
    }
    offset += 12 + length;
  }

  if (!sawEnd) {
    throw new Error("PNG missing IEND chunk");
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  if (raw.length !== height * (stride + 1)) {
    throw new Error(`Unexpected image data length ${raw.length} for ${width}x${height}`);
  }

  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    if (raw[rowStart] !== 0) {
      throw new Error(`Unsupported filter type ${raw[rowStart]} on row ${y}`);
    }
    rgb.set(raw.subarray(rowStart + 1, rowStart + 1 + stride), y * stride);
  }

  return { width, height, rgb };
}

/** Builds an RGBA frame where every pixel is produced by `colorAt(x, y)`. */
export function makeFrame(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number],
): { data: Uint8Array; width: number; height: number } {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Reads the RGB triple at (x, y) from a decoded PNG. */
export function pixelAt(image: DecodedPng, x: number, y: number): [number, number, number] {
  const i = (y * image.width + x) * 3;
  return [image.rgb[i], image.rgb[i + 1], image.rgb[i + 2]];
}
