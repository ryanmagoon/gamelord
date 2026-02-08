import type { ShaderPresetDefinition } from '../types';
import {
  phosphorApplyFragmentShader,
  phosphorUpdateFragmentShader,
  gaussxVertexShader,
  gaussxFragmentShader,
  gaussyVertexShader,
  gaussyFragmentShader,
  crtGeomDeluxeVertexShader,
  crtGeomDeluxeFragmentShader,
} from '../crt-geom-deluxe-shaders';

export const crtGeomDeluxePreset: ShaderPresetDefinition = {
  id: 'crt-geom-deluxe',
  label: 'CRT Geom Deluxe',
  passes: [
    {
      index: 0,
      fragmentSource: phosphorApplyFragmentShader,
      scale: { type: 'source', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba16f',
      alias: 'internal1',
      extraInputs: {
        u_phosphorFeedback: 'feedback:phosphor',
      },
    },
    {
      index: 1,
      fragmentSource: phosphorUpdateFragmentShader,
      scale: { type: 'source', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba16f',
      alias: 'phosphor',
      feedback: true,
    },
    {
      index: 2,
      vertexSource: gaussxVertexShader,
      fragmentSource: gaussxFragmentShader,
      scale: { type: 'source', x: 1, y: 1 },
      filter: 'linear',
      format: 'rgba16f',
      alias: 'internal2',
      extraInputs: {
        u_internal1: 'internal1',
      },
    },
    {
      index: 3,
      vertexSource: gaussyVertexShader,
      fragmentSource: gaussyFragmentShader,
      scale: { type: 'source', x: 1, y: 1 },
      filter: 'linear',
      format: 'rgba16f',
      alias: 'blur_texture',
      mipmap: true,
    },
    {
      index: 4,
      vertexSource: crtGeomDeluxeVertexShader,
      fragmentSource: crtGeomDeluxeFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'linear',
      format: 'rgba8',
      extraInputs: {
        u_internal1: 'internal1',
        u_blur_texture: 'blur_texture',
      },
    },
  ],
  luts: [],
};
