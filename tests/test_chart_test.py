import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Target modules under test
import { Chart, calculateSMA, calculateEMA } from '../src/chart.js';
import { initApp } from '../src/main.js';

// --- Test Infrastructure & Minimal DOM Simulation ---
class MockCanvasRenderingContext2D {
  constructor() {
    this.strokeCalls = 0;
    this.beginPathCalls = 0;
    this.moveToCalls = [];
    this.lineToCalls = [];
    this.strokeStyleHistory = [];
    this._strokeStyle = '#000000';
    this.lineWidth = 1;
  }

  get strokeStyle() {
    return this._strokeStyle;
  }

  set strokeStyle(value) {
    this._strokeStyle = value;
    this.strokeStyleHistory.push(value);
  }

  beginPath() {
    this.beginPathCalls++;
  }

  moveTo(x, y) {
    this.moveToCalls.push({ x, y });
  }

  lineTo(x, y) {
    this.lineToCalls.push({ x, y });
  }

  stroke() {
    this.strokeCalls++;
  }

  clearRect() {}
  save() {}
  restore() {}
  fillText() {}
  measureText() {
    return { width: 40 };
  }
}

class MockHTMLElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = '';
    this.children = [];
    this.parentElement = null;
    this.textContent = '';
    this._innerHTML = '';
    this._attributes = new Map();

    if (this.tagName === 'CANVAS') {
      this.width = 800;
      this.height = 400;
      this._context = new MockCanvasRenderingContext2D();
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.textContent = html.replace(/<[^>]*>?/gm, '');
  }

  getContext(type) {
    if (this.tagName === 'CANVAS' && type === '2d') {
      return this._context;
    }
    return null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this._findDescendant((el) => el.id === id);
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this._findDescendant((el) => el.className.split(/\s+/).includes(cls));
    }
    return this._findDescendant((el) => el.tagName === selector.toUpperCase());
  }

  querySelectorAll(selector) {
    const results = [];
    this._collectDescendants((el) => {
      if (selector.startsWith('.')) {
        return el.className.split(/\s+/).includes(selector.slice(1));
      }
      return el.tagName === selector.toUpperCase();
    }, results);
    return results;
  }

  _findDescendant(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child._findDescendant(predicate);
      if (found) return found;
    }
    return null;
  }

  _collectDescendants(predicate, list) {
    for (const child of this.children) {
      if (predicate(child)) list.push(child);
      child._collectDescendants(predicate, list);
    }
  }
}

function setupMockDom() {
  const elements = new Map();
  const appRoot = new MockHTMLElement('div', 'app');
  elements.set('app', appRoot);

  globalThis.document = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tag) {
      return new MockHTMLElement(tag);
    },
    querySelector(sel) {
      return appRoot.querySelector(sel);
    },
  };

  globalThis.window = {
    document: globalThis.document,
  };

  return { appRoot };
}

function teardownMockDom() {
  delete globalThis.document;
  delete globalThis.window;
}

// Sample 25-period sequential pricing dataset
const generatePriceSeries = (count = 25, base = 100) =>
  Array.from({ length: count }, (_, idx) => ({
    timestamp: 1672531199000 + idx * 86400000,
    open: base + idx,
    high: base + idx + 2,
    low: base + idx - 1,
    close: base + idx + 1,
    volume: 1000 + idx * 10,
  }));

// --- Test Suite: Story 49.3.1 Defect DF-OVERLAYS-01 ---
describe('STORY 49.3.1: Resolve MISSING_ANALYTICAL_OVERLAYS', () => {
  let appContainer;

  beforeEach(() => {
    const dom = setupMockDom();
    appContainer = dom.appRoot;
  });

  afterEach(() => {
    teardownMockDom();
  });

  describe('Analytical Calculations: 20-Period Moving Average (SMA / EMA)', () => {
    it('should return null or undefined values for indices prior to the 20-period window', () => {
      const prices = generatePriceSeries(25).map((p) => p.close);
      const sma = calculateSMA(prices, 20);

      assert.strictEqual(sma.length, prices.length, 'SMA array length must match input series');
      for (let i = 0; i < 19; i++) {
        assert.strictEqual(
          sma[i],
          null,
          `Period index ${i} before window completion must be null`
        );
      }
    });

    it('should compute the exact mathematical SMA value at and beyond period 20', () => {
      const prices = generatePriceSeries(25, 10).map((p) => p.close);
      const sma = calculateSMA(prices, 20);

      // Average of close prices for first 20 items: (11 + ... + 30) / 20 = 20.5
      const expectedFirstSMA =
        prices.slice(0, 20).reduce((sum, val) => sum + val, 0) / 20;
      assert.strictEqual(
        Number(sma[19].toFixed(4)),
        Number(expectedFirstSMA.toFixed(4)),
        'SMA at index 19 must equal the arithmetic mean of the first 20 values'
      );

      // Average of items 1 to 20
      const expectedSecondSMA =
        prices.slice(1, 21).reduce((sum, val) => sum + val, 0) / 20;
      assert.strictEqual(
        Number(sma[20].toFixed(4)),
        Number(expectedSecondSMA.toFixed(4)),
        'SMA at index 20 must slide correctly across the window'
      );
    });

    it('should compute valid 20-period EMA when EMA overlay mode is selected', () => {
      const prices = generatePriceSeries(25, 50).map((p) => p.close);
      const ema = calculateEMA(prices, 20);

      assert.strictEqual(ema.length, prices.length);
      // EMA initial value at period 20 is typically the 20-period SMA seed
      const seedSMA = prices.slice(0, 20).reduce((sum, v) => sum + v, 0) / 20;
      assert.strictEqual(Number(ema[19].toFixed(2)), Number(seedSMA.toFixed(2)));

      // Multiplier k = 2 / (20 + 1) = 2 / 21
      const k = 2 / (20 + 1);
      const expectedEMA21 = prices[20] * k + ema[19] * (1 - k);
      assert.strictEqual(
        Number(ema[20].toFixed(4)),
        Number(expectedEMA21.toFixed(4)),
        'EMA must recursively apply smoothing weighting multiplier'
      );
    });
  });

  describe('Chart Canvas Rendering & Multi-layer Overlay', () => {
    it('should render the 20-period overlay line onto the canvas 2D context', () => {
      const canvas = document.createElement('canvas');
      appContainer.appendChild(canvas);

      const chart = new Chart({
        canvas,
        overlays: [{ type: 'SMA', period: 20, color: '#FF9900' }],
      });

      const series = generatePriceSeries(30);
      chart.setData(series);
      chart.render();

      const ctx = canvas.getContext('2d');

      // Overlay rendering verification
      assert.ok(
        ctx.beginPathCalls >= 2,
        'Canvas context must call beginPath for base chart and overlay trendline'
      );
      assert.ok(
        ctx.lineToCalls.length >= 10,
        'Overlay trendline must trace points via lineTo for computed periods'
      );
      assert.ok(
        ctx.strokeStyleHistory.includes('#FF9900'),
        'Canvas context must apply the distinct indicator overlay stroke style'
      );
      assert.ok(ctx.strokeCalls >= 2, 'Canvas context must stroke the overlay path');
    });

    it('should gracefully handle price series with fewer points than indicator period (<20)', () => {
      const canvas = document.createElement('canvas');
      appContainer.appendChild(canvas);

      const chart = new Chart({
        canvas,
        overlays: [{ type: 'SMA', period: 20 }],
      });

      // Provide only 10 data points
      const shortSeries = generatePriceSeries(10);
      assert.doesNotThrow(() => {
        chart.setData(shortSeries);
        chart.render();
      }, 'Chart must not throw an error when data series is shorter than overlay period');
    });
  });

  describe('Indicator Legend Display & Formatting', () => {
    it('should render an indicator legend in the chart view displaying label and value to 2 decimal places', () => {
      const canvas = document.createElement('canvas');
      appContainer.appendChild(canvas);

      const chart = new Chart({
        canvas,
        container: appContainer,
        overlays: [{ type: 'SMA', period: 20, color: '#FF9900' }],
      });

      const series = generatePriceSeries(25, 100);
      chart.setData(series);
      chart.render();

      const legendElement = appContainer.querySelector('.indicator-legend');
      assert.ok(
        legendElement !== null,
        'An indicator legend element (.indicator-legend) must be mounted in the DOM'
      );

      // Verify active indicator label
      assert.match(
        legendElement.textContent,
        /SMA\s*\(?20\)?/i,
        'Legend must include active indicator identifier "SMA (20)"'
      );

      // Compute expected current SMA value: items [5..24] (length 20)
      const last20Prices = series.slice(5, 25).map((d) => d.close);
      const expectedValue = (last20Prices.reduce((a, b) => a + b, 0) / 20).toFixed(2);

      // Verify strictly formatted numerical value to two decimal places
      assert.ok(
        legendElement.textContent.includes(expectedValue),
        `Legend text "${legendElement.textContent}" must contain current value "${expectedValue}" formatted to 2 decimal places`
      );
      assert.match(
        legendElement.textContent,
        /\b\d+\.\d{2}\b/,
        'Indicator value must strictly be displayed with two decimal places'
      );
    });

    it('should display fallback or empty indicator text when overlay value cannot be computed', () => {
      const canvas = document.createElement('canvas');
      appContainer.appendChild(canvas);

      const chart = new Chart({
        canvas,
        container: appContainer,
        overlays: [{ type: 'SMA', period: 20 }],
      });

      // Dataset with 5 items (less than 20 periods)
      chart.setData(generatePriceSeries(5));
      chart.render();

      const legendElement = appContainer.querySelector('.indicator-legend');
      assert.ok(legendElement !== null);
      assert.match(
        legendElement.textContent,
        /SMA\s*\(?20\)?:\s*(--|N\/A)/i,
        'Legend should indicate non-computable status using placeholder (e.g., "--" or "N/A")'
      );
    });
  });

  describe('Integration via Entrypoint (src/main.js)', () => {
    it('should mount chart to document.getElementById("app") and wire the 20-period overlay on init', () => {
      // Execute the application bootstrap
      initApp();

      const canvas = appContainer.querySelector('canvas');
      assert.ok(canvas, 'src/main.js must instantiate and append a canvas inside #app');

      const legend = appContainer.querySelector('.indicator-legend');
      assert.ok(
        legend,
        'src/main.js must mount the indicator legend inside the live application container'
      );

      // Confirm overlay integration is active and visible
      const ctx = canvas.getContext('2d');
      assert.ok(
        ctx.lineToCalls.length > 0,
        'Overlay paths must be computed and drawn on initialization of main.js'
      );
      assert.match(
        legend.textContent,
        /(SMA|EMA)\s*\(?20\)?:\s*\d+\.\d{2}/,
        'Application must display active 20-period overlay indicator and formatted value upon loading'
      );
    });
  });
});