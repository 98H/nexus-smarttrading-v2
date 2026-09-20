import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Target modules under test
import * as DockModule from '../src/components/dock.js';
import * as MainModule from '../src/main.js';

/**
 * Lightweight DOM simulation for headless Node.js test execution.
 */
class MockDOMElement {
  constructor(tagName) {
try {     this.tagName = tagName.toUpperCase(); } catch (_) {}
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.classList = new Set();
    this.dataset = {};
    this._listeners = new Map();
    this._textContent = '';
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(val) {
    this.setAttribute('id', val);
  }

  get className() {
    return Array.from(this.classList).join(' ');
  }

  set className(val) {
    this.classList.clear();
    if (val) {
      val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
  }

  get textContent() {
    if (this.children.length === 0) {
      return this._textContent;
    }
    return Array.from(this.children).map(c => c.textContent).join('');
  }

  set textContent(val) {
    this.children = [];
    this._textContent = String(val);
  }

  setAttribute(name, value) {
    const strVal = String(value);
    this.attributes.set(name, strVal);
    if (name === 'class') {
      this.className = strVal;
    }
    if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[prop] = strVal;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'class') {
      this.classList.clear();
    }
    if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      delete this.dataset[prop];
    }
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
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

  replaceChildren(...newChildren) {
    Array.from(this.children).forEach(c => { c.parentNode = null; });
    this.children = [];
    newChildren.forEach(c => this.appendChild(c));
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
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    let curr = this;
    while (curr) {
      event.currentTarget = curr;
      const handlers = curr._listeners.get(event.type) || [];
      for (const handler of handlers) {
        handler.call(curr, event);
      }
      if (!event.bubbles) break;
      curr = curr.parentNode;
    }
    return true;
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      bubbles: true,
      cancelable: true,
      target: this,
      currentTarget: this,
      preventDefault: () => {},
      stopPropagation: () => {}
    });
  }

  get innerHTML() {
    return Array.from(this.children).map(c => c.outerHTML || '').join('');
  }

  set innerHTML(html) {
    Array.from(this.children).forEach(c => { c.parentNode = null; });
    this.children = [];
    this._textContent = '';
    parseHtmlToMockDOM(html, this);
  }

  querySelector(selector) {
    const matches = this.querySelectorAll(selector);
    return matches.length > 0 ? matches[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const search = (node) => {
      for (const child of node.children) {
        if (matchesSimpleSelector(child, selector)) {
          results.push(child);
        }
        search(child);
      }
    };
    search(this);
    return results;
  }
}

function matchesSimpleSelector(el, selector) {
  const parts = selector.trim().match(/([.#]?[a-zA-Z0-9\-_]+|\[[a-zA-Z0-9\-_]+(?:="[^"]*")?\])/g);
  if (!parts) return false;
  return parts.every(part => {
    if (part.startsWith('#')) return el.id === part.slice(1);
    if (part.startsWith('.')) return el.classList.has(part.slice(1));
    if (part.startsWith('[')) {
      const match = part.match(/^\[([a-zA-Z0-9\-_]+)(?:="([^"]*)")?\]$/);
      if (match) {
        const [, attr, val] = match;
        if (val !== undefined) return el.getAttribute(attr) === val;
        return el.hasAttribute(attr);
      }
    }
    return el.tagName.toLowerCase() === part.toLowerCase();
  });
}

function parseHtmlToMockDOM(html, parentNode) {
  if (!html || typeof html !== 'string') return;
  const tagRegex = /<(\/?[a-zA-Z0-9\-]+)([^>]*)>|([^<]+)/g;
  const stack = [parentNode];
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const [, tagName, rawAttrs, text] = match;
    if (text && text.trim()) {
      const top = stack[stack.length - 1];
      top.textContent = (top.textContent || '') + text.trim();
      continue;
    }
    if (!tagName) continue;

    if (tagName.startsWith('/')) {
      if (stack.length > 1) {
        stack.pop();
      }
    } else {
      const el = new MockDOMElement(tagName);
      const isSelfClosing = rawAttrs.endsWith('/') || ['img', 'input', 'hr', 'br'].includes(tagName.toLowerCase());
      const attrRegex = /([a-zA-Z0-9\-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const name = attrMatch[1];
        const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        el.setAttribute(name, val);
      }
      stack[stack.length - 1].appendChild(el);
      if (!isSelfClosing) {
        stack.push(el);
      }
    }
  }
}

class MockDocument {
  constructor() {
    this.body = new MockDOMElement('body');
  }

  createElement(tagName) {
    return new MockDOMElement(tagName);
  }

  getElementById(id) {
    return this.body.querySelector(`#${id}`);
  }

  querySelector(sel) {
    if (matchesSimpleSelector(this.body, sel)) return this.body;
    return this.body.querySelector(sel);
  }

  querySelectorAll(sel) {
    const results = this.body.querySelectorAll(sel);
    if (matchesSimpleSelector(this.body, sel)) {
      return [this.body, ...results];
    }
    return results;
  }
}

// Global DOM setup / teardown hooks
let originalDocument;
let originalWindow;

beforeEach(() => {
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;

  const mockDoc = new MockDocument();
  const appContainer = mockDoc.createElement('div');
  appContainer.id = 'app';
  mockDoc.body.appendChild(appContainer);

  globalThis.document = mockDoc;
  globalThis.window = {
    document: mockDoc,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
});

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
});

describe('STORY 37.2.1 - DF-PANEL-02: Auxiliary Dock Component (src/components/dock.js)', () => {
  const DockClass = DockModule.AuxiliaryDock || DockModule.Dock || DockModule.default;

  it('TC-DOCK-01: mounts dock skeleton with tab headers and an accessible panel body container', () => {
    assert.ok(DockClass, 'AuxiliaryDock must be exported from src/components/dock.js');

    const container = globalThis.document.createElement('div');
    const dock = new DockClass(container);
    if (typeof dock.mount === 'function') {
      dock.mount(container);
    }

    const panelBody = container.querySelector('.dock-panel-body') ||
                      container.querySelector('[data-testid="dock-panel-body"]');
    assert.ok(panelBody, 'Auxiliary dock must render a panel body element (.dock-panel-body or [data-testid="dock-panel-body"])');

    const tabs = container.querySelectorAll('[data-tab], .dock-tab');
    assert.ok(tabs.length >= 3, 'Dock must display at least 3 tabs (Watchlist, Orders, Depth)');

    const tabNames = Array.from(tabs).map(t => (t.dataset.tab || t.textContent).trim());
    assert.ok(tabNames.includes('Watchlist'), 'Tabs must contain "Watchlist"');
    assert.ok(tabNames.includes('Orders'), 'Tabs must contain "Orders"');
    assert.ok(tabNames.includes('Depth'), 'Tabs must contain "Depth"');
  });

  it('TC-DOCK-02: renders Watchlist widget with functional symbol quote rows instead of empty space', () => {
    const container = globalThis.document.createElement('div');
    const dock = new DockClass(container, { activeTab: 'Watchlist' });
    if (typeof dock.mount === 'function') {
      dock.mount(container);
    }
    if (typeof dock.switchTab === 'function') {
      dock.switchTab('Watchlist');
    }

    const panelBody = container.querySelector('.dock-panel-body') ||
                      container.querySelector('[data-testid="dock-panel-body"]');
    assert.ok(panelBody, 'Panel body container must be present');

    // Panel body must NOT be empty dark space
    const bodyContent = (panelBody.textContent || '').trim();
    assert.ok(
      panelBody.children.length > 0 || bodyContent.length > 0,
      'Panel body for Watchlist tab must not be empty dark space'
    );

    // Verify symbol quote rows or watchlist widget presence
    const quoteRows = panelBody.querySelectorAll('.quote-row, [data-testid="quote-row"], .symbol-row');
    const watchlistWidget = panelBody.querySelector('.watchlist-widget, [data-testid="widget-watchlist"], .watchlist-table');

    assert.ok(
      quoteRows.length > 0 || watchlistWidget !== null,
      'Watchlist panel must render symbol quote rows or a dedicated watchlist table widget'
    );
  });

  it('TC-DOCK-03: switches to Orders tab and renders active orders list instead of empty space', () => {
    const container = globalThis.document.createElement('div');
    const dock = new DockClass(container);
    if (typeof dock.mount === 'function') {
      dock.mount(container);
    }

    // Trigger tab switch to Orders
    if (typeof dock.switchTab === 'function') {
      dock.switchTab('Orders');
    } else {
      const ordersTab = container.querySelector('[data-tab="Orders"], .tab-orders');
      assert.ok(ordersTab, 'Orders tab element must exist for user interaction');
      ordersTab.click();
    }

    const panelBody = container.querySelector('.dock-panel-body') ||
                      container.querySelector('[data-testid="dock-panel-body"]');
    assert.ok(panelBody, 'Panel body container must be present');

    // Panel body must NOT be empty
    assert.ok(
      panelBody.children.length > 0,
      'Orders panel body must not be empty dark space'
    );

    // Verify order items or orders widget presence
    const orderItems = panelBody.querySelectorAll('.order-item, [data-testid="order-item"], .order-row');
    const ordersWidget = panelBody.querySelector('.orders-widget, [data-testid="widget-orders"], .orders-list');

    assert.ok(
      orderItems.length > 0 || ordersWidget !== null,
      'Orders tab must render active order items or orders list widget'
    );

    // Ensure Watchlist quotes are no longer active in panel body
    const quotesInOrders = panelBody.querySelectorAll('.quote-row, [data-testid="quote-row"]');
    assert.strictEqual(
      quotesInOrders.length,
      0,
      'Previous Watchlist quote rows must be removed when switching to Orders'
    );
  });

  it('TC-DOCK-04: switches to Depth tab and renders market depth bars instead of empty space', () => {
    const container = globalThis.document.createElement('div');
    const dock = new DockClass(container);
    if (typeof dock.mount === 'function') {
      dock.mount(container);
    }

    // Trigger tab switch to Depth
    if (typeof dock.switchTab === 'function') {
      dock.switchTab('Depth');
    } else {
      const depthTab = container.querySelector('[data-tab="Depth"], .tab-depth');
      assert.ok(depthTab, 'Depth tab element must exist for user interaction');
      depthTab.click();
    }

    const panelBody = container.querySelector('.dock-panel-body') ||
                      container.querySelector('[data-testid="dock-panel-body"]');
    assert.ok(panelBody, 'Panel body container must be present');

    // Panel body must NOT be empty
    assert.ok(
      panelBody.children.length > 0,
      'Depth panel body must not be empty dark space'
    );

    // Verify depth bars or market depth widget presence
    const depthBars = panelBody.querySelectorAll('.depth-bar, [data-testid="depth-bar"], .depth-level');
    const depthWidget = panelBody.querySelector('.depth-widget, [data-testid="widget-depth"], .market-depth');

    assert.ok(
      depthBars.length > 0 || depthWidget !== null,
      'Depth tab must render market depth bars or depth widget'
    );
  });

  it('TC-DOCK-05: updates active tab styling and dynamically re-renders panel body via DOM click events', () => {
    const container = globalThis.document.createElement('div');
    const dock = new DockClass(container);
    if (typeof dock.mount === 'function') {
      dock.mount(container);
    }

    const ordersTab = container.querySelector('[data-tab="Orders"]');
    const watchlistTab = container.querySelector('[data-tab="Watchlist"]');
    const depthTab = container.querySelector('[data-tab="Depth"]');

    assert.ok(ordersTab && watchlistTab && depthTab, 'All tab headers must exist in the dock DOM');

    // Click Orders
    ordersTab.click();
    let panelBody = container.querySelector('.dock-panel-body') ||
                    container.querySelector('[data-testid="dock-panel-body"]');
    assert.ok(
      panelBody.querySelector('.order-item, [data-testid="order-item"], .orders-widget, [data-testid="widget-orders"]'),
      'Clicking Orders tab header must re-render panel body with Orders widget'
    );
    assert.ok(ordersTab.classList.has('active') || ordersTab.getAttribute('aria-selected') === 'true',
      'Clicked Orders tab must have active state'
    );

    // Click Depth
    depthTab.click();
    assert.ok(
      panelBody.querySelector('.depth-bar, [data-testid="depth-bar"], .depth-widget, [data-testid="widget-depth"]'),
      'Clicking Depth tab header must re-render panel body with Depth widget'
    );

    // Click Watchlist
    watchlistTab.click();
    assert.ok(
      panelBody.querySelector('.quote-row, [data-testid="quote-row"], .watchlist-widget, [data-testid="widget-watchlist"]'),
      'Clicking Watchlist tab header must re-render panel body with Watchlist widget'
    );
  });
});

describe('STORY 37.2.1 - DF-PANEL-02: Live Entrypoint Boot and Dock Wiring (src/main.js)', () => {
  it('TC-MAIN-01: boots application, mounts auxiliary dock to #app container, and binds non-empty active panel body', async () => {
    const appEl = globalThis.document.getElementById('app');
    assert.ok(appEl, '#app container must exist prior to boot');
    assert.strictEqual(appEl.children.length, 0, '#app container should initially be clear');

    // Boot entrypoint
    if (typeof MainModule.bootstrap === 'function') {
      await MainModule.bootstrap();
    } else if (typeof MainModule.init === 'function') {
      await MainModule.init();
    } else if (typeof MainModule.main === 'function') {
      await MainModule.main();
    } else if (typeof MainModule.default === 'function') {
      await MainModule.default();
    }

    // Architectural Invariant: Auxiliary dock must be mounted in document.getElementById('app')
    const mountedDock = appEl.querySelector('.auxiliary-dock, .dock-container, [data-testid="auxiliary-dock"]');
    assert.ok(
      mountedDock !== null,
      'src/main.js must mount the auxiliary dock inside document.getElementById("app") upon boot'
    );

    // Acceptance Criteria: Initial panel body must render functional widget, not empty space
    const panelBody = mountedDock.querySelector('.dock-panel-body, [data-testid="dock-panel-body"]');
    assert.ok(panelBody, 'Mounted dock inside #app must contain dock panel body');
    assert.ok(
      panelBody.children.length > 0,
      'Mounted auxiliary dock in #app must have a non-empty panel body on initial boot'
    );
  });

  it('TC-MAIN-02: retains reactive tab switching wiring within mounted DOM in #app', async () => {
    // Re-initialize app
    if (typeof MainModule.bootstrap === 'function') {
      await MainModule.bootstrap();
    } else if (typeof MainModule.init === 'function') {
      await MainModule.init();
    } else if (typeof MainModule.main === 'function') {
      await MainModule.main();
    } else if (typeof MainModule.default === 'function') {
      await MainModule.default();
    }

    const appEl = globalThis.document.getElementById('app');
    const depthTab = appEl.querySelector('[data-tab="Depth"]');
    assert.ok(depthTab, 'Mounted dock in #app must have "Depth" tab button');

    depthTab.click();

    const panelBody = appEl.querySelector('.dock-panel-body, [data-testid="dock-panel-body"]');
    assert.ok(panelBody, 'Dock panel body must remain mounted in #app');

    const hasDepthWidget = panelBody.querySelector('.depth-bar, [data-testid="depth-bar"], .depth-widget, [data-testid="widget-depth"]');
    assert.ok(
      hasDepthWidget !== null,
      'Clicking Depth tab in booted app must update the active panel body to render market depth bars'
    );
  });
});