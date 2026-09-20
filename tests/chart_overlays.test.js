import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup Mock DOM & HTML Canvas environment before module resolution
class MockCanvasRenderingContext2D {
  constructor() {
    this.calls = [];
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.fillStyle = '#000000';
    this.font = '10px sans-serif';
  }

  beginPath() {
    this.calls.push({ method: 'beginPath', args: [] });
  }

  moveTo(x, y) {
    this.calls.push({ method: 'moveTo', args: [x, y] });
  }

  lineTo(x, y) {
    this.calls.push({ method: 'lineTo', args: [x, y] });
  }

  stroke() {
    this.calls.push({
      method: 'stroke',
      args: [],
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth
    });
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: 'clearRect', args: [x, y, w, h] });
  }

  fillText(text, x, y) {
    this.calls.push({ method: 'fillText', args: [text, x, y] });
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = '';
    this.children = [];
    this.parentElement = null;
    this.textContent = '';
    this.innerHTML = '';
    this.dataset = {};
    this.style = {};
    this._eventListeners = new Map();

    if (this.tagName === 'CANVAS') {
      this.width = 800;
      this.height = 400;
      this._context2d = new MockCanvasRenderingContext2D();
    }
  }

  getContext(type) {
    if (type === '2d' && this.tagName === 'CANVAS') {
      return this._context2d;
    }
    return null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parentElement = null;
    }
    return child;
  }

  querySelector(selector) {
    return this._findChild((el) => {
      if (selector.startsWith('#')) return el.id === selector.slice(1);
      if (selector.startsWith('.')) return el.className.split(' ').includes(selector.slice(1));
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const [attr, val] = selector.slice(1, -1).split('=');
        const cleanVal = val ? val.replace(/['"]/g, '') : null;
        if (attr.startsWith('data-')) {
          const key = attr.slice(5);
          return cleanVal ? el.dataset[key] === cleanVal : key in el.dataset;
        }
      }
      return el.tagName.toLowerCase() === selector.toLowerCase();
    });
  }

  querySelectorAll(selector) {
    const results = [];
    this._findAllChildren((el) => {
      if (selector.startsWith('.')) return el.className.split(' ').includes(selector.slice(1));
      if (selector.startsWith('#')) return el.id === selector.slice(1);
      return el.tagName.toLowerCase() === selector.toLowerCase();
    }, results);
    return results;
  }

  addEventListener(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }
    this._eventListeners.get(event).push(callback);
  }

  dispatchEvent(event) {
    const listeners = this._eventListeners.get(event.type) || [];
    listeners.forEach((cb) => cb(event));
  }

  _findChild(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child._findChild(predicate);
      if (found) return found;
    }
    return null;
  }

  _findAllChildren(predicate, collector) {
    for (const child of this.children) {
      if (predicate(child)) collector.push(child);
      child._findAllChildren(predicate, collector);
    }
  }
}

// Attach mocked DOM globals
const appRoot = new MockElement('div', 'app');
globalThis.document = {
  getElementById(id) {
    if (id === 'app') return appRoot;
    return appRoot.querySelector(`#${id}`);
  },
  createElement(tagName) {
    return new MockElement(tagName);
  },
  querySelector(selector) {
    if (selector === '#app') return appRoot;
    return appRoot.querySelector(selector);
  },
  querySelectorAll(selector) {
    return appRoot.querySelectorAll(selector);
  },
  body: new MockElement('body')
};

globalThis.window = {
  document: globalThis.document,
  addEventListener(event, callback) {
    if (!this._listeners) this._listeners = new Map();
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(callback);
  },
  dispatchEvent(event) {
    const listeners = (this._listeners && this._listeners.get(event.type)) || [];
    listeners.forEach((cb) => cb(event));
  },
  requestAnimationFrame(cb) {
    return setTimeout(cb, 0);
  },
  cancelAnimationFrame(id) {
    clearTimeout(id);
  }
};

// Target Modules
import {
  Chart,
  calculateSMA,
  calculateEMA,
  PERIOD_DEFAULT
} from '../src/chart.js';

import {
  initApp,
  updateRealtimePrice,
  getActiveChart,
  resetApp
} from '../src/main.js';

describe('STORY 27.5.1: MISSING_ANALYTICAL_OVERLAYS (DF-OVERLAYS-01)', () => {
  beforeEach(() => {
    appRoot.children = [];
    appRoot.innerHTML = '';
    appRoot.textContent = '';
  });

  afterEach(() => {
    if (typeof resetApp === 'function') {
      resetApp();
    }
  });

  describe('Moving Average Overlay Mathematical Calculations (src/chart.js)', () => {
    it('should export a default period constant of 20 as required by defect specification', () => {
      assert.strictEqual(
        PERIOD_DEFAULT,
        20,
        'Default moving average period must be strictly 20'
      );
    });

    it('should calculate 20-period Simple Moving Average (SMA) correctly', () => {
      // 25 price points
      const prices = [
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29, // first 20: sum = 390, avg = 19.5
        30, // 2nd 20: sum = 410, avg = 20.5
        31, // 3rd 20: sum = 430, avg = 21.5
        32, // 4th 20: avg = 22.5
        33  // 5th 20: avg = 23.5
      ];

      const smaValues = calculateSMA(prices, 20);

      assert.strictEqual(smaValues.length, prices.length, 'Output length must equal input price length');
      
      // Values before period-1 should be null or undefined (insufficient warm-up window)
      for (let i = 0; i < 19; i++) {
        assert.strictEqual(
          smaValues[i],
          null,
          `Index ${i} should be null before reaching 20 periods`
        );
      }

      // Index 19 is the 20th item
      assert.strictEqual(smaValues[19], 19.5, 'SMA at index 19 must be 19.5');
      assert.strictEqual(smaValues[20], 20.5, 'SMA at index 20 must be 20.5');
      assert.strictEqual(smaValues[21], 21.5, 'SMA at index 21 must be 21.5');
      assert.strictEqual(smaValues[24], 23.5, 'SMA at index 24 must be 23.5');
    });

    it('should calculate 20-period Exponential Moving Average (EMA) correctly', () => {
      // Constant price series
      const constantPrices = Array(30).fill(100);
      const emaValues = calculateEMA(constantPrices, 20);

      assert.strictEqual(emaValues.length, constantPrices.length);

      // Indices before 19 must be null
      for (let i = 0; i < 19; i++) {
        assert.strictEqual(emaValues[i], null);
      }

      // 20th period seeded with SMA = 100, following EMA values must stay 100
      assert.strictEqual(emaValues[19], 100);
      assert.strictEqual(emaValues[29], 100);

      // Verify weighting formula: k = 2 / (period + 1) = 2 / 21
      // EMA_today = Price_today * k + EMA_yesterday * (1 - k)
      const dynamicPrices = Array(20).fill(10).concat([20]); // 21st item is 20
      const dynEma = calculateEMA(dynamicPrices, 20);
      const k = 2 / 21;
      const expectedEma20 = 20 * k + 10 * (1 - k);

      assert.ok(Math.abs(dynEma[20] - expectedEma20) < 1e-9, 'EMA calculation must follow standard EMA weighting');
    });
  });

  describe('Chart Multi-layer Visualization & Indicator Legend (src/chart.js)', () => {
    it('should render both price action and 20-period trendline overlay to the canvas', () => {
      const container = new MockElement('div', 'chart-container');
      const chart = new Chart({
        container,
        overlayPeriod: 20,
        overlayType: 'EMA'
      });

      // Feed at least 25 bars of price data
      const data = Array.from({ length: 25 }, (_, i) => ({
        timestamp: Date.now() + i * 60000,
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 102 + i,
        volume: 1000
      }));

      chart.setData(data);
      chart.render();

      const canvas = container.querySelector('canvas');
      assert.ok(canvas, 'Chart container must contain a <canvas> element');

      const ctx = canvas.getContext('2d');
      assert.ok(ctx, 'Canvas 2D context must be accessible');

      // Check that path operations were performed for overlay line rendering
      const strokeCalls = ctx.calls.filter((c) => c.method === 'stroke');
      assert.ok(
        strokeCalls.length >= 2,
        'Canvas must draw at least two distinct stroke passes: primary price series and moving average overlay'
      );

      const lineToCalls = ctx.calls.filter((c) => c.method === 'lineTo');
      assert.ok(
        lineToCalls.length >= 5, // 25 data points with 20-period MA = 6 MA points rendered
        'Canvas must draw lineTo segments for the 20-period moving average overlay'
      );
    });

    it('should render and update an indicator legend in the chart header with active MA value', () => {
      const container = new MockElement('div', 'chart-container');
      const chart = new Chart({
        container,
        overlayPeriod: 20,
        overlayType: 'SMA'
      });

      const data = Array.from({ length: 25 }, (_, i) => ({
        timestamp: 1700000000000 + i * 60000,
        open: 50 + i,
        high: 55 + i,
        low: 45 + i,
        close: 50 + i,
        volume: 500
      }));

      chart.setData(data);
      chart.render();

      const header = container.querySelector('.chart-header') || container.querySelector('[data-testid="chart-header"]');
      assert.ok(header, 'Chart header must exist within chart container');

      const legend = header.querySelector('.indicator-legend') || header.querySelector('[data-testid="indicator-legend"]');
      assert.ok(legend, 'Chart header must contain .indicator-legend element');

      // Last 20 closes are from i = 5 to 24: close = 50 + i => values 55 through 74
      // Sum = (55 + 74) * 20 / 2 = 1290, Average = 64.5
      assert.match(
        legend.textContent,
        /SMA\s*\(20\)/i,
        'Legend must label the 20-period SMA indicator'
      );
      assert.match(
        legend.textContent,
        /64\.50?/,
        'Legend must display the current active moving average value of 64.50'
      );
    });
  });

  describe('Active Application Entrypoint Mounting & Real-Time Sync (src/main.js)', () => {
    it('should automatically mount chart and analytical overlay to document.getElementById("app")', () => {
      const appContainer = document.getElementById('app');
      assert.strictEqual(appContainer.children.length, 0, 'App container starts empty');

      // Initialize entrypoint
      initApp();

      assert.ok(
        appContainer.children.length > 0,
        'initApp() must mount components directly into document.getElementById("app")'
      );

      const canvas = appContainer.querySelector('canvas');
      assert.ok(canvas, '#app must contain a rendered chart canvas');

      const legend = appContainer.querySelector('.indicator-legend');
      assert.ok(
        legend,
        '#app must contain the analytical overlay indicator legend in active DOM'
      );

      const activeChart = getActiveChart();
      assert.ok(activeChart instanceof Chart, 'Active chart instance must be accessible and configured');
      assert.strictEqual(
        activeChart.overlayPeriod,
        20,
        'Active chart overlay period must be configured to 20'
      );
    });

    it('should update analytical overlay calculations and legend in real time on incoming price ticks', () => {
      initApp();

      const chart = getActiveChart();
      assert.ok(chart, 'Chart must be mounted');

      const initialPrices = Array.from({ length: 20 }, () => 100);
      chart.setData(initialPrices.map((c, idx) => ({
        timestamp: 1000 + idx * 1000,
        open: c,
        high: c,
        low: c,
        close: c
      })));
      chart.render();

      const legend = document.getElementById('app').querySelector('.indicator-legend');
      assert.match(legend.textContent, /100(\.00)?/, 'Legend should initially show 100.00');

      // Push real-time price update: spike price to 142
      // New 20 items: nineteen 100s + one 142 => sum = 2042 => SMA = 102.10
      updateRealtimePrice({
        timestamp: 21000,
        open: 140,
        high: 145,
        low: 139,
        close: 142
      });

      // Canvas context must have been cleared and redrawn
      const canvas = document.getElementById('app').querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const clearCalls = ctx.calls.filter((c) => c.method === 'clearRect');
      assert.ok(clearCalls.length >= 1, 'Real-time update must trigger canvas re-render');

      // Legend must reflect new active moving average calculation
      assert.match(
        legend.textContent,
        /102\.10?/,
        'Indicator legend text must automatically reflect real-time active overlay value (102.10)'
      );
    });

    it('should prevent unmounted or disconnected state violations per architectural invariant', () => {
      initApp();

      const app = document.getElementById('app');
      const canvas = app.querySelector('canvas');
      const chartInstance = getActiveChart();

      assert.strictEqual(
        canvas.parentElement,
        chartInstance.container,
        'Canvas must be strictly attached to the chart component mounted inside #app'
      );
      assert.strictEqual(
        chartInstance.container.parentElement,
        app,
        'Chart container must be a direct child of document.getElementById("app")'
      );
    });
  });
});