import {
  CANDLE_VERTEX_SHADER,
  CANDLE_FRAGMENT_SHADER,
  createCandleProgram,
} from './candleShaders.ts';

/**
 * Candle data tuple representation:
 * [timestamp, open, high, low, close, volume]
 */
export type CandleData = [
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
];

const GL_ARRAY_BUFFER = 0x8892;
const GL_STATIC_DRAW = 0x88e4;
const GL_DYNAMIC_DRAW = 0x88e8;
const GL_FLOAT = 0x1406;
const GL_TRIANGLES = 0x0004;

const FLOATS_PER_CANDLE = 6;
const BYTES_PER_FLOAT = 4;
const INSTANCE_STRIDE = FLOATS_PER_CANDLE * BYTES_PER_FLOAT;
const VERTICES_PER_CANDLE = 12;

export class CandleRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private geometryBuffer: WebGLBuffer;
  private instanceBuffer: WebGLBuffer;
  private shaders: WebGLShader[] = [];
  private candleCount = 0;
  private instanceData: Float32Array = new Float32Array(0);
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) {
      throw new Error('WebGL2 is not supported in this environment');
    }

    this.gl = gl;
    this.canvas = canvas;

    // Create and link shaders
    this.program = createCandleProgram(gl, CANDLE_VERTEX_SHADER, CANDLE_FRAGMENT_SHADER);
    this.shaders = (this.program as unknown as { __shaders?: WebGLShader[] }).__shaders ?? [];

    // Create Vertex Array Object
    const vao = gl.createVertexArray();
    if (!vao) {
      throw new Error('Failed to create WebGL vertex array');
    }
    this.vao = vao;
    gl.bindVertexArray(this.vao);

    const arrayBuffer = gl.ARRAY_BUFFER ?? GL_ARRAY_BUFFER;
    const staticDraw = gl.STATIC_DRAW ?? GL_STATIC_DRAW;
    const glFloat = gl.FLOAT ?? GL_FLOAT;

    // Static geometry buffer: candle body quad (6 vertices) + wick quad (6 vertices) = 12 vertices
    const geometryBuffer = gl.createBuffer();
    if (!geometryBuffer) {
      throw new Error('Failed to create WebGL geometry buffer');
    }
    this.geometryBuffer = geometryBuffer;
    gl.bindBuffer(arrayBuffer, this.geometryBuffer);

    const meshVertices = new Float32Array([
      // Candle body quad
      -0.5, 0.0,
       0.5, 0.0,
      -0.5, 1.0,
      -0.5, 1.0,
       0.5, 0.0,
       0.5, 1.0,
      // Candle wick quad
      -0.05, 0.0,
       0.05, 0.0,
      -0.05, 1.0,
      -0.05, 1.0,
       0.05, 0.0,
       0.05, 1.0,
    ]);
    gl.bufferData(arrayBuffer, meshVertices, staticDraw);

    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    if (posLoc !== -1) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, glFloat, false, 0, 0);
    }

    // Dynamic instanced buffer
    const instanceBuffer = gl.createBuffer();
    if (!instanceBuffer) {
      throw new Error('Failed to create WebGL instance buffer');
    }
    this.instanceBuffer = instanceBuffer;
    gl.bindBuffer(arrayBuffer, this.instanceBuffer);

    const candleAttributes = [
      { name: 'a_timestamp', size: 1, offset: 0 * BYTES_PER_FLOAT },
      { name: 'a_open', size: 1, offset: 1 * BYTES_PER_FLOAT },
      { name: 'a_high', size: 1, offset: 2 * BYTES_PER_FLOAT },
      { name: 'a_low', size: 1, offset: 3 * BYTES_PER_FLOAT },
      { name: 'a_close', size: 1, offset: 4 * BYTES_PER_FLOAT },
      { name: 'a_volume', size: 1, offset: 5 * BYTES_PER_FLOAT },
    ];

    for (const attr of candleAttributes) {
      const loc = gl.getAttribLocation(this.program, attr.name);
      if (loc !== -1) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, attr.size, glFloat, false, INSTANCE_STRIDE, attr.offset);
        gl.vertexAttribDivisor(loc, 1);
      }
    }

    gl.bindVertexArray(null);
  }

  /**
   * Uploads candle data to the instanced buffer without reallocating WebGL buffers.
   */
  public setCandles(candles: CandleData[]): void {
    this.candleCount = candles.length;
    if (this.candleCount === 0) return;

    const totalFloats = this.candleCount * FLOATS_PER_CANDLE;
    if (this.instanceData.length < totalFloats) {
      this.instanceData = new Float32Array(totalFloats);
    }

    const data = this.instanceData;
    for (let i = 0; i < this.candleCount; i++) {
      const c = candles[i];
      const offset = i * FLOATS_PER_CANDLE;
      data[offset] = c[0];
      data[offset + 1] = c[1];
      data[offset + 2] = c[2];
      data[offset + 3] = c[3];
      data[offset + 4] = c[4];
      data[offset + 5] = c[5];
    }

    const arrayBuffer = this.gl.ARRAY_BUFFER ?? GL_ARRAY_BUFFER;
    const dynamicDraw = this.gl.DYNAMIC_DRAW ?? GL_DYNAMIC_DRAW;

    this.gl.bindBuffer(arrayBuffer, this.instanceBuffer);
    this.gl.bufferData(
      arrayBuffer,
      data.subarray(0, totalFloats),
      dynamicDraw
    );
  }

  /**
   * Renders the candlesticks using instanced drawing.
   */
  public render(): void {
    if (this.disposed || this.candleCount === 0) return;

    this.gl.useProgram(this.program);
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArraysInstanced(
      this.gl.TRIANGLES ?? GL_TRIANGLES,
      0,
      VERTICES_PER_CANDLE,
      this.candleCount
    );
  }

  /**
   * Disposes all allocated WebGL resources to prevent memory leaks.
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.geometryBuffer) {
      this.gl.deleteBuffer(this.geometryBuffer);
    }
    if (this.instanceBuffer) {
      this.gl.deleteBuffer(this.instanceBuffer);
    }
    if (this.vao) {
      this.gl.deleteVertexArray(this.vao);
    }
    for (const shader of this.shaders) {
      this.gl.deleteShader(shader);
    }
    this.shaders = [];

    if (this.program) {
      this.gl.deleteProgram(this.program);
    }
  }
}