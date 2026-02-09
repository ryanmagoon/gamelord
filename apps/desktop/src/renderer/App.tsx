import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Button, WebGLRendererComponent, Game as UiGame, type GameCardMenuItem } from '@gamelord/ui'
import { useWebGLRenderer } from './hooks/useWebGLRenderer'
import { Monitor, Tv, Sun, Moon, Cpu } from 'lucide-react'
import { LibraryView } from './components/LibraryView'
import { ResumeGameDialog } from './components/ResumeGameDialog'
import { CoreSelectDialog } from './components/CoreSelectDialog'
import { Game } from '../types/library'
import type { GamelordAPI, CoreInfo } from './types/global'

interface ResumeDialogState {
  open: boolean
  requestId: string
  gameTitle: string
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
  const [currentGame, setCurrentGame] = useState<Game | null>(null)
  const { isReady, currentShader, handleRendererReady, changeShader } =
    useWebGLRenderer()
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark'),
  )
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
    setResumeDialog({ open: false, requestId: '', gameTitle: '' })
  }, [api, resumeDialog.requestId])

  const toggleTheme = useCallback(() => {
    const next = !isDark

    // Enable cross-fade transitions before toggling
    document.body.classList.add('theme-transitioning')

    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('gamelord:theme', next ? 'dark' : 'light')

    // Remove the transition class after the 200ms cross-fade completes
    setTimeout(() => {
      document.body.classList.remove('theme-transitioning')
    }, 200)
  }, [isDark])

  /** Resolves the machine-readable system ID from a UiGame. */
  const getSystemId = (game: UiGame) => game.systemId ?? game.platform

  /**
   * Launches a game with an explicit core name, downloading the core first
   * if it isn't installed yet.
   */
  const launchGameWithCore = async (game: UiGame, coreName?: string) => {
    const systemId = getSystemId(game)
    try {
      // If a specific core was requested and it isn't installed, download it
      if (coreName) {
        const cores = await api.emulator.getCoresForSystem(systemId)
        const selectedCore = cores.find((core) => core.name === coreName)
        if (selectedCore && !selectedCore.installed) {
          const downloadResult = await api.emulator.downloadCore(coreName, systemId)
          if (!downloadResult.success) {
            alert(`Failed to download core: ${downloadResult.error}`)
            return
          }
        }
      }

      const result = await api.emulator.launch(
        game.romPath,
        systemId,
        undefined,
        coreName,
      )

      if (!result.success) {
        console.error('Failed to launch emulator:', result.error)
        alert(`Failed to launch game: ${result.error}`)
      }
    } catch (error) {
      console.error('Error launching game:', error)
      alert(`Error: ${error}`)
    }
  }

  const handlePlayGame = async (game: UiGame) => {
    const systemId = getSystemId(game)
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
    setCoreSelectDialog((previous) => ({ ...previous, open: false, pendingGame: null }))
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
        setCoreSelectDialog((previous) => ({ ...previous, open: false, pendingGame: null }))
        return
      }

      // Clear any saved preference so the dialog doesn't auto-skip
      localStorage.removeItem(`gamelord:core-preference:${systemId}`)

      // Populate the dialog with the fetched cores
      setCoreSelectDialog((previous) => ({ ...previous, cores }))
    } catch (error) {
      console.error('Error fetching cores:', error)
      setCoreSelectDialog((previous) => ({ ...previous, open: false, pendingGame: null }))
    }
  }

  /** Returns dropdown menu items for a game card. */
  const getMenuItems = useCallback((game: UiGame): GameCardMenuItem[] => {
    const items: GameCardMenuItem[] = []

    items.push({
      label: 'Change Core',
      icon: <Cpu className="h-4 w-4" />,
      onClick: () => void handleChangeCore(game),
    })

    return items
  }, [])

  /** Transition to the game view with a crossfade. */
  const transitionToGame = useCallback(() => {
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current)
    setViewState('to-game')
    viewTimerRef.current = setTimeout(() => {
      setViewState('game')
      viewTimerRef.current = null
    }, VIEW_TRANSITION_MS)
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
          <div className="drag-region titlebar-inset h-10 border-b flex items-center justify-end px-4">
            <Button variant="ghost" size="icon" className="no-drag h-7 w-7" onClick={toggleTheme}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <LibraryView onPlayGame={handlePlayGame} getMenuItems={getMenuItems} />
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
    </div>
  )
}

export default App
