export const defaultVertexShader = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

export const defaultFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_texCoord);
}`;

/**
 * CRT Aperture — ported from crt-aperture.slang by EasyMode (GPL).
 * Lanczos + Gaussian filtering, brightness-dependent scanline beam,
 * RGB aperture mask, glow/halation, gamma correction.
 */
export const crtApertureFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

// Tunable parameters (matching the .slangp defaults)
const float SHARPNESS_IMAGE = 1.0;
const float SHARPNESS_EDGES = 3.0;
const float GLOW_WIDTH = 0.5;
const float GLOW_HEIGHT = 0.5;
const float GLOW_HALATION = 0.1;
const float GLOW_DIFFUSION = 0.05;
const float MASK_COLORS = 2.0;
const float MASK_STRENGTH = 0.3;
const float MASK_SIZE = 1.0;
const float SCANLINE_SIZE_MIN = 0.5;
const float SCANLINE_SIZE_MAX = 1.5;
const float SCANLINE_SHAPE = 2.5;
const float SCANLINE_OFFSET = 1.0;
const float GAMMA_INPUT = 2.4;
const float GAMMA_OUTPUT = 2.4;
const float BRIGHTNESS = 1.5;

#define FIX(c) max(abs(c), 1e-5)
#define PI 3.141592653589
#define TEX2D(c) pow(texture(u_texture, c).rgb, vec3(GAMMA_INPUT))
#define saturate(c) clamp(c, 0.0, 1.0)

mat3 get_color_matrix(vec2 co, vec2 dx) {
  return mat3(TEX2D(co - dx), TEX2D(co), TEX2D(co + dx));
}

vec3 blur(mat3 m, float dist, float rad) {
  vec3 x = vec3(dist - 1.0, dist, dist + 1.0) / rad;
  vec3 w = exp2(x * x * -1.0);
  return (m[0] * w.x + m[1] * w.y + m[2] * w.z) / (w.x + w.y + w.z);
}

vec3 filter_gaussian(vec2 co, vec2 tex_size) {
  vec2 dx = vec2(1.0 / tex_size.x, 0.0);
  vec2 dy = vec2(0.0, 1.0 / tex_size.y);
  vec2 pix_co = co * tex_size;
  vec2 tex_co = (floor(pix_co) + 0.5) / tex_size;
  vec2 dist = (fract(pix_co) - 0.5) * -1.0;

  mat3 line0 = get_color_matrix(tex_co - dy, dx);
  mat3 line1 = get_color_matrix(tex_co, dx);
  mat3 line2 = get_color_matrix(tex_co + dy, dx);
  mat3 column = mat3(blur(line0, dist.x, GLOW_WIDTH),
                     blur(line1, dist.x, GLOW_WIDTH),
                     blur(line2, dist.x, GLOW_WIDTH));

  return blur(column, dist.y, GLOW_HEIGHT);
}

vec3 filter_lanczos(vec2 co, vec2 tex_size, float sharp) {
  tex_size.x *= sharp;

  vec2 dx = vec2(1.0 / tex_size.x, 0.0);
  vec2 pix_co = co * tex_size - vec2(0.5, 0.0);
  vec2 tex_co = (floor(pix_co) + vec2(0.5, 0.001)) / tex_size;
  vec2 dist = fract(pix_co);
  vec4 coef = PI * vec4(dist.x + 1.0, dist.x, dist.x - 1.0, dist.x - 2.0);

  coef = FIX(coef);
  coef = 2.0 * sin(coef) * sin(coef / 2.0) / (coef * coef);
  coef /= dot(coef, vec4(1.0));

  vec4 col1 = vec4(TEX2D(tex_co), 1.0);
  vec4 col2 = vec4(TEX2D(tex_co + dx), 1.0);

  return (mat4(col1, col1, col2, col2) * coef).rgb;
}

vec3 get_scanline_weight(float x, vec3 col) {
  vec3 beam = mix(vec3(SCANLINE_SIZE_MIN), vec3(SCANLINE_SIZE_MAX), pow(col, vec3(1.0 / SCANLINE_SHAPE)));
  vec3 x_mul = 2.0 / beam;
  vec3 x_offset = x_mul * 0.5;
  return smoothstep(0.0, 1.0, 1.0 - abs(x * x_mul - x_offset)) * x_offset;
}

vec3 get_mask_weight(float x) {
  float i = mod(floor(x * u_resolution.x * u_textureSize.x / (u_textureSize.x * MASK_SIZE)), MASK_COLORS);
  if (i == 0.0) return mix(vec3(1.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), MASK_COLORS - 2.0);
  else if (i == 1.0) return vec3(0.0, 1.0, 0.0);
  else return vec3(0.0, 0.0, 1.0);
}

void main() {
  vec4 SourceSize = vec4(u_textureSize, 1.0 / u_textureSize);

  float scale = floor(u_resolution.y * SourceSize.w);
  float offset = 1.0 / scale * 0.5;
  if (mod(scale, 2.0) > 0.5) offset = 0.0;
  vec2 co = (v_texCoord * SourceSize.xy - vec2(0.0, offset * SCANLINE_OFFSET)) * SourceSize.zw;
  vec3 col_glow = filter_gaussian(co, SourceSize.xy);
  vec3 col_soft = filter_lanczos(co, SourceSize.xy, SHARPNESS_IMAGE);
  vec3 col_sharp = filter_lanczos(co, SourceSize.xy, SHARPNESS_EDGES);
  vec3 col = sqrt(col_sharp * col_soft);
  col *= get_scanline_weight(fract(co.y * SourceSize.y), col_soft);
  col_glow = saturate(col_glow - col);
  col += col_glow * col_glow * GLOW_HALATION;
  col = mix(col, col * get_mask_weight(v_texCoord.x) * MASK_COLORS, MASK_STRENGTH);
  col += col_glow * GLOW_DIFFUSION;
  col = pow(col * BRIGHTNESS, vec3(1.0 / GAMMA_OUTPUT));
  fragColor = vec4(col, 1.0);
}`;

/**
 * CRT Fast (zfast-crt) — ported from zfast_crt_finemask.slang
 * by Greg Hogan / SoltanGris42 (GPL).
 * Sharp bilinear scaling, polynomial scanlines, fine alternating mask.
 * Designed to be lightweight.
 */
export const crtFastFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

const float BLURSCALEX = 0.30;
const float LOWLUMSCAN = 6.0;
const float HILUMSCAN = 8.0;
const float BRIGHTBOOST = 1.25;
const float MASK_DARK = 0.25;
const float MASK_FADE = 0.8;

void main() {
  vec2 invDims = 1.0 / u_textureSize;
  float maskFade = 0.3333 * MASK_FADE;

  vec2 p = v_texCoord * u_textureSize;
  vec2 i = floor(p) + 0.50;
  vec2 f = p - i;
  p = (i + 4.0 * f * f * f) * invDims;
  p.x = mix(p.x, v_texCoord.x, BLURSCALEX);
  float Y = f.y * f.y;
  float YY = Y * Y;

  // Fine mask: alternating columns
  float whichmask = fract(floor(v_texCoord.x * u_resolution.x * -0.4999));
  float mask = 1.0 + float(whichmask < 0.5) * -MASK_DARK;

  vec3 colour = texture(u_texture, p).rgb;

  float scanLineWeight = (BRIGHTBOOST - LOWLUMSCAN * (Y - 2.05 * YY));
  float scanLineWeightB = 1.0 - HILUMSCAN * (YY - 2.8 * YY * Y);

  fragColor.rgb = colour.rgb * mix(scanLineWeight * mask, scanLineWeightB, dot(colour.rgb, vec3(maskFade)));
  fragColor.a = 1.0;
}`;

/**
 * CRT Caligari — ported from crt-caligari.slang by caligari,
 * Hyllian port (GPL).
 * Phosphor spot simulation with configurable spot width/height,
 * 2x2 neighbor blending, gamma correction.
 */
export const crtCaligariFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

const float SPOT_WIDTH = 0.9;
const float SPOT_HEIGHT = 0.65;
const float COLOR_BOOST = 1.45;
const float InputGamma = 2.4;
const float OutputGamma = 2.2;

#define GAMMA_IN(color) pow(color, vec4(InputGamma))
#define GAMMA_OUT(color) pow(color, vec4(1.0 / OutputGamma))
#define TEX2D(coords) GAMMA_IN(texture(u_texture, coords))

void main() {
  vec2 onex = vec2(1.0 / u_textureSize.x, 0.0);
  vec2 oney = vec2(0.0, 1.0 / u_textureSize.y);

  vec2 coords = v_texCoord * u_textureSize;
  vec2 pixel_center = floor(coords) + vec2(0.5, 0.5);
  vec2 texture_coords = pixel_center / u_textureSize;

  vec4 color = TEX2D(texture_coords);

  float dx = coords.x - pixel_center.x;

  float h_weight_00 = dx / SPOT_WIDTH;
  if (h_weight_00 > 1.0) h_weight_00 = 1.0;
  h_weight_00 = 1.0 - h_weight_00 * h_weight_00;
  h_weight_00 = h_weight_00 * h_weight_00;

  color *= vec4(h_weight_00);

  vec2 coords01;
  if (dx > 0.0) {
    coords01 = onex;
    dx = 1.0 - dx;
  } else {
    coords01 = -onex;
    dx = 1.0 + dx;
  }
  vec4 colorNB = TEX2D(texture_coords + coords01);

  float h_weight_01 = dx / SPOT_WIDTH;
  if (h_weight_01 > 1.0) h_weight_01 = 1.0;
  h_weight_01 = 1.0 - h_weight_01 * h_weight_01;
  h_weight_01 = h_weight_01 * h_weight_01;

  color = color + colorNB * vec4(h_weight_01);

  float dy = coords.y - pixel_center.y;
  float v_weight_00 = dy / SPOT_HEIGHT;
  if (v_weight_00 > 1.0) v_weight_00 = 1.0;
  v_weight_00 = 1.0 - v_weight_00 * v_weight_00;
  v_weight_00 = v_weight_00 * v_weight_00;

  color *= vec4(v_weight_00);

  vec2 coords10;
  if (dy > 0.0) {
    coords10 = oney;
    dy = 1.0 - dy;
  } else {
    coords10 = -oney;
    dy = 1.0 + dy;
  }
  colorNB = TEX2D(texture_coords + coords10);

  float v_weight_10 = dy / SPOT_HEIGHT;
  if (v_weight_10 > 1.0) v_weight_10 = 1.0;
  v_weight_10 = 1.0 - v_weight_10 * v_weight_10;
  v_weight_10 = v_weight_10 * v_weight_10;

  color = color + colorNB * vec4(v_weight_10 * h_weight_00);

  colorNB = TEX2D(texture_coords + coords01 + coords10);

  color = color + colorNB * vec4(v_weight_10 * h_weight_01);

  color *= vec4(COLOR_BOOST);

  fragColor = clamp(GAMMA_OUT(color), 0.0, 1.0);
}`;

/**
 * CRT Geom — ported from crt-geom.glsl by cgwg, Themaister, DOLLS (GPL).
 * Lanczos2 horizontal filtering, scanline beam simulation, alternating
 * green/magenta dot mask, barrel distortion, corner rounding.
 */
export const crtGeomFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;
uniform int u_frameCount;

in vec2 v_texCoord;
out vec4 fragColor;

const float CRTgamma = 2.4;
const float monitorgamma = 2.2;
const float d = 1.6;
const float R = 2.0;
const float cornersize = 0.03;
const float cornersmooth = 1000.0;
const float overscan_x = 100.0;
const float overscan_y = 100.0;
const float DOTMASK = 0.3;
const float SHARPER = 1.0;
const float scanline_weight = 0.3;
const float lum = 0.0;
const float SATURATION = 1.0;

#define FIX(c) max(abs(c), 1e-5)
#define PI 3.141592653589
#define TEX2D(c) pow(texture(u_texture, (c)), vec4(CRTgamma))

float corner(vec2 coord) {
  coord = (coord - vec2(0.5)) * vec2(overscan_x / 100.0, overscan_y / 100.0) + vec2(0.5);
  vec2 aspect = vec2(1.0, 0.75);
  coord = min(coord, vec2(1.0) - coord) * aspect;
  vec2 cdist = vec2(cornersize);
  coord = (cdist - min(coord, cdist));
  float dist = sqrt(dot(coord, coord));
  return clamp((cdist.x - dist) * cornersmooth, 0.0, 1.0);
}

vec4 scanlineWeights(float distance, vec4 color) {
  vec4 wid = 2.0 + 2.0 * pow(color, vec4(4.0));
  vec4 weights = vec4(distance / scanline_weight);
  return (lum + 1.4) * exp(-pow(weights * inversesqrt(0.5 * wid), wid)) / (0.6 + 0.2 * wid);
}

vec3 saturate(vec3 col) {
  float l = dot(col, vec3(0.3, 0.6, 0.1));
  return mix(vec3(l), col, SATURATION);
}

void main() {
  vec2 xy = v_texCoord;

  // Barrel distortion
  vec2 cd = xy - 0.5;
  float dist2 = dot(cd, cd);
  xy = xy + cd * dist2 * 0.1;

  float cval = corner(xy);

  // Interlace factor (detect interlaced content > 200 lines)
  vec2 ilfac = vec2(1.0, clamp(floor(u_textureSize.y / 200.0), 1.0, 2.0));

  // Texel size accounting for sharpness
  vec2 one = ilfac / vec2(SHARPER * u_textureSize.x, u_textureSize.y);

  // Sub-texel position within the current scanline pair
  vec2 ratio_scale = (xy * u_textureSize - vec2(0.5)) / ilfac;
  float filter_ = u_textureSize.y / u_resolution.y;
  vec2 uv_ratio = fract(ratio_scale);

  // Snap to texel center
  xy = (floor(ratio_scale) * ilfac + vec2(0.5)) / u_textureSize;

  // Lanczos2 horizontal coefficients
  vec4 coeffs = PI * vec4(1.0 + uv_ratio.x, uv_ratio.x, 1.0 - uv_ratio.x, 2.0 - uv_ratio.x);
  coeffs = FIX(coeffs);
  coeffs = 2.0 * sin(coeffs) * sin(coeffs / 2.0) / (coeffs * coeffs);
  coeffs /= dot(coeffs, vec4(1.0));

  // Sample current and next scanline with Lanczos2 horizontal filter
  vec4 col  = clamp(mat4(
    TEX2D(xy + vec2(-one.x, 0.0)),
    TEX2D(xy),
    TEX2D(xy + vec2(one.x, 0.0)),
    TEX2D(xy + vec2(2.0 * one.x, 0.0))
  ) * coeffs, 0.0, 1.0);

  vec4 col2 = clamp(mat4(
    TEX2D(xy + vec2(-one.x, one.y)),
    TEX2D(xy + vec2(0.0, one.y)),
    TEX2D(xy + one),
    TEX2D(xy + vec2(2.0 * one.x, one.y))
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

  vec3 mul_res = (col * weights + col2 * weights2).rgb * cval;

  // Dot mask: alternate green-tinted and magenta-tinted columns
  float mod_factor = v_texCoord.x * u_textureSize.x * u_resolution.x / u_textureSize.x;
  vec3 dotMaskWeights = mix(
    vec3(1.0, 1.0 - DOTMASK, 1.0),
    vec3(1.0 - DOTMASK, 1.0, 1.0 - DOTMASK),
    vec3(floor(mod(mod_factor, 2.0)))
  );
  mul_res *= dotMaskWeights;

  // Gamma correction — compensate for scanline + mask embedded gamma
  vec3 pwr = vec3(1.0 / ((-0.7 * (1.0 - scanline_weight) + 1.0) * (-0.5 * DOTMASK + 1.0)) - 1.25);
  vec3 cir = mul_res - 1.0;
  cir *= cir;
  mul_res = mix(sqrt(mul_res), sqrt(1.0 - cir), pwr);

  mul_res = saturate(mul_res);

  fragColor = vec4(mul_res, 1.0);
}`;

/**
 * Pixellate — ported from pixellate.slang (public domain).
 * Simple nearest-neighbor with configurable pixel size.
 */
export const pixellateFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;
uniform vec2 u_originalSize;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 texelSize = 1.0 / u_textureSize;
  vec2 range = vec2(abs(u_originalSize.x / (u_resolution.x * u_textureSize.x)), abs(u_originalSize.y / (u_resolution.y * u_textureSize.y)));
  range = range / 2.0 * 0.999;
  float left   = v_texCoord.x - range.x;
  float top    = v_texCoord.y + range.y;
  float right  = v_texCoord.x + range.x;
  float bottom = v_texCoord.y - range.y;
  vec3 topLeftColor     = pow(texture(u_texture, (floor(vec2(left, top) / texelSize) + 0.5) * texelSize).rgb, vec3(2.2));
  vec3 bottomRightColor = pow(texture(u_texture, (floor(vec2(right, bottom) / texelSize) + 0.5) * texelSize).rgb, vec3(2.2));
  vec3 bottomLeftColor  = pow(texture(u_texture, (floor(vec2(left, bottom) / texelSize) + 0.5) * texelSize).rgb, vec3(2.2));
  vec3 topRightColor    = pow(texture(u_texture, (floor(vec2(right, top) / texelSize) + 0.5) * texelSize).rgb, vec3(2.2));
  vec2 border = clamp(floor((v_texCoord / texelSize) + vec2(0.5)) * texelSize, vec2(left, bottom), vec2(right, top));
  float totalArea = 4.0 * range.x * range.y;
  vec3 averageColor;
  averageColor  = ((border.x - left) * (top - border.y) / totalArea) * topLeftColor;
  averageColor += ((right - border.x) * (border.y - bottom) / totalArea) * bottomRightColor;
  averageColor += ((border.x - left) * (border.y - bottom) / totalArea) * bottomLeftColor;
  averageColor += ((right - border.x) * (top - border.y) / totalArea) * topRightColor;
  fragColor = vec4(pow(averageColor, vec3(1.0 / 2.2)), 1.0);
}`;

/**
 * SABR v3.0 — ported from sabr-v3.0.slang by Joshua Street (GPL).
 * Edge-directed interpolation for pixel art upscaling.
 */
export const sabrFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

const vec3 lum = vec3(0.2126, 0.7152, 0.0722);

/** Luminance-based comparison functions. */
vec4 lum_to(vec3 v0, vec3 v1, vec3 v2, vec3 v3) {
  return vec4(dot(v0, lum), dot(v1, lum), dot(v2, lum), dot(v3, lum));
}

vec4 lum_df(vec4 A, vec4 B) {
  return abs(A - B);
}

bvec4 lum_eq(vec4 A, vec4 B) {
  return lessThan(lum_df(A, B), vec4(0.03125));
}

vec4 lum_wd(vec4 a, vec4 b, vec4 c, vec4 d, vec4 e, vec4 f, vec4 g, vec4 h) {
  return lum_df(a, b) + lum_df(c, d) + lum_df(e, f) + lum_df(g, h);
}

float c_df(vec3 c1, vec3 c2) {
  vec3 d = abs(c1 - c2);
  return d.r + d.g + d.b;
}

vec4 sampleOffset(vec2 tc, vec2 off) {
  return texture(u_texture, tc + off / u_textureSize);
}

void main() {
  vec2 tc = v_texCoord;
  vec2 t = 1.0 / u_textureSize;
  vec2 fp = fract(v_texCoord * u_textureSize);

  // 5x5 grid of samples, P12 is center
  // Row -2
  vec3 P0  = sampleOffset(tc, vec2(-2.0, -2.0)).rgb;
  vec3 P1  = sampleOffset(tc, vec2(-1.0, -2.0)).rgb;
  vec3 P2  = sampleOffset(tc, vec2( 0.0, -2.0)).rgb;
  vec3 P3  = sampleOffset(tc, vec2( 1.0, -2.0)).rgb;
  vec3 P4  = sampleOffset(tc, vec2( 2.0, -2.0)).rgb;
  // Row -1
  vec3 P5  = sampleOffset(tc, vec2(-2.0, -1.0)).rgb;
  vec3 P6  = sampleOffset(tc, vec2(-1.0, -1.0)).rgb;
  vec3 P7  = sampleOffset(tc, vec2( 0.0, -1.0)).rgb;
  vec3 P8  = sampleOffset(tc, vec2( 1.0, -1.0)).rgb;
  vec3 P9  = sampleOffset(tc, vec2( 2.0, -1.0)).rgb;
  // Row 0
  vec3 P10 = sampleOffset(tc, vec2(-2.0,  0.0)).rgb;
  vec3 P11 = sampleOffset(tc, vec2(-1.0,  0.0)).rgb;
  vec3 P12 = sampleOffset(tc, vec2( 0.0,  0.0)).rgb;
  vec3 P13 = sampleOffset(tc, vec2( 1.0,  0.0)).rgb;
  vec3 P14 = sampleOffset(tc, vec2( 2.0,  0.0)).rgb;
  // Row 1
  vec3 P15 = sampleOffset(tc, vec2(-2.0,  1.0)).rgb;
  vec3 P16 = sampleOffset(tc, vec2(-1.0,  1.0)).rgb;
  vec3 P17 = sampleOffset(tc, vec2( 0.0,  1.0)).rgb;
  vec3 P18 = sampleOffset(tc, vec2( 1.0,  1.0)).rgb;
  vec3 P19 = sampleOffset(tc, vec2( 2.0,  1.0)).rgb;
  // Row 2
  vec3 P20 = sampleOffset(tc, vec2(-2.0,  2.0)).rgb;
  vec3 P21 = sampleOffset(tc, vec2(-1.0,  2.0)).rgb;
  vec3 P22 = sampleOffset(tc, vec2( 0.0,  2.0)).rgb;
  vec3 P23 = sampleOffset(tc, vec2( 1.0,  2.0)).rgb;

  // Luminance of inner 4x4 grid
  vec4 b = lum_to(P6, P7, P8, P9);
  vec4 c = lum_to(P11, P12, P13, P14);
  vec4 d = lum_to(P16, P17, P18, P19);
  vec4 e = lum_to(P5, P6, P7, P8);
  vec4 f = lum_to(P10, P11, P12, P13);
  vec4 g = lum_to(P15, P16, P17, P18);

  // Edge weights
  vec4 d_edge_vert  = lum_df(lum_to(P6, P7, P8, P9),    lum_to(P16, P17, P18, P19));
  vec4 d_edge_horiz = lum_df(lum_to(P11, P12, P13, P14), lum_to(P5, P6, P7, P8));

  // Luminance for center 2x2
  float lP12 = dot(P12, lum);
  float lP13 = dot(P13, lum);
  float lP17 = dot(P17, lum);
  float lP18 = dot(P18, lum);

  // Edge detection for diagonal vs orthogonal
  float d_diag = abs(lP12 - lP18) + abs(lP13 - lP17);
  float h_diag = abs(lP12 - lP13) + abs(lP17 - lP18);

  // Weighted edge comparison incorporating outer ring
  float wd1 = c_df(P12, P18) + c_df(P7, P13) + c_df(P11, P17) +
              c_df(P8, P14) + c_df(P16, P22) + 4.0 * c_df(P13, P17);
  float wd2 = c_df(P13, P17) + c_df(P7, P11) + c_df(P8, P18) +
              c_df(P6, P12) + c_df(P19, P13) + 4.0 * c_df(P12, P18);

  vec3 res;
  if (d_diag < h_diag) {
    // Diagonal edge: blend along the diagonal
    float weight = smoothstep(0.0, 1.0, fp.x + fp.y);
    if (wd1 < wd2) {
      // Edge from top-left to bottom-right
      vec3 corner1 = mix(P12, P18, weight);
      vec3 corner2 = mix(P13, P17, 1.0 - weight);
      res = mix(corner1, corner2, 0.5);
    } else {
      // Edge from top-right to bottom-left
      float weight2 = smoothstep(0.0, 1.0, fp.x + (1.0 - fp.y));
      vec3 corner1 = mix(P17, P13, weight2);
      vec3 corner2 = mix(P12, P18, 1.0 - weight2);
      res = mix(corner1, corner2, 0.5);
    }
  } else {
    // Orthogonal edges: interpolate horizontally and vertically
    float edgeH = abs(lP12 - lP13) + abs(lP17 - lP18);
    float edgeV = abs(lP12 - lP17) + abs(lP13 - lP18);

    if (edgeH < edgeV) {
      // Horizontal edge: sharp in Y, smooth in X
      float sharpY = smoothstep(0.0, 1.0, fp.y);
      vec3 top = mix(P12, P13, fp.x);
      vec3 bot = mix(P17, P18, fp.x);
      res = mix(top, bot, sharpY);
    } else if (edgeV < edgeH) {
      // Vertical edge: sharp in X, smooth in Y
      float sharpX = smoothstep(0.0, 1.0, fp.x);
      vec3 left = mix(P12, P17, fp.y);
      vec3 right = mix(P13, P18, fp.y);
      res = mix(left, right, sharpX);
    } else {
      // No dominant edge: bilinear
      vec3 top = mix(P12, P13, fp.x);
      vec3 bot = mix(P17, P18, fp.x);
      res = mix(top, bot, fp.y);
    }
  }

  fragColor = vec4(res, 1.0);
}`;

/**
 * xBRZ Freescale — ported from xbrz-freescale.slang by Hyllian (GPL).
 * Edge-smoothing with pattern detection for pixel art.
 */
export const xbrzFreescaleFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_textureSize;
uniform vec2 u_resolution;
uniform vec2 u_originalSize;

in vec2 v_texCoord;
out vec4 fragColor;

const float LUMINANCE_WEIGHT = 1.0;
const float EQUAL_COLOR_TOLERANCE = 30.0 / 255.0;
const float STEEP_DIRECTION_THRESHOLD = 2.2;
const float DOMINANT_DIRECTION_THRESHOLD = 3.6;

const float BLEND_NONE = 0.0;
const float BLEND_NORMAL = 1.0;
const float BLEND_DOMINANT = 2.0;

#define eq(a,b)  (a == b)
#define neq(a,b) (a != b)

#define P(x,y) texture(u_texture, coord + texelSize * vec2(float(x), float(y))).rgb

float DistYCbCr(vec3 pixA, vec3 pixB) {
  const vec3 w = vec3(0.2627, 0.6780, 0.0593);
  float scaleB = 0.5 / (1.0 - w.b);
  float scaleR = 0.5 / (1.0 - w.r);
  vec3 diff = pixA - pixB;
  float Y = dot(diff, w);
  float Cb = scaleB * (diff.b - Y);
  float Cr = scaleR * (diff.r - Y);
  return sqrt(Y * Y * LUMINANCE_WEIGHT + Cb * Cb + Cr * Cr);
}

bool IsPixEqual(vec3 pixA, vec3 pixB) {
  return DistYCbCr(pixA, pixB) < EQUAL_COLOR_TOLERANCE;
}

float get_left_ratio(vec2 center, vec2 origin, vec2 direction, vec2 scale) {
  vec2 window_offset = center - origin;
  float left = direction.x * window_offset.y - direction.y * window_offset.x;
  float right = direction.x * (window_offset.y + scale.y) - direction.y * (window_offset.x + scale.x);
  float top = direction.x * window_offset.y - direction.y * window_offset.x;
  float bottom = direction.x * (window_offset.y + scale.y) - direction.y * (window_offset.x + scale.x);

  float avg = (left + right + top + bottom) / 4.0;
  float edgeLen = length(direction * scale);
  float area = scale.x * scale.y;
  return clamp(avg * edgeLen / area + 0.5, 0.0, 1.0);
}

void main() {
  vec2 texelSize = 1.0 / u_textureSize;
  vec2 scale = u_resolution / u_originalSize;
  vec2 pos = fract(v_texCoord * u_originalSize) - vec2(0.5);
  vec2 coord = v_texCoord - pos * texelSize;

  // Sample the 5x5 neighborhood
  vec3 A1 = P(-1,-2); vec3 B1 = P( 0,-2); vec3 C1 = P( 1,-2);
  vec3 A  = P(-2,-1); vec3 B  = P(-1,-1); vec3 C  = P( 0,-1); vec3 D  = P( 1,-1); vec3 D4 = P( 2,-1);
  vec3 A0 = P(-2, 0); vec3 E  = P(-1, 0); vec3 F  = P( 0, 0); vec3 G  = P( 1, 0); vec3 G4 = P( 2, 0);
  vec3 C0 = P(-2, 1); vec3 H  = P(-1, 1); vec3 I  = P( 0, 1); vec3 J  = P( 1, 1); vec3 J4 = P( 2, 1);
  vec3 H5 = P(-1, 2); vec3 I5 = P( 0, 2); vec3 J5 = P( 1, 2);

  // Blend results for each corner: 0=none, 1=normal, 2=dominant
  vec4 blendResult = vec4(BLEND_NONE);

  // Pre-compute color distances for pattern detection
  float dist_B_I = DistYCbCr(B, I);
  float dist_C_F = DistYCbCr(C, F);
  float dist_D_E = DistYCbCr(D, E);
  float dist_B_G = DistYCbCr(B, G);
  float dist_C_J = DistYCbCr(C, J);
  float dist_D_H = DistYCbCr(D, H);
  float dist_E_J = DistYCbCr(E, J);
  float dist_F_I = DistYCbCr(F, I);
  float dist_F_G = DistYCbCr(F, G);
  float dist_H_C = DistYCbCr(H, C);

  // Bottom-right corner blend detection
  {
    float jg = DistYCbCr(I, F) + DistYCbCr(I, J4) + DistYCbCr(F, B) + DistYCbCr(F, G4) + 4.0 * DistYCbCr(G, J);
    float fk = DistYCbCr(G, I5) + DistYCbCr(G, C) + DistYCbCr(J, H) + DistYCbCr(J, J5) + 4.0 * DistYCbCr(I, F);
    if (jg < fk) {
      bool dominantGradient = DOMINANT_DIRECTION_THRESHOLD * jg < fk;
      blendResult.w = dominantGradient ? BLEND_DOMINANT : BLEND_NORMAL;
    }
  }

  // Bottom-left corner blend detection
  {
    float jg = DistYCbCr(F, I) + DistYCbCr(F, A) + DistYCbCr(I, I5) + DistYCbCr(I, C0) + 4.0 * DistYCbCr(H, E);
    float fk = DistYCbCr(H, B) + DistYCbCr(H, H5) + DistYCbCr(E, G) + DistYCbCr(E, A0) + 4.0 * DistYCbCr(F, I);
    if (jg < fk) {
      bool dominantGradient = DOMINANT_DIRECTION_THRESHOLD * jg < fk;
      blendResult.z = dominantGradient ? BLEND_DOMINANT : BLEND_NORMAL;
    }
  }

  // Top-right corner blend detection
  {
    float jg = DistYCbCr(F, I) + DistYCbCr(F, D4) + DistYCbCr(I, A) + DistYCbCr(I, J5) + 4.0 * DistYCbCr(C, J);
    float fk = DistYCbCr(C, B1) + DistYCbCr(C, G4) + DistYCbCr(J, I5) + DistYCbCr(J, D) + 4.0 * DistYCbCr(F, I);
    if (jg < fk) {
      bool dominantGradient = DOMINANT_DIRECTION_THRESHOLD * jg < fk;
      blendResult.y = dominantGradient ? BLEND_DOMINANT : BLEND_NORMAL;
    }
  }

  // Top-left corner blend detection
  {
    float jg = DistYCbCr(I, F) + DistYCbCr(I, C0) + DistYCbCr(F, D4) + DistYCbCr(F, B1) + 4.0 * DistYCbCr(B, E);
    float fk = DistYCbCr(B, A1) + DistYCbCr(B, C1) + DistYCbCr(E, A0) + DistYCbCr(E, H) + 4.0 * DistYCbCr(I, F);
    if (jg < fk) {
      bool dominantGradient = DOMINANT_DIRECTION_THRESHOLD * jg < fk;
      blendResult.x = dominantGradient ? BLEND_DOMINANT : BLEND_NORMAL;
    }
  }

  vec3 res = F;
  vec2 invScale = 1.0 / scale;

  // Apply blends for each corner
  // Bottom-right
  if (blendResult.w != BLEND_NONE) {
    bool doLine = (blendResult.y == BLEND_NONE && !IsPixEqual(F, C) && !IsPixEqual(F, B)) ||
                  (blendResult.z == BLEND_NONE && !IsPixEqual(F, H) && !IsPixEqual(F, E));
    vec2 origin = vec2(0.0);
    vec2 direction = vec2(1.0);
    if (doLine) {
      bool haveShallowLine = (STEEP_DIRECTION_THRESHOLD * DistYCbCr(F, G) <= DistYCbCr(F, I)) &&
                              neq(E, G) && neq(B, G);
      bool haveSteepLine = (STEEP_DIRECTION_THRESHOLD * DistYCbCr(F, H) <= DistYCbCr(F, I)) &&
                           neq(E, H) && neq(D, H);
      origin = haveShallowLine ? vec2(0.0, 0.25) : vec2(0.0);
      direction = haveShallowLine && haveSteepLine ? vec2(1.0, -1.0) :
                  (haveShallowLine ? vec2(2.0, -1.0) : (haveSteepLine ? vec2(1.0, -2.0) : vec2(1.0, -1.0)));
      if (haveSteepLine) origin.x = 0.25;
    }
    float ratio = get_left_ratio(pos, origin, direction, invScale);
    float blendW = (blendResult.w == BLEND_DOMINANT || doLine) ? ratio : 0.0;
    res = mix(res, mix(H, G, step(DistYCbCr(F, G), DistYCbCr(F, H))), blendW);
  }

  // Top-right
  if (blendResult.y != BLEND_NONE) {
    bool doLine = (blendResult.w == BLEND_NONE && !IsPixEqual(F, H) && !IsPixEqual(F, E)) ||
                  (blendResult.x == BLEND_NONE && !IsPixEqual(F, B) && !IsPixEqual(F, D));
    vec2 origin = vec2(0.0);
    vec2 direction = vec2(1.0, -1.0);
    if (doLine) {
      bool haveShallowLine = (STEEP_DIRECTION_THRESHOLD * DistYCbCr(F, C) <= DistYCbCr(F, G)) &&
                              neq(B, C) && neq(I, C);
      bool haveSteepLine = (STEEP_DIRECTION_THRESHOLD * DistYCbCr(F, B) <= DistYCbCr(F, G)) &&
                           neq(E, B) && neq(H, B);
      origin = haveShallowLine ? vec2(0.25, 0.0) : vec2(0.0);
      direction = haveShallowLine && haveSteepLine ? vec2(-1.0, -1.0) :
                  (haveShallowLine ? vec2(-1.0, -2.0) : (haveSteepLine ? vec2(-2.0, -1.0) : vec2(-1.0, -1.0)));
      if (haveSteepLine) origin.y = 0.25;
    }
    vec2 posR = vec2(pos.y, -pos.x);
    float ratio = get_left_ratio(posR, origin, direction, invScale.yx);
    float blendY = (blendResult.y == BLEND_DOMINANT || doLine) ? ratio : 0.0;
    res = mix(res, mix(B, G, step(DistYCbCr(F, G), DistYCbCr(F, B))), blendY);
  }

  // Top-left
  if (blendResult.x != BLEND_NONE) {
    bool doLine = (blendResult.y == BLEND_NONE && !IsPixEqual(F, C) && !IsPixEqual(F, G)) ||
                  (blendResult.z == BLEND_NONE && !IsPixEqual(F, E) && !IsPixEqual(F, H));
    vec2 origin = vec2(0.0);
    vec2 direction = vec2(-1.0);
    if (doLine) {
      bool haveShallowLine = (STEEP_DIRECTION_THRESHOLD * DistYCbCr(F, E) <= DistYCbCr(F, B)) &&
                              neq(C, E) && neq(I, E);
      bool haveSteepLine = (STEEP_DIRECTION_THRESHOLD * DistYCbCr(F, D) <= DistYCbCr(F, B)) &&
                           neq(G, D) && neq(J, D);
      origin = haveShallowLine ? vec2(0.0, -0.25) : vec2(0.0);
      direction = haveShallowLine && haveSteepLine ? vec2(-1.0, 1.0) :
                  (haveShallowLine ? vec2(-2.0, 1.0) : (haveSteepLine ? vec2(-1.0, 2.0) : vec2(-1.0, 1.0)));
      if (haveSteepLine) origin.x = -0.25;
    }
    vec2 posR = vec2(-pos.x, -pos.y);
    float ratio = get_left_ratio(posR, origin, direction, invScale);
    float blendX = (blendResult.x == BLEND_DOMINANT || doLine) ? ratio : 0.0;
    res = mix(res, mix(D, E, step(DistYCbCr(F, E), DistYCbCr(F, D))), blendX);
  }

  // Bottom-left
  if (blendResult.z != BLEND_NONE) {
    bool doLine = (blendResult.x == BLEND_NONE && !IsPixEqual(F, D) && !IsPixEqual(F, G)) ||
                  (blendResult.w == BLEND_NONE && !IsPixEqual(F, I) && !IsPixEqual(F, J));
    vec2 origin = vec2(0.0);
    vec2 direction = vec2(-1.0, 1.0);
    if (doLine) {
      bool haveShallowLine = (STEEP_DIRECTION_THRESHOLD * DistYCbCr(F, H) <= DistYCbCr(F, E)) &&
                              neq(D, H) && neq(J, H);
      bool haveSteepLine = (STEEP_DIRECTION_THRESHOLD * DistYCbCr(F, E) <= DistYCbCr(F, H)) &&
                           neq(C, E) && neq(I5, E);
      origin = haveShallowLine ? vec2(-0.25, 0.0) : vec2(0.0);
      direction = haveShallowLine && haveSteepLine ? vec2(1.0, 1.0) :
                  (haveShallowLine ? vec2(1.0, 2.0) : (haveSteepLine ? vec2(2.0, 1.0) : vec2(1.0, 1.0)));
      if (haveSteepLine) origin.y = -0.25;
    }
    vec2 posR = vec2(-pos.y, pos.x);
    float ratio = get_left_ratio(posR, origin, direction, invScale.yx);
    float blendZ = (blendResult.z == BLEND_DOMINANT || doLine) ? ratio : 0.0;
    res = mix(res, mix(D, H, step(DistYCbCr(F, H), DistYCbCr(F, D))), blendZ);
  }

  fragColor = vec4(res, 1.0);
}`;

/**
 * Bayer Matrix Dithering — ported from bayer-matrix-dithering.slang (public domain).
 * Quantizes colors using an 8x8 Bayer matrix threshold pattern.
 */
export const ditherFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

int dither[8 * 8] = int[64](
   0, 48, 12, 60,  3, 51, 15, 63,
  32, 16, 44, 28, 35, 19, 47, 31,
   8, 56,  4, 52, 11, 59,  7, 55,
  40, 24, 36, 20, 43, 27, 39, 23,
   2, 50, 14, 62,  1, 49, 13, 61,
  34, 18, 46, 30, 33, 17, 45, 29,
  10, 58,  6, 54,  9, 57,  5, 53,
  42, 26, 38, 22, 41, 25, 37, 21
);

float find_closest(int x, int y, float c0) {
  float limit = 0.0;
  if (x < 8) {
    limit = float(dither[y * 8 + x] + 1) / 64.0;
  }
  if (c0 < limit) return 0.0;
  return 1.0;
}

void main() {
  float Scale = 3.0;
  vec3 rgb = texture(u_texture, v_texCoord).rgb;
  vec2 xy = (v_texCoord * u_resolution) * Scale;
  int x = int(mod(xy.x, 8.0));
  int y = int(mod(xy.y, 8.0));
  vec3 finalRGB;
  finalRGB.r = find_closest(x, y, rgb.r);
  finalRGB.g = find_closest(x, y, rgb.g);
  finalRGB.b = find_closest(x, y, rgb.b);
  fragColor = vec4(finalRGB, 1.0);
}`;

/**
 * CMYK Halftone Dot — ported from cmyk-halftone-dot.slang (public domain).
 * Simulates CMYK halftone printing with rotated dot screens.
 */
export const halftoneFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

const float PI = 3.14159265358979;
const float frequency = 550.0;

mat2 rotateMatrix(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

/** Compute halftone dot value for a single separation channel. */
float halftonePattern(vec2 pos, float angle, float channelValue) {
  vec2 rotated = rotateMatrix(angle) * pos;
  vec2 cellUV = fract(rotated * frequency) - 0.5;
  float dotDist = length(cellUV);
  // threshold: darker channel => bigger dot => lower threshold
  float threshold = 0.5 * sqrt(channelValue);
  return smoothstep(threshold - 0.05, threshold + 0.05, dotDist);
}

void main() {
  vec3 rgb = texture(u_texture, v_texCoord).rgb;
  vec2 pos = v_texCoord * u_resolution / u_resolution.y;

  // RGB to CMYK
  float cVal = 1.0 - rgb.r;
  float mVal = 1.0 - rgb.g;
  float yVal = 1.0 - rgb.b;
  float kVal = min(cVal, min(mVal, yVal));

  // Under-color removal
  float denom = 1.0 - kVal + 0.001;
  cVal = (cVal - kVal) / denom;
  mVal = (mVal - kVal) / denom;
  yVal = (yVal - kVal) / denom;

  // Traditional CMYK halftone screen angles
  float dotK = halftonePattern(pos, PI * 0.25,   kVal);  // 45 degrees
  float dotC = halftonePattern(pos, PI * 0.0833,  cVal);  // ~15 degrees
  float dotM = halftonePattern(pos, PI * -0.0833, mVal);  // ~-15 degrees
  float dotY = halftonePattern(pos, 0.0,          yVal);  // 0 degrees

  // Reconstruct: where dot is printed (halftonePattern returns 1 = no ink, 0 = full ink)
  // CMYK to RGB: R = (1-C)(1-K), G = (1-M)(1-K), B = (1-Y)(1-K)
  float inkC = 1.0 - dotC;
  float inkM = 1.0 - dotM;
  float inkY = 1.0 - dotY;
  float inkK = 1.0 - dotK;

  vec3 result;
  result.r = (1.0 - inkC) * (1.0 - inkK);
  result.g = (1.0 - inkM) * (1.0 - inkK);
  result.b = (1.0 - inkY) * (1.0 - inkK);

  // Blend toward original color at high frequencies to reduce aliasing
  float blend = smoothstep(0.0, 1.0, frequency / 600.0);
  result = mix(result, rgb, blend * 0.3);

  fragColor = vec4(result, 1.0);
}`;

/**
 * LCD PSP — ported from lcd1x_psp.slang by Sp00kyFox (GPL).
 * Simulates the LCD pixel grid of the PlayStation Portable.
 */
export const lcdPspFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;
uniform vec2 u_originalSize;

in vec2 v_texCoord;
out vec4 fragColor;

const float PI = 3.14159265358979;
const float BRIGHTEN_SCANLINES = 16.0;
const float BRIGHTEN_LCD = 4.0;

void main() {
  vec2 angle = 2.0 * PI * (v_texCoord * u_textureSize - 0.25);
  float yfactor = (BRIGHTEN_SCANLINES + sin(angle.y)) / (BRIGHTEN_SCANLINES + 1.0);
  float xfactor = (BRIGHTEN_LCD + sin(angle.x)) / (BRIGHTEN_LCD + 1.0);
  vec3 colour = texture(u_texture, v_texCoord).rgb;
  colour.rgb = yfactor * xfactor * colour.rgb;
  fragColor = vec4(colour, 1.0);
}`;

/**
 * NTSC Adaptive — Pass 1 vertex shader.
 * Computes the output pixel coordinate for chroma carrier modulation.
 */
export const ntscEncodeVertexShader = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
out vec2 v_pix_no;
uniform vec2 u_textureSize;
uniform vec2 u_resolution;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
  // pix_no = output pixel coordinate
  v_pix_no = a_texCoord * u_textureSize * (u_resolution / u_textureSize);
}`;

/**
 * NTSC Adaptive — Pass 1: encode RGB to YIQ composite signal.
 * Ported from libretro ntsc-pass1-composite-3phase.glsl (GPL).
 */
export const ntscEncodeFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform int u_frameCount;

in vec2 v_texCoord;
in vec2 v_pix_no;
out vec4 fragColor;

const float PI = 3.14159265;
const float CHROMA_MOD_FREQ = PI / 3.0;

const float SATURATION = 1.0;
const float BRIGHTNESS = 1.0;
const float ARTIFACTING = 1.0;
const float FRINGING = 1.0;

const mat3 yiq_mat = mat3(
  0.2989, 0.5870, 0.1140,
  0.5959,-0.2744,-0.3216,
  0.2115,-0.5229, 0.3114
);

void main() {
  mat3 mix_mat = mat3(
    BRIGHTNESS, FRINGING, FRINGING,
    ARTIFACTING, 2.0 * SATURATION, 0.0,
    ARTIFACTING, 0.0, 2.0 * SATURATION
  );

  vec3 col = texture(u_texture, v_texCoord).rgb;
  vec3 yiq = col * yiq_mat;

  float chroma_phase = 0.6667 * PI * (mod(v_pix_no.y, 3.0) + float(u_frameCount));
  float mod_phase = chroma_phase + v_pix_no.x * CHROMA_MOD_FREQ;

  float i_mod = cos(mod_phase);
  float q_mod = sin(mod_phase);

  yiq.yz *= vec2(i_mod, q_mod);
  yiq *= mix_mat;
  yiq.yz *= vec2(i_mod, q_mod);

  fragColor = vec4(yiq, 1.0);
}`;

/**
 * NTSC Adaptive — Pass 2 vertex shader.
 * Applies the half-texel horizontal offset to compensate for decimate-by-2.
 */
export const ntscDecodeVertexShader = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
uniform vec2 u_textureSize;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord - vec2(0.5 / u_textureSize.x, 0.0);
}`;

/**
 * NTSC Adaptive — Pass 2: decode YIQ composite back to RGB.
 * Ported from libretro ntsc-pass2-3phase.glsl (GPL).
 * 24-tap FIR with separate luma and chroma filter kernels.
 */
export const ntscDecodeFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

#define TAPS 24

const float luma_filter[TAPS + 1] = float[TAPS + 1](
  -0.000012020,
  -0.000022146,
  -0.000013155,
  -0.000012020,
  -0.000049979,
  -0.000113940,
  -0.000122150,
  -0.000005612,
   0.000170516,
   0.000237199,
   0.000169640,
   0.000285688,
   0.000984574,
   0.002018683,
   0.002002275,
  -0.000909882,
  -0.007049081,
  -0.013222860,
  -0.012606931,
   0.002460860,
   0.035868225,
   0.084016453,
   0.135563500,
   0.175261268,
   0.190176552
);

const float chroma_filter[TAPS + 1] = float[TAPS + 1](
  -0.000118847,
  -0.000271306,
  -0.000502642,
  -0.000930833,
  -0.001451013,
  -0.002064744,
  -0.002700432,
  -0.003241276,
  -0.003524948,
  -0.003350284,
  -0.002491729,
  -0.000721149,
   0.002164659,
   0.006313635,
   0.011789103,
   0.018545660,
   0.026414396,
   0.035100710,
   0.044196567,
   0.053207202,
   0.061590275,
   0.068803602,
   0.074356193,
   0.077856564,
   0.079052396
);

const mat3 yiq2rgb_mat = mat3(
  1.0,  0.956,  0.6210,
  1.0, -0.2720,-0.6474,
  1.0, -1.1060, 1.7046
);

void main() {
  float one_x = 1.0 / u_textureSize.x;
  vec3 signal = vec3(0.0);

  for (int i = 0; i < TAPS; i++) {
    float offset = float(i);
    vec3 sums = texture(u_texture, v_texCoord + vec2((offset - float(TAPS)) * one_x, 0.0)).xyz
              + texture(u_texture, v_texCoord + vec2((float(TAPS) - offset) * one_x, 0.0)).xyz;
    signal += sums * vec3(luma_filter[i], chroma_filter[i], chroma_filter[i]);
  }

  signal += texture(u_texture, v_texCoord).xyz *
    vec3(luma_filter[TAPS], chroma_filter[TAPS], chroma_filter[TAPS]);

  vec3 rgb = signal * yiq2rgb_mat;
  fragColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}`;

/**
 * Motion Blur feedback shader — blends current frame with previous frame output.
 * BLEND_FACTOR controls how much of the previous frame persists (higher = more blur).
 */
export const motionBlurFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_feedback;

in vec2 v_texCoord;
out vec4 fragColor;

const float BLEND_FACTOR = 0.65;

void main() {
  vec4 current = texture(u_texture, v_texCoord);
  vec4 previous = texture(u_feedback, v_texCoord);
  fragColor = mix(current, previous, BLEND_FACTOR);
}`;
