import { BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { Game } from '../types/library'
import type { LibretroNativeCore } from './emulator/LibretroNativeCore'

const execFileAsync = promisify(execFile)

const TITLE_BAR_HEIGHT = 28 // standard macOS title bar
const POLL_INTERVAL = 200 // ms

export type GameWindowMode = 'overlay' | 'native'

export class GameWindowManager {
  private gameWindows = new Map<string, BrowserWindow>()
  private trackingIntervals = new Map<string, ReturnType<typeof setInterval>>()
  private frameIntervals = new Map<string, ReturnType<typeof setInterval>>()
  private readonly preloadPath: string
  private activeNativeCore: LibretroNativeCore | null = null

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath
    this.setupIpcHandlers()
  }

  /**
   * Create a game window in native mode — the game renders inside the
   * BrowserWindow via canvas. Single window, single title bar.
   */
  createNativeGameWindow(game: Game, nativeCore: LibretroNativeCore, shouldResume = false): BrowserWindow {
    const existingWindow = this.gameWindows.get(game.id)
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.close()
    }

    const avInfo = nativeCore.getAVInfo()
    const baseWidth = avInfo?.geometry.baseWidth || 256
    const baseHeight = avInfo?.geometry.baseHeight || 240
    // Scale up to a reasonable window size (3x for retro games)
    const scale = Math.max(2, Math.floor(720 / baseHeight))
    const windowWidth = baseWidth * scale
    const windowHeight = baseHeight * scale

    const gameWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      minWidth: baseWidth * 2,
      minHeight: baseHeight * 2,
      useContentSize: true, // Ensure width/height refer to content area, not window frame
      title: `GameLord - ${game.title}`,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 10, y: 10 },
      backgroundColor: '#000000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // Lock window to the core's aspect ratio
    if (avInfo) {
      const aspectRatio = avInfo.geometry.aspectRatio > 0
        ? avInfo.geometry.aspectRatio
        : baseWidth / baseHeight
      gameWindow.setAspectRatio(aspectRatio)
    }

    if (GAME_WINDOW_VITE_DEV_SERVER_URL) {
      gameWindow.loadURL(`${GAME_WINDOW_VITE_DEV_SERVER_URL}/game-window.html`)
    } else {
      gameWindow.loadFile(
        path.join(__dirname, `../renderer/${GAME_WINDOW_VITE_NAME}/game-window.html`),
      )
    }

    gameWindow.webContents.on('did-finish-load', () => {
      gameWindow.webContents.send('game:loaded', game)
      gameWindow.webContents.send('game:mode', 'native')

      if (avInfo) {
        gameWindow.webContents.send('game:av-info', avInfo)
      }

      this.startEmulationLoop(game.id, nativeCore, gameWindow)

      if (shouldResume) {
        nativeCore.loadState(99).catch((error) => {
          console.error('Failed to load autosave:', error)
        })
      }
    })

    this.activeNativeCore = nativeCore

    gameWindow.on('close', () => {
      // Flush battery-backed SRAM (in-game saves) to disk
      try {
        nativeCore.saveSram()
      } catch (error) {
        console.error('Failed to save SRAM on close:', error)
      }
      // Auto-save state before the window is destroyed
      try {
        nativeCore.saveState(99)
      } catch (error) {
        console.error('Failed to autosave on close:', error)
      }
    })

    gameWindow.on('closed', () => {
      this.stopEmulationLoop(game.id)
      this.activeNativeCore = null
      this.gameWindows.delete(game.id)
    })

    this.gameWindows.set(game.id, gameWindow)
    return gameWindow
  }

  /**
   * Create an overlay game window (legacy mode for external RetroArch process).
   */
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
    } else {
      gameWindow.loadFile(
        path.join(__dirname, `../renderer/${GAME_WINDOW_VITE_NAME}/game-window.html`),
      )
    }

    gameWindow.webContents.on('did-finish-load', () => {
      gameWindow.webContents.send('game:loaded', game)
      gameWindow.webContents.send('game:mode', 'overlay')
    })

    gameWindow.on('closed', () => {
      this.stopTracking(game.id)
      this.gameWindows.delete(game.id)
    })

    this.gameWindows.set(game.id, gameWindow)
    return gameWindow
  }

  /**
   * Get window bounds by PID using a simple JXA query (async).
   */
  private async getWindowBoundsByPid(
    pid: number,
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      const script =
        'const se=Application("System Events");' +
        `const p=se.processes.whose({unixId:${pid}});` +
        'if(p.length===0)throw 1;' +
        'const w=p[0].windows[0];' +
        'const o=w.position();const s=w.size();' +
        'JSON.stringify({x:o[0],y:o[1],w:s[0],h:s[1]})'
      const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], {
        timeout: 3000,
      })
      const r = JSON.parse(stdout.trim())
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
    let polling = false
    let missCount = 0
    const MAX_MISSES = 5 // consecutive failures before assuming window is gone

    const poll = async () => {
      if (polling) return
      polling = true
      try {
        if (gameWindow.isDestroyed()) {
          this.stopTracking(gameId)
          return
        }

        const rawBounds = await this.getWindowBoundsByPid(pid)
        if (!rawBounds) {
          missCount++
          if (missCount >= MAX_MISSES) {
            this.stopTracking(gameId)
            if (!gameWindow.isDestroyed()) {
              gameWindow.close()
            }
          }
          return
        }
        missCount = 0

        // Detect if window is fullscreen (position 0,0 and matches a display)
        const displays = screen.getAllDisplays()
        const isFullscreen = displays.some(
          (d) =>
            rawBounds.x === d.bounds.x &&
            rawBounds.y === d.bounds.y &&
            rawBounds.width === d.bounds.width &&
            rawBounds.height === d.bounds.height,
        )

        const titleOffset = isFullscreen ? 0 : TITLE_BAR_HEIGHT
        const bounds = {
          x: rawBounds.x,
          y: rawBounds.y + titleOffset,
          width: rawBounds.width,
          height: rawBounds.height - titleOffset,
        }

        // Only update bounds if they changed
        const boundsKey = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
        if (boundsKey !== lastBounds) {
          gameWindow.setBounds(bounds)
          lastBounds = boundsKey
        }

        // Check cursor position (instant, no blocking)
        const cursor = screen.getCursorScreenPoint()
        const inOverlay =
          cursor.x >= bounds.x &&
          cursor.x <= bounds.x + bounds.width &&
          cursor.y >= bounds.y &&
          cursor.y <= bounds.y + bounds.height

        if (inOverlay && !controlsVisible) {
          controlsVisible = true
          gameWindow.setIgnoreMouseEvents(false)
          gameWindow.webContents.send('overlay:show-controls', true)
        } else if (!inOverlay && controlsVisible) {
          controlsVisible = false
          gameWindow.setIgnoreMouseEvents(true, { forward: true })
          gameWindow.webContents.send('overlay:show-controls', false)
        }
      } finally {
        polling = false
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL)

    this.trackingIntervals.set(gameId, interval)
  }

  stopTracking(gameId: string): void {
    const interval = this.trackingIntervals.get(gameId)
    if (interval) {
      clearInterval(interval)
      this.trackingIntervals.delete(gameId)
    }
  }

  private stopFramePush(gameId: string): void {
    const interval = this.frameIntervals.get(gameId)
    if (interval) {
      clearInterval(interval)
      this.frameIntervals.delete(gameId)
    }
  }

  private emulationTimers = new Map<string, ReturnType<typeof setTimeout>>()

  private startEmulationLoop(gameId: string, core: LibretroNativeCore, win: BrowserWindow): void {
    const avInfo = core.getAVInfo()
    const fps = avInfo?.timing.fps || 60
    const frameTimeMs = 1000 / fps
    const sampleRate = avInfo?.timing.sampleRate || 44100

    let lastTime = performance.now()

    const tick = () => {
      if (win.isDestroyed()) return

      const now = performance.now()
      const elapsed = now - lastTime

      if (elapsed >= frameTimeMs) {
        lastTime = now - (elapsed % frameTimeMs) // account for drift

        core.runFrame()

        const frame = core.getVideoFrame()
        const audio = core.getAudioBuffer()

        if (frame && !win.isDestroyed()) {
          win.webContents.send('game:video-frame', {
            data: Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength),
            width: frame.width,
            height: frame.height,
          })
        }

        if (audio && audio.length > 0 && !win.isDestroyed()) {
          win.webContents.send('game:audio-samples', {
            samples: Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength),
            sampleRate,
          })
        }
      }

      this.emulationTimers.set(gameId, setTimeout(tick, 1))
    }

    this.emulationTimers.set(gameId, setTimeout(tick, 1))
  }

  private stopEmulationLoop(gameId: string): void {
    const timer = this.emulationTimers.get(gameId)
    if (timer) {
      clearTimeout(timer)
      this.emulationTimers.delete(gameId)
    }
  }

  closeGameWindow(gameId: string): void {
    this.stopTracking(gameId)
    this.stopFramePush(gameId)
    const window = this.gameWindows.get(gameId)
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

  closeAllGameWindows(): void {
    for (const [gameId] of this.trackingIntervals) {
      this.stopTracking(gameId)
    }
    for (const [gameId] of this.frameIntervals) {
      this.stopFramePush(gameId)
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

    ipcMain.on('game-window:set-traffic-light-visible', (event, visible: boolean) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        window.setWindowButtonVisibility(visible)
      }
    })

    // Input forwarding from renderer to native core
    ipcMain.on('game:input', (event, port: number, id: number, pressed: boolean) => {
      this.emit('input', port, id, pressed)
    })
  }

  private inputListeners: Array<(port: number, id: number, pressed: boolean) => void> = []

  on(event: string, listener: (...args: any[]) => void): this {
    if (event === 'input') {
      this.inputListeners.push(listener as any)
    }
    return this
  }

  private emit(event: string, ...args: any[]): boolean {
    if (event === 'input') {
      for (const listener of this.inputListeners) {
        listener(...(args as [number, number, boolean]))
      }
      return true
    }
    return false
  }

  destroy(): void {
    this.closeAllGameWindows()
    this.activeNativeCore = null
    this.inputListeners = []
    for (const [gameId] of this.emulationTimers) {
      this.stopEmulationLoop(gameId)
    }
    ipcMain.removeAllListeners('game-window:minimize')
    ipcMain.removeAllListeners('game-window:maximize')
    ipcMain.removeAllListeners('game-window:close')
    ipcMain.removeAllListeners('game-window:toggle-fullscreen')
    ipcMain.removeAllListeners('game-window:set-click-through')
    ipcMain.removeAllListeners('game:input')
  }
}
