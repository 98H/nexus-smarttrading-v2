import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateCandlestickData } from '../src/data_generator.js';

// ============================================================================
// DOM & Canvas Mock Environment for Entrypoint Verification
// ============================================================================
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this._fillStyle = '#000000';
    this._strokeStyle = '#000000';
    this.fillStyleHistory = [];
    this.strokeStyleHistory = [];
    this.calls = [];
  }

  get fillStyle() {
    return this._fillStyle;
  }

  set fillStyle(val) {
    this._fillStyle = val;
    this.fillStyleHistory.push(String(val).toLowerCase());
  }

  get strokeStyle() {
    return this._strokeStyle;
  }

  set strokeStyle(val) {
    this._strokeStyle = val;
    this.strokeStyleHistory.push(String(val).toLowerCase());
  }

  beginPath() {
    this.calls.push({ method: 'beginPath' });
  }

  moveTo(x, y) {
    this.calls.push({ method: 'moveTo', args: [x, y] });
  }

  lineTo(x, y) {
    this.calls.push({ method: 'lineTo', args: [x, y] });
  }

  stroke() {
    this.calls.push({ method: 'stroke', strokeStyle: this._strokeStyle });
  }

  fillRect(x, y, w, h) {
    this.calls.push({ method: 'fillRect', args: [x, y, w, h], fillStyle: this._fillStyle });
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: 'clearRect', args: [x, y, w, h] });
  }
}

class MockHTMLCanvasElement {
  constructor() {
    this.tagName = 'CANVAS';
    this.width = 800;
    this.height = 600;
    this._context = new MockCanvasRenderingContext2D(this);
  }

  getContext(type) {
    if (type === '2d') {
      return this._context;
    }
    return null;
  }
}

class MockElement {
  constructor(id = '', tagName = 'DIV') {
    this.id = id;
    this.tagName = tagName;
    this.children = [];
    this.innerHTML = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    if (selector === 'canvas') {
      return this.children.find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }
}

// ============================================================================
// STORY 38.4.1 / DF-CANDLES-01 Test Suite
// ============================================================================
describe('STORY 38.4.1: Resolve SYNTHETIC_STRAIGHT_LINE_DATA (Defect ID: DF-CANDLES-01)', () => {

  describe('Candlestick Data Generator (src/data_generator.js)', () => {
    it('AC1: should generate an oscillating market walk containing both bullish and bearish candles', () => {
      const seriesLength = 100;
      const data = generateCandlestickData({ count: seriesLength, initialPrice: 100 });

      assert.ok(Array.isArray(data), 'Expected generated data to be an array');
      assert.strictEqual(data.length, seriesLength, `Expected exactly ${seriesLength} candles`);

      let bullishCount = 0;
      let bearishCount = 0;
      let equalCount = 0;

      for (const candle of data) {
        assert.ok(typeof candle.open === 'number' && Number.isFinite(candle.open), 'Candle open must be a finite number');
        assert.ok(typeof candle.close === 'number' && Number.isFinite(candle.close), 'Candle close must be a finite number');
        assert.ok(typeof candle.high === 'number' && Number.isFinite(candle.high), 'Candle high must be a finite number');
        assert.ok(typeof candle.low === 'number' && Number.isFinite(candle.low), 'Candle low must be a finite number');

        // Candlestick structural constraints
        assert.ok(candle.high >= candle.open, `High (${candle.high}) must be >= open (${candle.open})`);
        assert.ok(candle.high >= candle.close, `High (${candle.high}) must be >= close (${candle.close})`);
        assert.ok(candle.low <= candle.open, `Low (${candle.low}) must be <= open (${candle.open})`);
        assert.ok(candle.low <= candle.close, `Low (${candle.low}) must be <= close (${candle.close})`);

        if (candle.close > candle.open) {
          bullishCount++;
        } else if (candle.close < candle.open) {
          bearishCount++;
        } else {
          equalCount++;
        }
      }

      // DF-CANDLES-01 Defect Guard: Previously, 100% of candles were bullish (green)
      assert.ok(
        bullishCount > 0,
        `Expected series to contain bullish candles (close > open), got ${bullishCount}`
      );
      assert.ok(
        bearishCount > 0,
        `Expected series to contain bearish candles (close < open), got ${bearishCount}`
      );

      // Realistic random walk expectation: neither bullish nor bearish should completely dominate
      const bullishRatio = bullishCount / seriesLength;
      assert.ok(
        bullishRatio >= 0.2 && bullishRatio <= 0.8,
        `Expected balanced distribution of candle types, got bullish ratio: ${bullishRatio}`
      );
    });

    it('AC1: should generate dynamic high and low wicks with non-zero variance across the series', () => {
      const data = generateCandlestickData({ count: 80 });

      const upperWickLengths = [];
      const lowerWickLengths = [];

      for (const c of data) {
        const candleBodyTop = Math.max(c.open, c.close);
        const candleBodyBottom = Math.min(c.open, c.close);

        const upperWick = Number((c.high - candleBodyTop).toFixed(4));
        const lowerWick = Number((candleBodyBottom - c.low).toFixed(4));

        assert.ok(upperWick >= 0, `Upper wick length must be non-negative: ${upperWick}`);
        assert.ok(lowerWick >= 0, `Lower wick length must be non-negative: ${lowerWick}`);

        upperWickLengths.push(upperWick);
        lowerWickLengths.push(lowerWick);
      }

      // Calculate variance of wicks to prove dynamic generation (defect had 0 or identical static wicks)
      const calcVariance = (arr) => {
        const mean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
        return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
      };

      const upperWickVariance = calcVariance(upperWickLengths);
      const lowerWickVariance = calcVariance(lowerWickLengths);

      assert.ok(
        upperWickVariance > 0.001,
        `Upper wicks must be dynamic with non-zero variance; received variance: ${upperWickVariance}`
      );
      assert.ok(
        lowerWickVariance > 0.001,
        `Lower wicks must be dynamic with non-zero variance; received variance: ${lowerWickVariance}`
      );
    });

    it('AC1: should not produce a rigid monotonic 45-degree slope (close price must oscillate)', () => {
      const data = generateCandlestickData({ count: 60 });
      let consecutiveIncreases = 0;
      let maxConsecutiveIncreases = 0;
      const deltas = [];

      for (let i = 1; i < data.length; i++) {
        const delta = data[i].close - data[i - 1].close;
        deltas.push(delta);

        if (delta > 0) {
          consecutiveIncreases++;
          maxConsecutiveIncreases = Math.max(maxConsecutiveIncreases, consecutiveIncreases);
        } else {
          consecutiveIncreases = 0;
        }
      }

      // Check for price direction changes (oscillations)
      const hasNegativeDelta = deltas.some((d) => d < 0);
      const hasPositiveDelta = deltas.some((d) => d > 0);

      assert.ok(hasNegativeDelta, 'Series must oscillate and contain negative close-to-close steps');
      assert.ok(hasPositiveDelta, 'Series must oscillate and contain positive close-to-close steps');

      // Monotonic 45-degree slope had every single candle incrementing identical amounts
      assert.ok(
        maxConsecutiveIncreases < data.length - 1,
        `Monotonic slope detected: close price increased uninterrupted for all ${data.length - 1} steps`
      );

      // Verify that step deltas are not uniformly identical constant values
      const uniqueDeltas = new Set(deltas.map((d) => d.toFixed(4)));
      assert.ok(
        uniqueDeltas.size > 5,
        `Expected varied step sizes across candles, found only ${uniqueDeltas.size} distinct step values`
      );
    });
  });

  describe('Active Application Entrypoint Integration (src/main.js)', () => {
    let originalDocument;
    let mockApp;
    let mockCanvas;

    beforeEach(() => {
      originalDocument = globalThis.document;

      mockApp = new MockElement('app', 'DIV');
      mockCanvas = new MockHTMLCanvasElement();
      mockApp.appendChild(mockCanvas);

      globalThis.document = {
        getElementById: (id) => {
          if (id === 'app') {
            return mockApp;
          }
          return null;
        },
        createElement: (tag) => {
          if (tag.toLowerCase() === 'canvas') {
            return new MockHTMLCanvasElement();
          }
          return new MockElement('', tag.toUpperCase());
        },
      };
    });

    afterEach(() => {
      globalThis.document = originalDocument;
    });

    it('AC2: should mount to document.getElementById("app") and render realistic synthetic candlestick dataset to active canvas', async () => {
      // Dynamic import to execute main module lifecycle in current DOM mock context
      const mainModule = await import(`../src/main.js?cacheBust=${Date.now()}`);

      // Allow either direct execution or exported mount/init lifecycle
      if (typeof mainModule.mount === 'function') {
        mainModule.mount();
      } else if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      }

      const canvas = mockApp.querySelector('canvas');
      assert.ok(canvas, 'Active canvas element must be mounted inside document.getElementById("app")');

      const ctx = canvas.getContext('2d');
      assert.ok(ctx, '2D rendering context must be acquired from the canvas');
      assert.ok(ctx.calls.length > 0, 'Canvas operations must have been performed to render the chart');

      // Check color diversity in render operations (Must include both bullish and bearish colors)
      const combinedColorHistory = [
        ...ctx.fillStyleHistory,
        ...ctx.strokeStyleHistory,
      ];

      const greenColorPatterns = ['#26a69a', '#00ff00', '#089981', '#4caf50', '#22ab94', 'green'];
      const redColorPatterns = ['#ef5350', '#ff0000', '#f23645', '#f44336', '#f23645', 'red'];

      const renderedBullishColor = combinedColorHistory.some((color) =>
        greenColorPatterns.some((pattern) => color.includes(pattern))
      );
      const renderedBearishColor = combinedColorHistory.some((color) =>
        redColorPatterns.some((pattern) => color.includes(pattern))
      );

      assert.ok(
        renderedBullishColor,
        `Chart render must apply bullish (green) palette to bullish candles. Styles recorded: ${JSON.stringify(combinedColorHistory.slice(0, 10))}`
      );
      assert.ok(
        renderedBearishColor,
        `Chart render must apply bearish (red) palette to bearish candles. Styles recorded: ${JSON.stringify(combinedColorHistory.slice(0, 10))}`
      );

      // Verify that wick lines (moveTo / lineTo / stroke) and candle bodies (fillRect) were drawn
      const lineToCalls = ctx.calls.filter((c) => c.method === 'lineTo');
      const fillRectCalls = ctx.calls.filter((c) => c.method === 'fillRect');

      assert.ok(fillRectCalls.length >= 10, `Expected candle bodies to be rendered with fillRect, got ${fillRectCalls.length}`);
      assert.ok(lineToCalls.length >= 10, `Expected candle wicks to be rendered with lineTo, got ${lineToCalls.length}`);
    });
  });
});