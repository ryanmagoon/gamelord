import { config as loadDotenv } from "dotenv";
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  session,
} from "electron";
import path from "node:path";
import { setupAppMenu } from "./main/appMenu";
import { IPCHandlers } from "./main/ipc/handlers";
import { mainLog } from "./main/logger";
import { initSentryMain } from "./main/sentry";
import {
  getSavedWindowBounds,
  MAIN_WINDOW_CONFIG,
  manageWindowState,
  saveWindowStateNow,
} from "./main/utils/windowState";
import { animateWindowClose } from "./main/windowCloseAnimation";

// Load .env from the desktop app root (apps/desktop/.env) before anything
// reads process.env. This provides SCREENSCRAPER_DEV_ID / DEV_PASSWORD, etc.
loadDotenv({ path: path.join(__dirname, "../../.env") });

// Initialize Sentry crash reporting as early as possible (after dotenv so
// SENTRY_DSN is available). No-op when DSN is not configured.
initSentryMain();

// Set app name for macOS menu bar (must be called before app is ready)
app.setName("GameLord");

// Initialize IPC handlers
let ipcHandlers: IPCHandlers;

const createWindow = () => {
  const savedBounds = getSavedWindowBounds();

  // Create the browser window with saved position/size.
  // `show: false` prevents a flash of unstyled content (FOUC) on cold launch.
  // The window stays hidden until the renderer signals it's ready via `ready-to-show`.
  // No `backgroundColor` — the inline theme script in index.html sets the correct
  // background (light or dark) before first paint, and `ready-to-show` ensures
  // the window isn't revealed until that script has run.
  const mainWindow = new BrowserWindow({
    ...savedBounds,
    show: false,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // The renderer sends 'app:contentReady' once the library data has loaded
  // and the UI is rendered at opacity 0. Showing the window at that point
  // lets the CSS transition (opacity 0 → 1) play visibly. If the signal
  // doesn't arrive within 3 seconds (e.g. the renderer crashes), show
  // anyway so the user isn't stuck with an invisible window.
  let shown = false;
  const showOnce = () => {
    if (shown) {
      return;
    }
    shown = true;
    mainWindow.show();
  };
  ipcMain.once("app:contentReady", showOnce);
  mainWindow.on("ready-to-show", () => {
    setTimeout(showOnce, 3000);
  });

  // Persist window position, size, and maximize state across sessions.
  // manualCloseSave prevents the auto-close listener from saving bounds
  // after the close animation shrinks the window.
  manageWindowState(mainWindow, { ...MAIN_WINDOW_CONFIG, manualCloseSave: true });

  // Animate the main window on close (fade + shrink toward center).
  // Skip the animation during Cmd+Q / app.quit() — the quit flow handles
  // cleanup and the user expects an instant exit.
  let readyToClose = false;
  mainWindow.on("close", (event) => {
    if (readyToClose || isCleaningUp) {
      return;
    }

    event.preventDefault();
    saveWindowStateNow(mainWindow, MAIN_WINDOW_CONFIG);

    animateWindowClose(mainWindow, { shrink: false }).then(() => {
      readyToClose = true;
      mainWindow.close();
    });
  });

  // and load the index.html of the app.
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  if (process.env.OPEN_DEV_TOOLS || process.argv.includes("--dev-tools")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
  // Set the Dock icon in dev mode. In production, electron-builder embeds icon.icns
  // in the app bundle automatically. In dev mode, Electron shows its default icon
  // unless we set it explicitly.
  if (!app.isPackaged && process.platform === "darwin") {
    const iconPath = path.join(__dirname, "../../build/icon.png");
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      app.dock?.setIcon(icon);
    }
  }

  // Enable SharedArrayBuffer by setting cross-origin isolation headers.
  // Required for zero-copy frame transfer between the emulation worker
  // and the renderer. Only affects local responses (file:// and dev server).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Cross-Origin-Opener-Policy": ["same-origin"],
        "Cross-Origin-Embedder-Policy": ["require-corp"],
      },
    });
  });

  // Auto-approve most permission requests. Cross-origin isolation (COEP)
  // causes Chromium to prompt for AudioContext permissions that are normally
  // auto-granted in Electron. Since this is a local desktop app (not a
  // web browser), most permissions are safe to grant automatically.
  // Deny microphone/camera to prevent macOS system permission dialogs —
  // AudioContext only needs audio output, not input.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === "media") {
      // 'media' covers both mic and camera — deny to avoid macOS prompts.
      // AudioContext playback works without media capture permission.
      callback(false);
      return;
    }
    callback(true);
  });

  // Register artwork:// protocol to serve cached cover art images
  // from the sandboxed renderer via <img src="artwork://gameId.png">.
  // The CORP header is required because COEP require-corp is enabled above.
  protocol.handle("artwork", async (request) => {
    const filename = request.url.slice("artwork://".length);
    const filePath = path.join(app.getPath("userData"), "artwork", filename);
    const response = await net.fetch(`file://${filePath}`);
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });

  // Initialize IPC handlers before creating window
  const preloadPath = path.join(__dirname, "../preload/index.js");
  ipcHandlers = new IPCHandlers(preloadPath);
  setupAppMenu();
  createWindow();

  // Forward OS theme changes to the renderer so "system" mode updates live.
  // Electron's Chromium doesn't reliably fire matchMedia change events for
  // prefers-color-scheme, so we use nativeTheme as the source of truth.
  // The short delay works around a macOS timing issue where
  // shouldUseDarkColors may not reflect the new value immediately.
  nativeTheme.on("updated", () => {
    setTimeout(() => {
      const isDark = nativeTheme.shouldUseDarkColors;
      mainLog.info(`OS theme changed: ${isDark ? "dark" : "light"}`);
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("theme:systemChanged", isDark);
      }
    }, 50);
  });
});

// Gracefully shut down the emulation worker before quitting so its exit
// doesn't fire an unhandled error event (the worker exits with code 0
// when Electron tears down utility processes, but EmulationWorkerClient
// still has `running = true` if shutdown() was never called).
let isCleaningUp = false;
app.on("before-quit", async (event) => {
  if (isCleaningUp || !ipcHandlers) {
    return;
  }
  event.preventDefault();
  isCleaningUp = true;
  await ipcHandlers.cleanup();
  app.quit();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
