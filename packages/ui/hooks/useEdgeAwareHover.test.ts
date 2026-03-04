import { describe, it, expect } from 'vitest'
import { computeEdgeTranslate } from './useEdgeAwareHover'

/** Helper to create a DOMRect-like object. */
function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x, y, width, height,
    left: x, top: y,
    right: x + width, bottom: y + height,
    toJSON: () => ({}),
  }
}

const SCALE = 1.25
const GLOW = 18

describe('computeEdgeTranslate', () => {
  const container = rect(0, 0, 1000, 800)

  it('returns null for a centered card', () => {
    const card = rect(400, 300, 200, 280)
    expect(computeEdgeTranslate(card, container, SCALE, GLOW)).toBeNull()
  })

  it('shifts right when card is at left edge', () => {
    // Card starts at x=10. Scaled left = 10 - (200*0.15/2) = 10 - 15 = -5
    // With glow: -5 - 18 = -23. Container left = 0.
    // Shift = 0 - (-23) = 23
    const card = rect(10, 300, 200, 280)
    const result = computeEdgeTranslate(card, container, SCALE, GLOW)
    expect(result).not.toBeNull()
    expect(result!.x).toBeGreaterThan(0) // shifts right
    expect(result!.y).toBe(0)
  })

  it('shifts left when card is at right edge', () => {
    // Card right = 990. Scaled right = 990 + 15 = 1005.
    // With glow: 1005 + 18 = 1023. Container right = 1000.
    // Shift = 1000 - 1023 = -23
    const card = rect(790, 300, 200, 280)
    const result = computeEdgeTranslate(card, container, SCALE, GLOW)
    expect(result).not.toBeNull()
    expect(result!.x).toBeLessThan(0) // shifts left
    expect(result!.y).toBe(0)
  })

  it('shifts down when card is at top edge', () => {
    const card = rect(400, 5, 200, 280)
    const result = computeEdgeTranslate(card, container, SCALE, GLOW)
    expect(result).not.toBeNull()
    expect(result!.x).toBe(0)
    expect(result!.y).toBeGreaterThan(0) // shifts down
  })

  it('shifts up when card is at bottom edge', () => {
    // Card bottom = 795. Scaled bottom = 795 + (280*0.15/2) = 795 + 21 = 816.
    // With glow: 816 + 18 = 834. Container bottom = 800.
    // Shift = 800 - 834 = -34
    const card = rect(400, 515, 200, 280)
    const result = computeEdgeTranslate(card, container, SCALE, GLOW)
    expect(result).not.toBeNull()
    expect(result!.x).toBe(0)
    expect(result!.y).toBeLessThan(0) // shifts up
  })

  it('shifts both axes for a corner card', () => {
    const card = rect(5, 5, 200, 280)
    const result = computeEdgeTranslate(card, container, SCALE, GLOW)
    expect(result).not.toBeNull()
    expect(result!.x).toBeGreaterThan(0) // right
    expect(result!.y).toBeGreaterThan(0) // down
  })

  it('returns null when card has enough clearance from all edges', () => {
    // Card at (200, 200), well away from edges
    const card = rect(200, 200, 200, 280)
    expect(computeEdgeTranslate(card, container, SCALE, GLOW)).toBeNull()
  })

  it('shift is proportional to overflow amount', () => {
    // Barely clipping left edge vs deeply clipping
    const barelyClipping = rect(20, 300, 200, 280)
    const deeplyClipping = rect(2, 300, 200, 280)

    const result1 = computeEdgeTranslate(barelyClipping, container, SCALE, GLOW)
    const result2 = computeEdgeTranslate(deeplyClipping, container, SCALE, GLOW)

    // Both shift right, but the deeper clip shifts more
    expect(result1).not.toBeNull()
    expect(result2).not.toBeNull()
    expect(result2!.x).toBeGreaterThan(result1!.x)
  })

  it('respects custom scale factor', () => {
    // With scale=1.0 (no scaling), only glow matters
    const card = rect(15, 300, 200, 280)
    const noScale = computeEdgeTranslate(card, container, 1.0, GLOW)
    const withScale = computeEdgeTranslate(card, container, 1.3, GLOW)

    // Larger scale = more overflow = larger shift
    if (noScale && withScale) {
      expect(withScale.x).toBeGreaterThan(noScale.x)
    }
  })

  it('respects custom glow padding', () => {
    const card = rect(20, 300, 200, 280)
    const smallGlow = computeEdgeTranslate(card, container, SCALE, 5)
    const bigGlow = computeEdgeTranslate(card, container, SCALE, 30)

    // Bigger glow = more padding needed = potentially larger shift
    if (bigGlow) {
      expect(bigGlow.x).toBeGreaterThanOrEqual(smallGlow?.x ?? 0)
    }
  })

  it('handles container with non-zero origin', () => {
    // Container starts at (50, 100) — like a sidebar layout
    const offsetContainer = rect(50, 100, 900, 600)
    const card = rect(55, 105, 200, 280)
    const result = computeEdgeTranslate(card, offsetContainer, SCALE, GLOW)
    expect(result).not.toBeNull()
    expect(result!.x).toBeGreaterThan(0) // shifts right away from left edge at x=50
  })
})
