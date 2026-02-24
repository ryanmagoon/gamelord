import type { ShaderPresetDefinition } from '../types';
import { lcdGridV2FragmentShader, gbaColorFragmentShader } from '../lcd-grid-v2-gba-shaders';

export const lcdGridV2GbaColorPreset: ShaderPresetDefinition = {
  id: 'lcd-grid-v2-gba-color',
  label: 'LCD GBA',
  passes: [
    {
      index: 0,
      fragmentSource: lcdGridV2FragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
    {
      index: 1,
      fragmentSource: gbaColorFragmentShader,
      scale: { type: 'source', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
