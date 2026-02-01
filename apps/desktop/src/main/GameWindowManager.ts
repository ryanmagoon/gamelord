import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { execSync } from 'child_process'
import type { Game } from '../types/library'

/**
 * Manages custom game windows that overlay controls on top of native emulator windows.
 * Provides OpenEmu-style cohesive UI experience while maintaining native emulation performance.
 */
export class GameWindowManager {
  private gameWindows = new Map<string, BrowserWindow>()
  private trackingIntervals = new Map<string, ReturnType<typeof setInterval>>()
  private readonly preloadPath: string

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath
    this.setupIpcHandlers()
  }

  /**
   * Create a custom game window for the given game
   */
  createGameWindow(game: Game): BrowserWindow {
    // Close existing window for this game if any
    const existingWindow = this.gameWindows.get(game.id)
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.close()
    }

    // Create transparent frameless overlay window
    const gameWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      minWidth: 640,
      minHeight: 480,
      frame: false,
      titleBarStyle: 'hidden',
      title: `GameLord - ${game.title}`,
      transparent: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      skipTaskbar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // Load the game window renderer
    if (GAME_WINDOW_VITE_DEV_SERVER_URL) {
      gameWindow.loadURL(`${GAME_WINDOW_VITE_DEV_SERVER_URL}/game-window.html`)
      gameWindow.webContents.openDevTools()
    } else {
      gameWindow.loadFile(path.join(__dirname, `../renderer/${GAME_WINDOW_VITE_NAME}/index.html`))
    }

    // Send game data once window is ready
    gameWindow.webContents.on('did-finish-load', () => {
      gameWindow.webContents.send('game:loaded', game)
    })

    // Cleanup on close
    gameWindow.on('closed', () => {
      this.stopTracking(game.id)
      this.gameWindows.delete(game.id)
    })

    // Store window reference
    this.gameWindows.set(game.id, gameWindow)

    return gameWindow
  }

  /**
   * Get window bounds of a process by PID using macOS JXA/System Events
   */
  private getWindowBoundsByPid(pid: number): { x: number; y: number; width: number; height: number } | null {
    try {
      const script = `
        const se = Application("System Events");
        const procs = se.processes.whose({unixId: ${pid}});
        if (procs.length === 0) throw "no process";
        const w = procs[0].windows[0];
        const pos = w.position();
        const sz = w.size();
        JSON.stringify({x: pos[0], y: pos[1], width: sz[0], height: sz[1]});
      `
      const result = execSync(`osascript -l JavaScript -e '${script}'`, {
        timeout: 5000,
        encoding: 'utf-8',
      }).trim()
      return JSON.parse(result)
    } catch {
      return null
    }
  }

  /**
   * Start tracking the RetroArch window position/size and overlay our window on top
   */
  startTrackingRetroArchWindow(gameId: string, pid: number): void {
    const gameWindow = this.gameWindows.get(gameId)
    if (!gameWindow || gameWindow.isDestroyed()) {
      console.warn(`Game window for ${gameId} not found or destroyed`)
      return
    }

    gameWindow.setAlwaysOnTop(true, 'floating')
    gameWindow.setIgnoreMouseEvents(true, { forward: true })
    gameWindow.show()

    // Poll RetroArch window position
    const interval = setInterval(() => {
      if (gameWindow.isDestroyed()) {
        this.stopTracking(gameId)
        return
      }

      const bounds = this.getWindowBoundsByPid(pid)
      if (!bounds) {
        // RetroArch window disappeared — close overlay
        console.log(`RetroArch window (PID ${pid}) disappeared, closing overlay`)
        this.stopTracking(gameId)
        if (!gameWindow.isDestroyed()) {
          gameWindow.close()
        }
        return
      }

      gameWindow.setBounds(bounds)
    }, 150)

    this.trackingIntervals.set(gameId, interval)
    console.log(`Tracking RetroArch window (PID ${pid}) for game ${gameId}`)
  }

  /**
   * Stop tracking for a given game
   */
  stopTracking(gameId: string): void {
    const interval = this.trackingIntervals.get(gameId)
    if (interval) {
      clearInterval(interval)
      this.trackingIntervals.delete(gameId)
    }
  }

  /**
   * Close game window for the given game ID
   */
  closeGameWindow(gameId: string): void {
    this.stopTracking(gameId)
    const window = this.gameWindows.get(gameId)
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

  /**
   * Close all game windows
   */
  closeAllGameWindows(): void {
    for (const [gameId] of this.trackingIntervals) {
      this.stopTracking(gameId)
    }
    for (const window of this.gameWindows.values()) {
      if (!window.isDestroyed()) {
        window.close()
      }
    }
    this.gameWindows.clear()
  }

  /**
   * Get the window for a specific game
   */
  getGameWindow(gameId: string): BrowserWindow | undefined {
    return this.gameWindows.get(gameId)
  }

  /**
   * Setup IPC handlers for game window actions
   */
  private setupIpcHandlers(): void {
    ipcMain.on('game-window:minimize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      window?.minimize()
    })

    ipcMain.on('game-window:maximize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window?.isMaximized()) {
        window.unmaximize()
      } else {
        window?.maximize()
      }
    })

    ipcMain.on('game-window:close', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      window?.close()
    })

    ipcMain.on('game-window:toggle-fullscreen', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        window.setFullScreen(!window.isFullScreen())
      }
    })

    ipcMain.on('game-window:set-click-through', (event, clickThrough: boolean) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        window.setIgnoreMouseEvents(clickThrough, { forward: true })
      }
    })
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.closeAllGameWindows()
    ipcMain.removeAllListeners('game-window:minimize')
    ipcMain.removeAllListeners('game-window:maximize')
    ipcMain.removeAllListeners('game-window:close')
    ipcMain.removeAllListeners('game-window:toggle-fullscreen')
    ipcMain.removeAllListeners('game-window:set-click-through')
  }
}
