import React, { useState } from 'react'
import { Button, WebGLRendererComponent, Game as UiGame } from '@gamelord/ui'
import { useWebGLRenderer } from './hooks/useWebGLRenderer'
import { Monitor, Tv } from 'lucide-react'
import { LibraryView } from './components/LibraryView'
import { Game } from '../types/library'

function App() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentGame, setCurrentGame] = useState<Game | null>(null)
  const { isReady, currentShader, handleRendererReady, changeShader } =
    useWebGLRenderer()

  const handlePlayGame = async (game: UiGame) => {
    try {
      // For now, just simulate loading a core
      const result = await window.gamelord.core.load({
        corePath: `/cores/${game.platform}.so`,
        romPath: game.romPath,
      })

      if (result.success) {
        setIsPlaying(true)
      } else {
        console.error('Failed to load core:', result.error)
      }
    } catch (error) {
      console.error('Error loading game:', error)
    }
  }

  const handleStop = async () => {
    try {
      await window.gamelord.core.unload()
      setIsPlaying(false)
    } catch (error) {
      console.error('Error unloading core:', error)
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
      <div className="drag-region titlebar-inset h-10 border-b"></div>
      <div className="flex-1 overflow-hidden">
        <LibraryView onPlayGame={handlePlayGame} />
      </div>
    </div>
  )
}

export default App
