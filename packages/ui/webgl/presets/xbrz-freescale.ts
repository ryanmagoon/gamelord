import type { ShaderPresetDefinition } from '../types';
import { xbrzFreescaleFragmentShader } from '../shaders';

export const xbrzFreescalePreset: ShaderPresetDefinition = {
  id: 'xbrz-freescale',
  label: 'xBRZ Freescale',
  passes: [
    {
      index: 0,
      fragmentSource: xbrzFreescaleFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
