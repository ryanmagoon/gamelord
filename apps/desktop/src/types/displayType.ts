/**
 * The display technology used by a game system's original hardware.
 * Determines which power on/off animation style to use.
 */
export type DisplayType = 'crt' | 'lcd-handheld' | 'lcd-portable'

/**
 * Maps system IDs to their original display technology.
 * CRT: home consoles and arcade cabinets that output to tube TVs.
 * LCD handheld: portable systems with passive/reflective LCD screens.
 * LCD portable: later portables with modern backlit TFT/IPS panels.
 */
const SYSTEM_DISPLAY_MAP: Record<string, DisplayType> = {
  nes: 'crt',
  snes: 'crt',
  genesis: 'crt',
  n64: 'crt',
  psx: 'crt',
  arcade: 'crt',
  gb: 'lcd-handheld',
  gba: 'lcd-handheld',
  nds: 'lcd-handheld',
  psp: 'lcd-portable',
}

/** Get the display type for a system ID. Defaults to `'crt'` for unknown systems. */
export function getDisplayType(systemId: string): DisplayType {
  return SYSTEM_DISPLAY_MAP[systemId] ?? 'crt'
}
