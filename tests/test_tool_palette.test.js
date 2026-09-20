import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup minimal DOM environment on globalThis for Node.js native test runner
class MockClassList {
  constructor(element) {
    this._element = element;
    this._classes = new Set();
  }
  add(...tokens) {
    for (const token of tokens) this._classes.add(token);
    this._sync();
  }
  remove(...tokens) {
    for (const token of tokens) this._classes.delete(token);
    this._sync();
  }
  contains(token) {
    return this._classes.has(token);
  }
  toggle(token, force) {
    const shouldAdd = force !== undefined ? Boolean(force) : !this._classes.has(token);
    if (shouldAdd) this.add(token);
    else this.remove(token);
    return shouldAdd;
  }
  _sync() {
    this._element.className = Array.from(this._classes).join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div') {
try {     this.tagName = tagName.toUpperCase(); } catch (_) {}
    this.id = '';
    this.className = '';
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.classList = new MockClassList(this);
    this.listeners = new Map();
    this.textContent = '';
  }

  setAttribute(name, value) {
    const strValue = String(value);
    this.attributes.set(name, strValue);
    if (name === 'id') this.id = strValue;
    if (name === 'class') {
      this.classList._classes.clear();
      strValue.split(/\s+/).filter(Boolean).forEach((c) => this.classList._classes.add(c));
      this.className = strValue;
    }
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = strValue;
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
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
    }
    return child;
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
    event.target = this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => handler.call(this, event));
    }
    if (this.parentElement && event.bubbles) {
      this.parentElement.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }
    });
  }

  querySelector(selector) {
    return this._matchSelector(selector, false);
  }

  querySelectorAll(selector) {
    return this._matchSelector(selector, true);
  }

  _matchSelector(selector, returnAll = false) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.children) {
        let match = false;
        if (selector.startsWith('#') && child.id === selector.slice(1)) {
          match = true;
        } else if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) {
          match = true;
        } else if (selector.startsWith('[') && selector.endsWith(']')) {
          const raw = selector.slice(1, -1);
          const [key, value] = raw.split('=');
          const cleanValue = value ? value.replace(/['"]/g, '') : null;
          if (cleanValue !== null) {
            match = child.getAttribute(key) === cleanValue;
          } else {
            match = child.hasAttribute(key);
          }
        } else if (child.tagName.toLowerCase() === selector.toLowerCase()) {
          match = true;
        }

        if (match) {
          results.push(child);
          if (!returnAll) return;
        }
        traverse(child);
        if (!returnAll && results.length > 0) return;
      }
    };

    traverse(this);
    return returnAll ? results : (results[0] || null);
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

// Install Mock DOM globally prior to importing modules
if (!globalThis.document) {
  globalThis.document = new MockDocument();
  globalThis.window = globalThis;
  globalThis.HTMLElement = MockElement;
}

// Module Imports
import { ToolPalette } from '../src/components/ToolPalette.js';
import * as Main from '../src/main.js';

describe('STORY 49.2.1: Resolve MISSING_INTERACTIVE_TOOL_PALETTE (DF-TOOLS-01)', () => {
  let appContainer;
  const REQUIRED_TOOLS = ['crosshair', 'trendline', 'ray', 'measurement'];

  beforeEach(() => {
    // Reset global document body
    globalThis.document.body = new MockElement('body');
    globalThis.document.children = [];
    globalThis.document.appendChild(globalThis.document.body);

    // Setup active #app mounting root
    appContainer = globalThis.document.createElement('div');
    appContainer.setAttribute('id', 'app');
    globalThis.document.body.appendChild(appContainer);
  });

  afterEach(() => {
    if (typeof Main.destroyWorkspace === 'function') {
      Main.destroyWorkspace();
    }
  });

  describe('Unit: ToolPalette Component (src/components/ToolPalette.js)', () => {
    it('should initialize with required tool modes and a default active tool', () => {
      const palette = new ToolPalette({
        tools: REQUIRED_TOOLS,
        defaultTool: 'crosshair'
      });

      assert.equal(palette.getActiveTool(), 'crosshair', 'Default active tool should be crosshair');
      assert.deepEqual(
        palette.getSupportedTools(),
        REQUIRED_TOOLS,
        'Supported tools must match required modes'
      );
    });

    it('should render a toolbar element containing selectable buttons for all required tool modes', () => {
      const palette = new ToolPalette({
        tools: REQUIRED_TOOLS,
        defaultTool: 'crosshair'
      });
      const element = palette.render();

      assert.ok(element instanceof MockElement, 'Render must return a valid DOM element');
      assert.equal(element.getAttribute('role'), 'toolbar', 'Toolbar must have role="toolbar"');
      assert.ok(element.classList.contains('tool-palette'), 'Toolbar root must have .tool-palette class');

      for (const tool of REQUIRED_TOOLS) {
        const toolBtn = element.querySelector(`[data-tool="${tool}"]`);
        assert.ok(toolBtn, `Missing button element for required tool: ${tool}`);
        assert.equal(toolBtn.tagName.toLowerCase(), 'button', `Tool item ${tool} must be a button`);
        assert.equal(toolBtn.getAttribute('data-tool'), tool, `data-tool attribute must equal "${tool}"`);
      }
    });

    it('should visually indicate the default active tool upon rendering', () => {
      const palette = new ToolPalette({
        tools: REQUIRED_TOOLS,
        defaultTool: 'crosshair'
      });
      const element = palette.render();

      const defaultBtn = element.querySelector('[data-tool="crosshair"]');
      assert.ok(defaultBtn.classList.contains('active'), 'Default tool must have active CSS class');
      assert.equal(defaultBtn.getAttribute('aria-pressed'), 'true', 'Active tool must have aria-pressed="true"');

      const nonActiveBtn = element.querySelector('[data-tool="trendline"]');
      assert.equal(nonActiveBtn.classList.contains('active'), false, 'Inactive tool must not have active class');
      assert.equal(nonActiveBtn.getAttribute('aria-pressed'), 'false', 'Inactive tool must have aria-pressed="false"');
    });

    it('should update active tool and toggle selection indicators when a tool button is clicked', () => {
      const palette = new ToolPalette({ tools: REQUIRED_TOOLS, defaultTool: 'crosshair' });
      const element = palette.render();

      const trendlineBtn = element.querySelector('[data-tool="trendline"]');
      const crosshairBtn = element.querySelector('[data-tool="crosshair"]');

      // Click trendline
      trendlineBtn.click();

      assert.equal(palette.getActiveTool(), 'trendline', 'Active tool should update to trendline');
      assert.ok(trendlineBtn.classList.contains('active'), 'Clicked tool must receive .active class');
      assert.equal(trendlineBtn.getAttribute('aria-pressed'), 'true', 'Clicked tool must have aria-pressed="true"');
      assert.equal(crosshairBtn.classList.contains('active'), false, 'Previous tool must lose .active class');
      assert.equal(crosshairBtn.getAttribute('aria-pressed'), 'false', 'Previous tool must have aria-pressed="false"');
    });

    it('should emit onToolChange callback whenever a new tool is selected', () => {
      let notifiedTool = null;
      let callCount = 0;

      const palette = new ToolPalette({
        tools: REQUIRED_TOOLS,
        defaultTool: 'crosshair',
        onToolChange: (tool) => {
          notifiedTool = tool;
          callCount++;
        }
      });
      const element = palette.render();

      const measurementBtn = element.querySelector('[data-tool="measurement"]');
      measurementBtn.click();

      assert.equal(callCount, 1, 'onToolChange callback should fire exactly once per change');
      assert.equal(notifiedTool, 'measurement', 'onToolChange callback received incorrect tool value');
    });

    it('should not re-emit or re-render if the already selected tool is clicked again', () => {
      let callCount = 0;
      const palette = new ToolPalette({
        tools: REQUIRED_TOOLS,
        defaultTool: 'crosshair',
        onToolChange: () => { callCount++; }
      });
      const element = palette.render();

      const crosshairBtn = element.querySelector('[data-tool="crosshair"]');
      crosshairBtn.click();

      assert.equal(callCount, 0, 'No event should emit when clicking an already active tool');
      assert.equal(palette.getActiveTool(), 'crosshair');
    });

    it('should sequentially switch across multiple tools (trendline -> ray -> measurement)', () => {
      const palette = new ToolPalette({ tools: REQUIRED_TOOLS, defaultTool: 'crosshair' });
      const element = palette.render();

      const toolsToTest = ['trendline', 'ray', 'measurement'];
      for (const tool of toolsToTest) {
        const btn = element.querySelector(`[data-tool="${tool}"]`);
        btn.click();

        assert.equal(palette.getActiveTool(), tool, `Active tool should be ${tool}`);
        assert.ok(btn.classList.contains('active'), `${tool} button should have .active class`);
        assert.equal(btn.getAttribute('aria-pressed'), 'true');
      }
    });
  });

  describe('Integration & Architectural Invariant: Live Entrypoint Wiring (src/main.js)', () => {
    it('should mount interactive tool palette into document.getElementById("app") on initialization', () => {
      // Execute the workspace initialization entrypoint
      if (typeof Main.init === 'function') {
        Main.init();
      } else if (typeof Main.initWorkspace === 'function') {
        Main.initWorkspace();
      } else if (typeof Main.mount === 'function') {
        Main.mount(appContainer);
      } else if (typeof Main.default === 'function') {
        Main.default();
      }

      const mountedApp = globalThis.document.getElementById('app');
      assert.ok(mountedApp, 'Expected #app container to exist in document');

      const paletteElement = mountedApp.querySelector('.tool-palette');
      assert.ok(paletteElement, 'Tool palette must be rendered and mounted into #app');

      for (const tool of REQUIRED_TOOLS) {
        const toolBtn = paletteElement.querySelector(`[data-tool="${tool}"]`);
        assert.ok(
          toolBtn,
          `Workspace initialization must render interactive control for "${tool}" inside #app`
        );
      }
    });

    it('should update active workspace tool state and visual selection indicators on user click in live workspace', () => {
      if (typeof Main.init === 'function') {
        Main.init();
      } else if (typeof Main.initWorkspace === 'function') {
        Main.initWorkspace();
      } else if (typeof Main.mount === 'function') {
        Main.mount(appContainer);
      } else if (typeof Main.default === 'function') {
        Main.default();
      }

      const mountedApp = globalThis.document.getElementById('app');
      const paletteElement = mountedApp.querySelector('.tool-palette');
      assert.ok(paletteElement, 'Tool palette must exist in mounted workspace');

      const rayBtn = paletteElement.querySelector('[data-tool="ray"]');
      assert.ok(rayBtn, 'Ray tool button should exist');

      // Click ray tool
      rayBtn.click();

      // Visual indicator assertion
      assert.ok(
        rayBtn.classList.contains('active'),
        'Ray tool button must have .active class after selection'
      );
      assert.equal(
        rayBtn.getAttribute('aria-pressed'),
        'true',
        'Ray tool button must have aria-pressed="true"'
      );

      // Active state on workspace invariant
      if (typeof Main.getActiveTool === 'function') {
        assert.equal(Main.getActiveTool(), 'ray', 'Workspace getActiveTool() must reflect "ray"');
      } else if (typeof Main.getWorkspaceState === 'function') {
        const state = Main.getWorkspaceState();
        assert.equal(state.activeTool, 'ray', 'Workspace state.activeTool must update to "ray"');
      }

      // Next, select measurement tool
      const measureBtn = paletteElement.querySelector('[data-tool="measurement"]');
      measureBtn.click();

      assert.ok(
        measureBtn.classList.contains('active'),
        'Measurement tool button must have .active class after selection'
      );
      assert.equal(
        rayBtn.classList.contains('active'),
        false,
        'Ray tool button must lose .active class after switching to measurement'
      );

      if (typeof Main.getActiveTool === 'function') {
        assert.equal(Main.getActiveTool(), 'measurement');
      }
    });

    it('should reject invalid or unsupported tool mode transitions', () => {
      const palette = new ToolPalette({ tools: REQUIRED_TOOLS, defaultTool: 'crosshair' });
      palette.render();

      assert.throws(
        () => {
          palette.setActiveTool('non_existent_pencil_tool');
        },
        /unsupported/i,
        'Setting an invalid tool must throw an error'
      );
    });
  });
});