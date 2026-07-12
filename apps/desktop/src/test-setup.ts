/**
 * Global vitest setup — provides auto-mocks for modules that depend on the
 * Electron runtime so tests don't need to individually mock them.
 *
 * @sentry/electron/main, @sentry/electron/renderer, and electron-log/main all
 * import `electron` internally. In CI the Electron binary isn't downloaded, so
 * `electron`'s `getElectronPath()` throws "Electron failed to install
 * correctly" the moment one of these is loaded. Providing no-op mocks here
 * prevents transitive import failures (e.g. when a test imports logger.ts →
 * electron-log/main → electron).
 */
import { beforeEach, afterEach, vi } from "vitest";

/**
 * Spec-compliant in-memory Storage. vitest 4's happy-dom environment installs a
 * file-backed `localStorage` stub (logs `--localstorage-file was provided
 * without a valid path`) missing `getItem`/`removeItem`/`clear`, so any code
 * under test that touches `localStorage` throws. Replace it with a full
 * implementation and reset between tests for isolation.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  globalThis.localStorage?.clear();
  globalThis.sessionStorage?.clear();
});

vi.mock("@sentry/electron/main", () => ({
  init: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("electron-log/main", () => {
  const scoped = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    verbose: vi.fn(),
    debug: vi.fn(),
    silly: vi.fn(),
  };
  const mockLog = {
    ...scoped,
    transports: {
      file: { maxSize: 0, format: "" },
      console: { format: "" },
    },
    hooks: [] as Array<unknown>,
    // Scoped loggers delegate to the same no-op methods.
    scope: vi.fn(() => scoped),
  };
  return { default: mockLog };
});

vi.mock("@sentry/electron/renderer", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
}));
