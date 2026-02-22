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
  FastForward,
  ChevronDown,
} from 'lucide-react'
import type { Game } from '../../types/library'
import type { GamelordAPI } from '../types/global'
import { WebGLRenderer, SHADER_PRESETS, SHADER_LABELS } from '@gamelord/ui'
import {
  CTRL_ACTIVE_BUFFER,
  CTRL_FRAME_SEQUENCE,
  CTRL_FRAME_WIDTH,
  CTRL_FRAME_HEIGHT,
  CTRL_AUDIO_WRITE_POS,
  CTRL_AUDIO_READ_POS,
  CTRL_AUDIO_SAMPLE_RATE,
} from '../../main/workers/shared-frame-protocol'
import { DevBranchBadge } from './DevBranchBadge'
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
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  // The last fast-forward speed the user explicitly chose (persisted).
  // Tab toggle switches between 1x and this value.
  const [preferredFastForwardSpeed, setPreferredFastForwardSpeed] = useState(() => {
    const saved = localStorage.getItem('gamelord:fastForwardSpeed')
    return saved !== null ? parseFloat(saved) : 2
  })

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
  // SharedArrayBuffer zero-copy mode refs
  const controlViewRef = useRef<Int32Array | null>(null)
  const videoViewRef = useRef<Uint8Array | null>(null)
  const audioViewRef = useRef<Int16Array | null>(null)
  const videoBufferSizeRef = useRef(0)
  const lastRenderedSeqRef = useRef(0)
  const useSharedBuffersRef = useRef(false)

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

  /**
   * Schedule a chunk of interleaved stereo Int16 audio for playback.
   * Shared between the IPC fallback path and the SAB ring buffer drain.
   */
  const scheduleAudioChunk = useCallback((samples: Int16Array, sampleRate: number) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate })
      audioNextTimeRef.current = 0
      gainNodeRef.current = audioContextRef.current.createGain()
      gainNodeRef.current.gain.value = isMuted ? 0 : volume
      gainNodeRef.current.connect(audioContextRef.current.destination)
    }

    const ctx = audioContextRef.current
    const frames = samples.length / 2
    if (frames <= 0) return

    const buffer = ctx.createBuffer(2, frames, sampleRate)
    const leftChannel = buffer.getChannelData(0)
    const rightChannel = buffer.getChannelData(1)

    for (let i = 0; i < frames; i++) {
      leftChannel[i] = samples[i * 2] / 32768
      rightChannel[i] = samples[i * 2 + 1] / 32768
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gainNodeRef.current!)

    const PRE_BUFFER_S = 0.06
    const MAX_LOOKAHEAD_S = 0.12

    const now = ctx.currentTime
    if (audioNextTimeRef.current === 0) {
      audioNextTimeRef.current = now + PRE_BUFFER_S
    } else if (audioNextTimeRef.current < now) {
      audioNextTimeRef.current = now
    } else if (audioNextTimeRef.current > now + MAX_LOOKAHEAD_S) {
      audioNextTimeRef.current = now + PRE_BUFFER_S
    }
    source.start(audioNextTimeRef.current)
    audioNextTimeRef.current += buffer.duration
  }, [])

  /** Drain audio samples from the SharedArrayBuffer ring buffer. */
  const drainAudioRing = useCallback(() => {
    const ctrl = controlViewRef.current
    const ring = audioViewRef.current
    if (!ctrl || !ring) return

    const ringLen = ring.length
    const writePos = Atomics.load(ctrl, CTRL_AUDIO_WRITE_POS)
    const readPos = Atomics.load(ctrl, CTRL_AUDIO_READ_POS)
    const sampleRate = Atomics.load(ctrl, CTRL_AUDIO_SAMPLE_RATE)

    const available = writePos - readPos
    if (available <= 0) return

    // Clamp to ring capacity to skip any overwritten samples
    const toRead = Math.min(available, ringLen)
    const startPos = writePos - toRead

    const samples = new Int16Array(toRead)
    for (let i = 0; i < toRead; i++) {
      samples[i] = ring[(startPos + i) % ringLen]
    }

    Atomics.store(ctrl, CTRL_AUDIO_READ_POS, writePos)
    scheduleAudioChunk(samples, sampleRate)
  }, [scheduleAudioChunk])

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
    api.removeAllListeners('emulator:speedChanged')

    // Register for SharedArrayBuffer delivery via MessagePort bridge.
    // The main process sends SABs through a MessagePort because contextBridge
    // cannot transfer SharedArrayBuffer directly.
    api.framePort.onMessage((data: unknown) => {
      const msg = data as { type: string; control: SharedArrayBuffer; video: SharedArrayBuffer; audio: SharedArrayBuffer }
      if (msg.type === 'sharedBuffers') {
        controlViewRef.current = new Int32Array(msg.control)
        videoViewRef.current = new Uint8Array(msg.video)
        audioViewRef.current = new Int16Array(msg.audio)
        videoBufferSizeRef.current = msg.video.byteLength / 2 // each buffer is half
        lastRenderedSeqRef.current = 0
        useSharedBuffersRef.current = true
      }
    })

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
    api.on('emulator:speedChanged', (data: { multiplier: number }) => {
      setSpeedMultiplier(data.multiplier)
    })

    api.on('game:prepare-close', () => {
      setIsPoweringOff(true)
      setShowControls(false)
      setShowShaderMenu(false)
      setShowSettingsMenu(false)
      setShowSpeedMenu(false)
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

            if (useSharedBuffersRef.current && controlViewRef.current && videoViewRef.current && rendererRef.current) {
              // Zero-copy path: read directly from SharedArrayBuffer
              const ctrl = controlViewRef.current
              const seq = Atomics.load(ctrl, CTRL_FRAME_SEQUENCE)

              if (seq !== lastRenderedSeqRef.current) {
                lastRenderedSeqRef.current = seq
                const activeBuffer = Atomics.load(ctrl, CTRL_ACTIVE_BUFFER)
                const width = Atomics.load(ctrl, CTRL_FRAME_WIDTH)
                const height = Atomics.load(ctrl, CTRL_FRAME_HEIGHT)
                const bufSize = videoBufferSizeRef.current
                const offset = activeBuffer * bufSize

                // Uint8Array view into the active buffer region (zero-copy)
                const frameData = new Uint8Array(
                  videoViewRef.current.buffer,
                  offset,
                  width * height * 4,
                )

                rendererRef.current.renderFrame({ data: frameData, width, height })
              }

              // Drain audio from the ring buffer
              drainAudioRing()
            } else {
              // Fallback: render from IPC-buffered frame
              const frame = pendingFrameRef.current
              if (frame && rendererRef.current) {
                pendingFrameRef.current = null
                rendererRef.current.renderFrame(frame)
              }
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

    // IPC fallback audio path — used when SharedArrayBuffer is unavailable.
    // When SAB mode is active, audio is drained from the ring buffer in the
    // rAF loop instead (see drainAudioRing).
    api.on('game:audio-samples', (audioData: any) => {
      if (useSharedBuffersRef.current) return

      // audioData.samples arrives as Uint8Array after Electron IPC.
      // Interpret the raw bytes as interleaved stereo Int16 samples.
      const raw: Uint8Array = audioData.samples
      const samples = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
      scheduleAudioChunk(samples, audioData.sampleRate)
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
      api.removeAllListeners('emulator:speedChanged')

      cancelAnimationFrame(rafIdRef.current)
      pendingFrameRef.current = null
      bootReadyRef.current = false

      // Reset SAB state so a fresh init can re-establish the connection
      useSharedBuffersRef.current = false
      controlViewRef.current = null
      videoViewRef.current = null
      audioViewRef.current = null
      videoBufferSizeRef.current = 0
      lastRenderedSeqRef.current = 0

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

    /** True when the event target is a text input (annotation fields, etc.). */
    const isTypingInInput = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingInInput(e)) return
      const buttonId = KEY_MAP[e.key]
      if (buttonId !== undefined) {
        e.preventDefault()
        api.gameInput(0, buttonId, true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isTypingInInput(e)) return
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

  const SPEED_OPTIONS = [1, 1.5, 2, 3, 4, 8] as const

  const handleSetSpeed = async (multiplier: number, fromDropdown = false) => {
    try {
      // Update state optimistically so subsequent clicks don't read stale
      // values while waiting for the IPC round-trip confirmation.
      setSpeedMultiplier(multiplier)
      // When the user explicitly picks a fast-forward speed from the
      // dropdown, remember it as the preferred toggle target.
      if (fromDropdown && multiplier > 1) {
        setPreferredFastForwardSpeed(multiplier)
        localStorage.setItem('gamelord:fastForwardSpeed', String(multiplier))
      }
      await api.emulation.setSpeed(multiplier)
    } catch (err) {
      console.error('Set speed failed:', err)
    }
  }

  const handleToggleFastForward = async () => {
    const nextSpeed = speedMultiplier > 1 ? 1 : preferredFastForwardSpeed
    await handleSetSpeed(nextSpeed)
  }

  // Keyboard shortcuts (overlay mode or general)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
      if (isTyping) return

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
      if (e.key === 'Tab') {
        e.preventDefault()
        void handleToggleFastForward()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPaused, selectedSlot, speedMultiplier, preferredFastForwardSpeed])

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOverControlsRef = useRef(false)
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null)

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    hideTimeoutRef.current = setTimeout(() => {
      if (!isOverControlsRef.current) {
        setShowControls(false)
      }
    }, 1000)
  }, [])

  // Show on mouse move, auto-hide after 1s of inactivity.
  // Ignores the initial mousemove if the cursor was already in the window
  // area when it spawned — controls only appear on genuine cursor movement.
  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (mode !== 'native' || isPoweringOn || isPoweringOff) return

      const { clientX, clientY } = event
      const last = lastMousePositionRef.current

      if (!last) {
        // First mousemove — record position but don't show controls
        lastMousePositionRef.current = { x: clientX, y: clientY }
        return
      }

      if (last.x === clientX && last.y === clientY) return

      lastMousePositionRef.current = { x: clientX, y: clientY }
      setShowControls(true)
      scheduleHide()
    },
    [mode, isPoweringOn, isPoweringOff, scheduleHide],
  )

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

      {/* Dev branch badge — top-right, always visible in dev mode */}
      {isNative && (
        <div className="absolute top-2 right-2 z-40">
          <DevBranchBadge variant="overlay" />
        </div>
      )}

      {/* Persistent drag region — always allows window dragging from the top
          edge, even when the visible controls overlay is hidden. Sits below the
          controls (z-40) so it doesn't intercept clicks on visible buttons. */}
      {isNative && !isPoweringOff && (
        <div
          className="absolute top-0 left-0 right-0 h-8 z-40"
          style={{ WebkitAppRegion: 'drag', cursor: 'default' } as React.CSSProperties}
        />
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
              className="text-white hover:bg-white/20 hover:text-white"
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
              className="text-white hover:bg-white/20 hover:text-white"
              title="Reset"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleScreenshot}
              className="text-white hover:bg-white/20 hover:text-white"
            >
              <Camera className="h-5 w-5" />
            </Button>
            <div className="relative flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleFastForward}
                className={`text-white hover:bg-white/20 hover:text-white ${speedMultiplier > 1 ? 'text-yellow-400 hover:text-yellow-300' : ''}`}
                title={`Fast Forward (Tab) — ${speedMultiplier}x`}
              >
                <FastForward className="h-5 w-5" />
                {speedMultiplier > 1 && (
                  <span className="ml-1 text-xs font-medium">{speedMultiplier}x</span>
                )}
              </Button>
              <button
                onClick={() => { setShowSpeedMenu((v) => !v); setShowShaderMenu(false); setShowSettingsMenu(false) }}
                className="text-white/60 hover:text-white hover:bg-white/10 rounded p-0.5 -ml-1 transition-colors"
                title="Speed options"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-black/95 rounded-lg shadow-lg py-1 min-w-[100px]">
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => { void handleSetSpeed(speed, true); setShowSpeedMenu(false) }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        speedMultiplier === speed
                          ? 'text-yellow-400 bg-white/10'
                          : 'text-white/80 hover:bg-white/10'
                      }`}
                    >
                      {speed}x{speed === 1 ? ' (Normal)' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              className="text-white hover:bg-white/20 hover:text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              Save (F5)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadState}
              className="text-white hover:bg-white/20 hover:text-white"
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
              className="text-white hover:bg-white/20 hover:text-white"
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
                onClick={() => { setShowShaderMenu((v) => !v); setShowSettingsMenu(false); setShowSpeedMenu(false) }}
                className="text-white hover:bg-white/20 hover:text-white"
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
                onClick={() => { setShowSettingsMenu((v) => !v); setShowShaderMenu(false); setShowSpeedMenu(false) }}
                className="text-white hover:bg-white/20 hover:text-white"
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
