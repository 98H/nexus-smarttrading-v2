import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Target modules under test
import { Chart, renderGridlines, renderPriceAxis } from '../src/chart.js';
import { mountApp, init } from '../src/main.js';

/**
 * Mock CanvasRenderingContext2D to record 2D drawing commands deterministically.
 */
class MockCanvasRenderingContext2D {
  constructor() {
    this.recordedOps = [];
    this.strokeStyle = '#000000';
    this.fillStyle = '#000000';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
  }

  beginPath() {
    this.recordedOps.push({ type: 'beginPath' });
  }

  moveTo(x, y) {
    this.recordedOps.push({ type: 'moveTo', x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
  }

  lineTo(x, y) {
    this.recordedOps.push({ type: 'lineTo', x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
  }

  stroke() {
    this.recordedOps.push({ type: 'stroke', strokeStyle: this.strokeStyle, lineWidth: this.lineWidth });
  }

  fillText(text, x, y, maxWidth) {
    this.recordedOps.push({
      type: 'fillText',
      text: String(text),
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      maxWidth
    });
  }

  measureText(text) {
    return { width: String(text).length * 6 };
  }

  clearRect(x, y, w, h) {
    this.recordedOps.push({ type: 'clearRect', x, y, w, h });
  }

  setLineDash(segments) {
    this.recordedOps.push({ type: 'setLineDash', segments });
  }
}

/**
 * Mock HTMLCanvasElement.
 */
class MockHTMLCanvasElement {
  constructor(width = 800, height = 600) {
    this.width = width;
    this.height = height;
    this.context = new MockCanvasRenderingContext2D();
    this.parentElement = null;
    this.attributes = {};
  }

  getContext(type) {
    if (type === '2d') {
      return this.context;
    }
    return null;
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
  }

  getAttribute(k) {
    return this.attributes[k];
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height
    };
  }
}

/**
 * Minimal DOM element mock for mounting in container.
 */
class MockDOMElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.innerHTML = '';
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      return Array.from(this.children).find((c) => c.id === targetId) || null;
    }
    const tag = selector.toUpperCase();
    return Array.from(this.children).find((c) => c.tagName === tag) || null;
  }

  querySelectorAll(selector) {
    const tag = selector.toUpperCase();
    return Array.from(this.children).filter((c) => c.tagName === tag);
  }
}

describe('STORY 29.5.1: Resolve MISSING_COORDINATE_AXES (Defect ID: DF-SCALES-01)', () => {
  let originalDocument;
  let originalWindow;
  let appContainer;
  let mockElements;

  beforeEach(() => {
    mockElements = new Map();
    appContainer = new MockDOMElement('div', 'app');
    mockElements.set('app', appContainer);

    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    globalThis.document = {
      getElementById: (id) => mockElements.get(id) || null,
      createElement: (tag) => {
        if (tag.toLowerCase() === 'canvas') {
          return new MockHTMLCanvasElement();
        }
        return new MockDOMElement(tag);
      }
    };
    globalThis.window = {
      devicePixelRatio: 1,
      requestAnimationFrame: (cb) => setTimeout(cb, 0),
      cancelAnimationFrame: (id) => clearTimeout(id)
    };
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  describe('AC 1: Coordinate Gridlines Across Plot Area (src/chart.js)', () => {
    it('must render both horizontal and vertical gridlines spanning the plot area dimensions', () => {
      const canvas = new MockHTMLCanvasElement(800, 600);
      const ctx = canvas.getContext('2d');

      const plotArea = {
        left: 0,
        top: 0,
        width: 720,
        height: 560,
        right: 720,
        bottom: 560
      };

      const chart = new Chart({
        canvas,
        plotArea,
        priceRange: { min: 100, max: 200 },
        timeRange: { start: 1700000000, end: 1700086400 }
      });

      chart.render();

      const ops = ctx.recordedOps;
      const lines = [];

      for (let i = 0; i < ops.length; i++) {
        if (ops[i].type === 'moveTo' && ops[i + 1]?.type === 'lineTo') {
          lines.push({ from: ops[i], to: ops[i + 1] });
        }
      }

      // Identify horizontal gridlines (y remains identical, x spans horizontal plot area)
      const horizontalGridlines = lines.filter(
        (l) => l.from.y === l.to.y && l.from.x === plotArea.left && l.to.x === plotArea.right
      );

      // Identify vertical gridlines (x remains identical, y spans vertical plot area)
      const verticalGridlines = lines.filter(
        (l) => l.from.x === l.to.x && l.from.y === plotArea.top && l.to.y === plotArea.bottom
      );

      assert.ok(
        horizontalGridlines.length >= 3,
        `Expected at least 3 horizontal gridlines across the plot, found: ${horizontalGridlines.length}`
      );
      assert.ok(
        verticalGridlines.length >= 3,
        `Expected at least 3 vertical gridlines across the plot, found: ${verticalGridlines.length}`
      );

      // Assert gridlines have stroke executions
      const strokeCalls = ops.filter((op) => op.type === 'stroke');
      assert.ok(
        strokeCalls.length > 0,
        'Gridlines must be stroked to the canvas context'
      );
    });

    it('renderGridlines() should execute explicit stroke with grid line styling', () => {
      const canvas = new MockHTMLCanvasElement(600, 400);
      const ctx = canvas.getContext('2d');
      const plotArea = { left: 0, top: 0, width: 500, height: 350, right: 500, bottom: 350 };
      const gridOptions = {
        horizontalTicks: [50, 100, 150, 200, 250, 300],
        verticalTicks: [100, 200, 300, 400]
      };

      renderGridlines(ctx, plotArea, gridOptions);

      const moveToCalls = ctx.recordedOps.filter((op) => op.type === 'moveTo');
      const lineToCalls = ctx.recordedOps.filter((op) => op.type === 'lineTo');

      assert.equal(
        moveToCalls.length,
        gridOptions.horizontalTicks.length + gridOptions.verticalTicks.length,
        'Each horizontal and vertical tick must initiate a moveTo segment'
      );
      assert.equal(
        lineToCalls.length,
        gridOptions.horizontalTicks.length + gridOptions.verticalTicks.length,
        'Each horizontal and vertical tick must execute a lineTo segment'
      );
    });
  });

  describe('AC 2: Vertical Price Scale Axis with Formatted Price Levels and Tick Marks', () => {
    it('must render tick marks and formatted price labels along the vertical price scale boundary', () => {
      const canvas = new MockHTMLCanvasElement(800, 600);
      const ctx = canvas.getContext('2d');

      const axisBoundary = {
        left: 720,
        top: 0,
        width: 80,
        height: 560,
        tickSize: 5
      };

      const priceScaleConfig = {
        minPrice: 50.0,
        maxPrice: 150.0,
        step: 25.0,
        format: (val) => `$${val.toFixed(2)}`
      };

      renderPriceAxis(ctx, axisBoundary, priceScaleConfig);

      const ops = ctx.recordedOps;
      const textCalls = ops.filter((op) => op.type === 'fillText');
      const tickLines = [];

      for (let i = 0; i < ops.length; i++) {
        if (ops[i].type === 'moveTo' && ops[i + 1]?.type === 'lineTo') {
          const l = { from: ops[i], to: ops[i + 1] };
          // Tick line along the boundary starting at axisBoundary.left
          if (
            Math.abs(l.to.x - l.from.x) === axisBoundary.tickSize &&
            l.from.y === l.to.y
          ) {
            tickLines.push(l);
          }
        }
      }

      assert.ok(
        tickLines.length >= 4,
        `Expected at least 4 tick marks along the price scale boundary, found: ${tickLines.length}`
      );

      // Verify formatted price values: $50.00, $75.00, $100.00, $125.00, $150.00
      const renderedTexts = textCalls.map((t) => t.text);
      assert.ok(
        renderedTexts.includes('$50.00'),
        `Expected price level '$50.00' to be drawn, rendered: ${JSON.stringify(renderedTexts)}`
      );
      assert.ok(
        renderedTexts.includes('$100.00'),
        `Expected price level '$100.00' to be drawn, rendered: ${JSON.stringify(renderedTexts)}`
      );
      assert.ok(
        renderedTexts.includes('$150.00'),
        `Expected price level '$150.00' to be drawn, rendered: ${JSON.stringify(renderedTexts)}`
      );

      // Verify text coordinates are placed inside or along the vertical price scale margin (>= axisBoundary.left)
      for (const textOp of textCalls) {
        assert.ok(
          textOp.x >= axisBoundary.left,
          `Price label '${textOp.text}' must render within the price scale axis zone (>= ${axisBoundary.left}), got x=${textOp.x}`
        );
      }
    });

    it('must dynamically format price levels based on magnitude and precision', () => {
      const canvas = new MockHTMLCanvasElement(800, 600);
      const ctx = canvas.getContext('2d');

      const axisBoundary = {
        left: 700,
        top: 0,
        width: 100,
        height: 600,
        tickSize: 6
      };

      renderPriceAxis(ctx, axisBoundary, {
        minPrice: 1000.25,
        maxPrice: 1000.75,
        ticksCount: 5,
        format: (val) => val.toFixed(2)
      });

      const textCalls = ctx.recordedOps.filter((op) => op.type === 'fillText');
      assert.ok(textCalls.length >= 3, 'Must render intermediate tick labels for sub-dollar price action');
      
      const labels = textCalls.map((t) => t.text);
      for (const label of labels) {
        assert.match(
          label,
          /^\d+\.\d{2}$/,
          `Label "${label}" must adhere to 2-decimal point precision`
        );
      }
    });
  });

  describe('AC 3: Active Application Entrypoint & Live DOM Mounting (src/main.js)', () => {
    it('must mount canvas with active gridlines and price scale axis to document.getElementById("app")', () => {
      // Execute application mount via active entrypoint
      const appInstance = mountApp({ containerId: 'app' });

      assert.ok(appContainer.children.length > 0, 'Target element #app must have children mounted');
      
      const mountedCanvas = appContainer.querySelector('canvas');
      assert.ok(mountedCanvas, 'Canvas element must be appended to #app');
      assert.ok(
        mountedCanvas instanceof MockHTMLCanvasElement,
        'Mounted element must be an instance of HTMLCanvasElement'
      );

      const ctx = mountedCanvas.getContext('2d');
      assert.ok(ctx, 'Canvas must provide 2D rendering context');

      // Verify that the mounted chart rendered gridlines and price axis on initialization
      const fillTexts = ctx.recordedOps.filter((op) => op.type === 'fillText');
      const strokes = ctx.recordedOps.filter((op) => op.type === 'stroke');
      const lines = ctx.recordedOps.filter((op) => op.type === 'lineTo');

      assert.ok(
        lines.length > 0,
        'Mounted chart must have drawn coordinate axis lines and gridlines'
      );
      assert.ok(
        strokes.length > 0,
        'Mounted chart must have executed stroke commands for axes and gridlines'
      );
      assert.ok(
        fillTexts.length > 0,
        'Mounted chart must have rendered price scale axis text levels into the active canvas'
      );

      // Verify instance status if returned
      if (appInstance && typeof appInstance.isAxesActive === 'function') {
        assert.equal(appInstance.isAxesActive(), true, 'Chart axis system must report active state');
      }
    });

    it('init() entrypoint helper should guard against missing #app container and handle initialization cleanly', () => {
      mockElements.clear(); // Simulate absence of #app

      assert.throws(
        () => {
          init();
        },
        /Target container #app was not found in the DOM/,
        'init() must throw descriptive error if active root #app container is missing'
      );
    });

    it('entrypoint preserves coordinate axes when window resize or redraw occurs', () => {
      const appInstance = mountApp({ containerId: 'app' });
      const canvas = appContainer.querySelector('canvas');
      const ctx = canvas.getContext('2d');

      const initialTextOpsCount = ctx.recordedOps.filter((op) => op.type === 'fillText').length;
      assert.ok(initialTextOpsCount > 0, 'Initial render must produce price labels');

      // Trigger redraw/resize if supported
      if (typeof appInstance.resize === 'function') {
        ctx.recordedOps.length = 0; // Reset operation buffer
        appInstance.resize(1024, 768);

        const resizedLines = ctx.recordedOps.filter((op) => op.type === 'lineTo');
        const resizedTexts = ctx.recordedOps.filter((op) => op.type === 'fillText');

        assert.ok(
          resizedLines.length > 0,
          'Gridlines and ticks must be re-rendered upon chart resize'
        );
        assert.ok(
          resizedTexts.length > 0,
          'Price scale values must be re-rendered upon chart resize'
        );
      }
    });
  });
});