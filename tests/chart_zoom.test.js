import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Chart } from '../src/chart.js';
import * as mainModule from '../src/main.js';

// Minimal DOM & Canvas Simulation for deterministic testing in Node.js
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: 'clearRect', args: [x, y, w, h] });
  }

  fillRect(x, y, w, h) {
    this.calls.push({ method: 'fillRect', args: [x, y, w, h] });
  }

  strokeRect(x, y, w, h) {
    this.calls.push({ method: 'strokeRect', args: [x, y, w, h] });
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
    this.calls.push({ method: 'stroke', args: [] });
  }

  save() {
    this.calls.push({ method: 'save', args: [] });
  }

  restore() {
    this.calls.push({ method: 'restore', args: [] });
  }

  scale(sx, sy) {
    this.calls.push({ method: 'scale', args: [sx, sy] });
  }

  reset() {
    this.calls = [];
  }
}

class MockElement {
  constructor(tagName) {
try {     this.tagName = tagName ? tagName.toUpperCase() : 'DIV'; } catch (_) {}
    this.id = '';
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.width = 800;
    this.height = 600;
    this._context = null;
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

  addEventListener(type, handler, options = false) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push({ handler, options });
  }

  removeEventListener(type, handler) {
    if (!this.listeners.has(type)) return;
    const filtered = this.listeners.get(type).filter((l) => l.handler !== handler);
    this.listeners.set(type, filtered);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const registered = this.listeners.get(event.type) || [];
    for (const { handler } of registered) {
      handler(event);
    }
    return !event.defaultPrevented;
  }

  getContext(contextId) {
    if (contextId === '2d') {
      if (!this._context) {
        this._context = new MockCanvasRenderingContext2D(this);
      }
      return this._context;
    }
    return null;
  }
}

class MockWheelEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.deltaY = init.deltaY ?? 0;
    this.deltaX = init.deltaX ?? 0;
    this.deltaMode = init.deltaMode ?? 0;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.cancelable = init.cancelable ?? true;
    this.bubbles = init.bubbles ?? true;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }
}

describe('STORY 5.4.1: Resolve UNRESPONSIVE_CANVAS_ZOOM (Defect ID: DF-GESTURE-02)', () => {
  let originalDocument;
  let originalWindow;
  let mockAppContainer;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    mockAppContainer = new MockElement('div');
    mockAppContainer.id = 'app';

    const elementsById = new Map([['app', mockAppContainer]]);

    globalThis.document = {
      getElementById: (id) => elementsById.get(id) || null,
      createElement: (tag) => new MockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      document: globalThis.document,
    };

    globalThis.WheelEvent = MockWheelEvent;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    delete globalThis.WheelEvent;
  });

  describe('Chart Zoom Mechanics (src/chart.js)', () => {
    it('should initialize with a default zoom scale factor', () => {
      const canvas = new MockElement('canvas');
      const chart = new Chart(canvas);

      assert.strictEqual(typeof chart.getZoomScale, 'function', 'Chart must expose getZoomScale()');
      assert.strictEqual(typeof chart.getZoomScale(), 'number', 'zoom scale factor must be a number');
      assert.ok(chart.getZoomScale() > 0, 'Initial zoom scale factor must be positive');
    });

    it('should prevent default browser scrolling when wheel event is dispatched on canvas', () => {
      const canvas = new MockElement('canvas');
      const chart = new Chart(canvas);

      const wheelEvent = new MockWheelEvent('wheel', { deltaY: 100, cancelable: true });
      canvas.dispatchEvent(wheelEvent);

      assert.strictEqual(
        wheelEvent.defaultPrevented,
        true,
        'wheel event default behavior must be prevented on canvas'
      );
    });

    it('should update zoom scale factor when zooming in (negative deltaY)', () => {
      const canvas = new MockElement('canvas');
      const chart = new Chart(canvas);
      const initialScale = chart.getZoomScale();

      // Negative deltaY indicates zooming in
      const zoomInEvent = new MockWheelEvent('wheel', { deltaY: -120, cancelable: true });
      canvas.dispatchEvent(zoomInEvent);

      const updatedScale = chart.getZoomScale();
      assert.ok(
        updatedScale > initialScale,
        `Zoom scale should increase when deltaY < 0. Initial: ${initialScale}, Updated: ${updatedScale}`
      );
    });

    it('should update zoom scale factor when zooming out (positive deltaY)', () => {
      const canvas = new MockElement('canvas');
      const chart = new Chart(canvas);
      const initialScale = chart.getZoomScale();

      // Positive deltaY indicates zooming out
      const zoomOutEvent = new MockWheelEvent('wheel', { deltaY: 120, cancelable: true });
      canvas.dispatchEvent(zoomOutEvent);

      const updatedScale = chart.getZoomScale();
      assert.ok(
        updatedScale < initialScale,
        `Zoom scale should decrease when deltaY > 0. Initial: ${initialScale}, Updated: ${updatedScale}`
      );
    });

    it('should trigger re-rendering of the canvas/candlesticks on wheel zoom event', () => {
      const canvas = new MockElement('canvas');
      const sampleCandles = [
        { time: 1620000000, open: 100, high: 110, low: 95, close: 105 },
        { time: 1620000060, open: 105, high: 115, low: 102, close: 112 },
      ];

      const chart = new Chart(canvas, { data: sampleCandles });
      const context = canvas.getContext('2d');

      // Clear render tracking calls from initial draw
      context.reset();

      const wheelEvent = new MockWheelEvent('wheel', { deltaY: -100, cancelable: true });
      canvas.dispatchEvent(wheelEvent);

      const hasRedrawn = context.calls.some(
        (call) => call.method === 'clearRect' || call.method === 'stroke' || call.method === 'fillRect'
      );

      assert.ok(
        hasRedrawn,
        'Canvas context must execute drawing commands to re-render candlesticks after wheel zoom'
      );
    });

    it('should not allow scale factor to become negative or zero', () => {
      const canvas = new MockElement('canvas');
      const chart = new Chart(canvas);

      // Extreme zoom out sequence
      for (let i = 0; i < 50; i++) {
        canvas.dispatchEvent(new MockWheelEvent('wheel', { deltaY: 500, cancelable: true }));
      }

      const finalScale = chart.getZoomScale();
      assert.ok(finalScale > 0, `Zoom scale must remain strictly positive, got: ${finalScale}`);
    });
  });

  describe('Active Entrypoint Wiring (src/main.js)', () => {
    it('should mount chart canvas to document.getElementById("app")', async () => {
      const appContainer = document.getElementById('app');
      assert.strictEqual(appContainer.children.length, 0, 'App container must initially be empty');

      // Execute entrypoint mounting logic (supports named mountApp/init or default entry function)
      if (typeof mainModule.initApp === 'function') {
        mainModule.initApp();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount();
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      } else {
        assert.fail('src/main.js must export an initialization/mount function (initApp, mount, or default)');
      }

      const canvasChild = Array.from(appContainer.children).find((child) => child.tagName === 'CANVAS');
      assert.ok(
        canvasChild,
        'src/main.js must mount the canvas element into document.getElementById("app")'
      );
    });

    it('should attach active wheel zoom listener to the mounted canvas element in src/main.js', async () => {
      if (typeof mainModule.initApp === 'function') {
        mainModule.initApp();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount();
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      }

      const appContainer = document.getElementById('app');
      const canvas = Array.from(appContainer.children).find((child) => child.tagName === 'CANVAS');
      assert.ok(canvas, 'Canvas must be mounted to #app');

      const wheelListeners = canvas.listeners.get('wheel') || [];
      assert.ok(
        wheelListeners.length > 0,
        'Mounted canvas element must have at least one active "wheel" event listener attached'
      );

      // Dispatch wheel event on the actively mounted canvas
      const wheelEvent = new MockWheelEvent('wheel', { deltaY: -80, cancelable: true });
      const notPrevented = canvas.dispatchEvent(wheelEvent);

      assert.strictEqual(
        wheelEvent.defaultPrevented,
        true,
        'Wheel event dispatched on mounted canvas must have default behavior prevented'
      );
    });

    it('should cause re-render when wheel event is fired on the canvas mounted by src/main.js', async () => {
      if (typeof mainModule.initApp === 'function') {
        mainModule.initApp();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount();
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      }

      const appContainer = document.getElementById('app');
      const canvas = Array.from(appContainer.children).find((child) => child.tagName === 'CANVAS');
      const context = canvas.getContext('2d');

      // Clear initialization draw records
      context.reset();

      const wheelEvent = new MockWheelEvent('wheel', { deltaY: 100, cancelable: true });
      canvas.dispatchEvent(wheelEvent);

      assert.ok(
        context.calls.length > 0,
        'Dispatching wheel event on the live mounted canvas must trigger render calls on the 2D context'
      );
    });
  });
});