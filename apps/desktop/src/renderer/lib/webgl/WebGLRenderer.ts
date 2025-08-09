export type ShaderType = 'default' | 'crt';

export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private currentShader: ShaderType = 'default';
  private isReady = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl');
    
    if (!gl) {
      throw new Error('WebGL not supported');
    }
    
    this.gl = gl;
    this.initialize();
  }

  private initialize(): void {
    // Set up basic WebGL state
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    
    // TODO: Initialize shaders, buffers, etc.
    this.isReady = true;
  }

  setShader(shader: ShaderType): void {
    this.currentShader = shader;
    // TODO: Switch shader programs
    console.log(`Switched to ${shader} shader`);
  }

  render(videoFrame: ImageData): void {
    if (!this.isReady) return;
    
    // TODO: Render the video frame using WebGL
    console.log('Rendering frame with WebGL');
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  destroy(): void {
    // TODO: Clean up WebGL resources
    this.isReady = false;
  }
}
