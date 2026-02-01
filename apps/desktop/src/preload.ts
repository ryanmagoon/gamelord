import { contextBridge, ipcRenderer } from 'electron';

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('gamelord', {
  // Emulator management
  emulator: {
    launch: (romPath: string, systemId: string, emulatorId?: string) =>
      ipcRenderer.invoke('emulator:launch', romPath, systemId, emulatorId),
    stop: () => ipcRenderer.invoke('emulator:stop'),
    getAvailable: () => ipcRenderer.invoke('emulator:getAvailable'),
    isRunning: () => ipcRenderer.invoke('emulator:isRunning')
  },

  // Emulation control
  emulation: {
    pause: () => ipcRenderer.invoke('emulation:pause'),
    resume: () => ipcRenderer.invoke('emulation:resume'),
    reset: () => ipcRenderer.invoke('emulation:reset'),
    screenshot: (outputPath?: string) => ipcRenderer.invoke('emulation:screenshot', outputPath)
  },

  // Save states
  saveState: {
    save: (slot: number) => ipcRenderer.invoke('savestate:save', slot),
    load: (slot: number) => ipcRenderer.invoke('savestate:load', slot)
  },

  // Run one frame and return video+audio data (called from requestAnimationFrame)
  tick: () => ipcRenderer.invoke('game:tick'),

  // Game input forwarding (native mode)
  gameInput: (port: number, id: number, pressed: boolean) =>
    ipcRenderer.send('game:input', port, id, pressed),

  // Event listeners
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'emulator:launched',
      'emulator:exited',
      'emulator:error',
      'emulator:stateSaved',
      'emulator:stateLoaded',
      'emulator:screenshotTaken',
      'emulator:paused',
      'emulator:resumed',
      'emulator:reset',
      'emulator:terminated',
      'game:loaded',
      'game:mode',
      'game:av-info',
      'game:video-frame',
      'game:audio-samples',
      'overlay:show-controls'
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // Game window controls
  gameWindow: {
    minimize: () => ipcRenderer.send('game-window:minimize'),
    maximize: () => ipcRenderer.send('game-window:maximize'),
    close: () => ipcRenderer.send('game-window:close'),
    toggleFullscreen: () => ipcRenderer.send('game-window:toggle-fullscreen'),
    setClickThrough: (value: boolean) => ipcRenderer.send('game-window:set-click-through', value)
  },

  // Library management
  library: {
    getSystems: () => ipcRenderer.invoke('library:getSystems'),
    addSystem: (system: any) => ipcRenderer.invoke('library:addSystem', system),
    removeSystem: (systemId: string) => ipcRenderer.invoke('library:removeSystem', systemId),
    updateSystemPath: (systemId: string, romsPath: string) => 
      ipcRenderer.invoke('library:updateSystemPath', systemId, romsPath),
    
    getGames: (systemId?: string) => ipcRenderer.invoke('library:getGames', systemId),
    addGame: (romPath: string, systemId: string) => 
      ipcRenderer.invoke('library:addGame', romPath, systemId),
    removeGame: (gameId: string) => ipcRenderer.invoke('library:removeGame', gameId),
    updateGame: (gameId: string, updates: any) => 
      ipcRenderer.invoke('library:updateGame', gameId, updates),
    
    scanDirectory: (directoryPath: string, systemId?: string) => 
      ipcRenderer.invoke('library:scanDirectory', directoryPath, systemId),
    scanSystemFolders: () => ipcRenderer.invoke('library:scanSystemFolders'),
    
    getConfig: () => ipcRenderer.invoke('library:getConfig'),
    setRomsBasePath: (basePath: string) => 
      ipcRenderer.invoke('library:setRomsBasePath', basePath)
  },

  // Dialog
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    selectRomFile: (systemId: string) => ipcRenderer.invoke('dialog:selectRomFile', systemId)
  }
});