import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as canvasModule from '../src/canvas.js';
import * as mainModule from '../src/main.js';

/* ========================================================================== */
/* Mock DOM Environment Setup (Strict adherence to DOM Mocking Invariants)   */
/* ========================================================================== */

class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.scaleHistory = [];
    this.transformHistory = [];
    this.drawCalls = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
  }

  scale(sx, sy) {
    this.scaleHistory.push({ sx, sy });
  }

  setTransform(a, b, c, d, e, f) {
    this.transformHistory.push({ type: 'setTransform', args: [a, b, c, d, e, f] });
  }

  resetTransform() {
    this.transformHistory.push({ type: 'resetTransform', args: [] });
  }

  clearRect(x, y, w, h) {
    this.drawCalls.push({ type: 'clearRect', args: [x, y, w, h] });
  }

  fillRect(x, y, w, h) {
    this.drawCalls.push({ type: 'fillRect', args: [x, y, w, h] });
  }

  beginPath() {
    this.drawCalls.push({ type: 'beginPath' });
  }

  stroke() {
    this.drawCalls.push({ type: 'stroke' });
  }

  fill() {
    this.drawCalls.push({ type: 'fill' });
  }

  save() {
    this.transformHistory.push({ type: 'save' });
  }

  restore() {
    this.transformHistory.push({ type: 'restore' });
  }
}

class MockElement {
  constructor(tagName = 'DIV') {
    const normalizedTag = String(tagName).toUpperCase();

    // DOM MOCKING RULE: Use Object.defineProperty for native read-only getters
    Object.defineProperty(this, 'tagName', {
      get: () => normalizedTag,
      enumerable: true,
      configurable: true,
    });

    Object.defineProperty(this, 'nodeName', {
      get: () => normalizedTag,
      enumerable: true,
      configurable: true,
    });

    this.id = '';
    this.className = '';
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.listeners = new Map();
    this.attributes = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  querySelector(selector) {
    const isId = selector.startsWith('#');
    const isClass = selector.startsWith('.');
    const cleanSelector = isId || isClass ? selector.slice(1) : selector.toUpperCase();

    for (const child of this.children) {
      if (isId && child.id === cleanSelector) return child;
      if (isClass && child.className.split(/\s+/).includes(cleanSelector)) return child;
      if (!isId && !isClass && child.tagName === cleanSelector) return child;

      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const isId = selector.startsWith('#');
    const isClass = selector.startsWith('.');
    const cleanSelector = isId || isClass ? selector.slice(1) : selector.toUpperCase();

    for (const child of this.children) {
      if (isId && child.id === cleanSelector) matches.push(child);
      if (isClass && child.className.split(/\s+/).includes(cleanSelector)) matches.push(child);
      if (!isId && !isClass && child.tagName === cleanSelector) matches.push(child);

      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  removeEventListener(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  dispatchEvent(event) {
    if (this.listeners.has(event.type)) {
      for (const listener of this.listeners.get(event.type)) {
        listener.call(this, event);
      }
    }
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      width: this.clientWidth,
      height: this.clientHeight,
    };
  }
}

class MockCanvasElement extends MockElement {
  constructor() {
    super('CANVAS');
    this.width = 300;
    this.height = 150;
    this._context2d = new MockCanvasRenderingContext2D(this);
  }

  getContext(type) {
    if (type === '2d') {
      return this._context2d;
    }
    return null;
  }
}

class MockResizeObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.observedTargets = new Set();
    MockResizeObserver.instances.push(this);
  }

  observe(target) {
    this.observedTargets.add(target);
  }

  unobserve(target) {
    this.observedTargets.delete(target);
  }

  disconnect() {
    this.observedTargets.clear();
  }

  // Test harness method to emulate layout resize notifications
  trigger(entries = []) {
    const actualEntries = entries.map((entry) => {
      const target = entry.target;
      return {
        target,
        contentRect: entry.contentRect || {
          width: target.clientWidth,
          height: target.clientHeight,
          top: 0,
          left: 0,
        },
      };
    });
    this.callback(actualEntries, this);
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('BODY');
    this.body.parentNode = this;
  }

  createElement(tagName) {
    if (String(tagName).toUpperCase() === 'CANVAS') {
      return new MockCanvasElement();
    }
    return new MockElement(tagName);
  }

  getElementById(id) {
    return this.body.querySelector(`#${id}`);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

// Global DOM Registration
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalResizeObserver = globalThis.ResizeObserver;

function setupMockDOM() {
  const document = new MockDocument();
  const window = {
    document,
    devicePixelRatio: 2,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = MockResizeObserver;
  MockResizeObserver.instances = [];
  return { document, window };
}

function restoreMockDOM() {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.ResizeObserver = originalResizeObserver;
  MockResizeObserver.instances = [];
}

/* ========================================================================== */
/* Test Suite: STORY 37.3.1 - Resolve CANVAS_DPI_RESOLUTION_MISMATCH         */
/* ========================================================================== */

describe('STORY 37.3.1: Resolve CANVAS_DPI_RESOLUTION_MISMATCH', () => {
  let domEnv;

  beforeEach(() => {
    domEnv = setupMockDOM();
  });

  afterEach(() => {
    restoreMockDOM();
  });

  /* ------------------------------------------------------------------------ */
  /* Target Module: src/canvas.js                                            */
  /* ------------------------------------------------------------------------ */
  describe('src/canvas.js - Canvas DPI Synchronization Unit Tests', () => {
    it('Defect DF-DPI-01 Reproduction & Fix: synchronizes canvas buffer attributes from 300x150 to scaled 2224x812 (1112x406 at DPR=2)', () => {
      const syncDpi = canvasModule.syncCanvasDpi || canvasModule.setupCanvasDpi;
      assert.strictEqual(
        typeof syncDpi,
        'function',
        'src/canvas.js must export a syncCanvasDpi or setupCanvasDpi function'
      );

      const canvas = new MockCanvasElement();
      // DF-DPI-01 Initial blurred defect state: attributes are 300x150, layout is 1112x406
      canvas.width = 300;
      canvas.height = 150;
      canvas.clientWidth = 1112;
      canvas.clientHeight = 406;
      globalThis.window.devicePixelRatio = 2;

      const result = syncDpi(canvas);

      // Verify pixel buffer attributes match client layout * devicePixelRatio
      assert.strictEqual(
        canvas.width,
        2224,
        'canvas.width attribute must equal clientWidth * devicePixelRatio (1112 * 2 = 2224)'
      );
      assert.strictEqual(
        canvas.height,
        812,
        'canvas.height attribute must equal clientHeight * devicePixelRatio (406 * 2 = 812)'
      );

      // Verify CSS style dimensions match client layout to prevent browser interpolation blur
      assert.strictEqual(
        canvas.style.width,
        '1112px',
        'canvas.style.width must explicitly match clientWidth in px'
      );
      assert.strictEqual(
        canvas.style.height,
        '406px',
        'canvas.style.height must explicitly match clientHeight in px'
      );

      // Verify ctx.scale(dpr, dpr) applied to preserve drawing coordinate space
      const ctx = canvas.getContext('2d');
      assert.strictEqual(ctx.scaleHistory.length > 0, true, 'ctx.scale must be called');
      const latestScale = ctx.scaleHistory[ctx.scaleHistory.length - 1];
      assert.deepStrictEqual(
        latestScale,
        { sx: 2, sy: 2 },
        'ctx.scale(2, 2) must be applied for 2x DPR'
      );

      if (result) {
        assert.strictEqual(result.dpr, 2);
        assert.strictEqual(result.width, 2224);
        assert.strictEqual(result.height, 812);
      }
    });

    it('handles fractional devicePixelRatio (e.g., 1.25x and 1.5x) with exact integer rounding', () => {
      const syncDpi = canvasModule.syncCanvasDpi || canvasModule.setupCanvasDpi;
      const canvas = new MockCanvasElement();
      canvas.clientWidth = 855;
      canvas.clientHeight = 345;
      globalThis.window.devicePixelRatio = 1.5;

      syncDpi(canvas);

      const expectedWidth = Math.round(855 * 1.5); // 1283 (Math.round(1282.5) -> 1283)
      const expectedHeight = Math.round(345 * 1.5); // 518 (Math.round(517.5) -> 518)

      assert.strictEqual(
        canvas.width,
        expectedWidth,
        `canvas.width must be rounded to ${expectedWidth}`
      );
      assert.strictEqual(
        canvas.height,
        expectedHeight,
        `canvas.height must be rounded to ${expectedHeight}`
      );

      assert.strictEqual(canvas.style.width, '855px');
      assert.strictEqual(canvas.style.height, '345px');

      const ctx = canvas.getContext('2d');
      const latestScale = ctx.scaleHistory[ctx.scaleHistory.length - 1];
      assert.deepStrictEqual(latestScale, { sx: 1.5, sy: 1.5 });
    });

    it('resets context transform before applying scale to prevent compounding transforms on repeated syncs', () => {
      const syncDpi = canvasModule.syncCanvasDpi || canvasModule.setupCanvasDpi;
      const canvas = new MockCanvasElement();
      canvas.clientWidth = 1000;
      canvas.clientHeight = 400;
      globalThis.window.devicePixelRatio = 2;

      // First sync
      syncDpi(canvas);

      // Layout changes and second sync triggered
      canvas.clientWidth = 1200;
      canvas.clientHeight = 500;
      syncDpi(canvas);

      const ctx = canvas.getContext('2d');

      // Ensure transform was reset (via setTransform(1,0,0,1,0,0) or resetTransform())
      const hasReset = ctx.transformHistory.some(
        (entry) =>
          entry.type === 'resetTransform' ||
          (entry.type === 'setTransform' &&
            entry.args[0] === 1 &&
            entry.args[1] === 0 &&
            entry.args[2] === 0 &&
            entry.args[3] === 1 &&
            entry.args[4] === 0 &&
            entry.args[5] === 0)
      );

      assert.strictEqual(
        hasReset,
        true,
        'Context transform must be reset to identity before re-scaling to avoid scaling explosion'
      );
      assert.strictEqual(canvas.width, 2400);
      assert.strictEqual(canvas.height, 1000);
    });

    it('falls back safely to DPR = 1 when window.devicePixelRatio is missing or zero', () => {
      const syncDpi = canvasModule.syncCanvasDpi || canvasModule.setupCanvasDpi;
      const canvas = new MockCanvasElement();
      canvas.clientWidth = 500;
      canvas.clientHeight = 250;
      globalThis.window.devicePixelRatio = undefined;

      syncDpi(canvas);

      assert.strictEqual(canvas.width, 500, 'canvas.width must fallback to clientWidth * 1');
      assert.strictEqual(canvas.height, 250, 'canvas.height must fallback to clientHeight * 1');
      assert.strictEqual(canvas.style.width, '500px');
      assert.strictEqual(canvas.style.height, '250px');

      const ctx = canvas.getContext('2d');
      const latestScale = ctx.scaleHistory[ctx.scaleHistory.length - 1];
      assert.deepStrictEqual(latestScale, { sx: 1, sy: 1 });
    });

    it('gracefully handles zero or collapsed dimensions without generating NaN or negative attributes', () => {
      const syncDpi = canvasModule.syncCanvasDpi || canvasModule.setupCanvasDpi;
      const canvas = new MockCanvasElement();
      canvas.clientWidth = 0;
      canvas.clientHeight = 0;
      globalThis.window.devicePixelRatio = 2;

      syncDpi(canvas);

      assert.strictEqual(canvas.width >= 0, true);
      assert.strictEqual(canvas.height >= 0, true);
      assert.strictEqual(Number.isNaN(canvas.width), false);
      assert.strictEqual(Number.isNaN(canvas.height), false);
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Target Module: src/main.js (Entrypoint & ResizeObserver Integration)     */
  /* ------------------------------------------------------------------------ */
  describe('src/main.js - Active Entrypoint Lifecycle & ResizeObserver Tests', () => {
    it('ENTRYPOINT TESTING INVARIANT: exports mounting functions (mountApp or mount) and initializers', () => {
      const mountFn = mainModule.mountApp || mainModule.mount;
      assert.strictEqual(
        typeof mountFn,
        'function',
        'src/main.js must export an active mounting function (mountApp or mount)'
      );
    });

    it('ENTRYPOINT TESTING INVARIANT: mounts the application UI to a DOM container without uncaught errors', () => {
      const mountFn = mainModule.mountApp || mainModule.mount;
      const appContainer = domEnv.document.createElement('div');
      appContainer.id = 'app';
      appContainer.clientWidth = 1112;
      appContainer.clientHeight = 406;
      domEnv.document.body.appendChild(appContainer);

      let appInstance;
      assert.doesNotThrow(() => {
        appInstance = mountFn(appContainer);
      }, 'Calling mountApp/mount with a DOM container must succeed without throwing errors');

      // Verify canvas element was mounted into the UI tree
      const canvas = appContainer.querySelector('canvas');
      assert.ok(canvas, 'Application mounting must create/attach a canvas element inside container');
      assert.strictEqual(
        canvas.tagName,
        'CANVAS',
        'Mounted element must have tagName CANVAS'
      );

      // Verify initial DPI synchronization was executed on mount
      assert.strictEqual(
        canvas.width,
        2224,
        'Mounted canvas width must be synchronized with DPR (1112 * 2)'
      );
      assert.strictEqual(
        canvas.height,
        812,
        'Mounted canvas height must be synchronized with DPR (406 * 2)'
      );

      if (appInstance && typeof appInstance.unmount === 'function') {
        appInstance.unmount();
      }
    });

    it('attaches ResizeObserver to continuously synchronize canvas DPI scaling on container layout changes', () => {
      const mountFn = mainModule.mountApp || mainModule.mount;
      const appContainer = domEnv.document.createElement('div');
      appContainer.id = 'app';
      appContainer.clientWidth = 1112;
      appContainer.clientHeight = 406;
      domEnv.document.body.appendChild(appContainer);

      const appInstance = mountFn(appContainer);
      const canvas = appContainer.querySelector('canvas');

      // Verify ResizeObserver was instantiated
      assert.strictEqual(
        MockResizeObserver.instances.length > 0,
        true,
        'A ResizeObserver must be instantiated to observe layout changes'
      );

      const activeObserver = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
      const observesTarget =
        activeObserver.observedTargets.has(appContainer) ||
        activeObserver.observedTargets.has(canvas) ||
        Array.from(activeObserver.observedTargets).some(
          (t) => t.parentNode === appContainer || t === appContainer
        );

      assert.strictEqual(
        observesTarget,
        true,
        'ResizeObserver must observe the app container or the chart canvas'
      );

      // Emulate layout change event from browser layout engine (e.g. window resize / split-pane expansion)
      appContainer.clientWidth = 1400;
      appContainer.clientHeight = 600;
      if (canvas) {
        canvas.clientWidth = 1400;
        canvas.clientHeight = 600;
      }

      activeObserver.trigger([
        {
          target: appContainer,
          contentRect: { width: 1400, height: 600, top: 0, left: 0 },
        },
      ]);

      // Assert canvas dimensions continuously updated to match new layout * DPR
      assert.strictEqual(
        canvas.width,
        2800,
        'canvas.width buffer must update to 1400 * 2 = 2800 after resize event'
      );
      assert.strictEqual(
        canvas.height,
        1200,
        'canvas.height buffer must update to 600 * 2 = 1200 after resize event'
      );
      assert.strictEqual(
        canvas.style.width,
        '1400px',
        'canvas.style.width must update to 1400px'
      );
      assert.strictEqual(
        canvas.style.height,
        '600px',
        'canvas.style.height must update to 600px'
      );

      if (appInstance && typeof appInstance.unmount === 'function') {
        appInstance.unmount();
      }
    });

    it('triggers chart redraw operations when layout changes are received', () => {
      const mountFn = mainModule.mountApp || mainModule.mount;
      const appContainer = domEnv.document.createElement('div');
      appContainer.id = 'app';
      appContainer.clientWidth = 1112;
      appContainer.clientHeight = 406;
      domEnv.document.body.appendChild(appContainer);

      const appInstance = mountFn(appContainer);
      const canvas = appContainer.querySelector('canvas');
      const ctx = canvas.getContext('2d');

      const initialDrawCallCount = ctx.drawCalls.length;
      const activeObserver = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];

      // Simulate container resize
      appContainer.clientWidth = 1250;
      appContainer.clientHeight = 450;
      canvas.clientWidth = 1250;
      canvas.clientHeight = 450;

      activeObserver.trigger([
        {
          target: appContainer,
          contentRect: { width: 1250, height: 450, top: 0, left: 0 },
        },
      ]);

      // Chart redraw must trigger drawing or canvas clearing operations
      assert.strictEqual(
        ctx.drawCalls.length > initialDrawCallCount,
        true,
        'Resize event must trigger chart redraw logic on the 2D context'
      );

      if (appInstance && typeof appInstance.unmount === 'function') {
        appInstance.unmount();
      }
    });

    it('disconnects ResizeObserver on unmount to prevent memory leaks and zombie listeners', () => {
      const mountFn = mainModule.mountApp || mainModule.mount;
      const appContainer = domEnv.document.createElement('div');
      appContainer.id = 'app';
      appContainer.clientWidth = 1112;
      appContainer.clientHeight = 406;
      domEnv.document.body.appendChild(appContainer);

      const appInstance = mountFn(appContainer);
      const activeObserver = MockResizeObserver.instances[MockResizeObserver.instances.length - 1];

      assert.strictEqual(
        activeObserver.observedTargets.size > 0,
        true,
        'Observer should have active observed targets while mounted'
      );

      // Teardown the mounted application
      if (appInstance && typeof appInstance.unmount === 'function') {
        appInstance.unmount();
        assert.strictEqual(
          activeObserver.observedTargets.size === 0,
          true,
          'Unmounting must disconnect or unobserve targets from the ResizeObserver'
        );
      } else if (typeof mainModule.unmount === 'function') {
        mainModule.unmount(appContainer);
        assert.strictEqual(
          activeObserver.observedTargets.size === 0,
          true,
          'Unmounting must disconnect or unobserve targets from the ResizeObserver'
        );
      }
    });
  });
});