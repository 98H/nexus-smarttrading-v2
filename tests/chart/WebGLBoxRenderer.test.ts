import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { WebGLBoxRenderer } from '../../src/chart/renderers/WebGLBoxRenderer.js';
import {
  BoxType,
  BoxDirection,
  BoundingBox,
  ColorPalette,
  ViewportTransform,
  DEFAULT_BOX_COLOR_PALETTE,
} from '../../src/chart/types/boxes.js';

/**
 * Deterministic Mock for WebGLRenderingContext to test GPU draw pipeline,
 * buffer packing, and state machine transitions in a headless Node environment.
 */
function createMockWebGLContext() {
  const glConstants = {
    COLOR_BUFFER_BIT: 0x00004000,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    TRIANGLES: 0x0004,
    FLOAT: 0x1406,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
  };

  const enabledCapabilities = new Set<number>();
  let currentArrayBuffer: Float32Array | null = null;
  let blendFuncSource: number | null = null;
  let blendFuncDestination: number | null = null;
  const drawCalls: Array<{ mode: number; first: number; count: number }> = [];

  return {
    ...glConstants,
    enabledCapabilities,
    get currentArrayBuffer() {
      return currentArrayBuffer;
    },
    get blendFuncSource() {
      return blendFuncSource;
    },
    get blendFuncDestination() {
      return blendFuncDestination;
    },
    get drawCalls() {
      return drawCalls;
    },

    // WebGL API stubs
    enable: (cap: number) => {
      enabledCapabilities.add(cap);
    },
    disable: (cap: number) => {
      enabledCapabilities.delete(cap);
    },
    blendFunc: (sfactor: number, dfactor: number) => {
      blendFuncSource = sfactor;
      blendFuncDestination = dfactor;
    },
    createBuffer: () => ({ id: Symbol('buffer') }),
    bindBuffer: (_target: number, _buffer: unknown) => {},
    bufferData: (_target: number, data: BufferSource, _usage: number) => {
      if (data instanceof Float32Array) {
        currentArrayBuffer = new Float32Array(data);
      } else if (ArrayBuffer.isView(data)) {
        currentArrayBuffer = new Float32Array(
          data.buffer,
          data.byteOffset,
          data.byteLength / 4
        );
      }
    },
    createShader: (_type: number) => ({ id: Symbol('shader') }),
    shaderSource: (_shader: unknown, _source: string) => {},
    compileShader: (_shader: unknown) => {},
    getShaderParameter: (_shader: unknown, pname: number) => pname === glConstants.COMPILE_STATUS,
    getShaderInfoLog: (_shader: unknown) => '',
    createProgram: () => ({ id: Symbol('program') }),
    attachShader: (_program: unknown, _shader: unknown) => {},
    linkProgram: (_program: unknown) => {},
    getProgramParameter: (_program: unknown, pname: number) => pname === glConstants.LINK_STATUS,
    getProgramInfoLog: (_program: unknown) => '',
    useProgram: (_program: unknown) => {},
    getAttribLocation: (_program: unknown, _name: string) => 0,
    getUniformLocation: (_program: unknown, _name: string) => ({ id: Symbol('uniform') }),
    enableVertexAttribArray: (_index: number) => {},
    vertexAttribPointer: (
      _index: number,
      _size: number,
      _type: number,
      _normalized: boolean,
      _stride: number,
      _offset: number
    ) => {},
    uniformMatrix4fv: (_location: unknown, _transpose: boolean, _value: Float32List) => {},
    viewport: (_x: number, _y: number, _width: number, _height: number) => {},
    drawArrays: (mode: number, first: number, count: number) => {
      drawCalls.push({ mode, first, count });
    },
    deleteBuffer: (_buffer: unknown) => {},
    deleteProgram: (_program: unknown) => {},
    deleteShader: (_shader: unknown) => {},
  } as unknown as WebGLRenderingContext & {
    enabledCapabilities: Set<number>;
    currentArrayBuffer: Float32Array | null;
    blendFuncSource: number | null;
    blendFuncDestination: number | null;
    drawCalls: Array<{ mode: number; first: number; count: number }>;
  };
}

/**
 * Simple identity viewport transform for deterministic calculation assertions
 */
function createMockViewport(overrides?: Partial<ViewportTransform>): ViewportTransform {
  return {
    width: 800,
    height: 600,
    activeCanvasEdgeX: 800,
    timeToX: (time: number) => time,
    priceToY: (price: number) => price,
    ...overrides,
  };
}

describe('Story 3.3.1: WebGL Order Block & FVG Box Renderer', () => {
  let mockGl: ReturnType<typeof createMockWebGLContext>;
  let renderer: WebGLBoxRenderer;

  beforeEach(() => {
    mockGl = createMockWebGLContext();
    renderer = new WebGLBoxRenderer(mockGl);
  });

  describe('Color Palettes & Transparency Specifications', () => {
    it('should define distinct semi-transparent default palettes for OB and FVG categories', () => {
      const palette: ColorPalette = DEFAULT_BOX_COLOR_PALETTE;

      // Assert semi-transparency (alpha must be > 0 and < 1.0)
      const colorKeys: Array<keyof ColorPalette> = [
        'obBullish',
        'obBearish',
        'fvgBullish',
        'fvgBearish',
      ];

      for (const key of colorKeys) {
        const [r, g, b, a] = palette[key];
        assert.ok(
          a > 0 && a < 1.0,
          `Expected ${key} alpha to be semi-transparent (0 < a < 1), got a=${a}`
        );
        assert.ok(
          r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1,
          `Color channels for ${key} must be normalized in range [0, 1]`
        );
      }

      // Assert OB and FVG distinct palettes
      assert.notDeepEqual(
        palette.obBullish,
        palette.fvgBullish,
        'OB Bullish color must differ from FVG Bullish color'
      );
      assert.notDeepEqual(
        palette.obBearish,
        palette.fvgBearish,
        'OB Bearish color must differ from FVG Bearish color'
      );
      assert.notDeepEqual(
        palette.obBullish,
        palette.obBearish,
        'OB Bullish and Bearish colors must differ'
      );
      assert.notDeepEqual(
        palette.fvgBullish,
        palette.fvgBearish,
        'FVG Bullish and Bearish colors must differ'
      );
    });

    it('should configure WebGL state for alpha blending upon rendering', () => {
      const viewport = createMockViewport();
      renderer.setBoxes([
        {
          id: 'ob-1',
          type: BoxType.OrderBlock,
          direction: BoxDirection.Bullish,
          top: 150,
          bottom: 100,
          left: 50,
          mitigated: false,
        },
      ]);

      renderer.render(viewport);

      // Verify blending is enabled
      assert.ok(
        mockGl.enabledCapabilities.has(mockGl.BLEND),
        'gl.BLEND capability must be enabled for semi-transparent quads'
      );

      // Verify standard alpha blending function
      assert.strictEqual(
        mockGl.blendFuncSource,
        mockGl.SRC_ALPHA,
        'Source blend factor must be SRC_ALPHA'
      );
      assert.strictEqual(
        mockGl.blendFuncDestination,
        mockGl.ONE_MINUS_SRC_ALPHA,
        'Destination blend factor must be ONE_MINUS_SRC_ALPHA'
      );
    });

    it('should pack correct distinct vertex colors for OB vs FVG in the vertex buffer', () => {
      const boxes: BoundingBox[] = [
        {
          id: 'ob-bull',
          type: BoxType.OrderBlock,
          direction: BoxDirection.Bullish,
          top: 100,
          bottom: 50,
          left: 10,
          mitigated: false,
        },
        {
          id: 'fvg-bull',
          type: BoxType.FairValueGap,
          direction: BoxDirection.Bullish,
          top: 80,
          bottom: 60,
          left: 10,
          mitigated: false,
        },
      ];

      renderer.setBoxes(boxes);
      renderer.render(createMockViewport());

      const buffer = mockGl.currentArrayBuffer;
      assert.ok(buffer !== null, 'Vertex buffer data must be loaded to GPU');

      // 2 triangles per box = 6 vertices. Stride is at least 6 floats: [x, y, r, g, b, a]
      const floatsPerVertex = 6;
      const verticesPerQuad = 6;
      const floatsPerBox = floatsPerVertex * verticesPerQuad;

      assert.strictEqual(
        buffer.length,
        boxes.length * floatsPerBox,
        `Expected buffer length to be ${boxes.length * floatsPerBox} for 2 quads`
      );

      // Extract colors for the first vertex of Box 1 (OB) and Box 2 (FVG)
      const obColor = Array.from(buffer.slice(2, 6));
      const fvgColor = Array.from(buffer.slice(floatsPerBox + 2, floatsPerBox + 6));

      assert.deepEqual(
        obColor,
        DEFAULT_BOX_COLOR_PALETTE.obBullish,
        'OB vertex color should match DEFAULT_BOX_COLOR_PALETTE.obBullish'
      );
      assert.deepEqual(
        fvgColor,
        DEFAULT_BOX_COLOR_PALETTE.fvgBullish,
        'FVG vertex color should match DEFAULT_BOX_COLOR_PALETTE.fvgBullish'
      );
      assert.notDeepEqual(
        obColor,
        fvgColor,
        'OB and FVG rendered quads must have distinct color values in vertex attributes'
      );
    });
  });

  describe('Timeline Mitigation Extent Specifications', () => {
    it('should terminate the quadrilateral exactly at mitigation timestamp for mitigated boxes', () => {
      const mitigationTimestamp = 420;
      const leftTimestamp = 100;
      const canvasEdgeX = 800;

      const mitigatedBox: BoundingBox = {
        id: 'ob-mitigated',
        type: BoxType.OrderBlock,
        direction: BoxDirection.Bearish,
        top: 200,
        bottom: 180,
        left: leftTimestamp,
        mitigated: true,
        mitigationRight: mitigationTimestamp,
      };

      const viewport = createMockViewport({
        activeCanvasEdgeX: canvasEdgeX,
        timeToX: (t: number) => t * 1.5,
        priceToY: (p: number) => p,
      });

      renderer.setBoxes([mitigatedBox]);
      renderer.render(viewport);

      const buffer = mockGl.currentArrayBuffer;
      assert.ok(buffer !== null, 'Buffer must be committed');

      const expectedLeftX = viewport.timeToX(leftTimestamp);
      const expectedRightX = viewport.timeToX(mitigationTimestamp);

      // Collect all X-coordinates across the 6 vertices
      const floatsPerVertex = 6;
      const xCoords: number[] = [];
      for (let i = 0; i < 6; i++) {
        xCoords.push(buffer[i * floatsPerVertex]);
      }

      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);

      assert.strictEqual(minX, expectedLeftX, 'Quad left boundary must equal mapped start timestamp');
      assert.strictEqual(
        maxX,
        expectedRightX,
        'Quad right boundary must terminate at mapped mitigationRight timestamp'
      );
      assert.notStrictEqual(
        maxX,
        viewport.activeCanvasEdgeX,
        'Mitigated quad must not extend to active canvas edge'
      );
    });

    it('should extend the quadrilateral to active canvas edge if unmitigated', () => {
      const leftTimestamp = 150;
      const canvasEdgeX = 1250;

      const unmitigatedBox: BoundingBox = {
        id: 'fvg-unmitigated',
        type: BoxType.FairValueGap,
        direction: BoxDirection.Bullish,
        top: 300,
        bottom: 250,
        left: leftTimestamp,
        mitigated: false,
      };

      const viewport = createMockViewport({
        activeCanvasEdgeX: canvasEdgeX,
        timeToX: (t: number) => t * 2,
        priceToY: (p: number) => p,
      });

      renderer.setBoxes([unmitigatedBox]);
      renderer.render(viewport);

      const buffer = mockGl.currentArrayBuffer;
      assert.ok(buffer !== null, 'Buffer must be committed');

      const floatsPerVertex = 6;
      const xCoords: number[] = [];
      for (let i = 0; i < 6; i++) {
        xCoords.push(buffer[i * floatsPerVertex]);
      }

      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);

      assert.strictEqual(minX, viewport.timeToX(leftTimestamp), 'Quad starts at left timestamp');
      assert.strictEqual(
        maxX,
        canvasEdgeX,
        'Unmitigated quad must extend to the active canvas edge'
      );
    });

    it('should dynamically update unmitigated quad right boundary when activeCanvasEdge changes', () => {
      const unmitigatedBox: BoundingBox = {
        id: 'ob-streaming',
        type: BoxType.OrderBlock,
        direction: BoxDirection.Bullish,
        top: 100,
        bottom: 90,
        left: 50,
        mitigated: false,
      };

      renderer.setBoxes([unmitigatedBox]);

      // First tick / frame
      const initialViewport = createMockViewport({ activeCanvasEdgeX: 600 });
      renderer.render(initialViewport);

      let buffer = mockGl.currentArrayBuffer!;
      let xCoords = [buffer[0], buffer[6], buffer[12], buffer[18], buffer[24], buffer[30]];
      assert.strictEqual(Math.max(...xCoords), 600, 'Right boundary should match initial edge 600');

      // Next tick: timeline advances
      const updatedViewport = createMockViewport({ activeCanvasEdgeX: 750 });
      renderer.render(updatedViewport);

      buffer = mockGl.currentArrayBuffer!;
      xCoords = [buffer[0], buffer[6], buffer[12], buffer[18], buffer[24], buffer[30]];
      assert.strictEqual(
        Math.max(...xCoords),
        750,
        'Right boundary must dynamically update to 750 as canvas edge advances'
      );
    });
  });

  describe('Geometry Construction and Pipeline Execution', () => {
    it('should generate 2 triangles (6 vertices) per quadrilateral with valid quad topology', () => {
      const box: BoundingBox = {
        id: 'box-geom-test',
        type: BoxType.OrderBlock,
        direction: BoxDirection.Bearish,
        top: 500,
        bottom: 400,
        left: 100,
        mitigated: true,
        mitigationRight: 200,
      };

      const viewport = createMockViewport({
        timeToX: (t) => t,
        priceToY: (p) => p,
      });

      renderer.setBoxes([box]);
      renderer.render(viewport);

      const buffer = mockGl.currentArrayBuffer!;
      const floatsPerVertex = 6;
      const vertices: Array<[number, number]> = [];

      for (let i = 0; i < 6; i++) {
        vertices.push([buffer[i * floatsPerVertex], buffer[i * floatsPerVertex + 1]]);
      }

      // Expected bounding corners
      const x1 = 100;
      const x2 = 200;
      const y1 = 400; // bottom
      const y2 = 500; // top

      // Triangles: (x1, y1), (x2, y1), (x1, y2) and (x1, y2), (x2, y1), (x2, y2) or equivalent
      for (const [vx, vy] of vertices) {
        assert.ok(
          vx === x1 || vx === x2,
          `Vertex X (${vx}) must align with left (${x1}) or right (${x2})`
        );
        assert.ok(
          vy === y1 || vy === y2,
          `Vertex Y (${vy}) must align with bottom (${y1}) or top (${y2})`
        );
      }

      // Assert drawArrays called with gl.TRIANGLES and 6 vertices
      assert.strictEqual(mockGl.drawCalls.length, 1);
      assert.strictEqual(mockGl.drawCalls[0].mode, mockGl.TRIANGLES);
      assert.strictEqual(mockGl.drawCalls[0].first, 0);
      assert.strictEqual(mockGl.drawCalls[0].count, 6);
    });

    it('should bypass draw call when boxes array is empty', () => {
      renderer.setBoxes([]);
      renderer.render(createMockViewport());

      assert.strictEqual(
        mockGl.drawCalls.length,
        0,
        'Should not execute gl.drawArrays if no boxes are supplied'
      );
    });

    it('should correctly render multiple mixed OB and FVG boxes in a single batch draw', () => {
      const boxes: BoundingBox[] = [
        {
          id: 'ob-1',
          type: BoxType.OrderBlock,
          direction: BoxDirection.Bullish,
          top: 100,
          bottom: 90,
          left: 10,
          mitigated: true,
          mitigationRight: 40,
        },
        {
          id: 'ob-2',
          type: BoxType.OrderBlock,
          direction: BoxDirection.Bearish,
          top: 200,
          bottom: 190,
          left: 20,
          mitigated: false,
        },
        {
          id: 'fvg-1',
          type: BoxType.FairValueGap,
          direction: BoxDirection.Bullish,
          top: 300,
          bottom: 280,
          left: 15,
          mitigated: false,
        },
        {
          id: 'fvg-2',
          type: BoxType.FairValueGap,
          direction: BoxDirection.Bearish,
          top: 400,
          bottom: 390,
          left: 5,
          mitigated: true,
          mitigationRight: 25,
        },
      ];

      renderer.setBoxes(boxes);
      renderer.render(createMockViewport({ activeCanvasEdgeX: 1000 }));

      // 4 quads * 6 vertices = 24 vertices total
      assert.strictEqual(mockGl.drawCalls.length, 1);
      assert.strictEqual(mockGl.drawCalls[0].count, 24);

      const buffer = mockGl.currentArrayBuffer!;
      assert.strictEqual(buffer.length, 24 * 6);
    });

    it('should clean up WebGL GPU buffer resources on dispose', () => {
      let bufferDeleted = false;
      let programDeleted = false;

      mockGl.deleteBuffer = () => {
        bufferDeleted = true;
      };
      mockGl.deleteProgram = () => {
        programDeleted = true;
      };

      renderer.dispose();

      assert.ok(bufferDeleted, 'Vertex buffer should be deleted on renderer dispose');
      assert.ok(programDeleted, 'Shader program should be deleted on renderer dispose');
    });
  });
});