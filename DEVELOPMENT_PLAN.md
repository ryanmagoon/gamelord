# GameLord Development Plan

## Current Architecture

GameLord is a native emulator frontend (OpenEmu-style) where Electron handles UI/library management and libretro cores are loaded directly via a native Node addon (`gamelord_libretro.node`) using dlopen. No external emulator processes.

### How It Works
1. **Native addon** (`apps/desktop/native/src/libretro_core.cc`) loads libretro `.dylib` cores directly, implementing the full libretro frontend API (environment callbacks, video/audio/input)
2. **Main process** runs an emulation loop at the core's native FPS, pushing video frames and audio samples to the renderer via `webContents.send` with `Buffer` for efficient transfer
3. **Renderer** displays frames on a `<canvas>` via `putImageData` and plays audio via Web Audio API with seamless chunk scheduling
4. **Input** is captured in the renderer (keyboard events) and forwarded to the native core via IPC

### Key Files
```
apps/desktop/native/src/
├── libretro_core.cc          - Native addon: dlopen, libretro API, frame/audio buffers
├── libretro_core.h           - Native addon header
├── libretro.h                - Libretro API definitions
└── addon.cc                  - N-API module registration

apps/desktop/src/main/
├── GameWindowManager.ts      - Game window lifecycle, emulation loop, frame push
├── emulator/
│   ├── EmulatorCore.ts       - Abstract base class
│   ├── LibretroNativeCore.ts - Native core wrapper (runFrame, getVideoFrame, etc.)
│   ├── RetroArchCore.ts      - Legacy RetroArch process mode (overlay)
│   └── EmulatorManager.ts    - Core selection & orchestration
└── ipc/
    └── handlers.ts           - IPC endpoints

apps/desktop/src/renderer/components/
└── GameWindow.tsx            - Canvas rendering, audio playback, controls overlay

apps/desktop/src/preload.ts   - Renderer API bridge
```

### Supported Cores
- **NES:** fceumm (primary), nestopia, mesen
- Cores located at: `~/Library/Application Support/RetroArch/cores/`

---

## Completed

- [x] Native libretro addon with dlopen core loading
- [x] Environment callback implementation (pixel format, system/save directories, core options, input descriptors, log interface, etc.)
- [x] Video frame capture (XRGB8888 → RGBA conversion in native code)
- [x] Audio sample capture (interleaved stereo Int16)
- [x] Keyboard input mapping to libretro joypad buttons
- [x] Main-process emulation loop driven at core's native FPS
- [x] Efficient frame/audio push via `webContents.send` + `Buffer`
- [x] Seamless audio scheduling via Web Audio API `AudioContext` timing
- [x] Game window with hiddenInset title bar, canvas rendering, control overlays
- [x] Save state serialization/deserialization
- [x] Pause/resume/reset
- [x] Screenshot capture
- [x] Keyboard shortcuts (F5 save, F9 load, Space pause)
- [x] Legacy overlay mode for external RetroArch process
- [x] Library scanner and game management
- [x] Clean up debug logging from native addon and TypeScript

---

## TODO

### Performance & Quality
- [ ] Add structured logging system (log levels, categories, file output) to replace ad-hoc console.error/warn
- [ ] Investigate SharedArrayBuffer for zero-copy frame transfer (eliminate Buffer serialization)
- [ ] Audio resampling — handle cases where core sample rate differs from AudioContext
- [ ] Frame skipping / frame pacing improvements if display refresh != core FPS

### Multi-System Support
- [ ] Install and test additional cores (SNES: snes9x/bsnes, Genesis: genesis_plus_gx, GB/GBA: mgba/gambatte)
- [ ] Update ROM scanner to detect multiple system types
- [ ] Add system badges/icons to library UI

### Library & Metadata
- [ ] Integrate metadata API (TheGamesDB or IGDB) for cover art and game info
- [ ] Cover art downloading and caching
- [ ] Grid view with cover art thumbnails
- [ ] Search, filter, and sorting
- [ ] Recently played tracking

### Controls & Input
- [ ] Controller configuration UI with 3D interactive controller model
  - [ ] Three.js rendering of a realistic controller model that the user can rotate/inspect
  - [ ] Highlight each button on the 3D model as it becomes the active assignment target
  - [ ] Click-to-assign flow: highlighted button pulses/glows, user presses physical input to bind it
  - [ ] Support for multiple controller types (Xbox, PlayStation, generic) with matching 3D models
- [x] Gamepad API support in renderer — detect connected controllers, read input state
- [ ] Per-game input mappings — override default bindings on a per-game or per-system basis

### Rewind
- [ ] Implement frame-state ring buffer — capture serialized save states every N frames
- [ ] Hold-to-rewind input binding (rewind button replays buffered states in reverse)
- [ ] Configurable rewind buffer duration and granularity
- [ ] Visual rewind indicator in the game window overlay

### Online Multiplayer
- [ ] Netplay architecture — relay server for input synchronization between peers
- [ ] Lobby system with room codes for creating/joining sessions
- [ ] Rollback-based netcode using save state serialization for latency hiding
- [ ] Friend list and invite system
- [ ] Per-game netplay compatibility metadata (supported cores, input latency settings)

### UI Polish
- [ ] Replace native OS dialogs with custom in-app dialogs (e.g. autosave resume prompt, file pickers)
- [x] Shader/filter selection (CRT, CRT Aperture, Scanlines, LCD, Sharp Bilinear via WebGL2)
- [ ] Explore loading Slang (.slang/.slangp) shaders from the libretro shader ecosystem
- [x] Dark mode (default) with light/dark toggle and localStorage persistence
- [ ] Screenshot gallery per game
- [ ] Playtime tracking and statistics
- [ ] Settings panel

### Packaging & Distribution
- [ ] Bundle libretro cores with the app
- [ ] Package as DMG for macOS
- [ ] Auto-update mechanism

---

## Technical Notes

### Native Addon Build
The bundled `node-gyp` is too old for Node 24. Use:
```bash
cd apps/desktop/native && npx node-gyp rebuild
```

### Core Download
ARM64 cores from: `https://buildbot.libretro.com/nightly/apple/osx/arm64/latest/`

### Known Issues
- Mesen core fails to load games via the native addon (works in standalone C test). Use fceumm instead.
- `node-gyp` v5.0.6 bundled with npm is incompatible with Node 24; must use `npx node-gyp` (v10+).
