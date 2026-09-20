import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/* Minimal in-memory DOM mock for Node.js test execution */
class MockDOMElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.classList = {
      _classes: new Set(),
      add: (...cls) => cls.forEach((c) => this.classList._classes.add(c)),
      remove: (...cls) => cls.forEach((c) => this.classList._classes.delete(c)),
      toggle: (c) => {
        if (this.classList._classes.has(c)) {
          this.classList._classes.delete(c);
          return false;
        }
        this.classList._classes.add(c);
        return true;
      },
      contains: (c) => this.classList._classes.has(c)
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'class') {
      this.className = String(value);
      this.classList._classes = new Set(String(value).split(' ').filter(Boolean));
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
    if (name === 'class') {
      this.className = '';
      this.classList._classes.clear();
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      child.parentNode = null;
      this.children.splice(index, 1);
    }
    return child;
  }

  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  dispatchEvent(event) {
    const handlers = this.eventListeners.get(event.type) || [];
    for (const handler of handlers) {
      handler(event);
    }
    return true;
  }

  querySelector(selector) {
    return this._matchSelector(this, selector);
  }

  querySelectorAll(selector) {
    const matches = [];
    this._matchAllSelectors(this, selector, matches);
    return matches;
  }

  _matchSelector(node, selector) {
    for (const child of node.children) {
      if (this._matches(child, selector)) return child;
      const found = this._matchSelector(child, selector);
      if (found) return found;
    }
    return null;
  }

  _matchAllSelectors(node, selector, matches) {
    for (const child of node.children) {
      if (this._matches(child, selector)) matches.push(child);
      this._matchAllSelectors(child, selector, matches);
    }
  }

  _matches(el, selector) {
    if (selector.startsWith('#')) return el.id === selector.slice(1);
    if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
    return el.tagName.toLowerCase() === selector.toLowerCase();
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

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

// Setup environment before importing targets
const mockDoc = new MockDocument();
globalThis.document = mockDoc;
globalThis.window = globalThis;
globalThis.CustomEvent = class CustomEvent {
  constructor(type, detail = {}) {
    this.type = type;
    this.detail = detail;
  }
};

// Target module imports
import { AuxiliaryDock } from '../src/components/dock.js';
import { initApp } from '../src/main.js';

describe('Feature STORY 31.4.1: Resolve MISSING_AUXILIARY_DOCK (DF-PANEL-01)', () => {
  let appRoot;

  beforeEach(() => {
    // Reset document body and prepare #app container
    mockDoc.body = new MockDOMElement('body');
    appRoot = mockDoc.createElement('div');
    appRoot.setAttribute('id', 'app');
    mockDoc.body.appendChild(appRoot);
  });

  afterEach(() => {
    mockDoc.body.children = [];
  });

  describe('Unit: AuxiliaryDock Component (src/components/dock.js)', () => {
    it('should instantiate an <aside> element with id "auxiliary-dock"', () => {
      const dock = new AuxiliaryDock();
      const element = dock.getElement();

      assert.ok(element, 'Dock must provide a DOM element representation');
      assert.strictEqual(
        element.tagName.toLowerCase(),
        'aside',
        'Auxiliary dock must use a semantic <aside> tag'
      );
      assert.strictEqual(
        element.id,
        'auxiliary-dock',
        'Auxiliary dock must have the exact id "auxiliary-dock"'
      );
    });

    it('should support collapsible state toggling with accessibility attributes', () => {
      const dock = new AuxiliaryDock({ defaultCollapsed: false });
      const element = dock.getElement();

      assert.strictEqual(
        dock.isCollapsed(),
        false,
        'Dock should initialize in non-collapsed state by default'
      );
      assert.strictEqual(
        element.getAttribute('aria-expanded'),
        'true',
        'aria-expanded must reflect open state'
      );

      // Toggle to collapsed
      dock.toggleCollapse();
      assert.strictEqual(dock.isCollapsed(), true, 'Dock must be collapsed after toggle');
      assert.strictEqual(
        element.getAttribute('aria-expanded'),
        'false',
        'aria-expanded must reflect collapsed state'
      );
      assert.ok(
        element.classList.contains('collapsed') || element.hasAttribute('data-collapsed'),
        'Element must track collapsed state in CSS class or data attribute'
      );

      // Toggle back to expanded
      dock.toggleCollapse();
      assert.strictEqual(dock.isCollapsed(), false, 'Dock must be expanded after second toggle');
      assert.strictEqual(
        element.getAttribute('aria-expanded'),
        'true',
        'aria-expanded must return to true'
      );
    });

    it('should host secondary workflow panels (order execution, watchlist, market depth)', () => {
      const dock = new AuxiliaryDock();

      const workflows = ['order-execution', 'watchlist', 'market-depth'];

      for (const workflow of workflows) {
        const widget = mockDoc.createElement('div');
        widget.setAttribute('id', `widget-${workflow}`);
        widget.setAttribute('data-testid', `secondary-panel-${workflow}`);

        dock.mountWorkflow(workflow, widget);

        const currentActive = dock.getActiveWorkflow();
        assert.strictEqual(
          currentActive,
          workflow,
          `Dock must report ${workflow} as active workflow`
        );

        const hostedWidget = dock.getElement().querySelector(`[data-testid="secondary-panel-${workflow}"]`);
        assert.ok(
          hostedWidget,
          `Auxiliary dock must host the secondary widget panel for ${workflow}`
        );
        assert.strictEqual(
          hostedWidget.id,
          `widget-${workflow}`,
          'Hosted widget must match the mounted instance'
        );
      }
    });
  });

  describe('Integration & Architectural Invariant: Application Shell (src/main.js)', () => {
    it('should mount <aside id="auxiliary-dock"> alongside the primary canvas container inside #app', () => {
      // Act: initialize application shell into document.getElementById('app')
      initApp(appRoot);

      // Assert: Verify primary canvas container exists
      const canvasContainer =
        appRoot.querySelector('#canvas-container') ||
        appRoot.querySelector('[data-testid="primary-canvas"]') ||
        appRoot.querySelector('canvas');
      assert.ok(
        canvasContainer,
        'Application shell must mount the primary canvas container into #app'
      );

      // Assert: Verify <aside id="auxiliary-dock"> exists in live DOM
      const dockElement = appRoot.querySelector('#auxiliary-dock');
      assert.ok(
        dockElement,
        'Semantic <aside id="auxiliary-dock"> must be mounted in document.getElementById("app")'
      );
      assert.strictEqual(
        dockElement.tagName.toLowerCase(),
        'aside',
        'Mounted auxiliary dock must be a semantic <aside> tag'
      );

      // Invariant: Both must share common parent #app or primary workspace container
      assert.strictEqual(
        dockElement.parentNode,
        canvasContainer.parentNode,
        'Auxiliary dock must be mounted alongside the primary canvas container'
      );
    });

    it('should guarantee auxiliary dock is not an isolated unmounted file and responds to workflow activation', () => {
      const appInstance = initApp(appRoot);

      const dockElement = mockDoc.getElementById('auxiliary-dock');
      assert.ok(dockElement, 'Dock must be accessible via document.getElementById("auxiliary-dock")');

      // Trigger secondary workflow activation via app controller or shell event
      if (typeof appInstance?.activateWorkflow === 'function') {
        appInstance.activateWorkflow('order-execution');
      } else {
        // Dispatch workflow activation event on app root
        appRoot.dispatchEvent(
          new CustomEvent('workflow:change', {
            detail: { workflow: 'order-execution' }
          })
        );
      }

      // Verify dock contains the workflow panel or active workflow indicator
      const activeWorkflowPanel =
        dockElement.querySelector('[data-workflow="order-execution"]') ||
        dockElement.querySelector('.workflow-order-execution') ||
        dockElement.getAttribute('data-active-workflow');

      assert.ok(
        activeWorkflowPanel !== null,
        'Auxiliary dock must actively reflect or host the secondary workflow in the live DOM'
      );
    });
  });
});