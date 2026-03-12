/**
 * Synthesized UI sound effects — pure math, no Web Audio nodes required.
 *
 * Each function fills a Float32Array with samples and returns it wrapped in an
 * AudioBuffer. All sounds target a retro/8-bit aesthetic to match the CRT/VHS
 * visual theme.
 */

// ─── Waveform Primitives ─────────────────────────────────────────────

function squareWave(t: number, freq: number): number {
  return Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1;
}

function triangleWave(t: number, freq: number): number {
  const phase = (t * freq) % 1;
  return 4 * Math.abs(phase - 0.5) - 1;
}

function sineWave(t: number, freq: number): number {
  return Math.sin(2 * Math.PI * freq * t);
}

/** Deterministic-ish white noise via simple hash. */
function noise(sampleIndex: number): number {
  // Fast integer hash (xorshift-inspired) for reproducible noise
  let x = (sampleIndex + 1) * 374_761_393;
  x = ((x >> 16) ^ x) * 668_265_263;
  x = ((x >> 16) ^ x) * 668_265_263;
  x = (x >> 16) ^ x;
  return (x & 0xff_ff) / 0x80_00 - 1; // range [-1, 1]
}

// ─── Envelope Helpers ────────────────────────────────────────────────

/** Linear ramp from 1 to 0 over the full duration. */
function linearDecay(t: number, duration: number): number {
  return Math.max(0, 1 - t / duration);
}

/** Exponential decay (fast initial drop). */
function expDecay(t: number, tau: number): number {
  return Math.exp(-t / tau);
}

/** Attack-decay envelope. */
function adEnvelope(t: number, attack: number, decay: number): number {
  if (t < attack) {
    return t / attack;
  }
  return expDecay(t - attack, decay);
}

// ─── Buffer Construction ─────────────────────────────────────────────

/**
 * Create an AudioBuffer from a sample generator function.
 *
 * The generator receives the time in seconds and the absolute sample index,
 * and should return a value in [-1, 1].
 */
export function renderBuffer(
  ctx: BaseAudioContext,
  durationS: number,
  generator: (t: number, sampleIndex: number) => number,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(durationS * sampleRate);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    channel[i] = generator(i / sampleRate, i);
  }
  return buffer;
}

// ─── Sound Definitions ──────────────────────────────────────────────

/** Short square-wave blip — NES menu cursor feel. */
export function click(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.05;
  return renderBuffer(ctx, dur, (t) => {
    return squareWave(t, 1000) * linearDecay(t, dur) * 0.3;
  });
}

/** Two-note ascending chirp (800→1200 Hz). */
export function toggleOn(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.08;
  return renderBuffer(ctx, dur, (t) => {
    const freq = t < dur / 2 ? 800 : 1200;
    const localT = t < dur / 2 ? t : t - dur / 2;
    return squareWave(t, freq) * expDecay(localT, 0.03) * 0.25;
  });
}

/** Two-note descending chirp (1200→800 Hz). */
export function toggleOff(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.08;
  return renderBuffer(ctx, dur, (t) => {
    const freq = t < dur / 2 ? 1200 : 800;
    const localT = t < dur / 2 ? t : t - dur / 2;
    return squareWave(t, freq) * expDecay(localT, 0.03) * 0.25;
  });
}

/** Descending FM sweep — "data write" feel. */
export function saveState(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.15;
  return renderBuffer(ctx, dur, (t) => {
    const freq = 1200 - (800 * t) / dur;
    return squareWave(t, freq) * expDecay(t, 0.08) * 0.25;
  });
}

/** Ascending FM sweep — "data read" feel. */
export function loadState(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.15;
  return renderBuffer(ctx, dur, (t) => {
    const freq = 400 + (800 * t) / dur;
    return squareWave(t, freq) * expDecay(t, 0.08) * 0.25;
  });
}

/** Low square tone, quick decay — subdued pause indicator. */
export function pause(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.1;
  return renderBuffer(ctx, dur, (t) => {
    return squareWave(t, 300) * expDecay(t, 0.04) * 0.25;
  });
}

/** Higher square tone, quick attack — brighter resume indicator. */
export function resume(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.1;
  return renderBuffer(ctx, dur, (t) => {
    return squareWave(t, 600) * adEnvelope(t, 0.005, 0.04) * 0.25;
  });
}

/** CRT warm-up: rising filtered noise + 60 Hz hum + high zap. */
export function powerOn(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.3;
  return renderBuffer(ctx, dur, (t, i) => {
    // Rising noise: simple low-pass approximation via mixing
    const noiseAmp = expDecay(dur - t, 0.15); // rises then holds
    const noiseSample = noise(i) * noiseAmp;

    // 60 Hz mains hum, fading in
    const hum = sineWave(t, 60) * (t / dur) * 0.15;

    // Brief high-frequency zap in first 30ms
    const zap = t < 0.03 ? squareWave(t, 2000) * expDecay(t, 0.01) * 0.4 : 0;

    return (noiseSample * 0.2 + hum + zap) * adEnvelope(t, 0.01, 0.2);
  });
}

/** CRT cool-down: descending noise + dying hum. */
export function powerOff(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.25;
  return renderBuffer(ctx, dur, (t, i) => {
    // Fading noise
    const noiseSample = noise(i) * expDecay(t, 0.1);

    // Dying 60 Hz hum
    const hum = sineWave(t, 60) * expDecay(t, 0.12) * 0.15;

    return (noiseSample * 0.2 + hum) * expDecay(t, 0.15);
  });
}

/** Rising sweep + noise burst — matches dialog scan-in animation. */
export function dialogOpen(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.12;
  return renderBuffer(ctx, dur, (t, i) => {
    const freq = 400 + (400 * t) / dur;
    const sweep = squareWave(t, freq) * 0.15;

    // Brief noise burst in first 40ms
    const noiseBurst = t < 0.04 ? noise(i) * expDecay(t, 0.015) * 0.1 : 0;

    return (sweep + noiseBurst) * adEnvelope(t, 0.005, 0.06);
  });
}

/** Descending sweep — dialog close. */
export function dialogClose(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.1;
  return renderBuffer(ctx, dur, (t) => {
    const freq = 800 - (400 * t) / dur;
    return squareWave(t, freq) * expDecay(t, 0.04) * 0.15;
  });
}

/** Camera shutter: sharp noise burst + settling click. */
export function screenshot(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.18;
  return renderBuffer(ctx, dur, (t, i) => {
    // Initial sharp burst (20ms)
    if (t < 0.02) {
      return noise(i) * expDecay(t, 0.008) * 0.4;
    }
    // Settling click after gap (at ~100ms, 10ms duration)
    if (t >= 0.1 && t < 0.11) {
      return squareWave(t, 2000) * expDecay(t - 0.1, 0.004) * 0.2;
    }
    return 0;
  });
}

/** Cheerful major-fifth chirp — triangle wave, celebratory. */
export function favoritePop(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.12;
  return renderBuffer(ctx, dur, (t) => {
    // A5 (880 Hz) for first half, E6 (1320 Hz) for second — major fifth
    const freq = t < dur / 2 ? 880 : 1320;
    const localT = t < dur / 2 ? t : t - dur / 2;
    return triangleWave(t, freq) * expDecay(localT, 0.035) * 0.3;
  });
}

/** Three ascending notes: C5/E5/G5 — triumphant major arpeggio. */
export function syncComplete(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.2;
  const noteLen = 0.05;
  const gap = 0.015;
  const step = noteLen + gap;
  const freqs = [523, 659, 784]; // C5, E5, G5

  return renderBuffer(ctx, dur, (t) => {
    const noteIndex = Math.floor(t / step);
    if (noteIndex >= freqs.length) {
      return 0;
    }

    const noteStart = noteIndex * step;
    const noteT = t - noteStart;
    if (noteT > noteLen) {
      return 0;
    } // in the gap

    return squareWave(t, freqs[noteIndex]) * expDecay(noteT, 0.03) * 0.25;
  });
}

/** Two descending buzzy notes — "wrong answer" buzzer. */
export function error(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.2;
  return renderBuffer(ctx, dur, (t) => {
    const freq = t < 0.08 ? 400 : 250;
    const localT = t < 0.08 ? t : t - 0.08;
    // Slight clipping for buzz character
    const raw = squareWave(t, freq) * expDecay(localT, 0.05) * 0.35;
    return Math.max(-0.3, Math.min(0.3, raw));
  });
}

/** Three rapid bursts — communicates speed/rapidity. */
export function fastForward(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.1;
  const burstLen = 0.015;
  const gapLen = 0.01;
  const period = burstLen + gapLen;

  return renderBuffer(ctx, dur, (t) => {
    const phase = t % period;
    if (phase > burstLen) {
      return 0;
    } // in gap
    return squareWave(t, 1500) * expDecay(phase, 0.008) * 0.2;
  });
}

/** Bright affirming blip — triangle wave resolving on a major third. */
export function confirm(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.09;
  return renderBuffer(ctx, dur, (t) => {
    // C6 (1047 Hz) → E6 (1319 Hz) — major third, feels conclusive
    const freq = t < 0.04 ? 1047 : 1319;
    const localT = t < 0.04 ? t : t - 0.04;
    return triangleWave(t, freq) * expDecay(localT, 0.025) * 0.25;
  });
}

/** Subtle rising tick — lightweight popup/menu appearance. */
export function menuOpen(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.04;
  return renderBuffer(ctx, dur, (t) => {
    const freq = 800 + (400 * t) / dur;
    return squareWave(t, freq) * expDecay(t, 0.015) * 0.12;
  });
}

/** Subtle falling tick — lightweight popup/menu dismissal. */
export function menuClose(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.035;
  return renderBuffer(ctx, dur, (t) => {
    const freq = 1000 - (300 * t) / dur;
    return squareWave(t, freq) * expDecay(t, 0.012) * 0.1;
  });
}

/** Ascending sweep + sustain — "powering up" feel. */
export function cardLaunch(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.2;
  return renderBuffer(ctx, dur, (t) => {
    let freq: number;
    if (t < 0.15) {
      freq = 200 + (1400 * t) / 0.15;
    } else {
      freq = 1600;
    }
    return squareWave(t, freq) * adEnvelope(t, 0.005, 0.12) * 0.2;
  });
}

// ─── Registry ────────────────────────────────────────────────────────

/** All sound synthesis functions keyed by SfxId. */
export const soundGenerators = {
  cardLaunch,
  click,
  confirm,
  dialogClose,
  dialogOpen,
  error,
  fastForward,
  favoritePop,
  loadState,
  menuClose,
  menuOpen,
  pause,
  powerOff,
  powerOn,
  resume,
  saveState,
  screenshot,
  syncComplete,
  toggleOff,
  toggleOn,
} as const;
