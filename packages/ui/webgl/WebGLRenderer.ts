import { VideoFrame } from '../types/global';
import { ShaderManager } from './ShaderManager';
import {
  defaultVertexShader,
  defaultFragmentShader,
  crtFragmentShader,
  crtApertureFragmentShader,
  scanlineFragmentShader,
  lcdFragmentShader,
  sharpBilinearFragmentShader,
} from './shaders';

export type ShaderPreset =
  | 'default'
  | 'crt'
  | 'crt-aperture'
  | 'scanline'
  | 'lcd'
  | 'sharp-bilinear'

export const SHADER_LABELS: Record<ShaderPreset, string> = {
  'default': 'None',
  'crt': 'CRT',
  'crt-aperture': 'CRT Aperture',
  'scanline': 'Scanlines',
  'lcd': 'LCD',
  'sharp-bilinear': 'Sharp Bilinear',
}

export const SHADER_PRESETS: ShaderPreset[] = [
  'default',
  'crt',
  'crt-aperture',
  'scanline',
  'lcd',
  'sharp-bilinear',
]

const FRAGMENT_SHADERS: Record<ShaderPreset, string> = {
  'default': defaultFragmentShader,
  'crt': crtFragmentShader,
  'crt-aperture': crtApertureFragmentShader,
  'scanline': scanlineFragmentShader,
  'lcd': lcdFragmentShader,
  'sharp-bilinear': sharpBilinearFragmentShader,
}

export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private shaderManager: ShaderManager | null = null;
  private texture: WebGLTexture | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private currentShader: ShaderPreset = 'default';
  private frameWidth = 256;
  private frameHeight = 240;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  initialize(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });

    if (!gl) {
      throw new Error('WebGL2 not supported');
    }

    this.gl = gl;
    this.shaderManager = new ShaderManager(gl);

    // Register all shader presets
    for (const preset of SHADER_PRESETS) {
      this.shaderManager.createShader(preset, defaultVertexShader, FRAGMENT_SHADERS[preset]);
    }
    this.shaderManager.useShader('default');

    // Full-screen quad: position (x,y) + texCoord (u,v)
    const vertices = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0
    ]);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
  }

  renderFrame(frame: VideoFrame): void {
    if (!this.gl || !this.texture || !this.shaderManager) return;

    const gl = this.gl;

    if (frame.width !== this.frameWidth || frame.height !== this.frameHeight) {
      this.frameWidth = frame.width;
      this.frameHeight = frame.height;
    }

    // Upload frame data to texture
    const data = new Uint8Array(frame.data);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      this.frameWidth, this.frameHeight, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data
    );

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

    const shader = this.shaderManager.getCurrentShader();
    if (!shader) return;

    // Attributes
    const positionLoc = gl.getAttribLocation(shader, 'a_position');
    const texCoordLoc = gl.getAttribLocation(shader, 'a_texCoord');

    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);

    // Uniforms (all shaders use the same set — unused uniforms are silently ignored)
    gl.uniform1i(gl.getUniformLocation(shader, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(shader, 'u_resolution'), this.canvas.width, this.canvas.height);
    gl.uniform2f(gl.getUniformLocation(shader, 'u_textureSize'), this.frameWidth, this.frameHeight);
    gl.uniform1f(gl.getUniformLocation(shader, 'u_time'), performance.now() / 1000.0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  resize(width: number, height: number): void {
    if (!this.gl) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  setShader(shader: ShaderPreset): void {
    if (!this.shaderManager) return;
    this.currentShader = shader;
    this.shaderManager.useShader(shader);
  }

  getShader(): ShaderPreset {
    return this.currentShader;
  }

  destroy(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.texture) gl.deleteTexture(this.texture);
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);

    this.shaderManager?.destroy();
    this.gl = null;
  }
}
