// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readImageDimensions } from "./readImageDimensions";

const TEST_DIR = path.join(os.tmpdir(), "gamelord-image-dimensions-test");

/** Build a minimal valid PNG file with the given dimensions. */
function createMinimalPng(width: number, height: number): Buffer {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: 13 bytes of data
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrLength = Buffer.alloc(4);
  ihdrLength.writeUInt32BE(13, 0);

  const ihdrType = Buffer.from("IHDR");

  // CRC (just use zeros — we don't validate it)
  const ihdrCrc = Buffer.alloc(4);

  // IEND chunk
  const iendLength = Buffer.alloc(4); // length 0
  const iendType = Buffer.from("IEND");
  const iendCrc = Buffer.alloc(4);

  return Buffer.concat([
    signature,
    ihdrLength,
    ihdrType,
    ihdrData,
    ihdrCrc,
    iendLength,
    iendType,
    iendCrc,
  ]);
}

/** Build a minimal valid JPEG file with the given dimensions. */
function createMinimalJpeg(width: number, height: number): Buffer {
  // SOI marker
  const soi = Buffer.from([0xff, 0xd8]);

  // SOF0 marker (0xFF 0xC0) with frame header
  const sof0Marker = Buffer.from([0xff, 0xc0]);
  // Length: 8 bytes (2 length + 1 precision + 2 height + 2 width + 1 components)
  const sof0Length = Buffer.alloc(2);
  sof0Length.writeUInt16BE(8, 0);
  const sof0Data = Buffer.alloc(5);
  sof0Data[0] = 8; // precision (8 bits)
  sof0Data.writeUInt16BE(height, 1);
  sof0Data.writeUInt16BE(width, 3);

  // EOI marker
  const eoi = Buffer.from([0xff, 0xd9]);

  return Buffer.concat([soi, sof0Marker, sof0Length, sof0Data, eoi]);
}

/** Build a JPEG with a large APP1 segment before the SOF marker. */
function createJpegWithLargeExif(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);

  // APP1 marker with 2KB of EXIF data
  const app1Marker = Buffer.from([0xff, 0xe1]);
  const app1Size = 2048;
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(app1Size, 0);
  const app1Data = Buffer.alloc(app1Size - 2); // length field counts itself

  // SOF0 after the large APP1 — well past the initial 1KB header read
  const sof0Marker = Buffer.from([0xff, 0xc0]);
  const sof0Length = Buffer.alloc(2);
  sof0Length.writeUInt16BE(8, 0);
  const sof0Data = Buffer.alloc(5);
  sof0Data[0] = 8;
  sof0Data.writeUInt16BE(height, 1);
  sof0Data.writeUInt16BE(width, 3);

  const eoi = Buffer.from([0xff, 0xd9]);

  return Buffer.concat([
    soi,
    app1Marker,
    app1Length,
    app1Data,
    sof0Marker,
    sof0Length,
    sof0Data,
    eoi,
  ]);
}

beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TEST_DIR, { force: true, recursive: true });
});

describe("readImageDimensions", () => {
  describe("PNG", () => {
    it("reads dimensions from a minimal PNG", async () => {
      const filePath = path.join(TEST_DIR, "test.png");
      fs.writeFileSync(filePath, createMinimalPng(640, 480));

      const dimensions = await readImageDimensions(filePath);
      expect(dimensions).toEqual({ height: 480, width: 640 });
    });

    it("reads large PNG dimensions", async () => {
      const filePath = path.join(TEST_DIR, "large.png");
      fs.writeFileSync(filePath, createMinimalPng(3840, 2160));

      const dimensions = await readImageDimensions(filePath);
      expect(dimensions).toEqual({ height: 2160, width: 3840 });
    });

    it("reads non-square PNG dimensions", async () => {
      const filePath = path.join(TEST_DIR, "tall.png");
      fs.writeFileSync(filePath, createMinimalPng(300, 420));

      const dimensions = await readImageDimensions(filePath);
      expect(dimensions).toEqual({ height: 420, width: 300 });
    });
  });

  describe("JPEG", () => {
    it("reads dimensions from a minimal JPEG", async () => {
      const filePath = path.join(TEST_DIR, "test.jpg");
      fs.writeFileSync(filePath, createMinimalJpeg(800, 600));

      const dimensions = await readImageDimensions(filePath);
      expect(dimensions).toEqual({ height: 600, width: 800 });
    });

    it("reads dimensions from JPEG with large EXIF segment", async () => {
      const filePath = path.join(TEST_DIR, "exif.jpg");
      fs.writeFileSync(filePath, createJpegWithLargeExif(1024, 768));

      const dimensions = await readImageDimensions(filePath);
      expect(dimensions).toEqual({ height: 768, width: 1024 });
    });
  });

  describe("error handling", () => {
    it("returns null for non-existent file", async () => {
      const result = await readImageDimensions(path.join(TEST_DIR, "nonexistent.png"));
      expect(result).toBeNull();
    });

    it("returns null for unrecognized format", async () => {
      const filePath = path.join(TEST_DIR, "test.txt");
      fs.writeFileSync(filePath, "not an image");

      const result = await readImageDimensions(filePath);
      expect(result).toBeNull();
    });

    it("returns null for truncated file", async () => {
      const filePath = path.join(TEST_DIR, "truncated.png");
      fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const result = await readImageDimensions(filePath);
      expect(result).toBeNull();
    });

    it("returns null for empty file", async () => {
      const filePath = path.join(TEST_DIR, "empty.png");
      fs.writeFileSync(filePath, Buffer.alloc(0));

      const result = await readImageDimensions(filePath);
      expect(result).toBeNull();
    });
  });
});
