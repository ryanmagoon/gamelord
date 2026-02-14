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
  RotateCcw,
  Gamepad2,
} from 'lucide-react'
import type { Game } from '../../types/library'
import type { GamelordAPI } from '../types/global'
import { WebGLRenderer, SHADER_PRESETS, SHADER_LABELS } from '@gamelord/ui'
import { PowerAnimation } from './animations'
import { getDisplayType } from '../../types/displayType'
import { useGamepad } from '../hooks/useGamepad'

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
  const [mode, setMode] = useState<'overlay' | 'native'>('native')
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
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showFps, setShowFps] = useState(() => {
    return localStorage.getItem('gamelord:showFps') === 'true'
  })
  const [fps, setFps] = useState(0)
  const [isPoweringOn, setIsPoweringOn] = useState(false)
  const [isPoweringOff, setIsPoweringOff] = useState(false)

  // Memoize power animation callbacks so they have stable references.
  // CRTAnimation's useEffect depends on `onComplete` — an inline arrow
  // function would create a new reference on every parent re-render,
  // restarting the animation's timers each time GameWindow re-renders
  // (e.g., when game:loaded, game:mode, or game:av-info events arrive
  // and trigger state updates during the power-on sequence).
  const handlePowerOnComplete = useCallback(() => setIsPoweringOn(false), [])
  const handlePowerOffComplete = useCallback(() => api.gameWindow.readyToClose(), [api])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<WebGLRenderer | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioNextTimeRef = useRef(0)
  const gainNodeRef = useRef<GainNode | null>(null)
  const pendingFrameRef = useRef<any>(null)
  /** Gate: don't render frames until the boot animation overlay is in place. */
  const bootReadyRef = useRef(false)
  const rafIdRef = useRef<number>(0)
  const lastFrameTimeRef = useRef(0)
  const fpsEmaRef = useRef(0)
  const rafFrameCountRef = useRef(0)
  const [gameAspectRatio, setGameAspectRatio] = useState<number | null>(null)

  // Gamepad polling — uses same api.gameInput() pipeline as keyboard
  const { connectedCount: connectedGamepads } = useGamepad({
    gameInput: api.gameInput,
    enabled: mode === 'native' && !isPaused,
  })

  // Ref to the latest updateCanvasSize — allows the IPC effect to call
  // it without depending on it (which would cause listener re-registration).
  // noop placeholder — immediately overwritten on the next line
  const updateCanvasSizeRef = useRef<() => void>(Function.prototype as () => void)

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

  // Keep the ref in sync with the latest callback identity
  updateCanvasSizeRef.current = updateCanvasSize

  useEffect(() => {
    // Remove any stale listeners BEFORE registering new ones. This is
    // critical because React Strict Mode (dev) double-mounts components,
    // and Vite HMR can re-execute modules without triggering cleanup.
    // Without this, listeners accumulate and each IPC event fires
    // multiple callbacks — causing audio to play 2-3x simultaneously
    // and animations to replay.
    api.removeAllListeners('game:loaded')
    api.removeAllListeners('game:mode')
    api.removeAllListeners('overlay:show-controls')
    api.removeAllListeners('emulator:paused')
    api.removeAllListeners('emulator:resumed')
    api.removeAllListeners('game:av-info')
    api.removeAllListeners('game:video-frame')
    api.removeAllListeners('game:audio-samples')
    api.removeAllListeners('game:prepare-close')
    api.removeAllListeners('game:ready-for-boot')

    api.on('game:loaded', (gameData: Game) => {
      setGame(gameData)

      // Load per-system shader preference (e.g. CRT for NES, LCD for GBA)
      const systemShader = localStorage.getItem(`gamelord:shader:${gameData.systemId}`)
      if (systemShader) {
        setShader(systemShader)
      }
    })

    // Sent by the main process after the hero transition animation completes
    // (or immediately if there is no hero transition).
    api.on('game:ready-for-boot', () => {
      bootReadyRef.current = true
      setIsPoweringOn(true)
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
      setShowControls(false)
      setShowShaderMenu(false)
      setShowSettingsMenu(false)
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
      // Buffer the frame immediately so the latest state is always available,
      // but don't initialize the renderer or draw until the boot animation
      // overlay is in place. This prevents the game content from flashing
      // before the CRT/LCD power-on animation starts.
      pendingFrameRef.current = frameData

      const canvas = canvasRef.current
      if (!canvas || !bootReadyRef.current) return

      // Initialize WebGL renderer on first frame after boot is ready
      if (!rendererRef.current) {
        try {
          // Set initial canvas size based on container
          updateCanvasSizeRef.current()

          const renderer = new WebGLRenderer(canvas)
          renderer.initialize()
          const savedShader = (localStorage.getItem('gamelord:shader') as string) || 'default'
          renderer.setShader(savedShader)
          rendererRef.current = renderer

          // Ensure canvas is properly sized after renderer is ready
          requestAnimationFrame(() => updateCanvasSizeRef.current())

          // Start the rAF render loop — draws the latest buffered frame
          // each display vsync instead of rendering directly from IPC events.
          // Also measures FPS via exponential moving average of frame deltas.
          const renderLoop = (timestamp: number) => {
            if (lastFrameTimeRef.current > 0) {
              const delta = timestamp - lastFrameTimeRef.current
              if (delta > 0) {
                const instantFps = 1000 / delta
                fpsEmaRef.current = fpsEmaRef.current === 0
                  ? instantFps
                  : 0.9 * fpsEmaRef.current + 0.1 * instantFps
                rafFrameCountRef.current++
                // Update React state every 30 frames (~500ms) to avoid re-render overhead
                if (rafFrameCountRef.current % 30 === 0) {
                  setFps(Math.round(fpsEmaRef.current))
                }
              }
            }
            lastFrameTimeRef.current = timestamp

            const frame = pendingFrameRef.current
            if (frame && rendererRef.current) {
              pendingFrameRef.current = null
              rendererRef.current.renderFrame(frame)
            }
            rafIdRef.current = requestAnimationFrame(renderLoop)
          }
          rafIdRef.current = requestAnimationFrame(renderLoop)
        } catch (error) {
          console.error('Failed to initialize WebGL renderer:', error)
          return
        }
      }

    })

    api.on('game:audio-samples', (audioData: any) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: audioData.sampleRate })
        // Pre-buffer: schedule the first chunk slightly in the future so
        // subsequent chunks arrive before their playback time, absorbing
        // the jitter introduced by the utility-process → main → renderer
        // double-IPC hop. Without this, chunks arrive too late and we
        // constantly snap to `now`, creating micro-gaps that sound like
        // crackling.
        audioNextTimeRef.current = 0
        gainNodeRef.current = audioContextRef.current.createGain()
        gainNodeRef.current.gain.value = isMuted ? 0 : volume
        gainNodeRef.current.connect(audioContextRef.current.destination)
      }

      const ctx = audioContextRef.current
      // audioData.samples arrives as Uint8Array after Electron IPC.
      // Interpret the raw bytes as interleaved stereo Int16 samples.
      const raw: Uint8Array = audioData.samples
      const samples = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
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

        // Schedule seamlessly after the previous chunk.
        //
        // The emulation worker sends audio chunks every ~16.6ms, but they
        // traverse two IPC hops (utility process → main → renderer) which
        // adds variable latency. Strategy:
        //
        // - On first chunk, schedule slightly ahead (`now + PRE_BUFFER_S`)
        //   to build a cushion that absorbs jitter.
        // - On subsequent chunks, append to the previous chunk's end time
        //   — if the buffer hasn't underrun, chunks queue seamlessly.
        // - On underrun (audioNextTime fell behind `now`), schedule at
        //   `now` to avoid an audible gap. The pre-buffer rebuilds
        //   naturally because the worker's frame-locked timing produces
        //   samples at the exact hardware rate.
        // - If too far ahead (>MAX_LOOKAHEAD_S), snap back to avoid
        //   perceptible audio lag.
        const PRE_BUFFER_S = 0.06 // 60ms initial pre-buffer
        const MAX_LOOKAHEAD_S = 0.12 // 120ms max ahead before reset

        const now = ctx.currentTime
        if (audioNextTimeRef.current === 0) {
          // First chunk — establish the initial pre-buffer
          audioNextTimeRef.current = now + PRE_BUFFER_S
        } else if (audioNextTimeRef.current < now) {
          // Underrun — schedule immediately to minimize the gap.
          // Don't add PRE_BUFFER_S here; that would create a silent gap.
          // The pre-buffer rebuilds naturally over subsequent chunks.
          audioNextTimeRef.current = now
        } else if (audioNextTimeRef.current > now + MAX_LOOKAHEAD_S) {
          // Too far ahead — reset to avoid perceptible audio lag
          audioNextTimeRef.current = now + PRE_BUFFER_S
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
      api.removeAllListeners('game:ready-for-boot')

      cancelAnimationFrame(rafIdRef.current)
      pendingFrameRef.current = null
      bootReadyRef.current = false

      rendererRef.current?.destroy()
      rendererRef.current = null

      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  // IPC listeners must only be registered once. updateCanvasSize is accessed
  // via ref to avoid re-registering listeners when gameAspectRatio changes.
  // Dependencies intentionally limited to [api] (stable singleton).
  }, [api])

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

  // Sync shader preference (saved per-system when a game is loaded)
  useEffect(() => {
    rendererRef.current?.setShader(shader)
    localStorage.setItem('gamelord:shader', shader)
    if (game) {
      localStorage.setItem(`gamelord:shader:${game.systemId}`, shader)
    }
  }, [shader, game])

  // Sync gain node with volume/mute state and persist
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume
    }
    localStorage.setItem('gamelord:volume', String(volume))
    localStorage.setItem('gamelord:muted', String(isMuted))
  }, [volume, isMuted])

  // Persist FPS overlay preference
  useEffect(() => {
    localStorage.setItem('gamelord:showFps', String(showFps))
  }, [showFps])

  // Sync traffic light visibility with controls overlay (hide during shutdown)
  useEffect(() => {
    if (mode === 'native') {
      api.gameWindow.setTrafficLightVisible(showControls && !isPoweringOff)
    }
  }, [showControls, isPoweringOff, mode, api])

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

  const handleReset = async () => {
    try {
      await api.emulation.reset()
    } catch (err) {
      console.error('Reset failed:', err)
    }
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
      if (!isOverControlsRef.current) {
        setShowControls(false)
      }
    }, 3000)
  }, [])

  // Show on mouse move, auto-hide after 3s of inactivity
  const handleMouseMove = useCallback(() => {
    if (mode !== 'native' || isPoweringOn || isPoweringOff) return
    setShowControls(true)
    scheduleHide()
  }, [mode, isPoweringOn, isPoweringOff, scheduleHide])

  const handleMouseLeave = useCallback((event: React.MouseEvent) => {
    if (mode !== 'native') return
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
          onComplete={handlePowerOnComplete}
        />
      )}

      {/* Power-off / shutdown animation (system-specific) */}
      {isNative && isPoweringOff && (
        <PowerAnimation
          displayType={displayType}
          direction="off"
          onComplete={handlePowerOffComplete}
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

      {/* FPS overlay */}
      {isNative && showFps && (
        <div className="absolute top-2 left-2 z-40 px-2 py-1 bg-black/60 rounded text-xs font-mono text-green-400 pointer-events-none select-none">
          {fps} FPS
        </div>
      )}

      {/* Top control bar (draggable title area) — slides up on close */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 transition-all duration-200 ease-out ${
          showControls && !isPoweringOff
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        onMouseEnter={handleControlsEnter}
        onMouseLeave={handleControlsLeave}
      >
        <div className="flex items-center justify-center px-4 py-2 bg-black/80 shadow-lg select-none">
          <div className="flex items-center gap-3">
            <h1 className="text-white font-semibold">{game.title}</h1>
            <span className="text-gray-400 text-sm">{game.system}</span>
          </div>
        </div>
      </div>

      {/* Bottom control bar — slides down on close */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-50 transition-all duration-200 ease-out ${
          showControls && !isPoweringOff
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-full pointer-events-none'
        }`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseEnter={handleControlsEnter}
        onMouseLeave={handleControlsLeave}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-black/80 shadow-lg">
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
              onClick={handleReset}
              className="text-white hover:bg-white/10"
              title="Reset"
            >
              <RotateCcw className="h-5 w-5" />
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
                <div className="absolute bottom-full right-0 mb-2 bg-black/95 rounded-lg shadow-lg py-1 min-w-[160px]">
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
            {connectedGamepads > 0 && (
              <div
                className="flex items-center gap-1 text-green-400 px-1"
                title={`${connectedGamepads} gamepad${connectedGamepads > 1 ? 's' : ''} connected`}
              >
                <Gamepad2 className="h-4 w-4" />
              </div>
            )}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettingsMenu((v) => !v)}
                className="text-white hover:bg-white/10"
                title="Settings"
              >
                <Settings className="h-5 w-5" />
              </Button>
              {showSettingsMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/95 rounded-lg shadow-lg py-1 min-w-[160px]">
                  <button
                    onClick={() => setShowFps((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                  >
                    <span>Show FPS</span>
                    <span className={`ml-3 text-xs font-medium ${showFps ? 'text-green-400' : 'text-white/40'}`}>
                      {showFps ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
