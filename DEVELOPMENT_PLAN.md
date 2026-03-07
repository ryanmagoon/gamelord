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
- [x] **Lock-free audio buffer** — Replaced `std::mutex` + `std::vector` audio buffer in native addon with a fixed-size circular ring buffer (16384 samples, power-of-2). Eliminated mutex overhead (uncontended but still ~syscall cost per lock/unlock), O(n) vector erase on overflow, and per-frame vector reallocation. Producer (libretro callbacks) and consumer (`GetAudioBuffer`) run on the same utility-process thread, so no atomics needed — just monotonic read/write counters with modulo arithmetic. Batch callback uses `memcpy` with wraparound handling for optimal throughput. — [#63](https://github.com/ryanmagoon/gamelord/issues/63)
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
- [ ] **Fuzzy library search** — Replace exact substring matching with fuzzy search (tolerance for typos, partial matches, abbreviations). Searching "zelda" should match "The Legend of Zelda: A Link to the Past." Evaluate lightweight options (Fuse.js or similar) with TypeScript support and zero transitive deps.
- [x] **Scan-time zip extraction** — Library scanner extracts ROMs from `.zip` archives at scan time for all non-arcade systems. Extracted ROMs cached in `<userData>/roms-cache/` with hash-prefixed filenames. Arcade `.zip` files are passed through natively (MAME expects zips). Cache cleaned up on game removal.
- [ ] **Artwork sync performance** — Current implementation downloads full-resolution images serially with a new TCP connection per request, taking several seconds per game. Improvements ordered by impact:
  - [ ] Request smaller images via `maxwidth`/`maxheight` params (2–3x faster downloads) — [#37](https://github.com/ryanmagoon/gamelord/issues/37)
  - [ ] Persistent HTTP Agent with keep-alive (~15% faster) — [#38](https://github.com/ryanmagoon/gamelord/issues/38)
  - [ ] Pipeline image downloads with next API query (~30–40% faster) — [#39](https://github.com/ryanmagoon/gamelord/issues/39)
  - [ ] Pre-hash all ROMs in parallel before sync — [#40](https://github.com/ryanmagoon/gamelord/issues/40)
  - [ ] Progressive artwork loading UX (show art as each game resolves) — [#41](https://github.com/ryanmagoon/gamelord/issues/41)
  - [ ] Multi-threaded ScreenScraper access for Patreon-tier users (up to 5x throughput) — [#42](https://github.com/ryanmagoon/gamelord/issues/42)
  - [ ] **Metadata-only resync** — Smart resync mode that re-queries the API for games missing specific fields (e.g., `region` for regional system names) without re-downloading artwork. Skips games that already have complete metadata. Useful for backfilling new metadata fields added in later versions.
- [ ] **SteamGridDB fallback artwork** — When ScreenScraper returns no artwork for a game (homebrew, romhacks, obscure titles), fall back to SteamGridDB as a secondary source. Auto-search by game title with manual override. Requires a free API key from steamgriddb.com.
- [ ] Recently played tracking — [#69](https://github.com/ryanmagoon/gamelord/issues/69)
- [ ] **Rating display** — Show ScreenScraper community rating on cards or in a detail view. Already stored as `metadata.rating` (0–1 scale). Consider a 5-star or 10-point visual treatment. — [#70](https://github.com/ryanmagoon/gamelord/issues/70)
- [ ] **How Long To Beat integration** — Show estimated completion times (main story, completionist, etc.) on game detail views. Helps users decide what to play based on time commitment. Fetch data from HLTB by game title, cache results locally.
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

**Controller support is first-class.** The entire app — library browsing, game launching, in-game menus, settings — must be fully operable with a controller and zero mouse/keyboard. The experience should feel like a console home screen: spatial navigation, contextual button prompts, and no dead ends. This is not an afterthought bolted onto a mouse UI; controller navigation should feel native and intentional.

#### In-Game Controller UI

- [ ] **Home button → game overlay** — Pressing the controller home/guide button during gameplay opens a radial or panel overlay (pause, save state, load state, screenshot, quit to library, settings). Navigable entirely with D-pad + A/B. Dismissing resumes gameplay. Must not conflict with OS-level home button behavior (intercept at the Gamepad API level, or use a configurable alternative like holding Select+Start). — [#140](https://github.com/ryanmagoon/gamelord/issues/140)
- [ ] **Controller-navigable pause menu** — When paused (via home button or Start), all pause menu options (resume, save, load, reset, quit) are focusable and selectable with controller. No mouse required. — [#140](https://github.com/ryanmagoon/gamelord/issues/140)
- [ ] **On-screen button prompts** — Show controller-appropriate glyphs (Xbox ABXY, PlayStation ×○□△, or generic) in all overlays and menus. Auto-detect controller type from Gamepad API `id` string. Prompts swap dynamically when switching between controller and keyboard. — [#140](https://github.com/ryanmagoon/gamelord/issues/140)

#### Library / Console Mode

- [ ] **Focus-based UI navigation** — Every interactive element in the library (game cards, toolbar buttons, filters, dropdowns, settings) is reachable via D-pad/analog stick. Spatial navigation algorithm (move focus to nearest element in the pressed direction). Tab-order fallback for linear lists. — [#140](https://github.com/ryanmagoon/gamelord/issues/140)
- [ ] **Controller input mapping for UI** — A = select/launch, B = back/close, Start = open menu, bumpers = switch tabs/pages, triggers = scroll fast, analog stick = smooth scroll. Consistent across all screens. — [#140](https://github.com/ryanmagoon/gamelord/issues/140)
- [ ] **Visible focus indicator** — A prominent, animated focus ring (glow, scale-up, or border highlight) that tracks the currently focused element. Must be visually distinct from mouse hover. Styled to feel console-native — not a browser focus outline. — [#140](https://github.com/ryanmagoon/gamelord/issues/140)
- [ ] **Console Mode layout** — Optional fullscreen UI optimized for TV/controller: larger cards, bigger text, simplified toolbar, no hover-dependent interactions. Auto-activates when a controller is the only input (no recent mouse/keyboard activity), or toggled manually from settings. Exit by pressing Escape or clicking with mouse. — [#140](https://github.com/ryanmagoon/gamelord/issues/140)
- [ ] **Input-adaptive UI (no modality)** — Mouse and controller work simultaneously at all times — no "mode switch" or locked-out input. Track last input device to control visual affordances only: controller input shows the focus ring and button prompts, mouse movement fades them out. Spatial navigation always listens for D-pad/stick regardless of whether the focus ring is visible (pressing D-pad simply makes it appear). Clicking with a mouse works even while the focus ring is showing. No state machine, no toggle — just conditional visibility of controller-oriented UI chrome. — [#140](https://github.com/ryanmagoon/gamelord/issues/140)
- [ ] **Controller-navigable settings** — Settings panel, shader picker, filter dropdowns, and all modal dialogs are fully navigable with controller. No dead ends where controller input stops working. — [#140](https://github.com/ryanmagoon/gamelord/issues/140)

#### Configuration

- [ ] Controller configuration UI with 3D interactive controller model — [#81](https://github.com/ryanmagoon/gamelord/issues/81)
  - [ ] Three.js rendering of a realistic controller model that the user can rotate/inspect
  - [ ] Highlight each button on the 3D model as it becomes the active assignment target
  - [ ] Click-to-assign flow: highlighted button pulses/glows, user presses physical input to bind it
  - [ ] Support for multiple controller types (Xbox, PlayStation, generic) with matching 3D models
- [x] Gamepad API support in renderer — detect connected controllers, read input state
- [ ] Per-game input mappings — override default bindings on a per-game or per-system basis — [#82](https://github.com/ryanmagoon/gamelord/issues/82)
- [ ] **Remap UI navigation buttons** — Let users customize which controller buttons map to UI actions (select, back, menu, etc.) separately from in-game bindings. — [#140](https://github.com/ryanmagoon/gamelord/issues/140)

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

### Integration & Extensibility

- [ ] **`gamelord://` deep link protocol** — Register a custom URL protocol handler (`app.setAsDefaultProtocolClient`) so games can be launched from external tools (Spotlight, Alfred, Raycast, Stream Deck, shell scripts). Format: `gamelord://launch/<gameId>`. Also supports `gamelord://library` to open the library window.
- [ ] **Discord Rich Presence** — Show the currently playing game, system, and elapsed time in the user's Discord status (e.g. "Playing Super Metroid (SNES)"). Toggle in settings. Uses Discord's local IPC socket — no network requests, no Discord SDK dependency needed (lightweight RPC client).
- [ ] **Before/after launch scripts** — Let users configure shell commands to run before game launch and after game exit. Per-game or global. Use cases: switch audio output, dim smart lights, post to a Discord webhook, back up saves, toggle system settings.

### Telemetry & Analytics

- [ ] **PostHog product analytics** — Integrate `posthog-js` in the renderer for product analytics, feature flags, and A/B testing. Track which games/systems get played, feature usage, funnel analysis. Session replay for UX understanding (distinct from Sentry's error-context replay). Free tier: 1M events, 5K replays, 1M feature flag requests. Note: no offline event queuing (open issue) — events captured while offline are lost. No main-process instrumentation. Use the PostHog-Sentry connector to link errors to user profiles.
- [ ] **Vercel Analytics for web properties** — Enable Vercel Analytics and Speed Insights on gamelord.app and docs site once deployed. Privacy-friendly (no cookies), Core Web Vitals tracking, per-deployment performance. Not applicable to the Electron app — only Vercel-deployed web properties.

### Alpha Release Milestone — [#143](https://github.com/ryanmagoon/gamelord/issues/143)

Tracking issue for the first alpha release. All items below must be completed before shipping.

- [x] **Error resilience** — Emulation crash modal in GameWindow, React ErrorBoundary for both windows, BIOS pre-launch validation (Saturn/PS1), IPC launch errors shown as AlertDialogs instead of alert(). — PR [#163](https://github.com/ryanmagoon/gamelord/pull/163), closes [#161](https://github.com/ryanmagoon/gamelord/issues/161)
- [x] **Core download retry** — Error banner persists on failure with Retry + Dismiss buttons; red styling distinguishes errors from progress
- [ ] **Graceful app startup** — [#125](https://github.com/ryanmagoon/gamelord/issues/125)
- [x] **Custom app menu** — GameLord (About, Preferences Cmd+,, Quit), File (Scan Library, Add ROM Folder), Edit, View, Window, Help (Report Issue, Documentation). Menu events wired to renderer via IPC. Preferences stubs to console.log until settings panel is built (#96). — [#162](https://github.com/ryanmagoon/gamelord/issues/162)
- [ ] **Library UI redesign — shelf-based home view** — Replace the dashboard layout with a shelf-based layout: hero section, horizontal scroll rows grouped by category (Recently Played, Favorites, per-platform), Cmd+K command palette, no persistent chrome. Existing mosaic grid becomes the "browse all" sub-view. — [#141](https://github.com/ryanmagoon/gamelord/issues/141) (deferred to alpha.2)
- [ ] **Cmd+K command palette** — Fuzzy search overlay for games, platforms, and actions. Replaces inline search toolbar. — [#142](https://github.com/ryanmagoon/gamelord/issues/142)
- [x] **Settings panel** — Modal dialog with sidebar tabs (General, Emulation, Library, About). Toolbar gear button + Cmd+, shortcut. Theme, SFX, shader, FPS counter, fast-forward speed, ROM directories, ScreenScraper credentials, about/credits. — [#96](https://github.com/ryanmagoon/gamelord/issues/96)
- [x] **Bundled homebrew ROMs** — Ships 3 permissively-licensed NES homebrew ROMs (Lawn Mower CC0, NESert Golfing CC BY 4.0, 8-Bit Table Tennis MIT). HomebrewService auto-imports to user's ROM directory on first launch when library is empty, with metadata enrichment. Marker file prevents re-import. — [#139](https://github.com/ryanmagoon/gamelord/issues/139)
- [ ] **DMG packaging** — Unsigned DMG via electron-builder, CI release workflow on tagged pushes — [#59](https://github.com/ryanmagoon/gamelord/issues/59)
- [ ] **Sentry crash & error reporting** — Integrate `@sentry/electron` for crash reporting before alpha ship. Captures JS exceptions in both main and renderer processes, native crashes (Minidumps) from the main process (critical for native addon segfaults), offline event queuing, source map uploads. Session Replay for error-context reproduction. Free tier: 5K errors/month.

### P8 — UI Polish

- [x] **Synthesized UI sound effects** — Web Audio API-based SFX system with 17 retro/8-bit sounds generated programmatically (no bundled files). Covers button clicks, toggles, save/load state, pause/resume, power on/off, dialogs, screenshot, favorites, sync notifications, fast forward, and game launch. Separate AudioContext from emulation audio with independent volume control. SFX toggle and volume slider in game window settings. Preferences persisted to localStorage.
- [ ] **TV static animation hitches during artwork sync** ([#23](https://github.com/ryanmagoon/gamelord/issues/23)) — When artwork syncs for any card (download, error, or not-found), all other cards' TV static animations freeze momentarily. React-level optimizations already applied: stable style refs for React.memo (`useFlipAnimation`), shared `TVStaticManager` singleton (one rAF loop instead of 50+), per-game `UiGame` object cache, and `ArtworkSyncStore` backed by `useSyncExternalStore` to bypass parent re-renders. Hitches persist — likely caused by browser-level bottleneck: canvas `putImageData` cost across 50+ canvases, forced reflow during `useAspectRatioTransition` height changes, or image decode blocking the main thread. Next steps: profile with Chrome DevTools Performance panel to identify the exact frame-time spike, consider `OffscreenCanvas` in a Web Worker for noise generation, investigate batching `putImageData` calls with `requestIdleCallback`, and test whether pausing static on off-screen cards via `IntersectionObserver` eliminates the jank.
- [ ] **Artwork load animation polish** — The `useAspectRatioTransition` hook and dissolve-in animation exist but the card resize isn't visibly smooth when artwork arrives. Debug and polish: coordinate the art dissolve-in with the card height transition so they feel like one fluid motion, test with both portrait and landscape art, and ensure cards already loaded with art skip the animation entirely. — [#87](https://github.com/ryanmagoon/gamelord/issues/87)
- [ ] **Error modal for blocking sync failures** — Swap the banner notification for a modal dialog when artwork sync hits a blocking error (missing dev env vars, invalid credentials, etc.). Banners are fine for success summaries and non-critical warnings, but "sync can't work at all" errors should be modal so the user has to acknowledge them. The banner currently flashes by too quickly and doesn't feel appropriate for serious configuration problems. Also audit the UI for any other jarring state changes that happen when the sync loop terminates early (e.g. all cards briefly pulsing then snapping back). — [#88](https://github.com/ryanmagoon/gamelord/issues/88)
- [ ] Replace native OS dialogs with custom in-app dialogs (e.g. autosave resume prompt, file pickers) — [#89](https://github.com/ryanmagoon/gamelord/issues/89)
- [x] Shader/filter selection (CRT, CRT Aperture, Scanlines, LCD, Sharp Bilinear via WebGL2)
- [x] **LCD GBA shaders** — Ported `lcd-grid-v2-gba-color.slangp` and `lcd-grid-v2-gba-color-motionblur.slangp` from libretro slang-shaders. Two new presets: "LCD GBA" (subpixel grid + GBA color matrix) and "LCD GBA + Motion Blur" (adds LCD response-time ghosting).
- [ ] Explore loading Slang (.slang/.slangp) shaders from the libretro shader ecosystem — [#90](https://github.com/ryanmagoon/gamelord/issues/90)
- [ ] Persist shader choice per core (e.g. CRT for SNES/snes9x, Sharp Bilinear for GBA/mgba) — [#91](https://github.com/ryanmagoon/gamelord/issues/91)
- [x] Dark mode (default) with light/dark toggle and localStorage persistence
- [x] **System theme support** — Three-state theme: system (default) / dark / light. Follows `prefers-color-scheme` when set to system, with live updates on OS theme change. Existing user preferences preserved.
- [ ] **VHS-style pause screen** — Replace the minimal pause badge with a nostalgic VHS aesthetic: large "PAUSE" text in the corner (VCR-style monospace font, blue/white), horizontal beam warping/tracking distortion across the screen, subtle static crackle noise overlay, and scanline drift. Should feel like pausing a VHS tape in the '90s. Only applies to CRT-display-type systems; LCD systems keep a clean digital pause indicator. — [#92](https://github.com/ryanmagoon/gamelord/issues/92)
- [x] **Fast-forward audio toggle** — Configurable option in Settings > Emulation to play game audio at accelerated speed during fast-forward (default: off). Persisted to localStorage, sent to the emulation worker via IPC.
- [ ] **VHS fast-forward/rewind effects** — When fast-forwarding, overlay VHS-style visual artifacts: horizontal tracking lines racing up the screen, intermittent color bleeding, jittery frame displacement, and a "▶▶" / "◀◀" VCR indicator in the corner with the speed multiplier (e.g. "▶▶ 4x"). Accompanied by the classic VHS fast-forward audio effect — a pitched-up, warbling whir sound that scales with the speed multiplier. Rewind gets the reverse treatment ("◀◀") with the distinctive tape-shuttle screech. Same CRT-only scope as the VHS pause screen; LCD systems get a clean digital speed indicator instead. Effects run as a WebGL overlay pass (exempt from perf rules since they replace the muted audio gap during fast-forward, and rewind already pauses normal playback). Sound effects via Web Audio oscillator + noise generator, no bundled audio files. — [#107](https://github.com/ryanmagoon/gamelord/issues/107)
- [ ] **Retro cozy fast-forward audio effect** — When "audio while fast-forwarding" is enabled, instead of (or in addition to) raw sped-up game audio, synthesize a warm retro ambiance: a soft tape-whir hum (low-frequency oscillator with gentle vibrato), subtle lo-fi crackle/vinyl noise, and a warm low-pass filter over the game audio that makes it sound like it's playing through an old TV speaker on fast-forward. The effect should feel cozy and nostalgic — like rewinding a cassette tape in a warm room — not harsh or clinical. Speed-dependent: higher multipliers increase the whir pitch and crackle density. Implemented via Web Audio API (oscillators + BiquadFilter + noise generator), no bundled files. — [#177](https://github.com/ryanmagoon/gamelord/issues/177)
- [ ] **Native screenshot encoding** — Encode screenshots as PNG/JPEG in the native addon (e.g. via `stb_image_write`) instead of saving raw RGBA, reducing file size and avoiding JS-side encoding overhead — [#93](https://github.com/ryanmagoon/gamelord/issues/93)
- [ ] Screenshot gallery per game — [#94](https://github.com/ryanmagoon/gamelord/issues/94)
- [ ] Playtime tracking and statistics — [#95](https://github.com/ryanmagoon/gamelord/issues/95)
- [x] Settings panel — [#96](https://github.com/ryanmagoon/gamelord/issues/96)
- [ ] **Graphics quality setting** — A simple quality preference (e.g. "Quality" / "Performance") that controls shader complexity and cosmetic effects. "Performance" disables multi-pass CRT shaders (falls back to single-pass or nearest), simplifies the VHS pause screen, and strips heavy overlays. Lets users on lower-end hardware or high-refresh displays trade eye candy for consistent frame pacing. — [#97](https://github.com/ryanmagoon/gamelord/issues/97)
- [ ] **Visual regression testing** — Set up automated screenshot diffing to catch CSS/layout breakages across commits. Evaluate Storybook + Chromatic, Playwright visual comparison, or Percy. Should cover all GameCard states (cover art, fallback static, sync phases, hover, launching) and key layout scenarios (edge cards, grid density). Prompted by the `.game-card-inner` height regression that broke static tiles.
- [ ] **Graceful app startup** — Eliminate the FOUC (flash of unstyled content) on first load. Phase 1: add `show: false` + `ready-to-show` to main BrowserWindow, inline critical CSS in `index.html` (dark background, color-scheme meta), fade `#root` in smoothly once React mounts. Phase 2 (future): branded splash/loading state, staggered UI element cascade, CRT power-on flicker effect on startup. — [#125](https://github.com/ryanmagoon/gamelord/issues/125)

### P9 — Packaging & Distribution

- [ ] Bundle libretro cores with the app — [#98](https://github.com/ryanmagoon/gamelord/issues/98)
- [x] **Bundled homebrew ROMs** — Initial implementation ships 3 NES homebrew ROMs (Lawn Mower, NESert Golfing, 8-Bit Table Tennis) with permissive licenses. Auto-imported via HomebrewService on first launch when library is empty. Future work: expand to additional systems (SNES, GB, GBA, Genesis). — [#139](https://github.com/ryanmagoon/gamelord/issues/139)
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
