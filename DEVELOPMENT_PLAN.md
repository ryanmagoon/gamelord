# GameLord Development Plan

## Current Architecture

GameLord is a native emulator frontend (OpenEmu-style) where Electron handles UI/library management and libretro cores are loaded directly via a native Node addon (`gamelord_libretro.node`) using dlopen. No external emulator processes.

### How It Works
1. **Native addon** (`apps/desktop/native/src/libretro_core.cc`) loads libretro `.dylib` cores directly, implementing the full libretro frontend API (environment callbacks, video/audio/input)
2. **Utility process** (`core-worker.ts`) runs the emulation loop in a dedicated Electron utility process with hybrid sleep+spin frame pacing (~0.1-0.5ms jitter), sending video frames and audio samples to the main process via `postMessage`
3. **Main process** forwards frames/audio to the renderer via `webContents.send` with `Buffer`. `EmulationWorkerClient` manages the worker lifecycle and request/response protocol.
4. **Renderer** displays frames on a `<canvas>` via `putImageData` and plays audio via Web Audio API with seamless chunk scheduling
5. **Input** is captured in the renderer (keyboard events) and forwarded through the main process to the utility process worker via IPC

### Key Files
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

- [x] **Structured logging** — Replace ad-hoc `console.error`/`console.warn` with a logging library (e.g. `electron-log` or `pino`); add log levels, categories, and file output
- [x] **Route native addon logs to Node.js** — Replace `fprintf(stderr, ...)` in `libretro_core.cc` with N-API event emission so logs appear in the structured logging system
- [x] **Test suite — IPC handlers** — Mock native addon, verify correct dispatch and error responses
- [x] **Test suite — LibraryService** — Scanning, deduplication, game ID generation, edge cases
- [x] **Test suite — LibretroNativeCore** — Save state round-trip, SRAM persistence, error recovery
- [x] **Test suite — WebGL renderer** — Shader compilation, preset switching, fallback behavior
- [x] **Fix test environment** — Switch vitest config from jsdom to happy-dom (per project conventions)
- [x] **Fix game ID hashing** — Replace `MD5(romPath)` in `LibraryService.ts` with `SHA-256(fileContent)` so IDs survive file moves
- [ ] **ROM checksum validation** — Compute CRC32/SHA-1 checksums on ROM files for integrity verification and database lookups (e.g. No-Intro DAT matching)

### P2 — Performance

- [x] **Vsync-aligned rendering** — Buffer IPC video frames and draw in a `requestAnimationFrame` loop instead of rendering directly from IPC handlers. Aligns WebGL draws with display vsync; multiple IPC frames between vsyncs are naturally skipped.
- [x] **Remove backdrop-blur from game window** — Replaced `backdrop-blur-md` on all game window overlays with solid backgrounds to eliminate GPU compositing overhead during gameplay.
- [x] **FPS counter** — Settings menu toggle for an FPS overlay (EMA of rAF timestamp deltas, updated every 30 frames). Persisted in localStorage.
- [x] **Worker thread emulation** — Moved emulation loop from main process to a dedicated Electron utility process (`core-worker.ts`) with hybrid sleep+spin frame pacing. `EmulationWorkerClient` manages the worker lifecycle and message protocol.
- [x] **Dense mosaic grid layout** — CSS Grid `dense` packing with computed row-spans per card aspect ratio, eliminating dead space in the game library grid
- [x] **Virtualized game library** — JS dense packing algorithm + viewport culling for large collections (>100 games). Reduces DOM nodes from 1200+ to ~20-40, with RAF-throttled scroll tracking. Lists <=100 items keep CSS Grid + FLIP animation.
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
- [x] Grid view with cover art thumbnails
- [x] Search, filter, and sorting
- [x] **Scan-time zip extraction** — Library scanner extracts ROMs from `.zip` archives at scan time for all non-arcade systems. Extracted ROMs cached in `<userData>/roms-cache/` with hash-prefixed filenames. Arcade `.zip` files are passed through natively (MAME expects zips). Cache cleaned up on game removal.
- [ ] **Artwork sync performance** — Current implementation downloads full-resolution images serially with a new TCP connection per request, taking several seconds per game. Improvements ordered by impact:
  - [ ] Request smaller images via `maxwidth`/`maxheight` params (2–3x faster downloads) — [#37](https://github.com/ryanmagoon/gamelord/issues/37)
  - [ ] Persistent HTTP Agent with keep-alive (~15% faster) — [#38](https://github.com/ryanmagoon/gamelord/issues/38)
  - [ ] Pipeline image downloads with next API query (~30–40% faster) — [#39](https://github.com/ryanmagoon/gamelord/issues/39)
  - [ ] Pre-hash all ROMs in parallel before sync — [#40](https://github.com/ryanmagoon/gamelord/issues/40)
  - [ ] Progressive artwork loading UX (show art as each game resolves) — [#41](https://github.com/ryanmagoon/gamelord/issues/41)
  - [ ] Multi-threaded ScreenScraper access for Patreon-tier users (up to 5x throughput) — [#42](https://github.com/ryanmagoon/gamelord/issues/42)
- [ ] Recently played tracking
- [ ] **Rating display** — Show ScreenScraper community rating on cards or in a detail view. Already stored as `metadata.rating` (0–1 scale). Consider a 5-star or 10-point visual treatment.
- [ ] **Game detail view (Wikipedia-style)** — A rich, enthusiast-oriented detail page for each game, inspired by Wikipedia articles. Covers history, developer background, release timeline, platform ports, reception, and trivia — not just a metadata card. Includes cover art, screenshots, genre/player count/rating, and any ScreenScraper metadata we have, but the feel should be editorial and informational, like reading a game's encyclopedia entry. Triggered by clicking a game card (the card itself transitions/expands into the detail view). A minimalist play button on the card (or within the detail view) launches the game. This replaces the current "click card to launch" behavior — cards become the entry point to the detail view, not the emulator.
- [ ] **Card → detail view transition** — When a game card is clicked, it expands/morphs into the full detail view (FLIP-style or shared-element transition). The play button moves to the detail view (or stays as a small overlay on the card). This is the interaction change that decouples "click card" from "launch game."
- [ ] **Filter by genre** — Genre is already stored per-game from ScreenScraper. Add a genre filter dropdown alongside the existing platform filter.
- [ ] **Filter by player count** — Filter to show only single-player, multiplayer, or N+ player games using `metadata.players`.
- [ ] **Filter by decade/era** — Group games by release decade (80s, 90s, 2000s) using `metadata.releaseDate`.
- [ ] **Sort by rating** — Add rating as a sort option in the library toolbar.
- [ ] **Favorites** — Toggle favorite on games (field already exists on Game type). Add a "Favorites" filter and sort favorites to the top.
- [ ] **Play count & stats** — Track number of play sessions (not just total time). Show "most played" sorting and a stats view with play history over time.
- [ ] **Completion status** — Let users tag games as "Not Started", "In Progress", "Completed", or "Abandoned". Filterable.
- [ ] **Collections / tags** — User-created collections (e.g. "Couch Co-op", "RPG Marathon", "Childhood Favorites") for organizing games beyond system/genre.

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

- [ ] **TV static animation hitches during artwork sync** ([#23](https://github.com/ryanmagoon/gamelord/issues/23)) — When artwork syncs for any card (download, error, or not-found), all other cards' TV static animations freeze momentarily. React-level optimizations already applied: stable style refs for React.memo (`useFlipAnimation`), shared `TVStaticManager` singleton (one rAF loop instead of 50+), per-game `UiGame` object cache, and `ArtworkSyncStore` backed by `useSyncExternalStore` to bypass parent re-renders. Hitches persist — likely caused by browser-level bottleneck: canvas `putImageData` cost across 50+ canvases, forced reflow during `useAspectRatioTransition` height changes, or image decode blocking the main thread. Next steps: profile with Chrome DevTools Performance panel to identify the exact frame-time spike, consider `OffscreenCanvas` in a Web Worker for noise generation, investigate batching `putImageData` calls with `requestIdleCallback`, and test whether pausing static on off-screen cards via `IntersectionObserver` eliminates the jank.
- [ ] **Artwork load animation polish** — The `useAspectRatioTransition` hook and dissolve-in animation exist but the card resize isn't visibly smooth when artwork arrives. Debug and polish: coordinate the art dissolve-in with the card height transition so they feel like one fluid motion, test with both portrait and landscape art, and ensure cards already loaded with art skip the animation entirely.
- [ ] **Error modal for blocking sync failures** — Swap the banner notification for a modal dialog when artwork sync hits a blocking error (missing dev env vars, invalid credentials, etc.). Banners are fine for success summaries and non-critical warnings, but "sync can't work at all" errors should be modal so the user has to acknowledge them. The banner currently flashes by too quickly and doesn't feel appropriate for serious configuration problems. Also audit the UI for any other jarring state changes that happen when the sync loop terminates early (e.g. all cards briefly pulsing then snapping back).
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

### P10 — Web Presence (Vercel)

- [ ] Landing page / marketing site (`gamelord.app`) — Next.js app with download links, feature showcase, screenshots, changelog
- [ ] Documentation site (`docs.gamelord.app`) — Next.js + MDX or Astro
- [ ] Cloud saves / sync API — serverless functions + blob storage, requires user accounts/auth
- [ ] User profile dashboard — achievements, play history, library stats (rides on cloud saves infra)
- [ ] Multiplayer lobby/matchmaking API — pairs with P7 relay server (relay itself should NOT be on Vercel — needs persistent WebSocket connections, use Fly.io/Railway/VPS)

### P11 — Native Addon Hardening

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
- ~~Rescan overwrote existing game metadata (coverArt, romHashes, etc.) causing artwork to re-download on every rescan~~ — Fixed: `scanDirectory` now merges with existing game records instead of replacing them.
- ~~Compressed ROMs (.zip/.7z) were only detected for Arcade; other systems (GB, GBA, NES, etc.) ignored zip files~~ — Fixed: all systems now accept `.zip`/`.7z` extensions. Archive files only match non-Arcade systems when inside a system-named folder or scanned with an explicit `systemId`.
