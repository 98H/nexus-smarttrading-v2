import { volumeVertexShader, volumeFragmentShader } from './shaders/volumeShaders.js';

export interface VolumeCandleData {
  x: number;
  width: number;
  open: number;
  close: number;
  volume: number;
}

export interface VolumeRendererOptions {
  upColor?: [number, number, number, number];
  downColor?: [number, number, number, number];
}

export interface VolumeViewport {
  viewportWidth: number;
  viewportHeight: number;
}

export class VolumeRenderer {
  private gl: WebGL2RenderingContext;
  private upColor: [number, number, number, number];
  private downColor: [number, number, number, number];

  private program: WebGLProgram | null = null;
  private vertexShader: WebGLShader | null = null;
  private fragmentShader: WebGLShader | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private uResolutionLoc: WebGLUniformLocation | null = null;

  private instanceCount = 0;

  constructor(gl: WebGL2RenderingContext, options?: VolumeRendererOptions) {
    this.gl = gl;
    this.upColor = options?.upColor ?? [0.1, 0.8, 0.2, 0.6];
    this.downColor = options?.downColor ?? [0.9, 0.1, 0.1, 0.6];

    this.initProgram();
    this.initBuffers();
  }

  private initProgram(): void {
    const gl = this.gl;

    const vs = this.createShader(gl.VERTEX_SHADER, volumeVertexShader);
    const fs = this.createShader(gl.FRAGMENT_SHADER, volumeFragmentShader);
    const program = gl.createProgram();

    if (!program) {
      throw new Error('Failed to create WebGL program');
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Failed to link volume shader program: ${info}`);
    }

    this.program = program;
    this.vertexShader = vs;
    this.fragmentShader = fs;
    this.uResolutionLoc = gl.getUniformLocation(program, 'u_resolution');
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error('Failed to create shader');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Failed to compile shader: ${info}`);
    }

    return shader;
  }

  private initBuffers(): void {
    const gl = this.gl;
    if (!this.program) return;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Create per-instance buffer first
    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);

    const stride = 7 * Float32Array.BYTES_PER_ELEMENT;

    const locX = gl.getAttribLocation(this.program, 'a_instance_x');
    if (locX !== -1) {
      gl.enableVertexAttribArray(locX);
      gl.vertexAttribPointer(locX, 1, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(locX, 1);
    }

    const locWidth = gl.getAttribLocation(this.program, 'a_instance_width');
    if (locWidth !== -1) {
      gl.enableVertexAttribArray(locWidth);
      gl.vertexAttribPointer(locWidth, 1, gl.FLOAT, false, stride, 1 * Float32Array.BYTES_PER_ELEMENT);
      gl.vertexAttribDivisor(locWidth, 1);
    }

    const locHeight = gl.getAttribLocation(this.program, 'a_instance_height');
    if (locHeight !== -1) {
      gl.enableVertexAttribArray(locHeight);
      gl.vertexAttribPointer(locHeight, 1, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
      gl.vertexAttribDivisor(locHeight, 1);
    }

    const locColor = gl.getAttribLocation(this.program, 'a_instance_color');
    if (locColor !== -1) {
      gl.enableVertexAttribArray(locColor);
      gl.vertexAttribPointer(locColor, 4, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
      gl.vertexAttribDivisor(locColor, 1);
    }

    // Create base unit quad mesh buffer: x in [-0.5, 0.5], y in [0.0, 1.0]
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const quadVertices = new Float32Array([
      -0.5, 0.0,
       0.5, 0.0,
      -0.5, 1.0,
       0.5, 1.0,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const locPos = gl.getAttribLocation(this.program, 'a_position');
    if (locPos !== -1) {
      gl.enableVertexAttribArray(locPos);
      gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
    }

    gl.bindVertexArray(null);
  }

  public setData(candles: VolumeCandleData[]): void {
    this.instanceCount = candles.length;

    if (candles.length === 0) {
      if (this.instanceBuffer) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(0), this.gl.DYNAMIC_DRAW);
      }
      return;
    }

    let maxVolume = 0;
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].volume > maxVolume) {
        maxVolume = candles[i].volume;
      }
    }

    const data = new Float32Array(candles.length * 7);
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const offset = i * 7;

      data[offset] = candle.x;
      data[offset + 1] = candle.width;
      // Volume height normalized to maximum 20% (0.2) of canvas height
      data[offset + 2] = maxVolume > 0 ? (candle.volume / maxVolume) * 0.2 : 0;

      // Upward/flat candle receives translucent green, downward receives translucent red
      const isUp = candle.close >= candle.open;
      const color = isUp ? this.upColor : this.downColor;
      data[offset + 3] = color[0];
      data[offset + 4] = color[1];
      data[offset + 5] = color[2];
      data[offset + 6] = color[3];
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.DYNAMIC_DRAW);
  }

  public render(viewport: VolumeViewport): void {
    const gl = this.gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (this.instanceCount === 0 || !this.program || !this.vao) {
      return;
    }

    gl.viewport(0, 0, viewport.viewportWidth, viewport.viewportHeight);
    gl.useProgram(this.program);

    if (this.uResolutionLoc) {
      gl.uniform2f(this.uResolutionLoc, viewport.viewportWidth, viewport.viewportHeight);
    }

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
  }

  public destroy(): void {
    const gl = this.gl;

    if (this.instanceBuffer) {
      gl.deleteBuffer(this.instanceBuffer);
      this.instanceBuffer = null;
    }
    if (this.quadBuffer) {
      gl.deleteBuffer(this.quadBuffer);
      this.quadBuffer = null;
    }
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
    if (this.vertexShader) {
      gl.deleteShader(this.vertexShader);
      this.vertexShader = null;
    }
    if (this.fragmentShader) {
      gl.deleteShader(this.fragmentShader);
      this.fragmentShader = null;
    }
  }
}