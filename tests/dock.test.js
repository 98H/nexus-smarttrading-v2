import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Helper mock DOM implementation to support DOM testing in pure Node.js environments
class MockDOMElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.style = {};
    this.eventListeners = new Map();

    this.classList = {
      _classes: new Set(),
      add: (...classes) => classes.forEach((c) => this.classList._classes.add(c)),
      remove: (...classes) => classes.forEach((c) => this.classList._classes.delete(c)),
      toggle: (c) => {
        if (this.classList._classes.has(c)) {
          this.classList._classes.delete(c);
          return false;
        }
        this.classList._classes.add(c);
        return true;
      },
      contains: (c) => this.classList._classes.has(c),
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
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
    throw new Error('Node was not found');
  }

  addEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  dispatchEvent(event) {
    const listeners = this.eventListeners.get(event.type) || [];
    for (const listener of listeners) {
      listener(event);
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const match = (el) => {
      if (selector.startsWith('#') && el.id === selector.slice(1)) {
        return true;
      }
      if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) {
        return true;
      }
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const [attr, val] = selector.slice(1, -1).split('=');
        if (!val && el.hasAttribute(attr)) return true;
        const cleanVal = val?.replace(/['"]/g, '');
        if (el.getAttribute(attr) === cleanVal) return true;
      }
      if (el.tagName.toLowerCase() === selector.toLowerCase()) {
        return true;
      }
      return false;
    };

    const traverse = (node) => {
      for (const child of node.children) {
        if (match(child)) {
          results.push(child);
        }
        traverse(child);
      }
    };

    traverse(this);
    return results;
  }
}

// Module imports from target modules
import { AuxiliaryDock } from '../src/dock.js';
import { mountApp } from '../src/main.js';

describe('STORY 1.2.1: Resolve MISSING_AUXILIARY_DOCK (Defect ID: DF-PANEL-01)', () => {
  let appRoot;

  beforeEach(() => {
    // Setup global DOM environment
    appRoot = new MockDOMElement('div');
    appRoot.id = 'app';

    globalThis.document = {
      getElementById: (id) => (id === 'app' ? appRoot : null),
      createElement: (tag) => new MockDOMElement(tag),
      body: new MockDOMElement('body'),
    };
  });

  afterEach(() => {
    delete globalThis.document;
  });

  describe('src/dock.js - AuxiliaryDock Component Unit Tests', () => {
    it('should instantiate a semantic <aside> auxiliary dock element with accessible attributes', () => {
      const dock = new AuxiliaryDock();
      const element = dock.getElement();

      assert.ok(element instanceof MockDOMElement, 'Dock element must be an instance of DOM element');
      assert.strictEqual(
        element.tagName.toLowerCase(),
        'aside',
        'Auxiliary dock root element must be a semantic <aside>'
      );
      assert.strictEqual(
        element.getAttribute('role'),
        'complementary',
        'Auxiliary dock should have role="complementary"'
      );
      assert.ok(
        element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby'),
        'Auxiliary dock must provide an accessible label via aria-label or aria-labelledby'
      );
    });

    it('should host secondary workflow panels (order execution, watchlist, inspector)', () => {
      const dock = new AuxiliaryDock({
        panels: ['order-execution', 'watchlist', 'inspector'],
      });
      const element = dock.getElement();

      const panelContainer = element.querySelector('[data-panel-container]') || element;
      const orderPanel = panelContainer.querySelector('[data-panel="order-execution"]');
      const watchlistPanel = panelContainer.querySelector('[data-panel="watchlist"]');
      const inspectorPanel = panelContainer.querySelector('[data-panel="inspector"]');

      assert.ok(orderPanel, 'Dock must render the Order Execution workflow panel');
      assert.ok(watchlistPanel, 'Dock must render the Watchlist workflow panel');
      assert.ok(inspectorPanel, 'Dock must render the Inspector/Tool Parameters workflow panel');
    });

    it('should provide a collapse/expand toggle control that updates visibility and layout state', () => {
      const dock = new AuxiliaryDock();
      const element = dock.getElement();
      const toggleButton = element.querySelector('[data-action="toggle-dock"]');

      assert.ok(toggleButton, 'Dock must contain a toggle control element (button/trigger)');

      // Initial expanded state check
      assert.strictEqual(
        dock.isCollapsed(),
        false,
        'Auxiliary dock should be expanded by default'
      );
      assert.strictEqual(
        toggleButton.getAttribute('aria-expanded'),
        'true',
        'Toggle button must reflect expanded state in aria-expanded'
      );

      // Trigger collapse
      toggleButton.click();

      assert.strictEqual(
        dock.isCollapsed(),
        true,
        'Dock state must be collapsed after toggle click'
      );
      assert.strictEqual(
        toggleButton.getAttribute('aria-expanded'),
        'false',
        'Toggle button must reflect collapsed state in aria-expanded'
      );
      assert.strictEqual(
        element.getAttribute('data-collapsed'),
        'true',
        'Dock element layout attribute data-collapsed should be "true"'
      );

      // Trigger expand again
      toggleButton.click();

      assert.strictEqual(
        dock.isCollapsed(),
        false,
        'Dock state must return to expanded after second toggle click'
      );
      assert.strictEqual(
        toggleButton.getAttribute('aria-expanded'),
        'true',
        'Toggle button aria-expanded must be reset to "true"'
      );
      assert.strictEqual(
        element.getAttribute('data-collapsed'),
        'false',
        'Dock element layout attribute data-collapsed should be "false"'
      );
    });
  });

  describe('src/main.js - Application Entrypoint Integration', () => {
    it('should mount primary canvas alongside semantic <aside> auxiliary dock into #app', () => {
      // Act: Mount the application
      mountApp();

      // Assert #app has children
      assert.ok(appRoot.children.length >= 2, 'The app root must host multiple primary layout sections');

      // Assert primary canvas is mounted
      const canvasElement = appRoot.querySelector('canvas');
      assert.ok(canvasElement, 'Primary workspace canvas must be mounted into document.getElementById("app")');

      // Assert semantic <aside> auxiliary dock is mounted alongside canvas
      const asideElement = appRoot.querySelector('aside');
      assert.ok(asideElement, 'Semantic <aside> auxiliary dock must be mounted in #app alongside the primary canvas');

      // Assert both canvas and dock share the active workspace container or #app
      assert.ok(
        canvasElement.parentElement === asideElement.parentElement ||
        appRoot.children.includes(asideElement),
        'Auxiliary dock and primary canvas must be co-located within the main application layout'
      );
    });

    it('should toggle auxiliary dock layout state dynamically without unmounting or disrupting canvas', () => {
      // Act: Mount the application
      mountApp();

      const canvasBefore = appRoot.querySelector('canvas');
      const asideElement = appRoot.querySelector('aside');
      assert.ok(canvasBefore, 'Canvas must exist before toggle');
      assert.ok(asideElement, 'Aside dock must exist before toggle');

      const toggleButton = asideElement.querySelector('[data-action="toggle-dock"]');
      assert.ok(toggleButton, 'Toggle button must exist in the mounted dock');

      // Act: Toggle the dock to collapsed
      toggleButton.click();

      // Assert: Dock remains mounted in the DOM tree
      const asideAfter = appRoot.querySelector('aside');
      assert.ok(asideAfter, 'Auxiliary dock must remain mounted in DOM when collapsed');
      assert.strictEqual(
        asideAfter.getAttribute('data-collapsed'),
        'true',
        'Auxiliary dock must reflect collapsed layout state'
      );

      // Assert: Canvas remains strictly the exact same instance and mounted
      const canvasAfter = appRoot.querySelector('canvas');
      assert.ok(canvasAfter, 'Canvas element must remain mounted');
      assert.strictEqual(
        canvasBefore,
        canvasAfter,
        'Primary canvas must not be unmounted, recreated, or disrupted when toggling the auxiliary dock'
      );
      assert.strictEqual(
        canvasAfter.parentElement !== null,
        true,
        'Canvas must remain attached to its parent node'
      );
    });
  });
});