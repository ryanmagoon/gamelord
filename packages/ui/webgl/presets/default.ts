import type { ShaderPresetDefinition } from '../types';
import { defaultFragmentShader } from '../shaders';

export const defaultPreset: ShaderPresetDefinition = {
  id: 'default',
  label: 'None',
  passes: [
    {
      index: 0,
      fragmentSource: defaultFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
