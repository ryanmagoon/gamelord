// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createThumbnailPng } from "./save-state-thumbnail";
import { decodePng, makeFrame, pixelAt } from "./png-test-helpers";

const RED: [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];

describe("createThumbnailPng", () => {
  describe("invalid frames", () => {
    it("rejects a frame with zero width", async () => {
      const frame = { data: new Uint8Array(0), width: 0, height: 240 };
      await expect(createThumbnailPng(frame, 4 / 3)).rejects.toThrow(/dimensions/i);
    });

    it("rejects a frame with zero height", async () => {
      const frame = { data: new Uint8Array(0), width: 320, height: 0 };
      await expect(createThumbnailPng(frame, 4 / 3)).rejects.toThrow(/dimensions/i);
    });

    it("rejects a frame whose buffer is smaller than width * height * 4", async () => {
      const frame = { data: new Uint8Array(10 * 10 * 4 - 1), width: 10, height: 10 };
      await expect(createThumbnailPng(frame, 1)).rejects.toThrow(/buffer/i);
    });
  });

  describe("dimensions", () => {
    it("round-trips odd dimensions pixel-for-pixel when no scaling is needed", async () => {
      const frame = makeFrame(3, 5, (x, y) => [x * 80, y * 50, 7]);
      const image = decodePng(await createThumbnailPng(frame, 3 / 5));

      expect(image.width).toBe(3);
      expect(image.height).toBe(5);
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 3; x++) {
          expect(pixelAt(image, x, y)).toEqual([x * 80, y * 50, 7]);
        }
      }
    });

    it("downscales odd source dimensions to a valid image", async () => {
      const frame = makeFrame(641, 479, () => RED);
      const image = decodePng(await createThumbnailPng(frame, 641 / 479));

      expect(image.width).toBe(320);
      expect(image.height).toBe(239);
      expect(pixelAt(image, 319, 238)).toEqual(RED);
    });

    it("downscales a 640x480 frame to 320x240", async () => {
      const image = decodePng(
        await createThumbnailPng(
          makeFrame(640, 480, () => RED),
          4 / 3,
        ),
      );
      expect([image.width, image.height]).toEqual([320, 240]);
    });

    it("does not upscale frames narrower than the thumbnail width", async () => {
      const image = decodePng(
        await createThumbnailPng(
          makeFrame(256, 240, () => RED),
          256 / 240,
        ),
      );
      expect([image.width, image.height]).toEqual([256, 240]);
    });

    it("applies the display aspect ratio for non-square pixels", async () => {
      // 640x240 is a common hi-res interlaced mode displayed at 4:3
      const image = decodePng(
        await createThumbnailPng(
          makeFrame(640, 240, () => RED),
          4 / 3,
        ),
      );
      expect([image.width, image.height]).toEqual([320, 240]);
    });

    it("falls back to the frame's own ratio when the aspect ratio is not positive", async () => {
      const image = decodePng(
        await createThumbnailPng(
          makeFrame(640, 240, () => RED),
          0,
        ),
      );
      expect([image.width, image.height]).toEqual([320, 120]);
    });

    it("never produces a zero-height image for extreme aspect ratios", async () => {
      const image = decodePng(
        await createThumbnailPng(
          makeFrame(640, 1, () => RED),
          10_000,
        ),
      );
      expect([image.width, image.height]).toEqual([320, 1]);
    });
  });

  describe("sampling", () => {
    it("keeps hard edges when halving width", async () => {
      const frame = makeFrame(4, 1, (x) => (x < 2 ? RED : BLUE));
      const image = decodePng(await createThumbnailPng(frame, 2, 2));

      expect([image.width, image.height]).toEqual([2, 1]);
      expect(pixelAt(image, 0, 0)).toEqual(RED);
      expect(pixelAt(image, 1, 0)).toEqual(BLUE);
    });

    it("averages the source pixels covered by each output pixel", async () => {
      const frame = makeFrame(2, 2, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));
      const image = decodePng(await createThumbnailPng(frame, 1, 1));

      expect([image.width, image.height]).toEqual([1, 1]);
      expect(pixelAt(image, 0, 0)).toEqual([128, 128, 128]);
    });
  });
});
