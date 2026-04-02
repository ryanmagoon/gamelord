import { VideoFrame } from "../types/global";
import { ShaderManager } from "./ShaderManager";
import { FramebufferManager } from "./FramebufferManager";
import { LutLoader } from "./LutLoader";
import { defaultVertexShader, hdrOutputFragmentShader } from "./shaders";
import { PRESET_LIST, PRESET_MAP } from "./presets";
import type { ShaderPresetDefinition, ShaderPassDefinition, FilterMode } from "./types";

/** Internal shader key for the HDR highlight expansion output pass. */
const HDR_OUTPUT_PASS_KEY = "__hdr_output";

/**
 * Maximum brightness multiplier for HDR output. 2.0 means the brightest
 * pixels can reach twice SDR white — enough to make CRT bloom physically
 * glow on XDR displays without washing out the image.
 */
const HDR_HEADROOM = 2.0;

/** Preset ids for the shader menu. */
export const SHADER_PRESETS: Array<string> = PRESET_LIST.map((p) => p.id);

/** Human-readable labels keyed by preset id. */
export const SHADER_LABELS: Record<string, string> = Object.fromEntries(
  PRESET_LIST.map((p) => [p.id, p.label]),
);

interface CompiledPass {
  definition: ShaderPassDefinition;
  programKey: string;
}

export interface WebGLRendererOptions {
  /** Enable HDR output (Display P3 color space + float16 backbuffer). */
  hdr?: boolean;
}

export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private shaderManager: ShaderManager | null = null;
  private framebufferManager: FramebufferManager | null = null;
  private lutLoader: LutLoader | null = null;
  private originalTexture: WebGLTexture | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private currentPresetId = "default";
  private currentPreset: ShaderPresetDefinition | null = null;
  private compiledPasses: Array<CompiledPass> = [];
  private frameWidth = 256;
  private frameHeight = 240;
  private frameCount = 0;
  private hdrRequested: boolean;
  private hdrActive = false;

  constructor(canvas: HTMLCanvasElement, options?: WebGLRendererOptions) {
    this.canvas = canvas;
    this.hdrRequested = options?.hdr ?? false;
  }

  initialize(): void {
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error("WebGL2 not supported");
    }

    this.gl = gl;
    this.shaderManager = new ShaderManager(gl);
    this.framebufferManager = new FramebufferManager(gl);
    this.lutLoader = new LutLoader(gl);

    // Enable float texture rendering if available
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("EXT_color_buffer_half_float");

    // Configure HDR output when requested
    if (this.hdrRequested) {
      this.setupHdr(gl);
    }

    // Pre-compile the HDR output pass shader (used when HDR is active)
    if (this.hdrActive) {
      this.shaderManager.createShader(
        HDR_OUTPUT_PASS_KEY,
        defaultVertexShader,
        hdrOutputFragmentShader,
      );
    }

    // Full-screen quad: position (x,y) + texCoord (u,v)
    // Standard OpenGL tex coords: (0,0) at bottom-left, (1,1) at top-right.
    // Source textures are uploaded with UNPACK_FLIP_Y_WEBGL=true so they match
    // OpenGL's bottom-up convention, making coords consistent across all passes.
    const vertices = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    this.originalTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Flip Y on upload so the texture matches OpenGL's bottom-up convention.
    // This lets all passes use the same non-flipped tex coords consistently.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);

    // Compile default preset
    this.applyPreset("default");
  }

  renderFrame(frame: VideoFrame): void {
    if (!this.gl || !this.originalTexture || !this.shaderManager || !this.framebufferManager) {
      return;
    }

    const gl = this.gl;

    if (frame.width !== this.frameWidth || frame.height !== this.frameHeight) {
      this.frameWidth = frame.width;
      this.frameHeight = frame.height;
    }

    // Upload raw frame to originalTexture.
    // frame.data may be an ArrayBuffer (IPC path) or a Uint8Array view
    // into a SharedArrayBuffer (zero-copy SAB path).
    const data =
      frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data as ArrayBuffer);
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.frameWidth,
      this.frameHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );

    const passes = this.compiledPasses;
    const passCount = passes.length;

    // Pre-allocate feedback pairs so cross-pass feedback references resolve
    // on the very first frame (before the owning pass has run).
    for (let i = 0; i < passCount; i++) {
      const def = passes[i].definition;
      if (def.feedback) {
        // Use source frame size for the first pass in the chain; for later
        // passes the previous output size would be more accurate, but at
        // pre-allocation time we don't have the chain yet. Source-scaled
        // passes (the common case) always match the frame dimensions.
        const { height: h, width: w } = this.computePassSize(
          def,
          this.frameWidth,
          this.frameHeight,
        );
        this.framebufferManager.getFeedbackPair(`feedback_${i}`, w, h, def.format);
      }
    }

    // Track previous pass output texture for chaining
    let previousTexture: WebGLTexture = this.originalTexture;
    let previousWidth = this.frameWidth;
    let previousHeight = this.frameHeight;

    for (let i = 0; i < passCount; i++) {
      const { definition, programKey } = passes[i];
      // When HDR is active, the last shader pass must render to an FBO so
      // the HDR output pass can read it and apply highlight expansion.
      const isLastPass = i === passCount - 1 && !this.hdrActive;

      // Compute output dimensions based on scale config
      const { height: outputHeight, width: outputWidth } = this.computePassSize(
        definition,
        previousWidth,
        previousHeight,
      );

      // Determine render targets for this pass.
      // For feedback passes: always render to the feedback FBO first.
      // For the last pass: render to screen (or to feedback FBO then re-draw to screen).
      const hasFeedback = !!definition.feedback;
      let feedbackPair: ReturnType<FramebufferManager["getFeedbackPair"]> | null = null;

      if (hasFeedback) {
        const feedbackKey = `feedback_${i}`;
        feedbackPair = this.framebufferManager.getFeedbackPair(
          feedbackKey,
          outputWidth,
          outputHeight,
          definition.format,
        );
      }

      // First draw target: feedback FBO if feedback pass, else FBO or screen
      if (hasFeedback) {
        // Render to feedback FBO using FBO vertex buffer (no Y-flip) so that
        // the feedback texture can be sampled with the same coords next frame.
        gl.bindFramebuffer(gl.FRAMEBUFFER, feedbackPair!.current.framebuffer);
        gl.viewport(0, 0, outputWidth, outputHeight);
      } else if (isLastPass) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      } else {
        const fboKey = `pass_${i}`;
        const fbo = this.framebufferManager.getFramebuffer(
          fboKey,
          outputWidth,
          outputHeight,
          definition.format,
          !!definition.mipmap,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
        gl.viewport(0, 0, outputWidth, outputHeight);
      }

      gl.clear(gl.COLOR_BUFFER_BIT);

      // Use this pass's shader program
      this.shaderManager.useShader(programKey);
      const program = this.shaderManager.getCurrentShader();
      if (!program) {
        continue;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

      // Attributes
      const positionLoc = gl.getAttribLocation(program, "a_position");
      const texCoordLoc = gl.getAttribLocation(program, "a_texCoord");

      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);

      gl.enableVertexAttribArray(texCoordLoc);
      gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);

      // Bind textures
      let textureUnit = 0;

      // Source texture (previous pass output or original for first pass)
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      this.applyFilter(definition.filter);
      gl.uniform1i(gl.getUniformLocation(program, "u_texture"), textureUnit);
      textureUnit++;

      // Original texture (always the raw frame)
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.originalTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.uniform1i(gl.getUniformLocation(program, "u_original"), textureUnit);
      textureUnit++;

      // Feedback texture (for ping-pong passes)
      if (hasFeedback) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, feedbackPair!.previous.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform1i(gl.getUniformLocation(program, "u_feedback"), textureUnit);
        textureUnit++;
      }

      // LUT textures
      if (this.currentPreset) {
        for (const lut of this.currentPreset.luts) {
          const lutTexture = this.lutLoader!.get(lut.name);
          if (lutTexture) {
            gl.activeTexture(gl.TEXTURE0 + textureUnit);
            gl.bindTexture(gl.TEXTURE_2D, lutTexture);
            gl.uniform1i(gl.getUniformLocation(program, lut.name), textureUnit);
            textureUnit++;
          }
        }
      }

      // Extra inputs (alias references to other pass outputs or cross-pass feedback)
      if (definition.extraInputs) {
        for (const [uniformName, ref] of Object.entries(definition.extraInputs)) {
          let tex: WebGLTexture | null = null;

          if (ref.startsWith("feedback:")) {
            // Cross-pass feedback: read another pass's previous-frame output
            const targetAlias = ref.slice("feedback:".length);
            const targetPassIndex = this.compiledPasses.findIndex(
              (p) => p.definition.alias === targetAlias,
            );
            if (targetPassIndex >= 0) {
              tex = this.framebufferManager.getFeedbackTexture(`feedback_${targetPassIndex}`);
            }
          } else {
            // Regular alias: read another pass's current-frame output
            const aliasPassIndex = this.compiledPasses.findIndex((p) => p.definition.alias === ref);
            if (aliasPassIndex >= 0) {
              tex = this.framebufferManager.getTexture(`pass_${aliasPassIndex}`);
            }
          }

          if (tex) {
            gl.activeTexture(gl.TEXTURE0 + textureUnit);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.uniform1i(gl.getUniformLocation(program, uniformName), textureUnit);
            textureUnit++;
          }
        }
      }

      // Set standard uniforms
      const canvasWidth = isLastPass ? this.canvas.width : outputWidth;
      const canvasHeight = isLastPass ? this.canvas.height : outputHeight;
      gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvasWidth, canvasHeight);
      gl.uniform2f(gl.getUniformLocation(program, "u_textureSize"), previousWidth, previousHeight);
      gl.uniform2f(
        gl.getUniformLocation(program, "u_originalSize"),
        this.frameWidth,
        this.frameHeight,
      );
      gl.uniform1f(gl.getUniformLocation(program, "u_time"), performance.now() / 1000.0);
      gl.uniform1i(gl.getUniformLocation(program, "u_frameCount"), this.frameCount);

      // Set preset-level shader parameters as uniforms
      if (this.currentPreset?.parameters) {
        for (const [name, value] of Object.entries(this.currentPreset.parameters)) {
          const loc = gl.getUniformLocation(program, name);
          if (loc) {
            gl.uniform1f(loc, value);
          }
        }
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // For feedback passes that are also the last pass, re-draw to screen.
      // All state (program, uniforms, textures, vertex buffer) is still bound.
      if (hasFeedback && isLastPass) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // For non-last feedback passes, also copy to the pass FBO so later passes
      // can read this pass's output via getTexture().
      if (hasFeedback && !isLastPass) {
        const fboKey = `pass_${i}`;
        const fbo = this.framebufferManager.getFramebuffer(
          fboKey,
          outputWidth,
          outputHeight,
          definition.format,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
        gl.viewport(0, 0, outputWidth, outputHeight);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      if (hasFeedback) {
        this.framebufferManager.swapFeedback(`feedback_${i}`);
      }

      // Generate mipmaps if this pass's output needs them (e.g. for textureLod)
      if (definition.mipmap && !isLastPass) {
        this.framebufferManager.generateMipmaps(`pass_${i}`);
      }

      // Update previous pass tracking for next iteration
      if (!isLastPass) {
        previousTexture = this.framebufferManager.getTexture(`pass_${i}`)!;
        previousWidth = outputWidth;
        previousHeight = outputHeight;
      }
    }

    // HDR output pass: read the last shader pass's FBO and draw to the screen
    // with highlight expansion that lifts bright pixels above 1.0.
    if (this.hdrActive && passCount > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      this.shaderManager.useShader(HDR_OUTPUT_PASS_KEY);
      const hdrProgram = this.shaderManager.getCurrentShader();
      if (hdrProgram) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

        const posLoc = gl.getAttribLocation(hdrProgram, "a_position");
        const texLoc = gl.getAttribLocation(hdrProgram, "a_texCoord");
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(texLoc);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

        // Bind the last shader pass's output
        const lastPassTexture = this.framebufferManager.getTexture(`pass_${passCount - 1}`);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, lastPassTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform1i(gl.getUniformLocation(hdrProgram, "u_texture"), 0);

        gl.uniform1f(gl.getUniformLocation(hdrProgram, "u_hdrHeadroom"), HDR_HEADROOM);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    this.frameCount++;
  }

  resize(width: number, height: number): void {
    if (!this.gl) {
      return;
    }
    this.canvas.width = width;
    this.canvas.height = height;
    // Re-allocate the float16 backbuffer at the new dimensions
    if (this.hdrActive && "drawingBufferStorage" in this.gl) {
      (
        this.gl as WebGL2RenderingContext & {
          drawingBufferStorage: (format: number, w: number, h: number) => void;
        }
      ).drawingBufferStorage(this.gl.RGBA16F, width, height);
    }
    this.gl.viewport(0, 0, width, height);
  }

  setShader(presetId: string): void {
    if (this.currentPresetId === presetId) {
      return;
    }
    this.applyPreset(presetId);
  }

  getShader(): string {
    return this.currentPresetId;
  }

  /** Whether HDR output is currently active on the canvas backbuffer. */
  get isHdrActive(): boolean {
    return this.hdrActive;
  }

  destroy(): void {
    const gl = this.gl;
    if (!gl) {
      return;
    }

    if (this.originalTexture) {
      gl.deleteTexture(this.originalTexture);
    }
    if (this.vertexBuffer) {
      gl.deleteBuffer(this.vertexBuffer);
    }

    this.framebufferManager?.destroy();
    this.lutLoader?.destroy();
    this.shaderManager?.destroy();
    this.gl = null;
  }

  /**
   * Configure the WebGL2 context for HDR output: Display P3 color space,
   * float16 backbuffer, and extended tone mapping (EDR) when available.
   * Fails gracefully — if any API is missing, HDR stays inactive.
   */
  private setupHdr(gl: WebGL2RenderingContext): void {
    try {
      // Set wide gamut color space (available since Chrome 104)
      if ("drawingBufferColorSpace" in gl) {
        (
          gl as WebGL2RenderingContext & { drawingBufferColorSpace: string }
        ).drawingBufferColorSpace = "display-p3";
      } else {
        return;
      }

      // Allocate float16 backbuffer (available since Chrome 122)
      if ("drawingBufferStorage" in gl) {
        (
          gl as WebGL2RenderingContext & {
            drawingBufferStorage: (format: number, w: number, h: number) => void;
          }
        ).drawingBufferStorage(gl.RGBA16F, this.canvas.width, this.canvas.height);
      }

      // Enable extended tone mapping for EDR (>1.0 luminance on XDR displays).
      // Requires experimentalFeatures: true in Electron webPreferences.
      if ("drawingBufferToneMapping" in gl) {
        (
          gl as WebGL2RenderingContext & {
            drawingBufferToneMapping: (opts: { mode: string }) => void;
          }
        ).drawingBufferToneMapping({
          mode: "extended",
        });
      }

      this.hdrActive = true;
    } catch {
      // API threw — fall back to SDR silently
      this.hdrActive = false;
    }
  }

  private applyPreset(presetId: string): void {
    const preset = PRESET_MAP.get(presetId);
    if (!preset || !this.shaderManager) {
      console.error(`Shader preset "${presetId}" not found`);
      return;
    }

    this.currentPresetId = presetId;
    this.currentPreset = preset;
    this.compiledPasses = [];

    // Compile each pass
    for (const pass of preset.passes) {
      const programKey = `${presetId}_pass${pass.index}`;
      const vertexSource = pass.vertexSource ?? defaultVertexShader;

      if (!this.shaderManager.hasShader(programKey)) {
        this.shaderManager.createShader(programKey, vertexSource, pass.fragmentSource);
      }

      this.compiledPasses.push({ definition: pass, programKey });
    }

    // Load LUTs asynchronously (non-blocking — they'll be available next frame)
    if (preset.luts.length > 0 && this.lutLoader) {
      this.lutLoader.loadAll(preset.luts).catch((error) => {
        console.error("Failed to load LUT textures:", error);
      });
    }

    this.frameCount = 0;
  }

  private computePassSize(
    pass: ShaderPassDefinition,
    previousWidth: number,
    previousHeight: number,
  ): { height: number; width: number } {
    switch (pass.scale.type) {
      case "source":
        return {
          height: Math.round(previousHeight * pass.scale.y),
          width: Math.round(previousWidth * pass.scale.x),
        };
      case "absolute":
        return {
          height: Math.round(pass.scale.y),
          width: Math.round(pass.scale.x),
        };
      case "viewport":
      default:
        return {
          height: Math.round(this.canvas.height * pass.scale.y),
          width: Math.round(this.canvas.width * pass.scale.x),
        };
    }
  }

  private applyFilter(filter: FilterMode): void {
    const gl = this.gl!;
    const glFilter = filter === "linear" ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
  }
}
