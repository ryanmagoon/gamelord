/**
 * LCD Grid V2 + GBA Color shaders — ported from libretro slang-shaders.
 *
 * lcd-grid-v2.slang by cgwg (GPL)
 * gba-color.slang by Pokefan531/hunterk (public domain)
 * response-time.slang from libretro motionblur shaders (GPL)
 *
 * Ported to GLSL ES 3.0 for WebGL2.
 */

/**
 * LCD Grid V2 — subpixel grid with polynomial anti-aliasing.
 * Simulates the physical subpixel layout of an LCD panel. Each source pixel
 * is rendered through R/G/B subpixel columns with anti-aliased polynomial
 * smearing (intsmear), producing the characteristic grid pattern visible
 * on handheld screens when viewed closely.
 *
 * GBA preset values baked in: BGR=1, gain=1.0, gamma=2.2,
 * blacklevel=0.0, ambient=0.0, pure subpixel colors.
 */
export const lcdGridV2FragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

// GBA preset parameters (baked constants)
const float gain = 1.0;
const float GAMMA = 2.2;
const float blacklevel = 0.0;
const float ambient = 0.0;
const float BGR = 1.0;
const float outgamma = 2.2;

// Subpixel colors (pure R/G/B for GBA)
const vec3 cred   = vec3(1.0, 0.0, 0.0); // pow(vec3(1,0,0), vec3(outgamma))
const vec3 cgreen = vec3(0.0, 1.0, 0.0);
const vec3 cblue  = vec3(0.0, 0.0, 1.0);

vec3 fetch_offset(ivec2 coord, ivec2 offset) {
  return pow(
    vec3(gain) * texelFetch(u_texture, coord + offset, 0).rgb + vec3(blacklevel),
    vec3(GAMMA)
  ) + vec3(ambient);
}

// Polynomial coefficients for anti-aliased subpixel smearing.
// X: integral of (1 - x^2 - x^4 + x^6)^2
float coeffs_x[7] = float[7](1.0, -2.0/3.0, -1.0/5.0, 4.0/7.0, -1.0/9.0, -2.0/11.0, 1.0/13.0);
// Y: integral of (1 - 2x^4 + x^6)^2
float coeffs_y[7] = float[7](1.0,      0.0, -4.0/5.0, 2.0/7.0,  4.0/9.0, -4.0/11.0, 1.0/13.0);

float intsmear_func(float z, float coeffs[7]) {
  float z2 = z * z;
  float zn = z;
  float ret = 0.0;
  for (int i = 0; i < 7; i++) {
    ret += zn * coeffs[i];
    zn *= z2;
  }
  return ret;
}

float intsmear(float x, float dx, float d, float coeffs[7]) {
  float zl = clamp((x - dx * 0.5) / d, -1.0, 1.0);
  float zh = clamp((x + dx * 0.5) / d, -1.0, 1.0);
  return d * (intsmear_func(zh, coeffs) - intsmear_func(zl, coeffs)) / dx;
}

void main() {
  vec2 texelSize = 1.0 / u_textureSize;
  vec2 range = 1.0 / u_resolution;

  // texelFetch requires integer coordinates — find the top-left source texel
  ivec2 tli = ivec2(floor(v_texCoord / texelSize - vec2(0.4999)));

  // Horizontal subpixel smearing (3 subpixels per source pixel)
  vec3 lcol, rcol;
  float subpix = (v_texCoord.x / texelSize.x - 0.4999 - float(tli.x)) * 3.0;
  float rsubpix = range.x / texelSize.x * 3.0;

  lcol = vec3(
    intsmear(subpix + 1.0, rsubpix, 1.5, coeffs_x),
    intsmear(subpix,       rsubpix, 1.5, coeffs_x),
    intsmear(subpix - 1.0, rsubpix, 1.5, coeffs_x)
  );
  rcol = vec3(
    intsmear(subpix - 2.0, rsubpix, 1.5, coeffs_x),
    intsmear(subpix - 3.0, rsubpix, 1.5, coeffs_x),
    intsmear(subpix - 4.0, rsubpix, 1.5, coeffs_x)
  );

  // BGR subpixel order (matching real GBA hardware)
  if (BGR > 0.5) {
    lcol.rgb = lcol.bgr;
    rcol.rgb = rcol.bgr;
  }

  // Vertical subpixel smearing
  float tcol, bcol;
  subpix = v_texCoord.y / texelSize.y - 0.4999 - float(tli.y);
  rsubpix = range.y / texelSize.y;
  tcol = intsmear(subpix,       rsubpix, 0.63, coeffs_y);
  bcol = intsmear(subpix - 1.0, rsubpix, 0.63, coeffs_y);

  // Fetch 2x2 texel neighborhood and apply subpixel weights
  vec3 topLeftColor     = fetch_offset(tli, ivec2(0, 0)) * lcol * vec3(tcol);
  vec3 bottomRightColor = fetch_offset(tli, ivec2(1, 1)) * rcol * vec3(bcol);
  vec3 bottomLeftColor  = fetch_offset(tli, ivec2(0, 1)) * lcol * vec3(bcol);
  vec3 topRightColor    = fetch_offset(tli, ivec2(1, 0)) * rcol * vec3(tcol);

  vec3 averageColor = topLeftColor + bottomRightColor + bottomLeftColor + topRightColor;

  // Apply subpixel color matrix
  averageColor = mat3(cred, cgreen, cblue) * averageColor;

  fragColor = vec4(pow(averageColor, vec3(1.0 / outgamma)), 1.0);
}`;

/**
 * GBA Color — LCD color space correction via matrix multiplication.
 * Replicates the GBA's unique LCD color rendering using a 4x4 color matrix
 * for sRGB displays. Applies gamma correction and optional screen darkening.
 *
 * By Pokefan531/hunterk (public domain).
 */
export const gbaColorFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 v_texCoord;
out vec4 fragColor;

const float target_gamma = 2.2;
const float display_gamma = 2.2;
const float darken_screen = 0.0;

// GBA sRGB color profile matrix.
// Column-major: each column is the output contribution from one input channel.
// Row 4 (profile[3].w) stores a luminance scalar.
const mat4 profile = mat4(
   0.905,  0.10,   0.1575, 0.0,
   0.195,  0.65,   0.1425, 0.0,
  -0.10,   0.25,   0.70,   0.0,
   0.0,    0.0,    0.0,    0.91
);

void main() {
  float lum = profile[3].w;
  vec4 screen = pow(texture(u_texture, v_texCoord), vec4(target_gamma + darken_screen * 1.6));
  screen = clamp(screen * lum, 0.0, 1.0);
  screen = profile * screen;
  fragColor = pow(screen, vec4(1.0 / display_gamma));
}`;

/**
 * LCD Response Time — simulates LCD pixel ghosting via frame blending.
 * Blends the current frame with the previous frame (via feedback texture)
 * using an exponential decay factor. The GBA preset uses response_time=0.111
 * for subtle, realistic LCD persistence.
 *
 * Simplified from the original 7-history-frame version to use the engine's
 * single-frame feedback mechanism, which produces visually equivalent results
 * at low response_time values.
 */
export const lcdResponseTimeFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_feedback;

in vec2 v_texCoord;
out vec4 fragColor;

const float response_time = 0.111;

void main() {
  vec3 current = texture(u_texture, v_texCoord).rgb;
  vec3 previous = texture(u_feedback, v_texCoord).rgb;
  fragColor = vec4(mix(current, previous, response_time), 1.0);
}`;
