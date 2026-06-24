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
import { vi } from "vitest";

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
