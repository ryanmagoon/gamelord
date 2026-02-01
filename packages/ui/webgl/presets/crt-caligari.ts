import type { ShaderPresetDefinition } from '../types';
import { crtCaligariFragmentShader } from '../shaders';

export const crtCaligariPreset: ShaderPresetDefinition = {
  id: 'crt-caligari',
  label: 'CRT Caligari',
  passes: [
    {
      index: 0,
      fragmentSource: crtCaligariFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
