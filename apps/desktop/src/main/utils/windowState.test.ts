// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const MOCK_USER_DATA = "/tmp/gamelord-window-test";

// Hoisted mocks for use in vi.mock factories
const { mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}));

const mockGetBounds = vi.fn().mockReturnValue({ height: 768, width: 1024, x: 100, y: 200 });
const mockSetBounds = vi.fn();
const mockSetSize = vi.fn();
const mockCenter = vi.fn();
const mockMaximize = vi.fn();
const mockSetFullScreen = vi.fn();
const mockIsMaximized = vi.fn().mockReturnValue(false);
const mockIsFullScreen = vi.fn().mockReturnValue(false);
const mockIsDestroyed = vi.fn().mockReturnValue(false);
const mockOn = vi.fn();

const mockGetDisplayMatching = vi.fn().mockReturnValue({
  workArea: { height: 1080, width: 1920, x: 0, y: 0 },
});

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name === "userData") {
        return MOCK_USER_DATA;
      }
      return "/tmp";
    },
  },
  BrowserWindow: vi.fn(),
  screen: {
    getAllDisplays: () => [
      {
        workArea: { height: 1080, width: 1920, x: 0, y: 0 },
      },
    ],
    getDisplayMatching: (...args: Array<unknown>) => mockGetDisplayMatching(...args),
  },
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  },
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

// Import after mocks are set up
import {
  getSavedWindowBounds,
  manageWindowState,
  saveWindowStateNow,
  type WindowStateConfig,
} from "./windowState";
import type { BrowserWindow } from "electron";

function createMockWindow(): BrowserWindow {
  return {
    center: mockCenter,
    getBounds: mockGetBounds,
    isDestroyed: mockIsDestroyed,
    isFullScreen: mockIsFullScreen,
    isMaximized: mockIsMaximized,
    maximize: mockMaximize,
    on: mockOn,
    setBounds: mockSetBounds,
    setFullScreen: mockSetFullScreen,
    setSize: mockSetSize,
  } as unknown as BrowserWindow;
}

const GAME_WINDOW_CONFIG: WindowStateConfig = {
  defaults: {
    x: -1,
    y: -1,
    width: 960,
    height: 720,
    isMaximized: false,
    isFullScreen: false,
  },
  manualCloseSave: true,
  stateFile: "game-window-state.json",
  trackFullScreen: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFileSync.mockReset();
  mockWriteFileSync.mockReset();
  mockIsMaximized.mockReturnValue(false);
  mockIsFullScreen.mockReturnValue(false);
  mockIsDestroyed.mockReturnValue(false);
  mockGetBounds.mockReturnValue({ height: 768, width: 1024, x: 100, y: 200 });
  mockGetDisplayMatching.mockReturnValue({
    workArea: { height: 1080, width: 1920, x: 0, y: 0 },
  });
});

describe("getSavedWindowBounds", () => {
  it("returns default dimensions when no saved state exists", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const bounds = getSavedWindowBounds();
    expect(bounds).toEqual({ height: 800, width: 1280 });
    expect(bounds).not.toHaveProperty("x");
    expect(bounds).not.toHaveProperty("y");
  });

  it("returns saved position and dimensions from disk", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ height: 900, isMaximized: false, width: 1400, x: 50, y: 75 }),
    );

    const bounds = getSavedWindowBounds();
    expect(bounds).toEqual({ height: 900, width: 1400, x: 50, y: 75 });
  });

  it("returns only width/height when saved position is default (-1)", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ height: 700, isMaximized: false, width: 1000, x: -1, y: -1 }),
    );

    const bounds = getSavedWindowBounds();
    expect(bounds).toEqual({ height: 700, width: 1000 });
    expect(bounds).not.toHaveProperty("x");
    expect(bounds).not.toHaveProperty("y");
  });

  it("returns defaults when saved state has invalid JSON", () => {
    mockReadFileSync.mockReturnValue("not json!!!");

    const bounds = getSavedWindowBounds();
    expect(bounds).toEqual({ height: 800, width: 1280 });
  });

  it("uses default values for missing fields in saved state", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ width: 900 }));

    const bounds = getSavedWindowBounds();
    // x and y default to -1, so no position returned
    expect(bounds).toEqual({ height: 800, width: 900 });
  });

  it("clamps position when saved window is off-screen", () => {
    // Position far off-screen — getDisplayMatching returns nearest display
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ height: 768, isMaximized: false, width: 1024, x: 5000, y: 5000 }),
    );

    const bounds = getSavedWindowBounds();
    // Position should be clamped to fit within the 1920x1080 display
    expect(bounds).toEqual({ height: 768, width: 1024, x: 896, y: 312 });
  });

  it("uses custom config defaults and file path", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const bounds = getSavedWindowBounds(GAME_WINDOW_CONFIG);
    expect(bounds).toEqual({ height: 720, width: 960 });

    // Verify it reads from the custom state file
    expect(mockReadFileSync).toHaveBeenCalledWith(
      `${MOCK_USER_DATA}/game-window-state.json`,
      "utf8",
    );
  });

  it("reads saved state from custom config file", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        height: 600,
        isFullScreen: true,
        isMaximized: false,
        width: 800,
        x: 300,
        y: 400,
      }),
    );

    const bounds = getSavedWindowBounds(GAME_WINDOW_CONFIG);
    expect(bounds).toEqual({ height: 600, width: 800, x: 300, y: 400 });
  });

  describe("display clamping", () => {
    it("does not change position when window fits within display", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ height: 600, isMaximized: false, width: 800, x: 100, y: 100 }),
      );

      const bounds = getSavedWindowBounds();
      expect(bounds).toEqual({ height: 600, width: 800, x: 100, y: 100 });
    });

    it("shifts window left when it extends past right edge", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ height: 600, isMaximized: false, width: 800, x: 1500, y: 100 }),
      );

      const bounds = getSavedWindowBounds();
      // x should be clamped to 1920 - 800 = 1120
      expect(bounds).toEqual({ height: 600, width: 800, x: 1120, y: 100 });
    });

    it("shifts window up when it extends past bottom edge", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ height: 600, isMaximized: false, width: 800, x: 100, y: 800 }),
      );

      const bounds = getSavedWindowBounds();
      // y should be clamped to 1080 - 600 = 480
      expect(bounds).toEqual({ height: 600, width: 800, x: 100, y: 480 });
    });

    it("shifts window right when x is before display left edge", () => {
      // Simulate a secondary display at negative x offset
      mockGetDisplayMatching.mockReturnValue({
        workArea: { height: 1080, width: 1920, x: 0, y: 0 },
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ height: 600, isMaximized: false, width: 800, x: -100, y: 100 }),
      );

      const bounds = getSavedWindowBounds();
      expect(bounds).toEqual({ height: 600, width: 800, x: 0, y: 100 });
    });

    it("shrinks width when window is wider than display", () => {
      // Simulate a small laptop display
      mockGetDisplayMatching.mockReturnValue({
        workArea: { height: 768, width: 1366, x: 0, y: 0 },
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ height: 600, isMaximized: false, width: 2560, x: 100, y: 100 }),
      );

      const bounds = getSavedWindowBounds();
      expect(bounds).toEqual({ height: 600, width: 1366, x: 0, y: 100 });
    });

    it("shrinks height when window is taller than display", () => {
      mockGetDisplayMatching.mockReturnValue({
        workArea: { height: 768, width: 1920, x: 0, y: 0 },
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ height: 1200, isMaximized: false, width: 800, x: 100, y: 100 }),
      );

      const bounds = getSavedWindowBounds();
      expect(bounds).toEqual({ height: 768, width: 800, x: 100, y: 0 });
    });

    it("shrinks both dimensions and clamps position for oversized window", () => {
      // Saved from a 4K display, now on a 720p laptop
      mockGetDisplayMatching.mockReturnValue({
        workArea: { height: 720, width: 1280, x: 0, y: 0 },
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ height: 1440, isMaximized: false, width: 2560, x: 500, y: 300 }),
      );

      const bounds = getSavedWindowBounds();
      expect(bounds).toEqual({ height: 720, width: 1280, x: 0, y: 0 });
    });

    it("clamps to secondary display work area with offset", () => {
      // Secondary display positioned to the right at x=1920
      mockGetDisplayMatching.mockReturnValue({
        workArea: { height: 900, width: 1440, x: 1920, y: 0 },
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ height: 600, isMaximized: false, width: 800, x: 3000, y: 500 }),
      );

      const bounds = getSavedWindowBounds();
      // x clamped to 1920 + 1440 - 800 = 2560; y clamped to 0 + 900 - 600 = 300
      expect(bounds).toEqual({ height: 600, width: 800, x: 2560, y: 300 });
    });
  });
});

describe("manageWindowState", () => {
  it("restores saved position and size to the window", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ height: 850, isMaximized: false, width: 1100, x: 200, y: 100 }),
    );

    const window = createMockWindow();
    manageWindowState(window);

    expect(mockSetBounds).toHaveBeenCalledWith({ height: 850, width: 1100, x: 200, y: 100 });
    expect(mockCenter).not.toHaveBeenCalled();
  });

  it("centers the window when no saved position exists", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ height: 800, isMaximized: false, width: 1280, x: -1, y: -1 }),
    );

    const window = createMockWindow();
    manageWindowState(window);

    expect(mockSetBounds).not.toHaveBeenCalled();
    expect(mockSetSize).toHaveBeenCalledWith(1280, 800);
    expect(mockCenter).toHaveBeenCalled();
  });

  it("maximizes the window when saved state was maximized", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ height: 768, isMaximized: true, width: 1024, x: 100, y: 100 }),
    );

    const window = createMockWindow();
    manageWindowState(window);

    expect(mockMaximize).toHaveBeenCalled();
  });

  it("registers event listeners for resize, move, maximize, unmaximize, and close", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const window = createMockWindow();
    manageWindowState(window);

    const registeredEvents = mockOn.mock.calls.map((call: Array<unknown>) => call[0]);
    expect(registeredEvents).toContain("resize");
    expect(registeredEvents).toContain("move");
    expect(registeredEvents).toContain("maximize");
    expect(registeredEvents).toContain("unmaximize");
    expect(registeredEvents).toContain("close");
  });

  it("saves normal bounds on close when not maximized", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const window = createMockWindow();
    manageWindowState(window);

    // Get the 'close' handler
    const closeCall = mockOn.mock.calls.find((call: Array<unknown>) => call[0] === "close");
    expect(closeCall).toBeDefined();

    const closeHandler = closeCall![1] as () => void;
    closeHandler();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      `${MOCK_USER_DATA}/window-state.json`,
      expect.stringContaining('"width": 1024'),
      "utf8",
    );
  });

  it("saves maximized flag on close when maximized", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ height: 768, isMaximized: false, width: 1024, x: 100, y: 200 }),
    );
    mockIsMaximized.mockReturnValue(true);

    const window = createMockWindow();
    manageWindowState(window);

    const closeCall = mockOn.mock.calls.find((call: Array<unknown>) => call[0] === "close");
    const closeHandler = closeCall![1] as () => void;
    closeHandler();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      `${MOCK_USER_DATA}/window-state.json`,
      expect.stringContaining('"isMaximized": true'),
      "utf8",
    );
  });

  it("does not save on close when window is destroyed", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    mockIsDestroyed.mockReturnValue(true);

    const window = createMockWindow();
    manageWindowState(window);

    const closeCall = mockOn.mock.calls.find((call: Array<unknown>) => call[0] === "close");
    const closeHandler = closeCall![1] as () => void;
    closeHandler();

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  describe("with trackFullScreen config", () => {
    it("restores fullscreen state when saved", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          height: 720,
          isFullScreen: true,
          isMaximized: false,
          width: 960,
          x: 100,
          y: 100,
        }),
      );

      const window = createMockWindow();
      manageWindowState(window, GAME_WINDOW_CONFIG);

      expect(mockSetFullScreen).toHaveBeenCalledWith(true);
      expect(mockMaximize).not.toHaveBeenCalled();
    });

    it("registers fullscreen events instead of maximize events", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const window = createMockWindow();
      manageWindowState(window, GAME_WINDOW_CONFIG);

      const registeredEvents = mockOn.mock.calls.map((call: Array<unknown>) => call[0]);
      expect(registeredEvents).toContain("resize");
      expect(registeredEvents).toContain("move");
      expect(registeredEvents).toContain("enter-full-screen");
      expect(registeredEvents).toContain("leave-full-screen");
      expect(registeredEvents).not.toContain("maximize");
      expect(registeredEvents).not.toContain("unmaximize");
    });

    it("defaults isFullScreen to false when missing from saved state", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ height: 720, isMaximized: false, width: 960, x: 100, y: 100 }),
      );

      const window = createMockWindow();
      manageWindowState(window, GAME_WINDOW_CONFIG);

      expect(mockSetFullScreen).not.toHaveBeenCalled();
    });
  });

  describe("with manualCloseSave config", () => {
    it("does not attach a close handler", () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const window = createMockWindow();
      manageWindowState(window, GAME_WINDOW_CONFIG);

      const registeredEvents = mockOn.mock.calls.map((call: Array<unknown>) => call[0]);
      expect(registeredEvents).not.toContain("close");
    });
  });
});

describe("saveWindowStateNow", () => {
  it("saves current bounds when not fullscreen or maximized", () => {
    const window = createMockWindow();
    saveWindowStateNow(window, GAME_WINDOW_CONFIG);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      `${MOCK_USER_DATA}/game-window-state.json`,
      expect.stringContaining('"width": 1024'),
      "utf8",
    );
    const savedState = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(savedState.isFullScreen).toBe(false);
    expect(savedState.isMaximized).toBe(false);
  });

  it("preserves pre-fullscreen bounds when fullscreen", () => {
    mockIsFullScreen.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        height: 720,
        isFullScreen: false,
        isMaximized: false,
        width: 960,
        x: 300,
        y: 400,
      }),
    );

    const window = createMockWindow();
    saveWindowStateNow(window, GAME_WINDOW_CONFIG);

    const savedState = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(savedState.isFullScreen).toBe(true);
    // Should preserve the pre-fullscreen bounds, not the current fullscreen bounds
    expect(savedState.width).toBe(960);
    expect(savedState.height).toBe(720);
  });

  it("does nothing when window is destroyed", () => {
    mockIsDestroyed.mockReturnValue(true);

    const window = createMockWindow();
    saveWindowStateNow(window, GAME_WINDOW_CONFIG);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
