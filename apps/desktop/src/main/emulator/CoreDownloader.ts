import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import https from 'https';

const execFileAsync = promisify(execFile);

/**
 * Map of system IDs to their preferred libretro core name.
 * The first core listed for each system is the one that will be downloaded.
 */
const PREFERRED_CORES: Record<string, string> = {
  'nes': 'fceumm_libretro',
  'snes': 'snes9x_libretro',
  'genesis': 'genesis_plus_gx_libretro',
  'gb': 'gambatte_libretro',
  'gbc': 'gambatte_libretro',
  'gba': 'mgba_libretro',
  'n64': 'mupen64plus_next_libretro',
  'psx': 'pcsx_rearmed_libretro',
  'psp': 'ppsspp_libretro',
  'nds': 'desmume_libretro',
  'arcade': 'mame_libretro',
};

export interface CoreDownloadProgress {
  coreName: string;
  systemId: string;
  phase: 'downloading' | 'extracting' | 'done' | 'error';
  percent: number;
  error?: string;
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
    this.coresDirectory = path.join(
      app.getPath('userData'),
      'cores'
    );
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
    if (process.platform === 'darwin') return '.dylib';
    if (process.platform === 'win32') return '.dll';
    return '.so';
  }

  /** Returns the buildbot URL for the given core name. */
  private getBuildBotUrl(coreName: string): string {
    // Currently only macOS ARM64 is supported
    const platform = 'apple/osx/arm64';
    return `https://buildbot.libretro.com/nightly/${platform}/latest/${coreName}${this.getLibExtension()}.zip`;
  }

  /** Returns the preferred core name for a system, or null if unknown. */
  getPreferredCore(systemId: string): string | null {
    return PREFERRED_CORES[systemId] ?? null;
  }

  /** Check if a core is already present in the app-managed directory. */
  hasCoreForSystem(systemId: string): string | null {
    const coreName = PREFERRED_CORES[systemId];
    if (!coreName) return null;

    const corePath = path.join(
      this.getCoresDirectory(),
      coreName + this.getLibExtension()
    );
    return fs.existsSync(corePath) ? corePath : null;
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

    // Check if already present
    const existing = this.hasCoreForSystem(systemId);
    if (existing) return existing;

    // Prevent duplicate concurrent downloads
    if (this.downloading.has(coreName)) {
      return new Promise((resolve, reject) => {
        const handler = (progress: CoreDownloadProgress) => {
          if (progress.coreName !== coreName) return;
          if (progress.phase === 'done') {
            this.off('progress', handler);
            resolve(path.join(this.getCoresDirectory(), coreName + this.getLibExtension()));
          } else if (progress.phase === 'error') {
            this.off('progress', handler);
            reject(new Error(progress.error));
          }
        };
        this.on('progress', handler);
      });
    }

    this.downloading.add(coreName);
    const coresDir = this.getCoresDirectory();
    const url = this.getBuildBotUrl(coreName);
    const zipPath = path.join(coresDir, `${coreName}.zip`);
    const corePath = path.join(coresDir, coreName + this.getLibExtension());

    try {
      // Download
      this.emitProgress(coreName, systemId, 'downloading', 0);
      await this.downloadFile(url, zipPath, (percent) => {
        this.emitProgress(coreName, systemId, 'downloading', percent);
      });

      // Extract
      this.emitProgress(coreName, systemId, 'extracting', 90);
      await execFileAsync('unzip', ['-o', zipPath, '-d', coresDir]);

      // Clean up zip
      fs.unlinkSync(zipPath);

      if (!fs.existsSync(corePath)) {
        throw new Error(`Core file not found after extraction: ${corePath}`);
      }

      this.emitProgress(coreName, systemId, 'done', 100);
      return corePath;
    } catch (error) {
      // Clean up partial files
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

      const message = error instanceof Error ? error.message : String(error);
      this.emitProgress(coreName, systemId, 'error', 0, message);
      throw error;
    } finally {
      this.downloading.delete(coreName);
    }
  }

  private emitProgress(
    coreName: string,
    systemId: string,
    phase: CoreDownloadProgress['phase'],
    percent: number,
    error?: string
  ): void {
    const progress: CoreDownloadProgress = { coreName, systemId, phase, percent, error };
    this.emit('progress', progress);
  }

  /** Downloads a file from url to dest, calling onProgress with 0-100 percent. */
  private downloadFile(
    url: string,
    dest: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const follow = (targetUrl: string, redirectCount: number) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'));
          return;
        }

        https.get(targetUrl, (response) => {
          // Follow redirects
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.destroy();
            follow(response.headers.location, redirectCount + 1);
            return;
          }

          if (response.statusCode !== 200) {
            response.destroy();
            reject(new Error(`Download failed with status ${response.statusCode} for ${targetUrl}`));
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'] ?? '0', 10);
          let downloadedBytes = 0;
          const file = fs.createWriteStream(dest);

          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              onProgress(Math.round((downloadedBytes / totalBytes) * 85));
            }
          });

          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
          file.on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
          });
        }).on('error', reject);
      };

      follow(url, 0);
    });
  }
}
