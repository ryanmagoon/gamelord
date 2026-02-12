import { describe, it, expect } from 'vitest'
import { computeRowSpan, getMosaicSpans, snapAspectRatio } from './mosaicGrid'

describe('computeRowSpan', () => {
  const columnWidth = 120 // typical column width at ~1280px viewport with 12 cols

  it('returns expected row span for a portrait card (AR 0.75, col-span-2)', () => {
    const rowSpan = computeRowSpan(0.75, 2, columnWidth)
    // cardWidth = 2 * 120 + 1 * 4 = 244
    // cardHeight = 244 / 0.75 ≈ 325.3
    // rawSpan = (325.3 + 4) / (48 + 4) ≈ 6.33
    // round → 6
    expect(rowSpan).toBe(6)
  })

  it('returns expected row span for a landscape card (AR 1.4, col-span-3)', () => {
    const rowSpan = computeRowSpan(1.4, 3, columnWidth)
    // cardWidth = 3 * 120 + 2 * 4 = 368
    // cardHeight = 368 / 1.4 ≈ 262.9
    // rawSpan = (262.9 + 4) / (48 + 4) ≈ 5.13
    // round → 5
    expect(rowSpan).toBe(5)
  })

  it('enforces a minimum of 2 rows', () => {
    // Very wide aspect ratio with tiny column → would be < 2 without the clamp
    const rowSpan = computeRowSpan(10, 2, 10)
    expect(rowSpan).toBe(2)
  })

  it('accounts for gap between rows', () => {
    // Verify the formula uses gap in both numerator and denominator
    // cardWidth = 1 * 100 + 0 * 4 = 100, cardHeight = 100 / 1 = 100
    const rowSpan = computeRowSpan(1, 1, 100)
    // rawSpan = (100 + 4) / (48 + 4) = 104 / 52 = 2.0
    expect(rowSpan).toBe(2)
  })

  it('rounds to nearest row span', () => {
    // Pick values that produce a fractional span close to .5
    const rowSpan = computeRowSpan(0.5, 2, columnWidth)
    // cardWidth = 244, cardHeight = 488, rawSpan = (488 + 4) / 52 ≈ 9.46 → 9
    expect(rowSpan).toBe(9)
  })
})

describe('snapAspectRatio', () => {
  it('snaps exact bucket values to themselves', () => {
    expect(snapAspectRatio(0.667)).toBe(0.667)
    expect(snapAspectRatio(0.750)).toBe(0.750)
    expect(snapAspectRatio(1.000)).toBe(1.000)
    expect(snapAspectRatio(1.333)).toBe(1.333)
  })

  it('snaps similar GBA ratios to the same bucket', () => {
    // Two GBA games with slightly different image dimensions
    expect(snapAspectRatio(0.7142857)).toBe(0.700)
    expect(snapAspectRatio(0.7134670)).toBe(0.700)
  })

  it('snaps values between buckets to the nearest one', () => {
    // Midpoint between 0.750 and 0.800 is 0.775 → snaps to 0.800 (closer)
    expect(snapAspectRatio(0.780)).toBe(0.800)
    // Closer to 0.750
    expect(snapAspectRatio(0.760)).toBe(0.750)
  })

  it('snaps very small ratios to the smallest bucket', () => {
    expect(snapAspectRatio(0.4)).toBe(0.667)
    expect(snapAspectRatio(0.5)).toBe(0.667)
  })

  it('snaps very large ratios to the largest bucket', () => {
    expect(snapAspectRatio(1.8)).toBe(1.500)
    expect(snapAspectRatio(2.0)).toBe(1.500)
  })
})

describe('getMosaicSpans', () => {
  const columnWidth = 120

  it('returns col-span-2 for portrait aspect ratios (AR <= 1)', () => {
    const { colSpan } = getMosaicSpans(0.75, columnWidth)
    expect(colSpan).toBe(2)
  })

  it('returns col-span-2 for exactly square aspect ratio (AR === 1)', () => {
    const { colSpan } = getMosaicSpans(1.0, columnWidth)
    expect(colSpan).toBe(2)
  })

  it('returns col-span-3 for landscape aspect ratios (AR > 1)', () => {
    const { colSpan } = getMosaicSpans(1.4, columnWidth)
    expect(colSpan).toBe(3)
  })

  it('returns both colSpan and rowSpan', () => {
    const result = getMosaicSpans(0.75, columnWidth)
    expect(result).toHaveProperty('colSpan')
    expect(result).toHaveProperty('rowSpan')
    expect(result.rowSpan).toBeGreaterThanOrEqual(2)
  })
})
