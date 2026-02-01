import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@gamelord/ui'
import {
  Play,
  Pause,
  Save,
  FolderOpen,
  Camera,
  Volume1,
  Volume2,
  VolumeX,
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
  const [volume, setVolume] = useState(0.5)
  const [isMuted, setIsMuted] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioNextTimeRef = useRef(0)
  const gainNodeRef = useRef<GainNode | null>(null)

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

    api.on('game:video-frame', (frameData: any) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const { width, height, data } = frameData
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      const pixels = new Uint8ClampedArray(data)
      const imageData = ctx.createImageData(width, height)
      imageData.data.set(pixels)
      ctx.putImageData(imageData, 0, 0)
    })

    api.on('game:audio-samples', (audioData: any) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: audioData.sampleRate })
        audioNextTimeRef.current = 0
        gainNodeRef.current = audioContextRef.current.createGain()
        gainNodeRef.current.gain.value = isMuted ? 0 : volume
        gainNodeRef.current.connect(audioContextRef.current.destination)
      }

      const ctx = audioContextRef.current
      const samples = new Int16Array(audioData.samples.buffer)
      const frames = samples.length / 2

      if (frames > 0) {
        const buffer = ctx.createBuffer(2, frames, audioData.sampleRate)
        const leftChannel = buffer.getChannelData(0)
        const rightChannel = buffer.getChannelData(1)

        for (let i = 0; i < frames; i++) {
          leftChannel[i] = samples[i * 2] / 32768
          rightChannel[i] = samples[i * 2 + 1] / 32768
        }

        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(gainNodeRef.current!)

        // Schedule seamlessly after the previous chunk
        const now = ctx.currentTime
        if (audioNextTimeRef.current < now) {
          audioNextTimeRef.current = now
        }
        source.start(audioNextTimeRef.current)
        audioNextTimeRef.current += buffer.duration
      }
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

  // Sync gain node with volume/mute state
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  // Sync traffic light visibility with controls overlay
  useEffect(() => {
    if (mode === 'native') {
      api.gameWindow.setTrafficLightVisible(showControls)
    }
  }, [showControls, mode, api])

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

  // In native mode, show controls on mouse move, hide on leave
  const handleMouseMove = useCallback(() => {
    if (mode !== 'native') return
    setShowControls(true)
  }, [mode])

  const handleMouseLeave = useCallback((event: React.MouseEvent) => {
    if (mode !== 'native' || isPaused) return
    // Ignore false mouseleave events caused by WebkitAppRegion 'drag'
    // regions — only hide if the cursor actually left the window
    const { clientX, clientY } = event
    const { innerWidth, innerHeight } = window
    if (clientX > 0 && clientX < innerWidth && clientY > 0 && clientY < innerHeight) {
      return
    }
    setShowControls(false)
  }, [mode, isPaused])

  if (!game) {
    return null
  }

  const isNative = mode === 'native'

  return (
    <div
      className={`relative h-screen overflow-hidden ${isNative ? 'bg-black' : 'bg-transparent'}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Canvas for native mode rendering */}
      {isNative && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            imageRendering: 'pixelated',
          }}
          width={256}
          height={240}
        />
      )}

      {/* Top control bar (draggable title area) */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 transition-opacity duration-150 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center justify-center px-4 py-2 bg-black/75 backdrop-blur-md shadow-lg select-none">
          <div className="flex items-center gap-3">
            <h1 className="text-white font-semibold">{game.title}</h1>
            <span className="text-gray-400 text-sm">{game.system}</span>
          </div>
        </div>
      </div>

      {/* Bottom control bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-50 transition-opacity duration-150 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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

          {/* Volume & additional controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMuted((m) => !m)}
              className="text-white hover:bg-white/10"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : volume < 0.5 ? (
                <Volume1 className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setVolume(v)
                if (v > 0 && isMuted) setIsMuted(false)
              }}
              className="w-20 h-1 accent-white cursor-pointer"
            />
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
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-40" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
