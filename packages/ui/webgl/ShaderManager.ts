export class ShaderManager {
  private gl: WebGL2RenderingContext;
  private shaders: Map<string, WebGLProgram> = new Map();
  private currentShader: WebGLProgram | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  createShader(name: string, vertexSource: string, fragmentSource: string): void {
    const gl = this.gl;
    
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    
    if (!vertexShader || !fragmentShader) {
      throw new Error(`Failed to compile shaders for ${name}`);
    }

    const program = gl.createProgram();
    if (!program) {
      throw new Error('Failed to create shader program');
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Failed to link shader program: ${error}`);
    }

    // Clean up shaders as they're now part of the program
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    this.shaders.set(name, program);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      console.error(`Shader compilation error: ${error}`);
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  hasShader(name: string): boolean {
    return this.shaders.has(name);
  }

  useShader(name: string): void {
    const program = this.shaders.get(name);
    if (!program) {
      console.error(`Shader ${name} not found`);
      return;
    }

    this.gl.useProgram(program);
    this.currentShader = program;
  }

  getCurrentShader(): WebGLProgram | null {
    return this.currentShader;
  }

  destroy(): void {
    for (const program of this.shaders.values()) {
      this.gl.deleteProgram(program);
    }
    this.shaders.clear();
    this.currentShader = null;
  }
}