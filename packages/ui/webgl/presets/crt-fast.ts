import type { ShaderPresetDefinition } from '../types';
import { crtFastFragmentShader } from '../shaders';

export const crtFastPreset: ShaderPresetDefinition = {
  id: 'crt-fast',
  label: 'CRT Fast',
  passes: [
    {
      index: 0,
      fragmentSource: crtFastFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
