import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VIBE_REGISTRY, getVibeDefinition, getSavedVibeId } from './registry'

describe('VIBE_REGISTRY', () => {
  it('contains at least a default vibe', () => {
    const defaultVibe = VIBE_REGISTRY.find((v) => v.id === 'default')
    expect(defaultVibe).toBeDefined()
    expect(defaultVibe!.colorSchemes).toContain('light')
    expect(defaultVibe!.colorSchemes).toContain('dark')
  })

  it('contains the unc vibe', () => {
    const unc = VIBE_REGISTRY.find((v) => v.id === 'unc')
    expect(unc).toBeDefined()
    expect(unc!.label).toBe('Unc Mode')
    expect(unc!.colorSchemes).toEqual(['dark'])
    expect(unc!.hasPointerGlow).toBe(true)
    expect(unc!.hasScanlines).toBe(true)
  })

  it('every vibe has a unique id', () => {
    const ids = VIBE_REGISTRY.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every vibe has required fields', () => {
    for (const vibe of VIBE_REGISTRY) {
      expect(vibe.id).toBeTruthy()
      expect(vibe.label).toBeTruthy()
      expect(vibe.icon).toBeTruthy()
      expect(vibe.colorSchemes.length).toBeGreaterThan(0)
    }
  })
})

describe('getVibeDefinition', () => {
  it('returns the correct vibe by id', () => {
    expect(getVibeDefinition('unc').id).toBe('unc')
    expect(getVibeDefinition('default').id).toBe('default')
  })

  it('falls back to default for unknown ids', () => {
    expect(getVibeDefinition('nonexistent').id).toBe('default')
  })
})

describe('getSavedVibeId', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('returns default when nothing is saved', () => {
    expect(getSavedVibeId()).toBe('default')
  })

  it('returns the saved vibe if it exists in the registry', () => {
    localStorage.setItem('gamelord:vibe', 'unc')
    expect(getSavedVibeId()).toBe('unc')
  })

  it('returns default for an invalid saved value', () => {
    localStorage.setItem('gamelord:vibe', 'invalid-vibe')
    expect(getSavedVibeId()).toBe('default')
  })
})
