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

Items are grouped by priority. Work top-down within each tier.

### P0 — Critical (fix before any new features)

- [x] **CI/CD pipeline** — GitHub Actions workflow: lint, type-check, test, native addon build on every PR
- [x] **Emulation loop error handling** — Wrap `core.runFrame()` in try-catch in `GameWindowManager.ts`; stop loop and notify renderer on crash instead of silently freezing
- [x] **Bounded audio buffer** — Replace unbounded `std::vector` insert in `libretro_core.cc` with a fixed-size circular buffer to prevent memory exhaustion when renderer falls behind
- [x] **Path validation** — Validate `romPath` and `corePath` are within expected directories before passing to `dlopen()` and filesystem operations; prevent path traversal

### P1 — High Priority (stability & correctness)

- [ ] **Structured logging** — Replace ad-hoc `console.error`/`console.warn` with a logging library (e.g. `electron-log` or `pino`); add log levels, categories, and file output
- [ ] **Route native addon logs to Node.js** — Replace `fprintf(stderr, ...)` in `libretro_core.cc` with N-API event emission so logs appear in the structured logging system
- [ ] **Test suite — IPC handlers** — Mock native addon, verify correct dispatch and error responses
- [ ] **Test suite — LibraryService** — Scanning, deduplication, game ID generation, edge cases
- [ ] **Test suite — LibretroNativeCore** — Save state round-trip, SRAM persistence, error recovery
- [ ] **Test suite — WebGL renderer** — Shader compilation, preset switching, fallback behavior
- [ ] **Fix test environment** — Switch vitest config from jsdom to happy-dom (per project conventions)
- [ ] **Fix game ID hashing** — Replace `MD5(romPath)` in `LibraryService.ts` with `SHA-256(fileContent)` so IDs survive file moves
- [ ] **ROM checksum validation** — Compute CRC32/SHA-1 checksums on ROM files for integrity verification and database lookups (e.g. No-Intro DAT matching)

### P2 — Performance

- [x] **Vsync-aligned rendering** — Buffer IPC video frames and draw in a `requestAnimationFrame` loop instead of rendering directly from IPC handlers. Aligns WebGL draws with display vsync; multiple IPC frames between vsyncs are naturally skipped.
- [x] **Remove backdrop-blur from game window** — Replaced `backdrop-blur-md` on all game window overlays with solid backgrounds to eliminate GPU compositing overhead during gameplay.
- [x] **FPS counter** — Settings menu toggle for an FPS overlay (EMA of rAF timestamp deltas, updated every 30 frames). Persisted in localStorage.
- [ ] **Worker thread emulation** — Move emulation loop from main process `setTimeout` to a dedicated Worker thread; finish the `core-worker.ts` stub
- [ ] **SharedArrayBuffer for frame transfer** — Zero-copy video/audio push between worker and renderer (unlocked by worker thread migration)
- [ ] **Lock-free audio buffer** — Replace `std::mutex`-guarded audio buffer in native addon with a lock-free SPSC ring buffer
- [ ] **Native audio sample conversion** — Move Int16 → Float32 stereo deinterleaving from JavaScript (`GameWindow.tsx`) into the native addon so frames arrive renderer-ready, eliminating ~42K JS loop iterations/sec
- [ ] **Audio resampling** — Handle cases where core sample rate differs from `AudioContext.sampleRate`
- [ ] **Frame skipping / frame pacing** — Catch-up mechanism when rendering lags; handle display refresh != core FPS

### P3 — Multi-System Support

- [ ] Install and test additional cores (SNES: snes9x/bsnes, Genesis: genesis_plus_gx, GB/GBA: mgba/gambatte)
- [ ] Update ROM scanner to detect multiple system types
- [ ] Add system badges/icons to library UI
- [ ] Remove C++ singleton constraint (`LibretroCore::s_instance`) to allow multiple core instances

### P4 — Library & Metadata

- [x] Integrate metadata API (ScreenScraper) for cover art and game info
- [x] Cover art downloading and caching (artwork:// custom protocol, per-game and bulk sync)
- [ ] Grid view with cover art thumbnails
- [ ] Search, filter, and sorting
- [ ] Recently played tracking

### P5 — Controls & Input

- [ ] Controller configuration UI with 3D interactive controller model
  - [ ] Three.js rendering of a realistic controller model that the user can rotate/inspect
  - [ ] Highlight each button on the 3D model as it becomes the active assignment target
  - [ ] Click-to-assign flow: highlighted button pulses/glows, user presses physical input to bind it
  - [ ] Support for multiple controller types (Xbox, PlayStation, generic) with matching 3D models
- [x] Gamepad API support in renderer — detect connected controllers, read input state
- [ ] Per-game input mappings — override default bindings on a per-game or per-system basis

### P6 — Rewind

- [ ] Implement frame-state ring buffer — capture serialized save states every N frames
- [ ] Hold-to-rewind input binding (rewind button replays buffered states in reverse)
- [ ] Configurable rewind buffer duration and granularity
- [ ] Visual rewind indicator in the game window overlay

### P7 — Online Multiplayer

- [ ] Netplay architecture — relay server for input synchronization between peers
- [ ] Lobby system with room codes for creating/joining sessions
- [ ] Rollback-based netcode using save state serialization for latency hiding
- [ ] Friend list and invite system
- [ ] Per-game netplay compatibility metadata (supported cores, input latency settings)

### RetroAchievements

- [ ] MD5-based ROM identification (shares hash infrastructure with artwork service)
- [ ] RetroAchievements API integration — authenticate, fetch achievement lists per game
- [ ] Achievement unlocking via rcheevos runtime (memory inspection each frame)
- [ ] Achievement unlock notifications in game window overlay
- [ ] Per-game achievement list and progress tracking in library UI
- [ ] Hardcore mode support (disable save states/rewind when active)

### Developer Tools

- [ ] Toggleable debug overlay for the game window (keyboard shortcut or settings toggle)
  - [ ] Input state: show which buttons/axes are active in real time (gamepad and keyboard)
  - [ ] Emulation stats: FPS, frame time, audio buffer health, dropped frames
  - [ ] IPC monitor: visualize game:input, game:video-frame, game:audio-samples throughput
  - [ ] Gamepad inspector: connected controllers, mapping type, raw button/axis values
  - [ ] Mode/state readout: current mode, paused state, active core, ROM info
- [ ] Persist debug overlay preferences in localStorage

### P8 — UI Polish

- [ ] Replace native OS dialogs with custom in-app dialogs (e.g. autosave resume prompt, file pickers)
- [x] Shader/filter selection (CRT, CRT Aperture, Scanlines, LCD, Sharp Bilinear via WebGL2)
- [ ] Explore loading Slang (.slang/.slangp) shaders from the libretro shader ecosystem
- [ ] Persist shader choice per core (e.g. CRT for SNES/snes9x, Sharp Bilinear for GBA/mgba)
- [x] Dark mode (default) with light/dark toggle and localStorage persistence
- [ ] **VHS-style pause screen** — Replace the minimal pause badge with a nostalgic VHS aesthetic: large "PAUSE" text in the corner (VCR-style monospace font, blue/white), horizontal beam warping/tracking distortion across the screen, subtle static crackle noise overlay, and scanline drift. Should feel like pausing a VHS tape in the '90s. Only applies to CRT-display-type systems; LCD systems keep a clean digital pause indicator.
- [ ] **Native screenshot encoding** — Encode screenshots as PNG/JPEG in the native addon (e.g. via `stb_image_write`) instead of saving raw RGBA, reducing file size and avoiding JS-side encoding overhead
- [ ] Screenshot gallery per game
- [ ] Playtime tracking and statistics
- [ ] Settings panel
- [ ] **Graphics quality setting** — A simple quality preference (e.g. "Quality" / "Performance") that controls shader complexity and cosmetic effects. "Performance" disables multi-pass CRT shaders (falls back to single-pass or nearest), simplifies the VHS pause screen, and strips heavy overlays. Lets users on lower-end hardware or high-refresh displays trade eye candy for consistent frame pacing.

### P9 — Packaging & Distribution

- [ ] Bundle libretro cores with the app
- [ ] Package as DMG for macOS
- [ ] Auto-update mechanism

### P10 — Native Addon Hardening

- [ ] **Enable C++ exceptions or remove STL** — `NAPI_DISABLE_CPP_EXCEPTIONS` is set but `std::vector` can throw on allocation failure; either enable exceptions or use pre-allocated fixed buffers
- [ ] **Cross-platform path handling** — Abstract macOS-specific paths (e.g. `/Applications/RetroArch.app/...` in `EmulatorManager.ts`) behind platform detection
- [ ] **Pin dependency versions** — Replace `^` ranges in `package.json` with exact versions to prevent surprise breakages (especially Tailwind CSS v4)

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
- Hard-refreshing the game window causes the emulation to run at uncapped speed (the main-process emulation loop keeps pushing frames while the renderer resets its state).
