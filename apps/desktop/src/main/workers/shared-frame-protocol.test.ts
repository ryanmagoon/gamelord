import { describe, it, expect } from 'vitest'
import {
  computeVideoBufferSize,
  CTRL_SAB_BYTE_LENGTH,
  CTRL_ACTIVE_BUFFER,
  CTRL_FRAME_SEQUENCE,
  CTRL_FRAME_WIDTH,
  CTRL_FRAME_HEIGHT,
  CTRL_AUDIO_WRITE_POS,
  CTRL_AUDIO_READ_POS,
  CTRL_AUDIO_SAMPLE_RATE,
  AUDIO_RING_SAMPLES,
  AUDIO_RING_BYTE_LENGTH,
} from './shared-frame-protocol'

describe('shared-frame-protocol', () => {
  describe('control SAB layout', () => {
    it('has unique field indices', () => {
      const indices = [
        CTRL_ACTIVE_BUFFER,
        CTRL_FRAME_SEQUENCE,
        CTRL_FRAME_WIDTH,
        CTRL_FRAME_HEIGHT,
        CTRL_AUDIO_WRITE_POS,
        CTRL_AUDIO_READ_POS,
        CTRL_AUDIO_SAMPLE_RATE,
      ]
      expect(new Set(indices).size).toBe(indices.length)
    })

    it('control SAB is 32 bytes (8 × Int32)', () => {
      expect(CTRL_SAB_BYTE_LENGTH).toBe(32)
    })

    it('all indices fit within control SAB', () => {
      const maxIndex = Math.max(
        CTRL_ACTIVE_BUFFER,
        CTRL_FRAME_SEQUENCE,
        CTRL_FRAME_WIDTH,
        CTRL_FRAME_HEIGHT,
        CTRL_AUDIO_WRITE_POS,
        CTRL_AUDIO_READ_POS,
        CTRL_AUDIO_SAMPLE_RATE,
      )
      const elementCount = CTRL_SAB_BYTE_LENGTH / Int32Array.BYTES_PER_ELEMENT
      expect(maxIndex).toBeLessThan(elementCount)
    })
  })

  describe('audio ring buffer', () => {
    it('sample count is a power of 2', () => {
      expect(AUDIO_RING_SAMPLES & (AUDIO_RING_SAMPLES - 1)).toBe(0)
    })

    it('byte length matches sample count × 2', () => {
      expect(AUDIO_RING_BYTE_LENGTH).toBe(AUDIO_RING_SAMPLES * 2)
    })
  })

  describe('computeVideoBufferSize', () => {
    it('uses max dimensions when available', () => {
      expect(computeVideoBufferSize(512, 480, 256, 240)).toBe(512 * 480 * 4)
    })

    it('falls back to base dimensions clamped to 1024 when max is 0', () => {
      expect(computeVideoBufferSize(0, 0, 256, 240)).toBe(1024 * 1024 * 4)
    })

    it('uses base dimensions when they exceed 1024 and max is 0', () => {
      expect(computeVideoBufferSize(0, 0, 2048, 1536)).toBe(2048 * 1536 * 4)
    })

    it('returns RGBA8888 size (4 bytes per pixel)', () => {
      const size = computeVideoBufferSize(100, 100, 100, 100)
      expect(size).toBe(100 * 100 * 4)
    })
  })
})
