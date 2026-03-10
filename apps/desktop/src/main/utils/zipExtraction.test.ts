import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { listZipContents, findRomInZip, extractFileFromZip } from "./zipExtraction";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { deflateRawSync } from "node:zlib";

const TEST_DIR = path.join(os.tmpdir(), "gamelord-zip-extraction-test");
const ZIPS_DIR = path.join(TEST_DIR, "zips");
const EXTRACT_DIR = path.join(TEST_DIR, "extract");

/**
 * Creates a zip file programmatically using Node's built-in zlib.
 * Each entry is { name: string, data: Buffer }.
 * This avoids depending on the system `zip` CLI (not available on Windows).
 */
function createZipSync(destPath: string, entries: Array<{ name: string; data: Buffer }>) {
  const parts: Array<Buffer> = [];
  const centralDir: Array<Buffer> = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04_03_4b_50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // compression method (deflate)
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc32(entry.data), 14); // crc-32
    local.writeUInt32LE(compressed.length, 18); // compressed size
    local.writeUInt32LE(entry.data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26); // file name length
    local.writeUInt16LE(0, 28); // extra field length
    nameBytes.copy(local, 30);

    parts.push(local, compressed);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02_01_4b_50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // compression method
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(crc32(entry.data), 16); // crc-32
    central.writeUInt32LE(compressed.length, 20); // compressed size
    central.writeUInt32LE(entry.data.length, 24); // uncompressed size
    central.writeUInt16LE(nameBytes.length, 28); // file name length
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal file attributes
    central.writeUInt32LE(0, 38); // external file attributes
    central.writeUInt32LE(offset, 42); // local header offset
    nameBytes.copy(central, 46);

    centralDir.push(central);
    offset += local.length + compressed.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const cd of centralDir) {
    centralDirSize += cd.length;
  }

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06_05_4b_50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12); // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  fs.writeFileSync(destPath, Buffer.concat([...parts, ...centralDir, eocd]));
}

/** CRC-32 implementation for zip file creation. */
function crc32(buf: Buffer): number {
  let crc = 0xff_ff_ff_ff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xed_b8_83_20 : crc >>> 1;
    }
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

beforeAll(() => {
  fs.mkdirSync(ZIPS_DIR, { recursive: true });
  fs.mkdirSync(EXTRACT_DIR, { recursive: true });

  // zip containing a single .gb ROM
  createZipSync(path.join(ZIPS_DIR, "single-gb.zip"), [
    { name: "game.gb", data: Buffer.from("fake gb rom data") },
  ]);

  // zip containing a .nes ROM and a .txt (non-ROM)
  createZipSync(path.join(ZIPS_DIR, "nes-with-txt.zip"), [
    { name: "game.nes", data: Buffer.from("fake nes rom data") },
    { name: "readme.txt", data: Buffer.from("not a rom") },
  ]);

  // zip containing only a .txt (no ROM)
  createZipSync(path.join(ZIPS_DIR, "no-rom.zip"), [
    { name: "readme.txt", data: Buffer.from("not a rom") },
  ]);

  // zip with uppercase extension ROM
  createZipSync(path.join(ZIPS_DIR, "uppercase-ext.zip"), [
    { name: "game.GBC", data: Buffer.from("fake gbc rom uppercase") },
  ]);

  // zip with __MACOSX junk and a real ROM
  createZipSync(path.join(ZIPS_DIR, "macosx-junk.zip"), [
    { name: "game.gb", data: Buffer.from("fake gb rom data") },
    { name: "__MACOSX/._game.gb", data: Buffer.from("macos resource fork") },
  ]);

  // zip with nested directory structure
  createZipSync(path.join(ZIPS_DIR, "nested.zip"), [
    { name: "subdir/nested.sfc", data: Buffer.from("fake snes rom") },
  ]);
});

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("listZipContents", () => {
  it("lists all files in a valid zip", async () => {
    const contents = await listZipContents(path.join(ZIPS_DIR, "nes-with-txt.zip"));
    expect(contents).toContain("game.nes");
    expect(contents).toContain("readme.txt");
    expect(contents).toHaveLength(2);
  });

  it("filters out __MACOSX/ resource fork entries", async () => {
    const contents = await listZipContents(path.join(ZIPS_DIR, "macosx-junk.zip"));
    expect(contents).toContain("game.gb");
    expect(contents.some((e) => e.includes("__MACOSX"))).toBe(false);
  });

  it("includes files from nested directories", async () => {
    const contents = await listZipContents(path.join(ZIPS_DIR, "nested.zip"));
    expect(contents).toContain("subdir/nested.sfc");
  });

  it("throws for non-existent zip path", async () => {
    await expect(listZipContents("/nonexistent/file.zip")).rejects.toThrow();
  });
});

/** Assert a value is non-null and return it with narrowed type. */
function assertDefined<T>(
  value: T | null | undefined,
  message = "Expected value to be defined",
): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

describe("findRomInZip", () => {
  it("finds .gb file when matching extensions are provided", async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, "single-gb.zip"), [".gb", ".gbc"]);
    expect(result).not.toBeNull();
    expect(assertDefined(result).entryName).toBe("game.gb");
    expect(assertDefined(result).extension).toBe(".gb");
  });

  it("finds .nes file and ignores non-matching .txt", async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, "nes-with-txt.zip"), [".nes"]);
    expect(result).not.toBeNull();
    expect(assertDefined(result).entryName).toBe("game.nes");
    expect(assertDefined(result).extension).toBe(".nes");
  });

  it("returns null when no matching extension exists", async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, "no-rom.zip"), [".gb", ".nes"]);
    expect(result).toBeNull();
  });

  it("ignores __MACOSX/ resource fork entries", async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, "macosx-junk.zip"), [".gb"]);
    expect(result).not.toBeNull();
    expect(assertDefined(result).entryName).toBe("game.gb");
  });

  it("matches extensions case-insensitively", async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, "uppercase-ext.zip"), [".gbc"]);
    expect(result).not.toBeNull();
    expect(assertDefined(result).entryName).toBe("game.GBC");
    expect(assertDefined(result).extension).toBe(".gbc");
  });

  it("finds ROM in nested directory inside zip", async () => {
    const result = await findRomInZip(path.join(ZIPS_DIR, "nested.zip"), [".sfc"]);
    expect(result).not.toBeNull();
    expect(assertDefined(result).entryName).toBe("subdir/nested.sfc");
    expect(assertDefined(result).extension).toBe(".sfc");
  });
});

describe("extractFileFromZip", () => {
  it("extracts a specific file to the destination directory", async () => {
    const extractedPath = await extractFileFromZip(
      path.join(ZIPS_DIR, "single-gb.zip"),
      "game.gb",
      EXTRACT_DIR,
    );
    expect(extractedPath).toBe(path.join(EXTRACT_DIR, "game.gb"));
    expect(fs.existsSync(extractedPath)).toBe(true);
    expect(fs.readFileSync(extractedPath, "utf8")).toBe("fake gb rom data");
  });

  it("extracts flat, stripping internal directory paths", async () => {
    const extractedPath = await extractFileFromZip(
      path.join(ZIPS_DIR, "nested.zip"),
      "subdir/nested.sfc",
      EXTRACT_DIR,
    );
    // Should be flat in EXTRACT_DIR, not in EXTRACT_DIR/subdir/
    expect(extractedPath).toBe(path.join(EXTRACT_DIR, "nested.sfc"));
    expect(fs.existsSync(extractedPath)).toBe(true);
    expect(fs.readFileSync(extractedPath, "utf8")).toBe("fake snes rom");
  });

  it("throws when entry does not exist in the zip", async () => {
    await expect(
      extractFileFromZip(path.join(ZIPS_DIR, "single-gb.zip"), "nonexistent.nes", EXTRACT_DIR),
    ).rejects.toThrow();
  });
});
