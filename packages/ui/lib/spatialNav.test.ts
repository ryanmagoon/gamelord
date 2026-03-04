import { describe, it, expect } from 'vitest'
import { findNextFocusable, type FocusableRect } from './spatialNav'

/**
 * Helper to create a rect at grid position (col, row) with uniform size.
 * Each cell is 200x300 with 10px gap.
 */
function gridRect(id: string, col: number, row: number): FocusableRect {
  return {
    id,
    x: col * 210,
    y: row * 310,
    width: 200,
    height: 300,
  }
}

describe('findNextFocusable', () => {
  // 3x3 grid layout:
  //   A  B  C
  //   D  E  F
  //   G  H  I
  const grid: FocusableRect[] = [
    gridRect('A', 0, 0), gridRect('B', 1, 0), gridRect('C', 2, 0),
    gridRect('D', 0, 1), gridRect('E', 1, 1), gridRect('F', 2, 1),
    gridRect('G', 0, 2), gridRect('H', 1, 2), gridRect('I', 2, 2),
  ]

  const findById = (id: string) => grid.find((r) => r.id === id)!

  describe('horizontal navigation', () => {
    it('moves right from A to B', () => {
      const result = findNextFocusable(findById('A'), grid, 'right')
      expect(result?.id).toBe('B')
    })

    it('moves right from B to C', () => {
      const result = findNextFocusable(findById('B'), grid, 'right')
      expect(result?.id).toBe('C')
    })

    it('moves left from C to B', () => {
      const result = findNextFocusable(findById('C'), grid, 'left')
      expect(result?.id).toBe('B')
    })

    it('moves left from B to A', () => {
      const result = findNextFocusable(findById('B'), grid, 'left')
      expect(result?.id).toBe('A')
    })

    it('returns null when no candidate to the right of C', () => {
      const result = findNextFocusable(findById('C'), grid, 'right')
      expect(result).toBeNull()
    })

    it('returns null when no candidate to the left of A', () => {
      const result = findNextFocusable(findById('A'), grid, 'left')
      expect(result).toBeNull()
    })
  })

  describe('vertical navigation', () => {
    it('moves down from A to D', () => {
      const result = findNextFocusable(findById('A'), grid, 'down')
      expect(result?.id).toBe('D')
    })

    it('moves down from E to H', () => {
      const result = findNextFocusable(findById('E'), grid, 'down')
      expect(result?.id).toBe('H')
    })

    it('moves up from H to E', () => {
      const result = findNextFocusable(findById('H'), grid, 'up')
      expect(result?.id).toBe('E')
    })

    it('moves up from D to A', () => {
      const result = findNextFocusable(findById('D'), grid, 'up')
      expect(result?.id).toBe('A')
    })

    it('returns null when no candidate below G', () => {
      const result = findNextFocusable(findById('G'), grid, 'down')
      expect(result).toBeNull()
    })

    it('returns null when no candidate above A', () => {
      const result = findNextFocusable(findById('A'), grid, 'up')
      expect(result).toBeNull()
    })
  })

  describe('alignment preference', () => {
    it('prefers same-row candidate over closer misaligned one', () => {
      // Target is E (center of grid). To the right:
      // F is same row, directly right. No other candidates should win.
      const result = findNextFocusable(findById('E'), grid, 'right')
      expect(result?.id).toBe('F')
    })

    it('prefers same-column candidate when moving down', () => {
      // From B (top center), moving down should pick E (center) not D or F
      const result = findNextFocusable(findById('B'), grid, 'down')
      expect(result?.id).toBe('E')
    })
  })

  describe('single-element and empty lists', () => {
    it('returns null when candidates list is empty', () => {
      const result = findNextFocusable(findById('A'), [], 'right')
      expect(result).toBeNull()
    })

    it('returns null when current is the only element', () => {
      const single = [gridRect('A', 0, 0)]
      const result = findNextFocusable(single[0], single, 'right')
      expect(result).toBeNull()
    })
  })

  describe('non-uniform grid (different sizes)', () => {
    it('handles cards with different aspect ratios', () => {
      const items: FocusableRect[] = [
        { id: 'wide', x: 0, y: 0, width: 400, height: 200 },
        { id: 'tall', x: 410, y: 0, width: 150, height: 400 },
        { id: 'small', x: 570, y: 0, width: 100, height: 100 },
      ]

      const result = findNextFocusable(items[0], items, 'right')
      expect(result?.id).toBe('tall')
    })

    it('navigates down with offset rows', () => {
      // Row 1: two wide cards
      // Row 2: three narrow cards offset
      const items: FocusableRect[] = [
        { id: 'top-left', x: 0, y: 0, width: 300, height: 200 },
        { id: 'top-right', x: 310, y: 0, width: 300, height: 200 },
        { id: 'bot-1', x: 0, y: 210, width: 190, height: 200 },
        { id: 'bot-2', x: 200, y: 210, width: 190, height: 200 },
        { id: 'bot-3', x: 400, y: 210, width: 190, height: 200 },
      ]

      // Moving down from top-left should favor bot-1 or bot-2 (best overlap)
      const result = findNextFocusable(items[0], items, 'down')
      expect(result?.id).toBe('bot-1')
    })
  })
})
