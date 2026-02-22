import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, WebGLRendererComponent, Game as UiGame, cn, type GameCardMenuItem } from '@gamelord/ui'
import { useWebGLRenderer } from './hooks/useWebGLRenderer'
import { Check, Monitor, Tv, Sun, Moon, Cpu, Heart, SunMoon } from 'lucide-react'
import { DevAgentation } from './components/DevAgentation'
import { DevBranchBadge } from './components/DevBranchBadge'
import { LibraryView } from './components/LibraryView'
import { ResumeGameDialog } from './components/ResumeGameDialog'
import { CoreSelectDialog } from './components/CoreSelectDialog'
import type { GamelordAPI, CoreInfo } from './types/global'

interface ResumeDialogState {
  open: boolean
  requestId: string
  gameTitle: string
}

interface CardBounds {
  x: number
  y: number
  width: number
  height: number
}

interface CoreSelectDialogState {
  open: boolean
  systemId: string
  systemName: string
  cores: CoreInfo[]
  /** The game that triggered the core selection dialog. */
  pendingGame: UiGame | null
  /** True when the dialog was opened from a dropdown menu (suppresses overlay animation). */
  fromDropdown: boolean
}

/**
 * View state machine for crossfade transitions between library and game views.
 * - `library`   — Only the library is rendered.
 * - `to-game`   — Both views rendered; library fading out, game fading in.
 * - `game`      — Only the game view is rendered.
 * - `to-library` — Both views rendered; game fading out, library fading in.
 */
type ViewState = 'library' | 'to-game' | 'game' | 'to-library'

/** Duration of the crossfade transition in milliseconds. */
const VIEW_TRANSITION_MS = 300

function App() {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord
  const [viewState, setViewState] = useState<ViewState>('library')
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { currentShader, handleRendererReady, changeShader } =
    useWebGLRenderer()
  type ThemeMode = 'system' | 'dark' | 'light'
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('gamelord:theme')
    if (saved === 'dark' || saved === 'light') return saved
    return 'system'
  })
  const [resumeDialog, setResumeDialog] = useState<ResumeDialogState>({
    open: false,
    requestId: '',
    gameTitle: '',
  })
  const [coreSelectDialog, setCoreSelectDialog] = useState<CoreSelectDialogState>({
    open: false,
    systemId: '',
    systemName: '',
    cores: [],
    pendingGame: null,
    fromDropdown: false,
  })
  /** Stashed card bounds from the last game card click (for hero transition). */
  const pendingCardBoundsRef = useRef<CardBounds | null>(null)
  /** Tracks which game is currently being launched (shimmer + disable other cards). */
  const [launchingGameId, setLaunchingGameId] = useState<string | null>(null)

  // Listen for resume game dialog requests from main process
  useEffect(() => {
    const handleShowResumeDialog = (data: { requestId: string; gameTitle: string }) => {
      setResumeDialog({
        open: true,
        requestId: data.requestId,
        gameTitle: data.gameTitle,
      })
    }

    api.on('dialog:showResumeGame', handleShowResumeDialog)

    return () => {
      api.removeAllListeners('dialog:showResumeGame')
    }
  }, [api])

  const handleResumeDialogResponse = useCallback((shouldResume: boolean) => {
    api.dialog.respondResumeGame(resumeDialog.requestId, shouldResume)
    // Only set open to false — keep data intact so the close animation
    // doesn't show blank content. Data is overwritten on next open.
    setResumeDialog((previous) => ({ ...previous, open: false }))
  }, [api, resumeDialog.requestId])

  /** Applies the dark class to <html> with a smooth crossfade transition. */
  const applyDarkClass = useCallback((shouldBeDark: boolean) => {
    document.body.classList.add('theme-transitioning')
    document.documentElement.classList.toggle('dark', shouldBeDark)
    setTimeout(() => {
      document.body.classList.remove('theme-transitioning')
    }, 200)
  }, [])

  // Listen for OS theme changes via IPC so "system" mode updates live.
  // Electron's Chromium doesn't reliably fire matchMedia change events for
  // prefers-color-scheme, so the main process forwards nativeTheme updates.
  useEffect(() => {
    if (themeMode !== 'system') return

    const handleSystemThemeChange = (isDark: boolean) => {
      applyDarkClass(isDark)
    }

    api.on('theme:systemChanged', handleSystemThemeChange)
    return () => api.removeAllListeners('theme:systemChanged')
  }, [api, themeMode, applyDarkClass])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeMode(mode)
    localStorage.setItem('gamelord:theme', mode)

    const shouldBeDark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    applyDarkClass(shouldBeDark)
  }, [applyDarkClass])

  /** Resolves the machine-readable system ID from a UiGame. */
  const getSystemId = (game: UiGame) => game.systemId ?? game.platform

  /**
   * Launches a game with an explicit core name, downloading the core first
   * if it isn't installed yet.
   */
  const launchGameWithCore = async (game: UiGame, coreName?: string) => {
    const systemId = getSystemId(game)
    // Consume stashed card bounds (one-shot for this launch)
    const cardBounds = pendingCardBoundsRef.current
    pendingCardBoundsRef.current = null
    try {
      // If a specific core was requested and it isn't installed, download it
      if (coreName) {
        const cores = await api.emulator.getCoresForSystem(systemId)
        const selectedCore = cores.find((core) => core.name === coreName)
        if (selectedCore && !selectedCore.installed) {
          const downloadResult = await api.emulator.downloadCore(coreName, systemId)
          if (!downloadResult.success) {
            alert(`Failed to download core: ${downloadResult.error}`)
            setLaunchingGameId(null)
            return
          }
        }
      }

      const result = await api.emulator.launch(
        game.romPath,
        systemId,
        undefined,
        coreName,
        cardBounds ?? undefined,
      )

      if (!result.success) {
        console.error('Failed to launch emulator:', result.error)
        alert(`Failed to launch game: ${result.error}`)
      }
    } catch (error) {
      console.error('Error launching game:', error)
      alert(`Error: ${error}`)
    } finally {
      setLaunchingGameId(null)
    }
  }

  const handlePlayGame = async (game: UiGame, cardRect?: DOMRect) => {
    // Prevent double-launches
    if (launchingGameId) return

    const systemId = getSystemId(game)
    setLaunchingGameId(game.id)

    // Stash card bounds for the hero transition (consumed by launchGameWithCore)
    if (cardRect) {
      pendingCardBoundsRef.current = {
        x: Math.round(cardRect.x),
        y: Math.round(cardRect.y),
        width: Math.round(cardRect.width),
        height: Math.round(cardRect.height),
      }
    }
    try {
      const cores = await api.emulator.getCoresForSystem(systemId)

      // If there are 0 or 1 cores, launch directly (no selection needed)
      if (cores.length <= 1) {
        await launchGameWithCore(game, cores[0]?.name)
        return
      }

      // Check for a saved core preference
      const preferenceKey = `gamelord:core-preference:${systemId}`
      const savedCoreName = localStorage.getItem(preferenceKey)

      if (savedCoreName) {
        await launchGameWithCore(game, savedCoreName)
        return
      }

      // Multiple cores available and no preference saved — show the dialog
      setCoreSelectDialog({
        open: true,
        systemId,
        systemName: systemId.toUpperCase(),
        cores,
        pendingGame: game,
        fromDropdown: false,
      })
    } catch (error) {
      console.error('Error launching game:', error)
      alert(`Error: ${error}`)
      setLaunchingGameId(null)
    }
  }

  const handleCoreSelect = async (coreName: string, remember: boolean) => {
    const { pendingGame, systemId } = coreSelectDialog

    // Close the dialog immediately
    setCoreSelectDialog((previous) => ({ ...previous, open: false }))

    if (remember) {
      localStorage.setItem(`gamelord:core-preference:${systemId}`, coreName)
    }

    if (pendingGame) {
      await launchGameWithCore(pendingGame, coreName)
    }
  }

  const handleCoreSelectCancel = () => {
    // Only set open to false — keep data intact so the close animation
    // doesn't show blank content. Data is overwritten on next open.
    setCoreSelectDialog((previous) => ({ ...previous, open: false }))
    setLaunchingGameId(null)
  }

  /**
   * Opens the core selection dialog for a game, clearing any saved preference
   * so the user can pick a different core.
   */
  const handleChangeCore = async (game: UiGame) => {
    const systemId = getSystemId(game)

    // Show the dialog immediately (with an empty cores list so it displays a
    // loading state) and suppress the overlay animation so there's no flash
    // between the dropdown menu closing and this dialog opening.
    setCoreSelectDialog({
      open: true,
      systemId,
      systemName: systemId.toUpperCase(),
      cores: [],
      pendingGame: game,
      fromDropdown: true,
    })

    try {
      const cores = await api.emulator.getCoresForSystem(systemId)
      if (cores.length <= 1) {
        // Nothing to change — close the dialog
        setCoreSelectDialog((previous) => ({ ...previous, open: false }))
        return
      }

      // Clear any saved preference so the dialog doesn't auto-skip
      localStorage.removeItem(`gamelord:core-preference:${systemId}`)

      // Populate the dialog with the fetched cores
      setCoreSelectDialog((previous) => ({ ...previous, cores }))
    } catch (error) {
      console.error('Error fetching cores:', error)
      setCoreSelectDialog((previous) => ({ ...previous, open: false }))
    }
  }

  /** Returns dropdown menu items for a game card. */
  const getMenuItems = useCallback((game: UiGame): GameCardMenuItem[] => {
    const items: GameCardMenuItem[] = []

    items.push({
      label: game.favorite ? 'Unfavorite' : 'Favorite',
      icon: <Heart className={cn('h-4 w-4', game.favorite && 'fill-current')} />,
      onClick: () => {
        api.library.updateGame(game.id, { favorite: !game.favorite })
      },
    })

    items.push({
      label: 'Change Core',
      icon: <Cpu className="h-4 w-4" />,
      onClick: () => void handleChangeCore(game),
    })

    return items
  }, [])

  const handleStop = async () => {
    try {
      await api.emulator.stop()
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current)
      setViewState('to-library')
      viewTimerRef.current = setTimeout(() => {
        setViewState('library')
        viewTimerRef.current = null
      }, VIEW_TRANSITION_MS)
    } catch (error) {
      console.error('Error stopping emulator:', error)
    }
  }

  const showLibrary = viewState === 'library' || viewState === 'to-game' || viewState === 'to-library'
  const showGame = viewState === 'game' || viewState === 'to-game' || viewState === 'to-library'

  const libraryOpacity = viewState === 'to-game' ? 0 : viewState === 'to-library' ? 1 : viewState === 'library' ? 1 : 0
  const gameOpacity = viewState === 'to-game' ? 1 : viewState === 'to-library' ? 0 : viewState === 'game' ? 1 : 0

  return (
    <div className="relative min-h-screen bg-background">
      {/* Library view layer */}
      {showLibrary && (
        <div
          className="absolute inset-0 flex flex-col"
          style={{
            opacity: libraryOpacity,
            transition: `opacity ${VIEW_TRANSITION_MS}ms ease`,
            pointerEvents: viewState === 'library' ? 'auto' : 'none',
          }}
        >
          <div className="drag-region titlebar-inset h-10 border-b flex items-center justify-end gap-2 px-4">
            <DevBranchBadge />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="no-drag h-7 w-7">
                  {themeMode === 'system' ? <SunMoon className="h-4 w-4" /> : themeMode === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme('system')}>
                  <SunMoon className="h-4 w-4" />
                  System
                  {themeMode === 'system' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('light')}>
                  <Sun className="h-4 w-4" />
                  Light
                  {themeMode === 'light' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>
                  <Moon className="h-4 w-4" />
                  Dark
                  {themeMode === 'dark' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex-1 overflow-hidden">
            <LibraryView onPlayGame={handlePlayGame} getMenuItems={getMenuItems} launchingGameId={launchingGameId} />
          </div>

          {/* Resume game dialog */}
          <ResumeGameDialog
            open={resumeDialog.open}
            gameTitle={resumeDialog.gameTitle}
            onResume={() => handleResumeDialogResponse(true)}
            onStartFresh={() => handleResumeDialogResponse(false)}
          />

          {/* Core selection dialog */}
          <CoreSelectDialog
            open={coreSelectDialog.open}
            systemName={coreSelectDialog.systemName}
            cores={coreSelectDialog.cores}
            onSelect={handleCoreSelect}
            onCancel={handleCoreSelectCancel}
            suppressOverlayAnimation={coreSelectDialog.fromDropdown}
          />
        </div>
      )}

      {/* Game view layer */}
      {showGame && (
        <div
          className="absolute inset-0 flex flex-col"
          style={{
            opacity: gameOpacity,
            transition: `opacity ${VIEW_TRANSITION_MS}ms ease`,
            pointerEvents: viewState === 'game' ? 'auto' : 'none',
          }}
        >
          <div className="flex items-center justify-between p-4 border-b drag-region titlebar-inset">
            <h1 className="text-2xl font-bold">GameLord</h1>
            <div className="flex gap-2 no-drag">
              <Button
                variant={currentShader === 'default' ? 'default' : 'outline'}
                size="sm"
                onClick={() => changeShader('default')}
              >
                <Monitor className="h-4 w-4 mr-2" />
                Default
              </Button>
              <Button
                variant={currentShader === 'crt' ? 'default' : 'outline'}
                size="sm"
                onClick={() => changeShader('crt')}
              >
                <Tv className="h-4 w-4 mr-2" />
                CRT
              </Button>
              <Button variant="destructive" size="sm" onClick={handleStop}>
                Stop
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <WebGLRendererComponent
              className="h-full"
              onReady={handleRendererReady}
            />
          </div>
        </div>
      )}

      <DevAgentation />
    </div>
  )
}

export default App
