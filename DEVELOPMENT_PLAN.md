# GameLord 7-Day Development Plan

## Overview
Transform GameLord into a native emulator frontend (OpenEmu-style architecture) where Electron handles UI/library management while delegating actual emulation to native emulator processes like RetroArch.

**Your Context:**
- **Time Available:** 3-5 hours/day
- **Approach:** Hybrid - Core features fast, then test coverage
- **Goal:** Get working demo quickly, then build quality

---

## **Day 1: RetroArch + NES** ✅ COMPLETED
**Goal:** Launch Mesen core via RetroArch from Electron with UDP control

### Completed Tasks:
- ✅ Installed RetroArch and enabled network commands
- ✅ Created `EmulatorCore` abstract class for multi-system foundation
- ✅ Implemented `RetroArchCore` class with UDP command interface
- ✅ Built IPC handlers to spawn RetroArch process with ROM
- ✅ Implemented UDP controls (save state, load state, pause, screenshot)
- ✅ Fixed TypeScript compilation errors
- ✅ Successfully built application

**Status:** Infrastructure complete, ready for testing

---

## **Day 2: Custom Game Window with Controls** - 3 hours
**Goal:** Build OpenEmu-style custom game window with integrated controls

### Tasks:
- [ ] Create `GameWindowManager` class to manage game windows
- [ ] Build custom game window BrowserWindow (frameless, custom chrome)
- [ ] Design game control UI overlay (play/pause, save states, screenshots, volume)
- [ ] Implement window positioning to track/manage RetroArch window
- [ ] Add keyboard shortcuts (F5=quick save, F9=quick load, Esc=menu)
- [ ] Wire up control buttons to emulator IPC commands
- [ ] Fix library scanner to populate games automatically
- [ ] Test the complete flow: Library → Custom Window → RetroArch with controls

**Deliverable:** Cohesive game window with your controls + native RetroArch rendering

---

## **Day 3: Save States & Persistence** - 4 hours
**Goal:** Full save state management system

### Tasks:
- [ ] Build save state UI component with slot selection (1-10)
- [ ] Add keyboard shortcuts for quick save/load (F5/F9)
- [ ] Implement automatic save state creation on game exit
- [ ] Build save state metadata tracking (timestamps, screenshots)
- [ ] Test save state reliability across games
- [ ] Write unit tests for EmulatorManager and save state system
- [ ] Add error handling for failed save/load operations

**Deliverable:** Reliable save/load system with metadata

---

## **Day 4: Multi-System Support** - 3 hours
**Goal:** Expand beyond NES

### Tasks:
- [ ] Install additional RetroArch cores:
  - SNES: bsnes or snes9x
  - Genesis: Genesis Plus GX
  - Game Boy: mGBA or Gambatte
- [ ] Update ROM scanner to detect multiple system types
- [ ] Add system badges/icons to library UI
- [ ] Configure RetroArch core mappings in EmulatorManager
- [ ] Test each system (SNES: Super Mario World, Genesis: Sonic, GB: Pokemon)
- [ ] Add core selection UI (if multiple cores available per system)

**Deliverable:** 4+ working systems (NES, SNES, Genesis, GB)

---

## **Day 5: Standalone Emulators** - 4 hours
**Goal:** Add non-RetroArch emulator support

### Tasks:
- [ ] Implement `MesenCore` class for standalone Mesen emulator
- [ ] Research Dolphin CLI options for GameCube/Wii support
- [ ] Build emulator preference system (choose RetroArch vs standalone)
- [ ] Add platform detection and emulator auto-discovery
- [ ] Test switching between RetroArch Mesen and standalone Mesen
- [ ] Write integration tests for multi-emulator support
- [ ] Document how to add new emulator implementations

**Deliverable:** Choice between RetroArch and standalone emulators

---

## **Day 6: Metadata & Library Polish** - 3 hours
**Goal:** Beautiful game library

### Tasks:
- [ ] Integrate TheGamesDB or IGDB API for metadata
- [ ] Implement cover art downloading and caching
- [ ] Add game info display (description, release date, rating)
- [ ] Build/enhance grid view with cover art thumbnails
- [ ] Add search, filter, and sorting functionality
- [ ] Implement recently played tracking
- [ ] Polish library scanning UX with progress indicators

**Deliverable:** Polished library with artwork and metadata

---

## **Day 7: Advanced Features & Testing** - 3.5 hours
**Goal:** Production-ready release

### Tasks:
- [ ] Add controller configuration UI (map physical controllers)
- [ ] Implement screenshot gallery for each game
- [ ] Add playtime tracking and statistics
- [ ] Build shader/filter selection UI for RetroArch
- [ ] Comprehensive testing across all systems
- [ ] Update README with screenshots and usage instructions
- [ ] Package app for distribution (DMG for macOS)
- [ ] Tag and release GameLord v0.2.0

**Deliverable:** GameLord v0.2.0 release

---

## Technical Stack

**Emulation Backend:**
- RetroArch with multiple cores (primary)
- UDP network commands for RetroArch control
- Standalone emulators (Mesen, Dolphin, etc.) as alternatives

**Frontend:**
- Electron 37 + React 19 + TypeScript 5.8
- shadcn/ui components
- child_process for spawning emulators
- node-window-manager for window positioning (optional)

**Architecture:**
- `EmulatorCore` abstract base class
- `RetroArchCore`, `MesenCore`, etc. implementations
- `EmulatorManager` for orchestration
- IPC layer for renderer communication

---

## Key Advantages of This Approach

✅ **Native performance** - 60fps guaranteed, no JavaScript bottlenecks
✅ **Active development** - RetroArch, Mesen, Dolphin are actively maintained
✅ **Latest features** - Get accuracy improvements and new features automatically
✅ **Electron focused** - Just handles UI/library management (its strength)
✅ **Easy expansion** - Add new systems by configuring RetroArch cores
✅ **User choice** - Users can pick preferred emulators per system

---

## Fallback Strategy

If RetroArch proves difficult, pivot to standalone emulators only (Mesen, Dolphin, etc.) with process management. The architecture supports this seamlessly.

---

## Testing Checklist

### Day 1 Testing (Tonight):
- [ ] Download Mesen core via RetroArch GUI
- [ ] Get a test NES ROM (homebrew or legally owned)
- [ ] Run `pnpm dev` to start app
- [ ] Click a game in library to launch
- [ ] Verify RetroArch spawns with game running
- [ ] Test save state (should create .state file)
- [ ] Test load state
- [ ] Test pause/resume via UDP commands
- [ ] Verify app detects when RetroArch closes

---

## Total Time Estimate
~24 hours over 7 days (3-4 hours/day)

**Status:** Day 1 complete! Ready to test emulator launching tonight.

---

## Important Files

```
apps/desktop/src/main/emulator/
├── EmulatorCore.ts           - Abstract base class
├── RetroArchCore.ts          - RetroArch implementation
├── EmulatorManager.ts        - Orchestration layer

apps/desktop/src/main/ipc/
└── handlers.ts               - IPC endpoints for emulator control

apps/desktop/src/preload.ts   - Renderer API exposure
```

## RetroArch Configuration

**Config location:** `~/Library/Application Support/RetroArch/config/retroarch.cfg`
**Required settings:**
```
network_cmd_enable = "true"
network_cmd_port = "55355"
```

**Cores location:** `~/Library/Application Support/RetroArch/cores/`

---

## Next Session Prep

Before Day 2:
1. Open RetroArch
2. Navigate to: Online Updater → Core Downloader
3. Download: "Nintendo - NES / Famicom (Mesen)"
4. Verify core exists at: `~/Library/Application Support/RetroArch/cores/mesen_libretro.dylib`
5. Have a test ROM ready

Then run: `pnpm dev` and start testing!
