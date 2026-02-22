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
- **Sega Saturn:** mednafen_saturn (Beetle Saturn, primary), yabause — requires BIOS files (`sega_101.bin`, `mpr-17933.bin`)
- Cores located at: `~/Library/Application Support/GameLord/cores/`
- BIOS files located at: `~/Library/Application Support/GameLord/BIOS/` (created automatically on startup, mirrors OpenEmu convention)

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
- [x] **Incremental library scan** — Rewrote `scanDirectory` with three optimizations: (1) mtime-based cache skips re-hashing unchanged files (romMtime stored on Game), (2) new-files-first ordering processes unknown ROMs before known ones so new games appear in the UI immediately, (3) streamed progress events (`library:scanProgress`) push each discovered game to the renderer as it's found instead of waiting for the entire scan. Also added parallel hashing (4 files concurrently) and a romPath→gameId reverse index for O(1) lookups. Rescanning 2000+ unchanged ROMs now completes in under a second (stat-only) vs minutes (full hash). Scanning badge shows live progress count.
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
- [x] **ROM checksum validation** — Compute CRC32/SHA-1/MD5 checksums on ROM files at scan time via single-pass streaming. Stored in required `romHashes` field on `Game`. Backfill on startup for existing libraries. ArtworkService simplified to use pre-computed MD5. — [#61](https://github.com/ryanmagoon/gamelord/issues/61)

### P2 — Performance

- [x] **Vsync-aligned rendering** — Buffer IPC video frames and draw in a `requestAnimationFrame` loop instead of rendering directly from IPC handlers. Aligns WebGL draws with display vsync; multiple IPC frames between vsyncs are naturally skipped.
- [x] **Remove backdrop-blur from game window** — Replaced `backdrop-blur-md` on all game window overlays with solid backgrounds to eliminate GPU compositing overhead during gameplay.
- [x] **FPS counter** — Settings menu toggle for an FPS overlay (EMA of rAF timestamp deltas, updated every 30 frames). Persisted in localStorage.
- [x] **Worker thread emulation** — Moved emulation loop from main process to a dedicated Electron utility process (`core-worker.ts`) with hybrid sleep+spin frame pacing. `EmulationWorkerClient` manages the worker lifecycle and message protocol.
- [x] **Dense mosaic grid layout** — CSS Grid `dense` packing with computed row-spans per card aspect ratio, eliminating dead space in the game library grid
- [x] **Virtualized game library** — JS dense packing algorithm + viewport culling for large collections (>100 games). Reduces DOM nodes from 1200+ to ~20-40, with RAF-throttled scroll tracking. Lists <=100 items keep CSS Grid + FLIP animation.
- [x] **SharedArrayBuffer for frame transfer** — Double-buffered video SAB + SPSC audio ring buffer for zero-copy transfer between utility process and renderer via MessagePort bridge. Falls back to IPC if SAB unavailable. — [#62](https://github.com/ryanmagoon/gamelord/issues/62)
- [ ] **Lock-free audio buffer** — Replace `std::mutex`-guarded audio buffer in native addon with a lock-free SPSC ring buffer — [#63](https://github.com/ryanmagoon/gamelord/issues/63)
- [ ] **Native audio sample conversion** — Move Int16 → Float32 stereo deinterleaving from JavaScript (`GameWindow.tsx`) into the native addon so frames arrive renderer-ready, eliminating ~42K JS loop iterations/sec — [#64](https://github.com/ryanmagoon/gamelord/issues/64)
- [ ] **Audio resampling** — Handle cases where core sample rate differs from `AudioContext.sampleRate` — [#65](https://github.com/ryanmagoon/gamelord/issues/65)
- [ ] **Frame skipping / frame pacing** — Catch-up mechanism when rendering lags; handle display refresh != core FPS — [#66](https://github.com/ryanmagoon/gamelord/issues/66)

### P3 — Multi-System Support

**Vision:** Support every system that libretro supports. The architecture is system-agnostic — adding a new system is just a config entry (system definition in `library.ts`, core mapping in `CoreDownloader.ts`). The goal is comprehensive coverage of retro and modern-retro platforms: PS2, GameCube, Wii, Dreamcast, Saturn, 3DO, CDi, Atari (2600/7800/Jaguar/Lynx), TurboGrafx-16, Neo Geo, WonderSwan, Virtual Boy, and anything else with a working ARM64 macOS libretro core.

- [x] Install and test additional cores — 11 systems supported (NES, SNES, Genesis, GB/GBC, GBA, N64, PS1, PSP, NDS, Arcade) with auto-download from libretro buildbot and multiple core options per system — [#67](https://github.com/ryanmagoon/gamelord/issues/67)
- [x] Update ROM scanner to detect multiple system types — extension-based detection across all systems with folder-name autodetection — [#67](https://github.com/ryanmagoon/gamelord/issues/67)
- [x] **Sega Saturn support** — System definition (`.cue`, `.chd`, `.ccd`, `.mdf`), core mapping (Beetle Saturn / Yabause), ScreenScraper integration (system ID 22), platform icon, CRT display type. Requires BIOS files in system directory.
- [ ] Add system badges/icons to library UI (PlatformIcon component exists but not integrated into game cards) — [#67](https://github.com/ryanmagoon/gamelord/issues/67)
- [ ] Remove C++ singleton constraint (`LibretroCore::s_instance`) to allow multiple core instances — [#68](https://github.com/ryanmagoon/gamelord/issues/68)
- [ ] **Expand system definitions to all viable libretro cores** — Audit the ARM64 macOS libretro buildbot for available cores, add system definitions and core mappings for every system with a working core (PS2/PCSX2, GameCube+Wii/Dolphin, Dreamcast/Flycast, Saturn/Beetle Saturn, 3DO/Opera, TurboGrafx-16/Beetle PCE, Neo Geo/FBNeo, Atari 2600/Stella, Atari 7800/ProSystem, Atari Lynx/Handy, WonderSwan/Beetle WonderSwan, Virtual Boy/Beetle VB, etc.), and verify each core loads and runs a test ROM — [#116](https://github.com/ryanmagoon/gamelord/issues/116)

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
- [ ] Recently played tracking — [#69](https://github.com/ryanmagoon/gamelord/issues/69)
- [ ] **Rating display** — Show ScreenScraper community rating on cards or in a detail view. Already stored as `metadata.rating` (0–1 scale). Consider a 5-star or 10-point visual treatment. — [#70](https://github.com/ryanmagoon/gamelord/issues/70)
- [ ] **Game detail view (Wikipedia-style)** — A rich, enthusiast-oriented detail page for each game, inspired by Wikipedia articles. Covers history, developer background, release timeline, platform ports, reception, and trivia — not just a metadata card. Includes cover art, screenshots, genre/player count/rating, and any ScreenScraper metadata we have, but the feel should be editorial and informational, like reading a game's encyclopedia entry. Triggered by clicking a game card (the card itself transitions/expands into the detail view). A minimalist play button on the card (or within the detail view) launches the game. This replaces the current "click card to launch" behavior — cards become the entry point to the detail view, not the emulator. — [#71](https://github.com/ryanmagoon/gamelord/issues/71)
- [ ] **Card → detail view transition** — When a game card is clicked, it expands/morphs into the full detail view (FLIP-style or shared-element transition). The play button moves to the detail view (or stays as a small overlay on the card). This is the interaction change that decouples "click card" from "launch game." — [#72](https://github.com/ryanmagoon/gamelord/issues/72)
- [ ] **Filter by genre** — Genre is already stored per-game from ScreenScraper. Add a genre filter dropdown alongside the existing platform filter. — [#73](https://github.com/ryanmagoon/gamelord/issues/73)
- [ ] **Filter by player count** — Filter to show only single-player, multiplayer, or N+ player games using `metadata.players`. — [#74](https://github.com/ryanmagoon/gamelord/issues/74)
- [ ] **Filter by decade/era** — Group games by release decade (80s, 90s, 2000s) using `metadata.releaseDate`. — [#75](https://github.com/ryanmagoon/gamelord/issues/75)
- [ ] **Sort by rating** — Add rating as a sort option in the library toolbar. — [#76](https://github.com/ryanmagoon/gamelord/issues/76)
- [x] **Favorites** — Heart toggle on game cards (filled when favorited, visible on hover otherwise, pop animation on toggle). Favorites filter button in toolbar. Toggle also available in card dropdown menu. Persisted via `library:updateGame` IPC. — [#77](https://github.com/ryanmagoon/gamelord/issues/77)
- [ ] **Play count & stats** — Track number of play sessions (not just total time). Show "most played" sorting and a stats view with play history over time. — [#78](https://github.com/ryanmagoon/gamelord/issues/78)
- [ ] **Completion status** — Let users tag games as "Not Started", "In Progress", "Completed", or "Abandoned". Filterable. — [#79](https://github.com/ryanmagoon/gamelord/issues/79)
- [ ] **Collections / tags** — User-created collections (e.g. "Couch Co-op", "RPG Marathon", "Childhood Favorites") for organizing games beyond system/genre. — [#80](https://github.com/ryanmagoon/gamelord/issues/80)
- [ ] **AI-enriched game detail views** — LLM-generated editorial content: developer history, trivia, cultural impact, related games, "if you liked this, try..." Supplements ScreenScraper metadata. Cached in PostgreSQL. — [#55](https://github.com/ryanmagoon/gamelord/issues/55)
- [ ] **Natural language game search** — "show me co-op SNES platformers from the 90s" using embeddings + pgvector + retrieval/reranking. Hybrid structured + semantic search. — [#56](https://github.com/ryanmagoon/gamelord/issues/56)
- [ ] **AI game recommendations from play history** — content-based + collaborative filtering + LLM-powered personalized recommendations with explanations. — [#57](https://github.com/ryanmagoon/gamelord/issues/57)
- [ ] **Evaluation pipeline** — measure search relevance (precision@K, NDCG), metadata accuracy, hallucination rate. Golden dataset, LLM-as-judge, CI integration. — [#58](https://github.com/ryanmagoon/gamelord/issues/58)

### P5 — Controls & Input

- [ ] Controller configuration UI with 3D interactive controller model — [#81](https://github.com/ryanmagoon/gamelord/issues/81)
  - [ ] Three.js rendering of a realistic controller model that the user can rotate/inspect
  - [ ] Highlight each button on the 3D model as it becomes the active assignment target
  - [ ] Click-to-assign flow: highlighted button pulses/glows, user presses physical input to bind it
  - [ ] Support for multiple controller types (Xbox, PlayStation, generic) with matching 3D models
- [x] Gamepad API support in renderer — detect connected controllers, read input state
- [ ] Per-game input mappings — override default bindings on a per-game or per-system basis — [#82](https://github.com/ryanmagoon/gamelord/issues/82)

### P6 — Rewind

- [ ] Implement frame-state ring buffer — capture serialized save states every N frames — [#83](https://github.com/ryanmagoon/gamelord/issues/83)
- [ ] Hold-to-rewind input binding (rewind button replays buffered states in reverse) — [#83](https://github.com/ryanmagoon/gamelord/issues/83)
- [ ] Configurable rewind buffer duration and granularity — [#83](https://github.com/ryanmagoon/gamelord/issues/83)
- [ ] Visual rewind indicator in the game window overlay — [#83](https://github.com/ryanmagoon/gamelord/issues/83)

### P7 — Online Multiplayer

- [ ] **Relay server for input synchronization** — persistent WebSocket connections on Fly.io/Railway (not serverless). Binary protocol for input frames, room-based routing, sub-5ms relay latency target. — [#50](https://github.com/ryanmagoon/gamelord/issues/50)
- [ ] **Rollback-based netcode** — latency hiding via save state serialization: roll back to last confirmed state, replay with correct inputs, snap forward. State ring buffer, input history buffer, configurable rollback window (~7 frames / 117ms). — [#51](https://github.com/ryanmagoon/gamelord/issues/51)
- [ ] **Lobby system with room codes** — session management, matchmaking, friend lists + invites. Short room codes for sharing, public lobby browser, room settings (game, core, input delay, max players). — [#52](https://github.com/ryanmagoon/gamelord/issues/52)
- [ ] **Cloud save sync with conflict resolution** — extend cloud saves API with last-write-wins vs version vectors vs vector clocks. Server-side conflict detection, client-side resolution UI. — [#53](https://github.com/ryanmagoon/gamelord/issues/53)
- [ ] **Friends + activity feed** — fan-out problem, presence detection (WebSocket heartbeat → online/in-game status), real-time activity timeline. Hybrid fan-out strategy, Redis for ephemeral presence. — [#54](https://github.com/ryanmagoon/gamelord/issues/54)
- [ ] Per-game netplay compatibility metadata (supported cores, input latency settings) — [#84](https://github.com/ryanmagoon/gamelord/issues/84)

### RetroAchievements

- [ ] MD5-based ROM identification (shares hash infrastructure with artwork service) — [#85](https://github.com/ryanmagoon/gamelord/issues/85)
- [ ] RetroAchievements API integration — authenticate, fetch achievement lists per game — [#85](https://github.com/ryanmagoon/gamelord/issues/85)
- [ ] Achievement unlocking via rcheevos runtime (memory inspection each frame) — [#85](https://github.com/ryanmagoon/gamelord/issues/85)
- [ ] Achievement unlock notifications in game window overlay — [#85](https://github.com/ryanmagoon/gamelord/issues/85)
- [ ] Per-game achievement list and progress tracking in library UI — [#85](https://github.com/ryanmagoon/gamelord/issues/85)
- [ ] Hardcore mode support (disable save states/rewind when active) — [#85](https://github.com/ryanmagoon/gamelord/issues/85)

### Developer Tools

- [ ] Toggleable debug overlay for the game window (keyboard shortcut or settings toggle) — [#86](https://github.com/ryanmagoon/gamelord/issues/86)
  - [ ] Input state: show which buttons/axes are active in real time (gamepad and keyboard)
  - [ ] Emulation stats: FPS, frame time, audio buffer health, dropped frames
  - [ ] IPC monitor: visualize game:input, game:video-frame, game:audio-samples throughput
  - [ ] Gamepad inspector: connected controllers, mapping type, raw button/axis values
  - [ ] Mode/state readout: current mode, paused state, active core, ROM info
- [ ] Persist debug overlay preferences in localStorage — [#86](https://github.com/ryanmagoon/gamelord/issues/86)

### P8 — UI Polish

- [ ] **TV static animation hitches during artwork sync** ([#23](https://github.com/ryanmagoon/gamelord/issues/23)) — When artwork syncs for any card (download, error, or not-found), all other cards' TV static animations freeze momentarily. React-level optimizations already applied: stable style refs for React.memo (`useFlipAnimation`), shared `TVStaticManager` singleton (one rAF loop instead of 50+), per-game `UiGame` object cache, and `ArtworkSyncStore` backed by `useSyncExternalStore` to bypass parent re-renders. Hitches persist — likely caused by browser-level bottleneck: canvas `putImageData` cost across 50+ canvases, forced reflow during `useAspectRatioTransition` height changes, or image decode blocking the main thread. Next steps: profile with Chrome DevTools Performance panel to identify the exact frame-time spike, consider `OffscreenCanvas` in a Web Worker for noise generation, investigate batching `putImageData` calls with `requestIdleCallback`, and test whether pausing static on off-screen cards via `IntersectionObserver` eliminates the jank.
- [ ] **Artwork load animation polish** — The `useAspectRatioTransition` hook and dissolve-in animation exist but the card resize isn't visibly smooth when artwork arrives. Debug and polish: coordinate the art dissolve-in with the card height transition so they feel like one fluid motion, test with both portrait and landscape art, and ensure cards already loaded with art skip the animation entirely. — [#87](https://github.com/ryanmagoon/gamelord/issues/87)
- [ ] **Error modal for blocking sync failures** — Swap the banner notification for a modal dialog when artwork sync hits a blocking error (missing dev env vars, invalid credentials, etc.). Banners are fine for success summaries and non-critical warnings, but "sync can't work at all" errors should be modal so the user has to acknowledge them. The banner currently flashes by too quickly and doesn't feel appropriate for serious configuration problems. Also audit the UI for any other jarring state changes that happen when the sync loop terminates early (e.g. all cards briefly pulsing then snapping back). — [#88](https://github.com/ryanmagoon/gamelord/issues/88)
- [ ] Replace native OS dialogs with custom in-app dialogs (e.g. autosave resume prompt, file pickers) — [#89](https://github.com/ryanmagoon/gamelord/issues/89)
- [x] Shader/filter selection (CRT, CRT Aperture, Scanlines, LCD, Sharp Bilinear via WebGL2)
- [ ] Explore loading Slang (.slang/.slangp) shaders from the libretro shader ecosystem — [#90](https://github.com/ryanmagoon/gamelord/issues/90)
- [ ] Persist shader choice per core (e.g. CRT for SNES/snes9x, Sharp Bilinear for GBA/mgba) — [#91](https://github.com/ryanmagoon/gamelord/issues/91)
- [x] Dark mode (default) with light/dark toggle and localStorage persistence
- [x] **Vibes theming system + Unc Mode 👴** — CSS-first vibes system that transforms the library UI's aesthetic via `data-vibe` attribute on `<html>`. Flagship vibe "Unc Mode" includes pointer-tracking blurred glow on game cards, CRT phosphor color palette, scanlines, chromatic aberration, VHS tracking artifacts on hover, and background static noise. Vibe selector in titlebar coordinates with light/dark toggle (dark-only vibes auto-switch). — [#120](https://github.com/ryanmagoon/gamelord/issues/120)
  - [ ] **Additional vibes** — Vapor Mode (vaporwave aesthetic), Arcade Mode (neon cabinet), etc.
  - [ ] **Per-vibe game window effects** — Extend vibes to the game window overlay UI (pause screen, controls)
- [ ] **VHS-style pause screen** — Replace the minimal pause badge with a nostalgic VHS aesthetic: large "PAUSE" text in the corner (VCR-style monospace font, blue/white), horizontal beam warping/tracking distortion across the screen, subtle static crackle noise overlay, and scanline drift. Should feel like pausing a VHS tape in the '90s. Only applies to CRT-display-type systems; LCD systems keep a clean digital pause indicator. — [#92](https://github.com/ryanmagoon/gamelord/issues/92)
- [ ] **VHS fast-forward/rewind effects** — When fast-forwarding, overlay VHS-style visual artifacts: horizontal tracking lines racing up the screen, intermittent color bleeding, jittery frame displacement, and a "▶▶" / "◀◀" VCR indicator in the corner with the speed multiplier (e.g. "▶▶ 4x"). Accompanied by the classic VHS fast-forward audio effect — a pitched-up, warbling whir sound that scales with the speed multiplier. Rewind gets the reverse treatment ("◀◀") with the distinctive tape-shuttle screech. Same CRT-only scope as the VHS pause screen; LCD systems get a clean digital speed indicator instead. Effects run as a WebGL overlay pass (exempt from perf rules since they replace the muted audio gap during fast-forward, and rewind already pauses normal playback). Sound effects via Web Audio oscillator + noise generator, no bundled audio files. — [#107](https://github.com/ryanmagoon/gamelord/issues/107)
- [ ] **Native screenshot encoding** — Encode screenshots as PNG/JPEG in the native addon (e.g. via `stb_image_write`) instead of saving raw RGBA, reducing file size and avoiding JS-side encoding overhead — [#93](https://github.com/ryanmagoon/gamelord/issues/93)
- [ ] Screenshot gallery per game — [#94](https://github.com/ryanmagoon/gamelord/issues/94)
- [ ] Playtime tracking and statistics — [#95](https://github.com/ryanmagoon/gamelord/issues/95)
- [ ] Settings panel — [#96](https://github.com/ryanmagoon/gamelord/issues/96)
- [ ] **Graphics quality setting** — A simple quality preference (e.g. "Quality" / "Performance") that controls shader complexity and cosmetic effects. "Performance" disables multi-pass CRT shaders (falls back to single-pass or nearest), simplifies the VHS pause screen, and strips heavy overlays. Lets users on lower-end hardware or high-refresh displays trade eye candy for consistent frame pacing. — [#97](https://github.com/ryanmagoon/gamelord/issues/97)

### P9 — Packaging & Distribution

- [ ] Bundle libretro cores with the app — [#98](https://github.com/ryanmagoon/gamelord/issues/98)
- [ ] **DMG packaging + auto-updates** — electron-builder DMG with code signing, notarization, custom background. Auto-updates via electron-updater + GitHub Releases. — [#59](https://github.com/ryanmagoon/gamelord/issues/59)
- [ ] **Cross-platform support (Windows & Linux)** — Abstract `dlopen` → `LoadLibrary` for Windows, platform-detect core/config paths, download cores from correct buildbot URL per OS, electron-builder configs for NSIS/MSI (Windows) and AppImage/deb (Linux), CI matrix for all three platforms. The emulation pipeline is already OS-agnostic; the work is in native addon portability, path conventions, and packaging. — [#118](https://github.com/ryanmagoon/gamelord/issues/118)

### P10 — Web Presence (Vercel)

- [ ] **gamelord.app landing page** — Next.js on Vercel. Hero, feature showcase, screenshot gallery, download links, changelog. Dark theme matching app aesthetic. — [#60](https://github.com/ryanmagoon/gamelord/issues/60)
- [ ] Documentation site (`docs.gamelord.app`) — Next.js + MDX or Astro — [#99](https://github.com/ryanmagoon/gamelord/issues/99)
- [ ] **Cloud saves API** — serverless functions + blob storage for save state sync. REST endpoints: upload/download/list/delete saves. Signed upload URLs, gzip compression. — [#46](https://github.com/ryanmagoon/gamelord/issues/46)
- [ ] **User accounts + auth** — OAuth via GitHub/Discord. Deep link callback to Electron app. Session persistence via OS keychain. — [#47](https://github.com/ryanmagoon/gamelord/issues/47)
- [ ] **User profile dashboard** — achievements, play history, library stats. Public/private toggle. Activity feed. — [#48](https://github.com/ryanmagoon/gamelord/issues/48)
- [ ] **PostgreSQL for user data and game metadata** — hosted Postgres (Neon/Supabase/Railway), Drizzle or Prisma migrations, connection pooling, pgvector extension for AI search. — [#49](https://github.com/ryanmagoon/gamelord/issues/49)
- [ ] Multiplayer lobby/matchmaking API — pairs with P7 relay server (#50) (relay itself should NOT be on Vercel — needs persistent WebSocket connections, use Fly.io/Railway/VPS) — [#100](https://github.com/ryanmagoon/gamelord/issues/100)

### P11 — Native Addon Hardening

- [ ] **Replace dynamic `require()` with proper native addon loading** — [#10](https://github.com/ryanmagoon/gamelord/issues/10)
- [ ] **Enable C++ exceptions or remove STL** — `NAPI_DISABLE_CPP_EXCEPTIONS` is set but `std::vector` can throw on allocation failure; either enable exceptions or use pre-allocated fixed buffers — [#101](https://github.com/ryanmagoon/gamelord/issues/101)
- [ ] **Cross-platform path handling** — Abstract macOS-specific paths (e.g. `/Applications/RetroArch.app/...` in `EmulatorManager.ts`) behind platform detection — [#102](https://github.com/ryanmagoon/gamelord/issues/102)
- [ ] **Pin dependency versions** — Replace `^` ranges in `package.json` with exact versions to prevent surprise breakages (especially Tailwind CSS v4) — [#103](https://github.com/ryanmagoon/gamelord/issues/103)

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
