import { BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { Game } from '../types/library'
import type { EmulationWorkerClient } from './emulator/EmulationWorkerClient'
import type { AVInfo } from './workers/core-worker-protocol'
import { animateWindowClose } from './windowCloseAnimation'
import { gameWindowLog } from './logger'

const execFileAsync = promisify(execFile)

const TITLE_BAR_HEIGHT = 28 // standard macOS title bar
const POLL_INTERVAL = 200 // ms

export type GameWindowMode = 'overlay' | 'native'

/** Max time to wait for the renderer's shutdown animation + OS window fade before force-closing. */
const SHUTDOWN_ANIMATION_TIMEOUT = 2000

export class GameWindowManager {
  private gameWindows = new Map<string, BrowserWindow>()
  private trackingIntervals = new Map<string, ReturnType<typeof setInterval>>()
  private frameIntervals = new Map<string, ReturnType<typeof setInterval>>()
  private readonly preloadPath: string
  private activeWorkerClient: EmulationWorkerClient | null = null
  /** Windows that have completed their shutdown animation and are ready to be destroyed. */
  private readyToCloseWindows = new Set<number>()
  /** Safety timeout handles so we can clear them on cleanup. */
  private shutdownTimeouts = new Map<number, ReturnType<typeof setTimeout>>()

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath
    this.setupIpcHandlers()
  }

  /**
   * Create a game window in native mode — the game renders inside the
   * BrowserWindow via canvas. Single window, single title bar.
   *
   * The emulation loop runs in a utility process managed by the worker
   * client. This method wires frame/audio/error events from the worker
   * to the renderer via IPC.
   */
  createNativeGameWindow(
    game: Game,
    workerClient: EmulationWorkerClient,
    avInfo: AVInfo,
    shouldResume = false,
  ): BrowserWindow {
    const existingWindow = this.gameWindows.get(game.id)
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.close()
    }

    const baseWidth = avInfo.geometry.baseWidth || 256
    const baseHeight = avInfo.geometry.baseHeight || 240
    // Use the core's reported aspect ratio (accounts for non-square pixels like NES 4:3)
    const aspectRatio = avInfo.geometry.aspectRatio && avInfo.geometry.aspectRatio > 0
      ? avInfo.geometry.aspectRatio
      : baseWidth / baseHeight
    // Scale up to a reasonable window size (targeting ~720p height)
    const scale = Math.max(2, Math.floor(720 / baseHeight))
    const windowHeight = baseHeight * scale
    // Width is calculated from height using the correct aspect ratio
    const windowWidth = Math.round(windowHeight * aspectRatio)

    const gameWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      minWidth: Math.round(baseHeight * 2 * aspectRatio),
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
    gameWindow.setAspectRatio(aspectRatio)

    if (process.env.ELECTRON_RENDERER_URL) {
      gameWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/game-window.html`)
    } else {
      gameWindow.loadFile(
        path.join(__dirname, '../renderer/game-window.html'),
      )
    }

    gameWindow.webContents.on('did-finish-load', () => {
      gameWindow.webContents.send('game:loaded', game)
      gameWindow.webContents.send('game:mode', 'native')
      gameWindow.webContents.send('game:av-info', avInfo)

      if (shouldResume) {
        workerClient.loadState(99).catch((error) => {
          gameWindowLog.error('Failed to load autosave:', error)
        })
      }
    })

    this.activeWorkerClient = workerClient

    // Forward video frames from worker to renderer
    workerClient.on('videoFrame', (frame: { data: Buffer; width: number; height: number }) => {
      if (!gameWindow.isDestroyed()) {
        gameWindow.webContents.send('game:video-frame', frame)
      }
    })

    // Forward audio samples from worker to renderer
    workerClient.on('audioSamples', (audio: { samples: Buffer; sampleRate: number }) => {
      if (!gameWindow.isDestroyed()) {
        gameWindow.webContents.send('game:audio-samples', audio)
      }
    })

    // Forward fatal errors to renderer
    workerClient.on('error', (err: { message: string; fatal: boolean }) => {
      if (err.fatal && !gameWindow.isDestroyed()) {
        gameWindow.webContents.send('game:emulation-error', { message: err.message })
      }
    })

    gameWindow.on('close', (event) => {
      const windowId = gameWindow.id

      // If renderer already signalled ready-to-close, allow the close to proceed
      if (this.readyToCloseWindows.has(windowId)) {
        this.readyToCloseWindows.delete(windowId)
        return
      }

      // Prevent the default close so we can play the shutdown animation
      event.preventDefault()

      // Pause the worker to stop new frames while we save + animate
      workerClient.pause()

      // Save game data in the worker (async). We proceed with the close
      // animation even if saves fail — data loss is better than a hung window.
      Promise.all([
        workerClient.saveSram().catch((error) => {
          gameWindowLog.error('Failed to save SRAM on close:', error)
        }),
        workerClient.saveState(99).catch((error) => {
          gameWindowLog.error('Failed to autosave on close:', error)
        }),
      ]).then(() => {
        // Tell the renderer to start the shutdown animation
        if (!gameWindow.isDestroyed()) {
          gameWindow.webContents.send('game:prepare-close')
        }
      })

      // Safety timeout: force-close if the renderer doesn't respond in time
      const timeout = setTimeout(() => {
        this.shutdownTimeouts.delete(windowId)
        if (!gameWindow.isDestroyed()) {
          this.readyToCloseWindows.add(windowId)
          gameWindow.close()
        }
      }, SHUTDOWN_ANIMATION_TIMEOUT)
      this.shutdownTimeouts.set(windowId, timeout)
    })

    gameWindow.on('closed', () => {
      const windowId = gameWindow.id
      // Clean up any pending shutdown timeout
      const timeout = this.shutdownTimeouts.get(windowId)
      if (timeout) {
        clearTimeout(timeout)
        this.shutdownTimeouts.delete(windowId)
      }
      this.readyToCloseWindows.delete(windowId)
      this.activeWorkerClient = null
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

    if (process.env.ELECTRON_RENDERER_URL) {
      gameWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/game-window.html`)
    } else {
      gameWindow.loadFile(
        path.join(__dirname, '../renderer/game-window.html'),
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
      gameWindowLog.warn(`Game window for ${gameId} not found or destroyed`)
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

    // Renderer signals that the shutdown animation has completed
    ipcMain.on('game-window:ready-to-close', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window && !window.isDestroyed()) {
        const windowId = window.id
        // Clear the safety timeout since the renderer responded in time
        const timeout = this.shutdownTimeouts.get(windowId)
        if (timeout) {
          clearTimeout(timeout)
          this.shutdownTimeouts.delete(windowId)
        }
        // Fade/shrink the OS window, then destroy it
        animateWindowClose(window).then(() => {
          if (!window.isDestroyed()) {
            this.readyToCloseWindows.add(windowId)
            window.close()
          }
        })
      }
    })

    // Input forwarding from renderer to emulation worker
    ipcMain.on('game:input', (_event, port: number, id: number, pressed: boolean) => {
      this.activeWorkerClient?.setInput(port, id, pressed)
    })
  }

  destroy(): void {
    // Clear all pending shutdown timeouts
    for (const timeout of this.shutdownTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.shutdownTimeouts.clear()
    this.readyToCloseWindows.clear()

    this.closeAllGameWindows()
    this.activeWorkerClient = null
    ipcMain.removeAllListeners('game-window:minimize')
    ipcMain.removeAllListeners('game-window:maximize')
    ipcMain.removeAllListeners('game-window:close')
    ipcMain.removeAllListeners('game-window:toggle-fullscreen')
    ipcMain.removeAllListeners('game-window:set-click-through')
    ipcMain.removeAllListeners('game-window:set-traffic-light-visible')
    ipcMain.removeAllListeners('game-window:ready-to-close')
    ipcMain.removeAllListeners('game:input')
  }
}
