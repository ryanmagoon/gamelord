import type { ShaderPresetDefinition } from '../types';
import { sabrFragmentShader } from '../shaders';

export const sabrPreset: ShaderPresetDefinition = {
  id: 'sabr',
  label: 'SABR',
  passes: [
    {
      index: 0,
      fragmentSource: sabrFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
