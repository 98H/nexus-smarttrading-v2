import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------
 * Minimal DOM Environment Simulation for Node.js test execution
 * ------------------------------------------------------------------ */
class MockDOMTokenList {
  constructor(element) {
    this._element = element;
    this._classes = new Set();
  }
  add(...tokens) {
    tokens.forEach((t) => this._classes.add(t));
    this._element._attributes.set('class', Array.from(this._classes).join(' '));
  }
  remove(...tokens) {
    tokens.forEach((t) => this._classes.delete(t));
    this._element._attributes.set('class', Array.from(this._classes).join(' '));
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
    const exists = this.contains(token);
    if (exists) this.remove(token);
    else this.add(token);
    return !exists;
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.children = [];
    this.parentNode = null;
    this._attributes = new Map();
    this.dataset = {};
    this.classList = new MockDOMTokenList(this);
    this._listeners = new Map();
  }

  setAttribute(name, value) {
    this._attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(value);
    }
    if (name === 'class') {
      this.classList._classes.clear();
      String(value)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => this.classList._classes.add(c));
    }
  }

  getAttribute(name) {
    return this._attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this._attributes.has(name);
  }

  removeAttribute(name) {
    this._attributes.delete(name);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      delete this.dataset[key];
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      child.parentNode = null;
      this.children.splice(idx, 1);
    }
    return child;
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const list = this._listeners.get(type) || [];
    const idx = list.indexOf(listener);
    if (idx !== -1) list.splice(idx, 1);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const listeners = this._listeners.get(event.type) || [];
    for (const listener of listeners) {
      listener.call(this, event);
    }
    if (event.bubbles && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    const event = new MockCustomEvent('click', { bubbles: true, cancelable: true });
    this.dispatchEvent(event);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const checkMatch = (el) => {
      if (selector.startsWith('#') && el.id === selector.slice(1)) return true;
      if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) return true;
      if (selector.startsWith('[data-tool="') && el.dataset.tool === selector.slice(12, -2)) return true;
      if (selector.startsWith('[data-tool]')) return 'tool' in el.dataset;
      if (selector.toLowerCase() === el.tagName.toLowerCase()) return true;
      return false;
    };

    const traverse = (node) => {
      for (const child of node.children) {
        if (checkMatch(child)) results.push(child);
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

class MockCustomEvent {
  constructor(type, eventInitDict = {}) {
    this.type = type;
    this.detail = eventInitDict.detail ?? null;
    this.bubbles = Boolean(eventInitDict.bubbles);
    this.cancelable = Boolean(eventInitDict.cancelable);
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
  }
  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
  stopPropagation() {}
}

class MockDocument {
  constructor() {
    this.body = new MockElement('BODY');
    this._elementsById = new Map();
  }

  createElement(tagName) {
    return new MockElement(tagName);
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

// Establish global DOM shims before module imports
const mockDocument = new MockDocument();
globalThis.document = mockDocument;
globalThis.window = globalThis;
globalThis.CustomEvent = MockCustomEvent;

/* ------------------------------------------------------------------
 * Import Target Modules
 * ------------------------------------------------------------------ */
import { ToolPalette } from '../src/components/ToolPalette.js';
import * as MainEntrypoint from '../src/main.js';

describe('STORY 29.7.1: Resolve MISSING_INTERACTIVE_TOOL_PALETTE (DF-TOOLS-01)', () => {
  const REQUIRED_TOOLS = ['crosshair', 'trendline', 'ray', 'measurement'];
  let appRoot;
  let workspaceCanvas;

  beforeEach(() => {
    mockDocument.body.children = [];
    appRoot = mockDocument.createElement('DIV');
    appRoot.id = 'app';
    mockDocument.body.appendChild(appRoot);

    workspaceCanvas = mockDocument.createElement('CANVAS');
    workspaceCanvas.id = 'workspace-canvas';
    appRoot.appendChild(workspaceCanvas);
  });

  afterEach(() => {
    mockDocument.body.children = [];
  });

  describe('Component Specification: ToolPalette.js', () => {
    it('should initialize with required tools and render them into the palette container', () => {
      const palette = new ToolPalette({ tools: REQUIRED_TOOLS });
      const paletteElement = palette.render();

      assert.ok(paletteElement instanceof MockElement, 'render() must return a DOM element');
      assert.ok(
        paletteElement.classList.contains('tool-palette') || paletteElement.getAttribute('role') === 'toolbar',
        'Palette root element must have class "tool-palette" or role "toolbar"'
      );

      REQUIRED_TOOLS.forEach((toolName) => {
        const toolBtn = paletteElement.querySelector(`[data-tool="${toolName}"]`);
        assert.ok(toolBtn, `Palette must render a control for tool mode: "${toolName}"`);
      });
    });

    it('should default to "crosshair" as the initial active tool', () => {
      const palette = new ToolPalette();
      palette.render();

      assert.strictEqual(
        palette.getActiveTool(),
        'crosshair',
        'Default active tool should be "crosshair"'
      );
    });

    it('should update active tool state and emit toolchange event upon tool selection', () => {
      const palette = new ToolPalette({ tools: REQUIRED_TOOLS });
      const paletteElement = palette.render();
      let emittedEvent = null;

      paletteElement.addEventListener('toolchange', (e) => {
        emittedEvent = e;
      });

      const trendlineBtn = paletteElement.querySelector('[data-tool="trendline"]');
      assert.ok(trendlineBtn, 'Trendline button must be rendered');

      trendlineBtn.click();

      assert.strictEqual(
        palette.getActiveTool(),
        'trendline',
        'Active tool state should update to "trendline"'
      );
      assert.ok(trendlineBtn.classList.contains('active'), 'Clicked tool button must have "active" class');

      assert.ok(emittedEvent, 'A "toolchange" event must be dispatched when a tool is clicked');
      assert.strictEqual(
        emittedEvent.detail?.tool,
        'trendline',
        'Event detail must contain { tool: "trendline" }'
      );
    });

    it('should deactivate previously active tool when a new tool is selected', () => {
      const palette = new ToolPalette({ tools: REQUIRED_TOOLS });
      const paletteElement = palette.render();

      const trendlineBtn = paletteElement.querySelector('[data-tool="trendline"]');
      const measurementBtn = paletteElement.querySelector('[data-tool="measurement"]');

      trendlineBtn.click();
      assert.ok(trendlineBtn.classList.contains('active'));
      assert.strictEqual(palette.getActiveTool(), 'trendline');

      measurementBtn.click();
      assert.strictEqual(
        palette.getActiveTool(),
        'measurement',
        'Active tool must switch to "measurement"'
      );
      assert.ok(measurementBtn.classList.contains('active'), 'Measurement button must now be active');
      assert.strictEqual(
        trendlineBtn.classList.contains('active'),
        false,
        'Trendline button must no longer be active'
      );
    });

    it('should reject or ignore unsupported tool modes and maintain valid state', () => {
      const palette = new ToolPalette({ tools: REQUIRED_TOOLS });
      palette.render();

      assert.throws(
        () => palette.setActiveTool('unsupported_magic_wand'),
        /invalid|unsupported/i,
        'Setting an invalid tool should throw an error'
      );
      assert.strictEqual(palette.getActiveTool(), 'crosshair', 'Active tool must remain intact');
    });
  });

  describe('Architectural Invariant & Entrypoint Integration: src/main.js', () => {
    it('should mount the interactive tool palette into #app when main entrypoint initializes', () => {
      if (typeof MainEntrypoint.mount === 'function') {
        MainEntrypoint.mount(appRoot);
      } else if (typeof MainEntrypoint.init === 'function') {
        MainEntrypoint.init();
      } else if (typeof MainEntrypoint.default === 'function') {
        MainEntrypoint.default();
      }

      const paletteElement = appRoot.querySelector('.tool-palette') || appRoot.querySelector('[role="toolbar"]');
      assert.ok(
        paletteElement,
        'Interactive tool palette must be rendered and mounted into DOM under #app'
      );

      REQUIRED_TOOLS.forEach((tool) => {
        const toolBtn = paletteElement.querySelector(`[data-tool="${tool}"]`);
        assert.ok(toolBtn, `Mounted palette in #app must include selectable tool: ${tool}`);
      });
    });

    it('should wire the tool palette change event directly to the workspace canvas', () => {
      if (typeof MainEntrypoint.mount === 'function') {
        MainEntrypoint.mount(appRoot);
      } else if (typeof MainEntrypoint.init === 'function') {
        MainEntrypoint.init();
      } else if (typeof MainEntrypoint.default === 'function') {
        MainEntrypoint.default();
      }

      let canvasReceivedEvent = null;
      workspaceCanvas.addEventListener('toolchange', (e) => {
        canvasReceivedEvent = e;
      });

      const measurementBtn = appRoot.querySelector('[data-tool="measurement"]');
      assert.ok(measurementBtn, 'Measurement tool button must be present in mounted DOM');

      measurementBtn.click();

      assert.ok(
        canvasReceivedEvent,
        'Workspace canvas element must receive the "toolchange" event when a tool is clicked'
      );
      assert.strictEqual(
        canvasReceivedEvent.detail?.tool,
        'measurement',
        'Workspace canvas event detail must contain the newly active tool'
      );
    });

    it('should allow consecutive tool switches reflecting correctly on canvas listener', () => {
      if (typeof MainEntrypoint.mount === 'function') {
        MainEntrypoint.mount(appRoot);
      } else if (typeof MainEntrypoint.init === 'function') {
        MainEntrypoint.init();
      } else if (typeof MainEntrypoint.default === 'function') {
        MainEntrypoint.default();
      }

      const receivedTools = [];
      workspaceCanvas.addEventListener('toolchange', (e) => {
        receivedTools.push(e.detail?.tool);
      });

      const rayBtn = appRoot.querySelector('[data-tool="ray"]');
      const trendlineBtn = appRoot.querySelector('[data-tool="trendline"]');
      assert.ok(rayBtn, 'Ray tool button must exist');
      assert.ok(trendlineBtn, 'Trendline tool button must exist');

      rayBtn.click();
      trendlineBtn.click();

      assert.deepStrictEqual(
        receivedTools,
        ['ray', 'trendline'],
        'Workspace canvas must receive toolchange events in order for all interactions'
      );
    });
  });
});