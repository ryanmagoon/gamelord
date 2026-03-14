import { detectHdrCapabilities, isHdrCapable } from "./hdrCapabilities";

// Store originals so they can be restored
const originalMatchMedia = globalThis.matchMedia;
const originalOffscreenCanvas = globalThis.OffscreenCanvas;

function mockMatchMedia(queries: Record<string, boolean>) {
  globalThis.matchMedia = vi.fn((query: string) => ({
    matches: queries[query] ?? false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof matchMedia;
}

function mockOffscreenCanvas(hasDrawingBufferStorage: boolean) {
  const mockGl = hasDrawingBufferStorage ? { drawingBufferStorage: vi.fn() } : {};

  globalThis.OffscreenCanvas = class MockOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return mockGl;
    }
  } as unknown as typeof OffscreenCanvas;
}

afterEach(() => {
  globalThis.matchMedia = originalMatchMedia;
  globalThis.OffscreenCanvas = originalOffscreenCanvas;
});

describe("detectHdrCapabilities", () => {
  it("returns all true when display supports HDR + P3 and browser has drawingBufferStorage", () => {
    mockMatchMedia({
      "(dynamic-range: high)": true,
      "(color-gamut: p3)": true,
    });
    mockOffscreenCanvas(true);

    expect(detectHdrCapabilities()).toEqual({
      hdrDisplay: true,
      p3Gamut: true,
      floatBackbuffer: true,
    });
  });

  it("returns hdrDisplay false when display does not support HDR", () => {
    mockMatchMedia({
      "(dynamic-range: high)": false,
      "(color-gamut: p3)": true,
    });
    mockOffscreenCanvas(true);

    const caps = detectHdrCapabilities();
    expect(caps.hdrDisplay).toBe(false);
    expect(caps.p3Gamut).toBe(true);
  });

  it("returns p3Gamut false when display does not support P3", () => {
    mockMatchMedia({
      "(dynamic-range: high)": true,
      "(color-gamut: p3)": false,
    });
    mockOffscreenCanvas(true);

    const caps = detectHdrCapabilities();
    expect(caps.p3Gamut).toBe(false);
    expect(caps.hdrDisplay).toBe(true);
  });

  it("returns floatBackbuffer false when drawingBufferStorage is absent", () => {
    mockMatchMedia({
      "(dynamic-range: high)": true,
      "(color-gamut: p3)": true,
    });
    mockOffscreenCanvas(false);

    const caps = detectHdrCapabilities();
    expect(caps.floatBackbuffer).toBe(false);
  });

  it("returns all false when matchMedia is undefined", () => {
    // biome-ignore lint/performance/noDelete: test teardown needs full removal
    delete (globalThis as Record<string, unknown>).matchMedia;
    mockOffscreenCanvas(false);

    expect(detectHdrCapabilities()).toEqual({
      hdrDisplay: false,
      p3Gamut: false,
      floatBackbuffer: false,
    });
  });

  it("returns floatBackbuffer false when OffscreenCanvas is unavailable", () => {
    mockMatchMedia({
      "(dynamic-range: high)": true,
      "(color-gamut: p3)": true,
    });
    // biome-ignore lint/performance/noDelete: test teardown needs full removal
    delete (globalThis as Record<string, unknown>).OffscreenCanvas;

    const caps = detectHdrCapabilities();
    expect(caps.floatBackbuffer).toBe(false);
  });

  it("returns floatBackbuffer false when OffscreenCanvas throws", () => {
    mockMatchMedia({
      "(dynamic-range: high)": true,
      "(color-gamut: p3)": true,
    });
    globalThis.OffscreenCanvas = class ThrowingOffscreenCanvas {
      constructor() {
        throw new Error("not supported");
      }
    } as unknown as typeof OffscreenCanvas;

    const caps = detectHdrCapabilities();
    expect(caps.floatBackbuffer).toBe(false);
  });
});

describe("isHdrCapable", () => {
  it("returns true when all capabilities are present", () => {
    mockMatchMedia({
      "(dynamic-range: high)": true,
      "(color-gamut: p3)": true,
    });
    mockOffscreenCanvas(true);

    expect(isHdrCapable()).toBe(true);
  });

  it("returns false when any capability is missing", () => {
    mockMatchMedia({
      "(dynamic-range: high)": true,
      "(color-gamut: p3)": false,
    });
    mockOffscreenCanvas(true);

    expect(isHdrCapable()).toBe(false);
  });
});
