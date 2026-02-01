import type { ShaderPresetDefinition } from '../types';
import { motionBlurFragmentShader } from '../shaders';

export const motionBlurPreset: ShaderPresetDefinition = {
  id: 'motion-blur',
  label: 'Motion Blur',
  passes: [
    {
      index: 0,
      fragmentSource: motionBlurFragmentShader,
      scale: { type: 'viewport', x: 1, y: 1 },
      filter: 'linear',
      format: 'rgba8',
      feedback: true,
    },
  ],
  luts: [],
};
