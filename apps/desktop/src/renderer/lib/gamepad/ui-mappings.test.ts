import { describe, it, expect } from 'vitest'
import {
  UI_BUTTON_MAPPING,
  KEYBOARD_UI_MAPPING,
  REPEATABLE_ACTIONS,
  REPEAT_INITIAL_DELAY,
  REPEAT_INTERVAL,
  type UIAction,
} from './ui-mappings'

describe('UI_BUTTON_MAPPING', () => {
  it('has 16 entries matching the W3C standard gamepad layout', () => {
    expect(UI_BUTTON_MAPPING).toHaveLength(16)
  })

  it('maps A button (index 0) to select', () => {
    expect(UI_BUTTON_MAPPING[0]).toBe('select')
  })

  it('maps B button (index 1) to back', () => {
    expect(UI_BUTTON_MAPPING[1]).toBe('back')
  })

  it('maps bumpers to page navigation', () => {
    expect(UI_BUTTON_MAPPING[4]).toBe('page-left')
    expect(UI_BUTTON_MAPPING[5]).toBe('page-right')
  })

  it('maps Start (index 9) to menu', () => {
    expect(UI_BUTTON_MAPPING[9]).toBe('menu')
  })

  it('maps D-pad to navigation directions', () => {
    expect(UI_BUTTON_MAPPING[12]).toBe('navigate-up')
    expect(UI_BUTTON_MAPPING[13]).toBe('navigate-down')
    expect(UI_BUTTON_MAPPING[14]).toBe('navigate-left')
    expect(UI_BUTTON_MAPPING[15]).toBe('navigate-right')
  })

  it('has no duplicate non-null actions', () => {
    const nonNull = UI_BUTTON_MAPPING.filter((a): a is UIAction => a !== null)
    const unique = new Set(nonNull)
    expect(unique.size).toBe(nonNull.length)
  })

  it('leaves triggers and unused buttons as null', () => {
    expect(UI_BUTTON_MAPPING[2]).toBeNull()  // X
    expect(UI_BUTTON_MAPPING[3]).toBeNull()  // Y
    expect(UI_BUTTON_MAPPING[6]).toBeNull()  // Left trigger
    expect(UI_BUTTON_MAPPING[7]).toBeNull()  // Right trigger
    expect(UI_BUTTON_MAPPING[8]).toBeNull()  // Select
    expect(UI_BUTTON_MAPPING[10]).toBeNull() // L3
    expect(UI_BUTTON_MAPPING[11]).toBeNull() // R3
  })
})

describe('KEYBOARD_UI_MAPPING', () => {
  it('maps arrow keys to navigation directions', () => {
    expect(KEYBOARD_UI_MAPPING.ArrowUp).toBe('navigate-up')
    expect(KEYBOARD_UI_MAPPING.ArrowDown).toBe('navigate-down')
    expect(KEYBOARD_UI_MAPPING.ArrowLeft).toBe('navigate-left')
    expect(KEYBOARD_UI_MAPPING.ArrowRight).toBe('navigate-right')
  })

  it('maps Enter to select and Escape to back', () => {
    expect(KEYBOARD_UI_MAPPING.Enter).toBe('select')
    expect(KEYBOARD_UI_MAPPING.Escape).toBe('back')
  })
})

describe('REPEATABLE_ACTIONS', () => {
  it('includes all four navigation directions', () => {
    expect(REPEATABLE_ACTIONS.has('navigate-up')).toBe(true)
    expect(REPEATABLE_ACTIONS.has('navigate-down')).toBe(true)
    expect(REPEATABLE_ACTIONS.has('navigate-left')).toBe(true)
    expect(REPEATABLE_ACTIONS.has('navigate-right')).toBe(true)
  })

  it('does not include non-navigation actions', () => {
    expect(REPEATABLE_ACTIONS.has('select')).toBe(false)
    expect(REPEATABLE_ACTIONS.has('back')).toBe(false)
    expect(REPEATABLE_ACTIONS.has('menu')).toBe(false)
  })
})

describe('repeat timing constants', () => {
  it('has reasonable initial delay', () => {
    expect(REPEAT_INITIAL_DELAY).toBeGreaterThanOrEqual(200)
    expect(REPEAT_INITIAL_DELAY).toBeLessThanOrEqual(600)
  })

  it('has repeat interval shorter than initial delay', () => {
    expect(REPEAT_INTERVAL).toBeLessThan(REPEAT_INITIAL_DELAY)
    expect(REPEAT_INTERVAL).toBeGreaterThan(50)
  })
})
