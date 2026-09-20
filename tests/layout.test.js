import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Environment & DOM Harness Setup
// Handles both JSDOM (if installed in environment) and a self-contained DOM
// fallback to ensure zero-dependency deterministic test execution.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_MAIN_PATH = path.resolve(__dirname, '../src/main.js');
const INDEX_HTML_PATH = path.resolve(__dirname, '../index.html');

let JSDOMClass;
try {
  const jsdomModule = await import('jsdom');
  JSDOMClass = jsdomModule.JSDOM;
} catch {
  // JSDOM not available in environment; lightweight fallback DOM will be used.
}

class MockClassList {
  constructor(element) {
    this._element = element;
    this._classes = new Set();
  }
  add(...names) {
    for (const name of names) if (name) this._classes.add(name);
    this._sync();
  }
  remove(...names) {
    for (const name of names) this._classes.delete(name);
    this._sync();
  }
  contains(name) {
    return this._classes.has(name);
  }
  _sync() {
    this._element.attributes.set('class', Array.from(this._classes).join(' '));
  }
  _load(classString) {
    this._classes.clear();
    if (classString) {
      classString.trim().split(/\s+/).forEach((c) => this._classes.add(c));
    }
  }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.classList = new MockClassList(this);
    this._textContent = '';
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set className(value) {
    this.setAttribute('class', value);
    this.classList._load(value);
  }

  getAttribute(name) {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  setAttribute(name, value) {
    const key = name.toLowerCase();
    this.attributes.set(key, String(value));
    if (key === 'class') {
      this.classList._load(String(value));
    }
  }

  hasAttribute(name) {
    return this.attributes.has(name.toLowerCase());
  }

  removeAttribute(name) {
    const key = name.toLowerCase();
    this.attributes.delete(key);
    if (key === 'class') {
      this.classList._load('');
    }
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

  contains(target) {
    let current = target;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map((c) => c.textContent).join('');
  }

  set textContent(val) {
    this.children = [];
    this._textContent = String(val);
  }

  get innerHTML() {
    return this.children
      .map((child) => {
        const tag = child.tagName.toLowerCase();
        const attrs = Array.from(child.attributes.entries())
          .map(([k, v]) => ` ${k}="${v}"`)
          .join('');
        return `<${tag}${attrs}>${child.innerHTML || child._textContent}</${tag}>`;
      })
      .join('');
  }

  set innerHTML(htmlString) {
    this.children = [];
    this._textContent = '';
    parseHtmlIntoMock(htmlString, this);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const selectors = selector.split(',').map((s) => s.trim());

    const traverse = (node) => {
      for (const child of node.children) {
        for (const sel of selectors) {
          if (matchesSelector(child, sel)) {
            if (!results.includes(child)) {
              results.push(child);
            }
            break;
          }
        }
        traverse(child);
      }
    };

    traverse(this);
    return results;
  }
}

function matchesSelector(el, selector) {
  selector = selector.trim();

  // Child selector: "parent > child"
  if (selector.includes(' > ')) {
    const parts = selector.split(' > ').map((s) => s.trim());
    const childSel = parts[parts.length - 1];
    const parentSel = parts[parts.length - 2];
    return matchesSelector(el, childSel) && el.parentElement && matchesSelector(el.parentElement, parentSel);
  }

  // Descendant selector: "ancestor descendant"
  if (selector.includes(' ')) {
    const parts = selector.split(/\s+/);
    const targetSel = parts[parts.length - 1];
    if (!matchesSelector(el, targetSel)) return false;

    let ancestor = el.parentElement;
    const ancestorSel = parts[0];
    while (ancestor) {
      if (matchesSelector(ancestor, ancestorSel)) return true;
      ancestor = ancestor.parentElement;
    }
    return false;
  }

  // Attribute selector: [data-testid="value"] or [attr]
  const attrMatch = selector.match(/^\[([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?\]$/);
  if (attrMatch) {
    const [, name, val] = attrMatch;
    return val !== undefined ? el.getAttribute(name) === val : el.hasAttribute(name);
  }

  // Tag + class: header.app-header or main.workspace-container
  const tagClassMatch = selector.match(/^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_.-]+)$/);
  if (tagClassMatch) {
    const [, tag, classes] = tagClassMatch;
    const classNames = classes.split('.');
    const tagMatches = el.tagName.toLowerCase() === tag.toLowerCase();
    const classesMatch = classNames.every((c) => el.classList.contains(c));
    return tagMatches && classesMatch;
  }

  // Pure class selector: .app-header
  if (selector.startsWith('.')) {
    const classNames = selector.slice(1).split('.');
    return classNames.every((c) => el.classList.contains(c));
  }

  // Pure ID selector: #app
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }

  // Tag selector: header, main, canvas, select
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function parseHtmlIntoMock(html, rootElement) {
  const tokenRegex = /<([\/a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  let current = rootElement;
  let match;

  while ((match = tokenRegex.exec(html)) !== null) {
    const [fullMatch, tagName, attrString, textContent] = match;

    if (textContent) {
      const text = textContent.trim();
      if (text && current) {
        current._textContent += (current._textContent ? ' ' : '') + text;
      }
      continue;
    }

    if (tagName.startsWith('/')) {
      if (current.parentElement && current !== rootElement) {
        current = current.parentElement;
      }
    } else {
      const isSelfClosing = attrString.endsWith('/') || ['canvas', 'input', 'img', 'br', 'hr'].includes(tagName.toLowerCase());
      const child = new MockElement(tagName);

      if (attrString) {
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrString)) !== null) {
          const [, key, val = ''] = attrMatch;
          child.setAttribute(key, val);
        }
      }

      current.appendChild(child);
      if (!isSelfClosing) {
        current = child;
      }
    }
  }
}

class MockDocument extends MockElement {
  constructor() {
    super('HTML');
    this.body = new MockElement('BODY');
    this.appendChild(this.body);
    this._listeners = new Map();
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }

  addEventListener(event, fn) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(fn);
  }

  dispatchEvent(event) {
    const handlers = this._listeners.get(event.type || event) || [];
    for (const handler of handlers) handler(event);
  }
}

// ---------------------------------------------------------------------------
// Test Suite: STORY 2.4.1: Resolve UNSTRUCTURED_UI_LAYOUT (DF-LAYOUT-01)
// ---------------------------------------------------------------------------

describe('STORY 2.4.1: UI Layout Structure & Defect DF-LAYOUT-01 Regression', () => {
  let domInstance = null;
  let documentRef = null;
  let appMount = null;

  beforeEach(() => {
    if (JSDOMClass) {
      domInstance = new JSDOMClass(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`, {
        url: 'http://localhost:3000',
        runScripts: 'outside-only'
      });
      globalThis.window = domInstance.window;
      globalThis.document = domInstance.window.document;
      globalThis.HTMLElement = domInstance.window.HTMLElement;
      globalThis.HTMLSelectElement = domInstance.window.HTMLSelectElement;
      globalThis.HTMLCanvasElement = domInstance.window.HTMLCanvasElement;
      documentRef = domInstance.window.document;
      appMount = documentRef.getElementById('app');
    } else {
      documentRef = new MockDocument();
      appMount = documentRef.createElement('div');
      appMount.id = 'app';
      documentRef.body.appendChild(appMount);

      globalThis.window = {
        addEventListener: (e, fn) => documentRef.addEventListener(e, fn),
        document: documentRef
      };
      globalThis.document = documentRef;
      globalThis.HTMLElement = MockElement;
    }
  });

  afterEach(() => {
    if (domInstance) {
      domInstance.window.close();
      domInstance = null;
    }
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLSelectElement;
    delete globalThis.HTMLCanvasElement;
  });

  /**
   * Helper to execute/mount the active entrypoint `src/main.js`.
   * Supports execution on import, explicit lifecycle hooks (init/mount),
   * and DOMContentLoaded listeners.
   */
  async function loadAndMountMain() {
    const entryUrl = `${new URL('../src/main.js', import.meta.url).href}?t=${Date.now()}_${Math.random()}`;
    const mainModule = await import(entryUrl);

    if (typeof mainModule.mount === 'function') {
      mainModule.mount(appMount);
    } else if (typeof mainModule.init === 'function') {
      mainModule.init(appMount);
    } else if (typeof mainModule.default === 'function') {
      mainModule.default(appMount);
    }

    // Trigger DOMContentLoaded in case mounting is event-driven
    const event = typeof Event !== 'undefined' ? new Event('DOMContentLoaded') : { type: 'DOMContentLoaded' };
    documentRef.dispatchEvent(event);

    return mainModule;
  }

  describe('Architectural Invariant: Active Entrypoint & HTML Host', () => {
    it('index.html must provide the #app container and link the active entrypoint src/main.js', async () => {
      const htmlContent = await fs.readFile(INDEX_HTML_PATH, 'utf-8');

      assert.match(
        htmlContent,
        /id=["']app["']/,
        'index.html must contain a root mounting element with id="app"'
      );

      assert.match(
        htmlContent,
        /<script[^>]+type=["']module["'][^>]+src=["'][^"']*src\/main\.js["']/,
        'index.html must wire the active entrypoint (src/main.js) as an ES module script'
      );
    });

    it('index.html must not contain hardcoded flat UI siblings dumped directly inside #app', async () => {
      const htmlContent = await fs.readFile(INDEX_HTML_PATH, 'utf-8');
      const appContainerMatch = htmlContent.match(/<div[^>]*id=["']app["'][^>]*>([\s\S]*?)<\/div>/i);

      if (appContainerMatch) {
        const innerContent = appContainerMatch[1].trim();
        // #app in index.html should be clean or empty before client mounting
        assert.doesNotMatch(
          innerContent,
          /<canvas[\s\S]*<input[\s\S]*<button/i,
          'index.html should not contain unmanaged flat siblings inside #app; mounting must occur via src/main.js'
        );
      }
    });
  });

  describe('Acceptance Criteria 1: Semantic Header & Navigation Controls', () => {
    it('renders a semantic <header class="app-header"> mounted directly inside #app', async () => {
      await loadAndMountMain();

      const header = appMount.querySelector('header.app-header');
      assert.ok(header, 'The DOM must render a `<header class="app-header">` inside #app');
      assert.strictEqual(
        header.tagName.toUpperCase(),
        'HEADER',
        'Header element must be the semantic HTML5 <header> tag'
      );
      assert.ok(
        header.classList.contains('app-header'),
        'Header element must have the "app-header" class'
      );
      assert.strictEqual(
        header.parentElement,
        appMount,
        '<header class="app-header"> must be a structured child of #app'
      );
    });

    it('header must contain the application title, ticker selector, and timeframe controls', async () => {
      await loadAndMountMain();

      const header = appMount.querySelector('header.app-header');
      assert.ok(header, 'Header must exist before evaluating descendant controls');

      // 1. Application Title
      const title = header.querySelector('.app-title, [data-testid="app-title"], h1');
      assert.ok(title, 'Header must contain an application title element (.app-title or <h1>)');
      assert.ok(
        title.textContent.trim().length > 0,
        'Application title must render non-empty descriptive text'
      );

      // 2. Ticker Selector
      const tickerSelector = header.querySelector(
        'select.ticker-selector, .ticker-selector, [data-testid="ticker-selector"], #ticker-select'
      );
      assert.ok(tickerSelector, 'Header must contain a ticker selector control');

      // 3. Timeframe Controls
      const timeframeControls = header.querySelector(
        '.timeframe-controls, [data-testid="timeframe-controls"], .timeframe-selector'
      );
      assert.ok(timeframeControls, 'Header must contain timeframe controls');

      // Confirm timeframe controls contain interactive options (buttons or selector options)
      const timeframeButtons = timeframeControls.querySelectorAll('button, option, [role="button"]');
      assert.ok(
        timeframeButtons.length > 0,
        'Timeframe controls container must host selectable timeframe options'
      );
    });
  });

  describe('Acceptance Criteria 2: Structured Workspace Container vs Flat Siblings (DF-LAYOUT-01)', () => {
    it('renders a dedicated semantic <main class="workspace-container"> inside #app', async () => {
      await loadAndMountMain();

      const workspace = appMount.querySelector('main.workspace-container');
      assert.ok(
        workspace,
        'DOM must contain a dedicated workspace container `<main class="workspace-container">`'
      );
      assert.strictEqual(
        workspace.tagName.toUpperCase(),
        'MAIN',
        'Workspace container must be the semantic HTML5 <main> tag'
      );
      assert.strictEqual(
        workspace.parentElement,
        appMount,
        'Workspace container must be mounted as a direct structured descendant of #app'
      );
    });

    it('workspace container hosts the chart canvas container and side panel as structured descendants', async () => {
      await loadAndMountMain();

      const workspace = appMount.querySelector('main.workspace-container');
      assert.ok(workspace, 'Workspace container must exist');

      // 1. Chart canvas container
      const chartContainer = workspace.querySelector(
        '.chart-container, .chart-workspace, [data-testid="chart-container"]'
      );
      assert.ok(
        chartContainer,
        'Workspace container must host the chart canvas container (.chart-container)'
      );
      assert.ok(
        workspace.contains(chartContainer),
        'Chart container must be a descendant of workspace-container'
      );

      const canvas = chartContainer.querySelector('canvas');
      assert.ok(canvas, 'Chart container must contain the rendering canvas element');

      // 2. Side panel for orders and tools
      const sidePanel = workspace.querySelector(
        '.side-panel, .tools-panel, .orders-panel, [data-testid="side-panel"], aside'
      );
      assert.ok(
        sidePanel,
        'Workspace container must host the side panel for orders/tools (.side-panel or <aside>)'
      );
      assert.ok(
        workspace.contains(sidePanel),
        'Side panel must be a descendant of workspace-container'
      );
    });

    it('rejects unstructured flat siblings directly under #app (Defect DF-LAYOUT-01 regression guard)', async () => {
      await loadAndMountMain();

      const directChildren = appMount.children;

      // Ensure canvas or chart is NOT a flat sibling at root level
      const rootCanvas = Array.from(directChildren).find(
        (el) => el.tagName.toUpperCase() === 'CANVAS' || el.classList.contains('chart-container')
      );
      assert.strictEqual(
        rootCanvas,
        undefined,
        'Defect DF-LAYOUT-01 Regressed: Chart canvas or container was found as a flat direct child of #app'
      );

      // Ensure order panel/tools are NOT flat siblings at root level
      const rootSidePanel = Array.from(directChildren).find(
        (el) =>
          el.classList.contains('side-panel') ||
          el.classList.contains('order-panel') ||
          el.classList.contains('tools-panel')
      );
      assert.strictEqual(
        rootSidePanel,
        undefined,
        'Defect DF-LAYOUT-01 Regressed: Side panel was found as an unstructured flat child of #app'
      );

      // Ensure header does NOT improperly nest the chart workspace
      const header = appMount.querySelector('header.app-header');
      const chartInHeader = header.querySelector('canvas, .chart-container');
      assert.strictEqual(
        chartInHeader,
        null,
        'Chart container must not be nested inside the top navigation header'
      );
    });

    it('establishes correct relative DOM ordering: header appears prior to workspace container', async () => {
      await loadAndMountMain();

      const header = appMount.querySelector('header.app-header');
      const workspace = appMount.querySelector('main.workspace-container');

      assert.ok(header && workspace, 'Both header and workspace container must exist in DOM');

      const headerIndex = appMount.children.indexOf(header);
      const workspaceIndex = appMount.children.indexOf(workspace);

      assert.ok(
        headerIndex !== -1 && workspaceIndex !== -1,
        'Both header and workspace must be registered children of #app'
      );
      assert.ok(
        headerIndex < workspaceIndex,
        'App header must precede the workspace container in top-to-bottom layout sequence'
      );
    });
  });
});