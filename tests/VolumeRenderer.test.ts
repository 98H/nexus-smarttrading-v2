import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  VolumeRenderer,
  type VolumeCandleData,
  type VolumeRendererOptions,
} from '../src/rendering/VolumeRenderer.js';
import {
  volumeVertexShader,
  volumeFragmentShader,
} from '../src/rendering/shaders/volumeShaders.js';

/**
 * Deterministic WebGL2 Test Context Mock
 * Records state changes, buffer data, and draw calls without mocking renderer logic.
 */
class MockWebGL2RenderingContext {
  // WebGL Constants
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly ARRAY_BUFFER = 0x8892;
  readonly STATIC_DRAW = 0x88e4;
  readonly DYNAMIC_DRAW = 0x88e8;
  readonly FLOAT = 0x1406;
  readonly TRIANGLES = 0x0004;
  readonly TRIANGLE_STRIP = 0x0005;
  readonly BLEND = 0x0be2;
  readonly SRC_ALPHA = 0x0302;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;

  public enabledCapabilities: Set<number> = new Set();
  public blendFuncState: { sfactor: number; dfactor: number } | null = null;
  public boundArrayBuffer: any = null;
  public boundVertexArray: any = null;
  public buffers: Map<any, { target: number; data: ArrayBufferView | null; usage: number }> = new Map();
  public vertexAttribs: Map<number, { size: number; type: number; normalized: boolean; stride: number; offset: number; divisor: number }> = new Map();
  public uniforms: Map<string, any> = new Map();
  public drawCalls: Array<{
    mode: number;
    first?: number;
    count?: number;
    instanceCount: number;
  }> = [];

  private nextId = 1;

  createShader(type: number) {
    return { id: this.nextId++, type, source: '' };
  }
  shaderSource(shader: any, source: string) {
    shader.source = source;
  }
  compileShader(_shader: any) {}
  getShaderParameter(_shader: any, pname: number) {
    if (pname === this.COMPILE_STATUS) return true;
    return true;
  }
  getShaderInfoLog(_shader: any) {
    return '';
  }
  deleteShader(_shader: any) {}

  createProgram() {
    return { id: this.nextId++, attachedShaders: [] as any[] };
  }
  attachShader(program: any, shader: any) {
    program.attachedShaders.push(shader);
  }
  linkProgram(_program: any) {}
  getProgramParameter(_program: any, pname: number) {
    if (pname === this.LINK_STATUS) return true;
    return true;
  }
  getProgramInfoLog(_program: any) {
    return '';
  }
  useProgram(_program: any) {}
  deleteProgram(_program: any) {}

  createBuffer() {
    const buffer = { id: this.nextId++ };
    this.buffers.set(buffer, { target: 0, data: null, usage: 0 });
    return buffer;
  }
  bindBuffer(target: number, buffer: any) {
    this.boundArrayBuffer = buffer;
    if (buffer && this.buffers.has(buffer)) {
      this.buffers.get(buffer)!.target = target;
    }
  }
  bufferData(target: number, data: ArrayBufferView, usage: number) {
    if (this.boundArrayBuffer && this.buffers.has(this.boundArrayBuffer)) {
      this.buffers.get(this.boundArrayBuffer)!.data = data;
      this.buffers.get(this.boundArrayBuffer)!.usage = usage;
    }
  }
  bufferSubData(_target: number, _offset: number, data: ArrayBufferView) {
    if (this.boundArrayBuffer && this.buffers.has(this.boundArrayBuffer)) {
      this.buffers.get(this.boundArrayBuffer)!.data = data;
    }
  }
  deleteBuffer(buffer: any) {
    this.buffers.delete(buffer);
  }

  createVertexArray() {
    return { id: this.nextId++ };
  }
  bindVertexArray(vao: any) {
    this.boundVertexArray = vao;
  }
  deleteVertexArray(_vao: any) {}

  enable(cap: number) {
    this.enabledCapabilities.add(cap);
  }
  disable(cap: number) {
    this.enabledCapabilities.delete(cap);
  }
  blendFunc(sfactor: number, dfactor: number) {
    this.blendFuncState = { sfactor, dfactor };
  }

  getAttribLocation(_program: any, name: string) {
    if (name === 'a_position') return 0;
    if (name === 'a_instance_x') return 1;
    if (name === 'a_instance_width') return 2;
    if (name === 'a_instance_height') return 3;
    if (name === 'a_instance_color') return 4;
    return 5;
  }
  enableVertexAttribArray(index: number) {
    if (!this.vertexAttribs.has(index)) {
      this.vertexAttribs.set(index, { size: 0, type: 0, normalized: false, stride: 0, offset: 0, divisor: 0 });
    }
  }
  vertexAttribPointer(index: number, size: number, type: number, normalized: boolean, stride: number, offset: number) {
    const attr = this.vertexAttribs.get(index) || { size, type, normalized, stride, offset, divisor: 0 };
    attr.size = size;
    attr.type = type;
    attr.normalized = normalized;
    attr.stride = stride;
    attr.offset = offset;
    this.vertexAttribs.set(index, attr);
  }
  vertexAttribDivisor(index: number, divisor: number) {
    const attr = this.vertexAttribs.get(index);
    if (attr) {
      attr.divisor = divisor;
    }
  }

  getUniformLocation(_program: any, name: string) {
    return { name };
  }
  uniform1f(location: any, v0: number) {
    this.uniforms.set(location.name, v0);
  }
  uniform2f(location: any, v0: number, v1: number) {
    this.uniforms.set(location.name, [v0, v1]);
  }
  uniform4f(location: any, v0: number, v1: number, v2: number, v3: number) {
    this.uniforms.set(location.name, [v0, v1, v2, v3]);
  }

  drawArraysInstanced(mode: number, first: number, count: number, instanceCount: number) {
    this.drawCalls.push({ mode, first, count, instanceCount });
  }

  viewport(_x: number, _y: number, _w: number, _h: number) {}
}

describe('Story 2.3.2: WebGL Instanced Volume Histogram', () => {
  let gl: MockWebGL2RenderingContext;

  beforeEach(() => {
    gl = new MockWebGL2RenderingContext();
  });

  describe('Shader Specifications (volumeShaders.ts)', () => {
    it('should define vertex shader using WebGL2 GLSL version 300 es', () => {
      assert.ok(typeof volumeVertexShader === 'string', 'Vertex shader must be an exported string');
      assert.ok(volumeVertexShader.includes('#version 300 es'), 'Vertex shader must use GLSL 3.00 ES');
    });

    it('should declare instanced attributes and position calculations in vertex shader', () => {
      assert.ok(
        volumeVertexShader.includes('a_position'),
        'Vertex shader must define base mesh vertex position attribute'
      );
      assert.ok(
        volumeVertexShader.includes('a_instance_x') || volumeVertexShader.includes('in float'),
        'Vertex shader must define instanced X center position'
      );
      assert.ok(
        volumeVertexShader.includes('a_instance_width') || volumeVertexShader.includes('width'),
        'Vertex shader must define instanced bar width'
      );
      assert.ok(
        volumeVertexShader.includes('a_instance_height') || volumeVertexShader.includes('height'),
        'Vertex shader must define instanced volume height'
      );
    });

    it('should constrain volume bars to the bottom 20% of canvas height in vertex shader or coordinate transformation', () => {
      /*
       * In Normalized Device Coordinates (NDC), Y spans from -1.0 to +1.0 (total height 2.0).
       * Bottom 20% corresponds to height 0.4 in NDC (from -1.0 to -0.6) or 0.2 in viewport fraction [0, 1].
       */
      const has20PercentConstraint =
        volumeVertexShader.includes('0.2') ||
        volumeVertexShader.includes('0.4') ||
        volumeVertexShader.includes('u_bottom_ratio') ||
        volumeVertexShader.includes('u_height_scale');

      assert.ok(
        has20PercentConstraint,
        'Vertex shader must calculate Y coordinates restricted within bottom 20% of viewport'
      );
    });

    it('should define fragment shader supporting translucent RGBA output', () => {
      assert.ok(typeof volumeFragmentShader === 'string', 'Fragment shader must be an exported string');
      assert.ok(volumeFragmentShader.includes('#version 300 es'), 'Fragment shader must use GLSL 3.00 ES');
      assert.ok(
        volumeFragmentShader.includes('out vec4') || volumeFragmentShader.includes('fragColor'),
        'Fragment shader must output a vec4 RGBA color'
      );
    });
  });

  describe('Instanced Volume Histogram Renderer (VolumeRenderer.ts)', () => {
    const sampleCandles: VolumeCandleData[] = [
      { x: 10, width: 6, open: 100, close: 105, volume: 500 },  // Upward (green)
      { x: 20, width: 6, open: 105, close: 105, volume: 250 },  // Equal/flat (green)
      { x: 30, width: 6, open: 105, close: 98,  volume: 1000 }, // Downward (red)
      { x: 40, width: 8, open: 98,  close: 102, volume: 750 },  // Upward with different width
    ];

    it('should enable alpha blending for translucency upon rendering', () => {
      const renderer = new VolumeRenderer(gl as unknown as WebGL2RenderingContext);
      renderer.setData(sampleCandles);
      renderer.render({ viewportWidth: 800, viewportHeight: 600 });

      assert.ok(
        gl.enabledCapabilities.has(gl.BLEND),
        'Renderer must enable WebGL blend capability for translucent bars'
      );
      assert.deepEqual(
        gl.blendFuncState,
        { sfactor: gl.SRC_ALPHA, dfactor: gl.ONE_MINUS_SRC_ALPHA },
        'Renderer must configure blendFunc to (SRC_ALPHA, ONE_MINUS_SRC_ALPHA)'
      );
    });

    it('should invoke instanced draw call with exact instance count matching candle count', () => {
      const renderer = new VolumeRenderer(gl as unknown as WebGL2RenderingContext);
      renderer.setData(sampleCandles);
      renderer.render({ viewportWidth: 800, viewportHeight: 600 });

      assert.equal(gl.drawCalls.length, 1, 'Exactly one instanced draw call should be performed per render');
      const drawCall = gl.drawCalls[0];
      assert.equal(
        drawCall.instanceCount,
        sampleCandles.length,
        `Instanced draw must draw ${sampleCandles.length} instances`
      );
    });

    it('should configure vertex attribute divisors for instancing (divisor = 1)', () => {
      const renderer = new VolumeRenderer(gl as unknown as WebGL2RenderingContext);
      renderer.setData(sampleCandles);

      // Verify at least one attribute has divisor === 1 (indicating per-instance data)
      const hasInstancedAttribute = Array.from(gl.vertexAttribs.values()).some(
        (attr) => attr.divisor === 1
      );

      assert.ok(
        hasInstancedAttribute,
        'Renderer must configure vertexAttribDivisor to 1 for per-instance attributes'
      );
    });

    it('should align volume bar horizontal center and width exactly to candlestick X-axis positioning (AC2)', () => {
      const renderer = new VolumeRenderer(gl as unknown as WebGL2RenderingContext);
      renderer.setData(sampleCandles);

      // Find instance buffer containing per-instance candle data
      let instanceData: Float32Array | null = null;
      for (const buffer of gl.buffers.values()) {
        if (buffer.data && buffer.data.byteLength >= sampleCandles.length * 4) {
          if (buffer.data instanceof Float32Array) {
            instanceData = buffer.data;
            break;
          }
        }
      }

      assert.ok(instanceData !== null, 'Instance buffer data must be uploaded as Float32Array');

      /*
       * Validate that each candle's x and width are accurately stored in the uploaded buffer.
       * Checking presence of every (x, width) pair in the uploaded Float32Array.
       */
      const floatList = Array.from(instanceData);
      for (const candle of sampleCandles) {
        const xIndex = floatList.indexOf(candle.x);
        assert.ok(
          xIndex !== -1,
          `Instance buffer must contain candle center x = ${candle.x}`
        );

        // Verify width is stored alongside x
        const widthNearX = floatList.slice(xIndex, xIndex + 8).includes(candle.width);
        assert.ok(
          widthNearX,
          `Instance buffer must contain matching width = ${candle.width} associated with candle x = ${candle.x}`
        );
      }
    });

    it('should assign translucent green for upward and equal price movements, and translucent red for downward movements (AC1)', () => {
      const renderer = new VolumeRenderer(gl as unknown as WebGL2RenderingContext, {
        upColor: [0.1, 0.8, 0.2, 0.6],    // Translucent green (R, G, B, A)
        downColor: [0.9, 0.1, 0.1, 0.6],  // Translucent red
      });

      renderer.setData(sampleCandles);

      let instanceData: Float32Array | null = null;
      for (const buffer of gl.buffers.values()) {
        if (buffer.data instanceof Float32Array && buffer.data.length >= sampleCandles.length * 4) {
          instanceData = buffer.data;
          break;
        }
      }

      assert.ok(instanceData !== null, 'Buffer must contain Float32 instance data');
      const floatList = Array.from(instanceData);

      // Candle 0: Upward (close 105 > open 100) => Translucent Green
      // Candle 1: Equal (close 105 === open 105) => Translucent Green
      // Candle 2: Downward (close 98 < open 105) => Translucent Red
      const upAlphaOccurrences = floatList.filter((v) => Math.abs(v - 0.6) < 1e-4);
      assert.ok(
        upAlphaOccurrences.length >= sampleCandles.length,
        'Every volume instance must contain translucent alpha value < 1.0 (e.g., 0.6)'
      );

      // Verify that upward color components (G=0.8) and downward color components (R=0.9) exist in the buffer
      const greenInstances = floatList.filter((v) => Math.abs(v - 0.8) < 1e-4);
      const redInstances = floatList.filter((v) => Math.abs(v - 0.9) < 1e-4);

      assert.equal(
        greenInstances.length,
        3,
        'Expected 3 translucent green volume bars (2 upward + 1 equal price movement)'
      );
      assert.equal(
        redInstances.length,
        1,
        'Expected 1 translucent red volume bar (1 downward price movement)'
      );
    });

    it('should scale volume bar heights so maximum volume occupies strictly <= 20% of canvas height (AC1)', () => {
      const canvasHeight = 500;
      const maxAllowedBarHeight = canvasHeight * 0.2; // 100 pixels (20%)

      const renderer = new VolumeRenderer(gl as unknown as WebGL2RenderingContext);
      renderer.setData(sampleCandles);
      renderer.render({ viewportWidth: 1000, viewportHeight: canvasHeight });

      // Peak volume in sampleCandles is 1000 (Candle 2)
      // Height calculation check:
      // Normalized height in pixels or normalized NDC ratio
      let instanceData: Float32Array | null = null;
      for (const buffer of gl.buffers.values()) {
        if (buffer.data instanceof Float32Array) {
          instanceData = buffer.data;
          break;
        }
      }

      assert.ok(instanceData !== null);

      // The renderer should compute the pixel heights or NDC heights
      // Maximum volume (1000) must scale to exactly 20% (100px or 0.2 ratio or 0.4 NDC span)
      // Volume 500 should scale to 10% (50px or 0.1 ratio or 0.2 NDC span)
      // Volume 250 should scale to 5% (25px or 0.05 ratio or 0.1 NDC span)
      const floatList = Array.from(instanceData);

      // Check whether heights are provided as pixel heights or normalized ratios
      const hasPixelHeights = floatList.some((v) => Math.abs(v - maxAllowedBarHeight) < 1e-2);
      const hasRatioHeights = floatList.some((v) => Math.abs(v - 0.2) < 1e-4);
      const hasNDCHeights = floatList.some((v) => Math.abs(v - 0.4) < 1e-4);

      assert.ok(
        hasPixelHeights || hasRatioHeights || hasNDCHeights,
        `Max volume (1000) must result in a height scaled to exactly 20% of canvas height (expected ${maxAllowedBarHeight}px or ratio 0.2/0.4 NDC)`
      );

      // Ensure no volume height exceeds 20% of canvas height
      const maxHeightFound = Math.max(...floatList.filter((val) => val <= canvasHeight));
      if (hasPixelHeights) {
        assert.ok(
          maxHeightFound <= maxAllowedBarHeight + 1e-4,
          `No bar height in pixels should exceed 20% canvas height (${maxAllowedBarHeight}px)`
        );
      }
    });

    it('should handle dynamic updates to candle data and redraw correct instance count', () => {
      const renderer = new VolumeRenderer(gl as unknown as WebGL2RenderingContext);

      // Initial empty render
      renderer.setData([]);
      renderer.render({ viewportWidth: 800, viewportHeight: 600 });
      assert.equal(gl.drawCalls.length, 0, 'Should not issue draw calls for empty data');

      // Update with 2 candles
      const updatedCandles: VolumeCandleData[] = [
        { x: 50, width: 10, open: 200, close: 190, volume: 300 },
        { x: 65, width: 10, open: 190, close: 195, volume: 600 },
      ];
      renderer.setData(updatedCandles);
      renderer.render({ viewportWidth: 800, viewportHeight: 600 });

      assert.equal(gl.drawCalls.length, 1);
      assert.equal(gl.drawCalls[0].instanceCount, 2);
    });

    it('should clean up WebGL resources when destroy() is called', () => {
      const renderer = new VolumeRenderer(gl as unknown as WebGL2RenderingContext);
      renderer.setData(sampleCandles);

      const bufferCountBefore = gl.buffers.size;
      assert.ok(bufferCountBefore > 0, 'Buffers should be allocated');

      renderer.destroy();
      assert.equal(gl.buffers.size, 0, 'All WebGL buffers must be deleted upon destroy()');
    });
  });
});