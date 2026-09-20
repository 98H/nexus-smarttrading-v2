import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve module paths relative to current test file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_MAIN_PATH = path.resolve(__dirname, '../src/main.js');
const SRC_STYLE_PATH = path.resolve(__dirname, '../src/style.css');

/**
 * Lightweight, deterministic DOM Mock to simulate browser environment in Node.js
 */
class MockDOMTokenList {
  constructor(element) {
    this._element = element;
    this._tokens = new Set();
  }
  add(...tokens) {
    tokens.forEach((t) => this._tokens.add(t));
    this._sync();
  }
  remove(...tokens) {
    tokens.forEach((t) => this._tokens.delete(t));
    this._sync();
  }
  contains(token) {
    return this._tokens.has(token);
  }
  _sync() {
    this._element.className = Array.from(this._tokens).join(' ');
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this._className = '';
    this.classList = new MockDOMTokenList(this);
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.textContent = '';
    this.style = {};
    this._listeners = new Map();
  }

  get className() {
    return this._className;
  }

  set className(val) {
    this._className = val || '';
    this.classList._tokens = new Set(this._className.split(/\s+/).filter(Boolean));
  }

  setAttribute(name, value) {
    const val = String(value);
    this.attributes.set(name, val);
    if (name === 'id') this.id = val;
    if (name === 'class') this.className = val;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = val;
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
      return child;
    }
    throw new Error('Node was not found');
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const match = (elem) => {
      let isMatch = false;

      // Tag match
      if (/^[a-zA-Z0-9-]+$/.test(selector) && elem.tagName.toLowerCase() === selector.toLowerCase()) {
        isMatch = true;
      }
      // ID match
      if (selector.startsWith('#') && elem.id === selector.slice(1)) {
        isMatch = true;
      }
      // Class match
      if (selector.startsWith('.') && elem.classList.contains(selector.slice(1))) {
        isMatch = true;
      }
      // Attribute exact match: [attr="value"] or [attr]
      const attrMatch = selector.match(/^\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]$/);
      if (attrMatch) {
        const [, attr, val] = attrMatch;
        if (val !== undefined) {
          if (elem.getAttribute(attr) === val) isMatch = true;
        } else if (elem.hasAttribute(attr)) {
          isMatch = true;
        }
      }

      if (isMatch) results.push(elem);
      for (const child of elem.children) {
        match(child);
      }
    };

    for (const child of this.children) {
      match(child);
    }
    return results;
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const list = this._listeners.get(type) || [];
    this._listeners.set(type, list.filter((cb) => cb !== listener));
  }

  dispatchEvent(event) {
    const list = this._listeners.get(event.type) || [];
    list.forEach((cb) => cb.call(this, event));
    return true;
  }

  getContext() {
    return {
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      stroke: () => {},
      scale: () => {},
      setTransform: () => {},
      measureText: () => ({ width: 0 })
    };
  }
}

class MockDocument extends MockElement {
  constructor() {
    super('#document');
    this.body = new MockElement('body');
    this.appendChild(this.body);
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }
}

class MockWindow {
  constructor(document) {
    this.document = document;
    this.innerWidth = 1280;
    this.innerHeight = 800;
    this._listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const list = this._listeners.get(type) || [];
    this._listeners.set(type, list.filter((cb) => cb !== listener));
  }

  dispatchEvent(event) {
    const list = this._listeners.get(event.type) || [];
    list.forEach((cb) => cb.call(this, event));
    return true;
  }
}

describe('STORY 1.2.1: Resolve UNSTRUCTURED_UI_LAYOUT (DF-LAYOUT-01)', () => {
  let originalDocument;
  let originalWindow;
  let appElement;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    const mockDoc = new MockDocument();
    const mockWin = new MockWindow(mockDoc);

    appElement = mockDoc.createElement('div');
    appElement.id = 'app';
    mockDoc.body.appendChild(appElement);

    globalThis.document = mockDoc;
    globalThis.window = mockWin;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  /**
   * Helper to execute mounting logic from src/main.js
   */
  async function loadAndMountMain() {
    // Dynamic import cache-busting to test fresh execution against the mock DOM
    const moduleUrl = `${SRC_MAIN_PATH}?t=${Date.now()}_${Math.random()}`;
    const mainModule = await import(moduleUrl);

    if (typeof mainModule.mount === 'function') {
      mainModule.mount(appElement);
    } else if (typeof mainModule.initApp === 'function') {
      mainModule.initApp(appElement);
    } else if (typeof mainModule.default === 'function') {
      mainModule.default(appElement);
    }

    return mainModule;
  }

  test('AC1: constructs a semantic top navigation header with title, ticker, and timeframe controls', async () => {
    await loadAndMountMain();

    const app = globalThis.document.getElementById('app');
    assert.ok(app, 'Root container #app must exist');

    // 1. Semantic top navigation header must exist as a child of #app
    const header = app.querySelector('header');
    assert.ok(header, 'Must construct a semantic <header> element in the layout');

    // Verify header is located at top-level under #app
    assert.strictEqual(
      header.parentElement,
      app,
      'The semantic <header> must be a direct child of #app'
    );

    // 2. Header must contain title / branding
    const titleElement =
      header.querySelector('[data-testid="app-title"]') ||
      header.querySelector('h1') ||
      header.querySelector('.title') ||
      header.querySelector('.app-title');
    assert.ok(titleElement, 'Top navigation header must contain an app title element');

    // 3. Header must contain ticker selector / display control
    const tickerControl =
      header.querySelector('[data-testid="ticker-select"]') ||
      header.querySelector('[data-testid="ticker-control"]') ||
      header.querySelector('.ticker-control') ||
      header.querySelector('select.ticker') ||
      header.querySelector('[name="ticker"]');
    assert.ok(tickerControl, 'Top navigation header must contain a ticker control element');

    // 4. Header must contain timeframe controls
    const timeframeControls =
      header.querySelector('[data-testid="timeframe-controls"]') ||
      header.querySelector('.timeframe-controls') ||
      header.querySelector('[data-testid="timeframe-picker"]');
    assert.ok(timeframeControls, 'Top navigation header must contain timeframe controls');
  });

  test('AC2: renders structured workspace container hosting chart canvas and side panels instead of flat siblings', async () => {
    await loadAndMountMain();

    const app = globalThis.document.getElementById('app');

    // Direct children of #app should NOT include flat chart canvas, orders panel, or tools panel
    const directCanvas = app.children.find((c) => c.tagName === 'CANVAS');
    assert.strictEqual(
      directCanvas,
      undefined,
      'Canvas must NOT be a flat direct child of #app; it must be nested inside the workspace container'
    );

    // 1. A structured workspace container must exist
    const workspace =
      app.querySelector('[data-testid="workspace"]') ||
      app.querySelector('main.workspace') ||
      app.querySelector('.workspace-container') ||
      app.querySelector('.workspace');

    assert.ok(workspace, 'Must render a structured workspace container element');
    assert.strictEqual(
      workspace.parentElement,
      app,
      'Workspace container must be directly nested under #app alongside header'
    );

    // 2. Chart canvas must be nested within the workspace container
    const chartCanvas =
      workspace.querySelector('canvas') ||
      workspace.querySelector('[data-testid="chart-canvas"]');
    assert.ok(
      chartCanvas,
      'Chart canvas must be hosted inside the workspace container'
    );

    // 3. Orders side panel must be hosted within the workspace container
    const ordersPanel =
      workspace.querySelector('[data-testid="orders-panel"]') ||
      workspace.querySelector('.orders-panel') ||
      workspace.querySelector('aside.orders') ||
      workspace.querySelector('.side-panel-orders');
    assert.ok(
      ordersPanel,
      'Auxiliary orders side panel must be hosted inside the workspace container'
    );

    // 4. Tools side panel must be hosted within the workspace container
    const toolsPanel =
      workspace.querySelector('[data-testid="tools-panel"]') ||
      workspace.querySelector('.tools-panel') ||
      workspace.querySelector('aside.tools') ||
      workspace.querySelector('.side-panel-tools');
    assert.ok(
      toolsPanel,
      'Auxiliary tools side panel must be hosted inside the workspace container'
    );

    // Sibling hierarchy check: orders, tools, and chart must be distinct nodes under the workspace
    assert.notStrictEqual(ordersPanel, toolsPanel, 'Orders and Tools panels must be separate structural panels');
    assert.notStrictEqual(chartCanvas, ordersPanel, 'Canvas must not be conflated with orders panel');
  });

  test('AC3: all layout panels and canvas containers remain nested within header and workspace hierarchies upon window resize', async () => {
    await loadAndMountMain();

    const app = globalThis.document.getElementById('app');
    const header = app.querySelector('header');
    const workspace =
      app.querySelector('[data-testid="workspace"]') ||
      app.querySelector('.workspace-container') ||
      app.querySelector('.workspace') ||
      app.querySelector('main');

    assert.ok(header, 'Pre-condition: Header must exist before resize');
    assert.ok(workspace, 'Pre-condition: Workspace container must exist before resize');

    const chartCanvas =
      workspace.querySelector('canvas') ||
      workspace.querySelector('[data-testid="chart-canvas"]');
    const ordersPanel =
      workspace.querySelector('[data-testid="orders-panel"]') ||
      workspace.querySelector('.orders-panel');
    const toolsPanel =
      workspace.querySelector('[data-testid="tools-panel"]') ||
      workspace.querySelector('.tools-panel');

    assert.ok(chartCanvas, 'Pre-condition: Canvas must exist');
    assert.ok(ordersPanel, 'Pre-condition: Orders panel must exist');
    assert.ok(toolsPanel, 'Pre-condition: Tools panel must exist');

    // Trigger dynamic window resizing
    globalThis.window.innerWidth = 1920;
    globalThis.window.innerHeight = 1080;
    globalThis.window.dispatchEvent({ type: 'resize' });

    // Validate that hierarchy was preserved and elements were not ejected/flattened
    assert.strictEqual(
      header.parentElement,
      app,
      'Header must remain anchored directly to #app after resize'
    );
    assert.strictEqual(
      workspace.parentElement,
      app,
      'Workspace container must remain anchored directly to #app after resize'
    );

    // Canvas must still belong to the workspace hierarchy
    let current = chartCanvas.parentElement;
    let foundWorkspaceForCanvas = false;
    while (current) {
      if (current === workspace) {
        foundWorkspaceForCanvas = true;
        break;
      }
      current = current.parentElement;
    }
    assert.ok(
      foundWorkspaceForCanvas,
      'Chart canvas must remain nested within the workspace container after window resize'
    );

    // Orders panel must still belong to workspace
    current = ordersPanel.parentElement;
    let foundWorkspaceForOrders = false;
    while (current) {
      if (current === workspace) {
        foundWorkspaceForOrders = true;
        break;
      }
      current = current.parentElement;
    }
    assert.ok(
      foundWorkspaceForOrders,
      'Orders panel must remain nested within the workspace container after window resize'
    );

    // Tools panel must still belong to workspace
    current = toolsPanel.parentElement;
    let foundWorkspaceForTools = false;
    while (current) {
      if (current === workspace) {
        foundWorkspaceForTools = true;
        break;
      }
      current = current.parentElement;
    }
    assert.ok(
      foundWorkspaceForTools,
      'Tools panel must remain nested within the workspace container after window resize'
    );

    // Ensure #app direct children count is constrained to layout parents (e.g., header, workspace, footer)
    const directChildrenTags = app.children.map((c) => c.tagName);
    assert.ok(
      !directChildrenTags.includes('CANVAS'),
      'Direct children of #app must not include raw CANVAS after resize'
    );
  });

  test('AC4: style.css defines structural layout rules for top header, flex/grid workspace, and side panels', () => {
    assert.ok(
      fs.existsSync(SRC_STYLE_PATH),
      `Style file src/style.css must exist at: ${SRC_STYLE_PATH}`
    );

    const cssContent = fs.readFileSync(SRC_STYLE_PATH, 'utf-8');

    // Remove comments for cleaner regex parsing
    const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

    // 1. Check workspace uses CSS layout display (flex or grid)
    const hasWorkspaceDisplay =
      /(?:\.workspace|\.workspace-container|main)\s*\{[^}]*display\s*:\s*(?:flex|grid)/i.test(
        cleanCss
      );
    assert.ok(
      hasWorkspaceDisplay,
      'src/style.css must declare display: flex or display: grid for the workspace container'
    );

    // 2. Check header styling rules exist
    const hasHeaderRules = /(?:header|\.header|\.top-nav)\s*\{[^}]*\}/i.test(cleanCss);
    assert.ok(
      hasHeaderRules,
      'src/style.css must declare layout rules for the top navigation header'
    );

    // 3. Check side panel structural styles exist (orders and tools panels)
    const hasSidePanelRules =
      /(?:\.side-panel|\.orders-panel|\.tools-panel|aside)\s*\{[^}]*\}/i.test(cleanCss);
    assert.ok(
      hasSidePanelRules,
      'src/style.css must declare layout rules for auxiliary side panels'
    );
  });

  test('Architectural Invariant: Active entrypoint src/main.js mounts directly to #app', () => {
    const mainContent = fs.readFileSync(SRC_MAIN_PATH, 'utf-8');

    assert.ok(
      mainContent.includes("getElementById('app')") ||
        mainContent.includes('getElementById("app")') ||
        mainContent.includes('#app'),
      'src/main.js must explicitly mount or reference document.getElementById("app")'
    );
  });
});