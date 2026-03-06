import type { ShaderPresetDefinition } from '../types';
import { pixellateFragmentShader } from '../shaders';

export const pixellatePreset: ShaderPresetDefinition = {
  id: 'pixellate',
  label: 'Pixellate',
  luts: [],
  passes: [
    {
      index: 0,
      fragmentSource: pixellateFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
};
