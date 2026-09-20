export type SignalType = 'BUY' | 'SELL';

export interface SignalMarker {
  id: string;
  type: SignalType;
  timestamp: number;
  price: number;
}

export interface ViewportState {
  zoomX: number;
  zoomY: number;
  panX: number;
  panY: number;
  screenWidth: number;
  screenHeight: number;
}

export interface MarkerInstanceData {
  id: string;
  worldX: number;
  worldY: number;
  rotationAngle: number;
  typeCode: number;
  colorR: number;
  colorG: number;
  colorB: number;
  colorA: number;
}

export interface MarkerTransform {
  screenX: number;
  screenY: number;
  worldScaleX: number;
  worldScaleY: number;
  rotationAngle: number;
}

export interface SignalMarkerRendererOptions {
  basePixelSize?: number;
}

const markerVertexShader = `
attribute vec2 a_localPos;
attribute vec2 a_worldPos;
attribute float a_rotation;
attribute vec4 a_color;

uniform vec2 u_viewportSize;
uniform vec2 u_pan;
uniform vec2 u_zoom;
uniform float u_basePixelSize;

varying vec4 v_color;

void main() {
    v_color = a_color;

    float cosR = cos(a_rotation);
    float sinR = sin(a_rotation);
    vec2 rotatedLocal = vec2(
        a_localPos.x * cosR - a_localPos.y * sinR,
        a_localPos.x * sinR + a_localPos.y * cosR
    );

    vec2 screenAnchor = a_worldPos * u_zoom + u_pan;
    vec2 screenPos = screenAnchor + rotatedLocal * u_basePixelSize;

    vec2 clipSpace = (screenPos / u_viewportSize) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
}
`;

const markerFragmentShader = `
precision mediump float;

varying vec4 v_color;

void main() {
    gl_FragColor = v_color;
}
`;

export class SignalMarkerRenderer {
  private gl: WebGLRenderingContext;
  public basePixelSize: number;
  private program: WebGLProgram;
  private buffer: WebGLBuffer | null = null;
  private signals: SignalMarker[] = [];
  private vertexCount: number = 0;

  constructor(gl: WebGLRenderingContext, options?: SignalMarkerRendererOptions) {
    this.gl = gl;
    this.basePixelSize = options?.basePixelSize ?? 16;
    this.program = this.initProgram();
    this.buffer = this.gl.createBuffer();
  }

  public buildMarkerInstances(signals: SignalMarker[]): MarkerInstanceData[] {
    return signals.map((signal) => {
      const isBuy = signal.type === 'BUY';
      return {
        id: signal.id,
        worldX: signal.timestamp,
        worldY: signal.price,
        rotationAngle: isBuy ? 0 : Math.PI,
        typeCode: isBuy ? 1 : 0,
        colorR: isBuy ? 0.0 : 1.0,
        colorG: isBuy ? 1.0 : 0.2,
        colorB: isBuy ? 0.4 : 0.2,
        colorA: 1.0,
      };
    });
  }

  public calculateMarkerTransform(marker: SignalMarker, viewport: ViewportState): MarkerTransform {
    const worldScaleX = this.basePixelSize / (viewport.zoomX || 1.0);
    const worldScaleY = this.basePixelSize / (viewport.zoomY || 1.0);
    const screenX = marker.timestamp * viewport.zoomX + viewport.panX;
    const screenY = marker.price * viewport.zoomY + viewport.panY;
    const rotationAngle = marker.type === 'BUY' ? 0 : Math.PI;

    return {
      screenX,
      screenY,
      worldScaleX,
      worldScaleY,
      rotationAngle,
    };
  }

  public setSignals(signals: SignalMarker[]): void {
    this.signals = signals;

    if (!this.buffer) {
      this.buffer = this.gl.createBuffer();
    }

    if (signals.length === 0) {
      this.vertexCount = 0;
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER ?? 0x8892, this.buffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER ?? 0x8892,
        new Float32Array(0),
        this.gl.DYNAMIC_DRAW ?? 0x88e8
      );
      return;
    }

    const instances = this.buildMarkerInstances(signals);
    const verticesPerMarker = 3;
    const stride = 9;
    const data = new Float32Array(signals.length * verticesPerMarker * stride);

    // Upward-pointing triangle base coordinates
    const localCoords = [
      [0.0, 0.5],
      [-0.5, -0.5],
      [0.5, -0.5],
    ];

    let offset = 0;
    for (const inst of instances) {
      for (let v = 0; v < verticesPerMarker; v++) {
        data[offset++] = localCoords[v][0];
        data[offset++] = localCoords[v][1];
        data[offset++] = inst.worldX;
        data[offset++] = inst.worldY;
        data[offset++] = inst.rotationAngle;
        data[offset++] = inst.colorR;
        data[offset++] = inst.colorG;
        data[offset++] = inst.colorB;
        data[offset++] = inst.colorA;
      }
    }

    this.vertexCount = signals.length * verticesPerMarker;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER ?? 0x8892, this.buffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER ?? 0x8892,
      data,
      this.gl.DYNAMIC_DRAW ?? 0x88e8
    );
  }

  public render(viewport: ViewportState): void {
    if (this.signals.length === 0 || this.vertexCount === 0 || !this.buffer) {
      return;
    }

    this.gl.useProgram(this.program);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER ?? 0x8892, this.buffer);

    const uViewportSize = this.gl.getUniformLocation(this.program, 'u_viewportSize');
    const uPan = this.gl.getUniformLocation(this.program, 'u_pan');
    const uZoom = this.gl.getUniformLocation(this.program, 'u_zoom');
    const uBasePixelSize = this.gl.getUniformLocation(this.program, 'u_basePixelSize');

    if (uViewportSize) {
      this.gl.uniform2f(uViewportSize, viewport.screenWidth, viewport.screenHeight);
    }
    if (uPan) {
      this.gl.uniform2f(uPan, viewport.panX, viewport.panY);
    }
    if (uZoom) {
      this.gl.uniform2f(uZoom, viewport.zoomX, viewport.zoomY);
    }
    if (uBasePixelSize) {
      this.gl.uniform1f(uBasePixelSize, this.basePixelSize);
    }

    const stride = 9 * Float32Array.BYTES_PER_ELEMENT;
    const aLocalPos = this.gl.getAttribLocation(this.program, 'a_localPos');
    const aWorldPos = this.gl.getAttribLocation(this.program, 'a_worldPos');
    const aRotation = this.gl.getAttribLocation(this.program, 'a_rotation');
    const aColor = this.gl.getAttribLocation(this.program, 'a_color');

    const floatType = this.gl.FLOAT ?? 0x1406;

    this.gl.enableVertexAttribArray(aLocalPos);
    this.gl.vertexAttribPointer(aLocalPos, 2, floatType, false, stride, 0);

    this.gl.enableVertexAttribArray(aWorldPos);
    this.gl.vertexAttribPointer(aWorldPos, 2, floatType, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    this.gl.enableVertexAttribArray(aRotation);
    this.gl.vertexAttribPointer(aRotation, 1, floatType, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);

    this.gl.enableVertexAttribArray(aColor);
    this.gl.vertexAttribPointer(aColor, 4, floatType, false, stride, 5 * Float32Array.BYTES_PER_ELEMENT);

    this.gl.drawArrays(this.gl.TRIANGLES ?? 0x0004, 0, this.vertexCount);
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

    const vs = this.compileShader(vsType, markerVertexShader);
    const fs = this.compileShader(fsType, markerFragmentShader);

    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);

    return program;
  }
}