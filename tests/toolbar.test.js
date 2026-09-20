import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initToolbar, aggregateCandles } from '../src/main.js';
import { Chart } from '../src/chart.js';

/**
 * Creates a mock DOM element with standard event handling and classList capabilities.
 */
function createMockElement(tagName, attributes = {}) {
  const listeners = new Map();
  const children = [];

  const element = {
    tagName: tagName.toUpperCase(),
    dataset: { ...attributes.dataset },
    classList: {
      _classes: new Set(attributes.classes || []),
      add(cls) {
        this._classes.add(cls);
      },
      remove(cls) {
        this._classes.delete(cls);
      },
      contains(cls) {
        return this._classes.has(cls);
      },
      toggle(cls) {
        if (this._classes.has(cls)) {
          this._classes.delete(cls);
          return false;
        }
        this._classes.add(cls);
        return true;
      },
    },
    children,
    appendChild(child) {
      children.push(child);
      child.parentElement = element;
      return child;
    },
    querySelectorAll(selector) {
      // Supports basic button or data attribute query
      return children.filter((child) => {
        if (selector === 'button') return child.tagName === 'BUTTON';
        if (selector.startsWith('[data-timeframe]')) return Boolean(child.dataset?.timeframe);
        return false;
      });
    },
    querySelector(selector) {
      const results = this.querySelectorAll(selector);
      return results.length > 0 ? results[0] : null;
    },
    addEventListener(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(handler);
    },
    removeEventListener(event, handler) {
      if (!listeners.has(event)) return;
      listeners.set(
        event,
        listeners.get(event).filter((h) => h !== handler)
      );
    },
    dispatchEvent(event) {
      event.target = this;
      event.currentTarget = this;
      const handlers = listeners.get(event.type) || [];
      for (const handler of handlers) {
        handler(event);
      }
      return !event.defaultPrevented;
    },
    click() {
      const event = {
        type: 'click',
        target: this,
        currentTarget: this,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {},
      };
      this.dispatchEvent(event);
    },
  };

  return element;
}

/**
 * Creates a mock HTML5 Canvas element with a 2D rendering context tracker.
 */
function createMockCanvas(width = 800, height = 400) {
  const drawOps = [];
  const ctx = {
    drawOps,
    clearRect(x, y, w, h) {
      drawOps.push({ type: 'clearRect', args: [x, y, w, h] });
    },
    fillRect(x, y, w, h) {
      drawOps.push({ type: 'fillRect', args: [x, y, w, h] });
    },
    strokeRect(x, y, w, h) {
      drawOps.push({ type: 'strokeRect', args: [x, y, w, h] });
    },
    beginPath() {
      drawOps.push({ type: 'beginPath' });
    },
    moveTo(x, y) {
      drawOps.push({ type: 'moveTo', args: [x, y] });
    },
    lineTo(x, y) {
      drawOps.push({ type: 'lineTo', args: [x, y] });
    },
    stroke() {
      drawOps.push({ type: 'stroke' });
    },
    save() {
      drawOps.push({ type: 'save' });
    },
    restore() {
      drawOps.push({ type: 'restore' });
    },
  };

  return {
    tagName: 'CANVAS',
    width,
    height,
    getContext(type) {
      if (type === '2d') return ctx;
      return null;
    },
    _drawOps: drawOps,
  };
}

/**
 * Generates sequential 1-minute candle test fixtures.
 */
function generate1mCandles(count, startTimestamp = 1700000000000) {
  const candles = [];
  let currentPrice = 100;

  for (let i = 0; i < count; i++) {
    const timestamp = startTimestamp + i * 60000;
    const open = currentPrice;
    const high = open + 2.5;
    const low = open - 1.5;
    const close = open + 1.0;
    const volume = 100 + i * 10;
    candles.push({ timestamp, open, high, low, close, volume });
    currentPrice = close;
  }
  return candles;
}

describe('STORY 2.3.1: Resolve INACTIVE_TOOLBAR_CONTROLS (Defect DF-CONTROL-01)', () => {
  let mockCanvas;
  let mockToolbar;
  let btn1m;
  let btn5m;
  let btn1h;
  let rawCandles;
  let chart;

  beforeEach(() => {
    mockCanvas = createMockCanvas(800, 400);
    mockToolbar = createMockElement('div', { classes: ['toolbar'] });

    btn1m = createMockElement('button', {
      dataset: { timeframe: '1m' },
      classes: ['tf-btn', 'active'],
    });
    btn5m = createMockElement('button', {
      dataset: { timeframe: '5m' },
      classes: ['tf-btn'],
    });
    btn1h = createMockElement('button', {
      dataset: { timeframe: '1h' },
      classes: ['tf-btn'],
    });

    mockToolbar.appendChild(btn1m);
    mockToolbar.appendChild(btn5m);
    mockToolbar.appendChild(btn1h);

    // 120 minutes of 1m candles (sufficient for 5m and 1h aggregation testing)
    rawCandles = generate1mCandles(120);
    chart = new Chart(mockCanvas, { defaultTimeframe: '1m' });
  });

  describe('Initial Default State', () => {
    it('should initialize the chart with default timeframe and render initial candles', () => {
      chart.render(rawCandles);

      assert.strictEqual(chart.getTimeframe(), '1m');
      assert.strictEqual(chart.getCandles().length, 120);
      assert.strictEqual(btn1m.classList.contains('active'), true);
      assert.strictEqual(btn5m.classList.contains('active'), false);
      assert.strictEqual(btn1h.classList.contains('active'), false);
      assert.ok(mockCanvas._drawOps.length > 0, 'Canvas should contain draw calls for initial render');
    });
  });

  describe('Acceptance Criteria: Timeframe Switching and Immediate Re-render', () => {
    it('should aggregate candles to 5m and immediately re-render chart canvas when 5m button is clicked', () => {
      chart.render(rawCandles);
      const initialRenderCount = chart.renderCount;

      initToolbar({
        toolbarElement: mockToolbar,
        chartInstance: chart,
        rawCandles,
      });

      // Clear recorded draw calls to isolate toolbar interaction
      mockCanvas._drawOps.length = 0;

      // User clicks 5m timeframe button
      btn5m.click();

      // 1. Button active state must toggle correctly
      assert.strictEqual(btn5m.classList.contains('active'), true, 'Clicked 5m button should have active class');
      assert.strictEqual(btn1m.classList.contains('active'), false, '1m button must no longer be active');
      assert.strictEqual(btn1h.classList.contains('active'), false, '1h button must remain inactive');

      // 2. Chart timeframe must update
      assert.strictEqual(chart.getTimeframe(), '5m');

      // 3. Candle aggregation must occur (120 1m candles -> 24 5m candles)
      const currentCandles = chart.getCandles();
      assert.strictEqual(currentCandles.length, 24, '120 1m candles should aggregate into exactly 24 5m candles');

      // Verify exact aggregation math on the first 5m aggregated candle
      const expectedFirstOpen = rawCandles[0].open;
      const expectedFirstHigh = Math.max(...rawCandles.slice(0, 5).map((c) => c.high));
      const expectedFirstLow = Math.min(...rawCandles.slice(0, 5).map((c) => c.low));
      const expectedFirstClose = rawCandles[4].close;
      const expectedFirstVol = rawCandles.slice(0, 5).reduce((acc, c) => acc + c.volume, 0);

      const firstAgg = currentCandles[0];
      assert.strictEqual(firstAgg.open, expectedFirstOpen);
      assert.strictEqual(firstAgg.high, expectedFirstHigh);
      assert.strictEqual(firstAgg.low, expectedFirstLow);
      assert.strictEqual(firstAgg.close, expectedFirstClose);
      assert.strictEqual(firstAgg.volume, expectedFirstVol);

      // 4. Chart canvas must have immediately re-rendered
      assert.ok(chart.renderCount > initialRenderCount, 'Chart renderCount must increment immediately');
      assert.ok(mockCanvas._drawOps.length > 0, 'Canvas must receive draw operations for re-rendering');

      const hasClearRect = mockCanvas._drawOps.some((op) => op.type === 'clearRect');
      assert.strictEqual(hasClearRect, true, 'Canvas must be cleared before re-rendering new candles');
    });

    it('should aggregate candles to 1h and immediately re-render chart canvas when 1h button is clicked', () => {
      chart.render(rawCandles);
      initToolbar({
        toolbarElement: mockToolbar,
        chartInstance: chart,
        rawCandles,
      });

      mockCanvas._drawOps.length = 0;
      const prevRenderCount = chart.renderCount;

      // User clicks 1h timeframe button
      btn1h.click();

      // Active state verification
      assert.strictEqual(btn1h.classList.contains('active'), true);
      assert.strictEqual(btn1m.classList.contains('active'), false);
      assert.strictEqual(btn5m.classList.contains('active'), false);

      // Chart state verification
      assert.strictEqual(chart.getTimeframe(), '1h');

      // 120 1m candles -> 2 1h candles
      const currentCandles = chart.getCandles();
      assert.strictEqual(currentCandles.length, 2, '120 1m candles should aggregate into exactly 2 1h candles');

      // First hour verification
      const firstHourSlice = rawCandles.slice(0, 60);
      assert.strictEqual(currentCandles[0].open, firstHourSlice[0].open);
      assert.strictEqual(currentCandles[0].close, firstHourSlice[59].close);
      assert.strictEqual(currentCandles[0].high, Math.max(...firstHourSlice.map((c) => c.high)));
      assert.strictEqual(currentCandles[0].low, Math.min(...firstHourSlice.map((c) => c.low)));
      assert.strictEqual(
        currentCandles[0].volume,
        firstHourSlice.reduce((sum, c) => sum + c.volume, 0)
      );

      // Re-render check
      assert.ok(chart.renderCount > prevRenderCount, 'Chart renderCount must increment on 1h switch');
      assert.ok(mockCanvas._drawOps.length > 0, 'Canvas must immediately receive re-render draw operations');
    });

    it('should ignore clicks on the already active timeframe button (idempotency)', () => {
      chart.render(rawCandles);
      initToolbar({
        toolbarElement: mockToolbar,
        chartInstance: chart,
        rawCandles,
      });

      // Initially active is 1m
      const initialRenderCount = chart.renderCount;
      mockCanvas._drawOps.length = 0;

      // Click active 1m button again
      btn1m.click();

      assert.strictEqual(btn1m.classList.contains('active'), true);
      assert.strictEqual(
        chart.renderCount,
        initialRenderCount,
        'Clicking currently active timeframe button should not trigger duplicate re-renders'
      );
      assert.strictEqual(
        mockCanvas._drawOps.length,
        0,
        'Canvas should not execute draw calls if active timeframe was not changed'
      );
    });
  });

  describe('Candle Aggregation Utility (src/main.js)', () => {
    it('should throw an error for unsupported timeframes', () => {
      assert.throws(
        () => aggregateCandles(rawCandles, 'unsupported_tf'),
        /Unsupported timeframe/i
      );
    });

    it('should return empty array when input candle array is empty', () => {
      const result = aggregateCandles([], '5m');
      assert.deepStrictEqual(result, []);
    });

    it('should correctly handle partial/incomplete candle buckets', () => {
      // 7 1m candles: 1 complete 5m candle (5) + 1 incomplete 5m candle (2)
      const subset = rawCandles.slice(0, 7);
      const aggregated = aggregateCandles(subset, '5m');

      assert.strictEqual(aggregated.length, 2);
      assert.strictEqual(aggregated[0].open, subset[0].open);
      assert.strictEqual(aggregated[0].close, subset[4].close);
      assert.strictEqual(aggregated[1].open, subset[5].open);
      assert.strictEqual(aggregated[1].close, subset[6].close);
      assert.strictEqual(aggregated[1].volume, subset[5].volume + subset[6].volume);
    });
  });

  describe('Chart Re-rendering Direct Contract (src/chart.js)', () => {
    it('should update internal state and clear canvas when render is called', () => {
      const testCandles = rawCandles.slice(0, 10);
      chart.render(testCandles, '10m');

      assert.strictEqual(chart.getTimeframe(), '10m');
      assert.deepStrictEqual(chart.getCandles(), testCandles);

      const clearOp = mockCanvas._drawOps.find((op) => op.type === 'clearRect');
      assert.ok(clearOp, 'render must perform clearRect on the 2d context');
      assert.deepStrictEqual(clearOp.args, [0, 0, mockCanvas.width, mockCanvas.height]);
    });
  });
});