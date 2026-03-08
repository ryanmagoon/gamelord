/**
 * Global vitest setup — provides auto-mocks for modules that depend on the
 * Electron runtime so tests don't need to individually mock them.
 *
 * @sentry/electron/main and @sentry/electron/renderer import `electron`
 * internally, which doesn't exist in the vitest environment. Providing
 * no-op mocks here prevents transitive import failures (e.g. when a test
 * imports logger.ts → @sentry/electron/main → electron).
 */
import { vi } from "vitest";

vi.mock("@sentry/electron/main", () => ({
  init: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/electron/renderer", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
}));
