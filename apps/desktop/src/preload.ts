import { contextBridge, ipcRenderer } from "electron";

// ---------------------------------------------------------------------------
// SharedArrayBuffer MessagePort bridge
// ---------------------------------------------------------------------------
// contextBridge cannot transfer SharedArrayBuffer directly. The main process
// sends a MessagePort via webContents.postMessage, then sends the SABs through
// that port. We expose a simple onMessage callback for the renderer to consume.

let framePortCallback: ((data: unknown) => void) | null = null;

ipcRenderer.on("game:shared-frame-port", (event) => {
  const [port] = event.ports;
  if (!port) {
    return;
  }

  port.onmessage = (ev: MessageEvent) => {
    framePortCallback?.(ev.data);
  };
  port.start();
});

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld("gamelord", {
  // Emulator management
  emulator: {
    launch: (
      romPath: string,
      systemId: string,
      emulatorId?: string,
      coreName?: string,
      cardBounds?: { x: number; y: number; width: number; height: number },
    ) => ipcRenderer.invoke("emulator:launch", romPath, systemId, emulatorId, coreName, cardBounds),
    stop: () => ipcRenderer.invoke("emulator:stop"),
    getAvailable: () => ipcRenderer.invoke("emulator:getAvailable"),
    isRunning: () => ipcRenderer.invoke("emulator:isRunning"),
    getCoresForSystem: (systemId: string) =>
      ipcRenderer.invoke("emulator:getCoresForSystem", systemId),
    downloadCore: (coreName: string, systemId: string) =>
      ipcRenderer.invoke("emulator:downloadCore", coreName, systemId),
  },

  // Emulation control
  emulation: {
    pause: () => ipcRenderer.invoke("emulation:pause"),
    resume: () => ipcRenderer.invoke("emulation:resume"),
    reset: () => ipcRenderer.invoke("emulation:reset"),
    screenshot: (outputPath?: string) => ipcRenderer.invoke("emulation:screenshot", outputPath),
    setSpeed: (multiplier: number) => ipcRenderer.invoke("emulation:setSpeed", multiplier),
    setFastForwardAudio: (enabled: boolean) =>
      ipcRenderer.invoke("emulation:setFastForwardAudio", enabled),
  },

  // Save states
  saveState: {
    save: (slot: number) => ipcRenderer.invoke("savestate:save", slot),
    load: (slot: number) => ipcRenderer.invoke("savestate:load", slot),
  },

  // Cheats
  cheats: {
    listForGame: (systemId: string, romFilename: string) =>
      ipcRenderer.invoke("cheats:listForGame", systemId, romFilename),
    downloadDatabase: () => ipcRenderer.invoke("cheats:downloadDatabase"),
    set: (index: number, enabled: boolean, code: string) =>
      ipcRenderer.invoke("cheats:set", index, enabled, code),
    reset: () => ipcRenderer.invoke("cheats:reset"),
    getGameState: (gameId: string) => ipcRenderer.invoke("cheats:getGameState", gameId),
    toggleCheat: (gameId: string, index: number, enabled: boolean) =>
      ipcRenderer.invoke("cheats:toggleCheat", gameId, index, enabled),
    toggleCustomCheat: (gameId: string, customIndex: number, enabled: boolean) =>
      ipcRenderer.invoke("cheats:toggleCustomCheat", gameId, customIndex, enabled),
    addCustomCheat: (gameId: string, description: string, code: string) =>
      ipcRenderer.invoke("cheats:addCustomCheat", gameId, description, code),
    removeCustomCheat: (gameId: string, customIndex: number) =>
      ipcRenderer.invoke("cheats:removeCustomCheat", gameId, customIndex),
  },

  // Run one frame and return video+audio data (called from requestAnimationFrame)
  tick: () => ipcRenderer.invoke("game:tick"),

  // Game input forwarding (native mode)
  gameInput: (port: number, id: number, pressed: boolean) =>
    ipcRenderer.send("game:input", port, id, pressed),

  // Event listeners
  on: (channel: string, callback: (...args: Array<unknown>) => void) => {
    const validChannels = [
      "emulator:launched",
      "emulator:exited",
      "emulator:error",
      "emulator:stateSaved",
      "emulator:stateLoaded",
      "emulator:screenshotTaken",
      "emulator:paused",
      "emulator:resumed",
      "emulator:reset",
      "emulator:speedChanged",
      "emulator:terminated",
      "game:loaded",
      "game:mode",
      "game:av-info",
      "game:video-frame",
      "game:audio-samples",
      "overlay:show-controls",
      "core:downloadProgress",
      "cheats:downloadProgress",
      "library:scanProgress",
      "library:scanAmbiguous",
      "library:homebrewImported",
      "artwork:progress",
      "artwork:syncComplete",
      "artwork:syncError",
      "dialog:showResumeGame",
      "game:prepare-close",
      "game:emulation-error",
      "game:ready-for-boot",
      "theme:systemChanged",
      "menu:openSettings",
      "menu:scanLibrary",
      "menu:addRomFolder",
      "updates:checking",
      "updates:available",
      "updates:not-available",
      "updates:download-progress",
      "updates:downloaded",
      "updates:error",
    ];

    if (validChannels.includes(channel)) {
      // Remove any existing listeners first to prevent accumulation
      // from React Strict Mode double-mounts and Vite HMR reloads.
      ipcRenderer.removeAllListeners(channel);
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // Game window controls
  gameWindow: {
    minimize: () => ipcRenderer.send("game-window:minimize"),
    maximize: () => ipcRenderer.send("game-window:maximize"),
    close: () => ipcRenderer.send("game-window:close"),
    toggleFullscreen: () => ipcRenderer.send("game-window:toggle-fullscreen"),
    setClickThrough: (value: boolean) => ipcRenderer.send("game-window:set-click-through", value),
    setTrafficLightVisible: (visible: boolean) =>
      ipcRenderer.send("game-window:set-traffic-light-visible", visible),
    readyToClose: () => ipcRenderer.send("game-window:ready-to-close"),
  },

  // Library management
  library: {
    getSystems: () => ipcRenderer.invoke("library:getSystems"),
    addSystem: (system: unknown) => ipcRenderer.invoke("library:addSystem", system),
    removeSystem: (systemId: string) => ipcRenderer.invoke("library:removeSystem", systemId),
    updateSystemPath: (systemId: string, romsPath: string) =>
      ipcRenderer.invoke("library:updateSystemPath", systemId, romsPath),

    getGames: (systemId?: string) => ipcRenderer.invoke("library:getGames", systemId),
    addGame: (romPath: string, systemId: string) =>
      ipcRenderer.invoke("library:addGame", romPath, systemId),
    removeGame: (gameId: string) => ipcRenderer.invoke("library:removeGame", gameId),
    updateGame: (gameId: string, updates: unknown) =>
      ipcRenderer.invoke("library:updateGame", gameId, updates),

    scanDirectory: (directoryPath: string, systemId?: string) =>
      ipcRenderer.invoke("library:scanDirectory", directoryPath, systemId),
    scanSystemFolders: () => ipcRenderer.invoke("library:scanSystemFolders"),

    getConfig: () => ipcRenderer.invoke("library:getConfig"),
    setRomsBasePath: (basePath: string) => ipcRenderer.invoke("library:setRomsBasePath", basePath),
    isHomebrewDone: () => ipcRenderer.invoke("library:isHomebrewDone") as Promise<boolean>,
  },

  // Artwork & metadata
  artwork: {
    syncGame: (gameId: string) => ipcRenderer.invoke("artwork:syncGame", gameId),
    syncAll: () => ipcRenderer.invoke("artwork:syncAll"),
    syncGames: (gameIds: Array<string>) => ipcRenderer.invoke("artwork:syncGames", gameIds),
    cancelSync: () => ipcRenderer.invoke("artwork:cancelSync"),
    getSyncStatus: () => ipcRenderer.invoke("artwork:getSyncStatus"),
    getCredentials: () => ipcRenderer.invoke("artwork:getCredentials"),
    setCredentials: (userId: string, userPassword: string) =>
      ipcRenderer.invoke("artwork:setCredentials", userId, userPassword),
    clearCredentials: () => ipcRenderer.invoke("artwork:clearCredentials"),
    isCredentialPromptDismissed: () =>
      ipcRenderer.invoke("artwork:isCredentialPromptDismissed") as Promise<boolean>,
    dismissCredentialPrompt: () => ipcRenderer.invoke("artwork:dismissCredentialPrompt"),
  },

  // SharedArrayBuffer frame port (zero-copy frame/audio transfer)
  framePort: {
    onMessage: (callback: (data: unknown) => void) => {
      framePortCallback = callback;
    },
  },

  // Platform info for conditional UI (e.g. window controls on non-macOS)
  platform: process.platform as "darwin" | "win32" | "linux",

  // Auto-updates
  updates: {
    checkNow: () => ipcRenderer.invoke("updates:checkNow"),
    quitAndInstall: () => ipcRenderer.invoke("updates:quitAndInstall"),
  },

  // Signal that the renderer has loaded content and is ready to be shown.
  // The main process keeps the window hidden until this fires, so the CSS
  // opacity transition (0 → 1) plays visibly on cold launch.
  contentReady: () => ipcRenderer.send("app:contentReady"),

  // Dialog
  dialog: {
    selectDirectory: () => ipcRenderer.invoke("dialog:selectDirectory"),
    selectRomFile: (systemId: string) => ipcRenderer.invoke("dialog:selectRomFile", systemId),
    respondResumeGame: (
      requestId: string,
      response: { action: "resume" | "start-fresh" | "cancel"; remember: boolean },
    ) => ipcRenderer.send("dialog:resumeGameResponse", requestId, response),
    respondDisambiguate: (
      requestId: string,
      resolved: Array<{ fullPath: string; systemId: string; mtimeMs: number }>,
    ) => ipcRenderer.send("dialog:disambiguateResponse", requestId, resolved),
  },
});
