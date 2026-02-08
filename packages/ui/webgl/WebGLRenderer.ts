import { VideoFrame } from '../types/global';
import { ShaderManager } from './ShaderManager';
import { FramebufferManager } from './FramebufferManager';
import { LutLoader } from './LutLoader';
import { defaultVertexShader } from './shaders';
import { PRESET_LIST, PRESET_MAP } from './presets';
import type { ShaderPresetDefinition, ShaderPassDefinition, FilterMode } from './types';

/** Preset ids for the shader menu. */
export const SHADER_PRESETS: string[] = PRESET_LIST.map((p) => p.id);

/** Human-readable labels keyed by preset id. */
export const SHADER_LABELS: Record<string, string> = Object.fromEntries(
  PRESET_LIST.map((p) => [p.id, p.label]),
);

interface CompiledPass {
  definition: ShaderPassDefinition;
  programKey: string;
}

export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private shaderManager: ShaderManager | null = null;
  private framebufferManager: FramebufferManager | null = null;
  private lutLoader: LutLoader | null = null;
  private originalTexture: WebGLTexture | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private currentPresetId = 'default';
  private currentPreset: ShaderPresetDefinition | null = null;
  private compiledPasses: CompiledPass[] = [];
  private frameWidth = 256;
  private frameHeight = 240;
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  initialize(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;
    this.shaderManager = new ShaderManager(gl);
    this.framebufferManager = new FramebufferManager(gl);
    this.lutLoader = new LutLoader(gl);

    // Enable float texture rendering if available
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');

    // Full-screen quad: position (x,y) + texCoord (u,v)
    // Standard OpenGL tex coords: (0,0) at bottom-left, (1,1) at top-right.
    // Source textures are uploaded with UNPACK_FLIP_Y_WEBGL=true so they match
    // OpenGL's bottom-up convention, making coords consistent across all passes.
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]);

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
    this.applyPreset('default');
  }

  renderFrame(frame: VideoFrame): void {
    if (!this.gl || !this.originalTexture || !this.shaderManager || !this.framebufferManager) return;

    const gl = this.gl;

    if (frame.width !== this.frameWidth || frame.height !== this.frameHeight) {
      this.frameWidth = frame.width;
      this.frameHeight = frame.height;
    }

    // Upload raw frame to originalTexture
    const data = new Uint8Array(frame.data);
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      this.frameWidth, this.frameHeight, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data,
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
        const { width: w, height: h } = this.computePassSize(def, this.frameWidth, this.frameHeight);
        this.framebufferManager.getFeedbackPair(`feedback_${i}`, w, h, def.format);
      }
    }

    // Track previous pass output texture for chaining
    let previousTexture: WebGLTexture = this.originalTexture;
    let previousWidth = this.frameWidth;
    let previousHeight = this.frameHeight;

    for (let i = 0; i < passCount; i++) {
      const { definition, programKey } = passes[i];
      const isLastPass = i === passCount - 1;

      // Compute output dimensions based on scale config
      const { width: outputWidth, height: outputHeight } = this.computePassSize(
        definition,
        previousWidth,
        previousHeight,
      );

      // Determine render targets for this pass.
      // For feedback passes: always render to the feedback FBO first.
      // For the last pass: render to screen (or to feedback FBO then re-draw to screen).
      const hasFeedback = !!definition.feedback;
      let feedbackPair: ReturnType<FramebufferManager['getFeedbackPair']> | null = null;

      if (hasFeedback) {
        const feedbackKey = `feedback_${i}`;
        feedbackPair = this.framebufferManager.getFeedbackPair(
          feedbackKey, outputWidth, outputHeight, definition.format,
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
        const fbo = this.framebufferManager.getFramebuffer(fboKey, outputWidth, outputHeight, definition.format, !!definition.mipmap);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
        gl.viewport(0, 0, outputWidth, outputHeight);
      }

      gl.clear(gl.COLOR_BUFFER_BIT);

      // Use this pass's shader program
      this.shaderManager.useShader(programKey);
      const program = this.shaderManager.getCurrentShader();
      if (!program) continue;

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

      // Attributes
      const positionLoc = gl.getAttribLocation(program, 'a_position');
      const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord');

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
      gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), textureUnit);
      textureUnit++;

      // Original texture (always the raw frame)
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.originalTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.uniform1i(gl.getUniformLocation(program, 'u_original'), textureUnit);
      textureUnit++;

      // Feedback texture (for ping-pong passes)
      if (hasFeedback) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, feedbackPair!.previous.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform1i(gl.getUniformLocation(program, 'u_feedback'), textureUnit);
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

          if (ref.startsWith('feedback:')) {
            // Cross-pass feedback: read another pass's previous-frame output
            const targetAlias = ref.slice('feedback:'.length);
            const targetPassIndex = this.compiledPasses.findIndex(
              (p) => p.definition.alias === targetAlias,
            );
            if (targetPassIndex >= 0) {
              tex = this.framebufferManager.getFeedbackTexture(`feedback_${targetPassIndex}`);
            }
          } else {
            // Regular alias: read another pass's current-frame output
            const aliasPassIndex = this.compiledPasses.findIndex(
              (p) => p.definition.alias === ref,
            );
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
      gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvasWidth, canvasHeight);
      gl.uniform2f(gl.getUniformLocation(program, 'u_textureSize'), previousWidth, previousHeight);
      gl.uniform2f(gl.getUniformLocation(program, 'u_originalSize'), this.frameWidth, this.frameHeight);
      gl.uniform1f(gl.getUniformLocation(program, 'u_time'), performance.now() / 1000.0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_frameCount'), this.frameCount);

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
        const fbo = this.framebufferManager.getFramebuffer(fboKey, outputWidth, outputHeight, definition.format);
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

    this.frameCount++;
  }

  resize(width: number, height: number): void {
    if (!this.gl) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  setShader(presetId: string): void {
    if (this.currentPresetId === presetId) return;
    this.applyPreset(presetId);
  }

  getShader(): string {
    return this.currentPresetId;
  }

  destroy(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.originalTexture) gl.deleteTexture(this.originalTexture);
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);

    this.framebufferManager?.destroy();
    this.lutLoader?.destroy();
    this.shaderManager?.destroy();
    this.gl = null;
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
      this.lutLoader.loadAll(preset.luts).catch((err) => {
        console.error('Failed to load LUT textures:', err);
      });
    }

    this.frameCount = 0;
  }

  private computePassSize(
    pass: ShaderPassDefinition,
    previousWidth: number,
    previousHeight: number,
  ): { width: number; height: number } {
    switch (pass.scale.type) {
      case 'source':
        return {
          width: Math.round(previousWidth * pass.scale.x),
          height: Math.round(previousHeight * pass.scale.y),
        };
      case 'absolute':
        return {
          width: Math.round(pass.scale.x),
          height: Math.round(pass.scale.y),
        };
      case 'viewport':
      default:
        return {
          width: Math.round(this.canvas.width * pass.scale.x),
          height: Math.round(this.canvas.height * pass.scale.y),
        };
    }
  }

  private applyFilter(filter: FilterMode): void {
    const gl = this.gl!;
    const glFilter = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
  }
}
