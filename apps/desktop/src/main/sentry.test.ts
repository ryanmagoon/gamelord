// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("initSentryMain", () => {
  const originalEnv = process.env.SENTRY_DSN;
  let mockInit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockInit = vi.fn();
    delete process.env.SENTRY_DSN;
    vi.resetModules();

    vi.doMock("@sentry/electron/main", () => ({
      init: mockInit,
    }));
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SENTRY_DSN = originalEnv;
    } else {
      delete process.env.SENTRY_DSN;
    }
  });

  it("does not call Sentry.init when SENTRY_DSN is not set", async () => {
    vi.doMock("electron", () => ({
      app: { getVersion: () => "0.1.0", isPackaged: false },
    }));

    const { initSentryMain } = await import("./sentry");
    initSentryMain();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("does not call Sentry.init when SENTRY_DSN is empty", async () => {
    process.env.SENTRY_DSN = "";
    vi.doMock("electron", () => ({
      app: { getVersion: () => "0.1.0", isPackaged: false },
    }));

    const { initSentryMain } = await import("./sentry");
    initSentryMain();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("calls Sentry.init with the DSN when SENTRY_DSN is set", async () => {
    process.env.SENTRY_DSN = "https://abc@sentry.io/123";
    vi.doMock("electron", () => ({
      app: { getVersion: () => "0.1.0", isPackaged: false },
    }));

    const { initSentryMain } = await import("./sentry");
    initSentryMain();

    expect(mockInit).toHaveBeenCalledOnce();
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://abc@sentry.io/123",
        release: "gamelord@0.1.0",
        environment: "development",
      }),
    );
  });

  it("sets environment to production when app.isPackaged is true", async () => {
    process.env.SENTRY_DSN = "https://abc@sentry.io/123";
    vi.doMock("electron", () => ({
      app: { getVersion: () => "0.1.0", isPackaged: true },
    }));

    const { initSentryMain } = await import("./sentry");
    initSentryMain();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "production",
      }),
    );
  });
});
