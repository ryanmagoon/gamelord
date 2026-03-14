/** Runtime detection of HDR display capabilities. */

export interface HdrCapabilities {
  /** Display reports high dynamic range support. */
  hdrDisplay: boolean;
  /** Display supports the Display P3 wide color gamut. */
  p3Gamut: boolean;
  /** Browser supports `drawingBufferStorage` for float16 backbuffers. */
  floatBackbuffer: boolean;
}

/**
 * Probe the current display and browser for HDR rendering support.
 *
 * Uses CSS media queries for display capabilities and checks for the
 * `drawingBufferStorage` API on WebGL2 (available since Chromium 122).
 */
export function detectHdrCapabilities(): HdrCapabilities {
  const hdrDisplay =
    typeof matchMedia !== "undefined" && matchMedia("(dynamic-range: high)").matches;

  const p3Gamut = typeof matchMedia !== "undefined" && matchMedia("(color-gamut: p3)").matches;

  let floatBackbuffer = false;
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const offscreen = new OffscreenCanvas(1, 1);
      const gl = offscreen.getContext("webgl2");
      if (gl && "drawingBufferStorage" in gl) {
        floatBackbuffer = true;
      }
    } catch {
      // OffscreenCanvas or WebGL2 unavailable — leave false
    }
  }

  return { hdrDisplay, p3Gamut, floatBackbuffer };
}

/**
 * Convenience check: returns `true` when the display supports HDR output
 * and the browser can provide a wide-gamut float backbuffer.
 */
export function isHdrCapable(): boolean {
  const caps = detectHdrCapabilities();
  return caps.hdrDisplay && caps.p3Gamut && caps.floatBackbuffer;
}
