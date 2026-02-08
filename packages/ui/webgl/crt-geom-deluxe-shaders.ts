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
  // Stay in sRGB throughout — pass 4 handles the gamma pipeline
  vec3 current = texture(u_texture, v_texCoord).rgb;

  vec4 phosphorData = texture(u_phosphorFeedback, v_texCoord);
  vec3 phosphorColor = max(phosphorData.rgb, vec3(0.0));

  // Decode elapsed time from alpha channel
  float timeEncoded = phosphorData.a * 255.0;
  float t = max(timeEncoded, 1.0);

  // Exponential phosphor decay: amplitude * t^(-power)
  float decay = phosphor_amplitude * pow(t, -phosphor_power);
  vec3 decayed = phosphorColor * decay;

  // Composite: add decayed phosphor glow to current frame
  vec3 result = current + decayed;

  fragColor = vec4(result, 1.0);
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
  vec3 current = texture(u_texture, v_texCoord).rgb;
  vec4 prev = texture(u_feedback, v_texCoord);

  float currentLum = dot(current, vec3(0.2126, 0.7152, 0.0722));
  float prevLum = dot(prev.rgb, vec3(0.2126, 0.7152, 0.0722));

  // Decode elapsed time from alpha channel
  float prevTime = prev.a * 255.0;

  // If current pixel is brighter, stamp new phosphor (reset timer)
  // Otherwise let old phosphor continue decaying (increment timer)
  if (currentLum >= prevLum * 0.95) {
    // New content — reset phosphor with time = 1
    fragColor = vec4(current, 1.0 / 255.0);
  } else {
    // Continue decay — increment time, keep previous color
    float newTime = min(prevTime + 1.0, 255.0);
    fragColor = vec4(prev.rgb, newTime / 255.0);
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
vec3 mask_weights(vec2 coord, float maskIntensity, int layout_type) {
  vec3 weights = vec3(1.0);
  float on  = 1.0;
  float off = 1.0 - maskIntensity;

  vec2 xy = coord * vec2(1.0); // fragment coord in output pixels
  int ix = int(mod(xy.x, 6.0));
  int iy = int(mod(xy.y, 4.0));

  if (layout_type == 0) {
    // No mask
    weights = vec3(1.0);
  } else if (layout_type == 1) {
    // Classic aperture grille (RGB vertical stripes, 3-pixel period)
    int col = int(mod(xy.x, 3.0));
    if (col == 0) weights = vec3(on, off, off);
    else if (col == 1) weights = vec3(off, on, off);
    else weights = vec3(off, off, on);
  } else if (layout_type == 2) {
    // 2x2 shadow mask (checkerboard-ish RGB)
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
  } else if (layout_type == 3) {
    // Slot mask (3x4 pattern with gaps)
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
  } else if (layout_type == 4) {
    // Fine aperture grille (1-pixel subpixels, 4-pixel period)
    int col = int(mod(xy.x, 4.0));
    if (col == 0) weights = vec3(on, off, off);
    else if (col == 1) weights = vec3(off, on, off);
    else if (col == 2) weights = vec3(off, off, on);
    else weights = vec3(off, off, off);
  } else if (layout_type == 5) {
    // BGR aperture grille (reversed subpixel order)
    int col = int(mod(xy.x, 3.0));
    if (col == 0) weights = vec3(off, off, on);
    else if (col == 1) weights = vec3(off, on, off);
    else weights = vec3(on, off, off);
  }

  return weights;
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
#define TEX2D(c) pow(texture(u_internal1, (c)), vec4(CRTgamma))

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
  // Sample blur texture with edge taper
  vec3 blur = pow(texture(u_blur_texture, coord).rgb, vec3(CRTgamma));

  // Edge taper using erf approximation for smooth border falloff
  vec2 borderCoord = coord * 2.0 - 1.0; // [-1, 1]
  float edgeFade = (1.0 - smoothstep(0.85, 1.0, abs(borderCoord.x))) *
                   (1.0 - smoothstep(0.85, 1.0, abs(borderCoord.y)));
  return blur * edgeFade;
}

void main() {
  // Apply barrel distortion
  vec2 xy;
  if (curvature > 0.5) {
    float screenRatio = u_resolution.y / u_resolution.x;
    vec2 cd = v_texCoord - 0.5;
    cd *= vec2(1.0, screenRatio);
    xy = bkwtrans(cd * vec2(v_stretch.z, v_stretch.z) + v_stretch.xy);
    xy /= vec2(aspect_x, aspect_y);
    xy = xy + 0.5;
  } else {
    xy = v_texCoord;
  }

  float cval = corner(xy);

  // Raster bloom: modulate raster size by average brightness
  float avgbright = dot(textureLod(u_blur_texture, vec2(0.5, 0.5), 9.0).rgb, vec3(1.0)) / 3.0;
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

  // Phosphor mask
  vec3 mask = mask_weights(gl_FragCoord.xy, aperture_strength, mask_type);

  // Energy-conserving mask application (matches libretro crt-geom-deluxe)
  float fbright = dot(mul_res, vec3(0.2126, 0.7152, 0.0722));
  float ifbright = 1.0 / max(fbright, 0.001);
  float aperture_average = mix(1.0 - aperture_strength * (1.0 - aperture_brightboost), 1.0, fbright);
  vec3 clow = vec3(1.0 - aperture_strength) * mul_res + vec3(aperture_strength * aperture_brightboost) * mul_res * mul_res;
  vec3 chi = vec3(ifbright * aperture_average) * mul_res - vec3(ifbright - 1.0) * clow;
  vec3 cout = mix(clow, chi, mask);

  // Convert from linear (CRTgamma) space to display gamma
  fragColor = vec4(pow(max(cout, vec3(0.0)), vec3(1.0 / monitorgamma)), 1.0);
}`;
