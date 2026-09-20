import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup Mock DOM environment for Node.js test runner
class MockClassList {
  constructor(element) {
    this.element = element;
    this.classes = new Set();
  }
  add(...tokens) {
    for (const token of tokens) this.classes.add(token);
    this._sync();
  }
  remove(...tokens) {
    for (const token of tokens) this.classes.delete(token);
    this._sync();
  }
  contains(token) {
    return this.classes.has(token);
  }
  toggle(token, force) {
    if (force !== undefined) {
      if (force) this.add(token);
      else this.remove(token);
      return force;
    }
    const exists = this.contains(token);
    if (exists) this.remove(token);
    else this.add(token);
    return !exists;
  }
  _sync() {
    this.element.className = Array.from(this.classes).join(' ');
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentElement = null;
    this.classList = new MockClassList(this);
    this.className = '';
    this.attributes = new Map();
    this.listeners = new Map();
    this.id = '';
    this.textContent = '';
    this.dataset = {};
  }

  setAttribute(name, value) {
    const strVal = String(value);
    this.attributes.set(name, strVal);
    if (name === 'id') this.id = strVal;
    if (name === 'class') {
      this.classList.classes = new Set(strVal.split(/\s+/).filter(Boolean));
      this.className = strVal;
    }
    if (name.startsWith('data-')) {
      const prop = name
        .slice(5)
        .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[prop] = strVal;
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name.startsWith('data-')) {
      const prop = name
        .slice(5)
        .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      delete this.dataset[prop];
    }
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
      return child;
    }
    throw new Error('Node not found in children');
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  removeEventListener(event, handler) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter((fn) => fn !== handler);
    this.listeners.set(event, filtered);
  }

  dispatchEvent(evtObj) {
    const type = evtObj.type || 'click';
    const handlers = this.listeners.get(type) || [];
    for (const fn of handlers) {
      fn.call(this, { ...evtObj, target: this, currentTarget: this });
    }
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          results.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

function matchesSelector(el, selector) {
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const inner = selector.slice(1, -1);
    if (inner.includes('=')) {
      const [key, val] = inner.split('=').map((s) => s.replace(/['"]/g, ''));
      return el.getAttribute(key) === val;
    }
    return el.hasAttribute(inner);
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    const search = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    };
    return search(this.body);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

// Module imports from active source directory
let ToolPalette;
let REQUIRED_TOOLS;
let initApp;

describe('STORY 30.4.1: Resolve MISSING_INTERACTIVE_TOOL_PALETTE (Defect DF-TOOLS-01)', () => {
  beforeEach(async () => {
    // Install mock DOM globally
    globalThis.document = new MockDocument();
    globalThis.window = globalThis;

    // Dynamically import source modules to ensure clean test runs
    const paletteModule = await import('../src/tool_palette.js');
    ToolPalette = paletteModule.ToolPalette;
    REQUIRED_TOOLS = paletteModule.REQUIRED_TOOLS || [
      'crosshair',
      'trendline',
      'horizontal-level',
      'measurement',
    ];

    const mainModule = await import('../src/main.js');
    initApp = mainModule.initApp;
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
  });

  describe('AC 1: Tool Palette Unit Tests (src/tool_palette.js)', () => {
    test('ToolPalette defines and exposes all mandatory interactive tools', () => {
      const palette = new ToolPalette();
      const expectedTools = ['crosshair', 'trendline', 'horizontal-level', 'measurement'];

      assert.ok(
        Array.isArray(palette.tools) || Array.isArray(palette.getSupportedTools()),
        'ToolPalette must expose a list of supported tools'
      );
      const tools = palette.tools || palette.getSupportedTools();

      for (const expected of expectedTools) {
        assert.ok(
          tools.includes(expected),
          `ToolPalette missing required tool: "${expected}"`
        );
      }
    });

    test('ToolPalette defaults to "crosshair" or valid initial tool upon instantiation', () => {
      const palette = new ToolPalette();
      assert.strictEqual(
        palette.getActiveTool(),
        'crosshair',
        'Default active tool should be "crosshair"'
      );
    });

    test('ToolPalette renders interactive toolbar DOM structure inside target container', () => {
      const container = globalThis.document.createElement('div');
      const palette = new ToolPalette();

      palette.mount(container);

      const toolbar = container.querySelector('.tool-palette, [role="toolbar"]');
      assert.ok(toolbar, 'Toolbar root element must be rendered inside container');

      const expectedTools = ['crosshair', 'trendline', 'horizontal-level', 'measurement'];
      for (const tool of expectedTools) {
        const btn = toolbar.querySelector(`[data-tool="${tool}"]`);
        assert.ok(btn, `Toolbar must contain button element for tool "${tool}"`);
        assert.strictEqual(
          btn.tagName,
          'BUTTON',
          `Tool item for "${tool}" must be a BUTTON element`
        );
      }
    });

    test('Initial mounted DOM reflects the default active tool via attributes/classes', () => {
      const container = globalThis.document.createElement('div');
      const palette = new ToolPalette({ initialTool: 'crosshair' });
      palette.mount(container);

      const crosshairBtn = container.querySelector('[data-tool="crosshair"]');
      assert.ok(crosshairBtn, 'Crosshair button must exist');

      const isActive =
        crosshairBtn.classList.contains('active') ||
        crosshairBtn.getAttribute('aria-pressed') === 'true';
      assert.strictEqual(isActive, true, 'Crosshair button must have active state attributes');

      const trendlineBtn = container.querySelector('[data-tool="trendline"]');
      const isTrendlineActive =
        trendlineBtn.classList.contains('active') ||
        trendlineBtn.getAttribute('aria-pressed') === 'true';
      assert.strictEqual(isTrendlineActive, false, 'Trendline button must not be active initially');
    });

    test('Clicking a tool button updates active tool state and updates UI active indicators', () => {
      const container = globalThis.document.createElement('div');
      const palette = new ToolPalette();
      palette.mount(container);

      const trendlineBtn = container.querySelector('[data-tool="trendline"]');
      const crosshairBtn = container.querySelector('[data-tool="crosshair"]');
      assert.ok(trendlineBtn, 'Trendline button must exist');

      // Click to activate trendline
      trendlineBtn.click();

      assert.strictEqual(
        palette.getActiveTool(),
        'trendline',
        'Active tool state must update to "trendline" on click'
      );
      assert.ok(
        trendlineBtn.classList.contains('active') ||
          trendlineBtn.getAttribute('aria-pressed') === 'true',
        'Trendline button must reflect active state'
      );
      assert.strictEqual(
        crosshairBtn.classList.contains('active') ||
          crosshairBtn.getAttribute('aria-pressed') === 'true',
        false,
        'Previously active crosshair button must lose active state'
      );
    });

    test('Selection triggers tool change callback listener', () => {
      const container = globalThis.document.createElement('div');
      const palette = new ToolPalette();
      palette.mount(container);

      const eventsTriggered = [];
      palette.onToolChange((tool) => {
        eventsTriggered.push(tool);
      });

      const measurementBtn = container.querySelector('[data-tool="measurement"]');
      const horizontalLevelBtn = container.querySelector('[data-tool="horizontal-level"]');

      measurementBtn.click();
      horizontalLevelBtn.click();

      assert.deepStrictEqual(eventsTriggered, ['measurement', 'horizontal-level']);
    });

    test('Calling setActiveTool programmatically updates DOM and rejects invalid tools', () => {
      const container = globalThis.document.createElement('div');
      const palette = new ToolPalette();
      palette.mount(container);

      palette.setActiveTool('horizontal-level');
      assert.strictEqual(palette.getActiveTool(), 'horizontal-level');

      const horizontalBtn = container.querySelector('[data-tool="horizontal-level"]');
      assert.ok(
        horizontalBtn.classList.contains('active') ||
          horizontalBtn.getAttribute('aria-pressed') === 'true',
        'Horizontal-level button must be visually active'
      );

      assert.throws(
        () => {
          palette.setActiveTool('non-existent-tool');
        },
        /invalid/i,
        'Setting an invalid tool must throw an error'
      );
    });
  });

  describe('AC 2 & Architectural Invariant: Entrypoint Wiring (src/main.js)', () => {
    test('Entrypoint mounts tool palette directly inside document.getElementById("app")', () => {
      // Set up the active DOM fixture required in production browser
      const appContainer = globalThis.document.createElement('div');
      appContainer.setAttribute('id', 'app');
      globalThis.document.body.appendChild(appContainer);

      // Execute live application entrypoint initialization
      const appInstance = initApp();

      assert.ok(appInstance, 'initApp must return an application runtime instance');

      const mountedToolbar = appContainer.querySelector('.tool-palette, [role="toolbar"]');
      assert.ok(
        mountedToolbar,
        'Tool palette must be automatically mounted within document.getElementById("app")'
      );

      const buttons = appContainer.querySelectorAll('button[data-tool]');
      assert.strictEqual(
        buttons.length,
        4,
        'Expected all 4 tool buttons to be present inside #app'
      );
    });

    test('Active tool state updates and synchronizes when user clicks tools in the live browser DOM (#app)', () => {
      const appContainer = globalThis.document.createElement('div');
      appContainer.setAttribute('id', 'app');
      globalThis.document.body.appendChild(appContainer);

      const appInstance = initApp();

      const measurementBtn = appContainer.querySelector('[data-tool="measurement"]');
      assert.ok(measurementBtn, 'Measurement tool button must be accessible in #app');

      // Simulate user clicking "measurement" tool
      measurementBtn.click();

      const activeTool =
        typeof appInstance.getActiveTool === 'function'
          ? appInstance.getActiveTool()
          : appInstance.toolPalette.getActiveTool();

      assert.strictEqual(
        activeTool,
        'measurement',
        'Application active tool state must synchronize to "measurement"'
      );

      // Simulate user clicking "trendline" tool
      const trendlineBtn = appContainer.querySelector('[data-tool="trendline"]');
      trendlineBtn.click();

      const updatedTool =
        typeof appInstance.getActiveTool === 'function'
          ? appInstance.getActiveTool()
          : appInstance.toolPalette.getActiveTool();

      assert.strictEqual(
        updatedTool,
        'trendline',
        'Application active tool state must synchronize to "trendline"'
      );
    });

    test('Application entrypoint handles missing #app container gracefully', () => {
      // document.getElementById('app') will return null
      assert.throws(
        () => {
          initApp();
        },
        /Target container #app not found/i,
        'initApp must fail fast or provide explicit error if #app is missing'
      );
    });
  });
});