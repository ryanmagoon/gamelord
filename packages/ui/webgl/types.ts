export type ScaleType = 'source' | 'viewport' | 'absolute';

export type FilterMode = 'nearest' | 'linear';

export type FramebufferFormat = 'rgba8' | 'rgba16f' | 'rgba32f';

export type WrapMode = 'clamp' | 'repeat' | 'mirror';

export interface PassScale {
  type: ScaleType;
  x: number;
  y: number;
}

export interface ShaderPassDefinition {
  /** Pass index (0-based). */
  index: number;
  fragmentSource: string;
  /** Vertex source override. If omitted the default fullscreen-quad vertex shader is used. */
  vertexSource?: string;
  scale: PassScale;
  filter: FilterMode;
  format: FramebufferFormat;
  /** Alias name that other passes can reference this output by. */
  alias?: string;
  /** When true, the pass can read its own previous-frame output via u_feedback. */
  feedback?: boolean;
  /**
   * Extra texture inputs beyond the automatic Source/Original/feedback.
   * Keys are uniform names, values are the alias of another pass or a LUT name.
   */
  extraInputs?: Record<string, string>;
}

export interface LutDefinition {
  /** Uniform name used in the shader (e.g. "u_mask"). */
  name: string;
  /** URL to the PNG texture (Vite-resolved import or public path). */
  path: string;
  filter: FilterMode;
  wrapMode: WrapMode;
}

export interface ShaderPresetDefinition {
  id: string;
  label: string;
  passes: ShaderPassDefinition[];
  luts: LutDefinition[];
}
