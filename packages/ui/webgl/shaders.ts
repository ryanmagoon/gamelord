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

export const crtFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;
uniform float u_time;

in vec2 v_texCoord;
out vec4 fragColor;

const float CURVATURE = 4.0;
const float SCANLINE_INTENSITY = 0.15;

vec2 curveRemapUV(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(CURVATURE);
  uv = uv + uv * offset * offset;
  uv = uv * 0.5 + 0.5;
  return uv;
}

void main() {
  vec2 uv = curveRemapUV(v_texCoord);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Chromatic aberration
  float shift = 0.001;
  vec3 color;
  color.r = texture(u_texture, uv + vec2(shift, 0.0)).r;
  color.g = texture(u_texture, uv).g;
  color.b = texture(u_texture, uv - vec2(shift, 0.0)).b;

  // Scanlines
  float scanline = sin(uv.y * u_textureSize.y * 3.14159);
  scanline = (scanline + 1.0) * 0.5;
  scanline = mix(1.0 - SCANLINE_INTENSITY, 1.0, scanline);
  color *= scanline;

  // Vignette
  vec2 vignetteCoord = uv * (1.0 - uv.yx);
  float vignette = vignetteCoord.x * vignetteCoord.y * 15.0;
  vignette = pow(vignette, 0.25);
  color *= vignette;

  fragColor = vec4(color, 1.0);
}`;

/**
 * CRT Aperture shader — simulates the shadow mask (RGB phosphor grille)
 * pattern of a CRT monitor.
 */
export const crtApertureFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;
uniform float u_time;

in vec2 v_texCoord;
out vec4 fragColor;

const float MASK_STRENGTH = 0.35;
const float SCANLINE_STRENGTH = 0.2;
const float BRIGHTNESS_BOOST = 1.25;

void main() {
  vec3 color = texture(u_texture, v_texCoord).rgb;

  // Shadow mask: RGB phosphor grille pattern
  vec2 pixel = gl_FragCoord.xy;
  int maskPhase = int(mod(pixel.x, 3.0));
  vec3 mask = vec3(1.0 - MASK_STRENGTH);
  if (maskPhase == 0) mask.r = 1.0;
  else if (maskPhase == 1) mask.g = 1.0;
  else mask.b = 1.0;
  color *= mask;

  // Scanlines based on source resolution
  float scanline = sin(v_texCoord.y * u_textureSize.y * 3.14159);
  scanline = (scanline + 1.0) * 0.5;
  scanline = mix(1.0 - SCANLINE_STRENGTH, 1.0, scanline);
  color *= scanline;

  // Brightness boost to compensate for mask/scanline darkening
  color *= BRIGHTNESS_BOOST;

  fragColor = vec4(color, 1.0);
}`;

/**
 * Scanline-only shader — clean scanlines without curvature or color effects.
 */
export const scanlineFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

const float SCANLINE_INTENSITY = 0.15;

void main() {
  vec3 color = texture(u_texture, v_texCoord).rgb;

  float scanline = sin(v_texCoord.y * u_textureSize.y * 3.14159);
  scanline = (scanline + 1.0) * 0.5;
  scanline = mix(1.0 - SCANLINE_INTENSITY, 1.0, scanline);
  color *= scanline;

  fragColor = vec4(color, 1.0);
}`;

/**
 * LCD shader — simulates the subpixel grid of a handheld LCD screen.
 */
export const lcdFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

const float GRID_STRENGTH = 0.12;
const float BRIGHTNESS_BOOST = 1.1;

void main() {
  vec3 color = texture(u_texture, v_texCoord).rgb;

  // LCD subpixel grid — darken at pixel boundaries
  vec2 subpixel = fract(v_texCoord * u_textureSize);
  float gridX = smoothstep(0.0, 0.05, subpixel.x) * smoothstep(1.0, 0.95, subpixel.x);
  float gridY = smoothstep(0.0, 0.05, subpixel.y) * smoothstep(1.0, 0.95, subpixel.y);
  float grid = mix(1.0 - GRID_STRENGTH, 1.0, gridX * gridY);
  color *= grid;

  color *= BRIGHTNESS_BOOST;

  fragColor = vec4(color, 1.0);
}`;

/**
 * Pixel-sharp shader — bilinear-interpolated scaling that keeps pixel edges
 * crisp while avoiding the harshness of pure nearest-neighbor.
 */
export const sharpBilinearFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_textureSize;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 texel = v_texCoord * u_textureSize;
  vec2 texelFloor = floor(texel);
  vec2 f = texel - texelFloor;

  // Sharp bilinear: remap interpolation factor for crisp edges
  vec2 scale = u_resolution / u_textureSize;
  vec2 sharpF = clamp(f * scale, 0.0, 0.5) + clamp((f - 1.0) * scale + 0.5, 0.0, 0.5);

  vec2 uv = (texelFloor + sharpF) / u_textureSize;
  fragColor = texture(u_texture, uv);
}`;
