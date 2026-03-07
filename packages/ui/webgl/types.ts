export type ScaleType = "source" | "viewport" | "absolute";

export type FilterMode = "nearest" | "linear";

export type FramebufferFormat = "rgba8" | "rgba16f" | "rgba32f";

export type WrapMode = "clamp" | "repeat" | "mirror";

export interface PassScale {
  type: ScaleType;
  x: number;
  y: number;
}

export interface ShaderPassDefinition {
  /** Alias name that other passes can reference this output by. */
  alias?: string;
  /**
   * Extra texture inputs beyond the automatic Source/Original/feedback.
   * Keys are uniform names, values are the alias of another pass or a LUT name.
   */
  extraInputs?: Record<string, string>;
  /** When true, the pass can read its own previous-frame output via u_feedback. */
  feedback?: boolean;
  filter: FilterMode;
  format: FramebufferFormat;
  fragmentSource: string;
  /** Pass index (0-based). */
  index: number;
  /** When true, mipmaps are generated on this pass's output FBO after rendering. */
  mipmap?: boolean;
  scale: PassScale;
  /** Vertex source override. If omitted the default fullscreen-quad vertex shader is used. */
  vertexSource?: string;
}

export interface LutDefinition {
  filter: FilterMode;
  /** Uniform name used in the shader (e.g. "u_mask"). */
  name: string;
  /** URL to the PNG texture (Vite-resolved import or public path). */
  path: string;
  wrapMode: WrapMode;
}

export interface ShaderPresetDefinition {
  id: string;
  label: string;
  luts: Array<LutDefinition>;
  passes: Array<ShaderPassDefinition>;
}
