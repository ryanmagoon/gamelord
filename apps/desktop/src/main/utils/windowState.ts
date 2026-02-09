import { app, BrowserWindow, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

const STATE_FILE = 'window-state.json'

const defaultState: WindowState = {
  x: -1,
  y: -1,
  width: 1280,
  height: 800,
  isMaximized: false,
}

/** Load the saved window bounds from disk, or return defaults. */
function loadWindowState(): WindowState {
  const filePath = path.join(app.getPath('userData'), STATE_FILE)
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WindowState>

    const state: WindowState = {
      x: typeof parsed.x === 'number' ? parsed.x : defaultState.x,
      y: typeof parsed.y === 'number' ? parsed.y : defaultState.y,
      width: typeof parsed.width === 'number' ? parsed.width : defaultState.width,
      height: typeof parsed.height === 'number' ? parsed.height : defaultState.height,
      isMaximized: typeof parsed.isMaximized === 'boolean' ? parsed.isMaximized : defaultState.isMaximized,
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
    return { ...defaultState }
  }
}

/** Save the current window bounds to disk. */
function saveWindowState(state: WindowState): void {
  const filePath = path.join(app.getPath('userData'), STATE_FILE)
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save window state:', error)
  }
}

/**
 * Attach window state tracking to a BrowserWindow.
 *
 * Listens for resize/move/maximize/close events and persists the window
 * bounds so they can be restored on the next launch.
 *
 * Returns the loaded state so the caller can apply it to BrowserWindow options.
 */
export function manageWindowState(window: BrowserWindow): void {
  const state = loadWindowState()

  // Restore saved bounds
  if (state.x !== -1 && state.y !== -1) {
    window.setBounds({ x: state.x, y: state.y, width: state.width, height: state.height })
  } else {
    window.setSize(state.width, state.height)
    window.center()
  }

  if (state.isMaximized) {
    window.maximize()
  }

  // Debounced save — don't write to disk on every pixel of a resize/move
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  const scheduleSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      if (window.isDestroyed()) return

      const isMaximized = window.isMaximized()
      // Only save normal bounds (not maximized bounds) so we restore
      // to the last non-maximized size when un-maximized.
      if (!isMaximized) {
        const bounds = window.getBounds()
        saveWindowState({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          isMaximized: false,
        })
      } else {
        // Save the maximized flag but keep the last known normal bounds
        const existing = loadWindowState()
        saveWindowState({ ...existing, isMaximized: true })
      }
    }, 500)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)

  // Final save on close to ensure latest state is persisted
  window.on('close', () => {
    if (saveTimeout) clearTimeout(saveTimeout)

    if (!window.isDestroyed()) {
      const isMaximized = window.isMaximized()
      if (!isMaximized) {
        const bounds = window.getBounds()
        saveWindowState({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          isMaximized: false,
        })
      } else {
        const existing = loadWindowState()
        saveWindowState({ ...existing, isMaximized: true })
      }
    }
  })
}

/**
 * Get saved window state for use in BrowserWindow constructor options.
 * Returns width/height (and optionally x/y) from the last saved state.
 */
export function getSavedWindowBounds(): { width: number; height: number; x?: number; y?: number } {
  const state = loadWindowState()
  if (state.x !== -1 && state.y !== -1) {
    return { width: state.width, height: state.height, x: state.x, y: state.y }
  }
  return { width: state.width, height: state.height }
}
