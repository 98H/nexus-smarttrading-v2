import {
  BoxType,
  BoxDirection,
  BoundingBox,
  ColorPalette,
  ViewportTransform,
  DEFAULT_BOX_COLOR_PALETTE,
  RGBAColor,
} from '../types/boxes.js';

const FLOATS_PER_VERTEX = 6;
const VERTICES_PER_QUAD = 6;
const FLOATS_PER_QUAD = FLOATS_PER_VERTEX * VERTICES_PER_QUAD;

export class WebGLBoxRenderer {
  private gl: WebGLRenderingContext;
  private palette: ColorPalette;
  private boxes: BoundingBox[] = [];

  private program: WebGLProgram | null = null;
  private vertexShader: WebGLShader | null = null;
  private fragmentShader: WebGLShader | null = null;
  private buffer: WebGLBuffer | null = null;

  private aPositionLocation = -1;
  private aColorLocation = -1;
  private uProjectionLocation: WebGLUniformLocation | null = null;

  constructor(gl: WebGLRenderingContext, palette: ColorPalette = DEFAULT_BOX_COLOR_PALETTE) {
    this.gl = gl;
    this.palette = palette;
    this.initPipeline();
  }

  public setBoxes(boxes: BoundingBox[]): void {
    this.boxes = boxes;
  }

  public setColorPalette(palette: ColorPalette): void {
    this.palette = palette;
  }

  public getColorPalette(): ColorPalette {
    return this.palette;
  }

  public render(viewport: ViewportTransform): void {
    if (this.boxes.length === 0) {
      return;
    }

    this.gl.useProgram(this.program);
    this.gl.viewport(0, 0, viewport.width, viewport.height);

    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    const totalVertices = this.boxes.length * VERTICES_PER_QUAD;
    const vertexData = new Float32Array(this.boxes.length * FLOATS_PER_QUAD);

    let offset = 0;
    for (const box of this.boxes) {
      const x1 = viewport.timeToX(box.left);
      const x2 =
        box.mitigated && box.mitigationRight !== undefined
          ? viewport.timeToX(box.mitigationRight)
          : viewport.activeCanvasEdgeX;
      const y1 = viewport.priceToY(box.bottom);
      const y2 = viewport.priceToY(box.top);

      const [r, g, b, a] = this.resolveColor(box);

      // Triangle 1: (x1, y1), (x2, y1), (x1, y2)
      vertexData[offset++] = x1;
      vertexData[offset++] = y1;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;

      vertexData[offset++] = x2;
      vertexData[offset++] = y1;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;

      vertexData[offset++] = x1;
      vertexData[offset++] = y2;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;

      // Triangle 2: (x1, y2), (x2, y1), (x2, y2)
      vertexData[offset++] = x1;
      vertexData[offset++] = y2;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;

      vertexData[offset++] = x2;
      vertexData[offset++] = y1;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;

      vertexData[offset++] = x2;
      vertexData[offset++] = y2;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
      vertexData[offset++] = a;
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexData, this.gl.DYNAMIC_DRAW);

    if (this.uProjectionLocation) {
      const w = viewport.width || 1;
      const h = viewport.height || 1;
      const projectionMatrix = new Float32Array([
        2 / w, 0, 0, 0,
        0, 2 / h, 0, 0,
        0, 0, 1, 0,
        -1, -1, 0, 1,
      ]);
      this.gl.uniformMatrix4fv(this.uProjectionLocation, false, projectionMatrix);
    }

    const stride = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
    if (this.aPositionLocation !== -1) {
      this.gl.enableVertexAttribArray(this.aPositionLocation);
      this.gl.vertexAttribPointer(this.aPositionLocation, 2, this.gl.FLOAT, false, stride, 0);
    }

    if (this.aColorLocation !== -1) {
      this.gl.enableVertexAttribArray(this.aColorLocation);
      this.gl.vertexAttribPointer(
        this.aColorLocation,
        4,
        this.gl.FLOAT,
        false,
        stride,
        2 * Float32Array.BYTES_PER_ELEMENT
      );
    }

    this.gl.drawArrays(this.gl.TRIANGLES, 0, totalVertices);
  }

  public dispose(): void {
    if (this.buffer) {
      this.gl.deleteBuffer(this.buffer);
      this.buffer = null;
    }

    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }

    if (this.vertexShader) {
      this.gl.deleteShader(this.vertexShader);
      this.vertexShader = null;
    }

    if (this.fragmentShader) {
      this.gl.deleteShader(this.fragmentShader);
      this.fragmentShader = null;
    }
  }

  private resolveColor(box: BoundingBox): RGBAColor {
    if (box.type === BoxType.OrderBlock) {
      return box.direction === BoxDirection.Bullish
        ? this.palette.obBullish
        : this.palette.obBearish;
    }

    return box.direction === BoxDirection.Bullish
      ? this.palette.fvgBullish
      : this.palette.fvgBearish;
  }

  private initPipeline(): void {
    const vsSource = `
      attribute vec2 a_position;
      attribute vec4 a_color;
      uniform mat4 u_projection;
      varying vec4 v_color;

      void main() {
        gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
        v_color = a_color;
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec4 v_color;

      void main() {
        gl_FragColor = v_color;
      }
    `;

    this.vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vsSource);
    this.fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fsSource);

    const program = this.gl.createProgram();
    if (!program) {
      throw new Error('Failed to create WebGL program');
    }

    this.gl.attachShader(program, this.vertexShader);
    this.gl.attachShader(program, this.fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      throw new Error(`Failed to link WebGL program: ${info}`);
    }

    this.program = program;
    this.aPositionLocation = this.gl.getAttribLocation(program, 'a_position');
    this.aColorLocation = this.gl.getAttribLocation(program, 'a_color');
    this.uProjectionLocation = this.gl.getUniformLocation(program, 'u_projection');

    this.buffer = this.gl.createBuffer();
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error('Failed to create WebGL shader');
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Failed to compile WebGL shader: ${info}`);
    }

    return shader;
  }
}