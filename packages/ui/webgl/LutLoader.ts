import type { LutDefinition, FilterMode, WrapMode } from './types';

interface LutEntry {
  texture: WebGLTexture;
  definition: LutDefinition;
}

/**
 * Loads PNG look-up table textures for shader presets.
 * Textures are decoded via the Image API and uploaded to WebGL.
 */
export class LutLoader {
  private gl: WebGL2RenderingContext;
  private luts = new Map<string, LutEntry>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /** Loads a single LUT texture and stores it by its uniform name. */
  async load(definition: LutDefinition): Promise<void> {
    const gl = this.gl;

    const image = await this.loadImage(definition.path);

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.getFilter(definition.filter));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.getFilter(definition.filter));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.getWrap(definition.wrapMode));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.getWrap(definition.wrapMode));

    gl.bindTexture(gl.TEXTURE_2D, null);

    this.luts.set(definition.name, { texture, definition });
  }

  /** Batch-loads all LUT definitions. */
  async loadAll(luts: LutDefinition[]): Promise<void> {
    await Promise.all(luts.map((lut) => this.load(lut)));
  }

  /** Retrieves a loaded LUT texture by uniform name. */
  get(name: string): WebGLTexture | null {
    return this.luts.get(name)?.texture ?? null;
  }

  destroy(): void {
    for (const entry of this.luts.values()) {
      this.gl.deleteTexture(entry.texture);
    }
    this.luts.clear();
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load LUT image: ${url}`));
      img.src = url;
    });
  }

  private getFilter(filter: FilterMode): number {
    return filter === 'linear' ? this.gl.LINEAR : this.gl.NEAREST;
  }

  private getWrap(wrap: WrapMode): number {
    const gl = this.gl;
    switch (wrap) {
      case 'repeat': return gl.REPEAT;
      case 'mirror': return gl.MIRRORED_REPEAT;
      case 'clamp':
      default: return gl.CLAMP_TO_EDGE;
    }
  }
}
