import type { FramebufferFormat } from './types';

interface FBOEntry {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
  format: FramebufferFormat;
}

interface FeedbackPair {
  current: FBOEntry;
  previous: FBOEntry;
}

/**
 * Manages WebGL framebuffer objects for intermediate shader passes.
 * Handles allocation, resizing, and ping-pong pairs for feedback passes.
 */
export class FramebufferManager {
  private gl: WebGL2RenderingContext;
  private fbos = new Map<string, FBOEntry>();
  private feedbackPairs = new Map<string, FeedbackPair>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /** Returns a framebuffer for the given key, creating or resizing as needed. */
  getFramebuffer(key: string, width: number, height: number, format: FramebufferFormat): FBOEntry {
    const existing = this.fbos.get(key);
    if (existing && existing.width === width && existing.height === height && existing.format === format) {
      return existing;
    }

    if (existing) {
      this.destroyFBO(existing);
    }

    const entry = this.createFBO(width, height, format);
    this.fbos.set(key, entry);
    return entry;
  }

  /** Returns a ping-pong pair for a feedback pass. */
  getFeedbackPair(key: string, width: number, height: number, format: FramebufferFormat): FeedbackPair {
    const existing = this.feedbackPairs.get(key);
    if (existing && existing.current.width === width && existing.current.height === height) {
      return existing;
    }

    if (existing) {
      this.destroyFBO(existing.current);
      this.destroyFBO(existing.previous);
    }

    const pair: FeedbackPair = {
      current: this.createFBO(width, height, format),
      previous: this.createFBO(width, height, format),
    };
    this.feedbackPairs.set(key, pair);
    return pair;
  }

  /** Swaps current and previous textures for a feedback pair. */
  swapFeedback(key: string): void {
    const pair = this.feedbackPairs.get(key);
    if (!pair) return;
    const temp = pair.current;
    pair.current = pair.previous;
    pair.previous = temp;
  }

  /** Retrieves the output texture of a named FBO. */
  getTexture(key: string): WebGLTexture | null {
    return this.fbos.get(key)?.texture ?? null;
  }

  destroy(): void {
    for (const entry of this.fbos.values()) {
      this.destroyFBO(entry);
    }
    this.fbos.clear();

    for (const pair of this.feedbackPairs.values()) {
      this.destroyFBO(pair.current);
      this.destroyFBO(pair.previous);
    }
    this.feedbackPairs.clear();
  }

  private createFBO(width: number, height: number, format: FramebufferFormat): FBOEntry {
    const gl = this.gl;

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const { internalFormat, type } = this.getFormatParams(format);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { framebuffer, texture, width, height, format };
  }

  private destroyFBO(entry: FBOEntry): void {
    this.gl.deleteFramebuffer(entry.framebuffer);
    this.gl.deleteTexture(entry.texture);
  }

  private getFormatParams(format: FramebufferFormat): { internalFormat: number; type: number } {
    const gl = this.gl;
    switch (format) {
      case 'rgba16f':
        return { internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT };
      case 'rgba32f':
        return { internalFormat: gl.RGBA32F, type: gl.FLOAT };
      case 'rgba8':
      default:
        return { internalFormat: gl.RGBA8, type: gl.UNSIGNED_BYTE };
    }
  }
}
