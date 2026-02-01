import type { ShaderPresetDefinition } from '../types';
import { crtGeomFragmentShader } from '../shaders';

export const crtGeomPreset: ShaderPresetDefinition = {
  id: 'crt-geom',
  label: 'CRT Geom',
  passes: [
    {
      index: 0,
      fragmentSource: crtGeomFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
