// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("logger → Sentry breadcrumb bridge", () => {
  let mockAddBreadcrumb: ReturnType<typeof vi.fn>;
  let hooks: Array<(message: Record<string, unknown>) => unknown>;

  beforeEach(() => {
    mockAddBreadcrumb = vi.fn();
    hooks = [];
    vi.resetModules();

    vi.doMock("@sentry/electron/main", () => ({
      addBreadcrumb: mockAddBreadcrumb,
    }));

    vi.doMock("electron-log/main", () => {
      const mockLog = {
        transports: {
          file: { maxSize: 0, format: "" },
          console: { format: "" },
        },
        hooks,
        scope: vi.fn(() => mockLog),
      };
      return { default: mockLog };
    });
  });

  it("registers a hook on electron-log", async () => {
    await import("./logger");
    expect(hooks.length).toBe(1);
  });

  it("forwards log messages as Sentry breadcrumbs with correct severity", async () => {
    await import("./logger");
    const hook = hooks[0];

    const message = {
      data: ["Core loaded:", "fceumm"],
      level: "info",
      scope: "emulator",
      date: new Date(),
    };

    const result = hook(message);

    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: "log.emulator",
      message: "Core loaded: fceumm",
      level: "info",
    });

    // Hook must return the message to not suppress it
    expect(result).toBe(message);
  });

  it("maps error and warn levels correctly", async () => {
    await import("./logger");
    const hook = hooks[0];

    hook({ data: ["failed"], level: "error", scope: "ipc", date: new Date() });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: "error" }));

    hook({ data: ["caution"], level: "warn", scope: "ipc", date: new Date() });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: "warning" }));
  });

  it("uses 'default' category when scope is undefined", async () => {
    await import("./logger");
    const hook = hooks[0];

    hook({ data: ["hello"], level: "info", date: new Date() });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: "log.default" }),
    );
  });
});
