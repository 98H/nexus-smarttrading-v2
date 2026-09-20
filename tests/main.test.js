import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------
 * Minimal Deterministic DOM Environment for Node.js test execution
 * ------------------------------------------------------------------ */

class MockClassList {
  constructor(element) {
    this._element = element;
    this._classes = new Set();
  }
  add(...tokens) {
    tokens.forEach((t) => this._classes.add(t));
  }
  remove(...tokens) {
    tokens.forEach((t) => this._classes.delete(t));
  }
  contains(token) {
    return this._classes.has(token);
  }
  toString() {
    return Array.from(this._classes).join(' ');
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.classList = new MockClassList(this);
    this._innerHTML = '';
    this.eventListeners = new Map(); // event -> Set of handler functions
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
    if (!val || typeof val !== 'string') return;

    // Simple parser for synthetic markup injection in tests
    const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>(?:([\s\S]*?)<\/\1>)?/g;
    let match;
    while ((match = tagRegex.exec(val)) !== null) {
      const tag = match[1];
      const rawAttrs = match[2] || '';
      const content = match[3] || '';
      const child = createMockElement(tag);

      const idMatch = rawAttrs.match(/id=["']([^"']+)["']/);
      if (idMatch) child.id = idMatch[1];

      const classMatch = rawAttrs.match(/class=["']([^"']+)["']/);
      if (classMatch) {
        classMatch[1].split(/\s+/).filter(Boolean).forEach((c) => child.classList.add(c));
      }

      const attrRegex = /([a-zA-Z0-9\-]+)=["']([^"']+)["']/g;
      let aMatch;
      while ((aMatch = attrRegex.exec(rawAttrs)) !== null) {
        child.setAttribute(aMatch[1], aMatch[2]);
      }

      if (content && content.includes('<')) {
        child.innerHTML = content;
      }

      this.appendChild(child);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'class') {
      this.classList._classes.clear();
      String(value).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
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
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
      return child;
    }
    throw new Error('NotFound: Node was not found');
  }

  addEventListener(type, handler) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type).add(handler);
    activeListenerRegistry.push({ target: this, type, handler });
  }

  removeEventListener(type, handler) {
    if (this.eventListeners.has(type)) {
      this.eventListeners.get(type).delete(handler);
    }
    const idx = activeListenerRegistry.findIndex(
      (r) => r.target === this && r.type === type && r.handler === handler
    );
    if (idx !== -1) activeListenerRegistry.splice(idx, 1);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return querySelectorAll(this, selector);
  }

  getContext(contextId) {
    if (this.tagName === 'CANVAS') {
      return { canvas: this, type: contextId };
    }
    return null;
  }
}

function createMockElement(tagName) {
  return new MockElement(tagName);
}

function matchesSelector(element, selector) {
  if (!element || !element.tagName) return false;
  const s = selector.trim();
  if (s.startsWith('#')) return element.id === s.slice(1);
  if (s.startsWith('.')) return element.classList.contains(s.slice(1));
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1);
    if (inner.includes('=')) {
      const [attr, val] = inner.split('=');
      const cleanVal = val.trim().replace(/["']/g, '');
      return element.getAttribute(attr.trim()) === cleanVal;
    }
    return element.hasAttribute(inner.trim());
  }
  return element.tagName.toLowerCase() === s.toLowerCase();
}

function querySelectorAll(root, selector) {
  const matches = [];
  function traverse(node) {
    for (const child of node.children) {
      if (matchesSelector(child, selector)) {
        matches.push(child);
      }
      traverse(child);
    }
  }
  traverse(root);
  return matches;
}

// Global listener tracking for duplicate listener assertions
let activeListenerRegistry = [];

class MockWindow {
  constructor() {
    this.eventListeners = new Map();
  }
  addEventListener(type, handler) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type).add(handler);
    activeListenerRegistry.push({ target: this, type, handler });
  }
  removeEventListener(type, handler) {
    if (this.eventListeners.has(type)) {
      this.eventListeners.get(type).delete(handler);
    }
    const idx = activeListenerRegistry.findIndex(
      (r) => r.target === this && r.type === type && r.handler === handler
    );
    if (idx !== -1) activeListenerRegistry.splice(idx, 1);
  }
}

class MockDocument {
  constructor() {
    this.body = createMockElement('body');
    this.eventListeners = new Map();
  }
  createElement(tag) {
    return createMockElement(tag);
  }
  getElementById(id) {
    const results = querySelectorAll(this.body, `#${id}`);
    return results[0] || null;
  }
  querySelector(selector) {
    return this.body.querySelector(selector);
  }
  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
  addEventListener(type, handler) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type).add(handler);
    activeListenerRegistry.push({ target: this, type, handler });
  }
  removeEventListener(type, handler) {
    if (this.eventListeners.has(type)) {
      this.eventListeners.get(type).delete(handler);
    }
    const idx = activeListenerRegistry.findIndex(
      (r) => r.target === this && r.type === type && r.handler === handler
    );
    if (idx !== -1) activeListenerRegistry.splice(idx, 1);
  }
}

/* ------------------------------------------------------------------
 * Environment Bootstrap
 * ------------------------------------------------------------------ */

globalThis.window = new MockWindow();
globalThis.document = new MockDocument();

// Import target entrypoint dynamically after DOM globals exist
const { mountApp } = await import('../src/main.js');

/* ------------------------------------------------------------------
 * Test Helpers
 * ------------------------------------------------------------------ */

function extractComponents(container) {
  const headers = querySelectorAll(container, 'header');
  const canvases = querySelectorAll(container, 'canvas');

  // Support toolbars declared as tag, class, or data attribute
  const toolbarsByTag = querySelectorAll(container, 'toolbar');
  const toolbarsByClass = querySelectorAll(container, '.toolbar');
  const toolbarsByData = querySelectorAll(container, '[data-component="toolbar"]');
  const uniqueToolbars = Array.from(
    new Set([...toolbarsByTag, ...toolbarsByClass, ...toolbarsByData])
  );

  return {
    headers,
    canvases,
    toolbars: uniqueToolbars
  };
}

/* ------------------------------------------------------------------
 * Test Suites
 * ------------------------------------------------------------------ */

describe('STORY 37.1.1: Resolve DUPLICATE_COMPONENT_MOUNTING (DF-DUPLICATION-01)', () => {
  let appContainer;

  beforeEach(() => {
    activeListenerRegistry = [];
    globalThis.document.body.children = [];
    appContainer = createMockElement('div');
    appContainer.id = 'app';
    globalThis.document.body.appendChild(appContainer);
  });

  afterEach(() => {
    if (appContainer) {
      appContainer.innerHTML = '';
    }
    activeListenerRegistry = [];
  });

  describe('Acceptance Criteria 1: Container Cleared and Single Component Instances', () => {
    it('mounts header, toolbar, and canvas components exactly once on initial load', () => {
      mountApp(appContainer);

      const { headers, canvases, toolbars } = extractComponents(appContainer);

      assert.strictEqual(
        headers.length,
        1,
        `Expected exactly 1 header element, found ${headers.length}`
      );
      assert.strictEqual(
        canvases.length,
        1,
        `Expected exactly 1 canvas element, found ${canvases.length}`
      );
      assert.strictEqual(
        toolbars.length,
        1,
        `Expected exactly 1 toolbar element, found ${toolbars.length}`
      );
    });

    it('clears pre-existing DOM elements before mounting (root.innerHTML = "")', () => {
      // Simulate stale/dirty container state prior to invocation
      appContainer.innerHTML =
        '<div id="stale-banner" class="legacy">Stale Artifact</div>' +
        '<header id="old-header"></header>' +
        '<canvas id="old-canvas"></canvas>';

      mountApp(appContainer);

      const staleBanner = appContainer.querySelector('#stale-banner');
      assert.strictEqual(
        staleBanner,
        null,
        'Expected pre-existing DOM nodes to be purged on mountApp'
      );

      const { headers, canvases, toolbars } = extractComponents(appContainer);
      assert.strictEqual(headers.length, 1, 'Pre-existing headers must not accumulate');
      assert.strictEqual(canvases.length, 1, 'Pre-existing canvases must not accumulate');
      assert.strictEqual(toolbars.length, 1, 'Pre-existing toolbars must not accumulate');
    });

    it('is strictly idempotent when mountApp is called repeatedly on the same container', () => {
      // Call mountApp multiple times sequentially
      mountApp(appContainer);
      mountApp(appContainer);
      mountApp(appContainer);
      mountApp(appContainer);

      const { headers, canvases, toolbars } = extractComponents(appContainer);

      assert.strictEqual(
        headers.length,
        1,
        `DF-DUPLICATION-01 Defect: Expected 1 header after repeated mounts, got ${headers.length}`
      );
      assert.strictEqual(
        canvases.length,
        1,
        `DF-DUPLICATION-01 Defect: Expected 1 canvas after repeated mounts, got ${canvases.length}`
      );
      assert.strictEqual(
        toolbars.length,
        1,
        `DF-DUPLICATION-01 Defect: Expected 1 toolbar after repeated mounts, got ${toolbars.length}`
      );
    });

    it('clears or guards when targeting default document.getElementById("app")', () => {
      // Test without passing container argument directly to mirror entrypoint execution
      mountApp();
      mountApp();
      mountApp();

      const activeApp = globalThis.document.getElementById('app');
      assert.ok(activeApp, 'Active #app container must exist in DOM');

      const { headers, canvases, toolbars } = extractComponents(activeApp);
      assert.strictEqual(headers.length, 1, 'Header duplicated when mounting via default lookup');
      assert.strictEqual(canvases.length, 1, 'Canvas duplicated when mounting via default lookup');
      assert.strictEqual(toolbars.length, 1, 'Toolbar duplicated when mounting via default lookup');
    });
  });

  describe('Acceptance Criteria 2: Idempotent Execution and No Leaked Event Listeners', () => {
    it('does not duplicate window or document event listeners across multiple mountApp invocations', () => {
      // Mount once to establish baseline listeners
      mountApp(appContainer);
      const initialWindowListeners = activeListenerRegistry.filter(
        (r) => r.target === globalThis.window
      );
      const initialDocListeners = activeListenerRegistry.filter(
        (r) => r.target === globalThis.document
      );

      // Re-invoke mountApp twice
      mountApp(appContainer);
      mountApp(appContainer);

      const currentWindowListeners = activeListenerRegistry.filter(
        (r) => r.target === globalThis.window
      );
      const currentDocListeners = activeListenerRegistry.filter(
        (r) => r.target === globalThis.document
      );

      assert.strictEqual(
        currentWindowListeners.length,
        initialWindowListeners.length,
        `Window event listeners multiplied: expected ${initialWindowListeners.length}, got ${currentWindowListeners.length}`
      );
      assert.strictEqual(
        currentDocListeners.length,
        initialDocListeners.length,
        `Document event listeners multiplied: expected ${initialDocListeners.length}, got ${currentDocListeners.length}`
      );
    });

    it('does not leave detached or zombie canvas nodes in DOM', () => {
      mountApp(appContainer);
      const firstCanvas = appContainer.querySelector('canvas');
      assert.ok(firstCanvas, 'Canvas must be mounted on initial invocation');

      mountApp(appContainer);
      const allCanvasesInDocument = globalThis.document.querySelectorAll('canvas');

      assert.strictEqual(
        allCanvasesInDocument.length,
        1,
        `Expected only 1 total canvas node across the document, found ${allCanvasesInDocument.length}`
      );
      assert.strictEqual(
        allCanvasesInDocument[0].parentElement,
        appContainer,
        'Active canvas must be rooted inside active container'
      );
    });

    it('preserves component placement and order upon idempotent re-mounting', () => {
      mountApp(appContainer);
      const initialOrder = Array.from(appContainer.children).map((el) => el.tagName);

      mountApp(appContainer);
      const postRemountOrder = Array.from(appContainer.children).map((el) => el.tagName);

      assert.deepStrictEqual(
        postRemountOrder,
        initialOrder,
        'Remounting produced inconsistent component structure or ordering'
      );
    });
  });

  describe('Edge Cases and Invariants', () => {
    it('gracefully handles missing container by raising a descriptive error', () => {
      // Remove #app to simulate invalid state
      globalThis.document.body.children = [];

      assert.throws(
        () => {
          mountApp();
        },
        {
          name: 'Error',
          message: /(container|element|root|app).*(not found|missing|required|null)/i
        },
        'mountApp should fail fast if the root container (#app) cannot be found'
      );
    });

    it('supports re-mounting into an alternative, isolated container without cross-contamination', () => {
      const secondaryContainer = createMockElement('section');
      secondaryContainer.id = 'secondary-app';
      globalThis.document.body.appendChild(secondaryContainer);

      mountApp(appContainer);
      mountApp(secondaryContainer);

      const primary = extractComponents(appContainer);
      const secondary = extractComponents(secondaryContainer);

      assert.strictEqual(primary.canvases.length, 1);
      assert.strictEqual(secondary.canvases.length, 1);
      assert.notStrictEqual(
        primary.canvases[0],
        secondary.canvases[0],
        'Different containers must host distinct canvas instances'
      );
    });
  });
});