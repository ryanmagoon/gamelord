import { sdk } from "@theaiplatform/miniapp-sdk/sdk";
import type { TapFederatedSurfaceMountContext } from "@theaiplatform/miniapp-sdk/surface";
import type { EmulatorData } from "jsnes";
import {
  isImportedGameRecord,
  MAX_IMPORTED_GAMES,
  MAX_LIBRARY_ENCODED_BYTES,
  type ImportedGameRecord,
} from "./romLibrary";

const SESSION_SCHEMA_VERSION = 1;
const LIBRARY_SCHEMA_VERSION = 1;
const sessionStorageAddress = { namespace: "gamelord", key: "workspace/continue-v1" } as const;
const libraryStorageAddress = { namespace: "gamelord", key: "workspace/library-v1" } as const;
const previewSessionStorageKey = "gamelord.miniapp.continue-v1";
const previewLibraryStorageKey = "gamelord.miniapp.library-v1";

interface EncodedEmulatorState {
  readonly encoding: "gzip-base64" | "json";
  readonly data: string;
}

export interface SavedSession {
  readonly schemaVersion: typeof SESSION_SCHEMA_VERSION;
  readonly gameId: string;
  readonly savedAt: number;
  readonly state: EncodedEmulatorState;
}

interface ImportedLibrary {
  readonly schemaVersion: typeof LIBRARY_SCHEMA_VERSION;
  readonly games: ReadonlyArray<ImportedGameRecord>;
}

export interface GameLordPersistence {
  loadSession(): Promise<SavedSession | null>;
  saveSession(session: SavedSession): Promise<void>;
  loadLibrary(): Promise<ReadonlyArray<ImportedGameRecord>>;
  saveLibrary(games: ReadonlyArray<ImportedGameRecord>): Promise<void>;
}

interface PersistenceOptions {
  readonly context?: TapFederatedSurfaceMountContext;
  readonly preview?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSavedSession = (value: unknown): value is SavedSession => {
  if (!isRecord(value) || value.schemaVersion !== SESSION_SCHEMA_VERSION) {
    return false;
  }

  const state = value.state;
  return (
    typeof value.gameId === "string" &&
    typeof value.savedAt === "number" &&
    isRecord(state) &&
    (state.encoding === "gzip-base64" || state.encoding === "json") &&
    typeof state.data === "string"
  );
};

const isImportedLibrary = (value: unknown): value is ImportedLibrary => {
  if (!isRecord(value) || value.schemaVersion !== LIBRARY_SCHEMA_VERSION) {
    return false;
  }
  return (
    Array.isArray(value.games) &&
    value.games.length <= MAX_IMPORTED_GAMES &&
    value.games.every(isImportedGameRecord)
  );
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 32_768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export async function encodeEmulatorState(state: EmulatorData): Promise<EncodedEmulatorState> {
  const json = JSON.stringify(state);
  if (typeof CompressionStream === "undefined") {
    return { encoding: "json", data: json };
  }

  const source = new Blob([new TextEncoder().encode(json)]).stream();
  const compressed = await new Response(source.pipeThrough(new CompressionStream("gzip"))).bytes();
  return { encoding: "gzip-base64", data: bytesToBase64(compressed) };
}

export async function decodeEmulatorState(state: EncodedEmulatorState): Promise<EmulatorData> {
  let json = state.data;
  if (state.encoding === "gzip-base64") {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This runtime cannot decompress the saved game.");
    }
    const compressed = base64ToBytes(state.data);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    json = await new Response(stream).text();
  }

  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed) || !isRecord(parsed.cpu) || !isRecord(parsed.ppu)) {
    throw new Error("The saved game is invalid.");
  }
  return parsed as unknown as EmulatorData;
}

export function createSavedSession(gameId: string, state: EncodedEmulatorState): SavedSession {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    gameId,
    savedAt: Date.now(),
    state,
  };
}

const waitForHostAuthority = async (context: TapFederatedSurfaceMountContext): Promise<void> => {
  if (context.hostAuthority.getSnapshot()) {
    return;
  }

  await new Promise<void>((resolve) => {
    let unsubscribe: () => void = () => undefined;
    const confirm = () => {
      if (!context.hostAuthority.getSnapshot()) {
        return;
      }
      unsubscribe();
      resolve();
    };
    unsubscribe = context.hostAuthority.subscribe(confirm);
    confirm();
  });
};

const waitForHostFrame = async (): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, 75));

const runHostStorageAction = async <Result>(
  context: TapFederatedSurfaceMountContext,
  action: () => Promise<Result> | Result,
): Promise<Result> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForHostAuthority(context);
    try {
      return await action();
    } catch (error) {
      const frameIsStarting =
        error instanceof Error && error.message.includes("frame is not ready for host actions");
      if (!frameIsStarting || attempt === 3) {
        throw error;
      }
      await waitForHostFrame();
    }
  }
  throw new Error("TAP storage is unavailable.");
};

export function createGameLordPersistence({
  context,
  preview = false,
}: PersistenceOptions = {}): GameLordPersistence {
  let writeQueue = Promise.resolve();

  return {
    async loadSession() {
      if (preview) {
        const raw = globalThis.localStorage?.getItem(previewSessionStorageKey);
        if (!raw) {
          return null;
        }
        try {
          const parsed: unknown = JSON.parse(raw);
          return isSavedSession(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }

      if (!context) {
        throw new Error("TAP storage is unavailable.");
      }
      const entry = await runHostStorageAction(context, () =>
        sdk.storage.get(sessionStorageAddress),
      );
      return isSavedSession(entry.value) ? entry.value : null;
    },
    async saveSession(session) {
      const write = writeQueue.then(async () => {
        if (preview) {
          globalThis.localStorage?.setItem(previewSessionStorageKey, JSON.stringify(session));
          return;
        }

        if (!context) {
          throw new Error("TAP storage is unavailable.");
        }
        await runHostStorageAction(context, async () => {
          const current = await sdk.storage.get(sessionStorageAddress);
          await sdk.storage.set({
            ...sessionStorageAddress,
            expectedRevision: current.revision,
            value: structuredClone(session) as never,
          });
        });
      });
      writeQueue = write.catch(() => undefined);
      await write;
    },
    async loadLibrary() {
      if (preview) {
        const raw = globalThis.localStorage?.getItem(previewLibraryStorageKey);
        if (!raw) {
          return [];
        }
        try {
          const parsed: unknown = JSON.parse(raw);
          return isImportedLibrary(parsed) ? parsed.games : [];
        } catch {
          return [];
        }
      }

      if (!context) {
        throw new Error("TAP storage is unavailable.");
      }
      const entry = await runHostStorageAction(context, () =>
        sdk.storage.get(libraryStorageAddress),
      );
      return isImportedLibrary(entry.value) ? entry.value.games : [];
    },
    async saveLibrary(games) {
      if (games.length > MAX_IMPORTED_GAMES) {
        throw new Error(`You can keep up to ${MAX_IMPORTED_GAMES} imported cartridges.`);
      }
      const encodedBytes = games.reduce((total, game) => total + game.romBase64.length, 0);
      if (encodedBytes > MAX_LIBRARY_ENCODED_BYTES) {
        throw new Error("Your personal cartridge library is full.");
      }
      const library: ImportedLibrary = {
        schemaVersion: LIBRARY_SCHEMA_VERSION,
        games,
      };
      const write = writeQueue.then(async () => {
        if (preview) {
          globalThis.localStorage?.setItem(previewLibraryStorageKey, JSON.stringify(library));
          return;
        }

        if (!context) {
          throw new Error("TAP storage is unavailable.");
        }
        await runHostStorageAction(context, async () => {
          const current = await sdk.storage.get(libraryStorageAddress);
          await sdk.storage.set({
            ...libraryStorageAddress,
            expectedRevision: current.revision,
            value: structuredClone(library) as never,
          });
        });
      });
      writeQueue = write.catch(() => undefined);
      await write;
    },
  };
}
