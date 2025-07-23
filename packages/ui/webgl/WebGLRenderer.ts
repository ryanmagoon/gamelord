import { VideoFrame } from '../../types/global';
import { ShaderManager } from './ShaderManager';
import { defaultVertexShader, defaultFragmentShader, crtFragmentShader } from './shaders';

export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private shaderManager: ShaderManager | null = null;
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private currentShader: 'default' | 'crt' = 'default';
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

    // Set up shaders
    this.shaderManager.createShader('default', defaultVertexShader, defaultFragmentShader);
    this.shaderManager.createShader('crt', defaultVertexShader, crtFragmentShader);
    this.shaderManager.useShader('default');

    // Set up vertex buffer for a full-screen quad
    const vertices = new Float32Array([
      -1, -1, 0, 1,  // Bottom left
       1, -1, 1, 1,  // Bottom right
      -1,  1, 0, 0,  // Top left
       1,  1, 1, 0   // Top right
    ]);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Set up texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Set up viewport
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
  }

  renderFrame(frame: VideoFrame): void {
    if (!this.gl || !this.texture || !this.shaderManager) return;

    const gl = this.gl;

    // Update frame dimensions if changed
    if (frame.width !== this.frameWidth || frame.height !== this.frameHeight) {
      this.frameWidth = frame.width;
      this.frameHeight = frame.height;
    }

    // Upload frame data to texture
    const data = new Uint8Array(frame.data);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 
      0, 
      gl.RGBA, 
      this.frameWidth, 
      this.frameHeight, 
      0, 
      gl.RGBA, 
      gl.UNSIGNED_BYTE, 
      data
    );

    // Clear and render
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Bind vertex buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

    const shader = this.shaderManager.getCurrentShader();
    if (!shader) return;

    // Set up attributes
    const positionLoc = gl.getAttribLocation(shader, 'a_position');
    const texCoordLoc = gl.getAttribLocation(shader, 'a_texCoord');

    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);

    // Set uniforms
    const textureLoc = gl.getUniformLocation(shader, 'u_texture');
    const resolutionLoc = gl.getUniformLocation(shader, 'u_resolution');
    const timeLoc = gl.getUniformLocation(shader, 'u_time');

    gl.uniform1i(textureLoc, 0);
    gl.uniform2f(resolutionLoc, this.canvas.width, this.canvas.height);
    gl.uniform1f(timeLoc, performance.now() / 1000.0);

    // Additional uniforms for CRT shader
    if (this.currentShader === 'crt') {
      const curvatureLoc = gl.getUniformLocation(shader, 'u_curvature');
      const scanlineIntensityLoc = gl.getUniformLocation(shader, 'u_scanlineIntensity');
      
      gl.uniform1f(curvatureLoc, 4.0);
      gl.uniform1f(scanlineIntensityLoc, 0.1);
    }

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  resize(width: number, height: number): void {
    if (!this.gl) return;
    this.gl.viewport(0, 0, width, height);
  }

  setShader(shader: 'default' | 'crt'): void {
    if (!this.shaderManager) return;
    this.currentShader = shader;
    this.shaderManager.useShader(shader);
  }

  destroy(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.texture) gl.deleteTexture(this.texture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    
    this.shaderManager?.destroy();
    this.gl = null;
  }
}