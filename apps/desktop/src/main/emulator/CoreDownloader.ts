import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";

import { app } from "electron";
import https from "node:https";

import { extractAllFromZip } from "../utils/zip";

/**
 * Map of system IDs to their preferred libretro core name.
 * Used as the default when no specific core is requested.
 */
const PREFERRED_CORES: Record<string, string> = {
  arcade: "mame_libretro",
  gb: "gambatte_libretro",
  gba: "mgba_libretro",
  gbc: "gambatte_libretro",
  genesis: "genesis_plus_gx_libretro",
  n64: "mupen64plus_next_libretro",
  nds: "desmume_libretro",
  nes: "fceumm_libretro",
  psp: "ppsspp_libretro",
  psx: "pcsx_rearmed_libretro",
  saturn: "mednafen_saturn_libretro",
  snes: "snes9x_libretro",
};

/** All known cores per system, in preference order. */
const SYSTEM_CORES: Record<string, Array<string>> = {
  arcade: ["mame_libretro"],
  gb: ["gambatte_libretro", "mgba_libretro"],
  gba: ["mgba_libretro", "vba_next_libretro"],
  gbc: ["gambatte_libretro", "mgba_libretro"],
  genesis: ["genesis_plus_gx_libretro", "picodrive_libretro"],
  n64: ["mupen64plus_next_libretro", "parallel_n64_libretro"],
  nds: ["desmume_libretro"],
  nes: ["fceumm_libretro", "nestopia_libretro", "mesen_libretro"],
  psp: ["ppsspp_libretro"],
  psx: ["pcsx_rearmed_libretro", "mednafen_psx_hw_libretro", "swanstation_libretro"],
  saturn: ["mednafen_saturn_libretro", "yabause_libretro"],
  snes: ["snes9x_libretro", "bsnes_libretro"],
};

/** Human-readable display names for cores. */
const CORE_DISPLAY_NAMES: Record<string, string> = {
  swanstation_libretro: "SwanStation",
  mednafen_psx_hw_libretro: "Beetle PSX HW",
  bsnes_libretro: "bsnes",
  desmume_libretro: "DeSmuME",
  fceumm_libretro: "FCEUmm",
  gambatte_libretro: "Gambatte",
  genesis_plus_gx_libretro: "Genesis Plus GX",
  mame_libretro: "MAME",
  mednafen_saturn_libretro: "Beetle Saturn",
  mesen_libretro: "Mesen",
  mgba_libretro: "mGBA",
  mupen64plus_next_libretro: "Mupen64Plus",
  nestopia_libretro: "Nestopia",
  parallel_n64_libretro: "ParaLLEl N64",
  pcsx_rearmed_libretro: "PCSX ReARMed",
  picodrive_libretro: "PicoDrive",
  ppsspp_libretro: "PPSSPP",
  snes9x_libretro: "Snes9x",
  vba_next_libretro: "VBA-M",
  yabause_libretro: "Yabause",
};

/** Short descriptions for cores. */
const CORE_DESCRIPTIONS: Record<string, string> = {
  bsnes_libretro: "Cycle-accurate. Perfect accuracy, higher CPU usage.",
  swanstation_libretro:
    "High-accuracy PSX emulation with full chtdb cheat support including extended code types.",
  fceumm_libretro: "Accurate and fast NES emulation.",
  gambatte_libretro: "Accurate Game Boy/Color emulation.",
  genesis_plus_gx_libretro: "Accurate Genesis/Mega Drive emulation.",
  mednafen_saturn_libretro:
    "Accurate Saturn emulation. Requires BIOS files (sega_101.bin, mpr-17933.bin).",
  mesen_libretro: "Cycle-accurate NES emulation.",
  mgba_libretro: "Fast and accurate GBA emulation.",
  nestopia_libretro: "High-accuracy NES emulation.",
  picodrive_libretro: "Fast Genesis emulation, Sega CD/32X support.",
  snes9x_libretro: "Fast, highly compatible. Best for most games.",
  yabause_libretro: "Saturn emulation with lower accuracy but lighter hardware requirements.",
};

export interface CoreInfo {
  description: string;
  displayName: string;
  installed: boolean;
  name: string;
}

export interface CoreDownloadProgress {
  coreName: string;
  error?: string;
  percent: number;
  phase: "downloading" | "extracting" | "done" | "error";
  systemId: string;
}

/**
 * Downloads libretro cores from the buildbot on demand and stores them
 * in the app-managed cores directory.
 */
export class CoreDownloader extends EventEmitter {
  private coresDirectory: string;
  private downloading = new Set<string>();

  constructor() {
    super();
    this.coresDirectory = path.join(app.getPath("userData"), "cores");
  }

  /** Returns the app-managed cores directory path, creating it if needed. */
  getCoresDirectory(): string {
    if (!fs.existsSync(this.coresDirectory)) {
      fs.mkdirSync(this.coresDirectory, { recursive: true });
    }
    return this.coresDirectory;
  }

  /** Returns the platform-specific dynamic library extension. */
  private getLibExtension(): string {
    if (process.platform === "darwin") {
      return ".dylib";
    }
    if (process.platform === "win32") {
      return ".dll";
    }
    return ".so";
  }

  /** Returns the buildbot platform string for the current OS and architecture. */
  private getBuildBotPlatform(): string {
    switch (process.platform) {
      case "darwin":
        return process.arch === "arm64" ? "apple/osx/arm64" : "apple/osx/x86_64";
      case "win32":
        return "windows/x86_64";
      case "linux":
        return process.arch === "arm64" ? "linux/aarch64" : "linux/x86_64";
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  /** Returns the buildbot URL for the given core name. */
  private getBuildBotUrl(coreName: string): string {
    const platform = this.getBuildBotPlatform();
    return `https://buildbot.libretro.com/nightly/${platform}/latest/${coreName}${this.getLibExtension()}.zip`;
  }

  /** Returns the preferred core name for a system, or null if unknown. */
  getPreferredCore(systemId: string): string | null {
    return PREFERRED_CORES[systemId] ?? null;
  }

  /** Check if a core is already present in the app-managed directory. */
  hasCoreForSystem(systemId: string): string | null {
    const coreName = PREFERRED_CORES[systemId];
    if (!coreName) {
      return null;
    }

    const corePath = path.join(this.getCoresDirectory(), coreName + this.getLibExtension());
    return fs.existsSync(corePath) ? corePath : null;
  }

  /** Check if a specific core is installed. */
  isCoreInstalled(coreName: string): boolean {
    const corePath = path.join(this.getCoresDirectory(), coreName + this.getLibExtension());
    return fs.existsSync(corePath);
  }

  /** Returns the path to a specific core if it's installed, or null. */
  getCorePath(coreName: string): string | null {
    const corePath = path.join(this.getCoresDirectory(), coreName + this.getLibExtension());
    return fs.existsSync(corePath) ? corePath : null;
  }

  /**
   * Returns info about all known cores for a system, including
   * display name, description, and installation status.
   */
  getCoresForSystem(systemId: string): Array<CoreInfo> {
    const coreNames = SYSTEM_CORES[systemId];
    if (!coreNames) {
      return [];
    }

    return coreNames.map((name) => ({
      description: CORE_DESCRIPTIONS[name] ?? "",
      displayName: CORE_DISPLAY_NAMES[name] ?? name,
      installed: this.isCoreInstalled(name),
      name,
    }));
  }

  /**
   * Downloads the preferred core for the given system ID.
   * Emits 'progress' events with CoreDownloadProgress payloads.
   * Returns the path to the downloaded core .dylib.
   */
  async downloadCoreForSystem(systemId: string): Promise<string> {
    const coreName = PREFERRED_CORES[systemId];
    if (!coreName) {
      throw new Error(`No known core for system: ${systemId}`);
    }

    return this.downloadCore(coreName, systemId);
  }

  /**
   * Downloads a specific core by name.
   * Emits 'progress' events with CoreDownloadProgress payloads.
   * Returns the path to the downloaded core .dylib.
   */
  async downloadCore(coreName: string, systemId: string): Promise<string> {
    // Check if already present
    const existingPath = this.getCorePath(coreName);
    if (existingPath) {
      return existingPath;
    }

    // Prevent duplicate concurrent downloads
    if (this.downloading.has(coreName)) {
      return new Promise((resolve, reject) => {
        const handler = (progress: CoreDownloadProgress) => {
          if (progress.coreName !== coreName) {
            return;
          }
          if (progress.phase === "done") {
            this.off("progress", handler);
            resolve(path.join(this.getCoresDirectory(), coreName + this.getLibExtension()));
          } else if (progress.phase === "error") {
            this.off("progress", handler);
            reject(new Error(progress.error));
          }
        };
        this.on("progress", handler);
      });
    }

    this.downloading.add(coreName);
    const coresDir = this.getCoresDirectory();
    const url = this.getBuildBotUrl(coreName);
    const zipPath = path.join(coresDir, `${coreName}.zip`);
    const corePath = path.join(coresDir, coreName + this.getLibExtension());

    try {
      // Download
      this.emitProgress(coreName, systemId, "downloading", 0);
      await this.downloadFile(url, zipPath, (percent) => {
        this.emitProgress(coreName, systemId, "downloading", percent);
      });

      // Extract
      this.emitProgress(coreName, systemId, "extracting", 90);
      await extractAllFromZip(zipPath, coresDir);

      // Clean up zip
      fs.unlinkSync(zipPath);

      if (!fs.existsSync(corePath)) {
        throw new Error(`Core file not found after extraction: ${corePath}`);
      }

      this.emitProgress(coreName, systemId, "done", 100);
      return corePath;
    } catch (error) {
      // Clean up partial files
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      const message = error instanceof Error ? error.message : String(error);
      this.emitProgress(coreName, systemId, "error", 0, message);
      throw error;
    } finally {
      this.downloading.delete(coreName);
    }
  }

  private emitProgress(
    coreName: string,
    systemId: string,
    phase: CoreDownloadProgress["phase"],
    percent: number,
    error?: string,
  ): void {
    const progress: CoreDownloadProgress = { coreName, error, percent, phase, systemId };
    this.emit("progress", progress);
  }

  /** Downloads a file from url to dest, calling onProgress with 0-100 percent. */
  private downloadFile(
    url: string,
    dest: string,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const follow = (targetUrl: string, redirectCount: number) => {
        if (redirectCount > 5) {
          reject(new Error("Too many redirects"));
          return;
        }

        https
          .get(targetUrl, (response) => {
            // Follow redirects
            if (
              response.statusCode &&
              response.statusCode >= 300 &&
              response.statusCode < 400 &&
              response.headers.location
            ) {
              response.destroy();
              follow(response.headers.location, redirectCount + 1);
              return;
            }

            if (response.statusCode !== 200) {
              response.destroy();
              reject(
                new Error(`Download failed with status ${response.statusCode} for ${targetUrl}`),
              );
              return;
            }

            const totalBytes = Number.parseInt(response.headers["content-length"] ?? "0", 10);
            let downloadedBytes = 0;
            const file = fs.createWriteStream(dest);

            response.on("data", (chunk: Buffer) => {
              downloadedBytes += chunk.length;
              if (totalBytes > 0) {
                onProgress(Math.round((downloadedBytes / totalBytes) * 85));
              }
            });

            response.pipe(file);
            file.on("finish", () => {
              file.close();
              resolve();
            });
            file.on("error", (err) => {
              fs.unlink(dest, () => {
                /* ignore unlink errors during cleanup */
              });
              reject(err);
            });
          })
          .on("error", reject);
      };

      follow(url, 0);
    });
  }
}
