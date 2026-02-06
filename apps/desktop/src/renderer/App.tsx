import React, { useState, useCallback, useEffect } from 'react'
import { Button, WebGLRendererComponent, Game as UiGame } from '@gamelord/ui'
import { useWebGLRenderer } from './hooks/useWebGLRenderer'
import { Monitor, Tv, Sun, Moon } from 'lucide-react'
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
}

function App() {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord
  const [isPlaying, setIsPlaying] = useState(false)
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
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('gamelord:theme', next ? 'dark' : 'light')
  }, [isDark])

  /**
   * Launches a game with an explicit core name, downloading the core first
   * if it isn't installed yet.
   */
  const launchGameWithCore = async (game: UiGame, coreName?: string) => {
    try {
      // If a specific core was requested and it isn't installed, download it
      if (coreName) {
        const cores = await api.emulator.getCoresForSystem(game.platform)
        const selectedCore = cores.find((core) => core.name === coreName)
        if (selectedCore && !selectedCore.installed) {
          const downloadResult = await api.emulator.downloadCore(coreName, game.platform)
          if (!downloadResult.success) {
            alert(`Failed to download core: ${downloadResult.error}`)
            return
          }
        }
      }

      const result = await api.emulator.launch(
        game.romPath,
        game.platform,
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
    try {
      const cores = await api.emulator.getCoresForSystem(game.platform)

      // If there are 0 or 1 cores, launch directly (no selection needed)
      if (cores.length <= 1) {
        await launchGameWithCore(game, cores[0]?.name)
        return
      }

      // Check for a saved core preference
      const preferenceKey = `gamelord:core-preference:${game.platform}`
      const savedCoreName = localStorage.getItem(preferenceKey)

      if (savedCoreName) {
        await launchGameWithCore(game, savedCoreName)
        return
      }

      // Multiple cores available and no preference saved — show the dialog
      setCoreSelectDialog({
        open: true,
        systemId: game.platform,
        systemName: game.platform.toUpperCase(),
        cores,
        pendingGame: game,
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

  const handleStop = async () => {
    try {
      await api.emulator.stop()
      setIsPlaying(false)
    } catch (error) {
      console.error('Error stopping emulator:', error)
    }
  }

  if (isPlaying) {
    return (
      <div className="flex flex-col h-screen bg-background">
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
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="drag-region titlebar-inset h-10 border-b flex items-center justify-end px-4">
        <Button variant="ghost" size="icon" className="no-drag h-7 w-7" onClick={toggleTheme}>
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <LibraryView onPlayGame={handlePlayGame} />
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
      />
    </div>
  )
}

export default App
