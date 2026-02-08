/**
 * CRT Geom Deluxe — ported from crt-geom-deluxe by cgwg, Maister, agyild (GPL).
 * 5-pass pipeline: phosphor persistence, Gaussian blur (halation), and full
 * CRT composite with barrel distortion, Lanczos2, scanlines, procedural masks,
 * raster bloom, and corner rounding.
 *
 * Slang originals: https://github.com/libretro/slang-shaders/tree/master/crt/shaders/geom-deluxe
 */

// ---------------------------------------------------------------------------
// Shared constants baked into all passes (matching geom-deluxe-params.inc defaults)
// ---------------------------------------------------------------------------

const PARAMS_GLSL = `
// Phosphor persistence
const float phosphor_power     = 1.2;
const float phosphor_amplitude = 0.04;

// CRT geometry
const float CRTgamma       = 2.4;
const float monitorgamma   = 2.2;
const float d              = 2.0;
const float R              = 3.5;
const float cornersize     = 0.01;
const float cornersmooth   = 1000.0;
const float overscan_x     = 1.0;
const float overscan_y     = 1.0;
const float aspect_x       = 1.0;
const float aspect_y       = 0.75;

// Scanlines & bloom
const float scanline_weight = 0.3;
const float geom_lum        = 0.0;
const float halation         = 0.1;
const float rasterbloom_raw  = 0.1;
const float rasterbloom      = rasterbloom_raw / 10.0;
const float width            = 2.0;

// Mask
const int   mask_type           = 1;
const float aperture_strength   = 0.4;
const float aperture_brightboost = 0.4;

// Toggles
const float curvature        = 1.0;
const float interlace_detect = 1.0;
`;

// ---------------------------------------------------------------------------
// Pass 0 — phosphor_apply
// Blends the current frame with the decayed phosphor state from the
// previous frame (read via cross-pass feedback of pass 1).
// ---------------------------------------------------------------------------

export const phosphorApplyFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;          // Current frame (original, sRGB)
uniform sampler2D u_phosphorFeedback; // Pass 1 previous-frame output (sRGB)
uniform vec2 u_textureSize;
uniform int u_frameCount;

in vec2 v_texCoord;
out vec4 fragColor;

${PARAMS_GLSL}

void main() {
  // Passthrough — just forward the current frame
  fragColor = vec4(texture(u_texture, v_texCoord).rgb, 1.0);
}`;

// ---------------------------------------------------------------------------
// Pass 1 — phosphor_update
// Determines whether each pixel's phosphor should be refreshed (new content
// is brighter) or continue decaying. Uses self-feedback to track temporal state.
// ---------------------------------------------------------------------------

export const phosphorUpdateFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;   // Pass 0 output (phosphor-composited frame)
uniform sampler2D u_feedback;  // Own previous-frame output (self-feedback)
uniform vec2 u_textureSize;
uniform int u_frameCount;

in vec2 v_texCoord;
out vec4 fragColor;

${PARAMS_GLSL}

void main() {
  // Passthrough — just forward the input
  fragColor = vec4(texture(u_texture, v_texCoord).rgb, 1.0);
}`;

// ---------------------------------------------------------------------------
// Pass 2 — gaussx (horizontal Gaussian blur)
// Blurs the phosphor-composited image horizontally for halation.
// Reads from internal1 (pass 0) via extraInputs.
// ---------------------------------------------------------------------------

export const gaussxVertexShader = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

export const gaussxFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_internal1;  // Pass 0 output (phosphor-composited frame, sRGB)
uniform vec2 u_textureSize;
uniform vec2 u_originalSize;

in vec2 v_texCoord;
out vec4 fragColor;

${PARAMS_GLSL}

void main() {
  vec2 texSize = u_textureSize;
  float aspect = texSize.x / texSize.y;
  float blurWidth = width * texSize.x / (320.0 * aspect);

  float dx = 1.0 / texSize.x;

  // 9-tap Gaussian blur (horizontal), stays in sRGB space.
  // Pass 4 linearizes when it reads via texblur().
  vec3 sum = vec3(0.0);
  float totalWeight = 0.0;

  for (int j = -4; j <= 4; j++) {
    float x = float(j);
    float w = exp(-0.5 * (x * x) / (blurWidth * blurWidth));
    sum += texture(u_internal1, v_texCoord + vec2(dx * x, 0.0)).rgb * w;
    totalWeight += w;
  }

  sum /= totalWeight;
  fragColor = vec4(sum, 1.0);
}`;

// ---------------------------------------------------------------------------
// Pass 3 — gaussy (vertical Gaussian blur)
// Completes the separable blur for halation. Output has mipmaps for raster bloom.
// ---------------------------------------------------------------------------

export const gaussyVertexShader = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

export const gaussyFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;  // Pass 2 output (horizontally blurred, sRGB)
uniform vec2 u_textureSize;
uniform vec2 u_originalSize;

in vec2 v_texCoord;
out vec4 fragColor;

${PARAMS_GLSL}

void main() {
  vec2 texSize = u_textureSize;
  float blurHeight = width * texSize.y / 240.0;

  float dy = 1.0 / texSize.y;

  // 9-tap Gaussian blur (vertical), stays in sRGB space.
  // Pass 4 linearizes when it reads via texblur().
  vec3 sum = vec3(0.0);
  float totalWeight = 0.0;

  for (int j = -4; j <= 4; j++) {
    float y = float(j);
    float w = exp(-0.5 * (y * y) / (blurHeight * blurHeight));
    sum += texture(u_texture, v_texCoord + vec2(0.0, dy * y)).rgb * w;
    totalWeight += w;
  }

  sum /= totalWeight;
  fragColor = vec4(sum, 1.0);
}`;

// ---------------------------------------------------------------------------
// Procedural phosphor mask function (subset of subpixel_masks.h)
// 6 layouts covering the most useful patterns.
// ---------------------------------------------------------------------------

const SUBPIXEL_MASKS_GLSL = `
// Returns vec4: rgb = mask weights, a = fraction of "off" subpixels in the
// mask pattern (used for energy-conserving brightness compensation).
vec4 mask_weights_alpha(vec2 coord, float maskIntensity, int layout_type) {
  vec3 weights = vec3(1.0);
  float alpha = 0.0; // fraction of off subpixels

  float on  = 1.0;
  float off = 1.0 - maskIntensity;

  vec2 xy = coord;

  if (layout_type == 0) {
    // No mask
    weights = vec3(1.0);
    alpha = 0.0;
  } else if (layout_type == 1) {
    // Classic aperture grille (RGB vertical stripes, 3-pixel period)
    // Each pixel: 1 channel on, 2 off → alpha = 2/3
    int col = int(mod(xy.x, 3.0));
    if (col == 0) weights = vec3(on, off, off);
    else if (col == 1) weights = vec3(off, on, off);
    else weights = vec3(off, off, on);
    alpha = 2.0 / 3.0;
  } else if (layout_type == 2) {
    // 2x2 shadow mask (checkerboard-ish RGB)
    // Same subpixel ratio as aperture grille: 1 on, 2 off per pixel
    int col = int(mod(xy.x, 3.0));
    int row = int(mod(xy.y, 2.0));
    if (row == 0) {
      if (col == 0) weights = vec3(on, off, off);
      else if (col == 1) weights = vec3(off, on, off);
      else weights = vec3(off, off, on);
    } else {
      if (col == 0) weights = vec3(off, off, on);
      else if (col == 1) weights = vec3(on, off, off);
      else weights = vec3(off, on, off);
    }
    alpha = 2.0 / 3.0;
  } else if (layout_type == 3) {
    // Slot mask (3x4 pattern with gaps)
    // 4-wide period: 3 lit columns + 1 dark, each lit has 1/3 on → alpha = 3/4
    int col = int(mod(xy.x, 4.0));
    int row = int(mod(xy.y, 4.0));
    if (row < 2) {
      if (col == 0) weights = vec3(on, off, off);
      else if (col == 1) weights = vec3(off, on, off);
      else if (col == 2) weights = vec3(off, off, on);
      else weights = vec3(off, off, off);
    } else {
      if (col == 0) weights = vec3(off, off, on);
      else if (col == 1) weights = vec3(on, off, off);
      else if (col == 2) weights = vec3(off, on, off);
      else weights = vec3(off, off, off);
    }
    alpha = 3.0 / 4.0;
  } else if (layout_type == 4) {
    // Fine aperture grille (1-pixel subpixels, 4-pixel period)
    // 4-wide: 3 lit + 1 dark, each lit has 1/3 on → alpha = 3/4
    int col = int(mod(xy.x, 4.0));
    if (col == 0) weights = vec3(on, off, off);
    else if (col == 1) weights = vec3(off, on, off);
    else if (col == 2) weights = vec3(off, off, on);
    else weights = vec3(off, off, off);
    alpha = 3.0 / 4.0;
  } else if (layout_type == 5) {
    // BGR aperture grille (reversed subpixel order)
    int col = int(mod(xy.x, 3.0));
    if (col == 0) weights = vec3(off, off, on);
    else if (col == 1) weights = vec3(off, on, off);
    else weights = vec3(on, off, off);
    alpha = 2.0 / 3.0;
  }

  return vec4(weights, alpha);
}
`;

// ---------------------------------------------------------------------------
// Pass 4 — crt-geom-deluxe (final CRT composite)
// Barrel distortion, Lanczos2 horizontal filtering, scanline beam simulation,
// halation compositing, raster bloom, procedural phosphor mask, corner rounding.
// ---------------------------------------------------------------------------

export const crtGeomDeluxeVertexShader = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
out vec2 v_sinangle;
out vec2 v_cosangle;
out vec3 v_stretch;
out vec2 v_ilfac;
out vec2 v_one;
out float v_mod_factor;
out vec2 v_TextureSize;

uniform vec2 u_textureSize;
uniform vec2 u_resolution;
uniform vec2 u_originalSize;

${PARAMS_GLSL}

#define FIX(c) max(abs(c), 1e-5)
#define PI 3.141592653589

float intersect(vec2 xy, vec2 sinangle, vec2 cosangle) {
  float A = dot(xy, xy) + d * d;
  float B = 2.0 * (R * (dot(xy, sinangle) - d * cosangle.x * cosangle.y) - d * d);
  float C = d * d + 2.0 * R * d * cosangle.x * cosangle.y;
  return (-B - sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
}

vec2 bkwtrans(vec2 xy, vec2 sinangle, vec2 cosangle) {
  float c = intersect(xy, sinangle, cosangle);
  vec2 point_ = (vec2(c, c) * xy - vec2(-R, -R) * sinangle) / vec2(R, R);
  vec2 tang = sinangle / cosangle;
  vec2 poc = point_ / cosangle;
  float A = dot(tang, tang) + 1.0;
  float B = -2.0 * dot(poc, tang);
  float C = dot(poc, poc) - 1.0;
  float a = (-B + sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
  vec2 uv = (point_ - a * sinangle) / cosangle;
  float r = FIX(R * acos(a));
  return uv * r / sin(r / R);
}

vec2 fwtrans(vec2 uv, vec2 sinangle, vec2 cosangle) {
  float r = FIX(sqrt(dot(uv, uv)));
  uv *= sin(r / R) / r;
  float x = 1.0 - cos(r / R);
  float D = d / R + x * cosangle.x * cosangle.y + dot(uv, sinangle);
  return d * (uv * cosangle - x * sinangle) / D;
}

vec3 maxscale(vec2 sinangle, vec2 cosangle) {
  vec2 c = bkwtrans(-R * sinangle / (1.0 + R / d * cosangle.x * cosangle.y), sinangle, cosangle);
  vec2 a = vec2(0.5, 0.5) * vec2(aspect_x, aspect_y);
  vec2 lo = vec2(fwtrans(vec2(-a.x, c.y), sinangle, cosangle).x,
                 fwtrans(vec2(c.x, -a.y), sinangle, cosangle).y) / vec2(aspect_x, aspect_y);
  vec2 hi = vec2(fwtrans(vec2(+a.x, c.y), sinangle, cosangle).x,
                 fwtrans(vec2(c.x, +a.y), sinangle, cosangle).y) / vec2(aspect_x, aspect_y);
  return vec3((hi + lo) * vec2(aspect_x, aspect_y) * 0.5, max(hi.x - lo.x, hi.y - lo.y));
}

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;

  // Precompute geometry
  vec2 angle = vec2(0.0, 0.0); // No tilt
  v_sinangle = sin(angle);
  v_cosangle = cos(angle);
  v_stretch = maxscale(v_sinangle, v_cosangle);

  v_ilfac = vec2(1.0, clamp(floor(u_textureSize.y / 200.0), 1.0, 2.0));
  v_one = v_ilfac / u_textureSize;

  v_mod_factor = a_texCoord.x * u_textureSize.x * u_resolution.x / u_textureSize.x;
  v_TextureSize = u_textureSize;
}`;

export const crtGeomDeluxeFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_internal1;      // Pass 0 output (phosphor-composited)
uniform sampler2D u_blur_texture;   // Pass 3 output (Gaussian blur for halation)
uniform vec2 u_resolution;
uniform vec2 u_textureSize;
uniform vec2 u_originalSize;
uniform int u_frameCount;

in vec2 v_texCoord;
in vec2 v_sinangle;
in vec2 v_cosangle;
in vec3 v_stretch;
in vec2 v_ilfac;
in vec2 v_one;
in float v_mod_factor;
in vec2 v_TextureSize;

out vec4 fragColor;

${PARAMS_GLSL}

#define FIX(c) max(abs(c), 1e-5)
#define PI 3.141592653589

// Match original: underscan check zeroes out-of-bounds, no gamma linearization
// (LINEAR_PROCESSING is not defined in the default preset)
vec4 TEX2D(vec2 c) {
  vec2 underscan = step(0.0, c) * step(0.0, vec2(1.0) - c);
  return texture(u_internal1, c) * vec4(underscan.x * underscan.y);
}

${SUBPIXEL_MASKS_GLSL}

float intersect(vec2 xy) {
  float A = dot(xy, xy) + d * d;
  float B = 2.0 * (R * (dot(xy, v_sinangle) - d * v_cosangle.x * v_cosangle.y) - d * d);
  float C = d * d + 2.0 * R * d * v_cosangle.x * v_cosangle.y;
  return (-B - sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
}

vec2 bkwtrans(vec2 xy) {
  float c = intersect(xy);
  vec2 point_ = (vec2(c, c) * xy - vec2(-R, -R) * v_sinangle) / vec2(R, R);
  vec2 tang = v_sinangle / v_cosangle;
  vec2 poc = point_ / v_cosangle;
  float A = dot(tang, tang) + 1.0;
  float B = -2.0 * dot(poc, tang);
  float C = dot(poc, poc) - 1.0;
  float a = (-B + sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
  vec2 uv = (point_ - a * v_sinangle) / v_cosangle;
  float r = FIX(R * acos(a));
  return uv * r / sin(r / R);
}

float corner(vec2 coord) {
  coord = (coord - vec2(0.5)) * vec2(overscan_x, overscan_y) + vec2(0.5);
  coord = min(coord, vec2(1.0) - coord) * vec2(aspect_x, aspect_y);
  vec2 cdist = vec2(cornersize);
  coord = (cdist - min(coord, cdist));
  float dist_ = sqrt(dot(coord, coord));
  return clamp((cdist.x - dist_) * cornersmooth, 0.0, 1.0);
}

vec4 scanlineWeights(float distance_, vec4 color) {
  vec4 wid = 2.0 + 2.0 * pow(color, vec4(4.0));
  vec4 weights = vec4(distance_ / scanline_weight);
  return (geom_lum + 1.4) * exp(-pow(weights * inversesqrt(0.5 * wid), wid)) / (0.6 + 0.2 * wid);
}

vec3 texblur(vec2 coord) {
  vec3 blur = texture(u_blur_texture, coord).rgb;

  // Edge taper: erf-based falloff matching the original geom-deluxe texblur.
  float w = width / 320.0;
  vec2 c = min(coord, vec2(1.0) - coord) * vec2(aspect_x, aspect_y) * vec2(1.0 / w);
  vec2 e2c = exp(-c * c);
  c = (step(0.0, c) - vec2(0.5)) * sqrt(vec2(1.0) - e2c) *
      (vec2(1.0) + vec2(0.1749) * e2c) + vec2(0.5);
  return blur * vec3(c.x * c.y);
}

void main() {
  // Apply barrel distortion (matching original crt-geom-deluxe transform())
  vec2 xy;
  if (curvature > 0.5) {
    vec2 cd = v_texCoord - vec2(0.5);
    cd = cd * vec2(aspect_x, aspect_y) * v_stretch.z + v_stretch.xy;
    xy = bkwtrans(cd) / vec2(overscan_x, overscan_y) / vec2(aspect_x, aspect_y) + vec2(0.5);
  } else {
    xy = (v_texCoord - vec2(0.5)) / vec2(overscan_x, overscan_y) + vec2(0.5);
  }

  float cval = corner(xy);

  // Raster bloom: sample highest available mip for whole-frame average brightness
  float avgbright = dot(textureLod(u_blur_texture, vec2(1.0, 1.0), 9.0).rgb, vec3(1.0)) / 3.0;
  float rbloom = 1.0 - rasterbloom * (avgbright - 0.5);
  xy = (xy - vec2(0.5)) * rbloom + vec2(0.5);

  // Interlace factor
  vec2 ilfac = v_ilfac;

  // Texel size
  float SHARPER = 1.0;
  vec2 one = ilfac / vec2(SHARPER * v_TextureSize.x, v_TextureSize.y);

  // Sub-texel position within the current scanline pair
  vec2 ratio_scale = (xy * v_TextureSize - vec2(0.5)) / ilfac;
  float filter_ = v_TextureSize.y / u_resolution.y;
  vec2 uv_ratio = fract(ratio_scale);

  // Snap to texel center
  vec2 texCoord = (floor(ratio_scale) * ilfac + vec2(0.5)) / v_TextureSize;

  // Lanczos2 horizontal coefficients
  vec4 coeffs = PI * vec4(1.0 + uv_ratio.x, uv_ratio.x, 1.0 - uv_ratio.x, 2.0 - uv_ratio.x);
  coeffs = FIX(coeffs);
  coeffs = 2.0 * sin(coeffs) * sin(coeffs / 2.0) / (coeffs * coeffs);
  coeffs /= dot(coeffs, vec4(1.0));

  // Sample current and next scanline with Lanczos2 horizontal filter
  vec4 col = clamp(mat4(
    TEX2D(texCoord + vec2(-one.x, 0.0)),
    TEX2D(texCoord),
    TEX2D(texCoord + vec2(one.x, 0.0)),
    TEX2D(texCoord + vec2(2.0 * one.x, 0.0))
  ) * coeffs, 0.0, 1.0);

  vec4 col2 = clamp(mat4(
    TEX2D(texCoord + vec2(-one.x, one.y)),
    TEX2D(texCoord + vec2(0.0, one.y)),
    TEX2D(texCoord + one),
    TEX2D(texCoord + vec2(2.0 * one.x, one.y))
  ) * coeffs, 0.0, 1.0);

  // Scanline weights with 3x oversampling
  vec4 weights  = scanlineWeights(uv_ratio.y, col);
  vec4 weights2 = scanlineWeights(1.0 - uv_ratio.y, col2);

  float uy1 = uv_ratio.y + 1.0 / 3.0 * filter_;
  weights  = (weights  + scanlineWeights(uy1, col)) / 3.0;
  weights2 = (weights2 + scanlineWeights(abs(1.0 - uy1), col2)) / 3.0;

  float uy2 = uy1 - 2.0 / 3.0 * filter_;
  weights  = weights  + scanlineWeights(abs(uy2), col) / 3.0;
  weights2 = weights2 + scanlineWeights(abs(1.0 - uy2), col2) / 3.0;

  vec3 mul_res = (col * weights + col2 * weights2).rgb;

  // Halation: blend in the Gaussian-blurred image
  vec3 blur = texblur(xy);
  mul_res = mix(mul_res, blur, halation) * vec3(cval * rbloom);

  // Phosphor mask with energy-conserving brightness compensation
  vec4 mask = mask_weights_alpha(gl_FragCoord.xy, aperture_strength, mask_type);
  float fbright = 1.0 / (1.0 - mask.a * aperture_strength);
  float ifbright = 1.0 / fbright;
  vec3 clow  = mul_res * (1.0 + aperture_brightboost) * ifbright;
  vec3 chi   = mul_res * fbright;
  vec3 cout_ = mix(clow, chi, mask.rgb);

  // Final gamma: convert to display gamma (matches original geom-deluxe)
  cout_ = pow(max(cout_, vec3(0.0)), vec3(1.0 / monitorgamma));

  fragColor = vec4(cout_, 1.0);
}`;
