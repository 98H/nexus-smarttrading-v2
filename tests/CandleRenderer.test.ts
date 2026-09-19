import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANDLE_VERTEX_SHADER,
  CANDLE_FRAGMENT_SHADER,
  compileShader,
  createCandleProgram,
} from '../src/rendering/candleShaders.ts';
import { CandleRenderer, type CandleData } from '../src/rendering/CandleRenderer.ts';

// WebGL2 Constants specification polyfill for headless Node testing
const GL = {
  FRAGMENT_SHADER: 0x8b30,
  VERTEX_SHADER: 0x8b31,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88e4,
  DYNAMIC_DRAW: 0x88e8,
  FLOAT: 0x1406,
  TRIANGLES: 0x0004,
  COLOR_BUFFER_BIT: 0x4000,
} as const;

interface MockWebGL2Context {
  canvas: unknown;
  calls: Record<string, any[]>;
  resources: {
    buffers: Set<any>;
    vaos: Set<any>;
    shaders: Set<any>;
    programs: Set<any>;
  };
  createShader: (type: number) => object;
  shaderSource: (shader: object, source: string) => void;
  compileShader: (shader: object) => void;
  getShaderParameter: (shader: object, pname: number) => boolean;
  getShaderInfoLog: (shader: object) => string;
  createProgram: () => object;
  attachShader: (program: object, shader: object) => void;
  linkProgram: (program: object) => void;
  getProgramParameter: (program: object, pname: number) => boolean;
  getProgramInfoLog: (program: object) => string;
  useProgram: (program: object) => void;
  createBuffer: () => object;
  bindBuffer: (target: number, buffer: object | null) => void;
  bufferData: (target: number, data: ArrayBufferView | number, usage: number) => void;
  bufferSubData: (target: number, offset: number, data: ArrayBufferView) => void;
  createVertexArray: () => object;
  bindVertexArray: (vao: object | null) => void;
  enableVertexAttribArray: (index: number) => void;
  vertexAttribPointer: (
    index: number,
    size: number,
    type: number,
    normalized: boolean,
    stride: number,
    offset: number
  ) => void;
  vertexAttribDivisor: (index: number, divisor: number) => void;
  getAttribLocation: (program: object, name: string) => number;
  getUniformLocation: (program: object, name: string) => object;
  uniformMatrix4fv: (location: object, transpose: boolean, value: Float32Array) => void;
  uniform2f: (location: object, x: number, y: number) => void;
  viewport: (x: number, y: number, width: number, height: number) => void;
  clear: (mask: number) => void;
  drawArraysInstanced: (
    mode: number,
    first: number,
    count: number,
    instanceCount: number
  ) => void;
  deleteBuffer: (buffer: object) => void;
  deleteVertexArray: (vao: object) => void;
  deleteShader: (shader: object) => void;
  deleteProgram: (program: object) => void;
}

function createMockWebGL2Context(): MockWebGL2Context {
  const calls: Record<string, any[]> = {};
  const record = (name: string, args: any[]) => {
    if (!calls[name]) calls[name] = [];
    calls[name].push(args);
  };

  const resources = {
    buffers: new Set<any>(),
    vaos: new Set<any>(),
    shaders: new Set<any>(),
    programs: new Set<any>(),
  };

  let attribCounter = 0;
  const attribMap = new Map<string, number>();

  return {
    canvas: null,
    calls,
    resources,
    createShader: (type: number) => {
      record('createShader', [type]);
      const shader = { id: Symbol('shader'), type };
      resources.shaders.add(shader);
      return shader;
    },
    shaderSource: (shader: object, source: string) => {
      record('shaderSource', [shader, source]);
    },
    compileShader: (shader: object) => {
      record('compileShader', [shader]);
    },
    getShaderParameter: (_shader: object, pname: number) => {
      if (pname === GL.COMPILE_STATUS) return true;
      return true;
    },
    getShaderInfoLog: () => '',
    createProgram: () => {
      record('createProgram', []);
      const program = { id: Symbol('program') };
      resources.programs.add(program);
      return program;
    },
    attachShader: (program: object, shader: object) => {
      record('attachShader', [program, shader]);
    },
    linkProgram: (program: object) => {
      record('linkProgram', [program]);
    },
    getProgramParameter: (_program: object, pname: number) => {
      if (pname === GL.LINK_STATUS) return true;
      return true;
    },
    getProgramInfoLog: () => '',
    useProgram: (program: object) => {
      record('useProgram', [program]);
    },
    createBuffer: () => {
      record('createBuffer', []);
      const buf = { id: Symbol('buffer') };
      resources.buffers.add(buf);
      return buf;
    },
    bindBuffer: (target: number, buffer: object | null) => {
      record('bindBuffer', [target, buffer]);
    },
    bufferData: (target: number, data: ArrayBufferView | number, usage: number) => {
      record('bufferData', [target, data, usage]);
    },
    bufferSubData: (target: number, offset: number, data: ArrayBufferView) => {
      record('bufferSubData', [target, offset, data]);
    },
    createVertexArray: () => {
      record('createVertexArray', []);
      const vao = { id: Symbol('vao') };
      resources.vaos.add(vao);
      return vao;
    },
    bindVertexArray: (vao: object | null) => {
      record('bindVertexArray', [vao]);
    },
    enableVertexAttribArray: (index: number) => {
      record('enableVertexAttribArray', [index]);
    },
    vertexAttribPointer: (index, size, type, normalized, stride, offset) => {
      record('vertexAttribPointer', [index, size, type, normalized, stride, offset]);
    },
    vertexAttribDivisor: (index: number, divisor: number) => {
      record('vertexAttribDivisor', [index, divisor]);
    },
    getAttribLocation: (_program: object, name: string) => {
      if (!attribMap.has(name)) {
        attribMap.set(name, attribCounter++);
      }
      return attribMap.get(name)!;
    },
    getUniformLocation: (_program: object, name: string) => ({ name }),
    uniformMatrix4fv: (location: object, transpose: boolean, value: Float32Array) => {
      record('uniformMatrix4fv', [location, transpose, value]);
    },
    uniform2f: (location: object, x: number, y: number) => {
      record('uniform2f', [location, x, y]);
    },
    viewport: (x: number, y: number, width: number, height: number) => {
      record('viewport', [x, y, width, height]);
    },
    clear: (mask: number) => {
      record('clear', [mask]);
    },
    drawArraysInstanced: (mode: number, first: number, count: number, instanceCount: number) => {
      record('drawArraysInstanced', [mode, first, count, instanceCount]);
    },
    deleteBuffer: (buffer: object) => {
      record('deleteBuffer', [buffer]);
      resources.buffers.delete(buffer);
    },
    deleteVertexArray: (vao: object) => {
      record('deleteVertexArray', [vao]);
      resources.vaos.delete(vao);
    },
    deleteShader: (shader: object) => {
      record('deleteShader', [shader]);
      resources.shaders.delete(shader);
    },
    deleteProgram: (program: object) => {
      record('deleteProgram', [program]);
      resources.programs.delete(program);
    },
  };
}

function createMockCanvas(glContext: MockWebGL2Context | null = createMockWebGL2Context()) {
  return {
    width: 1920,
    height: 1080,
    getContext: (contextId: string) => {
      if (contextId === 'webgl2') {
        if (glContext) {
          glContext.canvas = this;
        }
        return glContext;
      }
      return null;
    },
  } as unknown as HTMLCanvasElement;
}

function generateCandles(count: number): CandleData[] {
  const candles: CandleData[] = new Array(count);
  const baseTime = 1700000000000;
  let prevClose = 100.0;

  for (let i = 0; i < count; i++) {
    const timestamp = baseTime + i * 60000;
    const change = (Math.random() - 0.49) * 2;
    const open = prevClose;
    const close = open + change;
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    const volume = Math.floor(Math.random() * 1000) + 1;
    prevClose = close;

    // [timestamp, open, high, low, close, volume]
    candles[i] = [timestamp, open, high, low, close, volume];
  }

  return candles;
}

describe('Story 2.1.1: WebGL2 Canvas Context & Instanced Candle Shaders', () => {
  describe('WebGL2 Environment Fallback and Initialization', () => {
    it('throws explicit error when WebGL2 context is not supported by environment', () => {
      const unsupportedCanvas = createMockCanvas(null);

      assert.throws(
        () => {
          new CandleRenderer(unsupportedCanvas);
        },
        (err: unknown) => {
          assert(err instanceof Error);
          assert.match(
            err.message,
            /WebGL2.*not supported/i,
            'Should throw descriptive error stating WebGL2 is unsupported'
          );
          return true;
        }
      );
    });

    it('successfully initializes when WebGL2 context is supported', () => {
      const glMock = createMockWebGL2Context();
      const canvas = createMockCanvas(glMock);

      const renderer = new CandleRenderer(canvas);
      assert.ok(renderer, 'Renderer should instantiate without error');
      assert.equal(glMock.calls['createProgram']?.length, 1, 'Program should be created on initialization');
      assert.equal(glMock.calls['createVertexArray']?.length, 1, 'VAO should be created on initialization');
    });
  });

  describe('Shader Source and Compilation', () => {
    it('declares valid GLSL 3.00 ES shaders with instanced candle attributes', () => {
      assert.ok(CANDLE_VERTEX_SHADER.startsWith('#version 300 es'), 'Vertex shader must be GLSL 3.00 ES');
      assert.ok(CANDLE_FRAGMENT_SHADER.startsWith('#version 300 es'), 'Fragment shader must be GLSL 3.00 ES');

      // Verify necessary candle inputs exist in vertex shader
      assert.match(CANDLE_VERTEX_SHADER, /in\s+float\s+a_timestamp|in\s+vec2\s+a_timestamp/);
      assert.match(CANDLE_VERTEX_SHADER, /in\s+float\s+a_open/);
      assert.match(CANDLE_VERTEX_SHADER, /in\s+float\s+a_high/);
      assert.match(CANDLE_VERTEX_SHADER, /in\s+float\s+a_low/);
      assert.match(CANDLE_VERTEX_SHADER, /in\s+float\s+a_close/);
      assert.match(CANDLE_VERTEX_SHADER, /in\s+float\s+a_volume/);

      // Verify fragment shader output
      assert.match(CANDLE_FRAGMENT_SHADER, /out\s+vec4\s+outColor/);
    });

    it('throws when shader compilation fails', () => {
      const glMock = createMockWebGL2Context();
      glMock.getShaderParameter = (_s, pname) => {
        if (pname === GL.COMPILE_STATUS) return false;
        return true;
      };
      glMock.getShaderInfoLog = () => 'Syntax error at line 1';

      assert.throws(
        () => {
          compileShader(glMock as unknown as WebGL2RenderingContext, GL.VERTEX_SHADER, 'invalid code');
        },
        /Failed to compile shader.*Syntax error at line 1/i
      );
    });

    it('links shader program and configures program uniforms', () => {
      const glMock = createMockWebGL2Context();
      const program = createCandleProgram(
        glMock as unknown as WebGL2RenderingContext,
        CANDLE_VERTEX_SHADER,
        CANDLE_FRAGMENT_SHADER
      );

      assert.ok(program);
      assert.equal(glMock.calls['attachShader']?.length, 2);
      assert.equal(glMock.calls['linkProgram']?.length, 1);
    });
  });

  describe('Instanced Buffer Setup and Rendering Performance', () => {
    let glMock: MockWebGL2Context;
    let canvas: HTMLCanvasElement;
    let renderer: CandleRenderer;

    beforeEach(() => {
      glMock = createMockWebGL2Context();
      canvas = createMockCanvas(glMock);
      renderer = new CandleRenderer(canvas);
    });

    it('configures per-instance vertex attribute divisors for candle attributes', () => {
      const divisorCalls = glMock.calls['vertexAttribDivisor'] || [];
      // At least open, high, low, close, timestamp, volume should have divisor 1 (per instance)
      const perInstanceAttributes = divisorCalls.filter((call) => call[1] === 1);

      assert.ok(
        perInstanceAttributes.length >= 6,
        `Expected at least 6 instanced attributes configured with divisor 1, received ${perInstanceAttributes.length}`
      );
    });

    it('renders 100,000 candlesticks via drawArraysInstanced in under 16.6ms (60 FPS target)', () => {
      const candleCount = 100_000;
      const candles = generateCandles(candleCount);

      // Upload data
      renderer.setCandles(candles);

      const startTime = performance.now();
      renderer.render();
      const duration = performance.now() - startTime;

      // 60 FPS frame budget is 16.67ms
      assert.ok(
        duration < 16.67,
        `Rendering 100,000 candles must execute within 16.67ms (took ${duration.toFixed(2)}ms)`
      );

      const drawCalls = glMock.calls['drawArraysInstanced'];
      assert.ok(drawCalls, 'drawArraysInstanced must be called');
      assert.equal(drawCalls.length, 1, 'Should render within a single instanced draw call');

      const [mode, first, count, instanceCount] = drawCalls[0];
      assert.equal(mode, GL.TRIANGLES, 'Should draw triangles');
      assert.equal(first, 0, 'Should start at index 0');
      // Box body (6 vertices) + wick (6 vertices) = 12 vertices per instanced candle mesh
      assert.ok(count >= 6, 'Should draw at least 6 vertices per instance');
      assert.equal(instanceCount, candleCount, 'Must render exact instance count of 100,000');
    });

    it('updates buffer data without allocating new buffers on update', () => {
      const initialCount = 10;
      const initialCandles = generateCandles(initialCount);
      renderer.setCandles(initialCandles);
      renderer.render();

      const bufferCountAfterInit = glMock.resources.buffers.size;

      // New data update of the same or smaller size
      const updatedCandles = generateCandles(initialCount);
      renderer.setCandles(updatedCandles);
      renderer.render();

      assert.equal(
        glMock.resources.buffers.size,
        bufferCountAfterInit,
        'Should reuse allocated buffers rather than creating new ones'
      );
    });
  });

  describe('Memory Leak Prevention and Cleanup Lifecycle', () => {
    it('does not leak memory across multiple frame updates and renders', () => {
      const glMock = createMockWebGL2Context();
      const canvas = createMockCanvas(glMock);
      const renderer = new CandleRenderer(canvas);

      const frames = 120;
      const candles = generateCandles(1_000);

      const initialBufferCount = glMock.resources.buffers.size;
      const initialVaoCount = glMock.resources.vaos.size;

      for (let i = 0; i < frames; i++) {
        // Mutate last close slightly to simulate live stream ticks
        candles[candles.length - 1][4] += 0.05;
        renderer.setCandles(candles);
        renderer.render();
      }

      assert.equal(
        glMock.resources.buffers.size,
        initialBufferCount,
        'Active buffer count must remain constant over repeated frames'
      );
      assert.equal(
        glMock.resources.vaos.size,
        initialVaoCount,
        'Active VAO count must remain constant over repeated frames'
      );
    });

    it('cleans up WebGL resources when dispose is called', () => {
      const glMock = createMockWebGL2Context();
      const canvas = createMockCanvas(glMock);
      const renderer = new CandleRenderer(canvas);

      renderer.setCandles(generateCandles(500));
      renderer.render();

      assert.ok(glMock.resources.buffers.size > 0, 'Buffers should exist before disposal');
      assert.ok(glMock.resources.programs.size > 0, 'Programs should exist before disposal');
      assert.ok(glMock.resources.vaos.size > 0, 'VAOs should exist before disposal');

      renderer.dispose();

      assert.equal(glMock.resources.buffers.size, 0, 'All buffers must be explicitly deleted on dispose');
      assert.equal(glMock.resources.vaos.size, 0, 'All VAOs must be explicitly deleted on dispose');
      assert.equal(glMock.resources.programs.size, 0, 'All programs must be explicitly deleted on dispose');
      assert.equal(glMock.resources.shaders.size, 0, 'All attached shaders must be deleted on dispose');
    });
  });
});