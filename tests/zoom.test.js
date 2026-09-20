import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Target modules under test
import { Chart } from '../src/chart.js';
import { init, getActiveChart } from '../src/main.js';

/**
 * Minimal Headless DOM and Canvas Environment Mock
 * Simulates standard browser DOM and Canvas 2D Context for node:test execution.
 */
class MockCanvasRenderingContext2D {
  constructor() {
    this.drawCalls = [];
  }

  clearRect(x, y, w, h) {
    this.drawCalls.push({ method: 'clearRect', args: [x, y, w, h] });
  }

  fillRect(x, y, w, h) {
    this.drawCalls.push({ method: 'fillRect', args: [x, y, w, h] });
  }

  strokeRect(x, y, w, h) {
    this.drawCalls.push({ method: 'strokeRect', args: [x, y, w, h] });
  }

  beginPath() {
    this.drawCalls.push({ method: 'beginPath', args: [] });
  }

  moveTo(x, y) {
    this.drawCalls.push({ method: 'moveTo', args: [x, y] });
  }

  lineTo(x, y) {
    this.drawCalls.push({ method: 'lineTo', args: [x, y] });
  }

  stroke() {
    this.drawCalls.push({ method: 'stroke', args: [] });
  }

  resetMock() {
    this.drawCalls = [];
  }
}

class MockEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback, options = {}) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push({ callback, options });
  }

  removeEventListener(type, callback) {
    if (!this.listeners.has(type)) return;
    const filtered = this.listeners.get(type).filter((entry) => entry.callback !== callback);
    this.listeners.set(type, filtered);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const entries = this.listeners.get(event.type) || [];
    for (const { callback } of entries) {
      if (typeof callback === 'function') {
        callback.call(this, event);
      } else if (callback && typeof callback.handleEvent === 'function') {
        callback.handleEvent(event);
      }
    }
    return !event.defaultPrevented;
  }

  getListeners(type) {
    return this.listeners.get(type) || [];
  }
}

class MockElement extends MockEventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.id = '';
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      child.parentElement = null;
      return this.children.splice(idx, 1)[0];
    }
    return null;
  }
}

class MockCanvasElement extends MockElement {
  constructor() {
    super('canvas');
    this.width = 800;
    this.height = 600;
    this.context2d = new MockCanvasRenderingContext2D();
  }

  getContext(type) {
    if (type === '2d') {
      return this.context2d;
    }
    return null;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.width, height: this.height };
  }
}

class MockWheelEvent {
  constructor(type, initDict = {}) {
    this.type = type;
    this.deltaY = initDict.deltaY ?? 0;
    this.deltaX = initDict.deltaX ?? 0;
    this.deltaMode = initDict.deltaMode ?? 0;
    this.clientX = initDict.clientX ?? 0;
    this.clientY = initDict.clientY ?? 0;
    this.cancelable = initDict.cancelable ?? true;
    this.bubbles = initDict.bubbles ?? true;
    this.defaultPrevented = false;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }
}

// Global DOM harness setup
let appContainer;
let originalDocument;
let originalWindow;

function setupMockDom() {
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;

  appContainer = new MockElement('div');
  appContainer.id = 'app';

  const mockDocument = {
    getElementById(id) {
      if (id === 'app') return appContainer;
      return null;
    },
    createElement(tag) {
      if (tag.toLowerCase() === 'canvas') {
        return new MockCanvasElement();
      }
      return new MockElement(tag);
    },
  };

  globalThis.document = mockDocument;
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.WheelEvent = MockWheelEvent;
}

function teardownMockDom() {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  delete globalThis.WheelEvent;
  appContainer = null;
}

const SAMPLE_CANDLESTICKS = [
  { timestamp: 1672531199, open: 100, high: 110, low: 95, close: 105 },
  { timestamp: 1672531200, open: 105, high: 115, low: 102, close: 108 },
  { timestamp: 1672531201, open: 108, high: 112, low: 99, close: 101 },
];

describe('STORY 1.3.1: Resolve UNRESPONSIVE_CANVAS_ZOOM (DF-GESTURE-02)', () => {
  beforeEach(() => {
    setupMockDom();
  });

  afterEach(() => {
    teardownMockDom();
  });

  describe('src/chart.js: Wheel Event Handling and Candlestick Scaling', () => {
    it('should initialize with a baseline zoom scale of 1.0', () => {
      const canvas = document.createElement('canvas');
      const chart = new Chart(canvas, { data: SAMPLE_CANDLESTICKS });

      assert.strictEqual(
        typeof chart.zoomScale,
        'number',
        'Chart zoomScale must be initialized as a number'
      );
      assert.strictEqual(
        chart.zoomScale,
        1.0,
        'Initial zoom scale must be 1.0'
      );
    });

    it('should increase zoom scale and re-render candlesticks when zooming in (negative deltaY)', () => {
      const canvas = document.createElement('canvas');
      const chart = new Chart(canvas, { data: SAMPLE_CANDLESTICKS });
      chart.render();

      const initialDrawCallCount = canvas.context2d.drawCalls.length;
      assert.ok(initialDrawCallCount > 0, 'Chart should perform initial render calls');

      canvas.context2d.resetMock();

      // Dispatch wheel scroll upward (zoom in)
      const wheelZoomIn = new MockWheelEvent('wheel', { deltaY: -100 });
      chart.handleWheel(wheelZoomIn);

      // Verify scale update
      assert.ok(
        chart.zoomScale > 1.0,
        `Expected zoomScale to increase above 1.0, but got ${chart.zoomScale}`
      );

      // Verify re-render occurred
      assert.ok(
        canvas.context2d.drawCalls.length > 0,
        'Candlesticks must be re-rendered to canvas following zoom in'
      );

      const hasClearRect = canvas.context2d.drawCalls.some(
        (call) => call.method === 'clearRect'
      );
      assert.ok(hasClearRect, 'Re-render must clear previous canvas frame');
    });

    it('should decrease zoom scale and re-render candlesticks when zooming out (positive deltaY)', () => {
      const canvas = document.createElement('canvas');
      const chart = new Chart(canvas, { data: SAMPLE_CANDLESTICKS });

      // First zoom in to allow headroom for zooming out
      chart.zoomScale = 2.0;
      canvas.context2d.resetMock();

      // Dispatch wheel scroll downward (zoom out)
      const wheelZoomOut = new MockWheelEvent('wheel', { deltaY: 100 });
      chart.handleWheel(wheelZoomOut);

      assert.ok(
        chart.zoomScale < 2.0,
        `Expected zoomScale to decrease below 2.0, but got ${chart.zoomScale}`
      );
      assert.ok(
        canvas.context2d.drawCalls.length > 0,
        'Candlesticks must be re-rendered to canvas following zoom out'
      );
    });

    it('should prevent zoom scale from dropping to zero or negative values', () => {
      const canvas = document.createElement('canvas');
      const chart = new Chart(canvas, { data: SAMPLE_CANDLESTICKS });

      // Attempt extreme zoom out
      for (let i = 0; i < 20; i++) {
        chart.handleWheel(new MockWheelEvent('wheel', { deltaY: 500 }));
      }

      assert.ok(
        chart.zoomScale > 0,
        `Zoom scale must remain strictly positive, but got ${chart.zoomScale}`
      );
    });
  });

  describe('src/main.js: Active Application Entrypoint Wiring and Invariants', () => {
    it('should mount canvas inside document.getElementById("app") upon initialization', () => {
      init();

      const canvas = Array.from(appContainer.children).find((child) => child.tagName === 'CANVAS');
      assert.ok(
        canvas !== undefined,
        'Canvas element must be mounted into #app during entrypoint init'
      );
    });

    it('should bind the "wheel" event listener directly to the canvas element', () => {
      init();

      const canvas = Array.from(appContainer.children).find((child) => child.tagName === 'CANVAS');
      assert.ok(canvas, 'Canvas element must exist in #app');

      const wheelListeners = canvas.getListeners('wheel');
      assert.ok(
        wheelListeners.length > 0,
        'A "wheel" event listener must be bound directly to the canvas element'
      );
    });

    it('should prevent default scrolling when wheel event is dispatched on canvas', () => {
      init();

      const canvas = Array.from(appContainer.children).find((child) => child.tagName === 'CANVAS');
      assert.ok(canvas, 'Canvas must be mounted');

      const wheelEvent = new MockWheelEvent('wheel', {
        deltaY: -120,
        cancelable: true,
      });

      canvas.dispatchEvent(wheelEvent);

      assert.strictEqual(
        wheelEvent.defaultPrevented,
        true,
        'Default browser scroll behavior must be prevented when wheel zooming over canvas'
      );
    });

    it('should update active chart scale when wheel event is dispatched through the DOM canvas', () => {
      init();

      const canvas = Array.from(appContainer.children).find((child) => child.tagName === 'CANVAS');
      const chartInstance = getActiveChart ? getActiveChart() : null;

      assert.ok(
        chartInstance,
        'Active chart instance must be accessible or wired through src/main.js'
      );

      const initialScale = chartInstance.zoomScale;
      assert.strictEqual(initialScale, 1.0, 'Baseline scale before dispatch should be 1.0');

      // Dispatch wheel scroll over canvas element
      const wheelEvent = new MockWheelEvent('wheel', { deltaY: -100 });
      canvas.dispatchEvent(wheelEvent);

      assert.notStrictEqual(
        chartInstance.zoomScale,
        initialScale,
        'Active chart zoomScale must update when wheel event is dispatched over the canvas'
      );
      assert.ok(
        chartInstance.zoomScale > initialScale,
        'Active chart zoomScale must increase after dispatching negative deltaY wheel event'
      );
    });
  });
});