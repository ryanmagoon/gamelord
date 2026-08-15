const IMPORTED_GAME_SCHEMA_VERSION = 1;

export const MAX_ROM_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORTED_GAMES = 8;
export const MAX_LIBRARY_ENCODED_BYTES = 4 * 1024 * 1024;

export interface ImportedGameRecord {
  readonly schemaVersion: typeof IMPORTED_GAME_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly importedAt: number;
  readonly sha256: string;
  readonly romBase64: string;
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 32_768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

export const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const validateNesRom = (bytes: Uint8Array): void => {
  if (bytes.length < 16) {
    throw new Error("That file is too small to be an NES cartridge.");
  }
  if (bytes.length > MAX_ROM_BYTES) {
    throw new Error("NES cartridges must be 4 MB or smaller.");
  }
  if (bytes[0] !== 0x4e || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1a) {
    throw new Error("That file does not have a valid iNES header.");
  }

  const prgBanks = bytes[4];
  if (prgBanks === 0) {
    throw new Error("That NES cartridge does not contain program data.");
  }

  const isNes2 = (bytes[7] & 0x0c) === 0x08;
  if (!isNes2) {
    const trainerBytes = (bytes[6] & 0x04) === 0x04 ? 512 : 0;
    const expectedBytes = 16 + trainerBytes + prgBanks * 16_384 + bytes[5] * 8192;
    if (bytes.length < expectedBytes) {
      throw new Error("That NES cartridge is truncated.");
    }
  }
};

export const isImportedGameRecord = (value: unknown): value is ImportedGameRecord => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === IMPORTED_GAME_SCHEMA_VERSION &&
    typeof record.id === "string" &&
    record.id.startsWith("imported-") &&
    typeof record.title === "string" &&
    typeof record.fileName === "string" &&
    typeof record.sizeBytes === "number" &&
    record.sizeBytes >= 16 &&
    record.sizeBytes <= MAX_ROM_BYTES &&
    typeof record.importedAt === "number" &&
    typeof record.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(record.sha256) &&
    typeof record.romBase64 === "string" &&
    record.romBase64.length <= Math.ceil((MAX_ROM_BYTES * 4) / 3) + 4
  );
};

export async function createImportedGameRecord(file: File): Promise<ImportedGameRecord> {
  if (file.size > MAX_ROM_BYTES) {
    throw new Error("NES cartridges must be 4 MB or smaller.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  validateNesRom(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = bytesToHex(digest);
  const title = file.name.replace(/\.nes$/i, "").trim() || "Imported NES Game";

  return {
    schemaVersion: IMPORTED_GAME_SCHEMA_VERSION,
    id: `imported-${sha256.slice(0, 20)}`,
    title,
    fileName: file.name,
    sizeBytes: bytes.length,
    importedAt: Date.now(),
    sha256,
    romBase64: bytesToBase64(bytes),
  };
}
