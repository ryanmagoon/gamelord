import { describe, it, expect } from 'vitest'
import { computeMosaicLayout, getColumnCount, type MosaicSpan } from './mosaicLayout'
import { MOSAIC_ROW_UNIT, MOSAIC_GAP } from './mosaicGrid'

describe('getColumnCount', () => {
  it('returns 4 columns for narrow viewports', () => {
    expect(getColumnCount(400)).toBe(4)
    expect(getColumnCount(639)).toBe(4)
  })

  it('returns 6 columns at sm breakpoint', () => {
    expect(getColumnCount(640)).toBe(6)
    expect(getColumnCount(767)).toBe(6)
  })

  it('returns 8 columns at md breakpoint', () => {
    expect(getColumnCount(768)).toBe(8)
    expect(getColumnCount(1023)).toBe(8)
  })

  it('returns 10 columns at lg breakpoint', () => {
    expect(getColumnCount(1024)).toBe(10)
    expect(getColumnCount(1279)).toBe(10)
  })

  it('returns 12 columns at xl breakpoint', () => {
    expect(getColumnCount(1280)).toBe(12)
    expect(getColumnCount(1920)).toBe(12)
  })
})

describe('computeMosaicLayout', () => {
  const columnWidth = 100
  const gap = MOSAIC_GAP
  const rowUnit = MOSAIC_ROW_UNIT

  it('returns empty result for empty input', () => {
    const result = computeMosaicLayout([], 12, columnWidth)
    expect(result.items).toHaveLength(0)
    expect(result.totalHeight).toBe(0)
  })

  it('returns empty result for zero column count', () => {
    const spans: MosaicSpan[] = [{ colSpan: 2, rowSpan: 4 }]
    const result = computeMosaicLayout(spans, 0, columnWidth)
    expect(result.items).toHaveLength(0)
    expect(result.totalHeight).toBe(0)
  })

  it('places a single item at the origin', () => {
    const spans: MosaicSpan[] = [{ colSpan: 2, rowSpan: 4 }]
    const result = computeMosaicLayout(spans, 12, columnWidth)

    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    expect(item.index).toBe(0)
    expect(item.x).toBe(0)
    expect(item.y).toBe(0)
    expect(item.width).toBe(2 * columnWidth + 1 * gap) // 204
    expect(item.height).toBe(4 * rowUnit + 3 * gap)   // 204
  })

  it('places two items side by side when there is room', () => {
    const spans: MosaicSpan[] = [
      { colSpan: 2, rowSpan: 4 },
      { colSpan: 2, rowSpan: 4 },
    ]
    const result = computeMosaicLayout(spans, 12, columnWidth)

    expect(result.items[0].x).toBe(0)
    expect(result.items[1].x).toBe(2 * (columnWidth + gap)) // starts at column 2
    expect(result.items[1].y).toBe(0) // same row
  })

  it('fills gaps with dense packing (shorter item fills gap next to tall item)', () => {
    // 4-column grid:
    // Item 0: colSpan 2, rowSpan 6 → occupies cols 0-1, rows 0-5
    // Item 1: colSpan 2, rowSpan 3 → occupies cols 2-3, rows 0-2
    // Item 2: colSpan 2, rowSpan 2 → should fill cols 2-3, rows 3-4 (the gap)
    const spans: MosaicSpan[] = [
      { colSpan: 2, rowSpan: 6 },
      { colSpan: 2, rowSpan: 3 },
      { colSpan: 2, rowSpan: 2 },
    ]
    const result = computeMosaicLayout(spans, 4, columnWidth)

    // Item 2 should be placed at column 2 (filling the gap), not column 0
    expect(result.items[2].x).toBe(2 * (columnWidth + gap))
    expect(result.items[2].y).toBe(3 * (rowUnit + gap))
  })

  it('computes correct total height', () => {
    const spans: MosaicSpan[] = [
      { colSpan: 2, rowSpan: 4 },
      { colSpan: 2, rowSpan: 6 },
    ]
    const result = computeMosaicLayout(spans, 4, columnWidth)

    // Item 0 fills rows 0-3, Item 1 fills rows 0-5 (side by side in 4-col grid)
    // Max row = 6
    const expectedHeight = 6 * (rowUnit + gap) - gap
    expect(result.totalHeight).toBe(expectedHeight)
  })

  it('clamps colSpan to column count', () => {
    // colSpan 3 in a 2-column grid should be treated as colSpan 2
    const spans: MosaicSpan[] = [{ colSpan: 3, rowSpan: 4 }]
    const result = computeMosaicLayout(spans, 2, columnWidth)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].x).toBe(0)
    expect(result.items[0].width).toBe(2 * columnWidth + 1 * gap)
  })

  it('handles many items without errors', () => {
    const spans: MosaicSpan[] = Array.from({ length: 1200 }, (_, i) => ({
      colSpan: i % 3 === 0 ? 3 : 2,
      rowSpan: 3 + (i % 5),
    }))

    const result = computeMosaicLayout(spans, 12, columnWidth)
    expect(result.items).toHaveLength(1200)
    expect(result.totalHeight).toBeGreaterThan(0)

    // All items should have non-negative positions
    for (const item of result.items) {
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.y).toBeGreaterThanOrEqual(0)
      expect(item.width).toBeGreaterThan(0)
      expect(item.height).toBeGreaterThan(0)
    }
  })

  it('wraps items to the next row when the current row is full', () => {
    // 4-column grid with three col-span-2 items
    // Items 0,1 fit in row 0; item 2 must wrap to a new row
    const spans: MosaicSpan[] = [
      { colSpan: 2, rowSpan: 3 },
      { colSpan: 2, rowSpan: 3 },
      { colSpan: 2, rowSpan: 3 },
    ]
    const result = computeMosaicLayout(spans, 4, columnWidth)

    expect(result.items[0].y).toBe(0)
    expect(result.items[1].y).toBe(0)
    expect(result.items[2].y).toBe(3 * (rowUnit + gap)) // next row after rowSpan 3
  })
})
