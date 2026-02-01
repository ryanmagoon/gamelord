import React, { useState, useEffect } from 'react'
import { Button } from '@gamelord/ui'
import {
  Play,
  Pause,
  Save,
  FolderOpen,
  Camera,
  Volume2,
  Settings,
  Maximize,
} from 'lucide-react'
import type { Game } from '../../types/library'
import type { GamelordAPI } from '../types/global'

export const GameWindow: React.FC = () => {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord
  const [game, setGame] = useState<Game | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(0)

  useEffect(() => {
    api.on('game:loaded', (gameData: Game) => {
      setGame(gameData)
    })

    // Main process tells us when to show/hide controls based on cursor position
    api.on('overlay:show-controls', (visible: boolean) => {
      setShowControls(visible)
    })

    return () => {
      api.removeAllListeners('game:loaded')
      api.removeAllListeners('overlay:show-controls')
    }
  }, [api])

  const handlePauseResume = async () => {
    if (isPaused) {
      await api.emulation.resume()
    } else {
      await api.emulation.pause()
    }
    setIsPaused(!isPaused)
  }

  const handleSaveState = async () => {
    await api.saveState.save(selectedSlot)
  }

  const handleLoadState = async () => {
    await api.saveState.load(selectedSlot)
  }

  const handleScreenshot = async () => {
    await api.emulation.screenshot()
  }

  const handleToggleFullscreen = () => {
    api.gameWindow.toggleFullscreen()
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault()
        void handleSaveState()
      }
      if (e.key === 'F9') {
        e.preventDefault()
        void handleLoadState()
      }
      if (e.key === 'F11') {
        e.preventDefault()
        handleToggleFullscreen()
      }
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault()
        void handlePauseResume()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPaused, selectedSlot])

  if (!game) {
    return null
  }

  return (
    <div className="relative h-screen bg-transparent overflow-hidden">
      {/* Top control bar */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-center px-4 py-2 bg-black/75 backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-3">
            <h1 className="text-white font-semibold">{game.title}</h1>
            <span className="text-gray-400 text-sm">{game.system}</span>
          </div>
        </div>
      </div>

      {/* Bottom control bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-50 transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-black/75 backdrop-blur-md shadow-lg">
          {/* Playback controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePauseResume}
              className="text-white hover:bg-white/10"
            >
              {isPaused ? (
                <Play className="h-5 w-5" />
              ) : (
                <Pause className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleScreenshot}
              className="text-white hover:bg-white/10"
            >
              <Camera className="h-5 w-5" />
            </Button>
          </div>

          {/* Save state controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-white text-sm">Slot:</span>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
                    className={`w-8 h-8 rounded flex items-center justify-center text-sm font-medium transition-colors ${
                      selectedSlot === slot
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveState}
              className="text-white hover:bg-white/10"
            >
              <Save className="h-4 w-4 mr-2" />
              Save (F5)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadState}
              className="text-white hover:bg-white/10"
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Load (F9)
            </Button>
          </div>

          {/* Additional controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
            >
              <Volume2 className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleFullscreen}
              className="text-white hover:bg-white/10"
            >
              <Maximize className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Pause overlay */}
      {isPaused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-40">
          <div className="text-center">
            <Pause className="h-16 w-16 text-white mx-auto mb-4" />
            <p className="text-white text-xl font-semibold">Paused</p>
            <p className="text-gray-400 text-sm mt-2">
              Press Space or click Play to resume
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
