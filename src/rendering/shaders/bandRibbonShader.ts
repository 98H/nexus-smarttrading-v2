export interface VolatilityPoint {
  timestamp: number;
  value: number;
}

export interface BandRibbonUniforms {
  upperColor: [number, number, number, number] | Float32Array | number[];
  lowerColor: [number, number, number, number] | Float32Array | number[];
  volatilityMultiplier: number;
  opacity: number;
}

export const bandRibbonVertexShader = `
attribute vec2 a_position;
attribute float a_bandFactor;

uniform mat4 u_matrix;

varying float v_bandFactor;

void main() {
    v_bandFactor = a_bandFactor;
    gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
}
`;

export const bandRibbonFragmentShader = `
precision mediump float;

uniform vec4 u_upperColor;
uniform vec4 u_lowerColor;
uniform float u_volatilityMultiplier;
uniform float u_opacity;

varying float v_bandFactor;

void main() {
    vec4 color = mix(u_lowerColor, u_upperColor, clamp(v_bandFactor, 0.0, 1.0));
    gl_FragColor = vec4(color.rgb * u_volatilityMultiplier, color.a * u_opacity);
}
`;

export function generateRibbonGeometry(
  upper: VolatilityPoint[],
  lower: VolatilityPoint[]
): Float32Array {
  if (upper.length !== lower.length) {
    throw new Error('Array lengths of upper and lower bands must match');
  }

  const count = upper.length;
  const stride = 3;
  const vertexData = new Float32Array(count * 2 * stride);

  for (let i = 0; i < count; i++) {
    const upperVertexOffset = i * 2 * stride;
    const lowerVertexOffset = upperVertexOffset + stride;

    // Upper vertex: factor = 1.0
    vertexData[upperVertexOffset] = upper[i].timestamp;
    vertexData[upperVertexOffset + 1] = upper[i].value;
    vertexData[upperVertexOffset + 2] = 1.0;

    // Lower vertex: factor = 0.0
    vertexData[lowerVertexOffset] = lower[i].timestamp;
    vertexData[lowerVertexOffset + 1] = lower[i].value;
    vertexData[lowerVertexOffset + 2] = 0.0;
  }

  return vertexData;
}

export class BandRibbonShader {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;

  private uUpperColorLoc: WebGLUniformLocation | null;
  private uLowerColorLoc: WebGLUniformLocation | null;
  private uVolatilityMultiplierLoc: WebGLUniformLocation | null;
  private uOpacityLoc: WebGLUniformLocation | null;
  private uMatrixLoc: WebGLUniformLocation | null;

  public aPositionLoc: number;
  public aBandFactorLoc: number;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.program = this.initProgram();

    this.uUpperColorLoc = gl.getUniformLocation(this.program, 'u_upperColor');
    this.uLowerColorLoc = gl.getUniformLocation(this.program, 'u_lowerColor');
    this.uVolatilityMultiplierLoc = gl.getUniformLocation(this.program, 'u_volatilityMultiplier');
    this.uOpacityLoc = gl.getUniformLocation(this.program, 'u_opacity');
    this.uMatrixLoc = gl.getUniformLocation(this.program, 'u_matrix');

    this.aPositionLoc = gl.getAttribLocation(this.program, 'a_position');
    this.aBandFactorLoc = gl.getAttribLocation(this.program, 'a_bandFactor');
  }

  public use(): void {
    this.gl.useProgram(this.program);
  }

  public setUniforms(uniforms: BandRibbonUniforms): void {
    this.use();

    if (this.uUpperColorLoc) {
      this.gl.uniform4fv(this.uUpperColorLoc, uniforms.upperColor);
    }
    if (this.uLowerColorLoc) {
      this.gl.uniform4fv(this.uLowerColorLoc, uniforms.lowerColor);
    }
    if (this.uVolatilityMultiplierLoc) {
      this.gl.uniform1f(this.uVolatilityMultiplierLoc, uniforms.volatilityMultiplier);
    }
    if (this.uOpacityLoc) {
      this.gl.uniform1f(this.uOpacityLoc, uniforms.opacity);
    }
  }

  public setMatrix(matrix: Float32Array | number[]): void {
    if (this.uMatrixLoc) {
      this.gl.uniformMatrix4fv(this.uMatrixLoc, false, matrix);
    }
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error('Failed to create WebGL shader');
    }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    return shader;
  }

  private initProgram(): WebGLProgram {
    const program = this.gl.createProgram();
    if (!program) {
      throw new Error('Failed to create WebGL program');
    }
    const vsType = this.gl.VERTEX_SHADER ?? 0x8b31;
    const fsType = this.gl.FRAGMENT_SHADER ?? 0x8b30;

    const vs = this.compileShader(vsType, bandRibbonVertexShader);
    const fs = this.compileShader(fsType, bandRibbonFragmentShader);

    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);

    return program;
  }
}