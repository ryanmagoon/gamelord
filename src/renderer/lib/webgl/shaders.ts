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
uniform float u_time;
uniform float u_curvature;
uniform float u_scanlineIntensity;

in vec2 v_texCoord;
out vec4 fragColor;

vec2 curveRemapUV(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(u_curvature);
  uv = uv + uv * offset * offset;
  uv = uv * 0.5 + 0.5;
  return uv;
}

vec3 scanline(vec2 uv, vec3 color) {
  float scanline = sin(uv.y * u_resolution.y * 3.14159);
  scanline = (scanline + 1.0) * 0.5;
  scanline = mix(1.0 - u_scanlineIntensity, 1.0, scanline);
  return color * scanline;
}

void main() {
  vec2 uv = curveRemapUV(v_texCoord);
  
  // Check if we're outside the curved bounds
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  
  vec3 color = texture(u_texture, uv).rgb;
  
  // Apply scanlines
  color = scanline(uv, color);
  
  // Add subtle vignette
  vec2 vignetteCoord = uv * (1.0 - uv.yx);
  float vignette = vignetteCoord.x * vignetteCoord.y * 15.0;
  vignette = pow(vignette, 0.25);
  color *= vignette;
  
  // Add subtle color shift for that CRT feel
  float shift = 0.001;
  color.r = texture(u_texture, uv + vec2(shift, 0.0)).r;
  color.b = texture(u_texture, uv - vec2(shift, 0.0)).b;
  
  fragColor = vec4(color, 1.0);
}`;

export const scanlineFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_scanlineIntensity;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec3 color = texture(u_texture, v_texCoord).rgb;
  
  float scanline = sin(v_texCoord.y * u_resolution.y * 3.14159);
  scanline = (scanline + 1.0) * 0.5;
  scanline = mix(1.0 - u_scanlineIntensity, 1.0, scanline);
  
  color *= scanline;
  
  fragColor = vec4(color, 1.0);
}`;

export const pixelateFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_pixelSize;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 pixelSize = vec2(u_pixelSize) / u_resolution;
  vec2 coord = floor(v_texCoord / pixelSize) * pixelSize + pixelSize * 0.5;
  
  fragColor = texture(u_texture, coord);
}`;