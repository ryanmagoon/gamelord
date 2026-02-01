import type { ShaderPresetDefinition } from '../types';
import { lcdPspFragmentShader } from '../shaders';

export const lcdPspPreset: ShaderPresetDefinition = {
  id: 'lcd-psp',
  label: 'LCD PSP',
  passes: [
    {
      index: 0,
      fragmentSource: lcdPspFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
