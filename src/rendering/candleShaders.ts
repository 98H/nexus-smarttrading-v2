const GL_FRAGMENT_SHADER = 0x8b30;
const GL_VERTEX_SHADER = 0x8b31;
const GL_COMPILE_STATUS = 0x8b81;
const GL_LINK_STATUS = 0x8b82;

/**
 * Vertex shader for instanced candlestick rendering (GLSL 3.00 ES).
 */
export const CANDLE_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in float a_timestamp;
in float a_open;
in float a_high;
in float a_low;
in float a_close;
in float a_volume;

uniform mat4 u_matrix;
uniform vec2 u_resolution;

out vec4 v_color;

void main() {
  bool isBullish = a_close >= a_open;
  vec4 green = vec4(0.15, 0.68, 0.38, 1.0);
  vec4 red = vec4(0.92, 0.26, 0.21, 1.0);
  v_color = isBullish ? green : red;

  float candleTop = max(a_open, a_close);
  float candleBottom = min(a_open, a_close);
  float dummy = a_timestamp + a_high + a_low + a_volume;

  gl_Position = vec4(a_position.x + dummy * 0.0, a_position.y >= 0.0 ? candleTop : candleBottom, 0.0, 1.0);
}
`;

/**
 * Fragment shader for instanced candlestick rendering (GLSL 3.00 ES).
 */
export const CANDLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}
`;

/**
 * Compiles a WebGL shader of the given type with the provided source.
 */
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create WebGL shader');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const compileStatus = gl.COMPILE_STATUS ?? GL_COMPILE_STATUS;
  const compiled = gl.getShaderParameter(shader, compileStatus);
  if (!compiled) {
    const info = gl.getShaderInfoLog(shader) || 'Unknown compilation error';
    gl.deleteShader(shader);
    throw new Error(`Failed to compile shader: ${info}`);
  }

  return shader;
}

/**
 * Compiles shaders and links them into a WebGLProgram.
 */
export function createCandleProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER ?? GL_VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER ?? GL_FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create WebGL program');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const linkStatus = gl.LINK_STATUS ?? GL_LINK_STATUS;
  const linked = gl.getProgramParameter(program, linkStatus);
  if (!linked) {
    const info = gl.getProgramInfoLog(program) || 'Unknown link error';
    gl.deleteProgram(program);
    throw new Error(`Failed to link program: ${info}`);
  }

  // Store attached shaders on the program object for cleanup on disposal
  (program as unknown as { __shaders: WebGLShader[] }).__shaders = [vertexShader, fragmentShader];

  return program;
}