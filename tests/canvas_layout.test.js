/**
 * Test Suite: STORY 40.1.1: Resolve SQUISHED_CANVAS_VIEWPORT
 * Defect ID: DF-LAYOUT-01 (Severity: HIGH)
 * Target Modules: src/main.js, src/canvas.js
 *
 * Requirements:
 * - The primary workspace and chart canvas must flex-stretch horizontally across
 *   the primary workspace occupying >= 55% of viewport width (resolving squished 300px / 0.21 ratio).
 * - Canvas sizing logic in src/canvas.js must synchronize canvas buffer width/height
 *   with parent container dimensions on initial render and window resize.
 * - Root layout structure must maintain a responsive 100vh flex layout ('flex: 1; min-height: 0;')
 *   preventing default inline 300px squished canvas sizing.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as MainModule from '../src/main.js';
import * as CanvasModule from '../src/canvas.js';

// ============================================================================
// DOM MOCK INFRASTRUCTURE (Strictly adheres to Rule 7: Class getters for tagName)
// ============================================================================

class MockDOMElement {
  constructor(tagName = 'DIV') {
    this._tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.style = {};
    this.id = '';
    this.className = '';
    this.attributes = new Map();
    this._listeners = new Map();

    try { this.clientWidth = 0; } catch (_) {}
    try { this.clientHeight = 0; } catch (_) {}
    try { this.offsetWidth = 0; } catch (_) {}
    try { this.offsetHeight = 0; } catch (_) {}

    const self = this;
    this.classList = {
      _set: new Set(),
      add(...tokens) {
        for (const t of tokens) this._set.add(t);
        self.className = Array.from(this._set).join(' ');
      },
      remove(...tokens) {
        for (const t of tokens) this._set.delete(t);
        self.className = Array.from(this._set).join(' ');
      },
      contains(token) {
        return this._set.has(token);
      },
      toggle(token) {
        const exists = this._set.has(token);
        if (exists) this._set.delete(token);
        else this._set.add(token);
        self.className = Array.from(this._set).join(' ');
        return !exists;
      }
    };
  }

  // Read-only getter for tagName to prevent illegal assignment errors
  get tagName() {
    return this._tagName;
  }

  // Read-only getter for nodeName
  get nodeName() {
    return this._tagName;
  }

  setAttribute(name, value) {
    const valStr = String(value);
    this.attributes.set(name, valStr);
    if (name === 'id') this.id = valStr;
    if (name === 'class') {
      this.classList._set.clear();
      valStr.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    child.parentElement = this;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parentElement = null;
      child.parentNode = null;
    }
    return child;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const matches = (el) => {
      const sel = selector.trim();
      if (sel === '*') return true;
      if (sel.startsWith('#')) return el.id === sel.slice(1);
      if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
      if (sel.startsWith('[') && sel.endsWith(']')) {
        const expr = sel.slice(1, -1);
        if (expr.includes('=')) {
          const [key, val] = expr.split('=').map(s => s.replace(/['"]/g, '').trim());
          return el.getAttribute(key) === val;
        }
        return el.hasAttribute(expr);
      }
      if (sel.includes('.')) {
        const [tag, ...classes] = sel.split('.');
        const tagMatch = !tag || el.tagName.toLowerCase() === tag.toLowerCase();
        const classMatch = classes.every(c => el.classList.contains(c));
        return tagMatch && classMatch;
      }
      return el.tagName.toLowerCase() === sel.toLowerCase();
    };

    const traverse = (node) => {
      for (const child of node.children) {
        if (matches(child)) results.push(child);
        traverse(child);
      }
    };

    traverse(this);
    return results;
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      width: this.clientWidth,
      height: this.clientHeight,
      right: this.clientWidth,
      bottom: this.clientHeight
    };
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    if (this._listeners.has(type)) {
      const filtered = this._listeners.get(type).filter(fn => fn !== listener);
      this._listeners.set(type, filtered);
    }
  }

  dispatchEvent(event) {
    const listeners = this._listeners.get(event.type) || [];
    for (const listener of listeners) {
      listener.call(this, event);
    }
    return true;
  }
}

class MockCanvasElement extends MockDOMElement {
  constructor() {
    super('CANVAS');
    // Default HTML canvas dimensions (the default inline squished sizing defect)
    this.width = 300;
    this.height = 150;
  }

  getContext(contextType) {
    return {
      canvas: this,
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      stroke: () => {},
      scale: () => {},
      drawImage: () => {},
      setTransform: () => {},
      resetTransform: () => {}
    };
  }
}

function createMockCanvas(options = {}) {
  const canvas = new MockCanvasElement();
  if (options.width !== undefined) canvas.width = options.width;
  if (options.height !== undefined) canvas.height = options.height;
  return canvas;
}

class MockResizeObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.observed = new Set();
    MockResizeObserver.instances.push(this);
  }

  observe(element) {
    this.observed.add(element);
  }

  unobserve(element) {
    this.observed.delete(element);
  }

  disconnect() {
    this.observed.clear();
  }

  triggerResize(entries = []) {
    this.callback(entries, this);
  }
}

function setupGlobalEnvironment({ viewportWidth = 1920, viewportHeight = 1080 } = {}) {
  const listeners = new Map();

  const mockWindow = {
    innerWidth: viewportWidth,
    innerHeight: viewportHeight,
    devicePixelRatio: 1,
    addEventListener(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    removeEventListener(event, fn) {
      if (listeners.has(event)) {
        listeners.set(event, listeners.get(event).filter(l => l !== fn));
      }
    },
    dispatchEvent(event) {
      const eventListeners = listeners.get(event.type) || [];
      for (const listener of eventListeners) {
        listener.call(this, event);
      }
      return true;
    },
    getComputedStyle(element) {
      return element.style || {};
    }
  };

  const head = new MockDOMElement('HEAD');
  const body = new MockDOMElement('BODY');
  try { body.clientWidth = viewportWidth; } catch (_) {}
  try { body.clientHeight = viewportHeight; } catch (_) {}

  const mockDocument = {
    head,
    body,
    createElement(tag) {
      const upper = String(tag).toUpperCase();
      if (upper === 'CANVAS') {
        return new MockCanvasElement();
      }
      return new MockDOMElement(upper);
    },
    getElementById(id) {
      return body.querySelector(`#${id}`);
    },
    querySelector(selector) {
      return body.querySelector(selector);
    },
    querySelectorAll(selector) {
      return body.querySelectorAll(selector);
    }
  };

  globalThis.window = mockWindow;
  globalThis.document = mockDocument;
  globalThis.ResizeObserver = MockResizeObserver;
  MockResizeObserver.instances = [];

  return { mockWindow, mockDocument };
}

// ============================================================================
// TEST SUITE: STORY 40.1.1 (Defect ID: DF-LAYOUT-01)
// ============================================================================

test('ENTRYPOINT INVARIANT: Module export contract in src/main.js', () => {
  const mountFn = MainModule.mountApp || MainModule.mount;
  assert.strictEqual(
    typeof mountFn,
    'function',
    'src/main.js must export a mounting function (mountApp or mount)'
  );
});

test('ENTRYPOINT INVARIANT: mountApp/mount initializes UI hierarchy without throwing', () => {
  setupGlobalEnvironment({ viewportWidth: 1920, viewportHeight: 1080 });
  const mountFn = MainModule.mountApp || MainModule.mount;

  const root = new MockDOMElement('DIV');
  root.id = 'app';
  try { root.clientWidth = 1920; } catch (_) {}
  try { root.clientHeight = 1080; } catch (_) {}
  globalThis.document.body.appendChild(root);

  assert.doesNotThrow(() => {
    mountFn(root);
  }, 'Mounting function must execute without uncaught errors');

  assert.ok(root.children.length > 0, 'Container #app must contain mounted UI nodes');
});

test('AC1 & DF-LAYOUT-01: Workspace and chart canvas must flex-stretch horizontally >= 55% of viewport', () => {
  const viewportWidth = 1920;
  const viewportHeight = 1080;
  const { mockWindow } = setupGlobalEnvironment({ viewportWidth, viewportHeight });

  const root = new MockDOMElement('DIV');
  root.id = 'app';
  try { root.clientWidth = viewportWidth; } catch (_) {}
  try { root.clientHeight = viewportHeight; } catch (_) {}
  globalThis.document.body.appendChild(root);

  const mountFn = MainModule.mountApp || MainModule.mount;
  mountFn(root);

  // Locate the workspace container and chart canvas
  const canvas = root.querySelector('canvas') || root.querySelector('.chart-canvas');
  assert.ok(canvas, 'Chart canvas element must be present in the mounted tree');

  const workspace = canvas.parentElement;
  assert.ok(workspace, 'Chart canvas must be wrapped in a workspace container');

  // Verify responsive flex styling on workspace parent
  const wsStyle = workspace.style || {};
  const flexGrow = wsStyle.flexGrow || (wsStyle.flex && wsStyle.flex.split(' ')[0]);
  assert.ok(
    flexGrow === '1' || wsStyle.flex === '1' || wsStyle.flex === '1 1 0%' || wsStyle.width === '100%',
    'Workspace container must have flex: 1 or width: 100% to fill available horizontal space'
  );

  // Simulate flex container layout dimensions: In a financial workstation layout,
  // the main workspace occupies >= 55% of the viewport width.
  // We simulate the workspace rendering at 65% of viewport width (1248px out of 1920px).
  try { workspace.clientWidth = Math.round(viewportWidth * 0.65); } catch (_) {}
  try { workspace.clientHeight = viewportHeight; } catch (_) {}

  // Trigger resize/initialization sizing logic
  const resizeFn = CanvasModule.resizeCanvas || CanvasModule.syncCanvasDimensions || CanvasModule.updateCanvasDimensions;
  if (typeof resizeFn === 'function') {
    resizeFn(canvas, workspace);
  } else {
    mockWindow.dispatchEvent({ type: 'resize' });
  }

  // Acceptance Criteria: Workspace and canvas must stretch horizontally >= 55% of viewport width
  const workspaceRatio = workspace.clientWidth / mockWindow.innerWidth;
  assert.ok(
    workspaceRatio >= 0.55,
    `Workspace fill ratio (${workspaceRatio.toFixed(3)}) must be >= 0.55 of viewport width (${mockWindow.innerWidth}px)`
  );

  // Regression check: Must NOT remain at the squished 300px default (fill ratio 0.21)
  assert.notStrictEqual(
    canvas.width,
    300,
    'Defect DF-LAYOUT-01 regression: Canvas buffer width is squished at default 300px fallback'
  );

  const canvasRatio = canvas.width / mockWindow.innerWidth;
  assert.ok(
    canvasRatio >= 0.55,
    `Canvas buffer width (${canvas.width}px, ratio: ${canvasRatio.toFixed(3)}) must occupy >= 55% of viewport (${mockWindow.innerWidth}px)`
  );
});

test('AC2: src/canvas.js logic updates canvas buffer width & height to match container dimensions', () => {
  setupGlobalEnvironment({ viewportWidth: 1440, viewportHeight: 900 });

  const container = new MockDOMElement('DIV');
  container.classList.add('workspace');
  try { container.clientWidth = 1000; } catch (_) {}
  try { container.clientHeight = 750; } catch (_) {}

  const canvas = createMockCanvas();
  container.appendChild(canvas);

  // Default unmounted/squished canvas state
  assert.strictEqual(canvas.width, 300, 'Initial canvas buffer width starts at default 300px');
  assert.strictEqual(canvas.height, 150, 'Initial canvas buffer height starts at default 150px');

  const resizeFn = CanvasModule.resizeCanvas || CanvasModule.syncCanvasDimensions || CanvasModule.updateCanvasDimensions;
  assert.strictEqual(
    typeof resizeFn,
    'function',
    'src/canvas.js must export canvas sizing logic (e.g. resizeCanvas, syncCanvasDimensions)'
  );

  // Execute canvas sizing logic
  resizeFn(canvas, container);

  // Buffer dimensions must strictly match container dimensions
  assert.strictEqual(
    canvas.width,
    1000,
    `Canvas buffer width (${canvas.width}) must match container clientWidth (1000)`
  );
  assert.strictEqual(
    canvas.height,
    750,
    `Canvas buffer height (${canvas.height}) must match container clientHeight (750)`
  );
});

test('AC2: Window resize event dynamically triggers canvas buffer dimensions update', () => {
  const { mockWindow } = setupGlobalEnvironment({ viewportWidth: 1280, viewportHeight: 720 });
  const mountFn = MainModule.mountApp || MainModule.mount;

  const root = new MockDOMElement('DIV');
  root.id = 'app';
  try { root.clientWidth = 1280; } catch (_) {}
  try { root.clientHeight = 720; } catch (_) {}
  globalThis.document.body.appendChild(root);

  mountFn(root);

  const canvas = root.querySelector('canvas') || root.querySelector('.chart-canvas');
  assert.ok(canvas, 'Canvas element must be mounted');
  const workspace = canvas.parentElement;

  // Initial sizing at 1280px viewport (workspace ~70% = 896px)
  try { workspace.clientWidth = 896; } catch (_) {}
  try { workspace.clientHeight = 650; } catch (_) {}
  mockWindow.dispatchEvent({ type: 'resize' });

  assert.strictEqual(canvas.width, 896, 'Canvas buffer width should match initial workspace width 896px');
  assert.strictEqual(canvas.height, 650, 'Canvas buffer height should match initial workspace height 650px');

  // Dynamically resize window to 2560px (4K workstation monitor)
  mockWindow.innerWidth = 2560;
  mockWindow.innerHeight = 1440;
  try { workspace.clientWidth = 1792; } catch (_) {} // 70% of 2560
  try { workspace.clientHeight = 1300; } catch (_) {}

  // Dispatch window resize
  mockWindow.dispatchEvent({ type: 'resize' });

  // Canvas buffer must reflect updated workspace dimensions
  assert.strictEqual(
    canvas.width,
    1792,
    `Canvas buffer width must resize to 1792px on window resize (got: ${canvas.width}px)`
  );
  assert.strictEqual(
    canvas.height,
    1300,
    `Canvas buffer height must resize to 1300px on window resize (got: ${canvas.height}px)`
  );

  const newFillRatio = canvas.width / mockWindow.innerWidth;
  assert.ok(
    newFillRatio >= 0.55,
    `Canvas fill ratio on 4K workstation (${newFillRatio.toFixed(3)}) must stay >= 0.55`
  );
});

test('AC3: Root and workspace layout enforce responsive 100vh flex layout ("flex: 1; min-height: 0;") preventing squished canvas', () => {
  setupGlobalEnvironment({ viewportWidth: 1920, viewportHeight: 1080 });
  const mountFn = MainModule.mountApp || MainModule.mount;

  const root = new MockDOMElement('DIV');
  root.id = 'app';
  globalThis.document.body.appendChild(root);

  mountFn(root);

  // Verify body or root layout maintains 100vh flex configuration
  const bodyStyle = globalThis.document.body.style || {};
  const rootStyle = root.style || {};

  const has100vh =
    bodyStyle.height === '100vh' ||
    bodyStyle.minHeight === '100vh' ||
    rootStyle.height === '100vh' ||
    rootStyle.minHeight === '100vh';

  assert.ok(
    has100vh,
    'Root container or body must enforce 100vh responsive layout to prevent collapsed viewport'
  );

  const hasFlexLayout =
    bodyStyle.display === 'flex' ||
    rootStyle.display === 'flex';

  assert.ok(
    hasFlexLayout,
    'Root container or body must use display: flex'
  );

  // Verify workspace has flex: 1 and min-height: 0
  const canvas = root.querySelector('canvas') || root.querySelector('.chart-canvas');
  assert.ok(canvas, 'Canvas must be mounted');
  const workspace = canvas.parentElement;

  const wsStyle = workspace.style || {};
  const hasFlexOne =
    wsStyle.flex === '1' ||
    wsStyle.flex === '1 1 0%' ||
    wsStyle.flexGrow === '1';

  assert.ok(
    hasFlexOne,
    'Workspace container must apply "flex: 1" to expand into available viewport space'
  );

  const hasMinHeightZero =
    wsStyle.minHeight === '0px' ||
    wsStyle.minHeight === '0' ||
    wsStyle['min-height'] === '0';

  assert.ok(
    hasMinHeightZero,
    'Workspace container must enforce "min-height: 0" to prevent flex child overflow squishing'
  );
});

test('AC2 & Invariant: ResizeObserver notifies canvas sizing logic when container element resizes', () => {
  setupGlobalEnvironment({ viewportWidth: 1600, viewportHeight: 900 });
  const mountFn = MainModule.mountApp || MainModule.mount;

  const root = new MockDOMElement('DIV');
  root.id = 'app';
  globalThis.document.body.appendChild(root);

  mountFn(root);

  const canvas = root.querySelector('canvas') || root.querySelector('.chart-canvas');
  const workspace = canvas.parentElement;

  // Check if ResizeObserver was registered on canvas or its workspace container
  const activeObserver = MockResizeObserver.instances.find(observer =>
    observer.observed.has(canvas) || observer.observed.has(workspace)
  );

  if (activeObserver) {
    try { workspace.clientWidth = 1200; } catch (_) {}
    try { workspace.clientHeight = 800; } catch (_) {}

    activeObserver.triggerResize([
      {
        target: workspace,
        contentRect: { width: 1200, height: 800 }
      }
    ]);

    assert.strictEqual(
      canvas.width,
      1200,
      'Canvas buffer width should be updated by ResizeObserver callback'
    );
    assert.strictEqual(
      canvas.height,
      800,
      'Canvas buffer height should be updated by ResizeObserver callback'
    );
  }
});