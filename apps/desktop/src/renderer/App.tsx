import React, { useState, useCallback, useEffect } from 'react'
import { Button, WebGLRendererComponent, Game as UiGame } from '@gamelord/ui'
import { useWebGLRenderer } from './hooks/useWebGLRenderer'
import { Monitor, Tv, Sun, Moon } from 'lucide-react'
import { LibraryView } from './components/LibraryView'
import { ResumeGameDialog } from './components/ResumeGameDialog'
import { Game } from '../types/library'
import type { GamelordAPI } from './types/global'

interface ResumeDialogState {
  open: boolean
  requestId: string
  gameTitle: string
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

  const handlePlayGame = async (game: UiGame) => {
    try {
      // Launch game with native emulator (RetroArch)
      const result = await api.emulator.launch(
        game.romPath,
        game.platform // systemId like 'nes', 'snes', etc.
      )

      if (result.success) {
        // Note: We don't set isPlaying=true because the game runs in a separate window
        // The emulator (RetroArch) is now running externally
      } else {
        console.error('Failed to launch emulator:', result.error)
        alert(`Failed to launch game: ${result.error}`)
      }
    } catch (error) {
      console.error('Error launching game:', error)
      alert(`Error: ${error}`)
    }
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
    </div>
  )
}

export default App
