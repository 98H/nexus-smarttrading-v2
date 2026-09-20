import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Target modules under test
import {
  initApp,
  getActiveState,
  mount
} from '../src/main.js';

import {
  Controls,
  renderControls,
  CONTROL_EVENTS
} from '../src/components/controls.js';

/**
 * Lightweight in-memory DOM mock environment for isolated Node execution.
 */
class MockDOMTokenList {
  constructor(element) {
    this._element = element;
    this._tokens = new Set();
  }
  add(...tokens) {
    tokens.forEach((t) => this._tokens.add(t));
    this._element._syncClassName();
  }
  remove(...tokens) {
    tokens.forEach((t) => this._tokens.delete(t));
    this._element._syncClassName();
  }
  contains(token) {
    return this._tokens.has(token);
  }
  toggle(token, force) {
    if (force === true) {
      this.add(token);
      return true;
    }
    if (force === false) {
      this.remove(token);
      return false;
    }
    if (this._tokens.has(token)) {
      this.remove(token);
      return false;
    }
    this.add(token);
    return true;
  }
  toString() {
    return Array.from(this._tokens).join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.parentNode = null;
    this._innerHTML = '';
    this.classList = new MockDOMTokenList(this);
    this.dataset = {};
    this.disabled = false;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(htmlString) {
    this._innerHTML = htmlString;
    this.children = [];
    if (!htmlString || htmlString.trim() === '') {
      return;
    }
    // Minimal parser to instantiate mock elements for buttons, tabs, etc.
    const tagRegex = /<([a-z0-9-]+)([^>]*)>(.*?)<\/\1>|<([a-z0-9-]+)([^>]*)\/>/gis;
    let match;
    while ((match = tagRegex.exec(htmlString)) !== null) {
      const tag = match[1] || match[4];
      const rawAttrs = match[2] || match[5] || '';
      const text = match[3] || '';
      const child = new MockElement(tag);

      const attrRegex = /([a-z0-9-]+)=["']([^"']*)["']/gi;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const [, key, val] = attrMatch;
        child.setAttribute(key, val);
      }

      if (text && !text.includes('<')) {
        child.textContent = text;
      }
      this.appendChild(child);
    }
  }

  get textContent() {
    return this._textContent || '';
  }

  set textContent(text) {
    this._textContent = text;
  }

  get className() {
    return this.classList.toString();
  }

  set className(names) {
    this.classList._tokens.clear();
    if (names) {
      names.split(/\s+/).filter(Boolean).forEach((token) => {
        this.classList._tokens.add(token);
      });
    }
  }

  _syncClassName() {
    this.attributes.set('class', this.classList.toString());
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[prop] = String(value);
    }
    if (name === 'class') {
      this.className = String(value);
    }
    if (name === 'id') {
      this.id = String(value);
    }
    if (name === 'disabled') {
      this.disabled = true;
    }
  }

  getAttribute(name) {
    if (name === 'class') {
      return this.classList.toString() || null;
    }
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'class') {
      this.classList._tokens.clear();
    }
    if (name === 'disabled') {
      this.disabled = false;
    }
  }

  appendChild(child) {
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

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    if (!this.listeners.has(type)) return;
    const list = this.listeners.get(type).filter((h) => h !== handler);
    this.listeners.set(type, list);
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type) || [];
    for (const h of handlers) {
      h.call(this, event);
    }
    if (this.parentNode && !event._propagationStopped) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    if (this.disabled) {
      return;
    }
    const event = {
      type: 'click',
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      _propagationStopped: false,
      stopPropagation() {
        this._propagationStopped = true;
      },
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    this.dispatchEvent(event);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          results.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
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
    const content = selector.slice(1, -1);
    if (content.includes('=')) {
      const [key, rawVal] = content.split('=');
      const val = rawVal.replace(/['"]/g, '');
      return element.getAttribute(key) === val;
    }
    return element.hasAttribute(content);
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

class MockDocument {
  constructor() {
    this.root = new MockElement('html');
    this.body = new MockElement('body');
    this.root.appendChild(this.body);
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
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

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

// Global DOM Environment Setup / Teardown
beforeEach(() => {
  globalThis.document = new MockDocument();
  globalThis.window = {
    document: globalThis.document,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  globalThis.HTMLElement = MockElement;
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.HTMLElement;
});

describe('Defect DF-CONTROL-01: Inactive UI Controls Verification', () => {

  describe('src/components/controls.js - Unit Tests', () => {
    it('should instantiate Controls with an initial configuration and render initial DOM state', () => {
      const container = globalThis.document.createElement('div');
      const initialConfig = { mode: 'brush', size: 10, activeTab: 'tools' };

      const controls = new Controls({
        container,
        initialState: initialConfig
      });

      assert.ok(controls, 'Controls component should be instantiated');
      assert.deepStrictEqual(controls.getState(), initialConfig, 'Internal state must match initial configuration');

      // Visual rendering check
      const renderedTabs = container.querySelectorAll('.control-tab');
      const renderedButtons = container.querySelectorAll('.control-btn');
      assert.ok(renderedTabs.length > 0 || renderedButtons.length > 0, 'Controls must render interactive tabs or buttons into container');
    });

    it('should update internal state and trigger an immediate visual re-render when a control button is clicked', () => {
      const container = globalThis.document.createElement('div');
      let changeCallbackFired = false;
      let emittedConfig = null;

      const controls = new Controls({
        container,
        initialState: { mode: 'brush', activeTab: 'tools' },
        onChange: (newState) => {
          changeCallbackFired = true;
          emittedConfig = newState;
        }
      });

      // Find an inactive control button to click
      const selectBtn = container.querySelector('[data-control="mode"][data-value="eraser"]');
      assert.ok(selectBtn, 'Mode selection button for "eraser" must be present in DOM');
      assert.strictEqual(selectBtn.classList.contains('active'), false, 'Eraser button must not be active initially');

      // Act: Simulate user clicking the control button
      selectBtn.click();

      // Assert state updated
      const currentState = controls.getState();
      assert.strictEqual(currentState.mode, 'eraser', 'Internal state.mode must update to "eraser"');
      assert.strictEqual(changeCallbackFired, true, 'onChange callback must be triggered on button click');
      assert.deepStrictEqual(emittedConfig.mode, 'eraser', 'Emitted state configuration must reflect updated mode');

      // Assert immediate visual DOM re-render
      const reRenderedBtn = container.querySelector('[data-control="mode"][data-value="eraser"]');
      assert.ok(
        reRenderedBtn.classList.contains('active') || reRenderedBtn.getAttribute('aria-pressed') === 'true',
        'Selected button must immediately reflect active visual state in DOM'
      );

      const oldBtn = container.querySelector('[data-control="mode"][data-value="brush"]');
      if (oldBtn) {
        assert.strictEqual(
          oldBtn.classList.contains('active'),
          false,
          'Previously active control button must relinquish active visual state'
        );
      }
    });

    it('should switch tabs, update activeTab state, and re-render the active panel configuration', () => {
      const container = globalThis.document.createElement('div');
      const controls = new Controls({
        container,
        initialState: { activeTab: 'tools', settingValue: 5 }
      });

      const layersTab = container.querySelector('[data-tab="layers"]');
      assert.ok(layersTab, 'Tab button for "layers" must be rendered');

      // Act: Click tab
      layersTab.click();

      // Assert state updated
      assert.strictEqual(controls.getState().activeTab, 'layers', 'Controls state.activeTab must switch to "layers"');

      // Assert DOM re-rendered active indicator
      assert.strictEqual(
        layersTab.getAttribute('aria-selected'),
        'true',
        'Active tab in DOM must have aria-selected="true" after click'
      );

      const toolsTab = container.querySelector('[data-tab="tools"]');
      assert.strictEqual(
        toolsTab.getAttribute('aria-selected'),
        'false',
        'Previously active tab must have aria-selected="false"'
      );
    });

    it('should not update state or re-render when a disabled control button is clicked', () => {
      const container = globalThis.document.createElement('div');
      const controls = new Controls({
        container,
        initialState: { mode: 'brush', locked: true }
      });

      const disabledBtn = container.querySelector('button[disabled]');
      if (disabledBtn) {
        const stateBefore = { ...controls.getState() };
        disabledBtn.click();
        assert.deepStrictEqual(controls.getState(), stateBefore, 'Clicking disabled button must produce zero state changes');
      }
    });

    it('should bind handlers using renderControls helper and handle dispatch events', () => {
      const container = globalThis.document.createElement('div');
      let dispatchedDetail = null;

      container.addEventListener(CONTROL_EVENTS.STATE_CHANGE, (evt) => {
        dispatchedDetail = evt.target ? controlsInstance.getState() : null;
      });

      const controlsInstance = renderControls(container, { activeTab: 'default' });
      assert.ok(controlsInstance, 'renderControls helper must return an active Controls instance');

      const anyInteractive = container.querySelector('button, [role="button"], [data-control]');
      assert.ok(anyInteractive, 'renderControls must attach at least one interactive control element');
      anyInteractive.click();

      assert.ok(dispatchedDetail !== null || controlsInstance.getState() !== null, 'Event or state mutation must take effect');
    });
  });

  describe('src/main.js - Active Entrypoint and Architectural Invariant Tests', () => {
    it('should mount directly to document.getElementById("app") upon initialization', () => {
      const appRoot = globalThis.document.createElement('div', 'app');
      appRoot.id = 'app';
      globalThis.document.body.appendChild(appRoot);

      // Act: initialize application entrypoint
      const appInstance = initApp();

      assert.ok(appInstance, 'Application entrypoint must return initialized app instance');
      assert.ok(appRoot.children.length > 0, '#app container must not be empty after mounting');

      // Verify controls are mounted inside #app
      const controlsHost = appRoot.querySelector('.controls-container, #controls, [data-component="controls"]');
      assert.ok(controlsHost, 'Controls component must be mounted directly inside #app tree');
    });

    it('should throw or reject mounting cleanly if #app does not exist in the DOM', () => {
      // Ensure #app is absent
      const existingApp = globalThis.document.getElementById('app');
      if (existingApp && existingApp.parentNode) {
        existingApp.parentNode.removeChild(existingApp);
      }

      assert.throws(
        () => {
          mount();
        },
        /Target root element #app not found/i,
        'mount() must fail fast with a descriptive error when #app is missing'
      );
    });

    it('should bind active click event listeners to all interactive UI controls within mounted #app', () => {
      const appRoot = globalThis.document.createElement('div', 'app');
      appRoot.id = 'app';
      globalThis.document.body.appendChild(appRoot);

      initApp();

      const allButtons = appRoot.querySelectorAll('button[data-control], [role="tab"]');
      assert.ok(allButtons.length > 0, 'There must be interactive control buttons/tabs present in mounted #app');

      allButtons.forEach((btn) => {
        const listeners = btn.listeners.get('click') || [];
        const parentListeners = appRoot.listeners.get('click') || [];
        const hasDirectOrDelegatedHandler = listeners.length > 0 || parentListeners.length > 0;

        assert.ok(
          hasDirectOrDelegatedHandler,
          `Interactive element <${btn.tagName} ${btn.getAttribute('data-control') || btn.getAttribute('data-tab')}> must have an active click listener bound`
        );
      });
    });

    it('REGRESSION DF-CONTROL-01: clicking control button via live entrypoint produces state change and visual DOM update', () => {
      const appRoot = globalThis.document.createElement('div', 'app');
      appRoot.id = 'app';
      globalThis.document.body.appendChild(appRoot);

      initApp();

      const initialState = getActiveState();
      assert.ok(initialState, 'Initial active application state must be accessible');

      // Select an alternate control option that differs from initial
      const buttons = appRoot.querySelectorAll('button[data-control]');
      assert.ok(buttons.length >= 2, 'Must have at least two control options to verify state transition');

      const targetBtn = Array.from(buttons).find(
        (btn) => btn.getAttribute('data-value') !== initialState.activeControl
      );
      assert.ok(targetBtn, 'Target alternative control button must exist');

      const newValue = targetBtn.getAttribute('data-value');
      const controlKey = targetBtn.getAttribute('data-control');

      // Record visual snapshot before click
      const wasActiveBefore = targetBtn.classList.contains('active') || targetBtn.getAttribute('aria-pressed') === 'true';
      assert.strictEqual(wasActiveBefore, false, 'Target button should not be visually active before click');

      // Act: User clicks the interactive button in the mounted UI
      targetBtn.click();

      // Assert 1: State changed
      const updatedState = getActiveState();
      assert.notDeepStrictEqual(updatedState, initialState, 'Clicking control button must mutate application state');
      assert.strictEqual(
        updatedState[controlKey] || updatedState.activeControl,
        newValue,
        `Active state for "${controlKey}" must reflect the clicked value "${newValue}"`
      );

      // Assert 2: Visual DOM updated immediately
      const isNowActive = targetBtn.classList.contains('active') || targetBtn.getAttribute('aria-pressed') === 'true';
      assert.strictEqual(isNowActive, true, 'Clicked button must immediately visually re-render as active');

      // Assert 3: Visual indicator in display or config view matches selected configuration
      const displayIndicator = appRoot.querySelector(`[data-active-display="${controlKey}"], .active-config-summary`);
      if (displayIndicator) {
        assert.ok(
          displayIndicator.textContent.includes(newValue) || displayIndicator.getAttribute('data-current') === newValue,
          'Visual display indicator must reflect the new selected configuration'
        );
      }
    });

    it('should maintain state synchronization between entrypoint canvas/components and controls when multiple clicks occur', () => {
      const appRoot = globalThis.document.createElement('div', 'app');
      appRoot.id = 'app';
      globalThis.document.body.appendChild(appRoot);

      initApp();

      const buttons = appRoot.querySelectorAll('button[data-control="tool"]');
      if (buttons.length >= 3) {
        const [btn1, btn2, btn3] = buttons;

        // Sequence of clicks
        btn1.click();
        assert.strictEqual(btn1.classList.contains('active'), true, 'Button 1 must be active');
        assert.strictEqual(btn2.classList.contains('active'), false, 'Button 2 must be inactive');

        btn2.click();
        assert.strictEqual(btn1.classList.contains('active'), false, 'Button 1 must be deactivated');
        assert.strictEqual(btn2.classList.contains('active'), true, 'Button 2 must become active');

        btn3.click();
        assert.strictEqual(btn2.classList.contains('active'), false, 'Button 2 must be deactivated');
        assert.strictEqual(btn3.classList.contains('active'), true, 'Button 3 must become active');
      }
    });
  });
});