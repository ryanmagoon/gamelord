# Logging

GameLord uses [electron-log](https://github.com/nicedoc/electron-log) v5 for structured logging across the main process. All logs go to both the console and a rotating log file.

## Log file location

| Platform | Path |
|----------|------|
| macOS | `~/Library/Logs/gamelord/main.log` |
| Windows | `%USERPROFILE%\AppData\Roaming\gamelord\logs\main.log` |
| Linux | `~/.config/gamelord/logs/main.log` |

Files rotate at **5 MB**.

## Scopes

Each subsystem has a named scope so you can filter logs by source:

| Scope | Import | Used in |
|-------|--------|---------|
| `ipc` | `ipcLog` | `ipc/handlers.ts` — IPC handler errors and warnings |
| `emulator` | `emulatorLog` | `LibretroNativeCore.ts` — native addon loading, launch errors |
| `library` | `libraryLog` | `LibraryService.ts` — ROM scanning, game ID hashing |
| `gameWindow` | `gameWindowLog` | `GameWindowManager.ts` — window lifecycle, emulation loop errors |
| `core` | `coreLog` | `CoreManager.ts` — utility process core errors |
| `retroarch` | `retroArchLog` | `RetroArchCore.ts` — RetroArch process stderr and UDP errors |
| `libretro` | `libretroLog` | `LibretroNativeCore.ts` — libretro core log callback messages |

## Log levels

Standard electron-log levels: `error`, `warn`, `info`, `verbose`, `debug`, `silly`.

Console format: `[level] [scope] message`
File format: `[2025-01-15 14:30:00.123] [info] [emulator] Native addon loaded from: /path/to/addon.node`

## Usage

```typescript
import { ipcLog } from '../logger'

ipcLog.info('Handler registered')
ipcLog.error('Failed to launch:', error)
```

## Native addon logs

Libretro cores emit log messages via the `retro_log_printf_t` callback. These are buffered in C++ (`libretro_core.cc`) in a mutex-guarded vector (max 256 entries) and drained into `libretroLog` after each emulation frame by `LibretroNativeCore.drainNativeLogs()`.

Libretro log levels map to electron-log levels:

| Libretro level | electron-log level |
|---------------|-------------------|
| `RETRO_LOG_DEBUG` (0) | `debug` |
| `RETRO_LOG_INFO` (1) | `info` |
| `RETRO_LOG_WARN` (2) | `warn` |
| `RETRO_LOG_ERROR` (3) | `error` |

## Filtering logs

Tail the log file and filter by scope:

```bash
# All logs
tail -f ~/Library/Logs/gamelord/main.log

# Only emulator logs
tail -f ~/Library/Logs/gamelord/main.log | grep '\[emulator\]'

# Only errors
tail -f ~/Library/Logs/gamelord/main.log | grep '\[error\]'

# Libretro core output only
tail -f ~/Library/Logs/gamelord/main.log | grep '\[libretro\]'
```
