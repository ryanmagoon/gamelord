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
const float overscan_y     = 0.98;
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
uniform sampler2D u_phosphorFeedback; // Pass 1 previous-frame output
uniform vec2 u_textureSize;
uniform int u_frameCount;

in vec2 v_texCoord;
out vec4 fragColor;

${PARAMS_GLSL}

const float gamma = 2.2;

void main() {
  vec4 screen = texture(u_texture, v_texCoord);
  vec4 phosphor = texture(u_phosphorFeedback, v_texCoord);

  vec3 cscrn = pow(screen.rgb, vec3(gamma));
  vec3 cphos = pow(phosphor.rgb, vec3(gamma));

  // Decode elapsed time from alpha + blue lower bits (matching original encoding)
  float t = 255.0 * phosphor.a + fract(phosphor.b * 255.0 / 4.0) * 1024.0;

  cphos *= vec3(phosphor_amplitude * pow(t, -phosphor_power));

  vec3 col = pow(cscrn + cphos, vec3(1.0 / gamma));

  fragColor = vec4(col, 1.0);
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

const float gamma = 2.2;
const vec3 lum = vec3(0.299, 0.587, 0.114);

void main() {
  vec4 screen = texture(u_texture, v_texCoord);
  vec4 phosphor = texture(u_feedback, v_texCoord);

  float bscrn = dot(pow(screen.rgb, vec3(gamma)), lum);
  float bphos = dot(pow(phosphor.rgb, vec3(gamma)), lum);

  // Decode elapsed time from alpha + blue lower bits (matching original encoding)
  // t starts at 1 (added here) so first-frame pow(t, -power) = pow(1, -power) = 1
  float t = 1.0 + 255.0 * phosphor.a + fract(phosphor.b * 255.0 / 4.0) * 1024.0;

  bphos = (t > 1023.0 ? 0.0 : bphos * pow(t, -phosphor_power));

  if (bscrn >= bphos) {
    // Screen is brighter: refresh with current frame, reset time to t=1
    // Clear blue's lower 2 bits, set alpha = 1/255
    fragColor = vec4(screen.r, screen.g,
      floor(screen.b * 255.0 / 4.0) * 4.0 / 255.0,
      1.0 / 255.0);
  } else {
    // Phosphor still glowing: keep old color, encode incremented time
    fragColor = vec4(phosphor.r, phosphor.g,
      (floor(phosphor.b * 255.0 / 4.0) * 4.0 + floor(t / 256.0)) / 255.0,
      fract(t / 256.0) * 256.0 / 255.0);
  }
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
out vec4 v_coeffs;

uniform vec2 u_textureSize;

${PARAMS_GLSL}

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
  // Precompute Gaussian coefficients (matching original)
  float wid = width * u_textureSize.x / (320.0 * aspect_x);
  v_coeffs = exp(vec4(1.0, 4.0, 9.0, 16.0) * vec4(-1.0 / wid / wid));
}`;

export const gaussxFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_internal1;  // Pass 0 output (phosphor-composited frame, sRGB)
uniform vec2 u_textureSize;
uniform vec2 u_originalSize;

in vec2 v_texCoord;
in vec4 v_coeffs;
out vec4 fragColor;

${PARAMS_GLSL}

const float gamma = 2.2;

// Linearize sample (matching original TEX2D in gaussx)
#define TEX2D(v) pow(texture(u_internal1, v).rgb, vec3(gamma))

void main() {
  vec3 sum = vec3(0.0);
  float onex = 1.0 / u_textureSize.x;

  sum += TEX2D(v_texCoord + vec2(-4.0 * onex, 0.0)) * vec3(v_coeffs.w);
  sum += TEX2D(v_texCoord + vec2(-3.0 * onex, 0.0)) * vec3(v_coeffs.z);
  sum += TEX2D(v_texCoord + vec2(-2.0 * onex, 0.0)) * vec3(v_coeffs.y);
  sum += TEX2D(v_texCoord + vec2(-1.0 * onex, 0.0)) * vec3(v_coeffs.x);
  sum += TEX2D(v_texCoord);
  sum += TEX2D(v_texCoord + vec2(+1.0 * onex, 0.0)) * vec3(v_coeffs.x);
  sum += TEX2D(v_texCoord + vec2(+2.0 * onex, 0.0)) * vec3(v_coeffs.y);
  sum += TEX2D(v_texCoord + vec2(+3.0 * onex, 0.0)) * vec3(v_coeffs.z);
  sum += TEX2D(v_texCoord + vec2(+4.0 * onex, 0.0)) * vec3(v_coeffs.w);

  float norm = 1.0 / (1.0 + 2.0 * (v_coeffs.x + v_coeffs.y + v_coeffs.z + v_coeffs.w));

  // Output back to sRGB (matching original)
  fragColor = vec4(pow(sum * vec3(norm), vec3(1.0 / gamma)), 1.0);
}`;

// ---------------------------------------------------------------------------
// Pass 3 — gaussy (vertical Gaussian blur)
// Completes the separable blur for halation. Output has mipmaps for raster bloom.
// ---------------------------------------------------------------------------

export const gaussyVertexShader = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
out vec4 v_coeffs;

uniform vec2 u_textureSize;

${PARAMS_GLSL}

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
  // Precompute Gaussian coefficients (matching original, uses y axis)
  float wid = width * u_textureSize.y / (320.0 * aspect_y);
  v_coeffs = exp(vec4(1.0, 4.0, 9.0, 16.0) * vec4(-1.0 / wid / wid));
}`;

export const gaussyFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;  // Pass 2 output (horizontally blurred, sRGB)
uniform vec2 u_textureSize;
uniform vec2 u_originalSize;

in vec2 v_texCoord;
in vec4 v_coeffs;
out vec4 fragColor;

${PARAMS_GLSL}

const float gamma = 2.2;

// Linearize sample (matching original TEX2D in gaussy)
#define TEX2D(v) pow(texture(u_texture, v).rgb, vec3(gamma))

void main() {
  vec3 sum = vec3(0.0);
  float oney = 1.0 / u_textureSize.y;

  sum += TEX2D(v_texCoord + vec2(0.0, -4.0 * oney)) * vec3(v_coeffs.w);
  sum += TEX2D(v_texCoord + vec2(0.0, -3.0 * oney)) * vec3(v_coeffs.z);
  sum += TEX2D(v_texCoord + vec2(0.0, -2.0 * oney)) * vec3(v_coeffs.y);
  sum += TEX2D(v_texCoord + vec2(0.0, -1.0 * oney)) * vec3(v_coeffs.x);
  sum += TEX2D(v_texCoord);
  sum += TEX2D(v_texCoord + vec2(0.0, +1.0 * oney)) * vec3(v_coeffs.x);
  sum += TEX2D(v_texCoord + vec2(0.0, +2.0 * oney)) * vec3(v_coeffs.y);
  sum += TEX2D(v_texCoord + vec2(0.0, +3.0 * oney)) * vec3(v_coeffs.z);
  sum += TEX2D(v_texCoord + vec2(0.0, +4.0 * oney)) * vec3(v_coeffs.w);

  float norm = 1.0 / (1.0 + 2.0 * (v_coeffs.x + v_coeffs.y + v_coeffs.z + v_coeffs.w));

  // Output back to sRGB (matching original)
  fragColor = vec4(pow(sum * vec3(norm), vec3(1.0 / gamma)), 1.0);
}`;

// ---------------------------------------------------------------------------
// Procedural phosphor mask function (subset of subpixel_masks.h)
// 6 layouts covering the most useful patterns.
// ---------------------------------------------------------------------------

const SUBPIXEL_MASKS_GLSL = `
// Ported from libretro/slang-shaders include/subpixel_masks.h (public domain, hunterk).
// Alpha = bright_subpixels / total_subpixels in the mask tile.
// mask_intensity: 0.0 = no mask, 1.0 = full mask. Called with 1.0 from CRT composite.
vec4 mask_weights_alpha(vec2 coord, float mask_intensity, int phosphor_layout) {
  vec3 weights = vec3(1.0);
  float alpha = 1.0;

  float on  = 1.0;
  float off = 1.0 - mask_intensity;
  vec3 red     = vec3(on,  off, off);
  vec3 green   = vec3(off, on,  off);
  vec3 blue    = vec3(off, off, on );
  vec3 magenta = vec3(on,  off, on );
  vec3 yellow  = vec3(on,  on,  off);
  vec3 cyan    = vec3(off, on,  on );
  vec3 black   = vec3(off, off, off);

  vec3 aperture_weights = mix(magenta, green, floor(mod(coord.x, 2.0)));

  if (phosphor_layout == 0) {
    // No mask
    return vec4(weights, alpha);
  } else if (phosphor_layout == 1) {
    // Classic aperture for RGB panels (aperture_1_2_bgr)
    // 2-pixel period: magenta, green. 3 bright subpixels per 6 total.
    weights = aperture_weights;
    alpha = 3.0 / 6.0;
  } else if (phosphor_layout == 2) {
    // 2x2 shadow mask for RGB panels (delta_1_2x1_bgr)
    vec3 inverse_aperture = mix(green, magenta, floor(mod(coord.x, 2.0)));
    weights = mix(aperture_weights, inverse_aperture, floor(mod(coord.y, 2.0)));
    alpha = 6.0 / 12.0;
  } else if (phosphor_layout == 3) {
    // Slot mask for RGB panels (3x4 pattern)
    int w = int(floor(mod(coord.y, 3.0)));
    int z = int(floor(mod(coord.x, 4.0)));
    // Row 0: magenta, green, black, black
    // Row 1: magenta, green, magenta, green
    // Row 2: black, black, magenta, green
    if (w == 0) {
      if (z < 2) weights = (z == 0) ? magenta : green;
      else weights = black;
    } else if (w == 1) {
      weights = (z == 0 || z == 2) ? magenta : green;
    } else {
      if (z < 2) weights = black;
      else weights = (z == 2) ? magenta : green;
    }
    alpha = 12.0 / 36.0;
  } else if (phosphor_layout == 4) {
    // Classic aperture for RBG panels
    weights = mix(yellow, blue, floor(mod(coord.x, 2.0)));
    alpha = 3.0 / 6.0;
  } else if (phosphor_layout == 5) {
    // 2x2 shadow mask for RBG panels
    vec3 inverse_aperture = mix(blue, yellow, floor(mod(coord.x, 2.0)));
    weights = mix(mix(yellow, blue, floor(mod(coord.x, 2.0))), inverse_aperture, floor(mod(coord.y, 2.0)));
    alpha = 6.0 / 12.0;
  } else if (phosphor_layout == 6) {
    // aperture_1_4_rgb
    int z = int(floor(mod(coord.x, 4.0)));
    if (z == 0) weights = red;
    else if (z == 1) weights = green;
    else if (z == 2) weights = blue;
    else weights = black;
    alpha = 3.0 / 12.0;
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

// LINEAR_PROCESSING: linearize in TEX2D, output via pow(1/monitorgamma).
// This matches the original crt-geom-deluxe which defines LINEAR_PROCESSING.
vec4 TEX2D(vec2 c) {
  vec2 underscan = step(0.0, c) * step(0.0, vec2(1.0) - c);
  vec4 col = texture(u_internal1, c) * vec4(underscan.x * underscan.y);
  return pow(col, vec4(CRTgamma));
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
  return clamp((max(cdist.x, 1e-3) - dist_) * cornersmooth, 0.0, 1.0);
}

vec4 scanlineWeights(float distance_, vec4 color) {
  vec4 wid = 2.0 + 2.0 * pow(color, vec4(4.0));
  vec4 weights = vec4(distance_ / scanline_weight);
  return (geom_lum + 1.4) * exp(-pow(weights * inversesqrt(0.5 * wid), wid)) / (0.6 + 0.2 * wid);
}

vec3 texblur(vec2 coord) {
  vec3 blur = pow(texture(u_blur_texture, coord).rgb, vec3(CRTgamma));

  float w = width / 320.0;
  vec2 c = min(coord, vec2(1.0) - coord) * vec2(aspect_x, aspect_y) * vec2(1.0 / w);
  vec2 e2c = exp(-c * c);
  c = (step(0.0, c) - vec2(0.5)) * sqrt(vec2(1.0) - e2c) *
      (vec2(1.0) + vec2(0.1749) * e2c) + vec2(0.5);
  return blur * vec3(c.x * c.y);
}

void main() {
  // Apply barrel distortion (matching original transform())
  vec2 xy;
  if (curvature > 0.5) {
    vec2 cd = v_texCoord - vec2(0.5);
    cd = cd * vec2(aspect_x, aspect_y) * v_stretch.z + v_stretch.xy;
    xy = bkwtrans(cd) / vec2(overscan_x, overscan_y) / vec2(aspect_x, aspect_y) + vec2(0.5);
  } else {
    xy = (v_texCoord - vec2(0.5)) / vec2(overscan_x, overscan_y) + vec2(0.5);
  }

  float cval = corner(xy);

  // Raster bloom: average brightness from highest mip level
  float avgbright = dot(textureLod(u_blur_texture, vec2(1.0, 1.0), 9.0).rgb, vec3(1.0)) / 3.0;
  float rbloom = 1.0 - rasterbloom * (avgbright - 0.5);
  xy = (xy - vec2(0.5)) * rbloom + vec2(0.5);

  // Save xy after rbloom for halation lookup (before Lanczos snapping)
  vec2 xy0 = xy;

  // Interlace factor
  vec2 ilfac = v_ilfac;

  // Sub-texel position
  vec2 ratio_scale = (xy * v_TextureSize - vec2(0.5)) / ilfac;

  // OVERSAMPLE: use fwidth for oversample filter (matches original)
  float oversample_filter = fwidth(ratio_scale.y);

  vec2 uv_ratio = fract(ratio_scale);

  // Snap to texel center
  xy = (floor(ratio_scale) * ilfac + vec2(0.5)) / v_TextureSize;

  // Lanczos2 horizontal coefficients
  vec4 coeffs = PI * vec4(1.0 + uv_ratio.x, uv_ratio.x, 1.0 - uv_ratio.x, 2.0 - uv_ratio.x);
  coeffs = FIX(coeffs);
  coeffs = 2.0 * sin(coeffs) * sin(coeffs / 2.0) / (coeffs * coeffs);
  coeffs /= dot(coeffs, vec4(1.0));

  // Sample current and next scanline with Lanczos2 horizontal filter
  vec4 col = clamp(
    TEX2D(xy + vec2(-v_one.x, 0.0)) * coeffs.x +
    TEX2D(xy) * coeffs.y +
    TEX2D(xy + vec2(v_one.x, 0.0)) * coeffs.z +
    TEX2D(xy + vec2(2.0 * v_one.x, 0.0)) * coeffs.w,
    0.0, 1.0);

  vec4 col2 = clamp(
    TEX2D(xy + vec2(-v_one.x, v_one.y)) * coeffs.x +
    TEX2D(xy + vec2(0.0, v_one.y)) * coeffs.y +
    TEX2D(xy + v_one) * coeffs.z +
    TEX2D(xy + vec2(2.0 * v_one.x, v_one.y)) * coeffs.w,
    0.0, 1.0);

  // Scanline weights
  vec4 weights  = scanlineWeights(uv_ratio.y, col);
  vec4 weights2 = scanlineWeights(1.0 - uv_ratio.y, col2);

  // OVERSAMPLE: 3x oversampling of beam profile (matches original)
  uv_ratio.y = uv_ratio.y + 1.0 / 3.0 * oversample_filter;
  weights  = (weights  + scanlineWeights(uv_ratio.y, col)) / 3.0;
  weights2 = (weights2 + scanlineWeights(abs(1.0 - uv_ratio.y), col2)) / 3.0;
  uv_ratio.y = uv_ratio.y - 2.0 / 3.0 * oversample_filter;
  weights  = weights  + scanlineWeights(abs(uv_ratio.y), col) / 3.0;
  weights2 = weights2 + scanlineWeights(abs(1.0 - uv_ratio.y), col2) / 3.0;

  vec3 mul_res = (col * weights + col2 * weights2).rgb;

  // Halation and corners — applied TWICE matching the original exactly:
  // First pass: halation mix with corner masking (no rbloom)
  vec3 blur = texblur(xy0);
  mul_res = mix(mul_res, blur, halation) * vec3(cval);
  // Second pass: halation mix again with corner * rbloom brightness reduction
  mul_res = mix(mul_res, blur, halation) * vec3(cval * rbloom);

  // Shadow mask — use subpixel mask with intensity 1.0 (matching original)
  // Original: mask_weights_alpha(v_texCoord.xy * OutputSize.xy, 1., mask_picker, alpha)
  vec4 mask = mask_weights_alpha(v_texCoord * u_resolution, 1.0, mask_type);

  // Energy-conserving mask brightness compensation (matching original exactly)
  // u_tex_size1 in original = OutputSize / SourceSize (output pixels per source texel)
  vec2 u_tex_size1 = u_resolution / v_TextureSize;
  float nbright = 255.0 - 255.0 * mask.a;
  float fbright = nbright / (u_tex_size1.x * u_tex_size1.y);
  float aperture_average = mix(1.0 - aperture_strength * (1.0 - aperture_brightboost), 1.0, fbright);
  vec3 clow = vec3(1.0 - aperture_strength) * mul_res + vec3(aperture_strength * aperture_brightboost) * mul_res * mul_res;
  float ifbright = 1.0 / fbright;
  vec3 chi = vec3(ifbright * aperture_average) * mul_res - vec3(ifbright - 1.0) * clow;
  vec3 cout = mix(clow, chi, mask.rgb);

  // Convert to display gamma (matching original: pow(1/monitorgamma))
  cout = pow(cout, vec3(1.0 / monitorgamma));

  fragColor = vec4(cout, col.a);
}`;
