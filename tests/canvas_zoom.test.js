import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Deterministic DOM & Canvas Mocking Layer for Node.js test execution.
 * Simulates browser environment required by src/main.js and src/chart.js.
 */
class MockCanvasRenderingContext2D {
  constructor() {
    this.calls = [];
    this.drawnCoordinates = [];
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: 'clearRect', args: [x, y, w, h] });
  }

  fillRect(x, y, w, h) {
    this.calls.push({ method: 'fillRect', args: [x, y, w, h] });
    this.drawnCoordinates.push(x, y, w, h);
  }

  strokeRect(x, y, w, h) {
    this.calls.push({ method: 'strokeRect', args: [x, y, w, h] });
    this.drawnCoordinates.push(x, y, w, h);
  }

  beginPath() {
    this.calls.push({ method: 'beginPath' });
  }

  moveTo(x, y) {
    this.calls.push({ method: 'moveTo', args: [x, y] });
    this.drawnCoordinates.push(x, y);
  }

  lineTo(x, y) {
    this.calls.push({ method: 'lineTo', args: [x, y] });
    this.drawnCoordinates.push(x, y);
  }

  stroke() {
    this.calls.push({ method: 'stroke' });
  }

  save() {
    this.calls.push({ method: 'save' });
  }

  restore() {
    this.calls.push({ method: 'restore' });
  }

  scale(sx, sy) {
    this.calls.push({ method: 'scale', args: [sx, sy] });
  }

  translate(tx, ty) {
    this.calls.push({ method: 'translate', args: [tx, ty] });
  }
}

class MockCanvasElement {
  constructor() {
    this.listeners = new Map();
    this.ctx = new MockCanvasRenderingContext2D();
    this.width = 800;
    this.height = 600;
    this.parentElement = null;
  }

  getContext(type) {
    if (type === '2d') {
      return this.ctx;
    }
    return null;
  }

  addEventListener(type, listener, options = {}) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push({ listener, options });
  }

  removeEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      list.filter((entry) => entry.listener !== listener)
    );
  }

  dispatchEvent(event) {
    event.target = this;
    const list = this.listeners.get(event.type) || [];
    for (const entry of list) {
      entry.listener.call(this, event);
    }
    return !event.defaultPrevented;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: this.width,
      height: this.height,
      right: this.width,
      bottom: this.height,
    };
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
    this.defaultPrevented = false;
    this.target = null;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {}
}

class MockAppElement {
  constructor() {
    this.id = 'app';
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    this.children = Array.from(this.children).filter((c) => c !== child);
    child.parentElement = null;
    return child;
  }

  querySelector(selector) {
    if (selector === 'canvas') {
      return Array.from(this.children).find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }
}

// Establish globals prior to module import
let mockApp = new MockAppElement();

globalThis.WheelEvent = MockWheelEvent;
globalThis.HTMLCanvasElement = MockCanvasElement;
globalThis.document = {
  getElementById(id) {
    if (id === 'app') return mockApp;
    return null;
  },
  createElement(tag) {
    if (tag === 'canvas') return new MockCanvasElement();
    return {};
  },
};
globalThis.window = globalThis;

// Import source targets under test
const { Chart } = await import('../src/chart.js');
const main = await import('../src/main.js');

describe('STORY 31.1.1: Resolve UNRESPONSIVE_CANVAS_ZOOM (Defect DF-GESTURE-02)', () => {
  const sampleCandlesticks = [
    { timestamp: 1600000000, open: 100, high: 115, low: 95, close: 110 },
    { timestamp: 1600000060, open: 110, high: 120, low: 108, close: 115 },
    { timestamp: 1600000120, open: 115, high: 125, low: 112, close: 105 },
    { timestamp: 1600000180, open: 105, high: 109, low: 90, close: 92 },
  ];

  let canvas;
  let chart;

  beforeEach(() => {
    mockApp = new MockAppElement();
    canvas = new MockCanvasElement();
  });

  describe('Canvas Zoom Handler & Wheel Calculation (src/chart.js)', () => {
    beforeEach(() => {
      chart = new Chart({
        canvas,
        data: sampleCandlesticks,
        initialZoom: 1.0,
        minZoom: 0.2,
        maxZoom: 5.0,
      });
      chart.render();
    });

    it('should update zoom scale and trigger canvas re-render when scroll up (zoom in) occurs', () => {
      const initialScale = chart.getZoom();
      const initialDrawCallCount = canvas.ctx.calls.length;

      const wheelEvent = new MockWheelEvent('wheel', {
        deltaY: -120,
        clientX: 400,
        clientY: 300,
      });

      canvas.dispatchEvent(wheelEvent);

      const updatedScale = chart.getZoom();
      assert.ok(
        updatedScale > initialScale,
        `Expected zoom scale to increase on deltaY < 0. Initial: ${initialScale}, Updated: ${updatedScale}`
      );
      assert.ok(
        canvas.ctx.calls.length > initialDrawCallCount,
        'Expected canvas context to record re-render operations after zoom'
      );
      assert.ok(
        wheelEvent.defaultPrevented,
        'Expected wheel event default to be prevented to stop browser scrolling'
      );
    });

    it('should update zoom scale and trigger canvas re-render when scroll down (zoom out) occurs', () => {
      const initialScale = chart.getZoom();
      const initialDrawCallCount = canvas.ctx.calls.length;

      const wheelEvent = new MockWheelEvent('wheel', {
        deltaY: 120,
        clientX: 400,
        clientY: 300,
      });

      canvas.dispatchEvent(wheelEvent);

      const updatedScale = chart.getZoom();
      assert.ok(
        updatedScale < initialScale,
        `Expected zoom scale to decrease on deltaY > 0. Initial: ${initialScale}, Updated: ${updatedScale}`
      );
      assert.ok(
        canvas.ctx.calls.length > initialDrawCallCount,
        'Expected canvas context to record re-render operations after zoom out'
      );
    });

    it('should clamp zoom scale to maxZoom and avoid NaN/infinite coordinates when zooming in beyond limit', () => {
      // Dispatch intense zoom in sequence beyond upper limit
      for (let i = 0; i < 20; i++) {
        const wheelEvent = new MockWheelEvent('wheel', {
          deltaY: -500,
          clientX: 400,
          clientY: 300,
        });
        canvas.dispatchEvent(wheelEvent);
      }

      const finalScale = chart.getZoom();
      assert.strictEqual(
        finalScale,
        5.0,
        `Zoom scale should clamp exactly at maxZoom (5.0), received: ${finalScale}`
      );

      // Verify no coordinates generated during candlestick rendering are NaN or infinite
      assert.ok(
        canvas.ctx.drawnCoordinates.length > 0,
        'Coordinates should be generated during render'
      );
      for (const coord of canvas.ctx.drawnCoordinates) {
        assert.ok(
          Number.isFinite(coord) && !Number.isNaN(coord),
          `Rendered coordinate must be a valid finite number, encountered: ${coord}`
        );
      }
    });

    it('should clamp zoom scale to minZoom and avoid NaN/infinite coordinates when zooming out beyond limit', () => {
      // Dispatch intense zoom out sequence beyond lower limit
      for (let i = 0; i < 20; i++) {
        const wheelEvent = new MockWheelEvent('wheel', {
          deltaY: 500,
          clientX: 400,
          clientY: 300,
        });
        canvas.dispatchEvent(wheelEvent);
      }

      const finalScale = chart.getZoom();
      assert.strictEqual(
        finalScale,
        0.2,
        `Zoom scale should clamp exactly at minZoom (0.2), received: ${finalScale}`
      );

      // Verify coordinate sanity
      assert.ok(
        canvas.ctx.drawnCoordinates.length > 0,
        'Coordinates should be generated during render'
      );
      for (const coord of canvas.ctx.drawnCoordinates) {
        assert.ok(
          Number.isFinite(coord) && !Number.isNaN(coord),
          `Rendered coordinate must be a valid finite number, encountered: ${coord}`
        );
      }
    });

    it('should maintain stable zoom scale when deltaY is zero', () => {
      const initialScale = chart.getZoom();
      const wheelEvent = new MockWheelEvent('wheel', {
        deltaY: 0,
        clientX: 400,
        clientY: 300,
      });

      canvas.dispatchEvent(wheelEvent);

      assert.strictEqual(
        chart.getZoom(),
        initialScale,
        'Zoom scale should not mutate when deltaY is 0'
      );
    });
  });

  describe('Active Entrypoint Mounting & Event Wiring (src/main.js)', () => {
    afterEach(() => {
      if (typeof main.teardown === 'function') {
        main.teardown();
      }
    });

    it('should mount chart canvas to document.getElementById("app") and wire the active zoom wheel listener', () => {
      // Execute main mount routine
      const mountedInstance = typeof main.initApp === 'function' ? main.initApp() : main.default?.();

      const appEl = globalThis.document.getElementById('app');
      assert.ok(appEl.children.length > 0, 'Expected canvas to be appended to #app');

      const activeCanvas = appEl.querySelector('canvas');
      assert.ok(activeCanvas, 'Expected an HTMLCanvasElement instance within #app');

      // Verify the wheel listener is active on the mounted canvas
      const wheelListeners = activeCanvas.listeners.get('wheel') || [];
      assert.ok(
        wheelListeners.length > 0,
        'Expected at least one active "wheel" event listener attached to the mounted canvas'
      );

      // Verify dispatching wheel scroll over live mounted canvas produces zoom changes
      const activeChart = mountedInstance?.chart || main.activeChart;
      assert.ok(activeChart, 'Expected accessible active Chart instance bound to main entrypoint');

      const initialScale = activeChart.getZoom();
      const initialCallCount = activeCanvas.ctx.calls.length;

      const wheelEvent = new MockWheelEvent('wheel', {
        deltaY: -100,
        clientX: 200,
        clientY: 150,
      });
      activeCanvas.dispatchEvent(wheelEvent);

      assert.notStrictEqual(
        activeChart.getZoom(),
        initialScale,
        'Dispatching wheel event on mounted canvas must update the chart zoom scale'
      );
      assert.ok(
        activeCanvas.ctx.calls.length > initialCallCount,
        'Dispatching wheel event on mounted canvas must trigger candle redraw'
      );
    });
  });
});