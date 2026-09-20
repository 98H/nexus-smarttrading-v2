import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Helper: In-memory mock for 2D canvas context to verify rendering instructions and sequence
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
    this._strokeStyle = '#000000';
    this._fillStyle = '#000000';
    this._lineWidth = 1;
    this._font = '10px sans-serif';
    this._textAlign = 'left';
    this._textBaseline = 'alphabetic';
  }

  get strokeStyle() { return this._strokeStyle; }
  set strokeStyle(val) { this._strokeStyle = val; }

  get fillStyle() { return this._fillStyle; }
  set fillStyle(val) { this._fillStyle = val; }

  get lineWidth() { return this._lineWidth; }
  set lineWidth(val) { this._lineWidth = val; }

  get font() { return this._font; }
  set font(val) { this._font = val; }

  get textAlign() { return this._textAlign; }
  set textAlign(val) { this._textAlign = val; }

  get textBaseline() { return this._textBaseline; }
  set textBaseline(val) { this._textBaseline = val; }

  _record(method, args) {
    this.calls.push({
      method,
      args,
      index: this.calls.length,
      strokeStyle: this.strokeStyle,
      fillStyle: this.fillStyle,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline
    });
  }

  beginPath() { this._record('beginPath', []); }
  closePath() { this._record('closePath', []); }
  moveTo(x, y) { this._record('moveTo', [x, y]); }
  lineTo(x, y) { this._record('lineTo', [x, y]); }
  stroke() { this._record('stroke', []); }
  fill() { this._record('fill', []); }
  fillRect(x, y, w, h) { this._record('fillRect', [x, y, w, h]); }
  strokeRect(x, y, w, h) { this._record('strokeRect', [x, y, w, h]); }
  clearRect(x, y, w, h) { this._record('clearRect', [x, y, w, h]); }
  fillText(text, x, y, maxWidth) { this._record('fillText', [text, x, y, maxWidth]); }
  strokeText(text, x, y, maxWidth) { this._record('strokeText', [text, x, y, maxWidth]); }
  save() { this._record('save', []); }
  restore() { this._record('restore', []); }
  setLineDash(dash) { this._record('setLineDash', [dash]); }
  measureText(text) {
    return { width: String(text).length * 7 };
  }
}

// Helper: In-memory mock for HTML Canvas Element
class MockCanvasElement {
  constructor(width = 800, height = 500) {
    this.tagName = 'CANVAS';
    this.width = width;
    this.height = height;
    this.style = {};
    this.attributes = new Map();
    this.context = new MockCanvasRenderingContext2D(this);
  }

  getContext(type) {
    if (type === '2d') return this.context;
    return null;
  }

  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) || null; }
  getBoundingClientRect() {
    return { top: 0, left: 0, width: this.width, height: this.height, right: this.width, bottom: this.height };
  }
}

// Helper: In-memory mock DOM node
class MockElement {
  constructor(tagName = 'DIV', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.innerHTML = '';
  }

  appendChild(node) {
    this.children.push(node);
    node.parentElement = this;
    return node;
  }

  removeChild(node) {
    const idx = this.children.indexOf(node);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      node.parentElement = null;
    }
    return node;
  }

  querySelector(selector) {
    if (selector === 'canvas') {
      return this.children.find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === 'canvas') {
      return this.children.filter((c) => c.tagName === 'CANVAS');
    }
    return [];
  }
}

// Test fixtures for OHLCV Candlestick dataset
const SAMPLE_CANDLESTICKS = [
  { time: 1700000000, open: 150.0, high: 155.5, low: 148.0, close: 154.0 },
  { time: 1700086400, open: 154.0, high: 158.0, low: 152.5, close: 153.0 },
  { time: 1700172800, open: 153.0, high: 160.0, low: 151.0, close: 159.5 },
  { time: 1700259200, open: 159.5, high: 161.0, low: 157.0, close: 158.0 },
  { time: 1700345600, open: 158.0, high: 165.0, low: 156.5, close: 164.0 }
];

describe('STORY 1.3.1: Resolve MISSING_COORDINATE_AXES (Defect ID: DF-SCALES-01)', () => {
  let originalDocument;
  let originalWindow;
  let mockAppElement;
  let createdCanvases;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    createdCanvases = [];
    mockAppElement = new MockElement('DIV', 'app');

    const domRegistry = new Map();
    domRegistry.set('app', mockAppElement);

    // Install deterministic DOM mocks on globalThis
    globalThis.document = {
      getElementById(id) {
        return domRegistry.get(id) || null;
      },
      createElement(tagName) {
        if (tagName.toLowerCase() === 'canvas') {
          const canvas = new MockCanvasElement();
          createdCanvases.push(canvas);
          return canvas;
        }
        return new MockElement(tagName);
      },
      body: new MockElement('BODY')
    };

    globalThis.window = {
      document: globalThis.document,
      requestAnimationFrame: (cb) => { cb(Date.now()); return 1; },
      cancelAnimationFrame: () => {}
    };
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  describe('AC 1: Coordinate gridlines rendered behind candlesticks', () => {
    it('must render horizontal and vertical gridlines before rendering any candlestick bodies or wicks', async () => {
      const { Chart } = await import('../src/chart.js');

      const canvas = new MockCanvasElement(800, 500);
      const chart = new Chart(canvas, {
        layout: { rightMargin: 60, bottomMargin: 30 }
      });

      chart.setData(SAMPLE_CANDLESTICKS);
      chart.draw();

      const ctx = canvas.getContext('2d');
      const calls = ctx.calls;

      assert.ok(calls.length > 0, 'Canvas context should record drawing operations');

      // Identify horizontal gridlines (lines extending across the plot area horizontally)
      const horizontalGridlines = calls.filter((c, idx) => {
        if (c.method === 'moveTo') {
          const next = calls[idx + 1];
          if (next && next.method === 'lineTo') {
            const [x1, y1] = c.args;
            const [x2, y2] = next.args;
            const isHorizontal = Math.abs(y1 - y2) < 0.001 && Math.abs(x2 - x1) >= 400;
            return isHorizontal;
          }
        }
        return false;
      });

      // Identify vertical gridlines (lines extending across the plot area vertically)
      const verticalGridlines = calls.filter((c, idx) => {
        if (c.method === 'moveTo') {
          const next = calls[idx + 1];
          if (next && next.method === 'lineTo') {
            const [x1, y1] = c.args;
            const [x2, y2] = next.args;
            const isVertical = Math.abs(x1 - x2) < 0.001 && Math.abs(y2 - y1) >= 200;
            return isVertical;
          }
        }
        return false;
      });

      assert.ok(
        horizontalGridlines.length >= 2,
        `Expected at least 2 horizontal gridlines across the chart, found: ${horizontalGridlines.length}`
      );
      assert.ok(
        verticalGridlines.length >= 2,
        `Expected at least 2 vertical gridlines across the chart, found: ${verticalGridlines.length}`
      );

      // Locate the first candlestick render operation (typically fillRect / strokeRect for body or stroke for wick)
      const firstCandleOpIndex = calls.findIndex((c) => {
        // Candlestick bodies are rendered as rectangles or wick strokes that correlate with data
        return c.method === 'fillRect' || (c.method === 'strokeRect' && c.args[2] > 2);
      });

      assert.ok(
        firstCandleOpIndex !== -1,
        'Expected candlestick bodies to be drawn using fillRect/strokeRect'
      );

      // Find the last gridline call index
      const lastHorizontalIndex = Math.max(...horizontalGridlines.map(h => h.index));
      const lastVerticalIndex = Math.max(...verticalGridlines.map(v => v.index));
      const lastGridlineIndex = Math.max(lastHorizontalIndex, lastVerticalIndex);

      // Verify gridlines are drawn BEHIND the candlesticks (chronologically earlier in canvas pipeline)
      assert.ok(
        lastGridlineIndex < firstCandleOpIndex,
        `Gridlines must be rendered behind candlesticks. Last gridline op was at index ${lastGridlineIndex}, but first candle op occurred at index ${firstCandleOpIndex}`
      );
    });
  });

  describe('AC 2: Right-hand price scale and bottom time scale with ticks and labels', () => {
    it('must render right-hand price scale axis with tick marks and formatted price labels', async () => {
      const { Chart } = await import('../src/chart.js');

      const canvasWidth = 800;
      const canvasHeight = 500;
      const rightMargin = 70;
      const canvas = new MockCanvasElement(canvasWidth, canvasHeight);

      const chart = new Chart(canvas, {
        layout: { rightMargin, bottomMargin: 40 }
      });

      chart.setData(SAMPLE_CANDLESTICKS);
      chart.draw();

      const calls = canvas.getContext('2d').calls;
      const plotWidth = canvasWidth - rightMargin;

      // Price scale ticks: lines positioned around the right boundary (x >= plotWidth)
      const priceTickCalls = calls.filter((c, idx) => {
        if (c.method === 'moveTo') {
          const next = calls[idx + 1];
          if (next && next.method === 'lineTo') {
            const [x1, y1] = c.args;
            const [x2, y2] = next.args;
            // Short horizontal tick mark located on the right axis border
            const isTick = Math.abs(y1 - y2) < 0.001 && Math.abs(x2 - x1) <= 10 && x1 >= plotWidth - 1;
            return isTick;
          }
        }
        return false;
      });

      assert.ok(
        priceTickCalls.length >= 3,
        `Expected at least 3 tick marks on the right-hand price axis, found: ${priceTickCalls.length}`
      );

      // Price labels: text elements positioned on the right scale (x >= plotWidth)
      const priceTextCalls = calls.filter((c) => {
        if (c.method === 'fillText') {
          const [text, x, y] = c.args;
          const isRightAligned = x >= plotWidth;
          const isNumericPrice = !isNaN(parseFloat(String(text).replace(/[^0-9.-]+/g, '')));
          return isRightAligned && isNumericPrice;
        }
        return false;
      });

      assert.ok(
        priceTextCalls.length >= 3,
        `Expected at least 3 price labels rendered on right axis, found: ${priceTextCalls.length}`
      );

      // Verify price label values reflect the range of data (between min 148.0 and max 165.0)
      const parsedPrices = priceTextCalls.map(c => parseFloat(String(c.args[0]).replace(/[^0-9.-]+/g, '')));
      const hasMinPriceNearby = parsedPrices.some(p => p <= 150.0);
      const hasMaxPriceNearby = parsedPrices.some(p => p >= 160.0);

      assert.ok(
        hasMinPriceNearby && hasMaxPriceNearby,
        `Price scale labels must encompass dataset range [148, 165], found: ${JSON.stringify(parsedPrices)}`
      );
    });

    it('must render bottom time scale axis with tick marks and formatted time labels', async () => {
      const { Chart } = await import('../src/chart.js');

      const canvasWidth = 800;
      const canvasHeight = 500;
      const bottomMargin = 40;
      const canvas = new MockCanvasElement(canvasWidth, canvasHeight);

      const chart = new Chart(canvas, {
        layout: { rightMargin: 60, bottomMargin }
      });

      chart.setData(SAMPLE_CANDLESTICKS);
      chart.draw();

      const calls = canvas.getContext('2d').calls;
      const plotHeight = canvasHeight - bottomMargin;

      // Time scale ticks: short vertical line marks positioned around the bottom boundary (y >= plotHeight)
      const timeTickCalls = calls.filter((c, idx) => {
        if (c.method === 'moveTo') {
          const next = calls[idx + 1];
          if (next && next.method === 'lineTo') {
            const [x1, y1] = c.args;
            const [x2, y2] = next.args;
            // Short vertical tick mark located on the bottom axis line
            const isTick = Math.abs(x1 - x2) < 0.001 && Math.abs(y2 - y1) <= 10 && y1 >= plotHeight - 1;
            return isTick;
          }
        }
        return false;
      });

      assert.ok(
        timeTickCalls.length >= 3,
        `Expected at least 3 tick marks on the bottom time axis, found: ${timeTickCalls.length}`
      );

      // Time labels: text elements positioned in the bottom margin (y >= plotHeight)
      const timeTextCalls = calls.filter((c) => {
        if (c.method === 'fillText') {
          const [, , y] = c.args;
          return y >= plotHeight;
        }
        return false;
      });

      assert.ok(
        timeTextCalls.length >= 3,
        `Expected at least 3 time labels rendered on the bottom time axis, found: ${timeTextCalls.length}`
      );

      // Verify time labels are formatted strings (not empty, not NaN)
      timeTextCalls.forEach((call) => {
        const text = String(call.args[0]).trim();
        assert.ok(text.length > 0, 'Time scale text label must not be empty');
        assert.notEqual(text, 'NaN', 'Time scale text label must not be NaN');
        assert.notEqual(text, 'undefined', 'Time scale text label must not be undefined');
      });
    });
  });

  describe('AC 3: Entrypoint (src/main.js) mounting and coordinate axes activation', () => {
    it('must locate #app, create/mount the canvas, and render coordinate axes & gridlines', async () => {
      // Dynamic import with timestamp to ensure evaluation against our mocked DOM
      const mainModule = await import(`../src/main.js?t=${Date.now()}`);

      // If main.js exports an init or bootstrap function, invoke it; otherwise module execution should mount
      if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      }

      // Assert canvas is mounted to #app
      const mountedCanvas = mockAppElement.querySelector('canvas');
      assert.ok(mountedCanvas, 'Canvas must be mounted directly into document.getElementById("app")');

      const calls = mountedCanvas.getContext('2d').calls;
      assert.ok(
        calls.length > 0,
        'Mounted canvas draw routine must have executed on entrypoint initialization'
      );

      // Verify gridlines exist on the mounted canvas
      const hasGridlineStroke = calls.some(c => c.method === 'stroke');
      assert.ok(hasGridlineStroke, 'Gridlines and axes strokes must be rendered on the mounted canvas');

      // Verify text calls exist on the mounted canvas for coordinate labels (both price and time axes)
      const textCalls = calls.filter(c => c.method === 'fillText');
      assert.ok(
        textCalls.length >= 4,
        `Mounted chart must render coordinate labels (price and time axes). Found ${textCalls.length} labels.`
      );
    });

    it('must not produce an isolated canvas unattached to the live DOM tree', async () => {
      // Ensure that all canvases created during initialization are attached to the DOM
      const mainModule = await import(`../src/main.js?test_isolate=${Date.now()}`);
      if (typeof mainModule.init === 'function') {
        mainModule.init();
      }

      assert.ok(
        createdCanvases.length > 0,
        'At least one canvas must be instantiated by the application entrypoint'
      );

      createdCanvases.forEach((canvas, index) => {
        assert.ok(
          canvas.parentElement !== null,
          `Canvas instance #${index} must not be floating unmounted. It must be attached to the DOM.`
        );
        assert.strictEqual(
          canvas.parentElement.id,
          'app',
          `Canvas instance #${index} must be mounted inside the active container (#app).`
        );
      });
    });
  });
});