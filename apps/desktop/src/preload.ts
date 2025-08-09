import { contextBridge, ipcRenderer } from 'electron';

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('gamelord', {
  // Core management
  core: {
    load: (options: { corePath: string; romPath: string; saveStatePath?: string }) => 
      ipcRenderer.invoke('core:load', options),
    unload: () => ipcRenderer.invoke('core:unload')
  },
  
  // Emulation control
  emulation: {
    pause: () => ipcRenderer.invoke('emulation:pause'),
    resume: () => ipcRenderer.invoke('emulation:resume')
  },
  
  // Save states
  saveState: {
    save: (slot: number) => ipcRenderer.invoke('savestate:save', slot),
    load: (slot: number) => ipcRenderer.invoke('savestate:load', slot)
  },
  
  // Input
  input: {
    sendButton: (playerId: number, button: string, pressed: boolean) => 
      ipcRenderer.send('input:button', playerId, button, pressed)
  },
  
  // Event listeners
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'video:frame',
      'audio:samples',
      'core:stateChanged',
      'core:error'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
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