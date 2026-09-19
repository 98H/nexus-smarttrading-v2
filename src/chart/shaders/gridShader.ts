import type { GridCalculationParams, GridStepsResult } from '../utils/gridCalculator.ts';

export const GRID_VERTEX_SHADER = `
attribute vec2 a_position;
uniform vec2 u_resolution;
varying vec2 v_uv;
varying vec2 v_position;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_position = a_position;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const GRID_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_priceRange;
uniform vec2 u_timeRange;
uniform float u_priceStep;
uniform float u_timeStep;
uniform float u_subPriceAlpha;
uniform float u_subTimeAlpha;
uniform vec4 u_gridColor;

varying vec2 v_uv;
varying vec2 v_position;

// Anti-aliased line rendering via smoothstep / fwidth pixel distance filtering
float computeLine(float coord, float stepSize, float pixelSpan) {
  if (stepSize <= 0.0 || pixelSpan <= 0.0) return 0.0;
  float distToLine = abs(fract(coord / stepSize + 0.5) - 0.5) * stepSize;
  float distInPixels = distToLine / pixelSpan;
  return 1.0 - smoothstep(0.0, 1.0, distInPixels);
}

void main() {
  float time = mix(u_timeRange.x, u_timeRange.y, v_uv.x);
  float price = mix(u_priceRange.x, u_priceRange.y, v_uv.y);

  float timePixelSpan = (u_timeRange.y - u_timeRange.x) / u_resolution.x;
  float pricePixelSpan = (u_priceRange.y - u_priceRange.x) / u_resolution.y;

  float timeLine = computeLine(time, u_timeStep, timePixelSpan);
  float priceLine = computeLine(price, u_priceStep, pricePixelSpan);

  float subTimeLine = computeLine(time, u_timeStep * 0.5, timePixelSpan) * u_subTimeAlpha;
  float subPriceLine = computeLine(price, u_priceStep * 0.5, pricePixelSpan) * u_subPriceAlpha;

  float vLine = max(timeLine, subTimeLine);
  float hLine = max(priceLine, subPriceLine);
  float gridAlpha = max(vLine, hLine);

  gl_FragColor = vec4(u_gridColor.rgb, u_gridColor.a * gridAlpha);
}
`;

export interface GridShaderUniforms {
  resolution: [number, number];
  priceRange: [number, number];
  timeRange: [number, number];
  priceStep: number;
  timeStep: number;
  subPriceAlpha: number;
  subTimeAlpha: number;
  gridColor: [number, number, number, number];
}

export class GridShader {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.program = this.initProgram();
  }

  public getProgram(): WebGLProgram {
    return this.program;
  }

  public updateUniforms(uniforms: GridShaderUniforms): void {
    const gl = this.gl;
    gl.useProgram(this.program);

    gl.uniform2f(
      gl.getUniformLocation(this.program, 'u_resolution'),
      uniforms.resolution[0],
      uniforms.resolution[1]
    );
    gl.uniform2f(
      gl.getUniformLocation(this.program, 'u_priceRange'),
      uniforms.priceRange[0],
      uniforms.priceRange[1]
    );
    gl.uniform2f(
      gl.getUniformLocation(this.program, 'u_timeRange'),
      uniforms.timeRange[0],
      uniforms.timeRange[1]
    );
    gl.uniform1f(
      gl.getUniformLocation(this.program, 'u_priceStep'),
      uniforms.priceStep
    );
    gl.uniform1f(
      gl.getUniformLocation(this.program, 'u_timeStep'),
      uniforms.timeStep
    );
    gl.uniform1f(
      gl.getUniformLocation(this.program, 'u_subPriceAlpha'),
      uniforms.subPriceAlpha
    );
    gl.uniform1f(
      gl.getUniformLocation(this.program, 'u_subTimeAlpha'),
      uniforms.subTimeAlpha
    );
    gl.uniform4f(
      gl.getUniformLocation(this.program, 'u_gridColor'),
      uniforms.gridColor[0],
      uniforms.gridColor[1],
      uniforms.gridColor[2],
      uniforms.gridColor[3]
    );
  }

  public syncViewportAndScale(
    params: GridCalculationParams,
    calculated: GridStepsResult,
    gridColor: [number, number, number, number] = [0.2, 0.2, 0.2, 1.0]
  ): void {
    this.updateUniforms({
      resolution: [params.viewport.width, params.viewport.height],
      priceRange: [params.priceRange.min, params.priceRange.max],
      timeRange: [params.timeRange.min, params.timeRange.max],
      priceStep: calculated.priceStep,
      timeStep: calculated.timeStep,
      subPriceAlpha: calculated.subPriceAlpha,
      subTimeAlpha: calculated.subTimeAlpha,
      gridColor
    });
  }

  private initProgram(): WebGLProgram {
    const gl = this.gl;
    const vsType = (gl as unknown as { VERTEX_SHADER?: number }).VERTEX_SHADER ?? 0x8b31;
    const fsType = (gl as unknown as { FRAGMENT_SHADER?: number }).FRAGMENT_SHADER ?? 0x8b30;

    const vs = gl.createShader(vsType)!;
    gl.shaderSource(vs, GRID_VERTEX_SHADER);
    gl.compileShader(vs);

    const fs = gl.createShader(fsType)!;
    gl.shaderSource(fs, GRID_FRAGMENT_SHADER);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    return program;
  }
}