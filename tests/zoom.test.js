import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Lightweight Deterministic DOM and Canvas Mock Environment ---

class MockDOMTokenList {
  constructor() {
    this._tokens = new Set();
  }
  add(...tokens) {
    tokens.forEach((t) => this._tokens.add(t));
  }
  remove(...tokens) {
    tokens.forEach((t) => this._tokens.delete(t));
  }
  contains(token) {
    return this._tokens.has(token);
  }
}

class MockEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles ?? false;
    this.cancelable = options.cancelable ?? true;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this.deltaY = options.deltaY ?? 0;
    this.deltaX = options.deltaX ?? 0;
    this.deltaMode = options.deltaMode ?? 0;
    this.clientX = options.clientX ?? 100;
    this.clientY = options.clientY ?? 100;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation() {
    this._stopped = true;
  }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.classList = new MockDOMTokenList();
    this.style = {};
    this.width = 800;
    this.height = 600;
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

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      return this.find((el) => el.id === targetId);
    }
    const tag = selector.toUpperCase();
    return this.find((el) => el.tagName === tag);
  }

  querySelectorAll(selector) {
    const results = [];
    this.findAll(selector.toUpperCase(), results);
    return results;
  }

  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child.find(predicate);
      if (found) return found;
    }
    return null;
  }

  findAll(tag, acc) {
    for (const child of this.children) {
      if (child.tagName === tag) acc.push(child);
      child.findAll(tag, acc);
    }
  }

  addEventListener(type, callback, options = {}) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push({ callback, options });
  }

  removeEventListener(type, callback) {
    if (!this.listeners.has(type)) return;
    const filtered = this.listeners.get(type).filter((l) => l.callback !== callback);
    this.listeners.set(type, filtered);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type) || [];
    for (const { callback } of handlers) {
      callback.call(this, event);
    }
    return !event.defaultPrevented;
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      bottom: this.height,
      right: this.width,
      width: this.width,
      height: this.height,
      x: 0,
      y: 0,
    };
  }
}

class MockCanvasContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderCalls = [];
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
  }

  clearRect(x, y, w, h) {
    this.renderCalls.push({ method: 'clearRect', args: [x, y, w, h] });
  }

  fillRect(x, y, w, h) {
    this.renderCalls.push({ method: 'fillRect', args: [x, y, w, h] });
  }

  strokeRect(x, y, w, h) {
    this.renderCalls.push({ method: 'strokeRect', args: [x, y, w, h] });
  }

  beginPath() {
    this.renderCalls.push({ method: 'beginPath', args: [] });
  }

  moveTo(x, y) {
    this.renderCalls.push({ method: 'moveTo', args: [x, y] });
  }

  lineTo(x, y) {
    this.renderCalls.push({ method: 'lineTo', args: [x, y] });
  }

  stroke() {
    this.renderCalls.push({ method: 'stroke', args: [] });
  }
}

class MockCanvasElement extends MockElement {
  constructor() {
    super('canvas');
    this._ctx = new MockCanvasContext2D(this);
  }

  getContext(type) {
    if (type === '2d') {
      return this._ctx;
    }
    return null;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this._elementsById = new Map();
  }

  createElement(tagName) {
    if (tagName.toLowerCase() === 'canvas') {
      return new MockCanvasElement();
    }
    return new MockElement(tagName);
  }

  getElementById(id) {
    return this._elementsById.get(id) || this.body.find((el) => el.id === id) || null;
  }

  registerElement(id, element) {
    element.id = id;
    this._elementsById.set(id, element);
  }
}

// Global browser simulation setup before importing application modules
const mockDocument = new MockDocument();
const appContainer = new MockElement('div');
appContainer.id = 'app';
mockDocument.body.appendChild(appContainer);
mockDocument.registerElement('app', appContainer);

globalThis.document = mockDocument;
globalThis.window = globalThis;
globalThis.WheelEvent = MockEvent;
globalThis.HTMLCanvasElement = MockCanvasElement;

// Dynamic imports of modules under test
const ChartModule = await import('../src/chart.js');
const MainModule = await import('../src/main.js');

const Chart = ChartModule.Chart || ChartModule.default;
const initApp = MainModule.initApp || MainModule.init || MainModule.default;

describe('STORY 29.3.1: Resolve UNRESPONSIVE_CANVAS_ZOOM (DF-GESTURE-02)', () => {
  let canvas;
  let chart;
  const sampleCandles = [
    { time: 1620000000, open: 100, high: 110, low: 95, close: 105 },
    { time: 1620000060, open: 105, high: 115, low: 102, close: 112 },
    { time: 1620000120, open: 112, high: 118, low: 108, close: 110 },
    { time: 1620000180, open: 110, high: 125, low: 109, close: 122 },
  ];

  beforeEach(() => {
    canvas = new MockCanvasElement();
    appContainer.children = [];
    appContainer.appendChild(canvas);

    chart = new Chart(canvas, {
      data: sampleCandles,
      initialZoom: 1.0,
      minZoom: 0.2,
      maxZoom: 5.0,
    });
  });

  afterEach(() => {
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
  });

  describe('Acceptance Criteria 1: Wheel Event Handling & Scale Recalculation (src/chart.js)', () => {
    it('MUST prevent default browser scrolling when wheel event occurs over canvas', () => {
      const wheelEvent = new MockEvent('wheel', { deltaY: -120, cancelable: true });
      canvas.dispatchEvent(wheelEvent);

      assert.strictEqual(
        wheelEvent.defaultPrevented,
        true,
        'CRITICAL: wheelEvent.preventDefault() was not called. Default scroll must be prevented.'
      );
    });

    it('MUST increase scale / zoom level when zooming in (wheel deltaY < 0)', () => {
      const initialScale = chart.getZoomLevel ? chart.getZoomLevel() : chart.scale;
      assert.ok(typeof initialScale === 'number', 'Chart must expose initial zoom scale.');

      const zoomInEvent = new MockEvent('wheel', { deltaY: -100, cancelable: true });
      canvas.dispatchEvent(zoomInEvent);

      const updatedScale = chart.getZoomLevel ? chart.getZoomLevel() : chart.scale;
      assert.ok(
        updatedScale > initialScale,
        `Expected zoom scale to increase after wheel-in. Initial: ${initialScale}, Updated: ${updatedScale}`
      );
    });

    it('MUST decrease scale / zoom level when zooming out (wheel deltaY > 0)', () => {
      const initialScale = chart.getZoomLevel ? chart.getZoomLevel() : chart.scale;

      const zoomOutEvent = new MockEvent('wheel', { deltaY: 100, cancelable: true });
      canvas.dispatchEvent(zoomOutEvent);

      const updatedScale = chart.getZoomLevel ? chart.getZoomLevel() : chart.scale;
      assert.ok(
        updatedScale < initialScale,
        `Expected zoom scale to decrease after wheel-out. Initial: ${initialScale}, Updated: ${updatedScale}`
      );
    });

    it('MUST recalculate time/price visible range when zoomed', () => {
      const initialTimeRange = chart.getTimeRange ? chart.getTimeRange() : { ...chart.timeScale.range };

      const zoomInEvent = new MockEvent('wheel', { deltaY: -200, cancelable: true });
      canvas.dispatchEvent(zoomInEvent);

      const updatedTimeRange = chart.getTimeRange ? chart.getTimeRange() : { ...chart.timeScale.range };

      assert.notDeepStrictEqual(
        updatedTimeRange,
        initialTimeRange,
        'Time/Price visible scale range must recalculate following a wheel zoom event.'
      );
    });

    it('MUST trigger canvas redraw/render when zoom updates scale', () => {
      const ctx = canvas.getContext('2d');
      ctx.renderCalls = []; // Clear call history

      const zoomEvent = new MockEvent('wheel', { deltaY: -100, cancelable: true });
      canvas.dispatchEvent(zoomEvent);

      const hasRedrawn = ctx.renderCalls.some(
        (call) => call.method === 'clearRect' || call.method === 'fillRect' || call.method === 'stroke'
      );

      assert.strictEqual(
        hasRedrawn,
        true,
        'Canvas context must receive drawing commands to re-render candlesticks after zoom.'
      );
    });

    it('MUST enforce boundary constraints (minZoom and maxZoom)', () => {
      // Zoom out excessively
      for (let i = 0; i < 20; i++) {
        canvas.dispatchEvent(new MockEvent('wheel', { deltaY: 500, cancelable: true }));
      }
      const minReached = chart.getZoomLevel ? chart.getZoomLevel() : chart.scale;
      assert.ok(
        minReached >= (chart.minZoom ?? 0.2),
        `Scale ${minReached} should not breach minimum zoom boundary.`
      );

      // Zoom in excessively
      for (let i = 0; i < 30; i++) {
        canvas.dispatchEvent(new MockEvent('wheel', { deltaY: -500, cancelable: true }));
      }
      const maxReached = chart.getZoomLevel ? chart.getZoomLevel() : chart.scale;
      assert.ok(
        maxReached <= (chart.maxZoom ?? 5.0),
        `Scale ${maxReached} should not breach maximum zoom boundary.`
      );
    });

    it('MUST NOT alter scale if deltaY is 0', () => {
      const initialScale = chart.getZoomLevel ? chart.getZoomLevel() : chart.scale;
      const zeroEvent = new MockEvent('wheel', { deltaY: 0, cancelable: true });
      canvas.dispatchEvent(zeroEvent);

      const afterScale = chart.getZoomLevel ? chart.getZoomLevel() : chart.scale;
      assert.strictEqual(afterScale, initialScale, 'Zero deltaY should not mutate scale.');
    });
  });

  describe('Acceptance Criteria 2: Application Entrypoint & Live Canvas Mounting (src/main.js)', () => {
    beforeEach(() => {
      // Clean app container
      appContainer.children = [];
      appContainer.listeners.clear();
    });

    it('MUST mount active canvas directly inside document.getElementById("app")', async () => {
      assert.ok(typeof initApp === 'function', 'src/main.js must export an initialization/mount function');
      
      const appInstance = await initApp();

      const mountedCanvas = appContainer.querySelector('canvas');
      assert.ok(mountedCanvas !== null, 'Active canvas element must be mounted within #app container.');
      assert.strictEqual(
        mountedCanvas.parentElement,
        appContainer,
        'Canvas must be a direct child of #app in the live DOM.'
      );

      if (appInstance && typeof appInstance.destroy === 'function') {
        appInstance.destroy();
      }
    });

    it('MUST bind wheel event listener directly to the active canvas in #app upon initialization', async () => {
      const appInstance = await initApp();
      const mountedCanvas = appContainer.querySelector('canvas');

      assert.ok(mountedCanvas, 'Canvas must exist in #app');

      const wheelListeners = mountedCanvas.listeners.get('wheel') || [];
      assert.ok(
        wheelListeners.length > 0,
        'Wheel event listener must be bound directly to the active canvas element in src/main.js'
      );

      if (appInstance && typeof appInstance.destroy === 'function') {
        appInstance.destroy();
      }
    });

    it('MUST update view and repaint live DOM canvas when wheel event dispatched from entrypoint', async () => {
      const appInstance = await initApp();
      const mountedCanvas = appContainer.querySelector('canvas');
      const ctx = mountedCanvas.getContext('2d');

      ctx.renderCalls = [];

      const liveWheelEvent = new MockEvent('wheel', {
        deltaY: -150,
        cancelable: true,
        clientX: 200,
        clientY: 200,
      });

      mountedCanvas.dispatchEvent(liveWheelEvent);

      assert.strictEqual(
        liveWheelEvent.defaultPrevented,
        true,
        'Live wheel event dispatched to mounted canvas must have default scroll prevented.'
      );

      assert.ok(
        ctx.renderCalls.length > 0,
        'Dispatched wheel event in live DOM must cause the canvas to execute render operations.'
      );

      if (appInstance && typeof appInstance.destroy === 'function') {
        appInstance.destroy();
      }
    });
  });
});