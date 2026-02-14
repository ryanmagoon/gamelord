import { app, BrowserWindow, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { mainLog } from '../logger'

interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
  isFullScreen: boolean
}

export interface WindowStateConfig {
  /** File name stored in the userData directory. */
  stateFile: string
  /** Default state when no saved file exists. */
  defaults: WindowState
  /** Track fullscreen instead of maximized state. */
  trackFullScreen?: boolean
  /**
   * If true, the caller is responsible for saving state on close via
   * `saveWindowStateNow`. `manageWindowState` will not attach a `close`
   * listener. Useful when the window has a custom close flow (e.g.
   * shutdown animation) that could corrupt saved bounds.
   */
  manualCloseSave?: boolean
}

export const MAIN_WINDOW_CONFIG: WindowStateConfig = {
  stateFile: 'window-state.json',
  defaults: {
    x: -1,
    y: -1,
    width: 1280,
    height: 800,
    isMaximized: false,
    isFullScreen: false,
  },
}

function loadWindowState(config: WindowStateConfig = MAIN_WINDOW_CONFIG): WindowState {
  const filePath = path.join(app.getPath('userData'), config.stateFile)
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WindowState>

    const state: WindowState = {
      x: typeof parsed.x === 'number' ? parsed.x : config.defaults.x,
      y: typeof parsed.y === 'number' ? parsed.y : config.defaults.y,
      width: typeof parsed.width === 'number' ? parsed.width : config.defaults.width,
      height: typeof parsed.height === 'number' ? parsed.height : config.defaults.height,
      isMaximized: typeof parsed.isMaximized === 'boolean' ? parsed.isMaximized : config.defaults.isMaximized,
      isFullScreen: typeof parsed.isFullScreen === 'boolean' ? parsed.isFullScreen : config.defaults.isFullScreen,
    }

    // Validate that the saved position is still visible on any connected display
    if (state.x !== -1 && state.y !== -1) {
      const visible = screen.getAllDisplays().some((display) => {
        const { x, y, width, height } = display.workArea
        // Check if at least 100px of the window is within this display
        return (
          state.x + state.width > x + 100 &&
          state.x < x + width - 100 &&
          state.y > y - 50 &&
          state.y < y + height - 100
        )
      })

      if (!visible) {
        // Reset position to center on primary display
        state.x = -1
        state.y = -1
      }
    }

    return state
  } catch {
    return { ...config.defaults }
  }
}

function saveWindowState(state: WindowState, config: WindowStateConfig = MAIN_WINDOW_CONFIG): void {
  const filePath = path.join(app.getPath('userData'), config.stateFile)
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
  } catch (error) {
    mainLog.error('Failed to save window state:', error)
  }
}

/**
 * Save current window state to disk immediately. Use this when the caller
 * manages its own close lifecycle (e.g. `manualCloseSave: true`).
 */
export function saveWindowStateNow(window: BrowserWindow, config: WindowStateConfig): void {
  if (window.isDestroyed()) return

  const isFullScreen = config.trackFullScreen ? window.isFullScreen() : false
  const isMaximized = !config.trackFullScreen ? window.isMaximized() : false

  if (!isFullScreen && !isMaximized) {
    const bounds = window.getBounds()
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: false,
      isFullScreen: false,
    }, config)
  } else {
    const existing = loadWindowState(config)
    saveWindowState({
      ...existing,
      isMaximized,
      isFullScreen,
    }, config)
  }
}

/**
 * Attach window state tracking to a BrowserWindow.
 *
 * Listens for resize/move/maximize/close events and persists the window
 * bounds so they can be restored on the next launch.
 */
export function manageWindowState(window: BrowserWindow, config: WindowStateConfig = MAIN_WINDOW_CONFIG): void {
  const state = loadWindowState(config)

  // Restore saved bounds
  if (state.x !== -1 && state.y !== -1) {
    window.setBounds({ x: state.x, y: state.y, width: state.width, height: state.height })
  } else {
    window.setSize(state.width, state.height)
    window.center()
  }

  if (config.trackFullScreen && state.isFullScreen) {
    window.setFullScreen(true)
  } else if (!config.trackFullScreen && state.isMaximized) {
    window.maximize()
  }

  // Debounced save — don't write to disk on every pixel of a resize/move
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  const scheduleSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      if (window.isDestroyed()) return

      if (config.trackFullScreen) {
        const isFullScreen = window.isFullScreen()
        if (!isFullScreen) {
          const bounds = window.getBounds()
          saveWindowState({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isMaximized: false,
            isFullScreen: false,
          }, config)
        } else {
          const existing = loadWindowState(config)
          saveWindowState({ ...existing, isFullScreen: true }, config)
        }
      } else {
        const isMaximized = window.isMaximized()
        if (!isMaximized) {
          const bounds = window.getBounds()
          saveWindowState({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isMaximized: false,
            isFullScreen: false,
          }, config)
        } else {
          const existing = loadWindowState(config)
          saveWindowState({ ...existing, isMaximized: true }, config)
        }
      }
    }, 500)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)

  if (config.trackFullScreen) {
    window.on('enter-full-screen', scheduleSave)
    window.on('leave-full-screen', scheduleSave)
  } else {
    window.on('maximize', scheduleSave)
    window.on('unmaximize', scheduleSave)
  }

  if (!config.manualCloseSave) {
    // Final save on close to ensure latest state is persisted
    window.on('close', () => {
      if (saveTimeout) clearTimeout(saveTimeout)
      saveWindowStateNow(window, config)
    })
  }
}

/**
 * Get saved window state for use in BrowserWindow constructor options.
 * Returns width/height (and optionally x/y) from the last saved state.
 */
export function getSavedWindowBounds(config: WindowStateConfig = MAIN_WINDOW_CONFIG): { width: number; height: number; x?: number; y?: number } {
  const state = loadWindowState(config)
  if (state.x !== -1 && state.y !== -1) {
    return { width: state.width, height: state.height, x: state.x, y: state.y }
  }
  return { width: state.width, height: state.height }
}
