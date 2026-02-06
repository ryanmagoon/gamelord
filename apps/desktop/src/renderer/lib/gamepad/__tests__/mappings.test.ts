import { describe, it, expect } from 'vitest'
import {
  STANDARD_GAMEPAD_MAPPING,
  LIBRETRO_BUTTON,
  ANALOG_DEADZONE,
} from '../mappings'

describe('STANDARD_GAMEPAD_MAPPING', () => {
  it('has 16 entries matching the W3C standard gamepad layout', () => {
    expect(STANDARD_GAMEPAD_MAPPING).toHaveLength(16)
  })

  it('maps all entries to valid libretro button IDs (0-15)', () => {
    for (const retroId of STANDARD_GAMEPAD_MAPPING) {
      if (retroId !== null) {
        expect(retroId).toBeGreaterThanOrEqual(0)
        expect(retroId).toBeLessThanOrEqual(15)
      }
    }
  })

  it('has no duplicate libretro button IDs', () => {
    const nonNullIds = STANDARD_GAMEPAD_MAPPING.filter(
      (id): id is number => id !== null,
    )
    const uniqueIds = new Set(nonNullIds)
    expect(uniqueIds.size).toBe(nonNullIds.length)
  })

  it('maps face buttons correctly (Xbox positional → libretro)', () => {
    expect(STANDARD_GAMEPAD_MAPPING[0]).toBe(LIBRETRO_BUTTON.A) // bottom face → A
    expect(STANDARD_GAMEPAD_MAPPING[1]).toBe(LIBRETRO_BUTTON.B) // right face → B
    expect(STANDARD_GAMEPAD_MAPPING[2]).toBe(LIBRETRO_BUTTON.X) // left face → X
    expect(STANDARD_GAMEPAD_MAPPING[3]).toBe(LIBRETRO_BUTTON.Y) // top face → Y
  })

  it('maps shoulder buttons correctly', () => {
    expect(STANDARD_GAMEPAD_MAPPING[4]).toBe(LIBRETRO_BUTTON.L)
    expect(STANDARD_GAMEPAD_MAPPING[5]).toBe(LIBRETRO_BUTTON.R)
    expect(STANDARD_GAMEPAD_MAPPING[6]).toBe(LIBRETRO_BUTTON.L2)
    expect(STANDARD_GAMEPAD_MAPPING[7]).toBe(LIBRETRO_BUTTON.R2)
  })

  it('maps d-pad buttons correctly', () => {
    expect(STANDARD_GAMEPAD_MAPPING[12]).toBe(LIBRETRO_BUTTON.UP)
    expect(STANDARD_GAMEPAD_MAPPING[13]).toBe(LIBRETRO_BUTTON.DOWN)
    expect(STANDARD_GAMEPAD_MAPPING[14]).toBe(LIBRETRO_BUTTON.LEFT)
    expect(STANDARD_GAMEPAD_MAPPING[15]).toBe(LIBRETRO_BUTTON.RIGHT)
  })

  it('maps start/select correctly', () => {
    expect(STANDARD_GAMEPAD_MAPPING[8]).toBe(LIBRETRO_BUTTON.SELECT)
    expect(STANDARD_GAMEPAD_MAPPING[9]).toBe(LIBRETRO_BUTTON.START)
  })

  it('maps stick presses correctly', () => {
    expect(STANDARD_GAMEPAD_MAPPING[10]).toBe(LIBRETRO_BUTTON.L3)
    expect(STANDARD_GAMEPAD_MAPPING[11]).toBe(LIBRETRO_BUTTON.R3)
  })
})

describe('LIBRETRO_BUTTON', () => {
  it('defines all 16 joypad buttons with unique IDs', () => {
    const values = Object.values(LIBRETRO_BUTTON)
    expect(values).toHaveLength(16)
    expect(new Set(values).size).toBe(16)
  })
})

describe('ANALOG_DEADZONE', () => {
  it('is a reasonable deadzone value between 0 and 1', () => {
    expect(ANALOG_DEADZONE).toBeGreaterThan(0)
    expect(ANALOG_DEADZONE).toBeLessThan(1)
  })
})
