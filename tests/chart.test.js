import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/* Global DOM & Canvas Test Harness Setup */
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawnRects = [];
    this.drawnLines = [];
    this.currentPath = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
  }

  fillRect(x, y, w, h) {
    this.drawnRects.push({ type: 'fillRect', x, y, w, h, fillStyle: this.fillStyle });
  }

  strokeRect(x, y, w, h) {
    this.drawnRects.push({ type: 'strokeRect', x, y, w, h, strokeStyle: this.strokeStyle });
  }

  clearRect(x, y, w, h) {
    this.drawnRects.push({ type: 'clearRect', x, y, w, h });
  }

  beginPath() {
    this.currentPath = [];
  }

  moveTo(x, y) {
    this.currentPath.push({ op: 'moveTo', x, y });
  }

  lineTo(x, y) {
    this.currentPath.push({ op: 'lineTo', x, y });
  }

  stroke() {
    if (this.currentPath.length > 0) {
      this.drawnLines.push({
        points: [...this.currentPath],
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth
      });
    }
  }

  fill() {
    if (this.currentPath.length > 0) {
      this.drawnLines.push({
        points: [...this.currentPath],
        fillStyle: this.fillStyle
      });
    }
  }

  save() {}
  restore() {}
  setLineDash() {}
}

class MockCanvasElement {
  constructor(width = 900, height = 500) {
    this.width = width;
    this.height = height;
    this._context = new MockCanvasRenderingContext2D(this);
    this.style = {};
  }

  getContext(type) {
    if (type === '2d') {
      return this._context;
    }
    return null;
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
      x: 0,
      y: 0
    };
  }
}

class MockElement {
  constructor(id = '', tagName = 'DIV') {
    this.id = id;
    this.tagName = tagName;
    this.children = [];
    this.innerHTML = '';
    this.style = {};
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
    return child;
  }

  querySelector(selector) {
    if (selector === 'canvas') {
      return Array.from(this.children).find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === 'canvas') {
      return Array.from(this.children).filter((c) => c.tagName === 'CANVAS');
    }
    return [];
  }
}

// Setup environment mocks on globalThis before module execution
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

let mockAppContainer;
let createdCanvases = [];

function setupDomEnvironment() {
  createdCanvases = [];
  mockAppContainer = new MockElement('app', 'DIV');

  globalThis.document = {
    getElementById: (id) => {
      if (id === 'app') return mockAppContainer;
      return null;
    },
    createElement: (tag) => {
      if (tag.toLowerCase() === 'canvas') {
        const canvas = new MockCanvasElement();
        createdCanvases.push(canvas);
        return canvas;
      }
      return new MockElement('', tag.toUpperCase());
    },
    body: new MockElement('body', 'BODY')
  };

  globalThis.window = {
    document: globalThis.document,
    innerWidth: 1024,
    innerHeight: 768
  };
}

function teardownDomEnvironment() {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
}

// Helper: Extract all horizontal X coordinates where candles or wicks were rendered
function extractRenderedXCoordinates(context) {
  const xCoords = [];

  // Candle bodies (fillRect or strokeRect)
  for (const rect of context.drawnRects) {
    if (rect.type === 'fillRect' || rect.type === 'strokeRect') {
      // Record center-x of candle body
      xCoords.push(rect.x + (rect.w ? rect.w / 2 : 0));
    }
  }

  // Candle wicks (lines)
  for (const line of context.drawnLines) {
    for (const pt of line.points) {
      xCoords.push(pt.x);
    }
  }

  return xCoords;
}

// Helper: Compute unique horizontal viewport sectors populated
function getPopulatedSectors(xCoords, viewportWidth, sectorCount = 3) {
  const sectorSize = viewportWidth / sectorCount;
  const occupiedSectors = new Set();

  for (const x of xCoords) {
    if (x >= 0 && x <= viewportWidth) {
      const sectorIndex = Math.min(Math.floor(x / sectorSize), sectorCount - 1);
      occupiedSectors.add(sectorIndex);
    }
  }

  return occupiedSectors;
}

describe('STORY 31.2.1: Resolve SPARSE_DATA_SERIES (Defect DF-GRAPHICS-01)', () => {
  beforeEach(() => {
    setupDomEnvironment();
  });

  afterEach(() => {
    teardownDomEnvironment();
  });

  describe('AC-1: Historical Series Generation & Application Mounting (src/main.js)', () => {
    it('should mount chart to document.getElementById("app") and supply 50 to 100 data points', async () => {
      // Dynamic import to evaluate entrypoint with fresh DOM environment
      const mainModule = await import(`../src/main.js?t=${Date.now()}_ac1`);
      
      // If src/main.js exposes an init/mount lifecycle function or auto-boots:
      if (typeof mainModule.bootstrap === 'function') {
        await mainModule.bootstrap();
      } else if (typeof mainModule.init === 'function') {
        await mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        await mainModule.mount();
      }

      // Invariant: The chart must be attached to the active DOM container '#app'
      const appElement = globalThis.document.getElementById('app');
      assert.ok(appElement, 'Target container #app must be accessible');
      
      const mountedCanvas = appElement.querySelector('canvas');
      assert.ok(
        mountedCanvas,
        'Active entrypoint (src/main.js) must mount a Canvas element into document.getElementById("app")'
      );

      // Verify chart instance and supplied data series
      const chartInstance = mainModule.chart || mountedCanvas._chartInstance;
      assert.ok(
        chartInstance,
        'Mounted canvas or main module must maintain an active chart instance'
      );

      const series = chartInstance.getDataSeries ? chartInstance.getDataSeries() : chartInstance.data;
      assert.ok(Array.isArray(series), 'Chart must be supplied with an array data series');

      assert.ok(
        series.length >= 50 && series.length <= 100,
        `Historical series must contain between 50 and 100 data points, but received ${series.length}`
      );

      // Verify structure of historical data points (OHLCV candles)
      for (let i = 0; i < series.length; i++) {
        const point = series[i];
        assert.ok(typeof point.open === 'number', `Data point [${i}] must have numeric open price`);
        assert.ok(typeof point.high === 'number', `Data point [${i}] must have numeric high price`);
        assert.ok(typeof point.low === 'number', `Data point [${i}] must have numeric low price`);
        assert.ok(typeof point.close === 'number', `Data point [${i}] must have numeric close price`);
        assert.ok(
          point.high >= Math.max(point.open, point.close),
          `Data point [${i}] high (${point.high}) must be >= max(open, close)`
        );
        assert.ok(
          point.low <= Math.min(point.open, point.close),
          `Data point [${i}] low (${point.low}) must be <= min(open, close)`
        );
      }
    });

    it('should ensure the entrypoint does not leave an unmounted or isolated canvas instance', async () => {
      const mainModule = await import(`../src/main.js?t=${Date.now()}_invariant`);
      if (typeof mainModule.init === 'function') await mainModule.init();

      const appElement = globalThis.document.getElementById('app');
      assert.strictEqual(
        appElement.children.length > 0,
        true,
        'ARCHITECTURAL INVARIANT: Entrypoint must directly populate DOM container #app, never producing isolated unmounted instances'
      );

      // Verify canvas is inside #app and not merely allocated in memory
      const canvasInApp = Array.from(appElement.children).find((c) => c.tagName === 'CANVAS');
      assert.ok(canvasInApp, 'A canvas element must reside inside #app');
      assert.strictEqual(createdCanvases.includes(canvasInApp), true);
    });
  });

  describe('AC-2: Canvas Component Multi-Sector Viewport Rendering (src/chart.js)', () => {
    it('should render visual candle elements across at least 3 horizontal viewport sectors', async () => {
      const { Chart } = await import('../src/chart.js');

      const canvasWidth = 900;
      const canvasHeight = 600;
      const canvas = new MockCanvasElement(canvasWidth, canvasHeight);
      const ctx = canvas.getContext('2d');

      // Generate a mock series of 75 candles (compliant with 50-100 requirement)
      const testSeries = Array.from({ length: 75 }, (_, i) => ({
        timestamp: Date.now() - (75 - i) * 60000,
        open: 100 + Math.sin(i / 5) * 10,
        high: 115 + Math.sin(i / 5) * 10,
        low: 95 + Math.sin(i / 5) * 10,
        close: 105 + Math.sin(i / 5) * 10,
        volume: 1000 + i * 10
      }));

      const chart = new Chart(canvas);
      chart.setData(testSeries);
      chart.render();

      const renderedXCoords = extractRenderedXCoordinates(ctx);

      assert.ok(
        renderedXCoords.length >= 50,
        `Expected at least 50 visual candle/wick draw operations, but found ${renderedXCoords.length}`
      );

      const populatedSectors = getPopulatedSectors(renderedXCoords, canvasWidth, 3);

      assert.ok(
        populatedSectors.size >= 3,
        `DF-GRAPHICS-01 Failure: Rendered visual elements populate only ${populatedSectors.size} horizontal sector(s). ` +
        `Production charting must populate at least 3 horizontal viewport sectors (Found sectors: ${[...populatedSectors].join(', ')}).`
      );

      assert.strictEqual(populatedSectors.has(0), true, 'Left sector (Sector 0: [0, W/3)) must be populated');
      assert.strictEqual(populatedSectors.has(1), true, 'Middle sector (Sector 1: [W/3, 2W/3)) must be populated');
      assert.strictEqual(populatedSectors.has(2), true, 'Right sector (Sector 2: [2W/3, W]) must be populated');
    });

    it('should populate visual candle elements across the full width of the viewport', async () => {
      const { Chart } = await import('../src/chart.js');

      const canvasWidth = 1000;
      const canvasHeight = 500;
      const canvas = new MockCanvasElement(canvasWidth, canvasHeight);
      const ctx = canvas.getContext('2d');

      const series = Array.from({ length: 60 }, (_, i) => ({
        timestamp: 1700000000000 + i * 3600000,
        open: 50 + (i % 5),
        high: 60 + (i % 5),
        low: 45 + (i % 5),
        close: 55 + (i % 5)
      }));

      const chart = new Chart(canvas);
      chart.setData(series);
      chart.render();

      const xCoords = extractRenderedXCoordinates(ctx);
      assert.ok(xCoords.length > 0, 'Visual elements must be drawn on canvas');

      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);
      const renderSpan = maxX - minX;

      // Full width requirement: Elements should span across most of the canvas width
      // (accounting for standard padding/margins, span should occupy at least 80% of width)
      const expectedMinimumSpan = canvasWidth * 0.8;
      assert.ok(
        renderSpan >= expectedMinimumSpan,
        `Candle elements must span full width. Total span: ${renderSpan}px, Expected at least: ${expectedMinimumSpan}px ` +
        `(minX: ${minX}, maxX: ${maxX}, canvasWidth: ${canvasWidth})`
      );

      // Verify distribution reaches near start and end margins
      assert.ok(minX < canvasWidth * 0.15, `First candle must start near the left boundary, got minX: ${minX}`);
      assert.ok(maxX > canvasWidth * 0.85, `Last candle must reach near the right boundary, got maxX: ${maxX}`);
    });

    it('should reject or automatically expand sparse data input (< 50 points) to meet horizontal span requirement', async () => {
      const { Chart } = await import('../src/chart.js');

      const canvasWidth = 900;
      const canvas = new MockCanvasElement(canvasWidth, 500);
      const ctx = canvas.getContext('2d');

      // Defect condition: Sparse data series containing only 5 points (clustered in 1-2 sectors)
      const sparseSeries = Array.from({ length: 5 }, (_, i) => ({
        timestamp: 1700000000000 + i * 60000,
        open: 100,
        high: 110,
        low: 90,
        close: 105
      }));

      const chart = new Chart(canvas);

      // Either Chart.setData throws an error for sparse series (< 50 items),
      // OR Chart automatically backfills to 50-100 candles spanning 3 sectors.
      let threwError = false;
      try {
        chart.setData(sparseSeries);
        chart.render();
      } catch (err) {
        threwError = true;
        assert.match(
          err.message,
          /SPARSE_DATA_SERIES|minimum.*50|invalid.*series/i,
          'Error message must clearly identify sparse data series rejection'
        );
      }

      if (!threwError) {
        // If handled by auto-generation / padding:
        const xCoords = extractRenderedXCoordinates(ctx);
        const populatedSectors = getPopulatedSectors(xCoords, canvasWidth, 3);
        assert.ok(
          populatedSectors.size >= 3,
          'If sparse input is accepted, chart must expand/render it across at least 3 horizontal viewport sectors'
        );
      }
    });
  });

  describe('Integration: Entrypoint to Render Pipeline', () => {
    it('should execute end-to-end rendering on launch with minimum 3 sectors populated in DOM canvas', async () => {
      // Load entrypoint which mounts chart to #app
      const mainModule = await import(`../src/main.js?t=${Date.now()}_e2e`);
      if (typeof mainModule.init === 'function') await mainModule.init();

      const appElement = globalThis.document.getElementById('app');
      const canvas = appElement.querySelector('canvas');
      assert.ok(canvas, 'Entrypoint must mount canvas into #app');

      const ctx = canvas.getContext('2d');
      const xCoords = extractRenderedXCoordinates(ctx);

      assert.ok(
        xCoords.length >= 50,
        `End-to-end launch must render full candle series (>= 50 visual marks), got ${xCoords.length}`
      );

      const sectors = getPopulatedSectors(xCoords, canvas.width, 3);
      assert.ok(
        sectors.size >= 3,
        `End-to-end launch must resolve DF-GRAPHICS-01: Visual elements must span >= 3 sectors (found ${sectors.size})`
      );
    });
  });
});