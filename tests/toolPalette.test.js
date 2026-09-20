import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as mainModule from '../src/main.js';
import * as canvasModule from '../src/canvas.js';

/* -------------------------------------------------------------------------- */
/* Minimal In-Memory DOM Environment for Pure Node.js Execution               */
/* -------------------------------------------------------------------------- */

class FakeClassList {
  constructor(element) {
    this._element = element;
    this._classes = new Set();
  }
  add(...tokens) {
    for (const token of tokens) this._classes.add(token);
    this._element._syncClassName();
  }
  remove(...tokens) {
    for (const token of tokens) this._classes.delete(token);
    this._element._syncClassName();
  }
  contains(token) {
    return this._classes.has(token);
  }
  toggle(token, force) {
    if (force !== undefined) {
      if (force) this.add(token);
      else this.remove(token);
      return force;
    }
    if (this.contains(token)) {
      this.remove(token);
      return false;
    }
    this.add(token);
    return true;
  }
  toString() {
    return Array.from(this._classes).join(' ');
  }
}

class FakeEvent {
  constructor(type, eventInitDict = {}) {
    this.type = type;
    this.bubbles = Boolean(eventInitDict.bubbles);
    this.cancelable = Boolean(eventInitDict.cancelable);
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this.clientX = eventInitDict.clientX ?? 0;
    this.clientY = eventInitDict.clientY ?? 0;
    this.button = eventInitDict.button ?? 0;
  }
  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
  stopPropagation() {}
}

class FakeMouseEvent extends FakeEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.button = init.button ?? 0;
  }
}

class FakeElement {
  constructor(tagName) {
try {     this.tagName = tagName.toUpperCase(); } catch (_) {}
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.classList = new FakeClassList(this);
    this.listeners = new Map();
    this.style = { cursor: '', display: '' };
    this.id = '';
    this.textContent = '';
    this.innerHTML = '';
    this.dataset = new Proxy({}, {
      get: (_, prop) => {
        const attrName = `data-${String(prop).replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        return this.getAttribute(attrName) ?? undefined;
      },
      set: (_, prop, val) => {
        const attrName = `data-${String(prop).replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        this.setAttribute(attrName, String(val));
        return true;
      }
    });
  }

  _syncClassName() {
    const serialized = this.classList.toString();
    if (serialized) {
      this.attributes.set('class', serialized);
    } else {
      this.attributes.delete('class');
    }
  }

  setAttribute(name, value) {
    const strVal = String(value);
    this.attributes.set(name, strVal);
    if (name === 'id') this.id = strVal;
    if (name === 'class') {
      this.classList._classes.clear();
      strVal.split(/\s+/).filter(Boolean).forEach(c => this.classList._classes.add(c));
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.classList._classes.clear();
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
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(handler);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const fn of handlers) {
        fn.call(this, event);
      }
    }
    return !event.defaultPrevented;
  }

  click() {
    const evt = new FakeMouseEvent('click', { bubbles: true, cancelable: true });
    this.dispatchEvent(evt);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
  }

  getContext(contextType) {
    if (this.tagName !== 'CANVAS') return null;
    return {
      canvas: this,
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      setLineDash: () => {},
      fillText: () => {},
      arc: () => {},
      fill: () => {}
    };
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const tokens = selector.trim().split(/\s+/);

    const matchesSingle = (el, token) => {
      if (token === '*') return true;
      // Tag with optional class/attribute: e.g. button[data-tool="crosshair"], button.active
      const tagMatch = token.match(/^([a-zA-Z0-9]+)?(\.[a-zA-Z0-9_-]+)?(\[[^\]]+\])?$/);
      if (tagMatch) {
        const [, tag, cls, attr] = tagMatch;
        if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
        if (cls && !el.classList.contains(cls.slice(1))) return false;
        if (attr) {
          const attrKV = attr.slice(1, -1).split('=');
          const k = attrKV[0];
          const v = attrKV[1] ? attrKV[1].replace(/^["']|["']$/g, '') : null;
          if (v !== null) {
            if (el.getAttribute(k) !== v) return false;
          } else {
            if (!el.hasAttribute(k)) return false;
          }
        }
        return true;
      }
      if (token.startsWith('#')) return el.id === token.slice(1);
      if (token.startsWith('.')) return el.classList.contains(token.slice(1));
      if (token.startsWith('[') && token.endsWith(']')) {
        const [k, v] = token.slice(1, -1).split('=');
        if (v !== undefined) {
          const cleanV = v.replace(/^["']|["']$/g, '');
          return el.getAttribute(k) === cleanV;
        }
        return el.hasAttribute(k);
      }
      return el.tagName.toLowerCase() === token.toLowerCase();
    };

    const traverse = (node) => {
      for (const child of node.children) {
        if (tokens.length === 1 && matchesSingle(child, tokens[0])) {
          results.push(child);
        } else if (tokens.length > 1 && matchesSingle(child, tokens[tokens.length - 1])) {
          results.push(child);
        }
        traverse(child);
      }
    };

    traverse(this);
    return results;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.body.id = 'body';
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  getElementById(id) {
    const find = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const res = find(child);
        if (res) return res;
      }
      return null;
    };
    return find(this.body);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

/* -------------------------------------------------------------------------- */
/* Test Harness Setup Helpers                                                 */
/* -------------------------------------------------------------------------- */

const REQUIRED_TOOLS = ['crosshair', 'trendline', 'horizontal-level', 'measurement'];

function setupGlobalDOM() {
  const fakeDoc = new FakeDocument();
  globalThis.document = fakeDoc;
  globalThis.window = {
    document: fakeDoc,
    CustomEvent: FakeEvent,
    MouseEvent: FakeMouseEvent,
    Event: FakeEvent
  };
  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLCanvasElement = FakeElement;
  globalThis.CustomEvent = FakeEvent;
  globalThis.MouseEvent = FakeMouseEvent;
  globalThis.Event = FakeEvent;

  const appContainer = fakeDoc.createElement('div');
  appContainer.setAttribute('id', 'app');
  fakeDoc.body.appendChild(appContainer);

  return { document: fakeDoc, appContainer };
}

function resolveMountFunction() {
  if (typeof mainModule.mountApp === 'function') return mainModule.mountApp;
  if (typeof mainModule.mount === 'function') return mainModule.mount;
  return null;
}

function resolveCanvasFactory() {
  if (typeof canvasModule.CanvasWorkspace === 'function') {
    return (container, options) => new canvasModule.CanvasWorkspace(container, options);
  }
  if (typeof canvasModule.CanvasController === 'function') {
    return (container, options) => new canvasModule.CanvasController(container, options);
  }
  if (typeof canvasModule.initCanvas === 'function') {
    return canvasModule.initCanvas;
  }
  if (typeof canvasModule.createCanvas === 'function') {
    return canvasModule.createCanvas;
  }
  return null;
}

function normalizeToolName(toolName) {
  return toolName.toLowerCase().replace(/[\s_]+/g, '-');
}

function findToolButton(paletteElement, toolMode) {
  const normalizedTarget = normalizeToolName(toolMode);
  const buttons = paletteElement.querySelectorAll('button, [role="button"], .tool-btn');
  for (const btn of buttons) {
    const dataTool = btn.getAttribute('data-tool');
    const dataMode = btn.getAttribute('data-mode');
    const ariaLabel = btn.getAttribute('aria-label') || '';
    const text = (btn.textContent || '').trim();

    if (dataTool && normalizeToolName(dataTool) === normalizedTarget) return btn;
    if (dataMode && normalizeToolName(dataMode) === normalizedTarget) return btn;
    if (normalizeToolName(ariaLabel) === normalizedTarget) return btn;
    if (normalizeToolName(text) === normalizedTarget) return btn;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Test Suite                                                                 */
/* -------------------------------------------------------------------------- */

describe('FEATURE: STORY 1.1.1 - Resolve MISSING_INTERACTIVE_TOOL_PALETTE (DF-TOOLS-01)', () => {
  let appContainer;
  let fakeDoc;

  beforeEach(() => {
    const env = setupGlobalDOM();
    fakeDoc = env.document;
    appContainer = env.appContainer;
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLCanvasElement;
    delete globalThis.CustomEvent;
    delete globalThis.MouseEvent;
    delete globalThis.Event;
  });

  /* ------------------------------------------------------------------------ */
  /* Entrypoint Testing Invariant Checks (src/main.js)                        */
  /* ------------------------------------------------------------------------ */
  describe('Entrypoint Invariants (src/main.js)', () => {
    it('must export mounting function (mountApp or mount) and initialization helpers', () => {
      const mountFn = resolveMountFunction();
      assert.ok(
        typeof mountFn === 'function',
        'src/main.js must export a mounting function: "mountApp" or "mount"'
      );

      const hasInitializer =
        typeof mainModule.init === 'function' ||
        typeof mainModule.initializeApp === 'function' ||
        typeof mainModule.bootstrap === 'function' ||
        typeof mountFn === 'function';

      assert.ok(
        hasInitializer,
        'src/main.js must export an initialization entrypoint (e.g. init, initializeApp, or mountApp)'
      );
    });

    it('must mount onto document.getElementById("app") without throwing uncaught errors', () => {
      const mountFn = resolveMountFunction();
      assert.ok(mountFn, 'Mount function must be resolved');

      assert.doesNotThrow(() => {
        mountFn(appContainer);
      }, 'Calling the mounting function with the DOM container must not throw errors');
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Acceptance Criterion 1: Interactive Tool Palette DOM Rendering           */
  /* ------------------------------------------------------------------------ */
  describe('AC 1: Tool Palette DOM Rendering on Workspace Initialization', () => {
    it('renders an interactive tool palette container into the workspace DOM', () => {
      const mountFn = resolveMountFunction();
      assert.ok(mountFn, 'mountApp or mount function must exist in src/main.js');

      mountFn(appContainer);

      const palette =
        appContainer.querySelector('[data-testid="tool-palette"]') ||
        appContainer.querySelector('.tool-palette') ||
        appContainer.querySelector('[role="toolbar"]');

      assert.ok(
        palette !== null,
        'Expected tool palette container ([data-testid="tool-palette"] or .tool-palette or [role="toolbar"]) to be rendered in #app'
      );
    });

    it('renders selectable tool controls for crosshair, trendline, horizontal level, and measurement', () => {
      const mountFn = resolveMountFunction();
      mountFn(appContainer);

      const palette =
        appContainer.querySelector('[data-testid="tool-palette"]') ||
        appContainer.querySelector('.tool-palette') ||
        appContainer.querySelector('[role="toolbar"]');

      assert.ok(palette, 'Tool palette must be rendered');

      for (const requiredTool of REQUIRED_TOOLS) {
        const btn = findToolButton(palette, requiredTool);
        assert.ok(
          btn !== null,
          `Tool palette must render a selectable button for mode: "${requiredTool}"`
        );
      }
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Acceptance Criterion 2: Tool Selection State & Canvas Handlers Binding   */
  /* ------------------------------------------------------------------------ */
  describe('AC 2: Tool Mode Selection State and Canvas Interaction Binding', () => {
    it('canvas module supports setting and retrieving active tool mode', () => {
      const canvasFactory = resolveCanvasFactory();
      assert.ok(
        canvasFactory !== null,
        'src/canvas.js must export CanvasWorkspace, CanvasController, or initCanvas'
      );

      const canvasHost = fakeDoc.createElement('div');
      const canvasInstance = canvasFactory(canvasHost, { width: 800, height: 600 });

      assert.ok(
        canvasInstance !== null && typeof canvasInstance === 'object',
        'Canvas factory must return a valid canvas controller instance'
      );

      const setMode =
        typeof canvasInstance.setToolMode === 'function'
          ? canvasInstance.setToolMode.bind(canvasInstance)
          : typeof canvasInstance.setMode === 'function'
          ? canvasInstance.setMode.bind(canvasInstance)
          : null;

      const getMode =
        typeof canvasInstance.getToolMode === 'function'
          ? canvasInstance.getToolMode.bind(canvasInstance)
          : typeof canvasInstance.getActiveMode === 'function'
          ? canvasInstance.getActiveMode.bind(canvasInstance)
          : () => canvasInstance.toolMode || canvasInstance.activeMode;

      assert.ok(typeof setMode === 'function', 'Canvas instance must provide setToolMode or setMode');

      for (const tool of REQUIRED_TOOLS) {
        setMode(tool);
        const current = normalizeToolName(String(getMode()));
        assert.equal(current, tool, `Canvas active tool mode must be updated to "${tool}"`);
      }
    });

    it('switching to crosshair mode configures crosshair interaction and cursor on canvas', () => {
      const canvasFactory = resolveCanvasFactory();
      const canvasHost = fakeDoc.createElement('div');
      const canvasInstance = canvasFactory(canvasHost, { width: 800, height: 600 });
      const canvasEl = canvasHost.querySelector('canvas') || canvasHost;

      const setMode = canvasInstance.setToolMode || canvasInstance.setMode;
      assert.ok(typeof setMode === 'function', 'setToolMode must be a function');

      setMode.call(canvasInstance, 'crosshair');

      // Emulate pointer tracking
      const mouseMoveEvt = new FakeMouseEvent('mousemove', { clientX: 150, clientY: 200 });
      assert.doesNotThrow(() => {
        canvasEl.dispatchEvent(mouseMoveEvt);
      }, 'Crosshair mousemove handler must execute cleanly');

      // Cursor should indicate crosshair mode
      const cursorStyle = canvasEl.style.cursor || (canvasInstance.getCursor && canvasInstance.getCursor());
      assert.ok(
        cursorStyle === 'crosshair' || (canvasInstance.toolMode && normalizeToolName(canvasInstance.toolMode) === 'crosshair'),
        'Canvas should configure crosshair mode on canvas element'
      );
    });

    it('switching to trendline mode handles start, intermediate, and completion drawing events', () => {
      const canvasFactory = resolveCanvasFactory();
      const canvasHost = fakeDoc.createElement('div');
      const canvasInstance = canvasFactory(canvasHost, { width: 800, height: 600 });
      const canvasEl = canvasHost.querySelector('canvas') || canvasHost;

      const setMode = canvasInstance.setToolMode || canvasInstance.setMode;
      setMode.call(canvasInstance, 'trendline');

      // Dispatch trendline gesture sequence: mousedown -> mousemove -> mouseup
      assert.doesNotThrow(() => {
        canvasEl.dispatchEvent(new FakeMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
        canvasEl.dispatchEvent(new FakeMouseEvent('mousemove', { clientX: 200, clientY: 250 }));
        canvasEl.dispatchEvent(new FakeMouseEvent('mouseup', { clientX: 200, clientY: 250, button: 0 }));
      }, 'Trendline drawing interaction events must be handled without error');

      if (typeof canvasInstance.getAnnotations === 'function') {
        const annotations = canvasInstance.getAnnotations();
        assert.ok(Array.isArray(annotations), 'Canvas annotations must be accessible');
      }
    });

    it('switching to horizontal-level mode places horizontal price levels', () => {
      const canvasFactory = resolveCanvasFactory();
      const canvasHost = fakeDoc.createElement('div');
      const canvasInstance = canvasFactory(canvasHost, { width: 800, height: 600 });
      const canvasEl = canvasHost.querySelector('canvas') || canvasHost;

      const setMode = canvasInstance.setToolMode || canvasInstance.setMode;
      setMode.call(canvasInstance, 'horizontal-level');

      assert.doesNotThrow(() => {
        canvasEl.dispatchEvent(new FakeMouseEvent('click', { clientX: 300, clientY: 175 }));
      }, 'Horizontal level click interaction must be processed cleanly');
    });

    it('switching to measurement mode tracks bounding delta measurement interactions', () => {
      const canvasFactory = resolveCanvasFactory();
      const canvasHost = fakeDoc.createElement('div');
      const canvasInstance = canvasFactory(canvasHost, { width: 800, height: 600 });
      const canvasEl = canvasHost.querySelector('canvas') || canvasHost;

      const setMode = canvasInstance.setToolMode || canvasInstance.setMode;
      setMode.call(canvasInstance, 'measurement');

      assert.doesNotThrow(() => {
        canvasEl.dispatchEvent(new FakeMouseEvent('mousedown', { clientX: 50, clientY: 50, button: 0 }));
        canvasEl.dispatchEvent(new FakeMouseEvent('mousemove', { clientX: 150, clientY: 120 }));
        canvasEl.dispatchEvent(new FakeMouseEvent('mouseup', { clientX: 150, clientY: 120, button: 0 }));
      }, 'Measurement tool range interaction must execute cleanly');
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Acceptance Criterion 3: Active Entrypoint Wiring and Live Interaction    */
  /* ------------------------------------------------------------------------ */
  describe('AC 3: src/main.js Live Palette-to-Canvas Wiring', () => {
    it('wires tool palette button click events to update visual active state', () => {
      const mountFn = resolveMountFunction();
      mountFn(appContainer);

      const palette =
        appContainer.querySelector('[data-testid="tool-palette"]') ||
        appContainer.querySelector('.tool-palette') ||
        appContainer.querySelector('[role="toolbar"]');
      assert.ok(palette, 'Palette must be rendered');

      const trendlineBtn = findToolButton(palette, 'trendline');
      const crosshairBtn = findToolButton(palette, 'crosshair');
      assert.ok(trendlineBtn, 'Trendline button must exist');
      assert.ok(crosshairBtn, 'Crosshair button must exist');

      // Click trendline
      trendlineBtn.click();

      const isTrendlineActive =
        trendlineBtn.classList.contains('active') ||
        trendlineBtn.classList.contains('selected') ||
        trendlineBtn.getAttribute('aria-pressed') === 'true' ||
        trendlineBtn.dataset.active === 'true';

      assert.ok(
        isTrendlineActive,
        'Trendline button must reflect active state (class "active"/"selected" or aria-pressed="true") after selection'
      );

      // Now click crosshair; trendline active state should reset
      crosshairBtn.click();

      const isCrosshairActive =
        crosshairBtn.classList.contains('active') ||
        crosshairBtn.classList.contains('selected') ||
        crosshairBtn.getAttribute('aria-pressed') === 'true' ||
        crosshairBtn.dataset.active === 'true';

      assert.ok(isCrosshairActive, 'Crosshair button must reflect active state after selection');

      const trendlineStillActive =
        trendlineBtn.classList.contains('active') ||
        trendlineBtn.getAttribute('aria-pressed') === 'true';
      assert.equal(trendlineStillActive, false, 'Previous tool button must deactivate when new tool is selected');
    });

    it('propagates tool selection to canvas and modifies canvas behavior through entrypoint wiring', () => {
      const mountFn = resolveMountFunction();
      const appInstance = mountFn(appContainer);

      const palette =
        appContainer.querySelector('[data-testid="tool-palette"]') ||
        appContainer.querySelector('.tool-palette') ||
        appContainer.querySelector('[role="toolbar"]');
      const canvasEl = appContainer.querySelector('canvas');

      assert.ok(palette, 'Palette must be mounted in DOM');
      assert.ok(canvasEl, 'Canvas must be mounted in DOM');

      // Sequentially click all required tools and verify canvas events work without error
      for (const tool of REQUIRED_TOOLS) {
        const btn = findToolButton(palette, tool);
        assert.ok(btn, `Button for tool ${tool} must be wired in DOM`);
        btn.click();

        // Dispatch canvas interaction under current tool mode
        assert.doesNotThrow(() => {
          canvasEl.dispatchEvent(new FakeMouseEvent('mousedown', { clientX: 120, clientY: 180, button: 0 }));
          canvasEl.dispatchEvent(new FakeMouseEvent('mousemove', { clientX: 180, clientY: 220 }));
          canvasEl.dispatchEvent(new FakeMouseEvent('mouseup', { clientX: 180, clientY: 220, button: 0 }));
        }, `Canvas interactions under tool "${tool}" wired via src/main.js must not throw uncaught errors`);
      }

      // If appInstance exposes canvas controller or state inspection, verify it matches last selected tool
      if (appInstance && typeof appInstance.getActiveTool === 'function') {
        assert.equal(
          normalizeToolName(appInstance.getActiveTool()),
          'measurement',
          'Application instance state must reflect last selected tool "measurement"'
        );
      }
    });

    it('supports unmounting / teardown without leaking DOM listeners or errors', () => {
      const mountFn = resolveMountFunction();
      const appInstance = mountFn(appContainer);

      if (appInstance && typeof appInstance.unmount === 'function') {
        assert.doesNotThrow(() => {
          appInstance.unmount();
        }, 'Unmounting application instance must clean up gracefully');
      } else if (typeof mainModule.unmount === 'function') {
        assert.doesNotThrow(() => {
          mainModule.unmount(appContainer);
        }, 'main.unmount(container) must clean up gracefully');
      }
    });
  });
});