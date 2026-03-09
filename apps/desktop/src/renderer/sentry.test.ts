import { describe, it, expect, vi, beforeEach } from "vitest";

describe("initSentryRenderer", () => {
  let mockElectronInit: ReturnType<typeof vi.fn>;
  let mockBrowserTracingIntegration: ReturnType<typeof vi.fn>;
  let mockReplayIntegration: ReturnType<typeof vi.fn>;
  let mockReactInit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockElectronInit = vi.fn();
    mockBrowserTracingIntegration = vi.fn(() => ({ name: "BrowserTracing" }));
    mockReplayIntegration = vi.fn(() => ({ name: "Replay" }));
    mockReactInit = vi.fn();
    vi.resetModules();

    vi.doMock("@sentry/electron/renderer", () => ({
      init: mockElectronInit,
      browserTracingIntegration: mockBrowserTracingIntegration,
      replayIntegration: mockReplayIntegration,
    }));

    vi.doMock("@sentry/react", () => ({
      init: mockReactInit,
    }));
  });

  it("calls Sentry.init with React integration as second argument", async () => {
    const { initSentryRenderer } = await import("./sentry");
    initSentryRenderer();

    expect(mockElectronInit).toHaveBeenCalledOnce();
    expect(mockElectronInit).toHaveBeenCalledWith(expect.any(Object), mockReactInit);
  });

  it("configures replay to only record on errors", async () => {
    const { initSentryRenderer } = await import("./sentry");
    initSentryRenderer();

    const config = mockElectronInit.mock.calls[0][0];
    expect(config.replaysSessionSampleRate).toBe(0);
    expect(config.replaysOnErrorSampleRate).toBe(1.0);
  });

  it("includes browser tracing and replay integrations", async () => {
    const { initSentryRenderer } = await import("./sentry");
    initSentryRenderer();

    expect(mockBrowserTracingIntegration).toHaveBeenCalled();
    expect(mockReplayIntegration).toHaveBeenCalledWith({
      maskAllText: false,
      blockAllMedia: false,
    });

    const config = mockElectronInit.mock.calls[0][0];
    expect(config.integrations).toHaveLength(2);
  });
});
