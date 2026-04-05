import { describe, it, expect } from "vitest";
import { crtGeomPreset } from "./crt-geom";
import { PRESET_LIST, PRESET_MAP } from "./index";

describe("crt-geom preset", () => {
  it("is registered in PRESET_LIST", () => {
    const found = PRESET_LIST.find((p) => p.id === "crt-geom");
    expect(found).toBeDefined();
    expect(found?.label).toBe("CRT Geom");
  });

  it("is registered in PRESET_MAP", () => {
    expect(PRESET_MAP.get("crt-geom")).toBe(crtGeomPreset);
  });

  it("has 1 pass", () => {
    expect(crtGeomPreset.passes).toHaveLength(1);
  });

  it("has no LUT textures", () => {
    expect(crtGeomPreset.luts).toHaveLength(0);
  });
});

describe("crt-geom parameters", () => {
  it("exposes tunable parameters", () => {
    expect(crtGeomPreset.parameters).toBeDefined();
  });

  it("has scanline weight tuned for text legibility", () => {
    expect(crtGeomPreset.parameters?.u_scanlineWeight).toBe(0.35);
  });

  it("has mask strength softer than original default", () => {
    expect(crtGeomPreset.parameters?.u_maskStrength).toBe(0.25);
  });

  it("has sharper at original default", () => {
    expect(crtGeomPreset.parameters?.u_sharper).toBe(1.0);
  });

  it("fragment shader declares uniform for scanline weight", () => {
    const pass = crtGeomPreset.passes[0];
    expect(pass.fragmentSource).toContain("uniform float u_scanlineWeight");
  });

  it("fragment shader declares uniform for mask strength", () => {
    const pass = crtGeomPreset.passes[0];
    expect(pass.fragmentSource).toContain("uniform float u_maskStrength");
  });

  it("fragment shader declares uniform for sharper", () => {
    const pass = crtGeomPreset.passes[0];
    expect(pass.fragmentSource).toContain("uniform float u_sharper");
  });
});
