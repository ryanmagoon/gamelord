import type { ShaderPresetDefinition } from '../types';
import { ditherFragmentShader } from '../shaders';

export const ditherPreset: ShaderPresetDefinition = {
  id: 'dither',
  label: 'Dither',
  luts: [],
  passes: [
    {
      index: 0,
      fragmentSource: ditherFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
};
