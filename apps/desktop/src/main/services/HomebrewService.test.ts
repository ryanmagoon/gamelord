// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron before importing HomebrewService
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return '/tmp/gamelord-test';
      if (name === 'home') return '/tmp/home';
      return '/tmp';
    },
    isPackaged: false,
  },
}));

const {
  mockReadFile,
  mockWriteFile,
  mockAccess,
  mockMkdir,
  mockCopyFile,
} = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockAccess: vi.fn(),
  mockMkdir: vi.fn().mockResolvedValue(undefined),
  mockCopyFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    access: mockAccess,
    mkdir: mockMkdir,
    copyFile: mockCopyFile,
  },
}));

// Mock LibraryService
const mockGetGames = vi.fn();
const mockGetConfig = vi.fn();
const mockAddGame = vi.fn();
const mockUpdateGame = vi.fn();

vi.mock('./LibraryService', () => ({
  LibraryService: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.getGames = mockGetGames;
    this.getConfig = mockGetConfig;
    this.addGame = mockAddGame;
    this.updateGame = mockUpdateGame;
  }),
}));

// Mock logger
vi.mock('../logger', () => ({
  libraryLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { HomebrewService } from './HomebrewService';
import { LibraryService } from './LibraryService';

const MANIFEST = [
  {
    filename: 'test-game.nes',
    title: 'Test Game',
    systemId: 'nes',
    developer: 'Test Dev',
    description: 'A test game',
    genre: 'Action',
    players: 1,
    license: 'CC0-1.0',
    attribution: null,
  },
  {
    filename: 'test-golf.nes',
    title: 'Test Golf',
    systemId: 'nes',
    developer: 'Golf Dev',
    description: 'A golf game',
    genre: 'Sports',
    players: 2,
    license: 'CC-BY-4.0',
    attribution: 'Test Golf by Golf Dev, CC BY 4.0',
  },
];

describe('HomebrewService', () => {
  let service: HomebrewService;
  let mockLibraryService: LibraryService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLibraryService = new LibraryService();
    service = new HomebrewService(mockLibraryService);

    // Default: no marker file exists (first run)
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    // Default: empty library
    mockGetGames.mockReturnValue([]);
    // Default: NES system configured
    mockGetConfig.mockReturnValue({
      systems: [{ id: 'nes', name: 'NES', shortName: 'NES', extensions: ['.nes'], romsPath: '/tmp/home/ROMs/NES' }],
      romsBasePath: '/tmp/home/ROMs',
    });
  });

  describe('importIfNeeded', () => {
    it('skips import when marker file exists (already imported)', async () => {
      // Marker file exists
      mockAccess.mockResolvedValueOnce(undefined);

      const result = await service.importIfNeeded();

      expect(result).toBe(false);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('marks as imported without importing when library already has games', async () => {
      mockGetGames.mockReturnValue([{ id: 'existing-game', title: 'Existing' }]);

      const result = await service.importIfNeeded();

      expect(result).toBe(false);
      // Should write the marker file
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/gamelord-test/.homebrew-imported',
        expect.any(String),
      );
    });

    it('imports ROMs when library is empty and no marker exists', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(MANIFEST));
      mockAddGame.mockResolvedValue({ id: 'game1', title: 'Test Game' });

      const result = await service.importIfNeeded();

      expect(result).toBe(true);
      expect(mockCopyFile).toHaveBeenCalledTimes(2);
      expect(mockAddGame).toHaveBeenCalledTimes(2);
    });
  });

  describe('importHomebrewRoms', () => {
    it('reads manifest, copies ROMs, and adds games to library', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(MANIFEST));
      mockAddGame.mockResolvedValueOnce({ id: 'game1', title: 'Test Game' });
      mockAddGame.mockResolvedValueOnce({ id: 'game2', title: 'Test Golf' });

      const result = await service.importHomebrewRoms();

      expect(result).toBe(true);

      // Should create the NES ROMs directory
      expect(mockMkdir).toHaveBeenCalledWith('/tmp/home/ROMs/NES', { recursive: true });

      // Should copy both ROMs
      expect(mockCopyFile).toHaveBeenCalledTimes(2);
      expect(mockCopyFile).toHaveBeenCalledWith(
        expect.stringContaining('test-game.nes'),
        '/tmp/home/ROMs/NES/test-game.nes',
      );

      // Should add both games to library
      expect(mockAddGame).toHaveBeenCalledTimes(2);
      expect(mockAddGame).toHaveBeenCalledWith('/tmp/home/ROMs/NES/test-game.nes', 'nes');
      expect(mockAddGame).toHaveBeenCalledWith('/tmp/home/ROMs/NES/test-golf.nes', 'nes');

      // Should update games with metadata
      expect(mockUpdateGame).toHaveBeenCalledTimes(2);
      expect(mockUpdateGame).toHaveBeenCalledWith('game1', {
        metadata: {
          developer: 'Test Dev',
          description: 'A test game',
          genre: 'Action',
          players: 1,
        },
      });
    });

    it('returns false when manifest is missing', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await service.importHomebrewRoms();

      expect(result).toBe(false);
      expect(mockCopyFile).not.toHaveBeenCalled();
    });

    it('skips copy when ROM already exists at destination', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify([MANIFEST[0]]));

      // ROM file already exists at destination — access resolves
      mockAccess.mockResolvedValueOnce(undefined);

      mockAddGame.mockResolvedValueOnce({ id: 'game1', title: 'Test Game' });

      await service.importHomebrewRoms();

      // Should NOT copy the file since it already exists
      expect(mockCopyFile).not.toHaveBeenCalled();
      // Should still add to library
      expect(mockAddGame).toHaveBeenCalledTimes(1);
    });

    it('continues importing remaining ROMs when one fails', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(MANIFEST));
      // First ROM copy fails
      mockCopyFile.mockRejectedValueOnce(new Error('disk full'));
      // Second ROM copy succeeds
      mockCopyFile.mockResolvedValueOnce(undefined);
      mockAddGame.mockResolvedValueOnce({ id: 'game2', title: 'Test Golf' });

      const result = await service.importHomebrewRoms();

      expect(result).toBe(true);
      // Only the second game should succeed
      expect(mockAddGame).toHaveBeenCalledTimes(1);
    });

    it('returns false when NES ROM directory cannot be created', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(MANIFEST));
      mockMkdir.mockRejectedValueOnce(new Error('permission denied'));

      const result = await service.importHomebrewRoms();

      expect(result).toBe(false);
      expect(mockCopyFile).not.toHaveBeenCalled();
    });

    it('does not update metadata when addGame returns null', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify([MANIFEST[0]]));
      mockAddGame.mockResolvedValueOnce(null);

      await service.importHomebrewRoms();

      expect(mockUpdateGame).not.toHaveBeenCalled();
    });

    it('writes marker file after import', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify(MANIFEST));
      mockAddGame.mockResolvedValue({ id: 'game1', title: 'Test' });

      await service.importHomebrewRoms();

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/gamelord-test/.homebrew-imported',
        expect.any(String),
      );
    });
  });
});
