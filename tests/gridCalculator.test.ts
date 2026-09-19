import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateGridSteps,
  calculateNiceStep,
  type GridCalculationParams,
  type GridStepsResult,
  type StepResult
} from '../src/chart/utils/gridCalculator.ts';

import {
  GridShader,
  GRID_VERTEX_SHADER,
  GRID_FRAGMENT_SHADER,
  type GridShaderUniforms
} from '../src/chart/shaders/gridShader.ts';

// ---------------------------------------------------------------------------
// Mock WebGL Context for Shader & Uniform Validation
// ---------------------------------------------------------------------------
interface MockWebGLUniformLocation {
  name: string;
}

class MockWebGLRenderingContext {
  public uniforms: Map<string, unknown> = new Map();
  public attachedShaders: unknown[] = [];
  public shaderSourceMap: Map<unknown, string> = new Map();

  createShader(type: number): unknown {
    return { type, id: Math.random() };
  }

  shaderSource(shader: unknown, source: string): void {
    this.shaderSourceMap.set(shader, source);
  }

  compileShader(_shader: unknown): void {}
  getShaderParameter(_shader: unknown, _pname: number): boolean {
    return true;
  }
  getShaderInfoLog(_shader: unknown): string {
    return '';
  }

  createProgram(): unknown {
    return { id: Math.random() };
  }

  attachShader(_program: unknown, shader: unknown): void {
    this.attachedShaders.push(shader);
  }

  linkProgram(_program: unknown): void {}
  getProgramParameter(_program: unknown, _pname: number): boolean {
    return true;
  }
  getProgramInfoLog(_program: unknown): string {
    return '';
  }

  useProgram(_program: unknown): void {}

  getUniformLocation(_program: unknown, name: string): MockWebGLUniformLocation {
    return { name };
  }

  uniform1f(location: MockWebGLUniformLocation | null, v0: number): void {
    if (location) this.uniforms.set(location.name, v0);
  }

  uniform2f(location: MockWebGLUniformLocation | null, v0: number, v1: number): void {
    if (location) this.uniforms.set(location.name, [v0, v1]);
  }

  uniform4f(
    location: MockWebGLUniformLocation | null,
    v0: number,
    v1: number,
    v2: number,
    v3: number
  ): void {
    if (location) this.uniforms.set(location.name, [v0, v1, v2, v3]);
  }
}

// ---------------------------------------------------------------------------
// Unit Tests: Grid Calculator (src/chart/utils/gridCalculator.ts)
// ---------------------------------------------------------------------------
describe('gridCalculator - Adaptive Step Frequencies', () => {
  const baseParams: GridCalculationParams = {
    viewport: { width: 1920, height: 1080 },
    priceRange: { min: 100.0, max: 200.0 },
    timeRange: { min: 1700000000, max: 1700086400 }, // 1 day in seconds
    minPixelSpacing: { x: 80, y: 40 }
  };

  it('calculates standard nice steps for baseline price and time ranges', () => {
    const result: GridStepsResult = calculateGridSteps(baseParams);

    assert.ok(result.priceStep > 0, 'Price step must be positive');
    assert.ok(result.timeStep > 0, 'Time step must be positive');

    // In a 1080px viewport with a span of 100, min 40px spacing implies at most 27 lines
    const pricePixelSpacing = (result.priceStep / (baseParams.priceRange.max - baseParams.priceRange.min)) * baseParams.viewport.height;
    assert.ok(
      pricePixelSpacing >= baseParams.minPixelSpacing!.y,
      `Price pixel spacing (${pricePixelSpacing}) should be >= min spacing (${baseParams.minPixelSpacing!.y})`
    );

    // In a 1920px viewport with a span of 86400, min 80px spacing implies at most 24 lines
    const timePixelSpacing = (result.timeStep / (baseParams.timeRange.max - baseParams.timeRange.min)) * baseParams.viewport.width;
    assert.ok(
      timePixelSpacing >= baseParams.minPixelSpacing!.x,
      `Time pixel spacing (${timePixelSpacing}) should be >= min spacing (${baseParams.minPixelSpacing!.x})`
    );
  });

  it('guarantees minPixelSpacing invariant across various zoom levels', () => {
    const zoomLevels = [
      { priceSpan: 0.05, timeSpan: 300 },       // Hyper-zoomed in: 5 cents, 5 minutes
      { priceSpan: 1.0, timeSpan: 3600 },        // Moderate zoom: $1, 1 hour
      { priceSpan: 100.0, timeSpan: 86400 },     // Standard: $100, 1 day
      { priceSpan: 50000.0, timeSpan: 31536000 } // Macro zoom: $50,000, 1 year
    ];

    for (const zoom of zoomLevels) {
      const params: GridCalculationParams = {
        viewport: { width: 1280, height: 720 },
        priceRange: { min: 1000, max: 1000 + zoom.priceSpan },
        timeRange: { min: 1700000000, max: 1700000000 + zoom.timeSpan },
        minPixelSpacing: { x: 90, y: 50 }
      };

      const result = calculateGridSteps(params);

      const computedPricePixelSpacing =
        (result.priceStep / zoom.priceSpan) * params.viewport.height;
      const computedTimePixelSpacing =
        (result.timeStep / zoom.timeSpan) * params.viewport.width;

      assert.ok(
        computedPricePixelSpacing >= params.minPixelSpacing!.y,
        `Violated price spacing invariant at zoom span ${zoom.priceSpan}: got ${computedPricePixelSpacing}px`
      );
      assert.ok(
        computedTimePixelSpacing >= params.minPixelSpacing!.x,
        `Violated time spacing invariant at zoom span ${zoom.timeSpan}: got ${computedTimePixelSpacing}px`
      );
    }
  });

  it('dynamically adapts price step when viewport height collapses', () => {
    const fullHeightParams: GridCalculationParams = {
      viewport: { width: 1000, height: 1000 },
      priceRange: { min: 100, max: 200 },
      timeRange: { min: 0, max: 1000 },
      minPixelSpacing: { x: 50, y: 50 }
    };

    const smallHeightParams: GridCalculationParams = {
      ...fullHeightParams,
      viewport: { width: 1000, height: 100 }
    };

    const fullResult = calculateGridSteps(fullHeightParams);
    const smallResult = calculateGridSteps(smallHeightParams);

    // Collapsed viewport height must decrease grid frequency (increase step size)
    assert.ok(
      smallResult.priceStep > fullResult.priceStep,
      `Expected smaller viewport to have larger step size: ${smallResult.priceStep} > ${fullResult.priceStep}`
    );
  });

  it('computes fractional alpha transitions to prevent visual pop-in on subdivision steps', () => {
    // calculateNiceStep directly calculates step and level-of-detail opacity
    const niceStep: StepResult = calculateNiceStep(100, 1000, 50, false);

    assert.ok(typeof niceStep.step === 'number', 'Step must be a number');
    assert.ok(typeof niceStep.subStep === 'number', 'Sub-step must be a number');
    assert.ok(
      niceStep.subdivisionAlpha >= 0.0 && niceStep.subdivisionAlpha <= 1.0,
      `Alpha must be clamped between [0, 1], received: ${niceStep.subdivisionAlpha}`
    );
    assert.ok(niceStep.subStep < niceStep.step, 'Sub-step must be strictly smaller than main step');
  });

  it('generates correct boundary lines arrays matching visible range bounds', () => {
    const params: GridCalculationParams = {
      viewport: { width: 1000, height: 1000 },
      priceRange: { min: 10, max: 25 },
      timeRange: { min: 0, max: 50 },
      minPixelSpacing: { x: 50, y: 50 }
    };

    const result = calculateGridSteps(params);

    // Lines should be within or exactly at boundaries
    for (const line of result.priceLines) {
      assert.ok(line >= params.priceRange.min, `Line ${line} below min price ${params.priceRange.min}`);
      assert.ok(line <= params.priceRange.max, `Line ${line} above max price ${params.priceRange.max}`);
    }

    for (const line of result.timeLines) {
      assert.ok(line >= params.timeRange.min, `Line ${line} below min time ${params.timeRange.min}`);
      assert.ok(line <= params.timeRange.max, `Line ${line} above max time ${params.timeRange.max}`);
    }

    // Grid lines must be strictly monotonically increasing
    for (let i = 1; i < result.priceLines.length; i++) {
      assert.ok(result.priceLines[i] > result.priceLines[i - 1], 'Price lines must be strictly increasing');
    }
    for (let i = 1; i < result.timeLines.length; i++) {
      assert.ok(result.timeLines[i] > result.timeLines[i - 1], 'Time lines must be strictly increasing');
    }
  });

  it('throws an informative RangeError on invalid dimensions or inverted bounds', () => {
    assert.throws(
      () =>
        calculateGridSteps({
          viewport: { width: -100, height: 500 },
          priceRange: { min: 100, max: 200 },
          timeRange: { min: 0, max: 10 }
        }),
      /viewport dimensions must be strictly positive/i
    );

    assert.throws(
      () =>
        calculateGridSteps({
          viewport: { width: 1000, height: 500 },
          priceRange: { min: 200, max: 100 }, // inverted
          timeRange: { min: 0, max: 10 }
        }),
      /range min must be strictly less than max/i
    );
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Grid Shader Source & State (src/chart/shaders/gridShader.ts)
// ---------------------------------------------------------------------------
describe('gridShader - GLSL Shader Architecture and Uniform Binding', () => {
  it('defines valid vertex shader containing resolution and coordinate transforms', () => {
    assert.ok(typeof GRID_VERTEX_SHADER === 'string', 'GRID_VERTEX_SHADER must be defined');
    assert.ok(GRID_VERTEX_SHADER.length > 0, 'GRID_VERTEX_SHADER cannot be empty');

    // Shader must pass UV or coordinates to fragment shader
    assert.ok(
      GRID_VERTEX_SHADER.includes('v_uv') || GRID_VERTEX_SHADER.includes('v_position'),
      'Vertex shader must export varying UV or position coordinate'
    );
  });

  it('defines valid fragment shader containing required uniforms for adaptive guide lines', () => {
    assert.ok(typeof GRID_FRAGMENT_SHADER === 'string', 'GRID_FRAGMENT_SHADER must be defined');

    // Essential uniforms for Story 2.3.1
    const requiredUniforms = [
      'u_resolution',
      'u_priceRange',
      'u_timeRange',
      'u_priceStep',
      'u_timeStep',
      'u_subPriceAlpha',
      'u_subTimeAlpha',
      'u_gridColor'
    ];

    for (const uniform of requiredUniforms) {
      assert.ok(
        GRID_FRAGMENT_SHADER.includes(uniform),
        `Fragment shader must declare uniform: ${uniform}`
      );
    }

    // Must implement anti-aliasing (smoothstep or fwidth) for crisp rendering
    assert.ok(
      GRID_FRAGMENT_SHADER.includes('fwidth') || GRID_FRAGMENT_SHADER.includes('smoothstep'),
      'Fragment shader must implement anti-aliased line rendering (fwidth or smoothstep)'
    );
  });

  it('initializes GridShader instance and uploads uniforms deterministically', () => {
    const gl = new MockWebGLRenderingContext() as unknown as WebGLRenderingContext;
    const shader = new GridShader(gl);

    const uniforms: GridShaderUniforms = {
      resolution: [1920, 1080],
      priceRange: [100.0, 150.0],
      timeRange: [1700000000, 1700086400],
      priceStep: 10.0,
      timeStep: 3600.0,
      subPriceAlpha: 0.45,
      subTimeAlpha: 0.85,
      gridColor: [0.3, 0.3, 0.3, 1.0]
    };

    shader.updateUniforms(uniforms);

    const mockCtx = gl as unknown as MockWebGLRenderingContext;

    assert.deepStrictEqual(mockCtx.uniforms.get('u_resolution'), [1920, 1080]);
    assert.deepStrictEqual(mockCtx.uniforms.get('u_priceRange'), [100.0, 150.0]);
    assert.deepStrictEqual(mockCtx.uniforms.get('u_timeRange'), [1700000000, 1700086400]);
    assert.strictEqual(mockCtx.uniforms.get('u_priceStep'), 10.0);
    assert.strictEqual(mockCtx.uniforms.get('u_timeStep'), 3600.0);
    assert.strictEqual(mockCtx.uniforms.get('u_subPriceAlpha'), 0.45);
    assert.strictEqual(mockCtx.uniforms.get('u_subTimeAlpha'), 0.85);
    assert.deepStrictEqual(mockCtx.uniforms.get('u_gridColor'), [0.3, 0.3, 0.3, 1.0]);
  });

  it('syncs gridCalculator output directly into GridShader uniforms without precision loss', () => {
    const gl = new MockWebGLRenderingContext() as unknown as WebGLRenderingContext;
    const shader = new GridShader(gl);

    const params: GridCalculationParams = {
      viewport: { width: 800, height: 600 },
      priceRange: { min: 42.125, max: 48.75 },
      timeRange: { min: 1600000, max: 1650000 },
      minPixelSpacing: { x: 60, y: 30 }
    };

    const calculated = calculateGridSteps(params);

    shader.syncViewportAndScale(params, calculated, [0.1, 0.2, 0.3, 1.0]);

    const mockCtx = gl as unknown as MockWebGLRenderingContext;

    assert.deepStrictEqual(mockCtx.uniforms.get('u_resolution'), [800, 600]);
    assert.deepStrictEqual(mockCtx.uniforms.get('u_priceRange'), [42.125, 48.75]);
    assert.deepStrictEqual(mockCtx.uniforms.get('u_timeRange'), [1600000, 1650000]);
    assert.strictEqual(mockCtx.uniforms.get('u_priceStep'), calculated.priceStep);
    assert.strictEqual(mockCtx.uniforms.get('u_timeStep'), calculated.timeStep);
  });
});