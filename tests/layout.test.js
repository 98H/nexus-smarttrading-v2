import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAIN_JS_PATH = path.resolve(__dirname, '../src/main.js');
const STYLE_CSS_PATH = path.resolve(__dirname, '../src/style.css');

/**
 * Lightweight DOM simulation for headless Node.js testing.
 * Supports element creation, innerHTML parsing, querySelector(All),
 * classList, attributes, and event listener registration/dispatching.
 */
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
    this.children = [];
    this.parentElement = null;
    this.textContent = '';
    this._innerHTML = '';
    this._listeners = new Map();
    this._attributes = new Map();
  }

  get classList() {
    const getClasses = () => this.className.split(/\s+/).filter(Boolean);
    return {
      add: (...classes) => {
        const current = new Set(getClasses());
        classes.forEach((c) => current.add(c));
        this.className = Array.from(current).join(' ');
      },
      remove: (...classes) => {
        const removeSet = new Set(classes);
        this.className = getClasses().filter((c) => !removeSet.has(c)).join(' ');
      },
      contains: (className) => getClasses().includes(className),
      toggle: (className) => {
        if (this.classList.contains(className)) {
          this.classList.remove(className);
          return false;
        }
        this.classList.add(className);
        return true;
      }
    };
  }

  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    return this._attributes.get(name) || null;
  }

  setAttribute(name, value) {
    if (name === 'id') {
      this.id = String(value);
    } else if (name === 'class') {
      this.className = String(value);
    } else {
      this._attributes.set(name, String(value));
    }
  }

  removeAttribute(name) {
    if (name === 'id') this.id = '';
    else if (name === 'class') this.className = '';
    else this._attributes.delete(name);
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

  addEventListener(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(listener);
  }

  removeEventListener(event, listener) {
    if (this._listeners.has(event)) {
      const list = this._listeners.get(event).filter((fn) => fn !== listener);
      this._listeners.set(event, list);
    }
  }

  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : event.type;
    const evt = typeof event === 'string' ? { type, target: this, defaultPrevented: false } : event;
    evt.target = this;
    const listeners = this._listeners.get(type) || [];
    for (const listener of listeners) {
      listener.call(this, evt);
    }
    return !evt.defaultPrevented;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    if (!html || typeof html !== 'string') return;
    this._parseAndPopulateHTML(html);
  }

  _parseAndPopulateHTML(html) {
    // Regex tokenizer for matching HTML elements, attributes, and text
    const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9-]+)([^>]*)\/>/g;
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
      const tagName = match[1] || match[4];
      const rawAttrs = match[2] || match[5] || '';
      const innerContent = match[3] || '';

      const child = new MockElement(tagName);

      // Parse id, class, and other attributes
      const attrRegex = /([a-zA-Z0-9-_:]+)(?:=["']([^"']*)["'])?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = attrMatch[1];
        const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : '';
        child.setAttribute(attrName, attrVal);
      }

      if (innerContent) {
        if (/<[a-zA-Z0-9-]+/.test(innerContent)) {
          child.innerHTML = innerContent;
        } else {
          child.textContent = innerContent.trim();
        }
      }

      this.appendChild(child);
    }
  }

  _matchesSingleSelector(selector) {
    selector = selector.trim();
    if (!selector) return false;

    // Attribute selector: [attr="value"] or [attr]
    const attrMatch = selector.match(/^\[([a-zA-Z0-9-_:]+)(?:=["']?([^"']*)["']?)?\]$/);
    if (attrMatch) {
      const [, attrName, attrVal] = attrMatch;
      const actualVal = this.getAttribute(attrName);
      if (attrVal === undefined) return actualVal !== null;
      return actualVal === attrVal;
    }

    // ID selector: #id
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }

    // Class selector: .class
    if (selector.startsWith('.')) {
      return this.classList.contains(selector.slice(1));
    }

    // Tag selector with optional class or id: tag.class or tag#id or tag
    const tagMatch = selector.match(/^([a-zA-Z0-9-]+)?(?:\.([a-zA-Z0-9-_]+))?(?:#([a-zA-Z0-9-_]+))?$/);
    if (tagMatch) {
      const [, tag, cls, id] = tagMatch;
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (cls && !this.classList.contains(cls)) return false;
      if (id && this.id !== id) return false;
      return true;
    }

    return false;
  }

  querySelector(selector) {
    const parts = selector.trim().split(/\s+/);
    if (parts.length === 1) {
      for (const child of this.children) {
        if (child._matchesSingleSelector(parts[0])) return child;
        const nested = child.querySelector(parts[0]);
        if (nested) return nested;
      }
      return null;
    }

    // Descendant traversal
    let currentCandidates = [this];
    for (const part of parts) {
      const nextCandidates = [];
      for (const parent of currentCandidates) {
        const found = parent.querySelectorAll(part);
        nextCandidates.push(...found);
      }
      currentCandidates = nextCandidates;
      if (currentCandidates.length === 0) return null;
    }
    return currentCandidates[0] || null;
  }

  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    if (parts.length === 1) {
      const results = [];
      const traverse = (el) => {
        for (const child of el.children) {
          if (child._matchesSingleSelector(parts[0])) {
            results.push(child);
          }
          traverse(child);
        }
      };
      traverse(this);
      return results;
    }

    let current = [this];
    for (const part of parts) {
      const next = [];
      for (const el of current) {
        next.push(...el.querySelectorAll(part));
      }
      current = next;
    }
    return current;
  }

  getElementById(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.getElementById(id);
      if (found) return found;
    }
    return null;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this._appElement = new MockElement('div');
    this._appElement.id = 'app';
    this.body.appendChild(this._appElement);
  }

  getElementById(id) {
    return this.body.getElementById(id);
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  querySelector(selector) {
    if (selector === '#app') return this._appElement;
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

describe('STORY 1.3.1: Resolve UNSTRUCTURED_UI_LAYOUT (DF-LAYOUT-01)', () => {
  let mockDoc;
  let originalDocument;
  let originalWindow;

  beforeEach(() => {
    mockDoc = new MockDocument();
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    globalThis.document = mockDoc;
    globalThis.window = {
      document: mockDoc,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true
    };
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  describe('AC 1: Structured UI DOM Hierarchy', () => {
    it('must structure #app into a top navigation header and a workspace container, avoiding unstructured siblings', async () => {
      // Import the entrypoint to trigger layout mounting
      const entryModule = await import(`${MAIN_JS_PATH}?t=${Date.now()}_ac1_structure`);
      if (typeof entryModule.init === 'function') {
        entryModule.init();
      } else if (typeof entryModule.mountApp === 'function') {
        entryModule.mountApp();
      }

      const app = mockDoc.getElementById('app');
      assert.ok(app, 'CRITICAL: #app element must exist in the DOM');

      // The root #app must not have loose elements like unnested buttons, canvases, or order panels
      // Top-level children of #app must include navigation header and workspace container
      const header = app.querySelector('header, .top-nav, .nav-header');
      assert.ok(header, 'Layout must contain a top navigation header (<header> or .top-nav)');

      const workspace = app.querySelector('.workspace-container, main.workspace, [data-testid="workspace"]');
      assert.ok(workspace, 'Layout must contain a dedicated workspace container (.workspace-container or main)');

      // Verify header and workspace container are top-level structured regions under #app
      assert.strictEqual(
        header.parentElement,
        app,
        'Top navigation header must be a direct child of #app'
      );
      assert.strictEqual(
        workspace.parentElement,
        app,
        'Workspace container must be a direct child of #app'
      );

      // Verify #app does NOT have unstructured sibling controls directly attached
      const directChildTags = app.children.map((c) => c.tagName);
      assert.ok(
        !directChildTags.includes('CANVAS'),
        'Defect DF-LAYOUT-01 violation: Canvas must not be an unstructured direct sibling under #app'
      );
      assert.ok(
        !directChildTags.includes('BUTTON'),
        'Defect DF-LAYOUT-01 violation: Raw buttons must not be unstructured direct siblings under #app'
      );
    });

    it('top navigation header must contain title, ticker, and timeframe controls', async () => {
      const entryModule = await import(`${MAIN_JS_PATH}?t=${Date.now()}_ac1_header`);
      if (typeof entryModule.init === 'function') {
        entryModule.init();
      } else if (typeof entryModule.mountApp === 'function') {
        entryModule.mountApp();
      }

      const app = mockDoc.getElementById('app');
      const header = app.querySelector('header, .top-nav, .nav-header');
      assert.ok(header, 'Navigation header must exist to house controls');

      // Title verification
      const titleEl = header.querySelector('h1, .app-title, .title, [data-testid="app-title"]');
      assert.ok(titleEl, 'Header must contain an application title element');
      assert.ok(
        titleEl.textContent.trim().length > 0,
        'Application title must not be empty'
      );

      // Ticker control verification (e.g. selector, input, or display)
      const tickerEl = header.querySelector(
        '.ticker-control, .ticker-selector, [data-testid="ticker-control"], select.ticker, .ticker'
      );
      assert.ok(
        tickerEl,
        'Header must contain ticker controls for asset selection/display'
      );

      // Timeframe controls verification (buttons, dropdown, or container with timeframe options)
      const timeframeContainer = header.querySelector(
        '.timeframe-controls, .timeframe-selector, [data-testid="timeframe-controls"]'
      );
      assert.ok(
        timeframeContainer,
        'Header must contain timeframe controls'
      );

      // Check for presence of typical timeframe options (e.g. 1m, 5m, 1h, 1D)
      const timeframeButtons = timeframeContainer.querySelectorAll('button, option, .timeframe-btn');
      assert.ok(
        timeframeButtons.length >= 2,
        `Timeframe controls must offer selectable options; found ${timeframeButtons.length}`
      );
    });

    it('workspace container must host the chart workspace and side panels for orders/tools', async () => {
      const entryModule = await import(`${MAIN_JS_PATH}?t=${Date.now()}_ac1_workspace`);
      if (typeof entryModule.init === 'function') {
        entryModule.init();
      } else if (typeof entryModule.mountApp === 'function') {
        entryModule.mountApp();
      }

      const app = mockDoc.getElementById('app');
      const workspace = app.querySelector('.workspace-container, main.workspace, [data-testid="workspace"]');
      assert.ok(workspace, 'Workspace container must exist');

      // Chart workspace
      const chartWorkspace = workspace.querySelector(
        '.chart-workspace, #chart-container, .chart-container, [data-testid="chart-workspace"]'
      );
      assert.ok(
        chartWorkspace,
        'Workspace must contain a dedicated chart workspace container'
      );
      assert.strictEqual(
        chartWorkspace.parentElement,
        workspace,
        'Chart workspace must be hosted directly inside workspace container'
      );

      // Side panels: orders and tools
      const sidePanels = workspace.querySelectorAll(
        '.side-panel, aside, .orders-panel, .tools-panel, [data-testid="side-panel"]'
      );
      assert.ok(
        sidePanels.length >= 1,
        'Workspace container must host side panels for orders/tools'
      );

      const ordersPanel = workspace.querySelector(
        '.orders-panel, [data-panel="orders"], [data-testid="orders-panel"]'
      );
      const toolsPanel = workspace.querySelector(
        '.tools-panel, [data-panel="tools"], [data-testid="tools-panel"]'
      );
      assert.ok(
        ordersPanel || toolsPanel,
        'Workspace must contain dedicated side panel(s) for orders and/or tools'
      );
    });
  });

  describe('AC 2: Entrypoint Wiring and Auto-Mounting (src/main.js)', () => {
    it('src/main.js must automatically mount structured layout to document.getElementById("app")', async () => {
      const app = mockDoc.getElementById('app');
      assert.strictEqual(app.children.length, 0, '#app must be clean before main.js execution');

      // Execute main.js module
      await import(`${MAIN_JS_PATH}?t=${Date.now()}_ac2_automount`);

      assert.ok(
        app.children.length > 0,
        'src/main.js must automatically mount components into document.getElementById("app") on load'
      );
    });

    it('src/main.js must wire event listeners directly into live DOM controls in the header', async () => {
      await import(`${MAIN_JS_PATH}?t=${Date.now()}_ac2_events`);

      const app = mockDoc.getElementById('app');
      const timeframeButtons = app.querySelectorAll(
        '.timeframe-controls button, .timeframe-btn, [data-timeframe]'
      );

      assert.ok(
        timeframeButtons.length > 0,
        'Timeframe buttons must be present to test event wiring'
      );

      // Verify that at least one timeframe button has an active click listener
      let hasClickListener = false;
      for (const btn of timeframeButtons) {
        const listeners = btn._listeners.get('click') || [];
        if (listeners.length > 0) {
          hasClickListener = true;
          break;
        }
      }

      assert.strictEqual(
        hasClickListener,
        true,
        'Timeframe controls must have event handlers wired directly to live DOM elements'
      );

      // Verify ticker control has change or click event wiring
      const tickerControl = app.querySelector('.ticker-control, .ticker-selector, select.ticker');
      if (tickerControl) {
        const changeListeners = tickerControl._listeners.get('change') || [];
        const clickListeners = tickerControl._listeners.get('click') || [];
        assert.ok(
          changeListeners.length > 0 || clickListeners.length > 0,
          'Ticker control must have change/click event listeners wired'
        );
      }
    });

    it('dispatching an event on a timeframe control must trigger its wired handler without throwing', async () => {
      await import(`${MAIN_JS_PATH}?t=${Date.now()}_ac2_dispatch`);

      const app = mockDoc.getElementById('app');
      const targetBtn = app.querySelector('.timeframe-controls button, .timeframe-btn');

      if (targetBtn) {
        assert.doesNotThrow(() => {
          targetBtn.dispatchEvent('click');
        }, 'Wired timeframe click handler should execute smoothly on live DOM event');
      }
    });
  });

  describe('CSS Layout Invariant: src/style.css', () => {
    it('src/style.css must exist and contain rules for top-nav, workspace-container, and side panels', () => {
      assert.ok(
        fs.existsSync(STYLE_CSS_PATH),
        'CRITICAL: src/style.css must exist for application styling'
      );

      const cssContent = fs.readFileSync(STYLE_CSS_PATH, 'utf-8');

      // Verify CSS classes exist for the new structured layout
      const hasHeaderRule = /header|\.top-nav|\.nav-header/i.test(cssContent);
      const hasWorkspaceRule = /\.workspace-container|main\.workspace/i.test(cssContent);
      const hasSidePanelRule = /\.side-panel|\.orders-panel|\.tools-panel|aside/i.test(cssContent);
      const hasChartWorkspaceRule = /\.chart-workspace|\.chart-container/i.test(cssContent);

      assert.strictEqual(
        hasHeaderRule,
        true,
        'src/style.css must include styling rules for the top navigation header'
      );
      assert.strictEqual(
        hasWorkspaceRule,
        true,
        'src/style.css must include styling rules for .workspace-container (flex/grid layout)'
      );
      assert.strictEqual(
        hasSidePanelRule,
        true,
        'src/style.css must include styling rules for side panels'
      );
      assert.strictEqual(
        hasChartWorkspaceRule,
        true,
        'src/style.css must include styling rules for the chart workspace'
      );
    });

    it('src/style.css must define flexible or grid layout for workspace container', () => {
      const cssContent = fs.readFileSync(STYLE_CSS_PATH, 'utf-8');

      // The workspace container must use flexbox or grid to structure chart and side panels
      const workspaceBlockMatch = cssContent.match(
        /(\.workspace-container|main\.workspace)[\s\S]*?\{([\s\S]*?)\}/i
      );

      assert.ok(
        workspaceBlockMatch,
        'src/style.css must define a rule block for .workspace-container'
      );

      const ruleBody = workspaceBlockMatch[2];
      const hasFlexOrGrid = /display\s*:\s*(flex|grid)/i.test(ruleBody);

      assert.strictEqual(
        hasFlexOrGrid,
        true,
        '.workspace-container must have display: flex or display: grid to host chart and side panels side-by-side'
      );
    });
  });
});