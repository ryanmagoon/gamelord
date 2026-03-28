import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so references survive vi.mock factory hoisting
// ---------------------------------------------------------------------------

const {
  fakeAutoUpdater,
  mockCheckForUpdates,
  mockQuitAndInstall,
  mockWebContentsSend,
  mockGetAllWindows,
  mockGetVersion,
} = vi.hoisted(() => {
  const mockCheckForUpdates = vi.fn().mockResolvedValue(undefined);
  const mockQuitAndInstall = vi.fn();
  const mockWebContentsSend = vi.fn();
  const mockGetAllWindows = vi.fn();
  const mockGetVersion = vi.fn().mockReturnValue("0.1.0");

  // Minimal EventEmitter implementation for the mock — avoids importing
  // node:events inside vi.hoisted() which isn't available at hoist time.
  const listeners = new Map<string, Array<(...args: Array<unknown>) => void>>();

  const fakeAutoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    logger: null as unknown,
    checkForUpdates: mockCheckForUpdates,
    quitAndInstall: mockQuitAndInstall,
    on(event: string, handler: (...args: Array<unknown>) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(handler);
      return fakeAutoUpdater;
    },
    emit(event: string, ...args: Array<unknown>) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
      return true;
    },
    removeAllListeners(event?: string) {
      if (event) {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
      return fakeAutoUpdater;
    },
    listenerCount(event: string) {
      return listeners.get(event)?.length ?? 0;
    },
  };

  return {
    fakeAutoUpdater,
    mockCheckForUpdates,
    mockQuitAndInstall,
    mockWebContentsSend,
    mockGetAllWindows,
    mockGetVersion,
  };
});

vi.mock("electron-updater", () => ({
  autoUpdater: fakeAutoUpdater,
}));

vi.mock("electron", () => ({
  app: {
    getVersion: () => mockGetVersion(),
  },
  BrowserWindow: {
    getAllWindows: (...args: Array<unknown>) => mockGetAllWindows(...args),
  },
}));

vi.mock("../logger", () => ({
  updaterLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Import after mocks are set up
import { AutoUpdaterService } from "./AutoUpdaterService";

describe("AutoUpdaterService", () => {
  let service: AutoUpdaterService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fakeAutoUpdater.removeAllListeners();

    // Default: one window
    mockGetAllWindows.mockReturnValue([{ webContents: { send: mockWebContentsSend } }]);

    service = new AutoUpdaterService();
  });

  afterEach(() => {
    service.cleanup();
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("configures autoUpdater settings", () => {
      expect(fakeAutoUpdater.autoDownload).toBe(true);
      expect(fakeAutoUpdater.autoInstallOnAppQuit).toBe(true);
      expect(fakeAutoUpdater.logger).toBeDefined();
    });

    it("sets allowPrerelease=false for stable versions", () => {
      expect(fakeAutoUpdater.allowPrerelease).toBe(false);
    });

    it("sets allowPrerelease=true for nightly versions", () => {
      fakeAutoUpdater.removeAllListeners();
      fakeAutoUpdater.allowPrerelease = false;
      mockGetVersion.mockReturnValueOnce("0.1.0-nightly.20260328");

      const nightlyService = new AutoUpdaterService();
      expect(fakeAutoUpdater.allowPrerelease).toBe(true);
      nightlyService.cleanup();
    });

    it("sets allowPrerelease=true for any pre-release version", () => {
      fakeAutoUpdater.removeAllListeners();
      fakeAutoUpdater.allowPrerelease = false;
      mockGetVersion.mockReturnValueOnce("0.1.0-beta.1");

      const preService = new AutoUpdaterService();
      expect(fakeAutoUpdater.allowPrerelease).toBe(true);
      preService.cleanup();
    });

    it("registers event listeners on autoUpdater", () => {
      expect(fakeAutoUpdater.listenerCount("checking-for-update")).toBe(1);
      expect(fakeAutoUpdater.listenerCount("update-available")).toBe(1);
      expect(fakeAutoUpdater.listenerCount("update-not-available")).toBe(1);
      expect(fakeAutoUpdater.listenerCount("download-progress")).toBe(1);
      expect(fakeAutoUpdater.listenerCount("update-downloaded")).toBe(1);
      expect(fakeAutoUpdater.listenerCount("error")).toBe(1);
    });
  });

  describe("start", () => {
    it("performs an immediate update check", () => {
      service.start();
      expect(mockCheckForUpdates).toHaveBeenCalledOnce();
    });

    it("schedules periodic checks every 6 hours", () => {
      service.start();
      mockCheckForUpdates.mockClear();

      // After 6 hours, a second check should fire
      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(mockCheckForUpdates).toHaveBeenCalledOnce();

      // After another 6 hours, a third check
      mockCheckForUpdates.mockClear();
      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(mockCheckForUpdates).toHaveBeenCalledOnce();
    });
  });

  describe("event forwarding", () => {
    it("broadcasts 'updates:checking' when checking for updates", () => {
      fakeAutoUpdater.emit("checking-for-update");
      expect(mockWebContentsSend).toHaveBeenCalledWith("updates:checking");
    });

    it("broadcasts 'updates:available' with version info", () => {
      fakeAutoUpdater.emit("update-available", {
        version: "2.0.0",
        releaseDate: "2026-01-15",
        releaseNotes: "Bug fixes",
      });
      expect(mockWebContentsSend).toHaveBeenCalledWith("updates:available", {
        version: "2.0.0",
        releaseDate: "2026-01-15",
        releaseNotes: "Bug fixes",
      });
    });

    it("broadcasts 'updates:not-available' with current version", () => {
      fakeAutoUpdater.emit("update-not-available", { version: "1.0.0" });
      expect(mockWebContentsSend).toHaveBeenCalledWith("updates:not-available", {
        version: "1.0.0",
      });
    });

    it("broadcasts 'updates:download-progress' with progress data", () => {
      fakeAutoUpdater.emit("download-progress", {
        percent: 42.5,
        bytesPerSecond: 1_000_000,
        transferred: 4_250_000,
        total: 10_000_000,
      });
      expect(mockWebContentsSend).toHaveBeenCalledWith("updates:download-progress", {
        percent: 42.5,
        bytesPerSecond: 1_000_000,
        transferred: 4_250_000,
        total: 10_000_000,
      });
    });

    it("broadcasts 'updates:downloaded' with version info", () => {
      fakeAutoUpdater.emit("update-downloaded", {
        version: "2.0.0",
        releaseDate: "2026-01-15",
        releaseNotes: "Bug fixes",
      });
      expect(mockWebContentsSend).toHaveBeenCalledWith("updates:downloaded", {
        version: "2.0.0",
        releaseDate: "2026-01-15",
        releaseNotes: "Bug fixes",
      });
    });

    it("broadcasts 'updates:error' with error message", () => {
      fakeAutoUpdater.emit("error", new Error("Network timeout"));
      expect(mockWebContentsSend).toHaveBeenCalledWith("updates:error", {
        message: "Network timeout",
      });
    });

    it("suppresses 'Unable to find latest version' error from renderer", () => {
      fakeAutoUpdater.emit(
        "error",
        new Error(
          "Unable to find latest version on GitHub (https://github.com/ryanmagoon/gamelord/releases/latest), please ensure a production release exists: HttpError: 406",
        ),
      );
      expect(mockWebContentsSend).not.toHaveBeenCalled();
    });

    it("broadcasts to all open windows", () => {
      const sendA = vi.fn();
      const sendB = vi.fn();
      mockGetAllWindows.mockReturnValueOnce([
        { webContents: { send: sendA } },
        { webContents: { send: sendB } },
      ]);

      fakeAutoUpdater.emit("checking-for-update");

      expect(sendA).toHaveBeenCalledWith("updates:checking");
      expect(sendB).toHaveBeenCalledWith("updates:checking");
    });
  });

  describe("checkForUpdates", () => {
    it("calls autoUpdater.checkForUpdates", async () => {
      await service.checkForUpdates();
      expect(mockCheckForUpdates).toHaveBeenCalledOnce();
    });

    it("does not throw when check fails", async () => {
      mockCheckForUpdates.mockRejectedValueOnce(new Error("offline"));
      await expect(service.checkForUpdates()).resolves.toBeUndefined();
    });
  });

  describe("quitAndInstall", () => {
    it("calls autoUpdater.quitAndInstall", () => {
      service.quitAndInstall();
      expect(mockQuitAndInstall).toHaveBeenCalledOnce();
    });
  });

  describe("cleanup", () => {
    it("clears the periodic check interval", () => {
      service.start();
      mockCheckForUpdates.mockClear();

      service.cleanup();

      // Advancing time should NOT trigger another check
      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(mockCheckForUpdates).not.toHaveBeenCalled();
    });

    it("is safe to call multiple times", () => {
      service.start();
      service.cleanup();
      service.cleanup();
      // No error thrown
    });
  });
});
