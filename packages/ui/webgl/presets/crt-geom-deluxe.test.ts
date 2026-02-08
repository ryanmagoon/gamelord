import { describe, it, expect } from 'vitest';
import { crtGeomDeluxePreset } from './crt-geom-deluxe';
import { PRESET_LIST, PRESET_MAP } from './index';

describe('crt-geom-deluxe preset', () => {
  it('is registered in PRESET_LIST', () => {
    const found = PRESET_LIST.find((p) => p.id === 'crt-geom-deluxe');
    expect(found).toBeDefined();
    expect(found!.label).toBe('CRT Geom Deluxe');
  });

  it('is registered in PRESET_MAP', () => {
    expect(PRESET_MAP.get('crt-geom-deluxe')).toBe(crtGeomDeluxePreset);
  });

  it('has 5 passes', () => {
    expect(crtGeomDeluxePreset.passes).toHaveLength(5);
  });

  it('has no LUT textures (masks are procedural)', () => {
    expect(crtGeomDeluxePreset.luts).toHaveLength(0);
  });

  describe('pass 0 — phosphor_apply', () => {
    const pass = crtGeomDeluxePreset.passes[0];

    it('uses rgba16f format for float precision', () => {
      expect(pass.format).toBe('rgba16f');
    });

    it('has alias "internal1"', () => {
      expect(pass.alias).toBe('internal1');
    });

    it('references cross-pass feedback from phosphor pass', () => {
      expect(pass.extraInputs).toEqual({
        u_phosphorFeedback: 'feedback:phosphor',
      });
    });

    it('scales at source resolution', () => {
      expect(pass.scale).toEqual({ type: 'source', x: 1, y: 1 });
    });
  });

  describe('pass 1 — phosphor_update', () => {
    const pass = crtGeomDeluxePreset.passes[1];

    it('has self-feedback enabled', () => {
      expect(pass.feedback).toBe(true);
    });

    it('has alias "phosphor"', () => {
      expect(pass.alias).toBe('phosphor');
    });

    it('uses rgba16f format', () => {
      expect(pass.format).toBe('rgba16f');
    });
  });

  describe('pass 2 — gaussx', () => {
    const pass = crtGeomDeluxePreset.passes[2];

    it('reads from internal1 via extraInputs', () => {
      expect(pass.extraInputs).toEqual({
        u_internal1: 'internal1',
      });
    });

    it('uses linear filtering for blur', () => {
      expect(pass.filter).toBe('linear');
    });

    it('has custom vertex shader', () => {
      expect(pass.vertexSource).toBeDefined();
    });
  });

  describe('pass 3 — gaussy', () => {
    const pass = crtGeomDeluxePreset.passes[3];

    it('has mipmap generation enabled for raster bloom', () => {
      expect(pass.mipmap).toBe(true);
    });

    it('has alias "blur_texture"', () => {
      expect(pass.alias).toBe('blur_texture');
    });
  });

  describe('pass 4 — crt-geom-deluxe composite', () => {
    const pass = crtGeomDeluxePreset.passes[4];

    it('reads from internal1 and blur_texture via extraInputs', () => {
      expect(pass.extraInputs).toEqual({
        u_internal1: 'internal1',
        u_blur_texture: 'blur_texture',
      });
    });

    it('scales at viewport resolution', () => {
      expect(pass.scale).toEqual({ type: 'viewport', x: 1, y: 1 });
    });

    it('has custom vertex shader for barrel distortion', () => {
      expect(pass.vertexSource).toBeDefined();
    });

    it('outputs rgba8 for final screen', () => {
      expect(pass.format).toBe('rgba8');
    });
  });
});

describe('crt-geom-deluxe GLSL sources', () => {
  it('all passes have non-empty fragment shaders', () => {
    for (const pass of crtGeomDeluxePreset.passes) {
      expect(pass.fragmentSource.length).toBeGreaterThan(100);
      expect(pass.fragmentSource).toContain('#version 300 es');
    }
  });

  it('pass 4 fragment shader contains mask_weights function', () => {
    const pass4 = crtGeomDeluxePreset.passes[4];
    expect(pass4.fragmentSource).toContain('mask_weights');
  });

  it('pass 4 fragment shader contains barrel distortion', () => {
    const pass4 = crtGeomDeluxePreset.passes[4];
    expect(pass4.fragmentSource).toContain('bkwtrans');
  });

  it('pass 4 fragment shader reads textureLod for raster bloom', () => {
    const pass4 = crtGeomDeluxePreset.passes[4];
    expect(pass4.fragmentSource).toContain('textureLod');
  });

  it('pass 0 fragment shader samples u_texture', () => {
    const pass0 = crtGeomDeluxePreset.passes[0];
    expect(pass0.fragmentSource).toContain('u_texture');
  });

  it('pass 1 fragment shader samples u_texture', () => {
    const pass1 = crtGeomDeluxePreset.passes[1];
    expect(pass1.fragmentSource).toContain('u_texture');
  });
});
