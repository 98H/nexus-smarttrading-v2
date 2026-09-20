/**
 * @file Test Suite for STORY 28.3.1: Resolve INACTIVE_UI_CONTROLS
 * Defect ID: DF-CONTROL-01
 * Target Modules: src/main.js, src/controls.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Lightweight In-Memory DOM Mock for Deterministic Node.js Unit Testing ---

class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...tokens) {
    tokens.forEach((t) => this.classes.add(t));
  }
  remove(...tokens) {
    tokens.forEach((t) => this.classes.delete(t));
  }
  contains(token) {
    return this.classes.has(token);
  }
  toggle(token, force) {
    if (force === true) {
      this.classes.add(token);
      return true;
    }
    if (force === false) {
      this.classes.delete(token);
      return false;
    }
    if (this.classes.has(token)) {
      this.classes.delete(token);
      return false;
    }
    this.classes.add(token);
    return true;
  }
  toString() {
    return Array.from(this.classes).join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.parentNode = null;
    this._innerHTML = '';
    this.textContent = '';
    this.dataset = {};
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    // Clearing child nodes on innerHTML reset
    this.children = [];
  }

  setAttribute(name, value) {
    const strVal = String(value);
    this.attributes.set(name, strVal);
    if (name === 'id') this.id = strVal;
    if (name === 'class') {
      this.classList.classes.clear();
      strVal.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    }
    if (name.startsWith('data-')) {
      const prop = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[prop] = strVal;
    }
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

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);
  }

  removeEventListener(type, callback) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      handlers.filter((fn) => fn !== callback)
    );
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler.call(this, event);
    }
    if (event.bubbles && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    const event = {
      type: 'click',
      target: this,
      currentTarget: this,
      bubbles: true,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
    };
    this.dispatchEvent(event);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  matches(selector) {
    const sel = selector.trim();
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    if (sel.startsWith('[')) {
      const match = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/);
      if (!match) return false;
      const attr = match[1];
      const val = match[2] ?? match[3] ?? match[4];
      if (val === undefined) return this.hasAttribute(attr);
      return this.getAttribute(attr) === val;
    }
    const tagMatch = sel.match(/^([a-zA-Z0-9]+)(\.[a-zA-Z0-9_-]+|\[.*\])?$/);
    if (tagMatch) {
      const tag = tagMatch[1];
      const rest = tagMatch[2];
      if (this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
      if (!rest) return true;
      return this.matches(rest);
    }
    return false;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    for (const child of this.children) {
      if (child.matches(selector)) results.push(child);
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this.registry = new Map();
  }

  createElement(tagName) {
    const el = new MockElement(tagName);
    return el;
  }

  getElementById(id) {
    if (this.registry.has(id)) return this.registry.get(id);
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

  registerElement(id, el) {
    el.id = id;
    this.registry.set(id, el);
    this.body.appendChild(el);
    return el;
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

// Install mock browser environment globally before module execution
const setupMockDOM = () => {
  const doc = new MockDocument();
  global.window = { document: doc };
  global.document = doc;
  return doc;
};

// --- Test Suites ---

describe('STORY 28.3.1: Resolve INACTIVE_UI_CONTROLS (Defect ID: DF-CONTROL-01)', () => {
  let doc;

  beforeEach(() => {
    doc = setupMockDOM();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  describe('src/controls.js: Interactive Control State Changes & Visual Re-Rendering', () => {
    it('should initialize controls, bind click handlers, and reflect active state in the DOM', async () => {
      const { initControls, getControlState } = await import('../src/controls.js');

      const container = doc.createElement('div');
      container.id = 'controls-container';
      doc.body.appendChild(container);

      const tabBtn = doc.createElement('button');
      tabBtn.setAttribute('class', 'tab-btn');
      tabBtn.setAttribute('data-tab', 'layers');
      tabBtn.setAttribute('aria-selected', 'false');
      container.appendChild(tabBtn);

      const actionBtn = doc.createElement('button');
      actionBtn.setAttribute('class', 'control-btn');
      actionBtn.setAttribute('data-control', 'zoom-in');
      container.appendChild(actionBtn);

      initControls(container, { activeTab: 'default', zoomLevel: 1 });

      const initialState = getControlState();
      assert.strictEqual(initialState.activeTab, 'default');
      assert.strictEqual(tabBtn.classList.contains('active'), false);
      assert.strictEqual(tabBtn.getAttribute('aria-selected'), 'false');

      // Execute click on tab control
      tabBtn.click();

      // Assert state updated and visual re-render occurred
      const stateAfterTabClick = getControlState();
      assert.strictEqual(
        stateAfterTabClick.activeTab,
        'layers',
        'Defect DF-CONTROL-01: State must update when tab control is clicked'
      );
      assert.strictEqual(
        tabBtn.classList.contains('active'),
        true,
        'Defect DF-CONTROL-01: Tab button must visually reflect active state in DOM (.active)'
      );
      assert.strictEqual(
        tabBtn.getAttribute('aria-selected'),
        'true',
        'Defect DF-CONTROL-01: Tab button aria-selected must update to "true"'
      );
    });

    it('should trigger state changes and DOM update when action control buttons are clicked', async () => {
      const { initControls, getControlState } = await import('../src/controls.js');

      const container = doc.createElement('div');
      doc.body.appendChild(container);

      const zoomInBtn = doc.createElement('button');
      zoomInBtn.setAttribute('class', 'control-btn');
      zoomInBtn.setAttribute('data-control', 'zoom-in');
      container.appendChild(zoomInBtn);

      const zoomDisplay = doc.createElement('span');
      zoomDisplay.setAttribute('class', 'zoom-level-indicator');
      zoomDisplay.textContent = '100%';
      container.appendChild(zoomDisplay);

      initControls(container, { zoomLevel: 1.0 });

      // Simulate click on zoom-in button
      zoomInBtn.click();

      const updatedState = getControlState();
      assert.ok(
        updatedState.zoomLevel > 1.0,
        'Defect DF-CONTROL-01: Zoom action control button click must update state.zoomLevel'
      );

      // Verify DOM re-render
      const renderedIndicator = container.querySelector('.zoom-level-indicator');
      assert.notStrictEqual(
        renderedIndicator.textContent,
        '100%',
        'Defect DF-CONTROL-01: Visual DOM indicator must re-render after control click'
      );
    });

    it('should toggle previous active states when switching between multiple tabs', async () => {
      const { initControls, getControlState } = await import('../src/controls.js');

      const container = doc.createElement('div');
      doc.body.appendChild(container);

      const tab1 = doc.createElement('button');
      tab1.setAttribute('class', 'tab-btn');
      tab1.setAttribute('data-tab', 'tab-1');
      container.appendChild(tab1);

      const tab2 = doc.createElement('button');
      tab2.setAttribute('class', 'tab-btn');
      tab2.setAttribute('data-tab', 'tab-2');
      container.appendChild(tab2);

      initControls(container);

      // Click tab 1
      tab1.click();
      assert.strictEqual(getControlState().activeTab, 'tab-1');
      assert.strictEqual(tab1.classList.contains('active'), true);
      assert.strictEqual(tab2.classList.contains('active'), false);

      // Click tab 2
      tab2.click();
      assert.strictEqual(getControlState().activeTab, 'tab-2');
      assert.strictEqual(
        tab1.classList.contains('active'),
        false,
        'Previously active tab must have active styling removed'
      );
      assert.strictEqual(
        tab2.classList.contains('active'),
        true,
        'Newly selected tab must have active styling applied'
      );
    });

    it('should render controls dynamically into container and register interactive handlers', async () => {
      const { renderControls, getControlState } = await import('../src/controls.js');

      const container = doc.createElement('div');
      doc.body.appendChild(container);

      renderControls(container, [
        { id: 'btn-reset', type: 'button', label: 'Reset View', action: 'reset' },
        { id: 'btn-pan', type: 'button', label: 'Pan Tool', action: 'pan' },
      ]);

      const resetBtn = container.querySelector('#btn-reset');
      const panBtn = container.querySelector('#btn-pan');

      assert.ok(resetBtn, 'renderControls must render btn-reset into container');
      assert.ok(panBtn, 'renderControls must render btn-pan into container');

      panBtn.click();

      const state = getControlState();
      assert.strictEqual(
        state.activeTool,
        'pan',
        'Clicking rendered tool control button must update activeTool state'
      );
      assert.strictEqual(
        panBtn.classList.contains('active'),
        true,
        'Rendered button must visually re-render with active class'
      );
    });
  });

  describe('src/main.js: Entrypoint Automatic Mounting and UI Control Binding', () => {
    it('should automatically locate #app root element and mount controls during initialization', async () => {
      // Setup the required live root element in the DOM
      const appRoot = doc.registerElement('app', doc.createElement('div'));

      // Dynamic import ensures src/main.js executes in the active mocked browser environment
      const main = await import(`../src/main.js?t=${Date.now()}`);

      // Ensure export or auto-mount executed
      if (typeof main.mount === 'function') {
        main.mount(appRoot);
      }

      // Acceptance Criteria: The application must mount to document.getElementById('app')
      assert.ok(
        appRoot.children.length > 0,
        'ARCHITECTURAL INVARIANT: src/main.js must mount controls into document.getElementById("app")'
      );

      const interactiveButtons = appRoot.querySelectorAll('button');
      assert.ok(
        interactiveButtons.length > 0,
        'Interactive control buttons must be rendered inside document.getElementById("app")'
      );
    });

    it('should bind click event handlers to all interactive controls mounted under #app', async () => {
      const appRoot = doc.registerElement('app', doc.createElement('div'));

      const main = await import(`../src/main.js?t=${Date.now()}`);
      if (typeof main.mount === 'function') {
        main.mount(appRoot);
      }

      const controls = appRoot.querySelectorAll('button.control-btn, button.tab-btn');
      assert.ok(
        controls.length > 0,
        'Expected at least one interactive control button or tab under #app'
      );

      for (const control of controls) {
        // Assert handler presence: DF-CONTROL-01 caused 0 listeners / 0 updates
        const clickHandlers = control.listeners.get('click') || [];
        assert.ok(
          clickHandlers.length > 0,
          `Defect DF-CONTROL-01: Control ${control.getAttribute('data-control') || control.id} must have click event handler bound`
        );
      }
    });

    it('should trigger state updates and DOM re-rendering when clicking interactive controls in live mounted application', async () => {
      const appRoot = doc.registerElement('app', doc.createElement('div'));

      const main = await import(`../src/main.js?t=${Date.now()}`);
      if (typeof main.mount === 'function') {
        main.mount(appRoot);
      }

      const targetControl = appRoot.querySelector('button[data-control], button[data-tab]');
      assert.ok(targetControl, 'Target interactive control element must exist in #app');

      const wasActive = targetControl.classList.contains('active');
      const priorState = typeof main.getState === 'function' ? main.getState() : null;

      // User interacts with control button
      targetControl.click();

      // Verify immediate visual re-render
      const isNowActive = targetControl.classList.contains('active');
      assert.notStrictEqual(
        isNowActive,
        wasActive,
        'Clicking control in mounted app must immediately toggle active visual representation in the DOM'
      );

      // Verify application state update
      if (typeof main.getState === 'function') {
        const nextState = main.getState();
        assert.notDeepEqual(
          nextState,
          priorState,
          'Clicking control must update live application state managed by src/main.js'
        );
      }
    });

    it('should fail deterministically if document.getElementById("app") is missing in the DOM', async () => {
      // Ensure #app does NOT exist in DOM
      doc.registry.delete('app');

      const main = await import(`../src/main.js?t=${Date.now()}`);

      if (typeof main.mount === 'function') {
        assert.throws(
          () => {
            main.mount(null);
          },
          {
            message: /missing|root|#app|container/i,
          },
          'Mounting without root container must fail with clear architectural diagnostic'
        );
      }
    });
  });
});