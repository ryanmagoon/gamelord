import { WebGLRenderer } from "./WebGLRenderer";

/**
 * Minimal mock of WebGL2RenderingContext with just enough surface area
 * for WebGLRenderer.initialize() to run without real GPU access.
 */
function createMockGL({
  hasDrawingBufferStorage = false,
  hasDrawingBufferToneMapping = false,
} = {}) {
  const mockTexture = {} as WebGLTexture;
  const mockBuffer = {} as WebGLBuffer;
  const mockProgram = {} as WebGLProgram;
  const mockShader = {} as WebGLShader;

  const gl: Record<string, unknown> = {
    // Constants
    TEXTURE_2D: 3553,
    TEXTURE_MIN_FILTER: 10_241,
    TEXTURE_MAG_FILTER: 10_240,
    TEXTURE_WRAP_S: 10_242,
    TEXTURE_WRAP_T: 10_243,
    NEAREST: 9728,
    LINEAR: 9729,
    CLAMP_TO_EDGE: 33_071,
    RGBA: 6408,
    RGBA8: 32_856,
    RGBA16F: 34_842,
    RGBA32F: 34_836,
    HALF_FLOAT: 5131,
    FLOAT: 5126,
    UNSIGNED_BYTE: 5121,
    ARRAY_BUFFER: 34_962,
    STATIC_DRAW: 35_044,
    TRIANGLE_STRIP: 5,
    COLOR_BUFFER_BIT: 16_384,
    VERTEX_SHADER: 35_633,
    FRAGMENT_SHADER: 35_632,
    COMPILE_STATUS: 35_713,
    LINK_STATUS: 35_714,
    UNPACK_FLIP_Y_WEBGL: 37_440,
    TEXTURE0: 33_984,
    FRAMEBUFFER: 36_160,

    // Texture/buffer methods
    createTexture: vi.fn(() => mockTexture),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    pixelStorei: vi.fn(),
    createBuffer: vi.fn(() => mockBuffer),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    getExtension: vi.fn(() => ({})),

    // Shader methods
    createShader: vi.fn(() => mockShader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => mockProgram),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => null),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    activeTexture: vi.fn(),
    bindFramebuffer: vi.fn(),
    drawArrays: vi.fn(),
    deleteTexture: vi.fn(),
    deleteBuffer: vi.fn(),

    // Color space (always present — it's a standard property)
    drawingBufferColorSpace: "srgb",
  };

  if (hasDrawingBufferStorage) {
    gl.drawingBufferStorage = vi.fn();
  }
  if (hasDrawingBufferToneMapping) {
    gl.drawingBufferToneMapping = vi.fn();
  }

  return { gl: gl as unknown as WebGL2RenderingContext, mockTexture, mockBuffer };
}

function createCanvasWithMockGL(glOptions: Parameters<typeof createMockGL>[0] = {}) {
  const mock = createMockGL(glOptions);
  const canvas = {
    width: 800,
    height: 600,
    getContext: vi.fn(() => mock.gl),
  } as unknown as HTMLCanvasElement;
  return { canvas, ...mock };
}

describe("WebGLRenderer — HDR", () => {
  describe("SDR mode (default)", () => {
    it("leaves drawingBufferColorSpace as srgb", () => {
      const { canvas, gl } = createCanvasWithMockGL({ hasDrawingBufferStorage: true });
      const renderer = new WebGLRenderer(canvas);
      renderer.initialize();

      expect(gl.drawingBufferColorSpace).toBe("srgb");
      expect(renderer.isHdrActive).toBe(false);
    });
  });

  describe("HDR mode", () => {
    it("sets drawingBufferColorSpace to display-p3", () => {
      const { canvas, gl } = createCanvasWithMockGL({ hasDrawingBufferStorage: true });
      const renderer = new WebGLRenderer(canvas, { hdr: true });
      renderer.initialize();

      expect(gl.drawingBufferColorSpace).toBe("display-p3");
      expect(renderer.isHdrActive).toBe(true);
    });

    it("calls drawingBufferStorage with RGBA16F and canvas dimensions", () => {
      const { canvas, gl } = createCanvasWithMockGL({ hasDrawingBufferStorage: true });
      const renderer = new WebGLRenderer(canvas, { hdr: true });
      renderer.initialize();

      expect((gl as unknown as Record<string, unknown>).drawingBufferStorage).toHaveBeenCalledWith(
        gl.RGBA16F,
        800,
        600,
      );
    });

    it("calls drawingBufferToneMapping with extended mode when available", () => {
      const { canvas, gl } = createCanvasWithMockGL({
        hasDrawingBufferStorage: true,
        hasDrawingBufferToneMapping: true,
      });
      const renderer = new WebGLRenderer(canvas, { hdr: true });
      renderer.initialize();

      expect(
        (gl as unknown as Record<string, unknown>).drawingBufferToneMapping,
      ).toHaveBeenCalledWith({ mode: "extended" });
    });

    it("activates HDR even without drawingBufferStorage (P3 only)", () => {
      const { canvas, gl } = createCanvasWithMockGL({
        hasDrawingBufferStorage: false,
      });
      const renderer = new WebGLRenderer(canvas, { hdr: true });
      renderer.initialize();

      expect(gl.drawingBufferColorSpace).toBe("display-p3");
      expect(renderer.isHdrActive).toBe(true);
    });

    it("stays inactive when drawingBufferColorSpace is not available", () => {
      const { canvas, gl } = createCanvasWithMockGL();
      // Remove the property to simulate an old browser
      delete (gl as Record<string, unknown>).drawingBufferColorSpace;

      const renderer = new WebGLRenderer(canvas, { hdr: true });
      renderer.initialize();

      expect(renderer.isHdrActive).toBe(false);
    });
  });

  describe("HDR output pass", () => {
    it("compiles the HDR output shader when HDR is active", () => {
      const { canvas, gl } = createCanvasWithMockGL({ hasDrawingBufferStorage: true });
      const renderer = new WebGLRenderer(canvas, { hdr: true });
      renderer.initialize();

      // The HDR output pass shader should be compiled in addition to the
      // default preset shader — so createShader is called for both.
      // Default preset = 1 shader program, HDR output = 1 more.
      const shaderSourceCalls = (gl.shaderSource as ReturnType<typeof vi.fn>).mock.calls;
      const hasHdrShader = shaderSourceCalls.some(
        (call: Array<unknown>) =>
          typeof call[1] === "string" && (call[1] as string).includes("u_hdrHeadroom"),
      );
      expect(hasHdrShader).toBe(true);
    });

    it("does not compile HDR output shader when HDR is off", () => {
      const { canvas, gl } = createCanvasWithMockGL({ hasDrawingBufferStorage: true });
      const renderer = new WebGLRenderer(canvas);
      renderer.initialize();

      const shaderSourceCalls = (gl.shaderSource as ReturnType<typeof vi.fn>).mock.calls;
      const hasHdrShader = shaderSourceCalls.some(
        (call: Array<unknown>) =>
          typeof call[1] === "string" && (call[1] as string).includes("u_hdrHeadroom"),
      );
      expect(hasHdrShader).toBe(false);
    });
  });

  describe("resize with HDR", () => {
    it("re-calls drawingBufferStorage at new dimensions when HDR is active", () => {
      const { canvas, gl } = createCanvasWithMockGL({ hasDrawingBufferStorage: true });
      const renderer = new WebGLRenderer(canvas, { hdr: true });
      renderer.initialize();

      const drawingBufferStorage = (gl as unknown as Record<string, unknown>)
        .drawingBufferStorage as ReturnType<typeof vi.fn>;
      drawingBufferStorage.mockClear();

      renderer.resize(1920, 1080);

      expect(drawingBufferStorage).toHaveBeenCalledWith(gl.RGBA16F, 1920, 1080);
    });

    it("does not call drawingBufferStorage on resize when HDR is off", () => {
      const { canvas, gl } = createCanvasWithMockGL({ hasDrawingBufferStorage: true });
      const renderer = new WebGLRenderer(canvas);
      renderer.initialize();

      const drawingBufferStorage = (gl as unknown as Record<string, unknown>)
        .drawingBufferStorage as ReturnType<typeof vi.fn>;
      drawingBufferStorage.mockClear();

      renderer.resize(1920, 1080);

      expect(drawingBufferStorage).not.toHaveBeenCalled();
    });
  });
});
