<p align="center">
  <img src="apps/desktop/build/icon.png" alt="GameLord" width="128" />
</p>

<h1 align="center">GameLord</h1>

<p align="center">A vibesmaxxed emulation frontend built with Electron, React, and TypeScript.</p>

<p align="center">
  <img src="https://img.shields.io/badge/stage-alpha-orange" alt="Alpha" />
  <a href="https://github.com/ryanmagoon/gamelord/actions/workflows/ci.yml"><img src="https://github.com/ryanmagoon/gamelord/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/ryanmagoon/gamelord/releases?q=nightly&expanded=true"><img src="https://img.shields.io/badge/download-nightly-blue" alt="Nightly Build" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
</p>

<p align="center">
  <img src=".github/assets/screenshot-library.jpg" alt="GameLord library view" width="800" />
</p>

<p align="center">
  <img src=".github/assets/screenshot-gameplay.jpg" alt="GameLord gameplay with CRT shaders" width="800" />
</p>

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

More systems are on the way — the goal is to support any libretro-compatible core.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- **macOS:** Xcode Command Line Tools (for the native addon)
- **Windows:** Visual Studio Build Tools with the C++ workload

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and development workflow. For a deep dive into how the app is structured, check out [ARCHITECTURE.md](ARCHITECTURE.md).

## Sponsors

<a href="https://sentry.io">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/sentry-light.svg" />
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/sentry-dark.svg" />
    <img alt="Sentry" src=".github/assets/sentry-dark.svg" width="160" />
  </picture>
</a>

## License

[MIT](LICENSE)
