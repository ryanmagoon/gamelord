# GameLord Architecture

GameLord is a native emulator frontend (OpenEmu-style) where Electron handles UI/library management and libretro cores are loaded directly via a native Node addon (`gamelord_libretro.node`) using dlopen. No external emulator processes.

## How It Works

1. **Native addon** (`apps/desktop/native/src/libretro_core.cc`) loads libretro `.dylib` cores directly, implementing the full libretro frontend API (environment callbacks, video/audio/input)
2. **Utility process** (`core-worker.ts`) runs the emulation loop in a dedicated Electron utility process with hybrid sleep+spin frame pacing (~0.1-0.5ms jitter), sending video frames and audio samples to the main process via `postMessage`
3. **Main process** forwards frames/audio to the renderer via `webContents.send` with `Buffer`. `EmulationWorkerClient` manages the worker lifecycle and request/response protocol.
4. **Renderer** displays frames on a `<canvas>` via `putImageData` and plays audio via Web Audio API with seamless chunk scheduling
5. **Input** is captured in the renderer (keyboard events) and forwarded through the main process to the utility process worker via IPC

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
│   └── core-worker-protocol.ts - Shared message types (worker ↔ main)
└── ipc/
    └── handlers.ts           - IPC endpoints

apps/desktop/src/renderer/components/
└── GameWindow.tsx            - Canvas rendering, audio playback, controls overlay

apps/desktop/src/preload.ts   - Renderer API bridge
```

## Supported Cores

- **NES:** fceumm (primary), nestopia, mesen
- **PSX:** pcsx_rearmed (PCSX ReARMed, primary), mednafen_psx_hw (Beetle PSX HW), swanstation (SwanStation) — requires BIOS file (`scph5501.bin`). SwanStation (DuckStation fork) enables full chtdb cheat support including extended code types.
- **Sega Saturn:** mednafen_saturn (Beetle Saturn, primary), yabause — requires BIOS files (`sega_101.bin`, `mpr-17933.bin`)
- Cores located at: `~/Library/Application Support/GameLord/cores/`
- BIOS files located at: `~/Library/Application Support/GameLord/BIOS/` (created automatically on startup, mirrors OpenEmu convention)
