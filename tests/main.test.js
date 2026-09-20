import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * DOM Mock Environment Setup
 * Emulates modern browser DOM behavior where Element.prototype.tagName is a read-only getter.
 */
class MockElement {
  constructor(tagName = 'DIV') {
    this._tagName = tagName.toUpperCase();
    this.attributes = Object.create(null);
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.id = '';
    this.className = '';
  }

  get tagName() {
    return this._tagName;
  }

  get nodeName() {
    return this._tagName;
  }

  get nodeType() {
    return 1;
  }

  get isConnected() {
    return this.parentNode !== null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  removeAttribute(name) {
    delete this.attributes[name];
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
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.className.split(/\s+/).includes(cls)) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    const tag = selector.toUpperCase();
    if (this.tagName === tag) return this;
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const tag = selector.toUpperCase();
    for (const child of this.children) {
      if (child.tagName === tag) {
        results.push(child);
      }
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

class MockHTMLCanvasElement extends MockElement {
  constructor() {
    super('CANVAS');
    this.width = 300;
    this.height = 150;
  }

  getContext(type) {
    return {
      canvas: this,
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
      drawImage: () => {},
    };
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('BODY');
    this.elementsById = new Map();
  }

  createElement(tagName) {
    const upper = tagName.toUpperCase();
    let el;
    if (upper === 'CANVAS') {
      el = new MockHTMLCanvasElement();
    } else {
      el = new MockElement(upper);
    }
    return el;
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElementById(id, element) {
    element.id = id;
    this.elementsById.set(id, element);
  }
}

// Ensure the prototype has strictly NO SETTER for tagName (mimics native DOM)
const tagNameDescriptor = Object.getOwnPropertyDescriptor(MockElement.prototype, 'tagName');
assert.strictEqual(
  tagNameDescriptor.set,
  undefined,
  'Test harness validation: MockElement.prototype.tagName must have only a getter'
);

// Global DOM injection before module imports
let mockDoc;
let appRoot;

function setupDomEnvironment() {
  mockDoc = new MockDocument();
  appRoot = mockDoc.createElement('DIV');
  mockDoc.registerElementById('app', appRoot);
  mockDoc.body.appendChild(appRoot);

  globalThis.window = globalThis;
  globalThis.document = mockDoc;
  globalThis.Element = MockElement;
  globalThis.HTMLElement = MockElement;
  globalThis.HTMLCanvasElement = MockHTMLCanvasElement;
}

function cleanupDomEnvironment() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.Element;
  delete globalThis.HTMLElement;
  delete globalThis.HTMLCanvasElement;
}

describe('STORY 30.1.1: Resolve UNCAUGHT_JAVASCRIPT_EXCEPTION (DF-CRASH-01)', () => {
  let mainModule;

  beforeEach(async () => {
    setupDomEnvironment();
    // Cache bust to ensure active entrypoint re-executes clean per test
    mainModule = await import(`../src/main.js?t=${Date.now()}_${Math.random()}`);
  });

  afterEach(() => {
    cleanupDomEnvironment();
  });

  it('verifies that direct mutation of el.tagName produces the DF-CRASH-01 TypeError', () => {
    const testEl = mockDoc.createElement('canvas');

    // Reproduces: TypeError: Cannot set property tagName of #<Element> which has only a getter
    assert.throws(
      () => {
        // Strict mode assignment to getter-only property
        testEl.tagName = 'canvas';
      },
      {
        name: 'TypeError',
        message: /Cannot set property tagName of #<.*> which has only a getter/
      }
    );
  });

  it('mounts into #app without throwing uncaught TypeError when initialized', () => {
    assert.doesNotThrow(() => {
      if (typeof mainModule.init === 'function') {
        mainModule.init('#app');
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount('#app');
      } else if (typeof mainModule.default === 'function') {
        mainModule.default('#app');
      } else if (typeof mainModule.mountApp === 'function') {
        mainModule.mountApp('#app');
      }
    }, 'Entrypoint mount/init execution threw an uncaught exception');

    // Architectural Invariant: Never produce an isolated, unmounted file
    assert.ok(
      appRoot.children.length > 0,
      'Active entrypoint must wire into and populate #app DOM container'
    );
  });

  it('renders canvas component to #app via valid DOM APIs without assigning to read-only tagName', () => {
    if (typeof mainModule.init === 'function') {
      mainModule.init('#app');
    } else if (typeof mainModule.mount === 'function') {
      mainModule.mount('#app');
    } else if (typeof mainModule.mountApp === 'function') {
      mainModule.mountApp('#app');
    }

    const canvas = appRoot.querySelector('CANVAS') || appRoot.querySelector('canvas');
    assert.ok(canvas, 'A canvas element must be created and mounted under #app');
    assert.strictEqual(canvas.tagName, 'CANVAS', 'Canvas element must have valid tagName via createElement');
    assert.strictEqual(canvas instanceof MockHTMLCanvasElement, true, 'Canvas must be a valid HTMLCanvasElement instance');
  });

  it('safely filters out read-only properties (tagName, nodeName) during property reconciliation', () => {
    const targetElement = mockDoc.createElement('div');
    const propsWithReadOnlyKeys = {
      tagName: 'DIV',
      nodeName: 'DIV',
      nodeType: 1,
      id: 'active-game-layer',
      className: 'layer active',
      'data-testid': 'game-surface'
    };

    // If main exposes property assignment helper (e.g. applyProps, setProps, setAttributes)
    const assignPropsFn =
      mainModule.applyProps ||
      mainModule.setProps ||
      mainModule.setAttributes ||
      mainModule.safeSetProperty;

    if (typeof assignPropsFn === 'function') {
      assert.doesNotThrow(() => {
        assignPropsFn(targetElement, propsWithReadOnlyKeys);
      }, 'Property applicator must validate against and skip read-only Element properties');

      assert.strictEqual(targetElement.id, 'active-game-layer');
      assert.strictEqual(targetElement.className, 'layer active');
    } else {
      // If properties are assigned internally via component/vdom descriptors
      const renderComponentFn =
        mainModule.render ||
        mainModule.renderComponent ||
        mainModule.createElement;

      if (typeof renderComponentFn === 'function') {
        assert.doesNotThrow(() => {
          const el = renderComponentFn({
            tagName: 'canvas',
            id: 'engine-canvas',
            width: 800,
            height: 600
          });
          if (el && el !== appRoot) {
            appRoot.appendChild(el);
          }
        }, 'Component renderer must not set read-only properties');
      }
    }
  });

  it('maintains canvas dimensions and attributes during component updates without setter collision', () => {
    if (typeof mainModule.mount === 'function') {
      mainModule.mount('#app');
    } else if (typeof mainModule.init === 'function') {
      mainModule.init('#app');
    }

    // Trigger update cycle if exposed
    const updateFn = mainModule.update || mainModule.render;
    if (typeof updateFn === 'function') {
      assert.doesNotThrow(() => {
        updateFn({
          tagName: 'canvas',
          width: 1024,
          height: 768,
          id: 'updated-canvas'
        });
      }, 'Re-render or update cycle must not assign to el.tagName');
    }

    // Verify canvas is still attached and functional
    const canvas = appRoot.querySelector('CANVAS');
    if (canvas) {
      assert.strictEqual(canvas.tagName, 'CANVAS');
      const ctx = canvas.getContext('2d');
      assert.ok(ctx, 'Canvas 2D context must remain accessible after mount/update');
    }
  });

  it('guarantees no uncaught exception occurs during sequential re-renders on the active container', () => {
    const mountHandler =
      mainModule.mount ||
      mainModule.init ||
      mainModule.mountApp ||
      mainModule.default;

    if (typeof mountHandler === 'function') {
      assert.doesNotThrow(() => {
        // Initial render
        mountHandler('#app');
        // Secondary render/refresh
        mountHandler('#app');
      }, 'Subsequent renders must not throw getter-only assignment exceptions');
    }
  });
});