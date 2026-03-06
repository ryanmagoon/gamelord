/**
 * Shared noise manager for TVStatic canvases.
 *
 * Instead of each TVStatic instance running its own requestAnimationFrame
 * loop (50+ canvases × 15fps = ~1M Math.random() calls/sec), this singleton
 * runs ONE rAF loop that generates noise into a shared buffer and distributes
 * it to all registered canvases.
 *
 * The loop auto-starts when the first canvas registers and auto-stops when
 * the last one unregisters.
 *
 * **Deterministic mode:** When `setDeterministic(true)` is called (e.g. by
 * Chromatic's Storybook preview), the manager uses a seeded PRNG and draws
 * exactly one frame per canvas registration — no animation loop. This ensures
 * screenshots are pixel-identical across runs.
 */

/** Target FPS for the noise animation — authentic CRT flicker rate. */
const TARGET_FPS = 15;

/** Width of the noise buffer in pixels. Canvases are CSS-scaled for chunky pixels. */
const NOISE_WIDTH = 64;

/**
 * Simple mulberry32 seeded PRNG — produces deterministic 0-1 floats from
 * a 32-bit seed. Used in place of Math.random() for Chromatic snapshots.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface RegisteredCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  noiseHeight: number;
}

class TVStaticManager {
  private canvases = new Map<HTMLCanvasElement, RegisteredCanvas>();
  private animFrameId = 0;
  private lastFrameTime = 0;
  /** Shared ImageData buffer — sized to the largest registered canvas height. */
  private imageData: ImageData | null = null;
  private maxNoiseHeight = 0;
  /** When true, draw a single deterministic frame instead of animating. */
  private deterministic = false;

  /**
   * Enable or disable deterministic mode.
   * In deterministic mode, each registered canvas receives exactly one
   * frame generated from a fixed seed — no rAF loop runs.
   */
  setDeterministic(enabled: boolean): void {
    this.deterministic = enabled;
  }

  /** Whether deterministic mode is active (e.g. Chromatic snapshot). */
  isDeterministic(): boolean {
    return this.deterministic
  }

  /**
   * Register a canvas to receive shared noise frames.
   * @returns An unregister function — call it in the useEffect cleanup.
   */
  register(canvas: HTMLCanvasElement, noiseHeight: number): () => void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return () => {
        /* intentional no-op */
      };
    }

    canvas.width = NOISE_WIDTH;
    canvas.height = noiseHeight;

    const entry: RegisteredCanvas = { canvas, ctx, noiseHeight };
    this.canvases.set(canvas, entry);

    if (this.deterministic) {
      // Draw one deterministic frame immediately — no animation loop.
      this.drawDeterministicFrame(entry);
      return () => {
        this.canvases.delete(canvas);
      };
    }

    // Rebuild shared buffer if this canvas is taller than the current max
    if (noiseHeight > this.maxNoiseHeight) {
      this.maxNoiseHeight = noiseHeight;
      this.imageData = null; // force rebuild on next frame
    }

    // Start loop if this is the first canvas
    if (this.canvases.size === 1) {
      this.startLoop();
    }

    return () => {
      this.canvases.delete(canvas);
      if (this.canvases.size === 0) {
        this.stopLoop();
        this.imageData = null;
        this.maxNoiseHeight = 0;
      } else {
        // Recalculate max height in case the tallest canvas was removed
        this.recalcMaxHeight();
      }
    };
  }

  /** Draw a single frame with a fixed seed — pixel-identical across runs. */
  private drawDeterministicFrame(entry: RegisteredCanvas) {
    const { ctx, noiseHeight } = entry;
    const imageData = new ImageData(NOISE_WIDTH, noiseHeight);
    const data = imageData.data;
    const pixels = NOISE_WIDTH * noiseHeight * 4;
    const rand = mulberry32(42);
    for (let i = 0; i < pixels; i += 4) {
      const value = rand() * 255;
      data[i] = value; // R
      data[i + 1] = value; // G
      data[i + 2] = value; // B
      data[i + 3] = 255; // A
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private recalcMaxHeight() {
    let max = 0;
    for (const entry of this.canvases.values()) {
      if (entry.noiseHeight > max) {
        max = entry.noiseHeight;
      }
    }
    if (max < this.maxNoiseHeight) {
      this.maxNoiseHeight = max;
      this.imageData = null; // force rebuild with smaller buffer
    }
  }

  private startLoop() {
    const draw = (timestamp: number) => {
      // Throttle to target FPS
      if (timestamp - this.lastFrameTime < 1000 / TARGET_FPS) {
        this.animFrameId = requestAnimationFrame(draw);
        return;
      }
      this.lastFrameTime = timestamp;

      // Ensure shared buffer is large enough
      if (!this.imageData || this.imageData.height < this.maxNoiseHeight) {
        this.imageData = new ImageData(NOISE_WIDTH, this.maxNoiseHeight);
      }

      // Generate noise into the shared buffer (once for all canvases)
      const data = this.imageData.data;
      const pixels = NOISE_WIDTH * this.maxNoiseHeight * 4;
      for (let i = 0; i < pixels; i += 4) {
        const value = Math.random() * 255;
        data[i] = value; // R
        data[i + 1] = value; // G
        data[i + 2] = value; // B
        data[i + 3] = 255; // A
      }

      // Distribute to each registered canvas
      for (const entry of this.canvases.values()) {
        // putImageData using only the rows this canvas needs
        entry.ctx.putImageData(this.imageData, 0, 0, 0, 0, NOISE_WIDTH, entry.noiseHeight);
      }

      this.animFrameId = requestAnimationFrame(draw);
    };

    this.animFrameId = requestAnimationFrame(draw);
  }

  private stopLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    this.lastFrameTime = 0;
  }
}

/** Global singleton — shared across all TVStatic instances. */
export const tvStaticManager = new TVStaticManager();
