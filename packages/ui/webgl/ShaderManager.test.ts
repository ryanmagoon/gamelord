import { ShaderManager } from './ShaderManager';

const VERTEX_SRC = 'void main() {}';
const FRAGMENT_SRC = 'void main() {}';

function createMockGL() {
  const mockProgram = {} as WebGLProgram;
  const mockShader = {} as WebGLShader;

  return {
    mockProgram,
    mockShader,
    gl: {
      VERTEX_SHADER: 35633,
      FRAGMENT_SHADER: 35632,
      COMPILE_STATUS: 35713,
      LINK_STATUS: 35714,
      createShader: vi.fn(() => mockShader),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => true),
      getShaderInfoLog: vi.fn(() => ''),
      deleteShader: vi.fn(),
      createProgram: vi.fn(() => mockProgram),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn(() => true),
      getProgramInfoLog: vi.fn(() => ''),
      deleteProgram: vi.fn(),
      useProgram: vi.fn(),
    } as unknown as WebGL2RenderingContext,
  };
}

describe('ShaderManager', () => {
  let gl: WebGL2RenderingContext;
  let mockProgram: WebGLProgram;
  let mockShader: WebGLShader;
  let manager: ShaderManager;

  beforeEach(() => {
    const mock = createMockGL();
    gl = mock.gl;
    mockProgram = mock.mockProgram;
    mockShader = mock.mockShader;
    manager = new ShaderManager(gl);
  });

  describe('createShader', () => {
    it('compiles vertex and fragment shaders, links program, and stores it', () => {
      manager.createShader('test', VERTEX_SRC, FRAGMENT_SRC);

      expect(gl.createShader).toHaveBeenCalledWith(gl.VERTEX_SHADER);
      expect(gl.createShader).toHaveBeenCalledWith(gl.FRAGMENT_SHADER);
      expect(gl.shaderSource).toHaveBeenCalledTimes(2);
      expect(gl.compileShader).toHaveBeenCalledTimes(2);
      expect(gl.attachShader).toHaveBeenCalledWith(mockProgram, mockShader);
      expect(gl.attachShader).toHaveBeenCalledTimes(2);
      expect(gl.linkProgram).toHaveBeenCalledWith(mockProgram);
      expect(manager.hasShader('test')).toBe(true);
    });

    it('throws when vertex shader compilation fails', () => {
      vi.mocked(gl.getShaderParameter).mockReturnValueOnce(false);

      expect(() => manager.createShader('bad-vert', VERTEX_SRC, FRAGMENT_SRC)).toThrow(
        'Failed to compile shaders for bad-vert',
      );
    });

    it('throws when fragment shader compilation fails', () => {
      vi.mocked(gl.getShaderParameter)
        .mockReturnValueOnce(true) // vertex succeeds
        .mockReturnValueOnce(false); // fragment fails

      expect(() => manager.createShader('bad-frag', VERTEX_SRC, FRAGMENT_SRC)).toThrow(
        'Failed to compile shaders for bad-frag',
      );
    });

    it('throws when createProgram returns null', () => {
      vi.mocked(gl.createProgram).mockReturnValueOnce(null);

      expect(() => manager.createShader('no-program', VERTEX_SRC, FRAGMENT_SRC)).toThrow(
        'Failed to create shader program',
      );
    });

    it('throws when program linking fails and deletes the program', () => {
      vi.mocked(gl.getProgramParameter).mockReturnValueOnce(false);
      vi.mocked(gl.getProgramInfoLog).mockReturnValueOnce('link error details');

      expect(() => manager.createShader('bad-link', VERTEX_SRC, FRAGMENT_SRC)).toThrow(
        'Failed to link shader program: link error details',
      );
      expect(gl.deleteProgram).toHaveBeenCalledWith(mockProgram);
    });

    it('cleans up individual shaders after successful linking', () => {
      manager.createShader('cleanup', VERTEX_SRC, FRAGMENT_SRC);

      expect(gl.deleteShader).toHaveBeenCalledTimes(2);
      expect(gl.deleteShader).toHaveBeenCalledWith(mockShader);
    });
  });

  describe('hasShader', () => {
    it('returns true for an existing shader', () => {
      manager.createShader('exists', VERTEX_SRC, FRAGMENT_SRC);
      expect(manager.hasShader('exists')).toBe(true);
    });

    it('returns false for a missing shader', () => {
      expect(manager.hasShader('nope')).toBe(false);
    });
  });

  describe('useShader', () => {
    it('calls gl.useProgram with the correct program', () => {
      manager.createShader('active', VERTEX_SRC, FRAGMENT_SRC);
      manager.useShader('active');

      expect(gl.useProgram).toHaveBeenCalledWith(mockProgram);
    });

    it('sets currentShader to the used program', () => {
      manager.createShader('active', VERTEX_SRC, FRAGMENT_SRC);
      manager.useShader('active');

      expect(manager.getCurrentShader()).toBe(mockProgram);
    });

    it('logs an error and does not throw for a missing shader', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

      expect(() => manager.useShader('missing')).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith('Shader missing not found');
      expect(gl.useProgram).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('getCurrentShader', () => {
    it('returns null initially', () => {
      expect(manager.getCurrentShader()).toBeNull();
    });

    it('returns the last used shader program', () => {
      manager.createShader('a', VERTEX_SRC, FRAGMENT_SRC);
      manager.useShader('a');

      expect(manager.getCurrentShader()).toBe(mockProgram);
    });
  });

  describe('destroy', () => {
    it('deletes all programs via gl.deleteProgram', () => {
      const programA = { __id: 'a' } as unknown as WebGLProgram;
      const programB = { __id: 'b' } as unknown as WebGLProgram;

      vi.mocked(gl.createProgram)
        .mockReturnValueOnce(programA)
        .mockReturnValueOnce(programB);

      manager.createShader('a', VERTEX_SRC, FRAGMENT_SRC);
      manager.createShader('b', VERTEX_SRC, FRAGMENT_SRC);
      vi.mocked(gl.deleteProgram).mockClear();

      manager.destroy();

      expect(gl.deleteProgram).toHaveBeenCalledWith(programA);
      expect(gl.deleteProgram).toHaveBeenCalledWith(programB);
      expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
    });

    it('clears the shader map', () => {
      manager.createShader('temp', VERTEX_SRC, FRAGMENT_SRC);
      expect(manager.hasShader('temp')).toBe(true);

      manager.destroy();
      expect(manager.hasShader('temp')).toBe(false);
    });

    it('sets currentShader to null', () => {
      manager.createShader('active', VERTEX_SRC, FRAGMENT_SRC);
      manager.useShader('active');
      expect(manager.getCurrentShader()).not.toBeNull();

      manager.destroy();
      expect(manager.getCurrentShader()).toBeNull();
    });
  });
});
