# GameLord

A modern, elegant emulation frontend built as a spiritual successor to OpenEmu, featuring superior UI/UX polish and advanced features. Built with Electron, React, TypeScript, and shadcn/ui.

![GameLord](./assets/banner.png)

## Features

- 🎮 **Multi-System Support** - Powered by libretro cores for compatibility with multiple gaming systems
- 🎨 **Beautiful Native UI** - Built with shadcn/ui for a polished, macOS-native appearance
- 🚀 **High Performance** - WebGL rendering with shader effects and optimized frame timing
- 🎯 **Library Management** - Automatic ROM scanning with multi-system detection, metadata and cover art *(coming soon)*
- 🎛️ **Keyboard Input** - Configurable keyboard mapping for libretro joypad buttons, gamepad support *(coming soon)*
- 💾 **Save State Management** - Quick save/load with multiple slots and autosave on close
- 🌈 **Visual Effects** - CRT shaders, scanlines, and other retro visual enhancements via WebGL2
- 🔒 **Secure Architecture** - Context isolation with Electron preload scripts

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- macOS 11+ (for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/gamelord.git
cd gamelord

# Install dependencies
pnpm install

# Start development server
pnpm start
```

### Development

```bash
# Run in development mode
pnpm start

# Build for production
pnpm run make

# Run tests
pnpm test

# Lint code
pnpm run lint
```

## Project Structure

```
gamelord/
├── src/
│   ├── main/              # Main process code
│   │   ├── index.ts       # Main entry point
│   │   ├── core/          # Core management
│   │   └── ipc/           # IPC handlers
│   ├── renderer/          # Renderer process (React app)
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── stores/        # Zustand stores
│   │   ├── lib/           # Utilities
│   │   └── types/         # TypeScript types
│   └── preload/           # Preload scripts
├── assets/                # Static assets
├── forge.config.ts        # Electron Forge config
├── vite.*.config.ts       # Vite configurations
└── package.json
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Apple Developer Credentials (for code signing)
APPLE_DEVELOPER_ID="Developer ID Application: Your Name (TEAMID)"
APPLE_ID="your-apple-id@example.com"
APPLE_ID_PASSWORD="app-specific-password"
APPLE_TEAM_ID="TEAMID"
```

### Supported Systems

GameLord supports the following systems through libretro cores:

- Nintendo Entertainment System (NES)
- Super Nintendo Entertainment System (SNES)
- Game Boy / Game Boy Color
- Game Boy Advance
- Nintendo 64
- Nintendo DS
- Sega Genesis / Mega Drive
- Sega Saturn
- Sony PlayStation
- And more...

## Building

### macOS

```bash
# Build for macOS
pnpm run make

# Build and sign for distribution
pnpm run publish
```

The built application will be available in the `out` directory.

### Code Signing

For macOS distribution, you'll need:
1. An Apple Developer account
2. A valid Developer ID certificate
3. Notarization credentials

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Guidelines

- Follow the existing code style
- Write tests for new features
- Update documentation as needed
- Create detailed pull requests

## Roadmap

- [x] Initial project setup with Electron Forge
- [x] React + TypeScript integration
- [x] shadcn/ui component library
- [x] Core emulation integration
- [x] ROM library management
- [ ] Game metadata service
- [x] Save state system
- [ ] Controller configuration
- [x] Shader effects
- [ ] Multi-language support

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

