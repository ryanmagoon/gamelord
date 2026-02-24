import type { ShaderPresetDefinition } from '../types';
import {
  lcdResponseTimeFragmentShader,
  lcdGridV2FragmentShader,
  gbaColorFragmentShader,
} from '../lcd-grid-v2-gba-shaders';

export const lcdGridV2GbaColorMotionblurPreset: ShaderPresetDefinition = {
  id: 'lcd-grid-v2-gba-color-motionblur',
  label: 'LCD GBA + Motion Blur',
  passes: [
    {
      index: 0,
      fragmentSource: lcdResponseTimeFragmentShader,
      scale: { type: 'source', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
      feedback: true,
    },
    {
      index: 1,
      fragmentSource: lcdGridV2FragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
    {
      index: 2,
      fragmentSource: gbaColorFragmentShader,
      scale: { type: 'source', x: 1, y: 1 },
      filter: 'nearest',
      format: 'rgba8',
    },
  ],
  luts: [],
};
