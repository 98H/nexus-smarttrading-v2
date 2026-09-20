import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AxesRenderer } from '../src/axes.js';
import * as mainModule from '../src/main.js';

// --- Canvas & DOM Mocking Helpers ---

/**
 * Creates a mock 2D canvas context that records drawing operations.
 */
function createMockContext() {
  const calls = [];
  return {
    calls,
    canvas: { width: 800, height: 600 },
    beginPath: () => calls.push({ method: 'beginPath' }),
    moveTo: (x, y) => calls.push({ method: 'moveTo', x, y }),
    lineTo: (x, y) => calls.push({ method: 'lineTo', x, y }),
    stroke: () => calls.push({ method: 'stroke' }),
    fillText: (text, x, y) => calls.push({ method: 'fillText', text: String(text), x, y }),
    strokeText: (text, x, y) => calls.push({ method: 'strokeText', text: String(text), x, y }),
    clearRect: (x, y, w, h) => calls.push({ method: 'clearRect', x, y, w, h }),
    save: () => calls.push({ method: 'save' }),
    restore: () => calls.push({ method: 'restore' }),
    setLineDash: (dash) => calls.push({ method: 'setLineDash', dash }),
    strokeStyle: '#000000',
    fillStyle: '#000000',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };
}

/**
 * Creates a mock HTMLCanvasElement.
 */
function createMockCanvas(width = 800, height = 600) {
  const ctx = createMockContext();
  ctx.canvas.width = width;
  ctx.canvas.height = height;

  const canvas = {
    tagName: 'CANVAS',
    width,
    height,
    getContext: (type) => (type === '2d' ? ctx : null),
    style: {},
    dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  };
  return canvas;
}

/**
 * Sets up a minimal simulated browser DOM environment on globalThis.
 */
function setupDomMock() {
  const appContainer = {
    id: 'app',
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      return child;
    },
    querySelector(sel) {
      if (sel === 'canvas') return Array.from(this.children).find((c) => c.tagName === 'CANVAS') || null;
      return null;
    },
  };

  const windowListeners = new Map();

  globalThis.window = {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: (event, handler) => {
      if (!windowListeners.has(event)) windowListeners.set(event, []);
      windowListeners.get(event).push(handler);
    },
    removeEventListener: (event, handler) => {
      const handlers = windowListeners.get(event) || [];
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    },
    dispatchEvent: (event) => {
      const handlers = windowListeners.get(event.type) || [];
      for (const h of handlers) h(event);
      return true;
    },
  };

  globalThis.document = {
    getElementById: (id) => (id === 'app' ? appContainer : null),
    createElement: (tag) => {
      if (tag.toLowerCase() === 'canvas') {
        const c = createMockCanvas(800, 600);
        return c;
      }
      return { tagName: tag.toUpperCase(), children: [], style: {} };
    },
  };

  return { appContainer, windowListeners };
}

function tearDownDomMock() {
  delete globalThis.window;
  delete globalThis.document;
}

describe('STORY 2.3.1: Resolve MISSING_COORDINATE_AXES (DF-SCALES-01)', () => {
  let mockCanvas;
  let mockCtx;

  beforeEach(() => {
    mockCanvas = createMockCanvas(800, 600);
    mockCtx = mockCanvas.getContext('2d');
  });

  /* -------------------------------------------------------------------------- */
  /* Acceptance Criterion 1: Background Gridlines Rendering                    */
  /* -------------------------------------------------------------------------- */
  describe('Acceptance Criterion 1: Coordinate Gridlines (src/axes.js)', () => {
    it('should render both horizontal and vertical background gridlines across active plot area', () => {
      const renderer = new AxesRenderer({
        canvas: mockCanvas,
        context: mockCtx,
        plotArea: { top: 0, left: 0, width: 730, height: 550 },
        priceAxisWidth: 70,
        timeAxisHeight: 50,
      });

      renderer.renderGridlines({
        priceRange: { min: 100, max: 200 },
        timeRange: { min: 1700000000, max: 1700086400 },
      });

      const lineSegments = [];
      for (let i = 0; i < mockCtx.calls.length - 1; i++) {
        if (mockCtx.calls[i].method === 'moveTo' && mockCtx.calls[i + 1].method === 'lineTo') {
          lineSegments.push({
            x1: mockCtx.calls[i].x,
            y1: mockCtx.calls[i].y,
            x2: mockCtx.calls[i + 1].x,
            y2: mockCtx.calls[i + 1].y,
          });
        }
      }

      // Horizontal gridlines: y1 === y2, spans across plot width
      const horizontalGridlines = lineSegments.filter(
        (seg) => seg.y1 === seg.y2 && seg.x1 !== seg.x2
      );

      // Vertical gridlines: x1 === x2, spans across plot height
      const verticalGridlines = lineSegments.filter(
        (seg) => seg.x1 === seg.x2 && seg.y1 !== seg.y2
      );

      assert.ok(
        horizontalGridlines.length >= 3,
        `Expected at least 3 horizontal gridlines, received ${horizontalGridlines.length}`
      );
      assert.ok(
        verticalGridlines.length >= 3,
        `Expected at least 3 vertical gridlines, received ${verticalGridlines.length}`
      );

      // Verify horizontal lines span within the plot area bounds
      for (const hLine of horizontalGridlines) {
        assert.ok(hLine.y1 >= 0 && hLine.y1 <= 550, `Horizontal gridline y=${hLine.y1} out of plot bounds`);
        assert.strictEqual(hLine.x1, 0, 'Horizontal gridline should start at left boundary');
        assert.strictEqual(hLine.x2, 730, 'Horizontal gridline should span to plot area right boundary');
      }

      // Verify vertical lines span within the plot area bounds
      for (const vLine of verticalGridlines) {
        assert.ok(vLine.x1 >= 0 && vLine.x1 <= 730, `Vertical gridline x=${vLine.x1} out of plot bounds`);
        assert.strictEqual(vLine.y1, 0, 'Vertical gridline should start at top boundary');
        assert.strictEqual(vLine.y2, 550, 'Vertical gridline should span to plot area bottom boundary');
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Acceptance Criterion 2: Price & Time Scale Axes                            */
  /* -------------------------------------------------------------------------- */
  describe('Acceptance Criterion 2: Price & Time Scale Axes (src/axes.js)', () => {
    it('should draw a right-hand vertical price scale axis with price tick labels', () => {
      const priceAxisWidth = 70;
      const plotWidth = mockCanvas.width - priceAxisWidth; // 730
      const renderer = new AxesRenderer({
        canvas: mockCanvas,
        context: mockCtx,
        plotArea: { top: 0, left: 0, width: plotWidth, height: 550 },
        priceAxisWidth,
        timeAxisHeight: 50,
      });

      renderer.renderPriceScale({ min: 100, max: 200 });

      // 1. Must draw vertical price axis line separating plot and scale area
      const axisLine = mockCtx.calls.find(
        (call, idx) =>
          call.method === 'moveTo' &&
          call.x >= plotWidth &&
          mockCtx.calls[idx + 1]?.method === 'lineTo' &&
          mockCtx.calls[idx + 1]?.x === call.x
      );
      assert.ok(axisLine, 'Right-hand vertical price axis line must be drawn at the plot boundary');

      // 2. Must render price tick labels strictly in the right-hand scale region (x >= plotWidth)
      const textCalls = mockCtx.calls.filter((c) => c.method === 'fillText');
      assert.ok(textCalls.length >= 3, 'Must render multiple price tick labels');

      for (const call of textCalls) {
        assert.ok(
          call.x >= plotWidth,
          `Price label "${call.text}" at x=${call.x} must be placed on the right-hand scale (x >= ${plotWidth})`
        );
        // Label must parse to or represent a valid number
        const numeric = parseFloat(call.text.replace(/[^0-9.-]+/g, ''));
        assert.ok(!Number.isNaN(numeric), `Tick label "${call.text}" should represent a valid price`);
        assert.ok(
          numeric >= 100 && numeric <= 200,
          `Tick price ${numeric} out of expected range [100, 200]`
        );
      }
    });

    it('should draw a bottom horizontal time scale axis with timestamp tick marks', () => {
      const timeAxisHeight = 50;
      const plotHeight = mockCanvas.height - timeAxisHeight; // 550
      const renderer = new AxesRenderer({
        canvas: mockCanvas,
        context: mockCtx,
        plotArea: { top: 0, left: 0, width: 730, height: plotHeight },
        priceAxisWidth: 70,
        timeAxisHeight,
      });

      const startTime = 1700000000;
      const endTime = 1700086400;
      renderer.renderTimeScale({ min: startTime, max: endTime });

      // 1. Must draw horizontal time axis line separating plot and bottom scale area
      const axisLine = mockCtx.calls.find(
        (call, idx) =>
          call.method === 'moveTo' &&
          call.y >= plotHeight &&
          mockCtx.calls[idx + 1]?.method === 'lineTo' &&
          mockCtx.calls[idx + 1]?.y === call.y
      );
      assert.ok(axisLine, 'Bottom horizontal time axis line must be drawn at the plot boundary');

      // 2. Must render timestamp tick labels strictly in the bottom scale region (y >= plotHeight)
      const textCalls = mockCtx.calls.filter((c) => c.method === 'fillText');
      assert.ok(textCalls.length >= 3, 'Must render multiple time tick labels');

      for (const call of textCalls) {
        assert.ok(
          call.y >= plotHeight,
          `Time label "${call.text}" at y=${call.y} must be placed on the bottom scale (y >= ${plotHeight})`
        );
      }

      // 3. Must draw tick marks (short vertical lines crossing into the bottom axis area)
      const tickMarks = [];
      for (let i = 0; i < mockCtx.calls.length - 1; i++) {
        const c1 = mockCtx.calls[i];
        const c2 = mockCtx.calls[i + 1];
        if (c1.method === 'moveTo' && c2.method === 'lineTo' && c1.x === c2.x && c1.y >= plotHeight) {
          tickMarks.push({ x: c1.x, y1: c1.y, y2: c2.y });
        }
      }
      assert.ok(tickMarks.length >= 3, `Expected at least 3 time tick marks, found ${tickMarks.length}`);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Acceptance Criterion 3: src/main.js Entrypoint Integration & Wiring       */
  /* -------------------------------------------------------------------------- */
  describe('Acceptance Criterion 3: Application Entrypoint Mounting & Lifecycle (src/main.js)', () => {
    let dom;

    beforeEach(() => {
      dom = setupDomMock();
    });

    afterEach(() => {
      tearDownDomMock();
    });

    it('should mount coordinate axes renderer to document.getElementById("app")', async () => {
      assert.ok(
        typeof mainModule.initApp === 'function' || typeof mainModule.mountChart === 'function',
        'src/main.js must export an initialization function (initApp or mountChart)'
      );

      const initFn = mainModule.initApp || mainModule.mountChart;
      const appInstance = await initFn();

      const app = dom.appContainer;
      const canvas = app.querySelector('canvas');
      assert.ok(canvas, 'Canvas element must be mounted inside document.getElementById("app")');

      // Check that axes renderer is actively attached to the application/chart instance
      assert.ok(
        appInstance?.axesRenderer instanceof AxesRenderer ||
          canvas.axesRenderer instanceof AxesRenderer ||
          appInstance?.getAxesRenderer?.() instanceof AxesRenderer,
        'AxesRenderer must be wired and accessible on the mounted chart instance'
      );
    });

    it('should trigger axes redrawing when window emits a resize event', async () => {
      const initFn = mainModule.initApp || mainModule.mountChart;
      await initFn();

      const canvas = dom.appContainer.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const initialCallCount = ctx.calls.length;

      // Simulate window resize
      globalThis.window.innerWidth = 1024;
      globalThis.window.innerHeight = 768;
      globalThis.window.dispatchEvent({ type: 'resize' });

      // After resize, coordinate axes must be redrawn
      const postResizeCallCount = ctx.calls.length;
      assert.ok(
        postResizeCallCount > initialCallCount,
        'Resize event must trigger coordinate axes redraw on canvas'
      );

      const hasGridOrAxisRedraw = ctx.calls
        .slice(initialCallCount)
        .some((call) => call.method === 'fillText' || call.method === 'lineTo');
      assert.ok(
        hasGridOrAxisRedraw,
        'Axes drawing methods (fillText/lineTo) must be invoked during resize handler'
      );
    });

    it('should update coordinate axes when real-time candle data changes price or time range', async () => {
      const initFn = mainModule.initApp || mainModule.mountChart;
      const appInstance = await initFn();

      assert.ok(
        typeof mainModule.updateCandleData === 'function' ||
          typeof appInstance?.updateData === 'function' ||
          typeof appInstance?.onDataUpdate === 'function',
        'Application must expose a real-time data update method (updateCandleData or instance.updateData)'
      );

      const updateFn =
        mainModule.updateCandleData ||
        appInstance?.updateData?.bind(appInstance) ||
        appInstance?.onDataUpdate?.bind(appInstance);

      const canvas = dom.appContainer.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      ctx.calls.length = 0; // reset calls

      // Feed higher price data causing scale expansion
      const newCandleBatch = [
        { time: 1700090000, open: 250, high: 310, low: 245, close: 305 },
        { time: 1700093600, open: 305, high: 350, low: 300, close: 345 },
      ];

      await updateFn(newCandleBatch);

      // Verify that axes were redrawn with the updated range
      const labels = ctx.calls
        .filter((c) => c.method === 'fillText')
        .map((c) => c.text);

      assert.ok(labels.length > 0, 'Labels must be rendered after real-time data update');

      // The new price high is 350, so labels should now reflect values >= 300
      const hasUpdatedPriceLabel = labels.some((txt) => {
        const val = parseFloat(txt.replace(/[^0-9.-]+/g, ''));
        return val >= 300;
      });

      assert.ok(
        hasUpdatedPriceLabel,
        'Price axis labels must reflect updated price range after candle data update'
      );
    });
  });
});