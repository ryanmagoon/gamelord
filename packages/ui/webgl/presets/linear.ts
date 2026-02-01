import type { ShaderPresetDefinition } from '../types';
import { defaultFragmentShader } from '../shaders';

export const linearPreset: ShaderPresetDefinition = {
  id: 'linear',
  label: 'Linear',
  passes: [
    {
      index: 0,
      fragmentSource: defaultFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'linear',
      format: 'rgba8',
    },
  ],
  luts: [],
};
