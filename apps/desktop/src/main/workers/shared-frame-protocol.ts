/**
 * Zero-copy frame/audio transfer protocol using SharedArrayBuffer.
 *
 * Control SAB layout (Int32Array view, 8 elements):
 *   [0] activeBuffer   — 0 or 1 (which video buffer the renderer should read)
 *   [1] frameSequence  — monotonically increasing frame counter
 *   [2] frameWidth     — current frame width in pixels
 *   [3] frameHeight    — current frame height in pixels
 *   [4] audioWritePos  — ring buffer write position (monotonic Int16 sample count)
 *   [5] audioReadPos   — ring buffer read position (monotonic Int16 sample count)
 *   [6] audioSampleRate — sample rate reported by core (e.g. 44100, 48000)
 *   [7] reserved
 */

/** Control SAB field indices (Int32Array). */
export const CTRL_ACTIVE_BUFFER = 0
export const CTRL_FRAME_SEQUENCE = 1
export const CTRL_FRAME_WIDTH = 2
export const CTRL_FRAME_HEIGHT = 3
export const CTRL_AUDIO_WRITE_POS = 4
export const CTRL_AUDIO_READ_POS = 5
export const CTRL_AUDIO_SAMPLE_RATE = 6

/** Control SAB byte length (8 × 4 bytes). */
export const CTRL_SAB_BYTE_LENGTH = 8 * Int32Array.BYTES_PER_ELEMENT

/**
 * Audio ring buffer capacity in Int16 samples.
 * Power-of-2 for efficient modular arithmetic.
 * 32768 samples ≈ 341ms of stereo audio at 48kHz.
 */
export const AUDIO_RING_SAMPLES = 32768
export const AUDIO_RING_BYTE_LENGTH = AUDIO_RING_SAMPLES * Int16Array.BYTES_PER_ELEMENT

/**
 * Compute the byte size for a single video buffer from AV info geometry.
 * Falls back to 1024×1024 when the core reports 0 for max dimensions.
 */
export function computeVideoBufferSize(
  maxWidth: number,
  maxHeight: number,
  baseWidth: number,
  baseHeight: number,
): number {
  const w = maxWidth > 0 ? maxWidth : Math.max(baseWidth, 1024)
  const h = maxHeight > 0 ? maxHeight : Math.max(baseHeight, 1024)
  return w * h * 4 // RGBA8888
}
