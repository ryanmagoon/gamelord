// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBuildFromTemplate = vi.fn().mockReturnValue({ items: [] });
const mockSetApplicationMenu = vi.fn();
const mockOpenExternal = vi.fn();
const mockSend = vi.fn();
const mockGetFocusedWindow = vi.fn();

vi.mock("electron", () => ({
  app: {
    name: "GameLord",
  },
  BrowserWindow: {
    getFocusedWindow: (...args: Array<unknown>) => mockGetFocusedWindow(...args),
  },
  Menu: {
    buildFromTemplate: (...args: Array<unknown>) => mockBuildFromTemplate(...args),
    setApplicationMenu: (...args: Array<unknown>) => mockSetApplicationMenu(...args),
  },
  shell: {
    openExternal: (...args: Array<unknown>) => mockOpenExternal(...args),
  },
}));

import { setupAppMenu } from "./appMenu";

type MenuItem = Electron.MenuItemConstructorOptions;

/** Finds a menu item by predicate, failing the test if not found. */
function findItem(items: Array<MenuItem>, predicate: (item: MenuItem) => boolean): MenuItem {
  const item = items.find(predicate);
  if (!item) {
    throw new Error("Menu item not found");
  }
  return item;
}

/** Invokes a menu item's click handler with dummy Electron arguments. */
function clickItem(item: MenuItem): void {
  // Electron's MenuItem.click signature is (menuItem, browserWindow, event).
  // We use empty objects since the handlers only use BrowserWindow.getFocusedWindow().
  const menuItem = {} as Electron.MenuItem;
  const browserWindow = undefined as unknown as Electron.BrowserWindow;
  const event = {} as Electron.KeyboardEvent;
  item.click?.(menuItem, browserWindow, event);
}

describe("setupAppMenu", () => {
  let template: Array<MenuItem>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFocusedWindow.mockReturnValue({ webContents: { send: mockSend } });
    setupAppMenu();
    template = mockBuildFromTemplate.mock.calls[0][0] as Array<MenuItem>;
  });

  it("builds a menu from the template and sets it as the application menu", () => {
    expect(mockBuildFromTemplate).toHaveBeenCalledOnce();
    expect(mockSetApplicationMenu).toHaveBeenCalledOnce();
  });

  it("has the expected top-level menu labels", () => {
    const labels = template.map((item) => item.label ?? item.role);
    expect(labels).toEqual(["GameLord", "File", "Edit", "View", "Window", "Help"]);
  });

  describe("GameLord menu", () => {
    function submenu() {
      return template[0].submenu as Array<MenuItem>;
    }

    it('has an About item with the "about" role', () => {
      const about = findItem(submenu(), (i) => i.role === "about");
      expect(about.label).toBe("About GameLord");
    });

    it("has a Preferences item with Cmd+, accelerator", () => {
      const prefs = findItem(submenu(), (i) => i.label === "Preferences...");
      expect(prefs.accelerator).toBe("CmdOrCtrl+,");
    });

    it("Preferences sends menu:openSettings IPC to the focused window", () => {
      const prefs = findItem(submenu(), (i) => i.label === "Preferences...");
      clickItem(prefs);
      expect(mockSend).toHaveBeenCalledWith("menu:openSettings");
    });

    it("Preferences does not crash when no window is focused", () => {
      mockGetFocusedWindow.mockReturnValue(null);
      const prefs = findItem(submenu(), (i) => i.label === "Preferences...");
      expect(() => clickItem(prefs)).not.toThrow();
    });

    it("has a Quit item", () => {
      const quit = findItem(submenu(), (i) => i.role === "quit");
      expect(quit).toBeDefined();
    });
  });

  describe("File menu", () => {
    function submenu() {
      return template[1].submenu as Array<MenuItem>;
    }

    it("has Scan Library and Add ROM Folder items", () => {
      const labels = submenu().map((item) => item.label);
      expect(labels).toContain("Scan Library");
      expect(labels).toContain("Add ROM Folder...");
    });

    it("Scan Library sends menu:scanLibrary IPC", () => {
      const scan = findItem(submenu(), (i) => i.label === "Scan Library");
      clickItem(scan);
      expect(mockSend).toHaveBeenCalledWith("menu:scanLibrary");
    });

    it("Add ROM Folder sends menu:addRomFolder IPC", () => {
      const addFolder = findItem(submenu(), (i) => i.label === "Add ROM Folder...");
      clickItem(addFolder);
      expect(mockSend).toHaveBeenCalledWith("menu:addRomFolder");
    });
  });

  describe("Help menu", () => {
    function submenu() {
      return template[5].submenu as Array<MenuItem>;
    }

    it("Report an Issue opens the GitHub issues page", () => {
      const issues = findItem(submenu(), (i) => i.label === "Report an Issue...");
      clickItem(issues);
      expect(mockOpenExternal).toHaveBeenCalledWith(
        "https://github.com/ryanmagoon/gamelord/issues",
      );
    });

    it("Documentation opens the repo README", () => {
      const docs = findItem(submenu(), (i) => i.label === "Documentation");
      clickItem(docs);
      expect(mockOpenExternal).toHaveBeenCalledWith(
        "https://github.com/ryanmagoon/gamelord#readme",
      );
    });
  });
});
