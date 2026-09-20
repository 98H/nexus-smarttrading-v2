import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup DOM and Canvas emulation prior to importing modules that access globalThis.document
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
    this.strokePaths = [];
    this.texts = [];
    this._currentSubpaths = [];
    this._currentPoint = { x: 0, y: 0 };
    this.strokeStyle = '#000000';
    this.fillStyle = '#000000';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: 'clearRect', args: [x, y, w, h] });
  }

  beginPath() {
    this._currentSubpaths = [];
    this.calls.push({ method: 'beginPath' });
  }

  moveTo(x, y) {
    this._currentPoint = { x, y };
    this.calls.push({ method: 'moveTo', args: [x, y] });
  }

  lineTo(x, y) {
    this._currentSubpaths.push({
      from: { ...this._currentPoint },
      to: { x, y },
    });
    this._currentPoint = { x, y };
    this.calls.push({ method: 'lineTo', args: [x, y] });
  }

  stroke() {
    this.strokePaths.push([...this._currentSubpaths]);
    this.calls.push({ method: 'stroke', paths: [...this._currentSubpaths] });
    this._currentSubpaths = [];
  }

  fillText(text, x, y) {
    const entry = { text: String(text), x, y, fillStyle: this.fillStyle };
    this.texts.push(entry);
    this.calls.push({ method: 'fillText', args: [text, x, y] });
  }

  strokeText(text, x, y) {
    this.texts.push({ text: String(text), x, y, strokeStyle: this.strokeStyle });
    this.calls.push({ method: 'strokeText', args: [text, x, y] });
  }

  save() {
    this.calls.push({ method: 'save' });
  }

  restore() {
    this.calls.push({ method: 'restore' });
  }

  measureText(text) {
    return { width: String(text).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.attributes = {};
    this.eventListeners = new Map();
    this.width = 800;
    this.height = 600;
    this.clientWidth = 800;
    this.clientHeight = 600;
    this._context = null;
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

  addEventListener(type, listener) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const listeners = this.eventListeners.get(type) || [];
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  dispatchEvent(event) {
    const listeners = this.eventListeners.get(event.type) || [];
    for (const listener of listeners) {
      listener.call(this, event);
    }
    return true;
  }

  getContext(type) {
    if (type === '2d') {
      if (!this._context) {
        this._context = new MockCanvasRenderingContext2D(this);
      }
      return this._context;
    }
    return null;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
      x: 0,
      y: 0,
    };
  }
}

class MockDocument {
  constructor() {
    this.elements = new Map();
    this.body = new MockElement('body');
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  registerElement(id, element) {
    this.elements.set(id, element);
  }
}

// Install mock browser globals
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

const mockDoc = new MockDocument();
globalThis.document = mockDoc;
globalThis.window = {
  document: mockDoc,
  addEventListener: (event, handler) => mockDoc.body.addEventListener(event, handler),
  removeEventListener: (event, handler) => mockDoc.body.removeEventListener(event, handler),
  dispatchEvent: (event) => mockDoc.body.dispatchEvent(event),
};
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// Target module imports
const { Chart } = await import('../src/chart.js');
const MainModule = await import('../src/main.js');

describe('STORY 1.2.1: Resolve MISSING_COORDINATE_AXES (Defect ID: DF-SCALES-01)', () => {
  let appContainer;
  const sampleCandles = [
    { time: 1700000000, open: 100, high: 110, low: 95, close: 105 },
    { time: 1700003600, open: 105, high: 115, low: 102, close: 112 },
    { time: 1700007200, open: 112, high: 118, low: 108, close: 114 },
    { time: 1700010800, open: 114, high: 120, low: 111, close: 119 },
    { time: 1700014400, open: 119, high: 125, low: 115, close: 122 },
  ];

  beforeEach(() => {
    appContainer = new MockElement('div');
    mockDoc.registerElement('app', appContainer);
  });

  afterEach(() => {
    mockDoc.elements.clear();
  });

  describe('AC-1: Horizontal and Vertical Coordinate Gridlines', () => {
    test('renders horizontal gridlines spanning the plot width when candlestick data is present', () => {
      const chart = new Chart(appContainer, {
        width: 800,
        height: 600,
        priceScaleWidth: 60,
        timeScaleHeight: 30,
      });

      chart.setData(sampleCandles);
      chart.render();

      const canvas = appContainer.children.find((child) => child.tagName === 'CANVAS');
      assert.ok(canvas, 'Expected a canvas element to be mounted inside container');

      const ctx = canvas.getContext('2d');
      const plotWidth = 800 - 60; // 740px plot width
      const plotHeight = 600 - 30; // 570px plot height

      // Extract all line segments drawn
      const drawnSegments = ctx.strokePaths.flat();

      // Find horizontal gridline segments that span across the chart plot area (x: ~0 to x: plotWidth)
      const horizontalGridlines = drawnSegments.filter((seg) => {
        const isHorizontal = Math.abs(seg.from.y - seg.to.y) < 0.001;
        const spansPlot = Math.min(seg.from.x, seg.to.x) <= 1 && Math.max(seg.from.x, seg.to.x) >= plotWidth - 1;
        const withinPlotY = seg.from.y >= 0 && seg.from.y <= plotHeight;
        return isHorizontal && spansPlot && withinPlotY;
      });

      assert.ok(
        horizontalGridlines.length >= 3,
        `Expected at least 3 horizontal gridlines across the plot, but found ${horizontalGridlines.length}`
      );
    });

    test('renders vertical coordinate gridlines spanning the plot height', () => {
      const chart = new Chart(appContainer, {
        width: 800,
        height: 600,
        priceScaleWidth: 60,
        timeScaleHeight: 30,
      });

      chart.setData(sampleCandles);
      chart.render();

      const canvas = appContainer.children.find((child) => child.tagName === 'CANVAS');
      const ctx = canvas.getContext('2d');
      const plotWidth = 800 - 60;
      const plotHeight = 600 - 30;

      const drawnSegments = ctx.strokePaths.flat();

      // Find vertical gridlines that span from top (y: 0) to bottom of plot area (y: plotHeight)
      const verticalGridlines = drawnSegments.filter((seg) => {
        const isVertical = Math.abs(seg.from.x - seg.to.x) < 0.001;
        const spansPlot = Math.min(seg.from.y, seg.to.y) <= 1 && Math.max(seg.from.y, seg.to.y) >= plotHeight - 1;
        const withinPlotX = seg.from.x >= 0 && seg.from.x <= plotWidth;
        return isVertical && spansPlot && withinPlotX;
      });

      assert.ok(
        verticalGridlines.length >= 2,
        `Expected at least 2 vertical gridlines across the plot, but found ${verticalGridlines.length}`
      );
    });

    test('does not bleed gridlines into the right-hand price scale or bottom time scale margin', () => {
      const chart = new Chart(appContainer, {
        width: 800,
        height: 600,
        priceScaleWidth: 70,
        timeScaleHeight: 40,
      });

      chart.setData(sampleCandles);
      chart.render();

      const canvas = appContainer.children.find((child) => child.tagName === 'CANVAS');
      const ctx = canvas.getContext('2d');
      const plotWidth = 800 - 70;
      const plotHeight = 600 - 40;

      const drawnSegments = ctx.strokePaths.flat();

      // Check for illegal lines drawn with horizontal/vertical orientation that cross into margins
      const overextendedGridlines = drawnSegments.filter((seg) => {
        const isHorizontal = Math.abs(seg.from.y - seg.to.y) < 0.001;
        const isVertical = Math.abs(seg.from.x - seg.to.x) < 0.001;

        if (isHorizontal && (seg.from.x > plotWidth || seg.to.x > plotWidth)) {
          // Horizontal line extending beyond the plot area into the right scale area (excluding short tick marks)
          const length = Math.abs(seg.to.x - seg.from.x);
          return length > 10;
        }

        if (isVertical && (seg.from.y > plotHeight || seg.to.y > plotHeight)) {
          // Vertical line extending into bottom scale area (excluding short tick marks)
          const length = Math.abs(seg.to.y - seg.from.y);
          return length > 10;
        }

        return false;
      });

      assert.equal(
        overextendedGridlines.length,
        0,
        `Found ${overextendedGridlines.length} gridlines crossing outside plot boundaries`
      );
    });
  });

  describe('AC-2: Right-Hand Price Scale and Bottom Time Scale Axes', () => {
    test('renders right-hand price scale with tick marks and formatted price labels', () => {
      const chart = new Chart(appContainer, {
        width: 800,
        height: 600,
        priceScaleWidth: 60,
        timeScaleHeight: 30,
      });

      chart.setData(sampleCandles);
      chart.render();

      const canvas = appContainer.children.find((child) => child.tagName === 'CANVAS');
      const ctx = canvas.getContext('2d');
      const plotWidth = 800 - 60;

      // Price labels must be rendered in the price axis region: x >= plotWidth
      const priceLabels = ctx.texts.filter((t) => t.x >= plotWidth);

      assert.ok(
        priceLabels.length >= 3,
        `Expected at least 3 price labels on the right-hand axis, found ${priceLabels.length}`
      );

      // Verify price labels correspond to numeric price values within candle ranges (95 to 125)
      for (const label of priceLabels) {
        const numericVal = parseFloat(label.text.replace(/[^0-9.]/g, ''));
        assert.ok(
          !Number.isNaN(numericVal),
          `Price label "${label.text}" should parse to a valid number`
        );
        assert.ok(
          numericVal >= 90 && numericVal <= 130,
          `Price label value ${numericVal} should be scaled within candle range [95, 125]`
        );
      }

      // Check tick marks on price axis (short line segments located at x >= plotWidth)
      const drawnSegments = ctx.strokePaths.flat();
      const priceTicks = drawnSegments.filter((seg) => {
        const isHorizontal = Math.abs(seg.from.y - seg.to.y) < 0.001;
        const inPriceAxisZone = seg.from.x >= plotWidth && seg.to.x >= plotWidth;
        const tickLength = Math.abs(seg.to.x - seg.from.x);
        return isHorizontal && inPriceAxisZone && tickLength > 0 && tickLength <= 10;
      });

      assert.ok(
        priceTicks.length >= 3,
        `Expected at least 3 price tick marks on the right-hand axis, found ${priceTicks.length}`
      );
    });

    test('renders bottom time scale axis with intervals, ticks, and timestamp labels', () => {
      const chart = new Chart(appContainer, {
        width: 800,
        height: 600,
        priceScaleWidth: 60,
        timeScaleHeight: 30,
      });

      chart.setData(sampleCandles);
      chart.render();

      const canvas = appContainer.children.find((child) => child.tagName === 'CANVAS');
      const ctx = canvas.getContext('2d');
      const plotHeight = 600 - 30;

      // Time labels must be positioned within the time scale region: y >= plotHeight
      const timeLabels = ctx.texts.filter((t) => t.y >= plotHeight);

      assert.ok(
        timeLabels.length >= 2,
        `Expected at least 2 time labels on the bottom axis, found ${timeLabels.length}`
      );

      // Check time scale separator/baseline line at y = plotHeight
      const drawnSegments = ctx.strokePaths.flat();
      const hasTimeAxisBaseline = drawnSegments.some((seg) => {
        const isHorizontal = Math.abs(seg.from.y - seg.to.y) < 0.001;
        const isAtAxisBoundary = Math.abs(seg.from.y - plotHeight) <= 1;
        return isHorizontal && isAtAxisBoundary;
      });

      assert.ok(
        hasTimeAxisBaseline,
        'Expected a horizontal baseline stroke separating plot area and time scale'
      );

      // Check time tick marks (short vertical lines at y >= plotHeight)
      const timeTicks = drawnSegments.filter((seg) => {
        const isVertical = Math.abs(seg.from.x - seg.to.x) < 0.001;
        const inTimeAxisZone = seg.from.y >= plotHeight && seg.to.y >= plotHeight;
        const tickLength = Math.abs(seg.to.y - seg.from.y);
        return isVertical && inTimeAxisZone && tickLength > 0 && tickLength <= 10;
      });

      assert.ok(
        timeTicks.length >= 2,
        `Expected at least 2 time tick marks on the bottom axis, found ${timeTicks.length}`
      );
    });
  });

  describe('AC-3: Active Entrypoint Mounting and Live View Updates (src/main.js)', () => {
    test('main.js mounts chart to document.getElementById("app") with active coordinate axes', async () => {
      assert.ok(
        typeof MainModule.init === 'function' || typeof MainModule.bootstrap === 'function' || typeof MainModule.start === 'function' || MainModule.default,
        'src/main.js must export an entry function or default initialize procedure'
      );

      const initFn = MainModule.init || MainModule.bootstrap || MainModule.start || MainModule.default;
      const appInstance = await (typeof initFn === 'function' ? initFn() : null);

      // Container #app must contain the mounted canvas
      assert.ok(
        appContainer.children.length > 0,
        'Container #app must have children mounted by src/main.js'
      );

      const canvas = appContainer.children.find((el) => el.tagName === 'CANVAS');
      assert.ok(canvas, 'src/main.js must mount a canvas element to #app');

      const ctx = canvas.getContext('2d');

      // The live-rendered canvas must have drawn both axes and gridlines
      const drawnSegments = ctx.strokePaths.flat();
      assert.ok(
        drawnSegments.length > 0,
        'Active canvas rendered by main.js must have drawn strokes'
      );
      assert.ok(
        ctx.texts.length > 0,
        'Active canvas rendered by main.js must render coordinate scale labels'
      );
    });

    test('main.js wires live view updates when data or window dimensions change', async () => {
      const initFn = MainModule.init || MainModule.bootstrap || MainModule.start || MainModule.default;
      const app = typeof initFn === 'function' ? await initFn() : null;

      const canvas = appContainer.children.find((el) => el.tagName === 'CANVAS');
      const ctx = canvas.getContext('2d');

      const initialTextCount = ctx.texts.length;
      const initialClearCount = ctx.calls.filter((c) => c.method === 'clearRect').length;

      // Trigger a live data update or window resize event to verify wiring
      if (app && typeof app.update === 'function') {
        app.update([
          ...sampleCandles,
          { time: 1700018000, open: 122, high: 130, low: 120, close: 128 },
        ]);
      } else if (app && typeof app.resize === 'function') {
        app.resize(1024, 768);
      } else {
        // Dispatch resize event on window to simulate responsive live view trigger
        const resizeEvent = { type: 'resize' };
        mockDoc.body.dispatchEvent(resizeEvent);
      }

      const updatedClearCount = ctx.calls.filter((c) => c.method === 'clearRect').length;

      assert.ok(
        updatedClearCount > initialClearCount,
        'Live view update must trigger canvas redraw via clearRect/render loop'
      );
    });

    test('rejects isolated, unmounted chart instances and enforces live container wiring', () => {
      // Architectural Invariant check: Chart constructor requires a valid mounted DOM container
      assert.throws(
        () => new Chart(null, {}),
        /container|element|null/i,
        'Chart initialization should throw when container is null or missing from DOM'
      );
    });
  });
});