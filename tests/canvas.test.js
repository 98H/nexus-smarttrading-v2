import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import * as CanvasModule from '../src/canvas.js';
import * as MainModule from '../src/main.js';

/**
 * DOM MOCKING HARNESS
 * Implements strict DOM semantics where read-only properties (clientWidth, clientHeight,
 * tagName, nodeName) expose only getters. In ES Module strict mode, assigning to these
 * properties throws `TypeError: Cannot set property ... which has only a getter`.
 */
class MockDOMElement {
  constructor(tagName = 'DIV') {
    this._tagName = tagName.toUpperCase();
    this._clientWidth = 800;
    this._clientHeight = 600;
    this.style = {
      width: '',
      height: '',
      display: '',
      position: '',
      setProperty(prop, val) {
        this[prop] = String(val);
      },
      getPropertyValue(prop) {
        return this[prop] || '';
      }
    };
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.attributes = new Map();
    this.id = '';
    this.className = '';

    // Invariant: Never assign directly to native read-only getters.
    Object.defineProperty(this, 'tagName', {
      get: () => this._tagName,
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(this, 'nodeName', {
      get: () => this._tagName,
      enumerable: true,
      configurable: true
    });

    // Invariant: clientWidth/clientHeight have ONLY getters.
    // Assigning to them simulates the runtime TypeError from DF-CRASH-01.
    Object.defineProperty(this, 'clientWidth', {
      get: () => this._clientWidth,
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(this, 'clientHeight', {
      get: () => this._clientHeight,
      enumerable: true,
      configurable: true
    });
  }

  setMockDimensions(width, height) {
    this._clientWidth = Number(width);
    this._clientHeight = Number(height);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.className = '';
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
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
    const norm = selector.trim();
    for (const child of this.children) {
      if (norm.startsWith('#') && child.id === norm.slice(1)) return child;
      if (child.tagName === norm.toUpperCase()) return child;
      const nested = child.querySelector(norm);
      if (nested) return nested;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const norm = selector.trim();
    for (const child of this.children) {
      if (norm.startsWith('#') && child.id === norm.slice(1)) {
        results.push(child);
      } else if (child.tagName === norm.toUpperCase()) {
        results.push(child);
      }
      results.push(...child.querySelectorAll(norm));
    }
    return results;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(listener);
    }
  }

  dispatchEvent(event) {
    const listeners = this.listeners.get(event.type) || [];
    for (const listener of listeners) {
      listener.call(this, event);
    }
  }
}

class MockCanvasElement extends MockDOMElement {
  constructor() {
    super('CANVAS');
    // Read/write canvas internal coordinate buffer properties
    this.width = 300;
    this.height = 150;
    this._context = {
      canvas: this,
      clearRect: () => {},
      fillRect: () => {},
      scale: () => {},
      save: () => {},
      restore: () => {},
      drawImage: () => {}
    };
  }

  getContext(contextType) {
    if (contextType === '2d') {
      return this._context;
    }
    return null;
  }
}

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = new Set();
    MockResizeObserver.instances.push(this);
  }

  observe(target) {
    this.observed.add(target);
  }

  unobserve(target) {
    this.observed.delete(target);
  }

  disconnect() {
    this.observed.clear();
  }

  trigger(entries) {
    this.callback(entries, this);
  }
}
MockResizeObserver.instances = [];

// Environmental globals backup
let originalWindow;
let originalDocument;
let originalResizeObserver;
let originalDevicePixelRatio;

function setupMockEnvironment() {
  originalWindow = globalThis.window;
  originalDocument = globalThis.document;
  originalResizeObserver = globalThis.ResizeObserver;
  originalDevicePixelRatio = globalThis.devicePixelRatio;

  MockResizeObserver.instances = [];

  const mockBody = new MockDOMElement('BODY');
  const appRoot = new MockDOMElement('DIV');
  appRoot.setAttribute('id', 'app');
  appRoot.setMockDimensions(1024, 768);
  mockBody.appendChild(appRoot);

  const mockDocument = {
    body: mockBody,
    getElementById: (id) => {
      if (id === 'app') return appRoot;
      return mockBody.querySelector(`#${id}`);
    },
    createElement: (tag) => {
      const upper = tag.toUpperCase();
      if (upper === 'CANVAS') {
        return new MockCanvasElement();
      }
      return new MockDOMElement(upper);
    },
    querySelector: (sel) => mockBody.querySelector(sel),
    querySelectorAll: (sel) => mockBody.querySelectorAll(sel)
  };

  const mockWindow = {
    document: mockDocument,
    devicePixelRatio: 1,
    addEventListener: (type, fn) => mockBody.addEventListener(type, fn),
    removeEventListener: (type, fn) => mockBody.removeEventListener(type, fn),
    dispatchEvent: (evt) => mockBody.dispatchEvent(evt)
  };

  globalThis.window = mockWindow;
  globalThis.document = mockDocument;
  globalThis.ResizeObserver = MockResizeObserver;
  globalThis.devicePixelRatio = 1;

  return { mockDocument, appRoot };
}

function teardownMockEnvironment() {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.devicePixelRatio = originalDevicePixelRatio;
  MockResizeObserver.instances = [];
}

describe('STORY 49.1.1: Resolve UNCAUGHT_JAVASCRIPT_EXCEPTION (DF-CRASH-01)', () => {
  beforeEach(() => {
    setupMockEnvironment();
  });

  afterEach(() => {
    teardownMockEnvironment();
  });

  describe('Defect Reproduction Guardrail', () => {
    it('throws TypeError when clientWidth or clientHeight is directly assigned on mock elements', () => {
      const canvas = new MockCanvasElement();

      assert.throws(
        () => {
          // Direct assignment must fail in strict mode (reproducing DF-CRASH-01)
          canvas.clientWidth = 800;
        },
        {
          name: 'TypeError',
          message: /Cannot set property clientWidth of #<.+> which has only a getter/
        }
      );

      assert.throws(
        () => {
          canvas.clientHeight = 600;
        },
        {
          name: 'TypeError',
          message: /Cannot set property clientHeight of #<.+> which has only a getter/
        }
      );
    });
  });

  describe('Canvas Module: src/canvas.js', () => {
    it('initializes canvas dimensions via canvas.width, canvas.height and canvas.style instead of read-only client metrics', () => {
      const canvas = new MockCanvasElement();
      const container = new MockDOMElement('DIV');
      container.setMockDimensions(960, 540);

      // Locate viewport initialization/resizing function
      const initFn =
        CanvasModule.initCanvasViewport ||
        CanvasModule.initCanvas ||
        CanvasModule.setupCanvas ||
        CanvasModule.createCanvasViewport ||
        CanvasModule.resizeCanvas;

      assert.ok(
        typeof initFn === 'function',
        'src/canvas.js must export an initialization/sizing function (e.g. initCanvasViewport, initCanvas, setupCanvas, resizeCanvas)'
      );

      // Must execute without throwing TypeError on read-only clientWidth/clientHeight
      assert.doesNotThrow(() => {
        initFn(canvas, container);
      }, 'Initializing canvas viewport must never assign directly to read-only clientWidth');

      // Internal coordinate buffer must match container dimensions
      assert.strictEqual(
        canvas.width,
        960,
        'canvas.width buffer must be updated to container client width'
      );
      assert.strictEqual(
        canvas.height,
        540,
        'canvas.height buffer must be updated to container client height'
      );

      // CSS display layout must be styled via element.style properties
      const styleWidth = canvas.style.width;
      const styleHeight = canvas.style.height;

      assert.ok(
        styleWidth === '960px' || styleWidth === '100%',
        `canvas.style.width must reflect layout width, received: "${styleWidth}"`
      );
      assert.ok(
        styleHeight === '540px' || styleHeight === '100%',
        `canvas.style.height must reflect layout height, received: "${styleHeight}"`
      );
    });

    it('safely synchronizes internal resolution when container size updates', () => {
      const canvas = new MockCanvasElement();
      const container = new MockDOMElement('DIV');
      container.setMockDimensions(640, 480);

      const resizeFn =
        CanvasModule.resizeCanvas ||
        CanvasModule.syncCanvasDimensions ||
        CanvasModule.updateCanvasDimensions ||
        CanvasModule.initCanvasViewport ||
        CanvasModule.initCanvas;

      assert.ok(typeof resizeFn === 'function', 'src/canvas.js must export a resize handler');

      resizeFn(canvas, container);
      assert.strictEqual(canvas.width, 640);
      assert.strictEqual(canvas.height, 480);

      // Resize container
      container.setMockDimensions(1280, 720);

      assert.doesNotThrow(() => {
        resizeFn(canvas, container);
      }, 'Dimension synchronization must read client metrics safely and assign to canvas.width and style');

      assert.strictEqual(canvas.width, 1280);
      assert.strictEqual(canvas.height, 720);
      assert.strictEqual(canvas.style.width, '1280px');
      assert.strictEqual(canvas.style.height, '720px');
    });

    it('accounts for devicePixelRatio when scaling buffer without writing to clientWidth', () => {
      globalThis.window.devicePixelRatio = 2;
      globalThis.devicePixelRatio = 2;

      const canvas = new MockCanvasElement();
      const container = new MockDOMElement('DIV');
      container.setMockDimensions(500, 300);

      const resizeFn =
        CanvasModule.resizeCanvas ||
        CanvasModule.syncCanvasDimensions ||
        CanvasModule.initCanvasViewport ||
        CanvasModule.initCanvas;

      resizeFn(canvas, container);

      // With DPR = 2, internal buffer is scaled (either 1000 or 500 depending on DPR support)
      // but style dimensions must remain in CSS pixels and NEVER crash by setting clientWidth
      assert.ok(
        canvas.width === 1000 || canvas.width === 500,
        `Expected buffer width to be 1000 (DPR scaled) or 500, received: ${canvas.width}`
      );
      assert.ok(
        canvas.height === 600 || canvas.height === 300,
        `Expected buffer height to be 600 (DPR scaled) or 300, received: ${canvas.height}`
      );
      assert.ok(
        canvas.style.width === '500px' || canvas.style.width === '100%',
        `Expected style.width to be '500px' or '100%', received: ${canvas.style.width}`
      );
    });
  });

  describe('Application Entrypoint: src/main.js', () => {
    it('adheres to ENTRYPOINT TESTING INVARIANT: exports mounting functions and initializers', () => {
      const mountFn = MainModule.mountApp || MainModule.mount;
      assert.ok(
        typeof mountFn === 'function',
        'src/main.js must export a mounting function: mountApp or mount'
      );
    });

    it('mounts into document.getElementById("app") without uncaught exceptions', () => {
      const mountFn = MainModule.mountApp || MainModule.mount;
      const appContainer = globalThis.document.getElementById('app');
      assert.ok(appContainer, '#app container must exist prior to mount');

      let mountResult;
      assert.doesNotThrow(() => {
        mountResult = mountFn(appContainer);
      }, 'Invoking mountApp must not throw TypeError: Cannot set property clientWidth of #<Element> which has only a getter');

      // Verify canvas element was constructed and mounted into the live DOM tree
      const canvas = appContainer.querySelector('CANVAS');
      assert.ok(canvas, 'A canvas element must be created and appended within the mounted app container');
      assert.strictEqual(canvas.tagName, 'CANVAS');

      // Verify initial dimensions updated cleanly
      assert.strictEqual(canvas.width, 1024);
      assert.strictEqual(canvas.height, 768);
      assert.ok(
        canvas.style.width === '1024px' || canvas.style.width === '100%',
        `Canvas style width must be set properly, received: ${canvas.style.width}`
      );

      // Clean up if cleanup/unmount is returned
      if (typeof mountResult === 'function') {
        mountResult();
      } else if (mountResult && typeof mountResult.unmount === 'function') {
        mountResult.unmount();
      }
    });

    it('wires ResizeObserver and safely responds to container resize events', () => {
      const mountFn = MainModule.mountApp || MainModule.mount;
      const appContainer = globalThis.document.getElementById('app');

      const mountResult = mountFn(appContainer);

      // Verify ResizeObserver was wired to the container or canvas
      assert.ok(
        MockResizeObserver.instances.length > 0,
        'src/main.js must instantiate a ResizeObserver to observe viewport changes'
      );

      const activeObserver = MockResizeObserver.instances[0];
      const observedCount = activeObserver.observed.size;
      assert.ok(observedCount > 0, 'ResizeObserver must observe at least one DOM element (container or canvas)');

      const canvas = appContainer.querySelector('CANVAS');
      assert.ok(canvas, 'Canvas element must be present in DOM');

      // Trigger dynamic container resize
      appContainer.setMockDimensions(1440, 900);

      assert.doesNotThrow(() => {
        activeObserver.trigger([
          {
            target: appContainer,
            contentRect: { width: 1440, height: 900 }
          }
        ]);
      }, 'ResizeObserver callback must safely update canvas dimensions without assigning to clientWidth');

      // Canvas dimensions must reflect the new container boundaries
      assert.strictEqual(canvas.width, 1440, 'canvas.width must reflect new dimensions after resize');
      assert.strictEqual(canvas.height, 900, 'canvas.height must reflect new dimensions after resize');

      // Teardown
      if (typeof mountResult === 'function') {
        mountResult();
      } else if (mountResult && typeof mountResult.unmount === 'function') {
        mountResult.unmount();
      }
    });

    it('cleans up observers and handlers on unmount to prevent leaks and detached element writes', () => {
      const mountFn = MainModule.mountApp || MainModule.mount;
      const unmountFn = MainModule.unmountApp || MainModule.unmount;
      const appContainer = globalThis.document.getElementById('app');

      const instance = mountFn(appContainer);
      const observer = MockResizeObserver.instances[0];
      assert.ok(observer, 'Observer should be created upon mounting');

      // Determine unmount routine
      const performUnmount = () => {
        if (typeof unmountFn === 'function') {
          unmountFn(appContainer);
        } else if (typeof instance === 'function') {
          instance();
        } else if (instance && typeof instance.unmount === 'function') {
          instance.unmount();
        }
      };

      assert.doesNotThrow(() => {
        performUnmount();
      }, 'Unmounting application must execute cleanly without runtime exceptions');

      // Observer should be disconnected
      assert.strictEqual(
        observer.observed.size,
        0,
        'ResizeObserver must unobserve or disconnect when the application unmounts'
      );
    });
  });
});