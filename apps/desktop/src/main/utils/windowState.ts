import { app, BrowserWindow, screen } from "electron";
import fs from "node:fs";
import path from "node:path";
import { mainLog } from "../logger";

interface WindowState {
  height: number;
  isFullScreen: boolean;
  isMaximized: boolean;
  width: number;
  x: number;
  y: number;
}

export interface WindowStateConfig {
  /** Default state when no saved file exists. */
  defaults: WindowState;
  /**
   * If true, the caller is responsible for saving state on close via
   * `saveWindowStateNow`. `manageWindowState` will not attach a `close`
   * listener. Useful when the window has a custom close flow (e.g.
   * shutdown animation) that could corrupt saved bounds.
   */
  manualCloseSave?: boolean;
  /** File name stored in the userData directory. */
  stateFile: string;
  /** Track fullscreen instead of maximized state. */
  trackFullScreen?: boolean;
}

export const MAIN_WINDOW_CONFIG: WindowStateConfig = {
  defaults: {
    x: -1,
    y: -1,
    width: 1280,
    height: 800,
    isMaximized: false,
    isFullScreen: false,
  },
  stateFile: "window-state.json",
};

interface Bounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

/**
 * Clamp window bounds so the window fits entirely within the nearest
 * display's work area. Shrinks width/height if they exceed the display,
 * then shifts x/y so nothing hangs off-screen.
 */
function clampToNearestDisplay(bounds: Bounds): Bounds {
  const display = screen.getDisplayMatching(bounds as Electron.Rectangle);
  const wa = display.workArea;

  const width = Math.min(bounds.width, wa.width);
  const height = Math.min(bounds.height, wa.height);
  const x = Math.max(wa.x, Math.min(bounds.x, wa.x + wa.width - width));
  const y = Math.max(wa.y, Math.min(bounds.y, wa.y + wa.height - height));

  return { height, width, x, y };
}

function loadWindowState(config: WindowStateConfig = MAIN_WINDOW_CONFIG): WindowState {
  const filePath = path.join(app.getPath("userData"), config.stateFile);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WindowState>;

    const state: WindowState = {
      height: typeof parsed.height === "number" ? parsed.height : config.defaults.height,
      isFullScreen:
        typeof parsed.isFullScreen === "boolean"
          ? parsed.isFullScreen
          : config.defaults.isFullScreen,
      isMaximized:
        typeof parsed.isMaximized === "boolean" ? parsed.isMaximized : config.defaults.isMaximized,
      width: typeof parsed.width === "number" ? parsed.width : config.defaults.width,
      x: typeof parsed.x === "number" ? parsed.x : config.defaults.x,
      y: typeof parsed.y === "number" ? parsed.y : config.defaults.y,
    };

    // Clamp saved bounds to the nearest display so the window is never
    // off-screen or larger than the available work area.
    if (state.x !== -1 && state.y !== -1) {
      const clamped = clampToNearestDisplay({
        height: state.height,
        width: state.width,
        x: state.x,
        y: state.y,
      });
      state.x = clamped.x;
      state.y = clamped.y;
      state.width = clamped.width;
      state.height = clamped.height;
    }

    return state;
  } catch {
    return { ...config.defaults };
  }
}

function saveWindowState(state: WindowState, config: WindowStateConfig = MAIN_WINDOW_CONFIG): void {
  const filePath = path.join(app.getPath("userData"), config.stateFile);
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    mainLog.error("Failed to save window state:", error);
  }
}

/**
 * Save current window state to disk immediately. Use this when the caller
 * manages its own close lifecycle (e.g. `manualCloseSave: true`).
 */
export function saveWindowStateNow(window: BrowserWindow, config: WindowStateConfig): void {
  if (window.isDestroyed()) {
    return;
  }

  const isFullScreen = config.trackFullScreen ? window.isFullScreen() : false;
  const isMaximized = !config.trackFullScreen ? window.isMaximized() : false;

  if (!isFullScreen && !isMaximized) {
    const bounds = window.getBounds();
    saveWindowState(
      {
        height: bounds.height,
        isFullScreen: false,
        isMaximized: false,
        width: bounds.width,
        x: bounds.x,
        y: bounds.y,
      },
      config,
    );
  } else {
    const existing = loadWindowState(config);
    saveWindowState(
      {
        ...existing,
        isFullScreen,
        isMaximized,
      },
      config,
    );
  }
}

/**
 * Attach window state tracking to a BrowserWindow.
 *
 * Listens for resize/move/maximize/close events and persists the window
 * bounds so they can be restored on the next launch.
 */
export function manageWindowState(
  window: BrowserWindow,
  config: WindowStateConfig = MAIN_WINDOW_CONFIG,
): void {
  const state = loadWindowState(config);

  // Restore saved bounds
  if (state.x !== -1 && state.y !== -1) {
    window.setBounds({ height: state.height, width: state.width, x: state.x, y: state.y });
  } else {
    window.setSize(state.width, state.height);
    window.center();
  }

  if (config.trackFullScreen && state.isFullScreen) {
    window.setFullScreen(true);
  } else if (!config.trackFullScreen && state.isMaximized) {
    window.maximize();
  }

  // Debounced save — don't write to disk on every pixel of a resize/move
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      if (window.isDestroyed()) {
        return;
      }

      if (config.trackFullScreen) {
        const isFullScreen = window.isFullScreen();
        if (!isFullScreen) {
          const bounds = window.getBounds();
          saveWindowState(
            {
              height: bounds.height,
              isFullScreen: false,
              isMaximized: false,
              width: bounds.width,
              x: bounds.x,
              y: bounds.y,
            },
            config,
          );
        } else {
          const existing = loadWindowState(config);
          saveWindowState({ ...existing, isFullScreen: true }, config);
        }
      } else {
        const isMaximized = window.isMaximized();
        if (!isMaximized) {
          const bounds = window.getBounds();
          saveWindowState(
            {
              height: bounds.height,
              isFullScreen: false,
              isMaximized: false,
              width: bounds.width,
              x: bounds.x,
              y: bounds.y,
            },
            config,
          );
        } else {
          const existing = loadWindowState(config);
          saveWindowState({ ...existing, isMaximized: true }, config);
        }
      }
    }, 500);
  };

  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);

  if (config.trackFullScreen) {
    window.on("enter-full-screen", scheduleSave);
    window.on("leave-full-screen", scheduleSave);
  } else {
    window.on("maximize", scheduleSave);
    window.on("unmaximize", scheduleSave);
  }

  if (!config.manualCloseSave) {
    // Final save on close to ensure latest state is persisted
    window.on("close", () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      saveWindowStateNow(window, config);
    });
  }
}

/**
 * Get saved window state for use in BrowserWindow constructor options.
 * Returns width/height (and optionally x/y) from the last saved state.
 */
export function getSavedWindowBounds(config: WindowStateConfig = MAIN_WINDOW_CONFIG): {
  height: number;
  width: number;
  x?: number;
  y?: number;
} {
  const state = loadWindowState(config);
  if (state.x !== -1 && state.y !== -1) {
    return { height: state.height, width: state.width, x: state.x, y: state.y };
  }
  return { height: state.height, width: state.width };
}
