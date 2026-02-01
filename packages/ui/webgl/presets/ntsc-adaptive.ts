import type { ShaderPresetDefinition } from '../types';
import { ntscEncodeVertexShader, ntscEncodeFragmentShader, ntscDecodeVertexShader, ntscDecodeFragmentShader } from '../shaders';

export const ntscAdaptivePreset: ShaderPresetDefinition = {
  id: 'ntsc-adaptive',
  label: 'NTSC Adaptive',
  passes: [
    {
      index: 0,
      vertexSource: ntscEncodeVertexShader,
      fragmentSource: ntscEncodeFragmentShader,
      scale: { type: 'source', x: 4, y: 1 },
      filter: 'nearest',
      format: 'rgba16f',
      alias: 'ntsc_encoded',
    },
    {
      index: 1,
      vertexSource: ntscDecodeVertexShader,
      fragmentSource: ntscDecodeFragmentShader,
      scale: { type: 'source', x: 0.5, y: 1 },
      filter: 'nearest',
      format: 'rgba16f',
    },
  ],
  luts: [],
};
