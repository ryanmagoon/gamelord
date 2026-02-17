import { describe, it, expect } from 'vitest'
import { computeCardWidth, ROW_HEIGHT } from './mosaicGrid'

describe('computeCardWidth', () => {
  it('returns width proportional to aspect ratio', () => {
    // AR 0.75 → 280 * 0.75 = 210
    expect(computeCardWidth(0.75)).toBe(210)
  })

  it('returns wider cards for landscape aspect ratios', () => {
    // AR 1.4 → 280 * 1.4 = 392
    expect(computeCardWidth(1.4)).toBe(392)
  })

  it('returns narrower cards for tall portrait aspect ratios', () => {
    // AR 0.5 → 280 * 0.5 = 140
    expect(computeCardWidth(0.5)).toBe(140)
  })

  it('enforces a minimum width of 80px', () => {
    // AR 0.1 → 280 * 0.1 = 28, clamped to 80
    expect(computeCardWidth(0.1)).toBe(80)
  })

  it('returns square width for AR 1.0', () => {
    expect(computeCardWidth(1.0)).toBe(ROW_HEIGHT)
  })

  it('wider AR produces wider card than narrower AR', () => {
    expect(computeCardWidth(1.4)).toBeGreaterThan(computeCardWidth(0.75))
    expect(computeCardWidth(0.75)).toBeGreaterThan(computeCardWidth(0.5))
  })
})
