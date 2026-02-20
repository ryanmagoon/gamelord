import { describe, it, expect } from 'vitest'
import { getDisplayType } from './displayType'

describe('getDisplayType', () => {
  it.each([
    ['nes', 'crt'],
    ['snes', 'crt'],
    ['genesis', 'crt'],
    ['n64', 'crt'],
    ['psx', 'crt'],
    ['saturn', 'crt'],
    ['arcade', 'crt'],
  ] as const)('maps %s to crt', (systemId, expected) => {
    expect(getDisplayType(systemId)).toBe(expected)
  })

  it.each([
    ['gb', 'lcd-handheld'],
    ['gba', 'lcd-handheld'],
    ['nds', 'lcd-handheld'],
  ] as const)('maps %s to lcd-handheld', (systemId, expected) => {
    expect(getDisplayType(systemId)).toBe(expected)
  })

  it('maps psp to lcd-portable', () => {
    expect(getDisplayType('psp')).toBe('lcd-portable')
  })

  it('defaults unknown systems to crt', () => {
    expect(getDisplayType('unknown-system')).toBe('crt')
    expect(getDisplayType('')).toBe('crt')
    expect(getDisplayType('dreamcast')).toBe('crt')
  })
})
