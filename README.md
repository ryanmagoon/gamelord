# GameLord

An emulation frontend for macOS built with Electron, React, and TypeScript.

<!-- TODO: Add screenshots/GIFs of library view, game window with CRT shader, save state UI -->

## Features

- **Libretro core support** — Runs cores natively via a C++ addon
- **WebGL rendering with CRT shaders** — Scanlines, curvature, bloom, and other retro effects via multi-pass WebGL2 shaders
- **Library management** — Automatic ROM scanning, metadata lookup, and cover art sync
- **Save states** — Multiple slots with autosave on close
- **Multi-disc swap** — Swap discs mid-game for multi-disc PSX titles
- **Cheat support** — RetroArch `.cht` files and DuckStation chtdb database

## Supported Systems

| System | Cores |
|--------|-------|
| Arcade | MAME |
| Game Boy | Gambatte, mGBA |
| Game Boy Advance | mGBA, VBA Next |
| Game Boy Color | Gambatte, mGBA |
| Genesis / Mega Drive | Genesis Plus GX, PicoDrive |
| N64 | Mupen64Plus Next, ParaLLEl N64 |
| Nintendo DS | DeSmuME |
| NES | fceumm, Nestopia, Mesen |
| PSP | PPSSPP |
| PlayStation | PCSX ReARMed, Beetle PSX HW, SwanStation |
| Sega Saturn | Beetle Saturn, Yabause |
| SNES | Snes9x, bsnes |

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

## License

[MIT](LICENSE)
