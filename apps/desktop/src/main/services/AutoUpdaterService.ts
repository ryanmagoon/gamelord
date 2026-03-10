import { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateInfo, ProgressInfo } from "electron-updater";
import { updaterLog } from "../logger";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Manages automatic update checks and downloads via electron-updater.
 * Forwards update lifecycle events to all renderer windows via IPC.
 */
export class AutoUpdaterService {
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = updaterLog;

    this.setupEventForwarding();
  }

  /**
   * Start checking for updates — call once after app is ready.
   * Performs an immediate check and schedules periodic checks.
   */
  start(): void {
    updaterLog.info("Auto-updater started");

    // Initial check (silent — errors are logged, not surfaced)
    this.checkForUpdates();

    // Periodic checks
    this.checkTimer = setInterval(() => {
      this.checkForUpdates();
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Manually trigger an update check. Called from IPC when the user
   * clicks "Check for Updates" in Settings.
   */
  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      updaterLog.error("Update check failed:", error);
    }
  }

  /**
   * Quit the app and install the downloaded update.
   */
  quitAndInstall(): void {
    updaterLog.info("Quitting and installing update");
    autoUpdater.quitAndInstall();
  }

  /**
   * Stop periodic checks. Call during app shutdown.
   */
  cleanup(): void {
    if (this.checkTimer !== null) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  private setupEventForwarding(): void {
    autoUpdater.on("checking-for-update", () => {
      updaterLog.info("Checking for update...");
      this.broadcast("updates:checking");
    });

    autoUpdater.on("update-available", (info: UpdateInfo) => {
      updaterLog.info(`Update available: v${info.version}`);
      this.broadcast("updates:available", {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on("update-not-available", (info: UpdateInfo) => {
      updaterLog.info(`Already up to date: v${info.version}`);
      this.broadcast("updates:not-available", {
        version: info.version,
      });
    });

    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
      this.broadcast("updates:download-progress", {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
      updaterLog.info(`Update downloaded: v${info.version}`);
      this.broadcast("updates:downloaded", {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on("error", (error: Error) => {
      updaterLog.error("Auto-update error:", error.message);
      this.broadcast("updates:error", {
        message: error.message,
      });
    });
  }

  private broadcast(channel: string, data?: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (data !== undefined) {
        window.webContents.send(channel, data);
      } else {
        window.webContents.send(channel);
      }
    }
  }
}
