import * as fs from "node:fs";
import * as path from "node:path";
import { createInflateRaw } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

/** Central directory entry parsed from a zip file. */
interface ZipEntry {
  compressedSize: number;
  compressionMethod: number;
  fileName: string;
  localHeaderOffset: number;
  uncompressedSize: number;
}

const EOCD_SIGNATURE = 0x06_05_4b_50;
const CENTRAL_DIR_SIGNATURE = 0x02_01_4b_50;
const LOCAL_HEADER_SIGNATURE = 0x04_03_4b_50;

/** Parse the central directory of a zip file to list entries. */
function parseZipEntries(buf: Buffer): Array<ZipEntry> {
  // Find End of Central Directory record (search backwards from end)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid zip file: EOCD not found");
  }

  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  const entryCount = buf.readUInt16LE(eocdOffset + 10);

  const entries: Array<ZipEntry> = [];
  let offset = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error("Invalid central directory entry");
    }

    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const fileNameLength = buf.readUInt16LE(offset + 28);
    const extraFieldLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const fileName = buf.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    entries.push({
      compressedSize,
      compressionMethod,
      fileName,
      localHeaderOffset,
      uncompressedSize,
    });

    offset += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  return entries;
}

/** Get the offset to the compressed data for a given entry. */
function getDataOffset(buf: Buffer, entry: ZipEntry): number {
  const offset = entry.localHeaderOffset;
  if (buf.readUInt32LE(offset) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error("Invalid local file header");
  }
  const fileNameLength = buf.readUInt16LE(offset + 26);
  const extraFieldLength = buf.readUInt16LE(offset + 28);
  return offset + 30 + fileNameLength + extraFieldLength;
}

/**
 * Lists all file entries inside a zip archive.
 * Filters out directory entries and macOS resource fork junk (`__MACOSX/`).
 */
export async function listZipContents(zipPath: string): Promise<Array<string>> {
  const buf = await fs.promises.readFile(zipPath);
  const entries = parseZipEntries(buf);
  return entries
    .map((e) => e.fileName)
    .filter((name) => !name.endsWith("/") && !name.startsWith("__MACOSX/"));
}

/**
 * Finds the first file inside a zip whose extension matches one of the
 * provided native ROM extensions (e.g. `.gb`, `.nes`).
 */
export async function findRomInZip(
  zipPath: string,
  nativeExtensions: Array<string>,
): Promise<{ entryName: string; extension: string } | null> {
  const entries = await listZipContents(zipPath);
  const extensionSet = new Set(nativeExtensions.map((ext) => ext.toLowerCase()));

  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (extensionSet.has(ext)) {
      return { entryName: entry, extension: ext };
    }
  }

  return null;
}

/**
 * Extracts a single file from a zip archive to a destination directory.
 * Returns the absolute path to the extracted file.
 */
export async function extractFileFromZip(
  zipPath: string,
  entryName: string,
  destDir: string,
): Promise<string> {
  const buf = await fs.promises.readFile(zipPath);
  const entries = parseZipEntries(buf);
  const entry = entries.find((e) => e.fileName === entryName);
  if (!entry) {
    throw new Error(`Entry not found in zip: ${entryName}`);
  }

  const dataOffset = getDataOffset(buf, entry);
  const destPath = path.join(destDir, path.basename(entryName));
  const compressedData = buf.subarray(dataOffset, dataOffset + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    await fs.promises.writeFile(destPath, compressedData);
  } else if (entry.compressionMethod === 8) {
    // Deflated
    const readable = Readable.from(compressedData);
    const writable = fs.createWriteStream(destPath);
    await pipeline(readable, createInflateRaw(), writable);
  } else {
    throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
  }

  return destPath;
}

/**
 * Extracts all files from a zip archive to a destination directory.
 * Strips internal directory paths (extracts flat).
 */
export async function extractAllFromZip(zipPath: string, destDir: string): Promise<Array<string>> {
  const buf = await fs.promises.readFile(zipPath);
  const entries = parseZipEntries(buf);
  const extracted: Array<string> = [];

  for (const entry of entries) {
    // Skip directories and macOS resource forks
    if (entry.fileName.endsWith("/") || entry.fileName.startsWith("__MACOSX/")) {
      continue;
    }

    const dataOffset = getDataOffset(buf, entry);
    const destPath = path.join(destDir, path.basename(entry.fileName));
    const compressedData = buf.subarray(dataOffset, dataOffset + entry.compressedSize);

    if (entry.compressionMethod === 0) {
      await fs.promises.writeFile(destPath, compressedData);
    } else if (entry.compressionMethod === 8) {
      const readable = Readable.from(compressedData);
      const writable = fs.createWriteStream(destPath);
      await pipeline(readable, createInflateRaw(), writable);
    } else {
      throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
    }

    extracted.push(destPath);
  }

  return extracted;
}
