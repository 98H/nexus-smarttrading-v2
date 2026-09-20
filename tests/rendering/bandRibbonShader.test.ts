import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  BandRibbonShader,
  bandRibbonVertexShader,
  bandRibbonFragmentShader,
  generateRibbonGeometry,
  type BandRibbonUniforms,
  type VolatilityPoint,
} from '../../src/rendering/shaders/bandRibbonShader.js';

import {
  SignalMarkerRenderer,
  type SignalMarker,
  type ViewportState,
  type MarkerInstanceData,
} from '../../src/rendering/markers/SignalMarkerRenderer.js';

import {
  LuxAlgoOverlayLayer,
  type LuxAlgoData,
  type VolatilityBands,
} from '../../src/rendering/layers/LuxAlgoOverlayLayer.js';

// --- Test Utilities & Minimal WebGL Mock Factory ---

interface WebGLCallRecord {
  method: string;
  args: any[];
}

function createMockWebGLContext() {
  const calls: WebGLCallRecord[] = [];
  const buffers = new Map<number, any>();
  const uniforms = new Map<string, any>();
  let bufferIdCounter = 1;
  let programIdCounter = 100;
  let shaderIdCounter = 200;

  return {
    calls,
    uniforms,
    // Constants
    TRIANGLES: 0x0004,
    TRIANGLE_STRIP: 0x0005,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406,
    COLOR_BUFFER_BIT: 0x00004000,

    createProgram: () => ({ id: programIdCounter++ }),
    createShader: (type: number) => ({ id: shaderIdCounter++, type }),
    shaderSource: (shader: any, source: string) => {
      calls.push({ method: 'shaderSource', args: [shader, source] });
    },
    compileShader: (shader: any) => {
      calls.push({ method: 'compileShader', args: [shader] });
    },
    getShaderParameter: () => true,
    attachShader: (program: any, shader: any) => {
      calls.push({ method: 'attachShader', args: [program, shader] });
    },
    linkProgram: (program: any) => {
      calls.push({ method: 'linkProgram', args: [program] });
    },
    getProgramParameter: () => true,
    useProgram: (program: any) => {
      calls.push({ method: 'useProgram', args: [program] });
    },
    createBuffer: () => {
      const id = bufferIdCounter++;
      const buffer = { id };
      buffers.set(id, buffer);
      return buffer;
    },
    bindBuffer: (target: number, buffer: any) => {
      calls.push({ method: 'bindBuffer', args: [target, buffer] });
    },
    bufferData: (target: number, data: BufferSource | null, usage: number) => {
      calls.push({ method: 'bufferData', args: [target, data, usage] });
    },
    getUniformLocation: (_program: any, name: string) => ({ name }),
    getAttribLocation: (_program: any, name: string) => 1,
    enableVertexAttribArray: (index: number) => {
      calls.push({ method: 'enableVertexAttribArray', args: [index] });
    },
    vertexAttribPointer: (...args: any[]) => {
      calls.push({ method: 'vertexAttribPointer', args });
    },
    uniform4fv: (loc: { name: string }, value: Float32Array | number[]) => {
      uniforms.set(loc.name, Array.from(value));
      calls.push({ method: 'uniform4fv', args: [loc.name, Array.from(value)] });
    },
    uniform1f: (loc: { name: string }, value: number) => {
      uniforms.set(loc.name, value);
      calls.push({ method: 'uniform1f', args: [loc.name, value] });
    },
    uniform2f: (loc: { name: string }, x: number, y: number) => {
      uniforms.set(loc.name, [x, y]);
      calls.push({ method: 'uniform2f', args: [loc.name, x, y] });
    },
    uniformMatrix4fv: (loc: { name: string }, transpose: boolean, matrix: Float32Array | number[]) => {
      uniforms.set(loc.name, Array.from(matrix));
      calls.push({ method: 'uniformMatrix4fv', args: [loc.name, transpose, Array.from(matrix)] });
    },
    drawArrays: (mode: number, first: number, count: number) => {
      calls.push({ method: 'drawArrays', args: [mode, first, count] });
    },
    viewport: (x: number, y: number, width: number, height: number) => {
      calls.push({ method: 'viewport', args: [x, y, width, height] });
    },
    enable: (cap: number) => {
      calls.push({ method: 'enable', args: [cap] });
    },
    blendFunc: (sfactor: number, dfactor: number) => {
      calls.push({ method: 'blendFunc', args: [sfactor, dfactor] });
    },
  } as unknown as WebGLRenderingContext & { calls: WebGLCallRecord[]; uniforms: Map<string, any> };
}

// --- Acceptance Criteria 1 & 2: Dynamic Band Ribbon Shader Tests ---

describe('BandRibbonShader (Acceptance Criteria 2: Dynamic Volatility Ribbon Gradient Shaders)', () => {
  let gl: ReturnType<typeof createMockWebGLContext>;
  let shader: BandRibbonShader;

  beforeEach(() => {
    gl = createMockWebGLContext();
    shader = new BandRibbonShader(gl);
  });

  it('should define vertex and fragment shader sources containing color gradient interpolation logic', () => {
    assert.ok(bandRibbonVertexShader.includes('attribute vec2 a_position') ||
              bandRibbonVertexShader.includes('in vec2 a_position'),
              'Vertex shader must declare position attribute');
    assert.ok(bandRibbonVertexShader.includes('v_bandFactor') ||
              bandRibbonVertexShader.includes('v_uv'),
              'Vertex shader must export interpolation varying to fragment shader');

    assert.ok(bandRibbonFragmentShader.includes('u_upperColor'),
              'Fragment shader must declare u_upperColor uniform');
    assert.ok(bandRibbonFragmentShader.includes('u_lowerColor'),
              'Fragment shader must declare u_lowerColor uniform');
    assert.ok(bandRibbonFragmentShader.includes('mix('),
              'Fragment shader must use mix() for smooth color interpolation between upper and lower bands');
  });

  it('should generate triangle strip vertex geometry connecting upper and lower volatility bands', () => {
    const upper: VolatilityPoint[] = [
      { timestamp: 1000, value: 110 },
      { timestamp: 2000, value: 115 },
      { timestamp: 3000, value: 120 },
    ];
    const lower: VolatilityPoint[] = [
      { timestamp: 1000, value: 90 },
      { timestamp: 2000, value: 92 },
      { timestamp: 3000, value: 95 },
    ];

    // Format per vertex: [x, y, bandFactor] where bandFactor: 1.0 for upper, 0.0 for lower
    const vertexData = generateRibbonGeometry(upper, lower);
    assert.ok(vertexData instanceof Float32Array, 'Geometry must return a Float32Array');

    // 3 points on upper + 3 on lower in TRIANGLE_STRIP produces 6 vertices
    // 3 attributes per vertex: x (timestamp), y (price), factor (0.0 or 1.0)
    const stride = 3;
    assert.strictEqual(vertexData.length, upper.length * 2 * stride);

    // Assert alternating pairs: upper (1.0 factor) then lower (0.0 factor)
    for (let i = 0; i < upper.length; i++) {
      const upperVertexOffset = i * 2 * stride;
      const lowerVertexOffset = upperVertexOffset + stride;

      assert.strictEqual(vertexData[upperVertexOffset], upper[i].timestamp);
      assert.strictEqual(vertexData[upperVertexOffset + 1], upper[i].value);
      assert.strictEqual(vertexData[upperVertexOffset + 2], 1.0, 'Upper band factor should be 1.0');

      assert.strictEqual(vertexData[lowerVertexOffset], lower[i].timestamp);
      assert.strictEqual(vertexData[lowerVertexOffset + 1], lower[i].value);
      assert.strictEqual(vertexData[lowerVertexOffset + 2], 0.0, 'Lower band factor should be 0.0');
    }
  });

  it('should update shader uniforms for upper and lower band colors with smooth volatility factor', () => {
    const uniforms: BandRibbonUniforms = {
      upperColor: [0.0, 1.0, 0.4, 0.8], // Bullish ribbon edge
      lowerColor: [1.0, 0.2, 0.2, 0.8], // Bearish ribbon edge
      volatilityMultiplier: 1.45,
      opacity: 0.65,
    };

    shader.setUniforms(uniforms);

    const upperVal = gl.uniforms.get('u_upperColor');
    const lowerVal = gl.uniforms.get('u_lowerColor');
    const volVal = gl.uniforms.get('u_volatilityMultiplier');
    const opacityVal = gl.uniforms.get('u_opacity');

    assert.deepStrictEqual(upperVal, [0.0, 1.0, 0.4, 0.8]);
    assert.deepStrictEqual(lowerVal, [1.0, 0.2, 0.2, 0.8]);
    assert.strictEqual(volVal, 1.45);
    assert.strictEqual(opacityVal, 0.65);
  });

  it('should throw an assertion error when band data arrays have mismatched lengths', () => {
    const upper: VolatilityPoint[] = [{ timestamp: 1000, value: 110 }];
    const lower: VolatilityPoint[] = [
      { timestamp: 1000, value: 90 },
      { timestamp: 2000, value: 92 },
    ];

    assert.throws(
      () => generateRibbonGeometry(upper, lower),
      /Array lengths of upper and lower bands must match/
    );
  });
});

// --- Acceptance Criteria 3: Directional Buy/Sell Marker Renderer Tests ---

describe('SignalMarkerRenderer (Acceptance Criteria 3: Screen-Space Scale & Orientation)', () => {
  let gl: ReturnType<typeof createMockWebGLContext>;
  let markerRenderer: SignalMarkerRenderer;

  beforeEach(() => {
    gl = createMockWebGLContext();
    markerRenderer = new SignalMarkerRenderer(gl, { basePixelSize: 16 });
  });

  it('should assign correct directional orientation angles (Buy: UP=0, Sell: DOWN=Math.PI)', () => {
    const signals: SignalMarker[] = [
      { id: 'sig-1', type: 'BUY', timestamp: 1000, price: 100 },
      { id: 'sig-2', type: 'SELL', timestamp: 1500, price: 105 },
    ];

    const instanceData = markerRenderer.buildMarkerInstances(signals);

    // Expected instance struct: [worldX, worldY, rotationAngle, typeCode, colorR, colorG, colorB, colorA]
    const buyInstance = instanceData.find((inst: MarkerInstanceData) => inst.id === 'sig-1');
    const sellInstance = instanceData.find((inst: MarkerInstanceData) => inst.id === 'sig-2');

    assert.ok(buyInstance, 'Buy instance must exist');
    assert.ok(sellInstance, 'Sell instance must exist');

    assert.strictEqual(buyInstance.rotationAngle, 0, 'BUY marker must point upwards (0 radians)');
    assert.strictEqual(sellInstance.rotationAngle, Math.PI, 'SELL marker must point downwards (PI radians)');
  });

  it('should maintain invariant screen-space pixel scale regardless of viewport zoom level', () => {
    const marker: SignalMarker = { id: 'sig-zoom', type: 'BUY', timestamp: 2000, price: 150 };

    const standardViewport: ViewportState = {
      zoomX: 1.0,
      zoomY: 1.0,
      panX: 0,
      panY: 0,
      screenWidth: 1920,
      screenHeight: 1080,
    };

    const zoomedViewport: ViewportState = {
      zoomX: 4.5,
      zoomY: 3.2,
      panX: -250,
      panY: 100,
      screenWidth: 1920,
      screenHeight: 1080,
    };

    const transformStandard = markerRenderer.calculateMarkerTransform(marker, standardViewport);
    const transformZoomed = markerRenderer.calculateMarkerTransform(marker, zoomedViewport);

    // Compute effective screen scale: worldScale * zoom should equal fixed basePixelSize
    const effectivePixelWidthStd = transformStandard.worldScaleX * standardViewport.zoomX;
    const effectivePixelHeightStd = transformStandard.worldScaleY * standardViewport.zoomY;

    const effectivePixelWidthZoomed = transformZoomed.worldScaleX * zoomedViewport.zoomX;
    const effectivePixelHeightZoomed = transformZoomed.worldScaleY * zoomedViewport.zoomY;

    assert.ok(Math.abs(effectivePixelWidthStd - 16) < 1e-5, 'Standard zoom screen width should be 16px');
    assert.ok(Math.abs(effectivePixelHeightStd - 16) < 1e-5, 'Standard zoom screen height should be 16px');

    assert.ok(Math.abs(effectivePixelWidthZoomed - 16) < 1e-5, 'High zoom screen width must remain exactly 16px');
    assert.ok(Math.abs(effectivePixelHeightZoomed - 16) < 1e-5, 'High zoom screen height must remain exactly 16px');

    assert.strictEqual(
      effectivePixelWidthStd,
      effectivePixelWidthZoomed,
      'Effective screen size must not change during zoom'
    );
  });

  it('should compute screen positions properly offset by panning parameters', () => {
    const marker: SignalMarker = { id: 'sig-pan', type: 'SELL', timestamp: 500, price: 50 };

    const viewport1: ViewportState = {
      zoomX: 1.0,
      zoomY: 1.0,
      panX: 0,
      panY: 0,
      screenWidth: 1000,
      screenHeight: 500,
    };

    const viewport2: ViewportState = {
      zoomX: 1.0,
      zoomY: 1.0,
      panX: 120, // panned right by 120
      panY: -60, // panned down by 60
      screenWidth: 1000,
      screenHeight: 500,
    };

    const t1 = markerRenderer.calculateMarkerTransform(marker, viewport1);
    const t2 = markerRenderer.calculateMarkerTransform(marker, viewport2);

    assert.strictEqual(t2.screenX - t1.screenX, 120, 'Screen X coordinate must reflect pan offset');
    assert.strictEqual(t2.screenY - t1.screenY, -60, 'Screen Y coordinate must reflect pan offset');
  });
});

// --- Acceptance Criteria 1: Integrated Overlay Layer Execution on Market Tick ---

describe('LuxAlgoOverlayLayer (Acceptance Criteria 1: Market Tick Real-Time Rendering)', () => {
  let gl: ReturnType<typeof createMockWebGLContext>;
  let overlayLayer: LuxAlgoOverlayLayer;

  const mockViewport: ViewportState = {
    zoomX: 1.0,
    zoomY: 1.0,
    panX: 0,
    panY: 0,
    screenWidth: 800,
    screenHeight: 600,
  };

  const sampleVolatilityBands: VolatilityBands = {
    upper: [
      { timestamp: 100, value: 50 },
      { timestamp: 200, value: 55 },
    ],
    lower: [
      { timestamp: 100, value: 40 },
      { timestamp: 200, value: 42 },
    ],
    basis: [
      { timestamp: 100, value: 45 },
      { timestamp: 200, value: 48 },
    ],
  };

  const sampleSignals: SignalMarker[] = [
    { id: 'sig-1', type: 'BUY', timestamp: 100, price: 41 },
    { id: 'sig-2', type: 'SELL', timestamp: 200, price: 54 },
  ];

  beforeEach(() => {
    gl = createMockWebGLContext();
    overlayLayer = new LuxAlgoOverlayLayer(gl);
  });

  it('should update internal state and rebuild buffers on incoming market tick data', () => {
    const tickData: LuxAlgoData = {
      timestamp: 200,
      bands: sampleVolatilityBands,
      signals: sampleSignals,
    };

    overlayLayer.updateOnTick(tickData);

    assert.strictEqual(overlayLayer.hasData(), true);
    assert.strictEqual(overlayLayer.getSignalCount(), 2);
    assert.strictEqual(overlayLayer.getBandSegmentCount(), 2);

    // Buffer data must be uploaded to WebGL
    const bufferDataCalls = gl.calls.filter((c: WebGLCallRecord) => c.method === 'bufferData');
    assert.ok(bufferDataCalls.length >= 2, 'Buffer data should be populated for both ribbons and markers');
  });

  it('should execute complete draw pipeline for ribbons and directional markers on render()', () => {
    overlayLayer.updateOnTick({
      timestamp: 200,
      bands: sampleVolatilityBands,
      signals: sampleSignals,
    });

    gl.calls.length = 0; // Reset call log before render cycle

    overlayLayer.render(mockViewport);

    // Check program binding
    const useProgramCalls = gl.calls.filter((c: WebGLCallRecord) => c.method === 'useProgram');
    assert.ok(useProgramCalls.length >= 2, 'Render cycle must activate ribbon program and marker program');

    // Check viewport setup
    const viewportCall = gl.calls.find((c: WebGLCallRecord) => c.method === 'viewport');
    assert.ok(viewportCall, 'gl.viewport must be configured during render');
    assert.deepStrictEqual(viewportCall.args, [0, 0, mockViewport.screenWidth, mockViewport.screenHeight]);

    // Check draw calls: TRIANGLE_STRIP for ribbon, and marker draw call
    const drawCalls = gl.calls.filter((c: WebGLCallRecord) => c.method === 'drawArrays');
    assert.ok(drawCalls.length >= 2, 'Should issue draw calls for both band ribbons and markers');

    const ribbonDraw = drawCalls[0];
    assert.strictEqual(ribbonDraw.args[0], gl.TRIANGLE_STRIP, 'Ribbon must be drawn using TRIANGLE_STRIP');
    assert.strictEqual(ribbonDraw.args[2], 4, 'Ribbon should draw 4 vertices for 2 time segments');
  });

  it('should handle zero-signal edge case gracefully without throwing or issuing invalid draw calls', () => {
    overlayLayer.updateOnTick({
      timestamp: 200,
      bands: sampleVolatilityBands,
      signals: [], // No signals on this market tick
    });

    assert.doesNotThrow(() => {
      overlayLayer.render(mockViewport);
    });

    // Only ribbon draw call should be emitted, not marker draw
    const drawCalls = gl.calls.filter((c: WebGLCallRecord) => c.method === 'drawArrays');
    assert.strictEqual(drawCalls.length, 1, 'Only ribbon geometry should be drawn when signal markers are empty');
  });

  it('should correctly update dynamic ribbon gradient uniforms when market volatility expands', () => {
    const expandedVolatilityBands: VolatilityBands = {
      upper: [
        { timestamp: 100, value: 80 }, // Expanded range (spread: 50)
        { timestamp: 200, value: 90 },
      ],
      lower: [
        { timestamp: 100, value: 30 },
        { timestamp: 200, value: 25 },
      ],
      basis: [
        { timestamp: 100, value: 55 },
        { timestamp: 200, value: 57 },
      ],
    };

    overlayLayer.updateOnTick({
      timestamp: 200,
      bands: expandedVolatilityBands,
      signals: sampleSignals,
    });

    overlayLayer.render(mockViewport);

    const uniformCalls = gl.calls.filter((c: WebGLCallRecord) => c.method === 'uniform4fv');
    assert.ok(uniformCalls.length > 0, 'Color gradient uniforms must be dispatched during render');
  });
});