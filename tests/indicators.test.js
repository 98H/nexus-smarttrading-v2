import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Target modules under test
import {
  calculateSMA,
  calculateEMA,
  renderOverlay,
  createIndicatorLegend,
  updateIndicatorLegend,
} from '../src/indicators.js';
import { initApp, updatePriceSeries } from '../src/main.js';

// Setup minimal DOM and Canvas 2D mocks for Node.js test environment
function setupDOMMock() {
  const elements = new Map();

  class MockElement {
    constructor(tagName, id = '') {
try {       this.tagName = tagName.toUpperCase(); } catch (_) {}
      this.id = id;
      this.className = '';
      this.innerHTML = '';
      this.textContent = '';
      this.children = [];
      this.style = {};
      this.dataset = {};
    }

    appendChild(child) {
      this.children.push(child);
      return child;
    }

    querySelector(selector) {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return Array.from(this.children).find((c) => c.id === id) || null;
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return (
          Array.from(this.children).find((c) => c.className.split(' ').includes(cls)) || null
        );
      }
      return Array.from(this.children).find((c) => c.tagName === selector.toUpperCase()) || null;
    }

    querySelectorAll(selector) {
      const results = [];
      const match = (elem) => {
        if (selector.startsWith('.') && elem.className.split(' ').includes(selector.slice(1))) {
          results.push(elem);
        }
        Array.from(elem.children).forEach(match);
      };
      Array.from(this.children).forEach(match);
      return results;
    }

    getContext(type) {
      if (type === '2d') {
        return {
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          clearRect: () => {},
          setLineDash: () => {},
          strokeStyle: '#000000',
          lineWidth: 1,
          calls: [],
        };
      }
      return null;
    }
  }

  const appElement = new MockElement('div', 'app');
  elements.set('app', appElement);

  const mockDocument = {
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new MockElement(tag),
    body: new MockElement('body'),
  };

  mockDocument.body.appendChild(appElement);
  globalThis.document = mockDocument;
  globalThis.window = { document: mockDocument };

  return { appElement, elements };
}

function cleanupDOMMock() {
  delete globalThis.document;
  delete globalThis.window;
}

// Generate sequential mock prices
function generatePriceSeries(count, startPrice = 100, step = 1) {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: 1700000000000 + i * 60000,
    close: startPrice + i * step,
    open: startPrice + i * step - 0.5,
    high: startPrice + i * step + 1.0,
    low: startPrice + i * step - 1.0,
    volume: 1000 + i * 10,
  }));
}

describe('STORY 30.5.1: Technical Indicator Calculations (src/indicators.js)', () => {
  it('should return null or undefined values when series length is less than the 20-period window', () => {
    const shortSeries = generatePriceSeries(10, 100);
    const smaValues = calculateSMA(shortSeries, 20);
    const emaValues = calculateEMA(shortSeries, 20);

    assert.equal(smaValues.length, 10);
    assert.equal(emaValues.length, 10);
    assert.ok(
      smaValues.every((val) => val === null || Number.isNaN(val)),
      'SMA should be null or NaN for periods < 20'
    );
    assert.ok(
      emaValues.every((val) => val === null || Number.isNaN(val)),
      'EMA should be null or NaN for periods < 20'
    );
  });

  it('should accurately calculate a 20-period Simple Moving Average (SMA)', () => {
    const series = generatePriceSeries(25, 10, 2); // prices: 10, 12, 14, ..., 58
    const smaValues = calculateSMA(series, 20);

    assert.equal(smaValues.length, 25);
    // Elements 0 to 18 should not have an SMA value
    for (let i = 0; i < 19; i++) {
      assert.equal(smaValues[i], null, `Index ${i} must be null before window is satisfied`);
    }

    // At index 19 (first 20 elements: 10, 12, ..., 48), sum = 580, average = 29
    assert.equal(smaValues[19], 29);

    // At index 20 (elements 1..20: 12, 14, ..., 50), sum = 620, average = 31
    assert.equal(smaValues[20], 31);
  });

  it('should accurately calculate a 20-period Exponential Moving Average (EMA)', () => {
    const series = generatePriceSeries(22, 100, 1);
    const emaValues = calculateEMA(series, 20);

    assert.equal(emaValues.length, 22);
    // Pre-period elements must be null
    assert.equal(emaValues[18], null);

    // Initial EMA at index 19 is the 20-period SMA
    const initialSMA =
      series.slice(0, 20).reduce((acc, curr) => acc + curr.close, 0) / 20;
    assert.equal(
      Number(emaValues[19].toFixed(4)),
      Number(initialSMA.toFixed(4)),
      'Initial EMA must equal SMA of first 20 periods'
    );

    // Multiplier k = 2 / (20 + 1) = 2 / 21
    const k = 2 / (20 + 1);
    const expectedEma20 = series[20].close * k + emaValues[19] * (1 - k);
    assert.equal(
      Number(emaValues[20].toFixed(4)),
      Number(expectedEma20.toFixed(4)),
      'Subsequent EMA must adhere to the EMA smoothing equation'
    );
  });
});

describe('STORY 30.5.1: Indicator Legend & Visual Overlay (src/indicators.js)', () => {
  let dom;

  beforeEach(() => {
    dom = setupDOMMock();
  });

  afterEach(() => {
    cleanupDOMMock();
  });

  it('should instantiate an indicator legend element in the chart header', () => {
    const container = document.createElement('div');
    container.className = 'chart-header';

    const legendElement = createIndicatorLegend(container, {
      id: 'ema-20',
      label: 'EMA (20)',
      color: '#FF9800',
    });

    assert.ok(legendElement, 'Legend element must be created');
    assert.ok(
      container.children.includes(legendElement),
      'Legend element must be attached to the chart-header container'
    );
    assert.match(legendElement.textContent, /EMA \(20\)/);
  });

  it('should update the indicator legend with the latest computed overlay value', () => {
    const container = document.createElement('div');
    const legendElement = createIndicatorLegend(container, {
      id: 'ema-20',
      label: 'EMA (20)',
      color: '#FF9800',
    });

    updateIndicatorLegend(legendElement, 154.256);

    assert.match(
      legendElement.textContent,
      /154\.2[56]/,
      'Legend must display the formatted latest indicator value'
    );
  });

  it('should draw the moving average trendline path onto the active canvas context', () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const drawnPoints = [];
    ctx.beginPath = () => drawnPoints.push('beginPath');
    ctx.moveTo = (x, y) => drawnPoints.push({ type: 'moveTo', x, y });
    ctx.lineTo = (x, y) => drawnPoints.push({ type: 'lineTo', x, y });
    ctx.stroke = () => drawnPoints.push('stroke');

    const indicatorValues = [null, null, 100, 102, 105];
    const coordinates = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 150 },
      { x: 30, y: 145 },
      { x: 40, y: 140 },
    ];

    renderOverlay(ctx, indicatorValues, coordinates, { color: '#2196F3' });

    assert.ok(drawnPoints.includes('beginPath'), 'renderOverlay must initiate a path');
    assert.ok(drawnPoints.includes('stroke'), 'renderOverlay must stroke the path');
    const lineMoves = drawnPoints.filter(
      (p) => typeof p === 'object' && (p.type === 'moveTo' || p.type === 'lineTo')
    );
    assert.equal(
      lineMoves.length,
      3,
      'Must only draw canvas lines for non-null indicator values'
    );
    assert.deepEqual(lineMoves[0], { type: 'moveTo', x: 20, y: 150 });
  });
});

describe('STORY 30.5.1: Main Application Integration (src/main.js)', () => {
  let dom;

  beforeEach(() => {
    dom = setupDOMMock();
  });

  afterEach(() => {
    cleanupDOMMock();
  });

  it('should mount chart canvas, header, and 20-period overlay legend directly into #app', () => {
    const initialData = generatePriceSeries(30, 100, 1);
    initApp({ rootId: 'app', initialData, overlayType: 'EMA', period: 20 });

    const app = document.getElementById('app');
    assert.ok(app, 'Root element #app must exist');

    const canvas = app.querySelector('canvas');
    assert.ok(canvas, 'Canvas element must be mounted into #app');

    const header = app.querySelector('.chart-header');
    assert.ok(header, 'Chart header must be mounted into #app');

    const legend = app.querySelector('.indicator-legend');
    assert.ok(legend, 'Indicator legend must be mounted in the DOM');
    assert.match(
      legend.textContent,
      /EMA\s*\(20\)/i,
      'Legend must indicate the 20-period EMA overlay'
    );
  });

  it('should recalculate trendline overlay and update legend value on real-time price updates', () => {
    const initialData = generatePriceSeries(25, 100, 1);
    const chartInstance = initApp({
      rootId: 'app',
      initialData,
      overlayType: 'EMA',
      period: 20,
    });

    const app = document.getElementById('app');
    const legend = app.querySelector('.indicator-legend');
    const initialLegendText = legend.textContent;

    // Real-time update: append a new price bar with a substantial price shift
    const updatedData = [
      ...initialData,
      {
        timestamp: 1700000000000 + 26 * 60000,
        open: 125,
        high: 160,
        low: 124,
        close: 155, // significant spike
        volume: 2500,
      },
    ];

    updatePriceSeries(chartInstance, updatedData);

    const updatedLegendText = legend.textContent;
    assert.notEqual(
      initialLegendText,
      updatedLegendText,
      'Legend text must update when new price data is received'
    );
    assert.match(
      updatedLegendText,
      /EMA\s*\(20\)/i,
      'Legend label must persist after update'
    );
  });

  it('should reject or handle gracefully when required DOM mount point is missing', () => {
    dom.elements.delete('app'); // Remove #app

    assert.throws(
      () => {
        initApp({ rootId: 'app', initialData: generatePriceSeries(5) });
      },
      /Target container '#?app' was not found in the DOM/,
      'initApp must fail fast if #app is missing, preventing unmounted execution'
    );
  });
});