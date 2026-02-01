import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@gamelord/ui'
import {
  Play,
  Pause,
  Save,
  FolderOpen,
  Camera,
  Volume2,
  Settings,
} from 'lucide-react'
import type { Game } from '../../types/library'
import type { GamelordAPI } from '../types/global'

// Keyboard → libretro joypad button mapping
const KEY_MAP: Record<string, number> = {
  'x':          0,  // B
  's':          1,  // Y
  'Shift':      2,  // Select
  'Enter':      3,  // Start
  'ArrowUp':    4,  // Up
  'ArrowDown':  5,  // Down
  'ArrowLeft':  6,  // Left
  'ArrowRight': 7,  // Right
  'z':          8,  // A
  'a':          9,  // X
  'q':          10, // L
  'w':          11, // R
}

export const GameWindow: React.FC = () => {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord
  const [game, setGame] = useState<Game | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [mode, setMode] = useState<'overlay' | 'native'>('overlay')
  const [controlsHoverTimeout, setControlsHoverTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    api.on('game:loaded', (gameData: Game) => {
      setGame(gameData)
    })

    api.on('game:mode', (m: string) => {
      setMode(m as 'overlay' | 'native')
      if (m === 'native') {
        setShowControls(true) // always show in native mode initially
      }
    })

    api.on('overlay:show-controls', (visible: boolean) => {
      setShowControls(visible)
    })

    api.on('emulator:paused', () => setIsPaused(true))
    api.on('emulator:resumed', () => setIsPaused(false))

    api.on('game:av-info', (avInfo: any) => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = avInfo.geometry.baseWidth
        canvas.height = avInfo.geometry.baseHeight
      }
    })

    api.on('game:video-frame', (frame: { data: number[]; width: number; height: number }) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width
        canvas.height = frame.height
      }

      const imageData = ctx.createImageData(frame.width, frame.height)
      const pixels = new Uint8ClampedArray(frame.data)
      imageData.data.set(pixels)
      ctx.putImageData(imageData, 0, 0)
    })

    api.on('game:audio-samples', (audioData: { samples: number[]; sampleRate: number }) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: audioData.sampleRate })
      }

      const ctx = audioContextRef.current
      const samples = new Int16Array(audioData.samples)
      const frames = samples.length / 2

      if (frames === 0) return

      const buffer = ctx.createBuffer(2, frames, audioData.sampleRate)
      const leftChannel = buffer.getChannelData(0)
      const rightChannel = buffer.getChannelData(1)

      for (let i = 0; i < frames; i++) {
        leftChannel[i] = samples[i * 2] / 32768
        rightChannel[i] = samples[i * 2 + 1] / 32768
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start()
    })

    return () => {
      api.removeAllListeners('game:loaded')
      api.removeAllListeners('game:mode')
      api.removeAllListeners('overlay:show-controls')
      api.removeAllListeners('emulator:paused')
      api.removeAllListeners('emulator:resumed')
      api.removeAllListeners('game:av-info')
      api.removeAllListeners('game:video-frame')
      api.removeAllListeners('game:audio-samples')

      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [api])

  // Keyboard input for native mode
  useEffect(() => {
    if (mode !== 'native') return

    const handleKeyDown = (e: KeyboardEvent) => {
      const buttonId = KEY_MAP[e.key]
      if (buttonId !== undefined) {
        e.preventDefault()
        api.gameInput(0, buttonId, true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const buttonId = KEY_MAP[e.key]
      if (buttonId !== undefined) {
        e.preventDefault()
        api.gameInput(0, buttonId, false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [mode, api])

  const handlePauseResume = async () => {
    try {
      if (isPaused) {
        await api.emulation.resume()
      } else {
        await api.emulation.pause()
      }
    } catch (err) {
      console.error('Pause/resume failed:', err)
    }
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

  // Keyboard shortcuts (overlay mode or general)
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
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault()
        void handlePauseResume()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPaused, selectedSlot])

  // In native mode, show/hide controls on mouse movement
  const handleMouseMove = useCallback(() => {
    if (mode !== 'native') return

    setShowControls(true)
    if (controlsHoverTimeout) {
      clearTimeout(controlsHoverTimeout)
    }
    const timeout = setTimeout(() => {
      if (!isPaused) {
        setShowControls(false)
      }
    }, 3000)
    setControlsHoverTimeout(timeout)
  }, [mode, isPaused, controlsHoverTimeout])

  if (!game) {
    return null
  }

  const isNative = mode === 'native'

  return (
    <div
      className={`relative h-screen overflow-hidden ${isNative ? 'bg-black' : 'bg-transparent'}`}
      onMouseMove={handleMouseMove}
    >
      {/* Canvas for native mode rendering */}
      {isNative && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            imageRendering: 'pixelated',
            // Add top padding for macOS title bar in hiddenInset mode
            top: '40px',
            height: 'calc(100% - 40px)',
          }}
          width={256}
          height={240}
        />
      )}

      {/* Title bar drag region for native mode */}
      {isNative && (
        <div
          className="absolute top-0 left-0 right-0 h-10 z-50"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      )}

      {/* Top control bar */}
      <div
        className={`absolute ${isNative ? 'top-10' : 'top-0'} left-0 right-0 z-50 transition-opacity duration-200 ${
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
