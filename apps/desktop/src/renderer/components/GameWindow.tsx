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
  Monitor,
} from 'lucide-react'
import type { Game } from '../../types/library'
import type { GamelordAPI } from '../types/global'
import { WebGLRenderer, SHADER_PRESETS, SHADER_LABELS } from '@gamelord/ui'
import { PowerAnimation } from './animations'
import { getDisplayType } from '../../types/displayType'

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
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('gamelord:volume')
    return saved !== null ? parseFloat(saved) : 0.5
  })
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('gamelord:muted') === 'true'
  })

  const [shader, setShader] = useState<string>(() => {
    const saved = localStorage.getItem('gamelord:shader')
    return (saved as string) || 'default'
  })
  const [showShaderMenu, setShowShaderMenu] = useState(false)
  const [isPoweringOn, setIsPoweringOn] = useState(true)
  const [isPoweringOff, setIsPoweringOff] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<WebGLRenderer | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioNextTimeRef = useRef(0)
  const gainNodeRef = useRef<GainNode | null>(null)
  const [gameAspectRatio, setGameAspectRatio] = useState<number | null>(null)

  // Resize handler extracted so it can be called from multiple places
  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Get container dimensions
    const containerRect = container.getBoundingClientRect()
    const containerW = containerRect.width
    const containerH = containerRect.height

    // Skip if container has no dimensions yet
    if (containerW === 0 || containerH === 0) return

    // Use game aspect ratio if available, otherwise default to NES aspect ratio
    const aspectRatio = gameAspectRatio || (256 / 240)

    // Calculate canvas size to fit container while maintaining aspect ratio
    let canvasW: number
    let canvasH: number

    if (containerW / containerH > aspectRatio) {
      // Container is wider than game aspect ratio - fit to height
      canvasH = containerH
      canvasW = containerH * aspectRatio
    } else {
      // Container is taller than game aspect ratio - fit to width
      canvasW = containerW
      canvasH = containerW / aspectRatio
    }

    // Apply CSS dimensions for display
    canvas.style.width = `${canvasW}px`
    canvas.style.height = `${canvasH}px`

    // Set canvas buffer dimensions for WebGL (accounting for device pixel ratio)
    const bufferW = Math.round(canvasW * devicePixelRatio)
    const bufferH = Math.round(canvasH * devicePixelRatio)

    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      canvas.width = bufferW
      canvas.height = bufferH
      rendererRef.current?.resize(bufferW, bufferH)
    }
  }, [gameAspectRatio])

  useEffect(() => {
    api.on('game:loaded', (gameData: Game) => {
      setGame(gameData)
    })

    api.on('game:mode', (m: string) => {
      setMode(m as 'overlay' | 'native')
      // Controls start hidden; user reveals them by moving mouse
    })

    api.on('overlay:show-controls', (visible: boolean) => {
      setShowControls(visible)
    })

    api.on('emulator:paused', () => setIsPaused(true))
    api.on('emulator:resumed', () => setIsPaused(false))

    api.on('game:prepare-close', () => {
      setIsPoweringOff(true)
    })

    api.on('game:av-info', (avInfo: any) => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = avInfo.geometry.baseWidth
        canvas.height = avInfo.geometry.baseHeight
      }
      // Calculate aspect ratio for proper scaling
      const aspectRatio = avInfo.geometry.aspectRatio > 0
        ? avInfo.geometry.aspectRatio
        : avInfo.geometry.baseWidth / avInfo.geometry.baseHeight
      setGameAspectRatio(aspectRatio)
    })

    api.on('game:video-frame', (frameData: any) => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Initialize WebGL renderer on first frame
      if (!rendererRef.current) {
        try {
          // Set initial canvas size based on container
          updateCanvasSize()

          const renderer = new WebGLRenderer(canvas)
          renderer.initialize()
          const savedShader = (localStorage.getItem('gamelord:shader') as string) || 'default'
          renderer.setShader(savedShader)
          rendererRef.current = renderer

          // Ensure canvas is properly sized after renderer is ready
          requestAnimationFrame(() => updateCanvasSize())
        } catch (error) {
          console.error('Failed to initialize WebGL renderer:', error)
          return
        }
      }

      rendererRef.current.renderFrame(frameData)
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
      api.removeAllListeners('game:prepare-close')

      rendererRef.current?.destroy()
      rendererRef.current = null

      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [api, updateCanvasSize])

  // Handle canvas resize for WebGL viewport
  useEffect(() => {
    window.addEventListener('resize', updateCanvasSize)
    // Run immediately and also after a brief delay to ensure layout is complete
    updateCanvasSize()
    const timeoutId = setTimeout(updateCanvasSize, 50)
    return () => {
      window.removeEventListener('resize', updateCanvasSize)
      clearTimeout(timeoutId)
    }
  }, [updateCanvasSize])

  // Sync shader preference
  useEffect(() => {
    rendererRef.current?.setShader(shader)
    localStorage.setItem('gamelord:shader', shader)
  }, [shader])

  // Sync gain node with volume/mute state and persist
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume
    }
    localStorage.setItem('gamelord:volume', String(volume))
    localStorage.setItem('gamelord:muted', String(isMuted))
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

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOverControlsRef = useRef(false)

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    hideTimeoutRef.current = setTimeout(() => {
      if (!isPaused && !isOverControlsRef.current) {
        setShowControls(false)
      }
    }, 3000)
  }, [isPaused])

  // Show on mouse move, auto-hide after 3s of inactivity
  const handleMouseMove = useCallback(() => {
    if (mode !== 'native' || isPoweringOn || isPoweringOff) return
    setShowControls(true)
    scheduleHide()
  }, [mode, isPoweringOn, isPoweringOff, scheduleHide])

  const handleMouseLeave = useCallback((event: React.MouseEvent) => {
    if (mode !== 'native' || isPaused) return
    const { clientX, clientY } = event
    const { innerWidth, innerHeight } = window
    if (clientX > 0 && clientX < innerWidth && clientY > 0 && clientY < innerHeight) {
      return
    }
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    setShowControls(false)
  }, [mode, isPaused])

  const handleControlsEnter = useCallback(() => {
    isOverControlsRef.current = true
  }, [])

  const handleControlsLeave = useCallback(() => {
    isOverControlsRef.current = false
    scheduleHide()
  }, [scheduleHide])

  if (!game) {
    return null
  }

  const isNative = mode === 'native'
  const displayType = getDisplayType(game.systemId)

  return (
    <div
      className={`relative h-screen overflow-hidden ${isNative ? 'bg-black' : 'bg-transparent'}`}
      style={{ cursor: isNative && !showControls ? 'none' : undefined }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Power-on animation (system-specific) */}
      {isNative && isPoweringOn && (
        <PowerAnimation
          displayType={displayType}
          direction="on"
          onComplete={() => setIsPoweringOn(false)}
        />
      )}

      {/* Power-off / shutdown animation (system-specific) */}
      {isNative && isPoweringOff && (
        <PowerAnimation
          displayType={displayType}
          direction="off"
          onComplete={() => api.gameWindow.readyToClose()}
        />
      )}

      {/* Canvas container for native mode rendering */}
      {isNative && (
        <div
          ref={containerRef}
          className="absolute inset-0 flex items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            style={{
              imageRendering: shader === 'default' ? 'pixelated' : 'auto',
            }}
            width={256}
            height={240}
          />
        </div>
      )}

      {/* Top control bar (draggable title area) */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 transition-opacity duration-150 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        onMouseEnter={handleControlsEnter}
        onMouseLeave={handleControlsLeave}
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
        onMouseEnter={handleControlsEnter}
        onMouseLeave={handleControlsLeave}
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
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowShaderMenu((v) => !v)}
                className="text-white hover:bg-white/10"
                title="Shader"
              >
                <Monitor className="h-5 w-5" />
              </Button>
              {showShaderMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-md rounded-lg shadow-lg py-1 min-w-[160px]">
                  {SHADER_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => { setShader(preset); setShowShaderMenu(false) }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        shader === preset
                          ? 'text-blue-400 bg-white/10'
                          : 'text-white/80 hover:bg-white/10'
                      }`}
                    >
                      {SHADER_LABELS[preset]}
                    </button>
                  ))}
                </div>
              )}
            </div>
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

      {/* Pause indicator — minimal badge so the game screen stays visible */}
      {isPaused && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-sm">
            <Pause className="h-4 w-4 text-white" />
            <span className="text-white text-sm font-medium">PAUSED</span>
          </div>
        </div>
      )}
    </div>
  )
}
