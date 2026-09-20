import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up a deterministic DOM simulation environment before importing the module
class MockDOMElement {
  constructor(tagName = 'div', id = '', className = '') {
try {     this.tagName = tagName.toUpperCase(); } catch (_) {}
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
      add: (...tokens) => tokens.forEach(t => this.classList._classes.add(t)),
      remove: (...tokens) => tokens.forEach(t => this.classList._classes.delete(t)),
      contains: (token) => this.classList._classes.has(token),
      toggle: (token, force) => {
        if (force !== undefined) {
          force ? this.classList.add(token) : this.classList.remove(token);
          return force;
        }
        const has = this.classList.contains(token);
        has ? this.classList.remove(token) : this.classList.add(token);
        return !has;
      }
    };
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.children = [];
    this.parentNode = null;
    this._innerHTML = '';
    this.textContent = '';
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    // Basic parser to populate mock children for testing dynamic renders
    this.children = [];
    if (typeof val === 'string' && val.includes('<')) {
      const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>(.*?)<\/\1>|<([a-zA-Z0-9-]+)([^>]*)\/>/g;
      let match;
      while ((match = tagRegex.exec(val)) !== null) {
        const tagName = match[1] || match[4];
        const rawAttrs = match[2] || match[5] || '';
        const content = match[3] || '';
        const child = new MockDOMElement(tagName);
        
        const attrRegex = /([a-zA-Z0-9-]+)=["']([^"']*)["']/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
          const [, attrName, attrVal] = attrMatch;
          child.setAttribute(attrName, attrVal);
          if (attrName.startsWith('data-')) {
            const key = attrName.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            child.dataset[key] = attrVal;
          }
        }
        child.textContent = content.replace(/<[^>]*>/g, '');
        this.appendChild(child);
      }
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') {
      this.className = String(value);
      this.classList._classes = new Set(this.className.split(/\s+/).filter(Boolean));
    }
    if (name === 'id') {
      this.id = String(value);
    }
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  removeEventListener(event, callback) {
    if (this.listeners.has(event)) {
      const filtered = this.listeners.get(event).filter(fn => fn !== callback);
      this.listeners.set(event, filtered);
    }
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler.call(this, event);
    }
    if (this.parentNode && !event._propagationStopped) {
      this.parentNode.dispatchEvent(event);
    }
    return true;
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      target: this,
      currentTarget: this,
      preventDefault: () => {},
      stopPropagation: () => { this._propagationStopped = true; }
    });
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  querySelectorAll(selector) {
    const results = [];
    const search = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          results.push(child);
        }
        search(child);
      }
    };
    search(this);
    return results;
  }

  querySelector(selector) {
    const res = this.querySelectorAll(selector);
    return res.length > 0 ? res[0] : null;
  }
}

function matchesSelector(element, selector) {
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    return element.classList.contains(className);
  }
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return element.id === id;
  }
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const attrExpression = selector.slice(1, -1);
    if (attrExpression.includes('=')) {
      const [attr, val] = attrExpression.split('=').map(s => s.replace(/['"]/g, '').trim());
      return element.getAttribute(attr) === val;
    }
    return element.attributes.has(attrExpression);
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

// Global browser environment setup
const mockAppElement = new MockDOMElement('div', 'app');
const mockDocument = {
  getElementById: (id) => (id === 'app' ? mockAppElement : null),
  createElement: (tag) => new MockDOMElement(tag),
  querySelectorAll: (sel) => mockAppElement.querySelectorAll(sel),
  querySelector: (sel) => mockAppElement.querySelector(sel),
  body: new MockDOMElement('body'),
  addEventListener: () => {},
  removeEventListener: () => {}
};
mockDocument.body.appendChild(mockAppElement);

globalThis.document = mockDocument;
globalThis.window = { document: mockDocument };

// Import the module under test
const MainModule = await import('../src/main.js');

describe('STORY 30.3.1: Resolve INACTIVE_UI_CONTROLS (Defect ID: DF-CONTROL-01)', () => {
  let appContainer;

  beforeEach(() => {
    // Reset app container before each test
    mockAppElement.innerHTML = '';
    mockAppElement.children = [];
    mockAppElement.listeners.clear();
    mockAppElement.attributes.clear();
    mockAppElement.classList._classes.clear();
    appContainer = mockAppElement;
  });

  afterEach(() => {
    mockAppElement.innerHTML = '';
  });

  test('AC2: When entrypoint mounts into #app, interactive controls must be rendered with active click event listeners', () => {
    // Act: Initialize/mount the entrypoint
    if (typeof MainModule.mount === 'function') {
      MainModule.mount(appContainer);
    } else if (typeof MainModule.init === 'function') {
      MainModule.init();
    } else if (typeof MainModule.default === 'function') {
      MainModule.default();
    }

    // Verify container mounted correctly
    assert.ok(
      appContainer.children.length > 0 || appContainer.innerHTML.length > 0,
      'Application entrypoint must render elements into document.getElementById("app")'
    );

    // Locate all interactive controls (buttons, tabs, or control elements)
    const controls = appContainer.querySelectorAll('button, [data-control], [role="tab"], .control-btn');
    assert.ok(
      controls.length > 0,
      'Expected interactive controls (buttons/tabs) to be mounted in document.getElementById("app")'
    );

    // Verify every interactive control has at least one click event listener attached
    for (const control of controls) {
      const clickListeners = control.listeners.get('click') || [];
      const parentHasClick = appContainer.listeners.get('click')?.length > 0;
      
      // Control must have its own listener or delegated listener on container
      assert.ok(
        clickListeners.length > 0 || parentHasClick,
        `Interactive control [${control.tagName}#${control.id || control.className}] must have an active click event listener attached.`
      );
    }
  });

  test('AC1 & DF-CONTROL-01: Clicking an interactive control button updates application state', () => {
    // Mount the application
    if (typeof MainModule.mount === 'function') {
      MainModule.mount(appContainer);
    } else if (typeof MainModule.init === 'function') {
      MainModule.init();
    } else if (typeof MainModule.default === 'function') {
      MainModule.default();
    }

    // Inspect initial state if exported, or verify via state accessor
    const getState = MainModule.getState || (() => MainModule.state);
    let initialState = null;
    if (typeof getState === 'function') {
      initialState = structuredClone ? structuredClone(getState()) : JSON.parse(JSON.stringify(getState()));
    }

    // Find control elements
    const controls = appContainer.querySelectorAll('button, [data-control], [role="tab"], .control-btn');
    assert.ok(controls.length >= 2, 'Expected at least two interactive controls to test state transition');

    const targetControl = controls[1]; // Select non-default control
    const targetConfig = targetControl.dataset.control || targetControl.getAttribute('data-value') || targetControl.id || 'control-option-2';
    targetControl.setAttribute('data-control', targetConfig);

    // Act: Trigger user click
    targetControl.click();

    // Assert: State must reflect the clicked control
    if (typeof getState === 'function') {
      const updatedState = getState();
      assert.notDeepStrictEqual(
        updatedState,
        initialState,
        'Application state must update after clicking an interactive control (Defect DF-CONTROL-01: Zero state changes)'
      );
    }
  });

  test('AC1 & DF-CONTROL-01: Clicking an interactive control re-renders view with active configuration visually updated', () => {
    // Mount the application
    if (typeof MainModule.mount === 'function') {
      MainModule.mount(appContainer);
    } else if (typeof MainModule.init === 'function') {
      MainModule.init();
    } else if (typeof MainModule.default === 'function') {
      MainModule.default();
    }

    const controls = appContainer.querySelectorAll('button, [data-control], [role="tab"], .control-btn');
    assert.ok(controls.length >= 2, 'Expected interactive controls to exist');

    const firstControl = controls[0];
    const secondControl = controls[1];

    // Click the first control to set known baseline
    firstControl.click();
    const firstActiveStateDOM = firstControl.classList.contains('active') ||
      firstControl.getAttribute('aria-selected') === 'true' ||
      firstControl.getAttribute('data-active') === 'true';

    // Act: Click the second interactive control
    secondControl.click();

    // Assert DOM updates: Second control must now visually indicate active state
    const secondActiveStateDOM = secondControl.classList.contains('active') ||
      secondControl.getAttribute('aria-selected') === 'true' ||
      secondControl.getAttribute('data-active') === 'true';

    assert.ok(
      secondActiveStateDOM,
      'Clicking control must re-render the view with active styling/attributes on the clicked element (Defect DF-CONTROL-01: Zero visual re-rendering)'
    );

    // Assert DOM updates: First control must have its active indicator removed
    const firstStillActive = firstControl.classList.contains('active') ||
      firstControl.getAttribute('aria-selected') === 'true' ||
      firstControl.getAttribute('data-active') === 'true';

    assert.strictEqual(
      firstStillActive,
      false,
      'Previous active control must be deactivated upon switching active configuration'
    );
  });

  test('AC1: Rapid and sequential control clicks maintain state and visual consistency', () => {
    // Mount the application
    if (typeof MainModule.mount === 'function') {
      MainModule.mount(appContainer);
    } else if (typeof MainModule.init === 'function') {
      MainModule.init();
    } else if (typeof MainModule.default === 'function') {
      MainModule.default();
    }

    const controls = appContainer.querySelectorAll('button, [data-control], [role="tab"], .control-btn');
    assert.ok(controls.length >= 2, 'Expected at least two controls');

    // Rapidly toggle between controls
    controls[0].click();
    controls[1].click();
    controls[0].click();

    const isFirstActive = controls[0].classList.contains('active') ||
      controls[0].getAttribute('aria-selected') === 'true' ||
      controls[0].getAttribute('data-active') === 'true';

    const isSecondActive = controls[1].classList.contains('active') ||
      controls[1].getAttribute('aria-selected') === 'true' ||
      controls[1].getAttribute('data-active') === 'true';

    assert.strictEqual(isFirstActive, true, 'First control must be active after sequence');
    assert.strictEqual(isSecondActive, false, 'Second control must be inactive after sequence');
  });
});