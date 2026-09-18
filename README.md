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
  <a href="https://github.com/ryanmagoon/gamelord/commits/main"><img src="https://img.shields.io/github/last-commit/ryanmagoon/gamelord/main" alt="Last Commit" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?logo=electron" alt="Platform" />
</p>

<p align="center">
  <img src=".github/assets/screenshot-library.jpg" alt="GameLord library view" width="800" />
</p>

<p align="center">
  <img src=".github/assets/screenshot-gameplay.jpg" alt="GameLord gameplay with CRT shaders" width="800" />
</p>

## Features

- **In-process Libretro cores** — Runs cores natively via a C++ Node addon in-process (not an external RetroArch process)
- **WebGL2 shader pipeline (18 presets)** — Multi-pass CRT and display effects including CRT Geom, CRT Geom Deluxe, CRT Aperture, CRT Fast, CRT Caligari, NTSC Adaptive, LCD PSP, LCD GBA, LCD GBA + Motion Blur, xBRZ Freescale, SABR, Pixellate, Dither, Halftone, Motion Blur, Nearest Neighbor, Linear, and None
- **Sub-millisecond frame pacing** — Emulation loop runs in a dedicated Electron utility process with hybrid sleep+spin pacing (~0.1–0.5ms jitter)
- **Hash-based library IDs** — ROMs identified by MD5 against ScreenScraper, with name search only as a fallback, plus cover art sync
- **First-launch homebrew** — Bundled permissively-licensed homebrew imports on first launch so the library is not empty before you add ROMs
- **On-demand core downloads** — Cores are fetched when needed rather than hand-installed

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
