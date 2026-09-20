import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/* Setup minimal DOM and Canvas mock environment for Node.js */
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawCalls = [];
    this.strokeStyle = '#000000';
    this.fillStyle = '#000000';
    this.lineWidth = 1;
  }

  clearRect(x, y, w, h) {
    this.drawCalls.push({ method: 'clearRect', args: { x, y, w, h } });
  }

  fillRect(x, y, w, h) {
    this.drawCalls.push({ method: 'fillRect', args: { x, y, w, h } });
  }

  strokeRect(x, y, w, h) {
    this.drawCalls.push({ method: 'strokeRect', args: { x, y, w, h } });
  }

  beginPath() {
    this.drawCalls.push({ method: 'beginPath', args: {} });
  }

  moveTo(x, y) {
    this.drawCalls.push({ method: 'moveTo', args: { x, y } });
  }

  lineTo(x, y) {
    this.drawCalls.push({ method: 'lineTo', args: { x, y } });
  }

  stroke() {
    this.drawCalls.push({ method: 'stroke', args: {} });
  }
}

class MockElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.width = 1000;
    this.height = 500;
    this._context = null;
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
      return this.children.find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }

  getContext(contextType) {
    if (contextType === '2d') {
      if (!this._context) {
        this._context = new MockCanvasRenderingContext2D(this);
      }
      return this._context;
    }
    return null;
  }
}

/* Initialize global DOM mocks before importing target modules */
const mockElements = new Map();
const appContainer = new MockElement('div', 'app');
mockElements.set('app', appContainer);

globalThis.document = {
  getElementById: (id) => mockElements.get(id) || null,
  createElement: (tag) => new MockElement(tag),
};
globalThis.window = {
  innerWidth: 1024,
  innerHeight: 768,
  document: globalThis.document,
};

/* Target module imports under test */
import { Chart, generateCandleSeries } from '../src/chart.js';
import { mountApp, init } from '../src/main.js';

describe('STORY 1.2.1: Resolve SPARSE_DATA_SERIES (Defect DF-GRAPHICS-01)', () => {
  let appEl;
  let canvasEl;

  beforeEach(() => {
    appEl = new MockElement('div', 'app');
    mockElements.set('app', appEl);
    canvasEl = new MockElement('canvas');
    canvasEl.width = 1000;
    canvasEl.height = 500;
  });

  afterEach(() => {
    mockElements.clear();
  });

  describe('src/chart.js - Candle Data Generation & Density', () => {
    it('should generate a comprehensive series between 50 and 100 data points', () => {
      const series = generateCandleSeries({ count: 80 });
      
      assert.ok(Array.isArray(series), 'Data series must be an array');
      assert.ok(
        series.length >= 50 && series.length <= 100,
        `Expected candle count between 50 and 100, but got: ${series.length}`
      );

      for (const candle of series) {
        assert.ok(typeof candle.open === 'number', 'Candle must contain numeric open price');
        assert.ok(typeof candle.high === 'number', 'Candle must contain numeric high price');
        assert.ok(typeof candle.low === 'number', 'Candle must contain numeric low price');
        assert.ok(typeof candle.close === 'number', 'Candle must contain numeric close price');
        assert.ok(candle.high >= candle.low, 'High price must be greater than or equal to low price');
        assert.ok(
          candle.high >= Math.max(candle.open, candle.close),
          'High price must be >= open and close'
        );
        assert.ok(
          candle.low <= Math.min(candle.open, candle.close),
          'Low price must be <= open and close'
        );
      }
    });

    it('should populate default 50 to 100 candles when no count parameter is provided', () => {
      const defaultSeries = generateCandleSeries();
      
      assert.ok(
        defaultSeries.length >= 50 && defaultSeries.length <= 100,
        `Default generation must yield 50-100 candles, received: ${defaultSeries?.length}`
      );
    });
  });

  describe('src/chart.js - Viewport Sectors and Horizontal Coverage', () => {
    it('should populate all horizontal viewport sectors (at least 3 sectors) across full view width', () => {
      const chart = new Chart({ canvas: canvasEl, candleCount: 75 });
      chart.render();

      const ctx = canvasEl.getContext('2d');
      const xPositions = ctx.drawCalls
        .filter((call) => call.method === 'fillRect' || call.method === 'strokeRect' || call.method === 'moveTo')
        .map((call) => call.args.x);

      assert.ok(xPositions.length >= 50, `Rendered element positions must reflect at least 50 points, got ${xPositions.length}`);

      /* Define 4 uniform horizontal sectors across the 1000px canvas:
         Sector 0: [0, 250), Sector 1: [250, 500), Sector 2: [500, 750), Sector 3: [750, 1000] */
      const sectorCount = 4;
      const sectorWidth = canvasEl.width / sectorCount;
      const sectorBuckets = Array.from({ length: sectorCount }, () => 0);

      for (const x of xPositions) {
        const sectorIndex = Math.min(Math.floor(x / sectorWidth), sectorCount - 1);
        if (sectorIndex >= 0 && sectorIndex < sectorCount) {
          sectorBuckets[sectorIndex]++;
        }
      }

      /* Acceptance Criteria: Must populate across horizontal viewport sectors (defect: fewer than 3) */
      const populatedSectors = sectorBuckets.filter((count) => count > 0).length;
      assert.ok(
        populatedSectors >= 3,
        `Visual elements populated fewer than 3 horizontal sectors (active: ${populatedSectors}/4 sectors). Buckets: ${JSON.stringify(sectorBuckets)}`
      );
      assert.strictEqual(
        populatedSectors,
        sectorCount,
        'All horizontal viewport sectors must be populated across full width'
      );
    });

    it('should span from near-left margin to near-right margin without sparse data gaps', () => {
      const chart = new Chart({ canvas: canvasEl, candleCount: 60 });
      chart.render();

      const ctx = canvasEl.getContext('2d');
      const xCoordinates = ctx.drawCalls
        .filter((call) => call.method === 'fillRect' || call.method === 'strokeRect')
        .map((call) => call.args.x)
        .sort((a, b) => a - b);

      assert.ok(xCoordinates.length >= 50, 'Sufficient rendered visual coordinates must exist');

      const minX = xCoordinates[0];
      const maxX = xCoordinates[xCoordinates.length - 1];

      /* Range check: Must span the viewport from edge-to-edge */
      assert.ok(minX < canvasEl.width * 0.1, `Series must start near left viewport edge; got minX: ${minX}`);
      assert.ok(maxX > canvasEl.width * 0.9, `Series must reach near right viewport edge; got maxX: ${maxX}`);

      /* Gap check: Maximum gap between consecutive candle X coordinates must not be sparse */
      const maxAllowedGap = (canvasEl.width / xCoordinates.length) * 2.5;
      for (let i = 1; i < xCoordinates.length; i++) {
        const gap = xCoordinates[i] - xCoordinates[i - 1];
        assert.ok(
          gap <= maxAllowedGap,
          `Sparse data gap detected at index ${i}: gap of ${gap}px exceeds allowed limit of ${maxAllowedGap}px`
        );
      }
    });
  });

  describe('src/main.js - Active Entrypoint Mounting & Browser Wiring', () => {
    it('should locate document.getElementById("app") and mount the active canvas', () => {
      /* Invoking entrypoint mount */
      const appInstance = mountApp ? mountApp() : init ? init() : null;

      const appNode = globalThis.document.getElementById('app');
      assert.ok(appNode, 'Entrypoint must reference document.getElementById("app")');

      const mountedCanvas = appNode.querySelector('canvas') || appNode.children.find((c) => c.tagName === 'CANVAS');
      assert.ok(mountedCanvas, 'Active canvas element must be mounted into #app container');
    });

    it('should trigger full-width series rendering directly to the active canvas upon mounting', () => {
      if (typeof mountApp === 'function') {
        mountApp();
      } else if (typeof init === 'function') {
        init();
      }

      const mountedCanvas = appEl.querySelector('canvas') || appEl.children.find((c) => c.tagName === 'CANVAS');
      assert.ok(mountedCanvas, 'Canvas must exist in #app');

      const ctx = mountedCanvas.getContext('2d');
      assert.ok(ctx, 'Canvas 2D context must be accessible');

      const drawOps = ctx.drawCalls.filter(
        (op) => op.method === 'fillRect' || op.method === 'strokeRect' || op.method === 'lineTo'
      );

      /* Invariant verification: Ensure active rendering produced 50 to 100 candle elements */
      assert.ok(
        drawOps.length >= 50,
        `Active canvas render should contain at least 50 drawing operations, found ${drawOps.length}`
      );
    });

    it('should throw or cleanly report error if #app mounting target is missing in DOM', () => {
      mockElements.delete('app');

      assert.throws(
        () => {
          if (typeof mountApp === 'function') {
            mountApp();
          } else if (typeof init === 'function') {
            init();
          }
        },
        /Target container #app not found|app container missing/i,
        'Should enforce architectural invariant requiring the active #app entrypoint'
      );
    });
  });
});