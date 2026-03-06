// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildFromTemplate = vi.fn().mockReturnValue({ items: [] });
const mockSetApplicationMenu = vi.fn();
const mockOpenExternal = vi.fn();
const mockSend = vi.fn();
const mockGetFocusedWindow = vi.fn();

vi.mock('electron', () => ({
  app: {
    name: 'GameLord',
  },
  BrowserWindow: {
    getFocusedWindow: (...args: unknown[]) => mockGetFocusedWindow(...args),
  },
  Menu: {
    buildFromTemplate: (...args: unknown[]) => mockBuildFromTemplate(...args),
    setApplicationMenu: (...args: unknown[]) => mockSetApplicationMenu(...args),
  },
  shell: {
    openExternal: (...args: unknown[]) => mockOpenExternal(...args),
  },
}));

import { setupAppMenu } from './appMenu';

describe('setupAppMenu', () => {
  let template: Electron.MenuItemConstructorOptions[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFocusedWindow.mockReturnValue({ webContents: { send: mockSend } });
    setupAppMenu();
    template = mockBuildFromTemplate.mock.calls[0][0];
  });

  it('builds a menu from the template and sets it as the application menu', () => {
    expect(mockBuildFromTemplate).toHaveBeenCalledOnce();
    expect(mockSetApplicationMenu).toHaveBeenCalledOnce();
  });

  it('has the expected top-level menu labels', () => {
    const labels = template.map((item) => item.label ?? item.role);
    expect(labels).toEqual([
      'GameLord',
      'File',
      'Edit',
      'View',
      'Window',
      'Help',
    ]);
  });

  describe('GameLord menu', () => {
    it('has an About item with the "about" role', () => {
      const submenu = template[0].submenu as Electron.MenuItemConstructorOptions[];
      const about = submenu.find((item) => item.role === 'about');
      expect(about).toBeDefined();
      expect(about!.label).toBe('About GameLord');
    });

    it('has a Preferences item with Cmd+, accelerator', () => {
      const submenu = template[0].submenu as Electron.MenuItemConstructorOptions[];
      const prefs = submenu.find((item) => item.label === 'Preferences...');
      expect(prefs).toBeDefined();
      expect(prefs!.accelerator).toBe('CmdOrCtrl+,');
    });

    it('Preferences sends menu:openSettings IPC to the focused window', () => {
      const submenu = template[0].submenu as Electron.MenuItemConstructorOptions[];
      const prefs = submenu.find((item) => item.label === 'Preferences...')!;
      prefs.click!(null as any, null as any, null as any);
      expect(mockSend).toHaveBeenCalledWith('menu:openSettings');
    });

    it('Preferences does not crash when no window is focused', () => {
      mockGetFocusedWindow.mockReturnValue(null);
      const submenu = template[0].submenu as Electron.MenuItemConstructorOptions[];
      const prefs = submenu.find((item) => item.label === 'Preferences...')!;
      expect(() => prefs.click!(null as any, null as any, null as any)).not.toThrow();
    });

    it('has a Quit item', () => {
      const submenu = template[0].submenu as Electron.MenuItemConstructorOptions[];
      const quit = submenu.find((item) => item.role === 'quit');
      expect(quit).toBeDefined();
    });
  });

  describe('File menu', () => {
    it('has Scan Library and Add ROM Folder items', () => {
      const submenu = template[1].submenu as Electron.MenuItemConstructorOptions[];
      const labels = submenu.map((item) => item.label);
      expect(labels).toContain('Scan Library');
      expect(labels).toContain('Add ROM Folder...');
    });

    it('Scan Library sends menu:scanLibrary IPC', () => {
      const submenu = template[1].submenu as Electron.MenuItemConstructorOptions[];
      const scan = submenu.find((item) => item.label === 'Scan Library')!;
      scan.click!(null as any, null as any, null as any);
      expect(mockSend).toHaveBeenCalledWith('menu:scanLibrary');
    });

    it('Add ROM Folder sends menu:addRomFolder IPC', () => {
      const submenu = template[1].submenu as Electron.MenuItemConstructorOptions[];
      const addFolder = submenu.find((item) => item.label === 'Add ROM Folder...')!;
      addFolder.click!(null as any, null as any, null as any);
      expect(mockSend).toHaveBeenCalledWith('menu:addRomFolder');
    });
  });

  describe('Help menu', () => {
    it('Report an Issue opens the GitHub issues page', () => {
      const submenu = template[5].submenu as Electron.MenuItemConstructorOptions[];
      const issues = submenu.find((item) => item.label === 'Report an Issue...')!;
      issues.click!(null as any, null as any, null as any);
      expect(mockOpenExternal).toHaveBeenCalledWith(
        'https://github.com/ryanmagoon/gamelord/issues',
      );
    });

    it('Documentation opens the repo README', () => {
      const submenu = template[5].submenu as Electron.MenuItemConstructorOptions[];
      const docs = submenu.find((item) => item.label === 'Documentation')!;
      docs.click!(null as any, null as any, null as any);
      expect(mockOpenExternal).toHaveBeenCalledWith(
        'https://github.com/ryanmagoon/gamelord#readme',
      );
    });
  });
});
