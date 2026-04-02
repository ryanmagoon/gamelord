import type { ShaderPresetDefinition } from "../types";
import { crtGeomFragmentShader } from "../shaders";

export const crtGeomPreset: ShaderPresetDefinition = {
  id: "crt-geom",
  label: "CRT Geom",
  luts: [],
  parameters: {
    u_scanlineWeight: 0.35,
    u_maskStrength: 0.25,
    u_sharper: 1.0,
  },
  passes: [
    {
      index: 0,
      fragmentSource: crtGeomFragmentShader,
      scale: { type: "viewport", x: 1, y: 1 },
      filter: "nearest",
      format: "rgba8",
    },
  ],
};
