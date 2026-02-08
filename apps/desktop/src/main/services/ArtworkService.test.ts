// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { Readable } from 'stream';

// Mock electron before importing ArtworkService
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return '/tmp/gamelord-test';
      return '/tmp';
    },
  },
}));

// vi.hoisted ensures these are available when vi.mock factory runs (which is hoisted)
const {
  mockCreateReadStream,
  mockCreateWriteStream,
  mockExistsSync,
  mockMkdirSync,
  mockUnlink,
  mockReadFile,
  mockWriteFile,
} = vi.hoisted(() => ({
  mockCreateReadStream: vi.fn(),
  mockCreateWriteStream: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockMkdirSync: vi.fn(),
  mockUnlink: vi.fn(),
  mockReadFile: vi.fn().mockResolvedValue('{}'),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    createReadStream: mockCreateReadStream,
    createWriteStream: mockCreateWriteStream,
    unlink: mockUnlink,
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  createReadStream: mockCreateReadStream,
  createWriteStream: mockCreateWriteStream,
  unlink: mockUnlink,
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
  },
}));

import { ArtworkService } from './ArtworkService';
import { LibraryService } from './LibraryService';
import type { Game } from '../../types/library';
import type { ArtworkProgress } from '../../types/artwork';

function createMockLibraryService(games: Game[] = []): LibraryService {
  const gameMap = new Map(games.map(g => [g.id, { ...g }]));
  return {
    getGame: vi.fn((id: string) => gameMap.get(id)),
    getGames: vi.fn(() => [...gameMap.values()]),
    updateGame: vi.fn(async (id: string, updates: Partial<Game>) => {
      const game = gameMap.get(id);
      if (game) {
        Object.assign(game, updates);
      }
    }),
  } as unknown as LibraryService;
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game1',
    title: 'Super Mario Bros.',
    system: 'Nintendo Entertainment System',
    systemId: 'nes',
    romPath: '/roms/smb.nes',
    ...overrides,
  };
}

/**
 * Wait for any pending microtasks/promises so the constructor's
 * async loadConfig() resolves before we interact with the service.
 */
async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('ArtworkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue('{}');
    mockWriteFile.mockResolvedValue(undefined);
  });

  describe('computeRomHash', () => {
    it('computes the correct MD5 hash via streaming', async () => {
      const testData = Buffer.from('hello world test ROM data');
      const expectedHash = crypto.createHash('md5').update(testData).digest('hex');

      const mockStream = new Readable({
        read() {
          this.push(testData);
          this.push(null);
        },
      });
      mockCreateReadStream.mockReturnValue(mockStream);

      const mockLibrary = createMockLibraryService();
      const service = new ArtworkService(mockLibrary);

      const hash = await service.computeRomHash('/roms/test.nes');
      expect(hash).toBe(expectedHash);
    });

    it('rejects when the file does not exist', async () => {
      const mockStream = new Readable({
        read() {
          this.destroy(new Error('ENOENT: file not found'));
        },
      });
      mockCreateReadStream.mockReturnValue(mockStream);

      const mockLibrary = createMockLibraryService();
      const service = new ArtworkService(mockLibrary);

      await expect(service.computeRomHash('/nonexistent.nes')).rejects.toThrow('ENOENT');
    });
  });

  describe('credentials management', () => {
    it('reports no credentials initially', async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      expect(service.hasCredentials()).toBe(false);
    });

    it('reports credentials after setting them', async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      await service.setCredentials('user', 'pass');
      expect(service.hasCredentials()).toBe(true);
    });

    it('removes credentials on clear', async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      await service.setCredentials('user', 'pass');
      await service.clearCredentials();
      expect(service.hasCredentials()).toBe(false);
    });

    it('persists credentials to config file', async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      await service.setCredentials('myuser', 'mypass');
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/gamelord-test/artwork-config.json',
        expect.stringContaining('"myuser"'),
      );
    });
  });

  describe('syncAllGames', () => {
    it('returns immediately if already syncing', async () => {
      const game = makeGame();
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();

      (service as any).syncing = true;

      const status = await service.syncAllGames();
      expect(status.inProgress).toBe(true);
      expect(status.total).toBe(0);
    });

    it('skips games that already have cover art', async () => {
      const game = makeGame({ coverArt: 'artwork://game1.png' });
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();

      const status = await service.syncAllGames();
      expect(status.processed).toBe(0);
      expect(status.total).toBe(0);
    });

    it('emits syncComplete event when done', async () => {
      const service = new ArtworkService(createMockLibraryService([]));
      await flushPromises();

      const syncCompletePromise = new Promise<any>(resolve => {
        service.on('syncComplete', resolve);
      });

      await service.syncAllGames();
      const status = await syncCompletePromise;
      expect(status.inProgress).toBe(false);
    });

    it('respects cancellation between games', async () => {
      const games = [
        makeGame({ id: 'game1', title: 'Game 1' }),
        makeGame({ id: 'game2', title: 'Game 2' }),
        makeGame({ id: 'game3', title: 'Game 3' }),
      ];
      const service = new ArtworkService(createMockLibraryService(games));
      await flushPromises();

      const progressEvents: ArtworkProgress[] = [];
      service.on('progress', (p: ArtworkProgress) => {
        progressEvents.push(p);
        if (p.current === 1) {
          service.cancelSync();
        }
      });

      await service.syncAllGames();

      // Should have processed at most 1 game before cancellation took effect
      const uniqueGames = new Set(progressEvents.map(p => p.gameId));
      expect(uniqueGames.size).toBeLessThanOrEqual(1);
    });
  });

  describe('getSyncStatus', () => {
    it('reports not syncing by default', async () => {
      const service = new ArtworkService(createMockLibraryService());
      await flushPromises();

      expect(service.getSyncStatus().inProgress).toBe(false);
    });
  });

  describe('getImageExtension', () => {
    it('extracts .png extension from URL', async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as any).getImageExtension('https://example.com/image.png');
      expect(ext).toBe('.png');
    });

    it('extracts .jpg extension from URL', async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as any).getImageExtension('https://example.com/image.jpg');
      expect(ext).toBe('.jpg');
    });

    it('defaults to .png for unknown extensions', async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as any).getImageExtension('https://example.com/image.bmp');
      expect(ext).toBe('.png');
    });

    it('handles URLs with query parameters', async () => {
      const service = new ArtworkService(createMockLibraryService());
      const ext = (service as any).getImageExtension('https://example.com/image.jpeg?quality=80');
      expect(ext).toBe('.jpeg');
    });
  });

  describe('syncGame', () => {
    it('skips game that already has cover art when force is false', async () => {
      const game = makeGame({ coverArt: 'artwork://game1.png' });
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();

      const result = await service.syncGame('game1', false);
      expect(result).toBe(true);
    });

    it('returns false for unknown game ID', async () => {
      const service = new ArtworkService(createMockLibraryService([]));
      await flushPromises();

      const result = await service.syncGame('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when no credentials are configured', async () => {
      const game = makeGame();
      const service = new ArtworkService(createMockLibraryService([game]));
      await flushPromises();

      const result = await service.syncGame('game1');
      expect(result).toBe(false);
    });
  });
});
