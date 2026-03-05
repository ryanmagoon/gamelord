import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { tvStaticManager } from './TVStaticManager'

// happy-dom doesn't provide ImageData — polyfill it for these tests.
beforeAll(() => {
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      readonly width: number
      readonly height: number
      readonly data: Uint8ClampedArray
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
        this.data = new Uint8ClampedArray(width * height * 4)
      }
    } as unknown as typeof globalThis.ImageData
  }
})

/**
 * Create a minimal HTMLCanvasElement stub with a fake 2D context that
 * captures putImageData calls for assertion.
 */
function createStubCanvas() {
  const putCalls: ImageData[] = []
  const ctx = {
    putImageData(imageData: ImageData) {
      putCalls.push(imageData)
    },
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(ctx),
  } as unknown as HTMLCanvasElement

  return { canvas, putCalls }
}

describe('TVStaticManager deterministic mode', () => {
  beforeEach(() => {
    tvStaticManager.setDeterministic(false)
  })

  it('draws exactly one frame on register when deterministic', () => {
    tvStaticManager.setDeterministic(true)
    const { canvas, putCalls } = createStubCanvas()

    const unregister = tvStaticManager.register(canvas, 64)
    expect(putCalls).toHaveLength(1)

    unregister()
  })

  it('produces identical pixel data across two registrations', () => {
    tvStaticManager.setDeterministic(true)

    const a = createStubCanvas()
    const b = createStubCanvas()

    const unregA = tvStaticManager.register(a.canvas, 64)
    const unregB = tvStaticManager.register(b.canvas, 64)

    expect(a.putCalls).toHaveLength(1)
    expect(b.putCalls).toHaveLength(1)

    const dataA = Array.from(a.putCalls[0].data)
    const dataB = Array.from(b.putCalls[0].data)
    expect(dataA).toEqual(dataB)

    unregA()
    unregB()
  })

  it('does not start rAF loop in deterministic mode', () => {
    tvStaticManager.setDeterministic(true)
    const spy = vi.spyOn(globalThis, 'requestAnimationFrame')

    const { canvas } = createStubCanvas()
    const unregister = tvStaticManager.register(canvas, 64)

    expect(spy).not.toHaveBeenCalled()

    unregister()
    spy.mockRestore()
  })
})
