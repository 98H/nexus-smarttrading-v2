import test from 'node:test';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------
 * Minimal DOM Environment Polyfill for Node.js test runtime
 * ------------------------------------------------------------------ */
class MockDOMTokenList extends Set {
  add(token) {
    super.add(token);
  }
  remove(token) {
    super.delete(token);
  }
  contains(token) {
    return super.has(token);
  }
  toggle(token, force) {
    if (force !== undefined) {
      if (force) {
        this.add(token);
        return true;
      } else {
        this.remove(token);
        return false;
      }
    }
    if (this.contains(token)) {
      this.remove(token);
      return false;
    }
    this.add(token);
    return true;
  }
  toString() {
    return Array.from(this.values()).join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
try {     this.tagName = tagName.toUpperCase(); } catch (_) {}
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.classList = new MockDOMTokenList();
    this.listeners = new Map();
    this._textContent = '';
    this._innerHTML = '';
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
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

  replaceChildren(...newChildren) {
    for (const child of this.children) {
      child.parentElement = null;
    }
    this.children = [];
    for (const child of newChildren) {
      this.appendChild(child);
    }
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      list.filter((fn) => fn !== handler)
    );
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const list = this.listeners.get(event.type) || [];
    for (const fn of list) {
      fn.call(this, event);
    }
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      target: this,
      currentTarget: this,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      }
    });
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];

    const walk = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          matches.push(child);
        }
        walk(child);
      }
    };

    walk(this);
    return matches;
  }
}

function matchesSelector(element, selector) {
  if (selector.startsWith('#')) {
    return element.id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return element.classList.contains(selector.slice(1));
  }
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const [attr, val] = selector.slice(1, -1).split('=');
    if (!val) {
      return element.hasAttribute(attr);
    }
    const cleanVal = val.replace(/^["']|["']$/g, '');
    return element.getAttribute(attr) === cleanVal;
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this.elementsById = new Map();
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElement(id, element) {
    element.id = id;
    this.elementsById.set(id, element);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

/* ------------------------------------------------------------------
 * Test Suite: STORY 38.2.1: Resolve INACTIVE_UI_CONTROLS (DF-CONTROL-01)
 * ------------------------------------------------------------------ */

test.beforeEach(() => {
  // Initialize virtual DOM environment before each test
  const mockDoc = new MockDocument();
  const appContainer = new MockElement('div', 'app');
  mockDoc.registerElement('app', appContainer);
  mockDoc.body.appendChild(appContainer);

  globalThis.document = mockDoc;
  globalThis.window = { document: mockDoc };
  globalThis.HTMLElement = MockElement;
});

test.afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.HTMLElement;
});

test('DF-CONTROL-01: Entrypoint (src/main.js) automatically mounts into document.getElementById("app")', async () => {
  // Dynamically import entrypoint to verify auto-mount behavior on load
  const mainModule = await import(`../src/main.js?t=${Date.now()}`);

  const app = globalThis.document.getElementById('app');
  assert.ok(app, 'App root container must exist in the document');

  // Verify that controls were mounted into #app
  const controlsContainer =
    app.querySelector('.controls') ||
    app.querySelector('[data-testid="controls"]') ||
    app.querySelector('nav');
  assert.ok(
    controlsContainer !== null || app.children.length > 0,
    'Entrypoint src/main.js must mount UI controls directly into #app on initialization'
  );
});

test('DF-CONTROL-01: Interactive controls respond to click events, update state, and re-render DOM', async () => {
  const mainModule = await import(`../src/main.js?t=${Date.now()}`);

  const app = globalThis.document.getElementById('app');
  assert.ok(app, 'App container must be mounted');

  // Find interactive buttons/tabs inside the mounted entrypoint
  const controlButtons = app.querySelectorAll('button, [role="tab"], .control-btn');
  assert.ok(
    controlButtons.length >= 2,
    'Entrypoint must render at least two interactive control buttons/tabs'
  );

  const [firstControl, secondControl] = controlButtons;

  // Retrieve initial state from exported state getter or initial DOM representation
  const initialState = typeof mainModule.getState === 'function'
    ? mainModule.getState()
    : null;

  const initialSecondControlClass = secondControl.classList.contains('active');
  const initialAriaSelected = secondControl.getAttribute('aria-selected');

  assert.notEqual(
    initialAriaSelected,
    'true',
    'Second control button should not be selected initially'
  );
  assert.equal(
    initialSecondControlClass,
    false,
    'Second control button should not have "active" class initially'
  );

  // Trigger click on second control button
  secondControl.click();

  // Acceptance Criteria:
  // 1. Application must update its active state
  if (typeof mainModule.getState === 'function') {
    const updatedState = mainModule.getState();
    assert.notDeepEqual(
      updatedState,
      initialState,
      'Active state must mutate upon clicking an interactive control'
    );
  }

  // 2. Application must re-render the view in the live DOM
  const isNowActive =
    secondControl.classList.contains('active') ||
    secondControl.getAttribute('aria-selected') === 'true' ||
    secondControl.hasAttribute('data-active');

  assert.ok(
    isNowActive,
    'Clicking the control must re-render the DOM to reflect the active state (e.g. class "active" or aria-selected="true")'
  );

  // 3. View content or canvas container must be re-rendered with the selected configuration
  const viewContainer =
    app.querySelector('.view-container') ||
    app.querySelector('.canvas-view') ||
    app.querySelector('[data-testid="active-view"]');

  if (viewContainer) {
    const controlTarget =
      secondControl.getAttribute('data-target') ||
      secondControl.getAttribute('data-tab') ||
      secondControl.textContent;
    assert.ok(
      viewContainer.textContent.includes(controlTarget) ||
      viewContainer.getAttribute('data-config') === controlTarget,
      'View container must re-render with the configuration corresponding to the clicked control'
    );
  }
});

test('DF-CONTROL-01: Sequential interactions consistently update state and re-render DOM without deadlocks', async () => {
  const mainModule = await import(`../src/main.js?t=${Date.now()}`);
  const app = globalThis.document.getElementById('app');
  const controlButtons = app.querySelectorAll('button, [role="tab"], .control-btn');

  assert.ok(controlButtons.length >= 2, 'Controls must be rendered');

  const [btnA, btnB] = controlButtons;

  // Click btnB
  btnB.click();
  const stateAfterB = typeof mainModule.getState === 'function' ? mainModule.getState() : null;
  assert.ok(
    btnB.classList.contains('active') || btnB.getAttribute('aria-selected') === 'true',
    'btnB must be active after being clicked'
  );

  // Click btnA
  btnA.click();
  const stateAfterA = typeof mainModule.getState === 'function' ? mainModule.getState() : null;

  if (stateAfterA && stateAfterB) {
    assert.notDeepEqual(
      stateAfterA,
      stateAfterB,
      'State must transition back when interacting with btnA'
    );
  }

  assert.ok(
    btnA.classList.contains('active') || btnA.getAttribute('aria-selected') === 'true',
    'btnA must become active when clicked'
  );
  assert.ok(
    !btnB.classList.contains('active') && btnB.getAttribute('aria-selected') !== 'true',
    'btnB must be deactivated when btnA is clicked'
  );
});

test('DF-CONTROL-01: Throws or reports a clear error if #app mounting element is missing', async () => {
  // Clear the document to simulate missing #app
  globalThis.document = new MockDocument();

  // If main exports an explicit mount function or mounts automatically on import
  const mainModule = await import(`../src/main.js?t=${Date.now()}`);

  if (typeof mainModule.mount === 'function') {
    assert.throws(
      () => {
        mainModule.mount(null);
      },
      {
        message: /#app|container|mount/i
      },
      'Mount function must throw a descriptive error when target element is not found'
    );
  }
});