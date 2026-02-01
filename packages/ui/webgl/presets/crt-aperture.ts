import type { ShaderPresetDefinition } from '../types';
import { crtApertureFragmentShader } from '../shaders';

export const crtAperturePreset: ShaderPresetDefinition = {
  id: 'crt-aperture',
  label: 'CRT Aperture',
  passes: [
    {
      index: 0,
      fragmentSource: crtApertureFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
