# GameLord Architecture

GameLord is a native emulator frontend (OpenEmu-style) where Electron handles UI/library management and libretro cores are loaded directly via a native Node addon (`gamelord_libretro.node`) using dlopen. No external emulator processes.

## How It Works

1. **Native addon** (`apps/desktop/native/src/libretro_core.cc`) loads libretro cores directly, implementing the full libretro frontend API (environment callbacks, video/audio/input).
2. **Utility process** (`core-worker.ts`) runs the emulation loop in a dedicated Electron utility process with hybrid sleep+spin frame pacing (~0.1-0.5ms jitter). It writes video frames directly into double-buffered `SharedArrayBuffer` memory and audio samples into an SPSC (single-producer single-consumer) audio ring buffer.
3. **Zero-copy shared memory transfer (Default)**:
   - Synchronized via a shared control block (`shared-frame-protocol.ts`) containing 7 `Int32` slots (`activeBuffer`, `frameSequence`, `frameWidth`, `frameHeight`, `audioWritePos`, `audioReadPos`, `audioSampleRate`).
   - The worker writes geometry and updates the active buffer slot before incrementing `frameSequence`. The renderer observes `frameSequence` last, ensuring memory visibility of the new buffer and dimensions before processing.
   - Initial `SharedArrayBuffer` handles are exchanged with the renderer via a `MessagePort` bridge (`GameWindow.tsx`).
   - *Fallback path*: If `useSharedBuffers` is disabled, the main process falls back to copying frames and audio to the renderer over IPC via `webContents.send` (`Buffer`).
4. **Renderer**:
   - Video frames are uploaded directly as a texture and rendered through `WebGLRenderer` (`GameWindow.tsx`) using the multi-pass shader pipeline in `packages/ui/webgl/` (supporting CRT scanlines, curvature, bloom).
   - Audio is drained directly from the shared SPSC ring buffer in `GameWindow.tsx` and scheduled seamlessly via the Web Audio API.
5. **Input**:
   - In contrast to shared-memory video/audio, input remains asymmetric: keyboard and gamepad events are captured in the renderer and dispatched per event over IPC (`preload.ts` → `GameWindowManager.ts` → `core-worker.ts`) to be polled by the libretro core callback.

## Key Files

```
apps/desktop/native/src/
├── libretro_core.cc          - Native addon: dlopen, libretro API, frame/audio buffers
├── libretro_core.h           - Native addon header
├── libretro.h                - Libretro API definitions
└── addon.cc                  - N-API module registration

apps/desktop/src/main/
├── GameWindowManager.ts      - Game window lifecycle, frame/audio forwarding to renderer
├── emulator/
│   ├── EmulatorCore.ts       - Abstract base class
│   ├── LibretroNativeCore.ts - Path validation & config for native mode
│   ├── EmulationWorkerClient.ts - Spawns & communicates with utility process worker
│   ├── RetroArchCore.ts      - Legacy RetroArch process mode (overlay)
│   └── EmulatorManager.ts    - Core selection & orchestration
├── workers/
│   ├── core-worker.ts        - Utility process: emulation loop, native addon, frame pacing
│   ├── core-worker-protocol.ts - Shared message types (worker ↔ main)
│   └── shared-frame-protocol.ts - Control block layout & video/audio shared buffer sizing
└── ipc/
    └── handlers.ts           - IPC endpoints

apps/desktop/src/renderer/components/
└── GameWindow.tsx            - WebGL texture upload, shader pipeline, audio ring drain, controls overlay

packages/ui/webgl/            - WebGL multi-pass CRT shader pipeline and renderer

apps/desktop/src/preload.ts   - Renderer API bridge
```

## Supported Cores

- **NES:** fceumm (primary), nestopia, mesen
- **PSX:** pcsx_rearmed (PCSX ReARMed, primary), mednafen_psx_hw (Beetle PSX HW), swanstation (SwanStation) — requires BIOS file (`scph5501.bin`). SwanStation (DuckStation fork) enables full chtdb cheat support including extended code types.
- **Sega Saturn:** mednafen_saturn (Beetle Saturn, primary), yabause — requires BIOS files (`sega_101.bin`, `mpr-17933.bin`)
- **GameCube:** dolphin (Dolphin) — no BIOS files required (HLE BIOS)
- Cores located at: `~/Library/Application Support/GameLord/cores/`
- BIOS files located at: `~/Library/Application Support/GameLord/BIOS/` (created automatically on startup, mirrors OpenEmu convention)
