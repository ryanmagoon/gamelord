import type { ShaderPresetDefinition } from '../types';
import { halftoneFragmentShader } from '../shaders';

export const halftonePreset: ShaderPresetDefinition = {
  id: 'halftone',
  label: 'Halftone',
  passes: [
    {
      index: 0,
      fragmentSource: halftoneFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
