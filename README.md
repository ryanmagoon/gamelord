# GameLord

A native emulation frontend for macOS. Loads libretro cores directly via a native Node addon — no external emulator processes, no RetroArch wrapper. Built with Electron, React, TypeScript, and shadcn/ui.

<!-- TODO: Add screenshots/GIFs of library view, game window with CRT shader, save state UI -->

## Features

- **Native libretro integration** — Cores are loaded via `dlopen` in a dedicated utility process with sub-millisecond frame pacing
- **WebGL rendering with CRT shaders** — Scanlines, curvature, bloom, and other retro effects via multi-pass WebGL2 shaders
- **Library management** — Automatic ROM scanning, metadata lookup, and cover art sync
- **Save states** — Multiple slots with autosave on close
- **Multi-disc swap** — Swap discs mid-game for multi-disc PSX titles
- **Cheat support** — RetroArch `.cht` files and DuckStation chtdb database

## Supported Systems

GameLord aims to support any system with a libretro core. Currently implemented:

| System | Cores |
|--------|-------|
| NES | fceumm, nestopia, mesen |
| PlayStation | PCSX ReARMed, Beetle PSX HW, SwanStation |
| Sega Saturn | Beetle Saturn, Yabause |

More cores are being added — the architecture supports any libretro-compatible core.

## Getting Started

### Prerequisites

- macOS 12+
- Node.js 18+
- pnpm 9+
- Xcode Command Line Tools (for the native addon)

### Setup

```bash
git clone https://github.com/ryanmagoon/gamelord.git
cd gamelord
pnpm install

# Build the native addon (required for emulation)
cd apps/desktop/native && npx node-gyp rebuild && cd ../../..

# Start development
pnpm dev
```

### Other Commands

```bash
pnpm test          # Run tests
pnpm lint          # Lint
pnpm typecheck     # Type check
pnpm storybook     # Component browser
```

## Project Structure

This is a Turborepo monorepo:

```
apps/desktop/       Electron app — main process, renderer, native addon
packages/ui/        Shared React components and Storybook stories
```

The native addon lives in `apps/desktop/native/` and implements the libretro frontend API in C++. The emulation loop runs in an Electron utility process with hybrid sleep+spin frame pacing for consistent frame delivery on 120Hz+ displays.

## Core & BIOS Paths

- Cores: `~/Library/Application Support/GameLord/cores/` (`.dylib` files)
- BIOS: `~/Library/Application Support/GameLord/BIOS/` (e.g. `scph5501.bin` for PSX)

## License

[MIT](LICENSE)
