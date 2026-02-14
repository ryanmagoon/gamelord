// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const MOCK_USER_DATA = '/tmp/gamelord-window-test'

// Hoisted mocks for use in vi.mock factories
const { mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}))

const mockGetBounds = vi.fn().mockReturnValue({ x: 100, y: 200, width: 1024, height: 768 })
const mockSetBounds = vi.fn()
const mockSetSize = vi.fn()
const mockCenter = vi.fn()
const mockMaximize = vi.fn()
const mockSetFullScreen = vi.fn()
const mockIsMaximized = vi.fn().mockReturnValue(false)
const mockIsFullScreen = vi.fn().mockReturnValue(false)
const mockIsDestroyed = vi.fn().mockReturnValue(false)
const mockOn = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return MOCK_USER_DATA
      return '/tmp'
    },
  },
  BrowserWindow: vi.fn(),
  screen: {
    getAllDisplays: () => [
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ],
  },
}))

vi.mock('node:fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  },
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

// Import after mocks are set up
import { getSavedWindowBounds, manageWindowState, saveWindowStateNow, type WindowStateConfig } from './windowState'
import type { BrowserWindow } from 'electron'

function createMockWindow(): BrowserWindow {
  return {
    getBounds: mockGetBounds,
    setBounds: mockSetBounds,
    setSize: mockSetSize,
    center: mockCenter,
    maximize: mockMaximize,
    setFullScreen: mockSetFullScreen,
    isMaximized: mockIsMaximized,
    isFullScreen: mockIsFullScreen,
    isDestroyed: mockIsDestroyed,
    on: mockOn,
  } as unknown as BrowserWindow
}

const GAME_WINDOW_CONFIG: WindowStateConfig = {
  stateFile: 'game-window-state.json',
  defaults: {
    x: -1,
    y: -1,
    width: 960,
    height: 720,
    isMaximized: false,
    isFullScreen: false,
  },
  trackFullScreen: true,
  manualCloseSave: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockReadFileSync.mockReset()
  mockWriteFileSync.mockReset()
  mockIsMaximized.mockReturnValue(false)
  mockIsFullScreen.mockReturnValue(false)
  mockIsDestroyed.mockReturnValue(false)
  mockGetBounds.mockReturnValue({ x: 100, y: 200, width: 1024, height: 768 })
})

describe('getSavedWindowBounds', () => {
  it('returns default dimensions when no saved state exists', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const bounds = getSavedWindowBounds()
    expect(bounds).toEqual({ width: 1280, height: 800 })
    expect(bounds).not.toHaveProperty('x')
    expect(bounds).not.toHaveProperty('y')
  })

  it('returns saved position and dimensions from disk', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ x: 50, y: 75, width: 1400, height: 900, isMaximized: false })
    )

    const bounds = getSavedWindowBounds()
    expect(bounds).toEqual({ x: 50, y: 75, width: 1400, height: 900 })
  })

  it('returns only width/height when saved position is default (-1)', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ x: -1, y: -1, width: 1000, height: 700, isMaximized: false })
    )

    const bounds = getSavedWindowBounds()
    expect(bounds).toEqual({ width: 1000, height: 700 })
    expect(bounds).not.toHaveProperty('x')
    expect(bounds).not.toHaveProperty('y')
  })

  it('returns defaults when saved state has invalid JSON', () => {
    mockReadFileSync.mockReturnValue('not json!!!')

    const bounds = getSavedWindowBounds()
    expect(bounds).toEqual({ width: 1280, height: 800 })
  })

  it('uses default values for missing fields in saved state', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ width: 900 }))

    const bounds = getSavedWindowBounds()
    // x and y default to -1, so no position returned
    expect(bounds).toEqual({ width: 900, height: 800 })
  })

  it('resets position when saved window is not visible on any display', () => {
    // Position far off-screen — not within any display
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ x: 5000, y: 5000, width: 1024, height: 768, isMaximized: false })
    )

    const bounds = getSavedWindowBounds()
    // Position should be reset to default (-1, -1), so no x/y returned
    expect(bounds).toEqual({ width: 1024, height: 768 })
    expect(bounds).not.toHaveProperty('x')
    expect(bounds).not.toHaveProperty('y')
  })

  it('uses custom config defaults and file path', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const bounds = getSavedWindowBounds(GAME_WINDOW_CONFIG)
    expect(bounds).toEqual({ width: 960, height: 720 })

    // Verify it reads from the custom state file
    expect(mockReadFileSync).toHaveBeenCalledWith(
      `${MOCK_USER_DATA}/game-window-state.json`,
      'utf-8'
    )
  })

  it('reads saved state from custom config file', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ x: 300, y: 400, width: 800, height: 600, isMaximized: false, isFullScreen: true })
    )

    const bounds = getSavedWindowBounds(GAME_WINDOW_CONFIG)
    expect(bounds).toEqual({ x: 300, y: 400, width: 800, height: 600 })
  })
})

describe('manageWindowState', () => {
  it('restores saved position and size to the window', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ x: 200, y: 300, width: 1100, height: 850, isMaximized: false })
    )

    const window = createMockWindow()
    manageWindowState(window)

    expect(mockSetBounds).toHaveBeenCalledWith({ x: 200, y: 300, width: 1100, height: 850 })
    expect(mockCenter).not.toHaveBeenCalled()
  })

  it('centers the window when no saved position exists', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ x: -1, y: -1, width: 1280, height: 800, isMaximized: false })
    )

    const window = createMockWindow()
    manageWindowState(window)

    expect(mockSetBounds).not.toHaveBeenCalled()
    expect(mockSetSize).toHaveBeenCalledWith(1280, 800)
    expect(mockCenter).toHaveBeenCalled()
  })

  it('maximizes the window when saved state was maximized', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ x: 100, y: 100, width: 1024, height: 768, isMaximized: true })
    )

    const window = createMockWindow()
    manageWindowState(window)

    expect(mockMaximize).toHaveBeenCalled()
  })

  it('registers event listeners for resize, move, maximize, unmaximize, and close', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const window = createMockWindow()
    manageWindowState(window)

    const registeredEvents = mockOn.mock.calls.map((call: unknown[]) => call[0])
    expect(registeredEvents).toContain('resize')
    expect(registeredEvents).toContain('move')
    expect(registeredEvents).toContain('maximize')
    expect(registeredEvents).toContain('unmaximize')
    expect(registeredEvents).toContain('close')
  })

  it('saves normal bounds on close when not maximized', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const window = createMockWindow()
    manageWindowState(window)

    // Get the 'close' handler
    const closeCall = mockOn.mock.calls.find((call: unknown[]) => call[0] === 'close')
    expect(closeCall).toBeDefined()

    const closeHandler = closeCall![1] as () => void
    closeHandler()

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      `${MOCK_USER_DATA}/window-state.json`,
      expect.stringContaining('"width": 1024'),
      'utf-8'
    )
  })

  it('saves maximized flag on close when maximized', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ x: 100, y: 200, width: 1024, height: 768, isMaximized: false })
    )
    mockIsMaximized.mockReturnValue(true)

    const window = createMockWindow()
    manageWindowState(window)

    const closeCall = mockOn.mock.calls.find((call: unknown[]) => call[0] === 'close')
    const closeHandler = closeCall![1] as () => void
    closeHandler()

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      `${MOCK_USER_DATA}/window-state.json`,
      expect.stringContaining('"isMaximized": true'),
      'utf-8'
    )
  })

  it('does not save on close when window is destroyed', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    mockIsDestroyed.mockReturnValue(true)

    const window = createMockWindow()
    manageWindowState(window)

    const closeCall = mockOn.mock.calls.find((call: unknown[]) => call[0] === 'close')
    const closeHandler = closeCall![1] as () => void
    closeHandler()

    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  describe('with trackFullScreen config', () => {
    it('restores fullscreen state when saved', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ x: 100, y: 100, width: 960, height: 720, isMaximized: false, isFullScreen: true })
      )

      const window = createMockWindow()
      manageWindowState(window, GAME_WINDOW_CONFIG)

      expect(mockSetFullScreen).toHaveBeenCalledWith(true)
      expect(mockMaximize).not.toHaveBeenCalled()
    })

    it('registers fullscreen events instead of maximize events', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const window = createMockWindow()
      manageWindowState(window, GAME_WINDOW_CONFIG)

      const registeredEvents = mockOn.mock.calls.map((call: unknown[]) => call[0])
      expect(registeredEvents).toContain('resize')
      expect(registeredEvents).toContain('move')
      expect(registeredEvents).toContain('enter-full-screen')
      expect(registeredEvents).toContain('leave-full-screen')
      expect(registeredEvents).not.toContain('maximize')
      expect(registeredEvents).not.toContain('unmaximize')
    })

    it('defaults isFullScreen to false when missing from saved state', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ x: 100, y: 100, width: 960, height: 720, isMaximized: false })
      )

      const window = createMockWindow()
      manageWindowState(window, GAME_WINDOW_CONFIG)

      expect(mockSetFullScreen).not.toHaveBeenCalled()
    })
  })

  describe('with manualCloseSave config', () => {
    it('does not attach a close handler', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const window = createMockWindow()
      manageWindowState(window, GAME_WINDOW_CONFIG)

      const registeredEvents = mockOn.mock.calls.map((call: unknown[]) => call[0])
      expect(registeredEvents).not.toContain('close')
    })
  })
})

describe('saveWindowStateNow', () => {
  it('saves current bounds when not fullscreen or maximized', () => {
    const window = createMockWindow()
    saveWindowStateNow(window, GAME_WINDOW_CONFIG)

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      `${MOCK_USER_DATA}/game-window-state.json`,
      expect.stringContaining('"width": 1024'),
      'utf-8'
    )
    const savedState = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
    expect(savedState.isFullScreen).toBe(false)
    expect(savedState.isMaximized).toBe(false)
  })

  it('preserves pre-fullscreen bounds when fullscreen', () => {
    mockIsFullScreen.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ x: 300, y: 400, width: 960, height: 720, isMaximized: false, isFullScreen: false })
    )

    const window = createMockWindow()
    saveWindowStateNow(window, GAME_WINDOW_CONFIG)

    const savedState = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
    expect(savedState.isFullScreen).toBe(true)
    // Should preserve the pre-fullscreen bounds, not the current fullscreen bounds
    expect(savedState.width).toBe(960)
    expect(savedState.height).toBe(720)
  })

  it('does nothing when window is destroyed', () => {
    mockIsDestroyed.mockReturnValue(true)

    const window = createMockWindow()
    saveWindowStateNow(window, GAME_WINDOW_CONFIG)

    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })
})
