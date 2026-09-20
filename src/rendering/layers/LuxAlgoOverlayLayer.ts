import {
  BandRibbonShader,
  generateRibbonGeometry,
  type BandRibbonUniforms,
  type VolatilityPoint,
} from '../shaders/bandRibbonShader.js';

import {
  SignalMarkerRenderer,
  type SignalMarker,
  type ViewportState,
} from '../markers/SignalMarkerRenderer.js';

export interface VolatilityBands {
  upper: VolatilityPoint[];
  lower: VolatilityPoint[];
  basis?: VolatilityPoint[];
}

export interface LuxAlgoData {
  timestamp: number;
  bands: VolatilityBands;
  signals: SignalMarker[];
}

export class LuxAlgoOverlayLayer {
  private gl: WebGLRenderingContext;
  private ribbonShader: BandRibbonShader;
  private markerRenderer: SignalMarkerRenderer;
  private ribbonBuffer: WebGLBuffer | null = null;

  private currentData: LuxAlgoData | null = null;
  private signalCount: number = 0;
  private bandSegmentCount: number = 0;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.ribbonShader = new BandRibbonShader(gl);
    this.markerRenderer = new SignalMarkerRenderer(gl);
    this.ribbonBuffer = gl.createBuffer();
  }

  public updateOnTick(data: LuxAlgoData): void {
    this.currentData = data;
    this.signalCount = data.signals ? data.signals.length : 0;

    if (data.bands && data.bands.upper && data.bands.lower && data.bands.upper.length > 0) {
      this.bandSegmentCount = data.bands.upper.length;
      const ribbonGeometry = generateRibbonGeometry(data.bands.upper, data.bands.lower);

      if (!this.ribbonBuffer) {
        this.ribbonBuffer = this.gl.createBuffer();
      }
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER ?? 0x8892, this.ribbonBuffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER ?? 0x8892,
        ribbonGeometry,
        this.gl.DYNAMIC_DRAW ?? 0x88e8
      );
    } else {
      this.bandSegmentCount = 0;
    }

    this.markerRenderer.setSignals(data.signals ?? []);
  }

  public hasData(): boolean {
    return this.currentData !== null;
  }

  public getSignalCount(): number {
    return this.signalCount;
  }

  public getBandSegmentCount(): number {
    return this.bandSegmentCount;
  }

  public render(viewport: ViewportState): void {
    if (!this.currentData) {
      return;
    }

    this.gl.viewport(0, 0, viewport.screenWidth, viewport.screenHeight);
    this.gl.enable(this.gl.BLEND ?? 0x0be2);
    this.gl.blendFunc(this.gl.SRC_ALPHA ?? 0x0302, this.gl.ONE_MINUS_SRC_ALPHA ?? 0x0303);

    // 1. Draw ribbon ribbons
    if (this.bandSegmentCount > 0 && this.ribbonBuffer) {
      this.ribbonShader.use();

      const uniforms: BandRibbonUniforms = {
        upperColor: [0.0, 1.0, 0.4, 0.8],
        lowerColor: [1.0, 0.2, 0.2, 0.8],
        volatilityMultiplier: this.calculateVolatilityMultiplier(),
        opacity: 0.65,
      };
      this.ribbonShader.setUniforms(uniforms);
      this.ribbonShader.setMatrix(this.calculateMatrix(viewport));

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER ?? 0x8892, this.ribbonBuffer);

      const stride = 3 * Float32Array.BYTES_PER_ELEMENT;
      const posLoc = this.ribbonShader.aPositionLoc;
      const factorLoc = this.ribbonShader.aBandFactorLoc;
      const floatType = this.gl.FLOAT ?? 0x1406;

      this.gl.enableVertexAttribArray(posLoc);
      this.gl.vertexAttribPointer(posLoc, 2, floatType, false, stride, 0);

      this.gl.enableVertexAttribArray(factorLoc);
      this.gl.vertexAttribPointer(factorLoc, 1, floatType, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

      this.gl.drawArrays(this.gl.TRIANGLE_STRIP ?? 0x0005, 0, this.bandSegmentCount * 2);
    }

    // 2. Draw directional signal markers
    this.markerRenderer.render(viewport);
  }

  private calculateVolatilityMultiplier(): number {
    if (!this.currentData || !this.currentData.bands || this.currentData.bands.upper.length === 0) {
      return 1.0;
    }

    const { upper, lower, basis } = this.currentData.bands;
    let totalSpread = 0;
    let totalBasis = 0;

    for (let i = 0; i < upper.length; i++) {
      totalSpread += Math.abs(upper[i].value - lower[i].value);
      const b = basis?.[i]?.value ?? (upper[i].value + lower[i].value) / 2;
      totalBasis += Math.abs(b);
    }

    const avgSpread = totalSpread / upper.length;
    const avgBasis = totalBasis / upper.length || 1;
    const spreadRatio = avgSpread / avgBasis;

    return Math.max(0.5, Math.min(3.0, 1.0 + spreadRatio * 2.0));
  }

  private calculateMatrix(viewport: ViewportState): Float32Array {
    const sx = (2.0 * viewport.zoomX) / viewport.screenWidth;
    const sy = (2.0 * viewport.zoomY) / viewport.screenHeight;
    const tx = (2.0 * viewport.panX) / viewport.screenWidth - 1.0;
    const ty = (2.0 * viewport.panY) / viewport.screenHeight - 1.0;

    const mat = new Float32Array(16);
    mat[0] = sx;
    mat[5] = sy;
    mat[10] = 1.0;
    mat[12] = tx;
    mat[13] = ty;
    mat[15] = 1.0;
    return mat;
  }
}