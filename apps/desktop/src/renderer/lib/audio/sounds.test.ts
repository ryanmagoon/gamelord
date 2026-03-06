import { describe, it, expect } from 'vitest'
import { renderBuffer, soundGenerators } from './sounds'

/**
 * Minimal BaseAudioContext stub for testing.
 *
 * The synthesis functions only use `ctx.sampleRate` and `ctx.createBuffer()`.
 * We provide a real Float32Array-backed buffer so sample values can be
 * inspected without mocking the Web Audio API.
 */
function createTestContext(sampleRate = 44_100): BaseAudioContext {
  return {
    createBuffer(channels: number, length: number, sr: number) {
      const data = new Float32Array(length)
      return {
        sampleRate: sr,
        length,
        numberOfChannels: channels,
        duration: length / sr,
        getChannelData(channel: number) {
          if (channel !== 0) {throw new Error('Only mono buffers supported in test stub')}
          return data
        },
        copyFromChannel: () => { /* stub */ },
        copyToChannel: () => { /* stub */ },
      } as unknown as AudioBuffer
    },
    sampleRate,
  } as unknown as BaseAudioContext
}

describe('renderBuffer', () => {
  it('creates a buffer with the expected sample count', () => {
    const ctx = createTestContext(44_100)
    const buffer = renderBuffer(ctx, 0.1, (t) => Math.sin(2 * Math.PI * 440 * t))
    expect(buffer.length).toBe(Math.ceil(0.1 * 44_100))
    expect(buffer.numberOfChannels).toBe(1)
  })

  it('fills the buffer with generator output', () => {
    const ctx = createTestContext(44_100)
    const buffer = renderBuffer(ctx, 0.01, () => 0.5)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBe(0.5)
    }
  })
})

describe('sound generators', () => {
  const ctx = createTestContext(44_100)

  for (const [name, generator] of Object.entries(soundGenerators)) {
    describe(name, () => {
      const buffer = generator(ctx)

      it('produces a mono AudioBuffer', () => {
        expect(buffer.numberOfChannels).toBe(1)
      })

      it('has a positive duration between 30ms and 500ms', () => {
        expect(buffer.duration).toBeGreaterThanOrEqual(0.03)
        expect(buffer.duration).toBeLessThanOrEqual(0.5)
      })

      it('has samples within [-1, 1] range', () => {
        const data = buffer.getChannelData(0)
        for (let i = 0; i < data.length; i++) {
          expect(data[i]).toBeGreaterThanOrEqual(-1)
          expect(data[i]).toBeLessThanOrEqual(1)
        }
      })

      it('does not consist entirely of silence', () => {
        const data = buffer.getChannelData(0)
        const hasNonZero = data.some((v) => Math.abs(v) > 0.001)
        expect(hasNonZero).toBe(true)
      })

      it('ends near silence (no abrupt cutoff)', () => {
        const data = buffer.getChannelData(0)
        // Check last 5% of samples — average amplitude should be low
        const tailStart = Math.floor(data.length * 0.95)
        let sumAbs = 0
        for (let i = tailStart; i < data.length; i++) {
          sumAbs += Math.abs(data[i])
        }
        const avgTail = sumAbs / (data.length - tailStart)
        // Allow up to 0.15 average amplitude in the tail (some sounds sustain)
        expect(avgTail).toBeLessThan(0.15)
      })
    })
  }
})
