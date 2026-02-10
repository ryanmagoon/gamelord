import log from 'electron-log/main'

// Configure log file rotation & format
log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{scope}] {text}'
log.transports.console.format = '[{level}] [{scope}] {text}'

// Scoped loggers for each subsystem
export const ipcLog = log.scope('ipc')
export const emulatorLog = log.scope('emulator')
export const libraryLog = log.scope('library')
export const gameWindowLog = log.scope('gameWindow')
export const coreLog = log.scope('core')
export const retroArchLog = log.scope('retroarch')
export const libretroLog = log.scope('libretro')

export default log
