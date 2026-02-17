import { describe, it, expect } from 'vitest'
import { computeRowLayout } from './mosaicLayout'
import { ROW_HEIGHT, MOSAIC_GAP } from './mosaicGrid'

describe('computeRowLayout', () => {
  const gap = MOSAIC_GAP
  const baseHeight = ROW_HEIGHT

  it('returns empty result for empty input', () => {
    const result = computeRowLayout([], 1000)
    expect(result.items).toHaveLength(0)
    expect(result.totalHeight).toBe(0)
  })

  it('returns empty result for zero container width', () => {
    const result = computeRowLayout([0.75], 0)
    expect(result.items).toHaveLength(0)
    expect(result.totalHeight).toBe(0)
  })

  it('places a single narrow item at the origin', () => {
    // AR 0.75, container 1000px.
    // justifiedHeight = 1000/0.75 = 1333 >> maxRowHeight (392), so capped.
    const maxH = Math.round(baseHeight * 1.4)
    const result = computeRowLayout([0.75], 1000)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].x).toBe(0)
    expect(result.items[0].y).toBe(0)
    expect(result.items[0].width).toBe(Math.round(maxH * 0.75))
    expect(result.items[0].height).toBe(maxH)
  })

  it('leaves the last row unjustified when height is within range', () => {
    // Two items AR 0.75 in a 450px container.
    // justifiedHeight = (450 - 4) / 1.5 = 297.33 > 280 — not full, this is the last row.
    // 297.33 < maxRowHeight (392), so stays unjustified at baseHeight.
    const result = computeRowLayout([0.75, 0.75], 450)
    const w = Math.round(baseHeight * 0.75) // 210

    expect(result.items[0].x).toBe(0)
    expect(result.items[0].width).toBe(w)
    expect(result.items[1].x).toBe(w + gap)
    expect(result.items[1].width).toBe(w)
    expect(result.items[0].y).toBe(0)
    expect(result.items[1].y).toBe(0)
    expect(result.totalHeight).toBe(baseHeight)
  })

  it('justifies a row when items fill the container width', () => {
    // Pack enough items that justified height ≤ baseHeight
    // AR 0.75 each. Container 500px.
    // justifiedHeight = (500 - (n-1)*4) / (n * 0.75)
    // n=2: (500-4)/1.5 = 330.67 > 280 — not full
    // n=3: (500-8)/2.25 = 218.67 ≤ 280 — full, justify!
    const result = computeRowLayout([0.75, 0.75, 0.75, 0.75], 500)

    // First 3 items should be justified into row 1
    const justifiedH = Math.round((500 - 2 * gap) / (3 * 0.75))
    expect(result.items[0].y).toBe(0)
    expect(result.items[1].y).toBe(0)
    expect(result.items[2].y).toBe(0)
    expect(result.items[0].height).toBe(justifiedH)
    expect(result.items[1].height).toBe(justifiedH)
    expect(result.items[2].height).toBe(justifiedH)

    // 4th item is the last row. justifiedH for single 0.75 in 500px = 666 > maxH (392)
    // So it gets capped at maxRowHeight
    const maxH = Math.round(baseHeight * 1.4)
    expect(result.items[3].y).toBe(justifiedH + gap)
    expect(result.items[3].height).toBe(maxH)
  })

  it('wider aspect ratios produce wider items in the same row', () => {
    const result = computeRowLayout([0.5, 1.4], 2000)
    expect(result.items[1].width).toBeGreaterThan(result.items[0].width)
  })

  it('computes correct total height for a single capped-height row', () => {
    // AR 0.75 in 1000px → justifiedH = 1333 > maxH (392) → capped
    // layoutRowAtHeight returns y + rowHeight + gap = 0 + 392 + 4 = 396
    const maxH = Math.round(baseHeight * 1.4)
    const result = computeRowLayout([0.75], 1000)
    expect(result.totalHeight).toBe(maxH + gap)
  })

  it('handles many items without errors', () => {
    const aspectRatios = Array.from({ length: 1200 }, (_, i) => 0.5 + (i % 10) * 0.1)
    const result = computeRowLayout(aspectRatios, 1200)
    expect(result.items).toHaveLength(1200)
    expect(result.totalHeight).toBeGreaterThan(0)

    for (const item of result.items) {
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.y).toBeGreaterThanOrEqual(0)
      expect(item.width).toBeGreaterThan(0)
      expect(item.height).toBeGreaterThan(0)
    }
  })

  it('places a very wide single item correctly', () => {
    // AR 2.0, container 100px — justified height = 100/2 = 50 < 280, so it
    // gets justified as a single-item row
    const result = computeRowLayout([2.0], 100)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].x).toBe(0)
    expect(result.items[0].y).toBe(0)
    // justified: height = 100/2 = 50, width = round(50*2) = 100
    expect(result.items[0].width).toBe(100)
    expect(result.items[0].height).toBe(50)
  })

  it('caps row height for the last row when it would be too tall', () => {
    // A single item with AR 0.1 in a wide container
    // justified height = 1000/0.286 ≈ 3497 (way over max)
    // Should be capped at baseHeight * 1.4 = 392
    const result = computeRowLayout([0.1], 1000)
    expect(result.items[0].height).toBeLessThanOrEqual(Math.round(baseHeight * 1.4))
  })

  it('justified row heights are at most the base row height', () => {
    // Many items of uniform AR — all non-last rows should be ≤ baseHeight
    const aspectRatios = Array.from({ length: 50 }, () => 0.75)
    const result = computeRowLayout(aspectRatios, 800)

    // Find the last row y
    const lastY = result.items[result.items.length - 1].y

    for (const item of result.items) {
      if (item.y < lastY) {
        // Non-last rows: justified, should be ≤ baseHeight
        expect(item.height).toBeLessThanOrEqual(baseHeight)
      }
    }
  })

  it('does not produce grotesquely tall rows for uniform tall art', () => {
    // Simulate Sega CD / Saturn: all AR ~0.5
    const aspectRatios = Array.from({ length: 20 }, () => 0.5)
    const result = computeRowLayout(aspectRatios, 1200)

    const maxAllowedHeight = Math.round(baseHeight * 1.4)
    for (const item of result.items) {
      expect(item.height).toBeLessThanOrEqual(maxAllowedHeight + 1) // +1 for rounding
    }
  })

  it('all items have positive dimensions', () => {
    const aspectRatios = [0.4, 0.5, 0.6, 0.75, 1.0, 1.2, 1.5, 1.8]
    const result = computeRowLayout(aspectRatios, 1000)

    for (const item of result.items) {
      expect(item.width).toBeGreaterThan(0)
      expect(item.height).toBeGreaterThan(0)
    }
  })
})
