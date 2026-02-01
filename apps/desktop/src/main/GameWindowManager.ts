import { BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { execSync } from 'child_process'
import type { Game } from '../types/library'

const TITLE_BAR_HEIGHT = 28 // standard macOS title bar
const EDGE_ZONE = 48 // px from top/bottom to trigger controls
const POLL_INTERVAL = 100 // ms

export class GameWindowManager {
  private gameWindows = new Map<string, BrowserWindow>()
  private trackingIntervals = new Map<string, ReturnType<typeof setInterval>>()
  private readonly preloadPath: string

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath
    this.setupIpcHandlers()
  }

  createGameWindow(game: Game): BrowserWindow {
    const existingWindow = this.gameWindows.get(game.id)
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.close()
    }

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

    if (GAME_WINDOW_VITE_DEV_SERVER_URL) {
      gameWindow.loadURL(`${GAME_WINDOW_VITE_DEV_SERVER_URL}/game-window.html`)
      // gameWindow.webContents.openDevTools()
    } else {
      gameWindow.loadFile(
        path.join(__dirname, `../renderer/${GAME_WINDOW_VITE_NAME}/index.html`),
      )
    }

    gameWindow.webContents.on('did-finish-load', () => {
      gameWindow.webContents.send('game:loaded', game)
    })

    gameWindow.on('closed', () => {
      this.stopTracking(game.id)
      this.gameWindows.delete(game.id)
    })

    this.gameWindows.set(game.id, gameWindow)
    return gameWindow
  }

  /**
   * Get window bounds by PID using a simple JXA query.
   */
  private getWindowBoundsByPid(
    pid: number,
  ): { x: number; y: number; width: number; height: number } | null {
    try {
      const script =
        'const se=Application("System Events");' +
        `const p=se.processes.whose({unixId:${pid}});` +
        'if(p.length===0)throw 1;' +
        'const w=p[0].windows[0];' +
        'const o=w.position();const s=w.size();' +
        'JSON.stringify({x:o[0],y:o[1],w:s[0],h:s[1]})'
      const raw = execSync(`osascript -l JavaScript -e '${script}'`, {
        timeout: 3000,
        encoding: 'utf-8',
      }).trim()
      const r = JSON.parse(raw)
      return { x: r.x, y: r.y, width: r.w, height: r.h }
    } catch {
      return null
    }
  }

  startTrackingRetroArchWindow(gameId: string, pid: number): void {
    const gameWindow = this.gameWindows.get(gameId)
    if (!gameWindow || gameWindow.isDestroyed()) {
      console.warn(`Game window for ${gameId} not found or destroyed`)
      return
    }

    gameWindow.setAlwaysOnTop(true, 'floating')
    gameWindow.setIgnoreMouseEvents(true, { forward: true })
    gameWindow.show()

    let lastBounds = ''
    let controlsVisible = false

    const interval = setInterval(() => {
      if (gameWindow.isDestroyed()) {
        this.stopTracking(gameId)
        return
      }

      // Get RetroArch window bounds
      const rawBounds = this.getWindowBoundsByPid(pid)
      if (!rawBounds) {
        console.log(`RetroArch window (PID ${pid}) disappeared, closing overlay`)
        this.stopTracking(gameId)
        if (!gameWindow.isDestroyed()) {
          gameWindow.close()
        }
        return
      }

      // Offset to content area below title bar
      const bounds = {
        x: rawBounds.x,
        y: rawBounds.y + TITLE_BAR_HEIGHT,
        width: rawBounds.width,
        height: rawBounds.height - TITLE_BAR_HEIGHT,
      }

      // Only update bounds if they changed to avoid flicker
      const boundsKey = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
      if (boundsKey !== lastBounds) {
        gameWindow.setBounds(bounds)
        lastBounds = boundsKey
      }

      // Poll cursor position from main process (reliable, no forwarded events needed)
      const cursor = screen.getCursorScreenPoint()
      const inOverlay =
        cursor.x >= bounds.x &&
        cursor.x <= bounds.x + bounds.width &&
        cursor.y >= bounds.y &&
        cursor.y <= bounds.y + bounds.height

      if (inOverlay) {
        const relY = cursor.y - bounds.y
        const nearEdge = relY < EDGE_ZONE || relY > bounds.height - EDGE_ZONE

        if (nearEdge && !controlsVisible) {
          controlsVisible = true
          gameWindow.setIgnoreMouseEvents(false)
          gameWindow.webContents.send('overlay:show-controls', true)
        } else if (!nearEdge && controlsVisible) {
          controlsVisible = false
          gameWindow.setIgnoreMouseEvents(true, { forward: true })
          gameWindow.webContents.send('overlay:show-controls', false)
        }
      } else if (controlsVisible) {
        controlsVisible = false
        gameWindow.setIgnoreMouseEvents(true, { forward: true })
        gameWindow.webContents.send('overlay:show-controls', false)
      }
    }, POLL_INTERVAL)

    this.trackingIntervals.set(gameId, interval)
    console.log(`Tracking RetroArch window (PID ${pid}) for game ${gameId}`)
  }

  stopTracking(gameId: string): void {
    const interval = this.trackingIntervals.get(gameId)
    if (interval) {
      clearInterval(interval)
      this.trackingIntervals.delete(gameId)
    }
  }

  closeGameWindow(gameId: string): void {
    this.stopTracking(gameId)
    const window = this.gameWindows.get(gameId)
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

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

  getGameWindow(gameId: string): BrowserWindow | undefined {
    return this.gameWindows.get(gameId)
  }

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

    ipcMain.on(
      'game-window:set-click-through',
      (event, clickThrough: boolean) => {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (window) {
          window.setIgnoreMouseEvents(clickThrough, { forward: true })
        }
      },
    )
  }

  destroy(): void {
    this.closeAllGameWindows()
    ipcMain.removeAllListeners('game-window:minimize')
    ipcMain.removeAllListeners('game-window:maximize')
    ipcMain.removeAllListeners('game-window:close')
    ipcMain.removeAllListeners('game-window:toggle-fullscreen')
    ipcMain.removeAllListeners('game-window:set-click-through')
  }
}
