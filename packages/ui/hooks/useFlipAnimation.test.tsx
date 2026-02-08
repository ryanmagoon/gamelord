import React, { useRef } from 'react'
import { render, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFlipAnimation, type FlipItem } from './useFlipAnimation'

interface TestItem {
  id: string
  label: string
}

/**
 * Test harness that renders the hook output as a list of divs inside a
 * grid container so we can inspect the FlipItem results.
 */
function TestComponent({
  items,
  onResult,
  duration = 300,
  exitDuration = 200,
}: {
  items: TestItem[]
  onResult: (results: FlipItem<TestItem>[]) => void
  duration?: number
  exitDuration?: number
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const getKey = (item: TestItem) => item.id

  const flipItems = useFlipAnimation(items, getKey, {
    gridRef,
    duration,
    exitDuration,
  })

  // Report results so tests can inspect them synchronously
  onResult(flipItems)

  return (
    <div ref={gridRef} data-testid="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 100px)' }}>
      {flipItems.map((flipItem) => (
        <div
          key={flipItem.key}
          ref={flipItem.ref}
          data-testid={`item-${flipItem.key}`}
          data-state={flipItem.animationState}
          style={flipItem.style}
        >
          {flipItem.item.label}
        </div>
      ))}
    </div>
  )
}

describe('useFlipAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks all items as entering on first render', () => {
    const items: TestItem[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
      { id: '3', label: 'C' },
    ]

    let result: FlipItem<TestItem>[] = []
    render(<TestComponent items={items} onResult={(r) => { result = r }} />)

    expect(result).toHaveLength(3)
    expect(result.every((r) => r.animationState === 'entering')).toBe(true)
  })

  it('assigns staggered enter delays on first render', () => {
    const items: TestItem[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
      { id: '3', label: 'C' },
    ]

    let result: FlipItem<TestItem>[] = []
    render(<TestComponent items={items} onResult={(r) => { result = r }} />)

    expect(result[0].enterDelay).toBe(0)
    expect(result[1].enterDelay).toBe(40)
    expect(result[2].enterDelay).toBe(80)
  })

  it('marks unchanged items as stable on re-render', () => {
    const items: TestItem[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ]

    let result: FlipItem<TestItem>[] = []
    const { rerender } = render(
      <TestComponent items={items} onResult={(r) => { result = r }} />,
    )

    // After first render, advance rAF so positions are captured
    act(() => {
      vi.advanceTimersByTime(16)
    })

    // Re-render with the same items
    rerender(<TestComponent items={items} onResult={(r) => { result = r }} />)

    expect(result).toHaveLength(2)
    expect(result.every((r) => r.animationState === 'stable')).toBe(true)
    expect(result.every((r) => r.enterDelay === 0)).toBe(true)
  })

  it('marks new items as entering when added', () => {
    const initialItems: TestItem[] = [
      { id: '1', label: 'A' },
    ]
    const updatedItems: TestItem[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
      { id: '3', label: 'C' },
    ]

    let result: FlipItem<TestItem>[] = []
    const { rerender } = render(
      <TestComponent items={initialItems} onResult={(r) => { result = r }} />,
    )

    act(() => {
      vi.advanceTimersByTime(16)
    })

    rerender(<TestComponent items={updatedItems} onResult={(r) => { result = r }} />)

    const stableItems = result.filter((r) => r.animationState === 'stable')
    const enteringItems = result.filter((r) => r.animationState === 'entering')

    expect(stableItems).toHaveLength(1)
    expect(stableItems[0].key).toBe('1')

    expect(enteringItems).toHaveLength(2)
    expect(enteringItems[0].key).toBe('2')
    expect(enteringItems[1].key).toBe('3')
  })

  it('marks removed items as exiting', () => {
    const initialItems: TestItem[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
      { id: '3', label: 'C' },
    ]
    const updatedItems: TestItem[] = [
      { id: '1', label: 'A' },
    ]

    let result: FlipItem<TestItem>[] = []
    const { rerender } = render(
      <TestComponent items={initialItems} onResult={(r) => { result = r }} />,
    )

    act(() => {
      vi.advanceTimersByTime(16)
    })

    rerender(<TestComponent items={updatedItems} onResult={(r) => { result = r }} />)

    const stableItems = result.filter((r) => r.animationState === 'stable')
    const exitingItems = result.filter((r) => r.animationState === 'exiting')

    expect(stableItems).toHaveLength(1)
    expect(stableItems[0].key).toBe('1')

    expect(exitingItems).toHaveLength(2)
    expect(exitingItems.map((r) => r.key).sort()).toEqual(['2', '3'])
  })

  it('removes exiting items after exitDuration elapses', () => {
    const initialItems: TestItem[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ]
    const updatedItems: TestItem[] = [
      { id: '1', label: 'A' },
    ]
    const exitDuration = 200

    let result: FlipItem<TestItem>[] = []
    const { rerender } = render(
      <TestComponent
        items={initialItems}
        exitDuration={exitDuration}
        onResult={(r) => { result = r }}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(16)
    })

    rerender(
      <TestComponent
        items={updatedItems}
        exitDuration={exitDuration}
        onResult={(r) => { result = r }}
      />,
    )

    // Exiter should be present
    expect(result.filter((r) => r.animationState === 'exiting')).toHaveLength(1)

    // Advance past the exit duration + buffer
    act(() => {
      vi.advanceTimersByTime(exitDuration + 20)
    })

    // The exiting item should be gone
    expect(result.filter((r) => r.animationState === 'exiting')).toHaveLength(0)
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('1')
  })

  it('assigns absolute positioning to exiting items', () => {
    const initialItems: TestItem[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ]
    const updatedItems: TestItem[] = [
      { id: '1', label: 'A' },
    ]

    let result: FlipItem<TestItem>[] = []
    const { rerender } = render(
      <TestComponent items={initialItems} onResult={(r) => { result = r }} />,
    )

    act(() => {
      vi.advanceTimersByTime(16)
    })

    rerender(<TestComponent items={updatedItems} onResult={(r) => { result = r }} />)

    const exitingItems = result.filter((r) => r.animationState === 'exiting')
    expect(exitingItems).toHaveLength(1)
    expect(exitingItems[0].style.position).toBe('absolute')
    expect(exitingItems[0].style.zIndex).toBe(0)
  })

  it('gives stable/entering items a higher z-index than exiters', () => {
    const items: TestItem[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ]

    let result: FlipItem<TestItem>[] = []
    const { rerender } = render(
      <TestComponent items={items} onResult={(r) => { result = r }} />,
    )

    act(() => {
      vi.advanceTimersByTime(16)
    })

    // Remove item 2, keep item 1
    rerender(<TestComponent items={[items[0]]} onResult={(r) => { result = r }} />)

    const stableItem = result.find((r) => r.animationState === 'stable')
    const exitingItem = result.find((r) => r.animationState === 'exiting')

    expect(stableItem).toBeDefined()
    expect(exitingItem).toBeDefined()
    expect((stableItem!.style.zIndex as number)).toBeGreaterThan(exitingItem!.style.zIndex as number)
  })

  it('returns empty list for empty input', () => {
    let result: FlipItem<TestItem>[] = []
    render(<TestComponent items={[]} onResult={(r) => { result = r }} />)

    expect(result).toHaveLength(0)
  })

  it('handles all items being removed (full exit)', () => {
    const initialItems: TestItem[] = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ]

    let result: FlipItem<TestItem>[] = []
    const { rerender } = render(
      <TestComponent items={initialItems} onResult={(r) => { result = r }} />,
    )

    act(() => {
      vi.advanceTimersByTime(16)
    })

    rerender(<TestComponent items={[]} onResult={(r) => { result = r }} />)

    expect(result.filter((r) => r.animationState === 'exiting')).toHaveLength(2)
    expect(result.filter((r) => r.animationState === 'stable')).toHaveLength(0)
    expect(result.filter((r) => r.animationState === 'entering')).toHaveLength(0)
  })

  it('provides stable ref callbacks across renders', () => {
    const items: TestItem[] = [
      { id: '1', label: 'A' },
    ]

    let firstResult: FlipItem<TestItem>[] = []
    let secondResult: FlipItem<TestItem>[] = []

    const { rerender } = render(
      <TestComponent items={items} onResult={(r) => { firstResult = r }} />,
    )

    act(() => {
      vi.advanceTimersByTime(16)
    })

    rerender(
      <TestComponent items={items} onResult={(r) => { secondResult = r }} />,
    )

    // The ref callback should be referentially stable for the same key
    expect(firstResult[0].ref).toBe(secondResult[0].ref)
  })
})
