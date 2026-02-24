import type { ShaderPresetDefinition } from '../types';
import { defaultPreset } from './default';
import { linearPreset } from './linear';
import { nearestPreset } from './nearest';
import { crtAperturePreset } from './crt-aperture';
import { crtFastPreset } from './crt-fast';
import { crtCaligariPreset } from './crt-caligari';
import { crtGeomPreset } from './crt-geom';
import { crtGeomDeluxePreset } from './crt-geom-deluxe';
import { pixellatePreset } from './pixellate';
import { sabrPreset } from './sabr';
import { xbrzFreescalePreset } from './xbrz-freescale';
import { ditherPreset } from './dither';
import { halftonePreset } from './halftone';
import { lcdPspPreset } from './lcd-psp';
import { ntscAdaptivePreset } from './ntsc-adaptive';
import { motionBlurPreset } from './motion-blur';
import { lcdGridV2GbaColorPreset } from './lcd-grid-v2-gba-color';
import { lcdGridV2GbaColorMotionblurPreset } from './lcd-grid-v2-gba-color-motionblur';

/** All available shader presets, ordered for UI display. */
export const PRESET_LIST: ShaderPresetDefinition[] = [
  defaultPreset,
  nearestPreset,
  linearPreset,
  crtAperturePreset,
  crtFastPreset,
  crtCaligariPreset,
  crtGeomPreset,
  crtGeomDeluxePreset,
  pixellatePreset,
  sabrPreset,
  xbrzFreescalePreset,
  ditherPreset,
  halftonePreset,
  lcdPspPreset,
  lcdGridV2GbaColorPreset,
  lcdGridV2GbaColorMotionblurPreset,
  ntscAdaptivePreset,
  motionBlurPreset,
];

/** Lookup map from preset id to definition. */
export const PRESET_MAP = new Map<string, ShaderPresetDefinition>(
  PRESET_LIST.map((p) => [p.id, p]),
);
