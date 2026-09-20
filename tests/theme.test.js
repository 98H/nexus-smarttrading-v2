import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths to target modules
const STYLES_PATH = resolve(__dirname, '../src/styles.css');
const MAIN_PATH = resolve(__dirname, '../src/main.js');

/**
 * Minimal DOM Mocking environment to support live DOM mounting tests in standard Node.js
 */
class MockClassList {
  constructor() {
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
  get value() {
    return Array.from(this._classes).join(' ');
  }
}

class MockElement {
  constructor(tagName) {
try {     this.tagName = tagName.toUpperCase(); } catch (_) {}
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.classList = new MockClassList();
    this.style = {};
    this.attributes = new Map();
    this.id = '';
    this.type = '';
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
    if (name === 'type') this.type = String(value);
    if (name === 'class') {
      this.classList = new MockClassList();
      String(value).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    event.target = this;
    event.currentTarget = this;
    for (const handler of handlers) {
      handler(event);
    }
    return !event.defaultPrevented;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const checkMatch = (el) => {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();

      // Simple selector matching for tags, ids, classes, attributes
      if (selector === tag) return true;
      if (selector.startsWith('#') && el.id === selector.slice(1)) return true;
      if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) return true;
      if (selector.startsWith('[') && selector.endsWith(']')) {
        const attr = selector.slice(1, -1);
        return el.hasAttribute(attr);
      }
      if (selector === 'button, input' || selector === 'button,input') {
        return tag === 'button' || tag === 'input';
      }
      return false;
    };

    const traverse = (node) => {
      for (const child of node.children) {
        if (checkMatch(child)) results.push(child);
        traverse(child);
      }
    };

    traverse(this);
    return results;
  }
}

class MockDocument {
  constructor() {
    this.root = new MockElement('html');
    this.body = new MockElement('body');
    this.root.appendChild(this.body);
  }

  createElement(tagName) {
    return new MockElement(tagName);
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
    return search(this.root);
  }

  querySelector(selector) {
    return this.root.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.root.querySelectorAll(selector);
  }
}

describe('STORY 2.1.1: Resolve UNSTYLED_FORM_CONTROLS (DF-THEME-01)', () => {
  let originalDocument;
  let originalWindow;
  let appContainer;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    globalThis.document = new MockDocument();
    globalThis.window = globalThis;

    appContainer = globalThis.document.createElement('div');
    appContainer.id = 'app';
    globalThis.document.body.appendChild(appContainer);
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  describe('CSS Theme Token & Visual Feedback Verification (src/styles.css)', () => {
    it('should exist and define dark-theme palette tokens', async () => {
      let cssContent;
      try {
        cssContent = await readFile(STYLES_PATH, 'utf-8');
      } catch (err) {
        assert.fail(`Failed to read stylesheet at ${STYLES_PATH}: ${err.message}`);
      }

      assert.ok(cssContent.length > 0, 'Stylesheet src/styles.css must not be empty');

      // Verify dark theme color tokens (CSS custom properties or dark color declarations)
      const hasDarkThemeTokens =
        /--(?:bg|surface|control|background|text|border|primary)[a-zA-Z0-9-_]*:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/i.test(
          cssContent
        ) ||
        /background(?:-color)?:\s*(?:#0[0-9a-fA-F]{2,5}|#1[0-9a-fA-F]{2,5}|#2[0-9a-fA-F]{2,5}|rgba?\(\s*(?:0|[1-4]?[0-9]|50)\s*,)/i.test(
          cssContent
        );

      assert.ok(
        hasDarkThemeTokens,
        'src/styles.css must define dark-theme palette tokens eliminating default browser gray beveled style'
      );
    });

    it('should eliminate default beveled styling and specify modern border-radius (>= 4px) on form controls', async () => {
      const cssContent = await readFile(STYLES_PATH, 'utf-8');

      // Match rules defining button or input or control selectors
      const controlRuleRegex = /(?:button|input|\.btn|\.control)[^{]*\{([^}]+)\}/gi;
      let match;
      let matchedControlRules = 0;
      let minBorderRadiusFound = Infinity;
      let hasCustomBorder = false;

      while ((match = controlRuleRegex.exec(cssContent)) !== null) {
        const body = match[1];

        // Check border-radius
        const radiusMatch = body.match(/border-radius:\s*([0-9.]+)px/i);
        if (radiusMatch) {
          const radiusVal = parseFloat(radiusMatch[1]);
          if (radiusVal < minBorderRadiusFound) {
            minBorderRadiusFound = radiusVal;
          }
        }

        // Check border reset/styling replacing bevel
        if (
          /border:\s*(?:none|0|1px\s+solid|2px\s+solid|transparent|var\(--[a-zA-Z0-9-_]+\))/i.test(
            body
          ) ||
          /border-(?:color|style):\s*[^;]+/i.test(body)
        ) {
          hasCustomBorder = true;
        }

        matchedControlRules++;
      }

      assert.ok(
        matchedControlRules > 0,
        'src/styles.css must declare rules targeting form controls (button, input, etc.)'
      );
      assert.ok(
        hasCustomBorder,
        'Form controls must override the default browser beveled border with modern borders'
      );
      assert.ok(
        Number.isFinite(minBorderRadiusFound) && minBorderRadiusFound >= 4,
        `Form controls must specify modern border-radius >= 4px, but found: ${minBorderRadiusFound}px`
      );
    });

    it('should specify standardized padding for interactive controls', async () => {
      const cssContent = await readFile(STYLES_PATH, 'utf-8');

      // Match rules for button and input
      const paddingRuleRegex =
        /(?:button|input|\.btn|\.control)[^{]*\{[^}]*padding:\s*([0-9.]+(?:px|rem|em)[^;]*);/gi;
      const matches = Array.from(cssContent.matchAll(paddingRuleRegex));

      assert.ok(
        matches.length > 0,
        'src/styles.css must specify explicit standardized padding for form controls'
      );

      for (const m of matches) {
        const paddingValue = m[1].trim();
        assert.notEqual(
          paddingValue,
          '0',
          'Standardized padding should not be 0 for interactive controls'
        );
      }
    });

    it('should declare :hover and :active pseudo-classes offering visual feedback states', async () => {
      const cssContent = await readFile(STYLES_PATH, 'utf-8');

      // Check for :hover state on controls
      const hoverRegex = /(?:button|input|\.btn|\.control)[^{]*:hover\s*\{([^}]+)\}/i;
      const hoverMatch = cssContent.match(hoverRegex);
      assert.ok(
        hoverMatch !== null,
        'src/styles.css must provide :hover visual feedback state for controls'
      );

      const hoverBody = hoverMatch[1];
      const hasHoverVisualEffect =
        /background(?:-color)?|border(?:-color)?|box-shadow|filter|transform|opacity/i.test(
          hoverBody
        );
      assert.ok(
        hasHoverVisualEffect,
        'The :hover state must provide observable visual feedback (e.g. background, border, filter, or shadow shift)'
      );

      // Check for :active state on controls
      const activeRegex = /(?:button|input|\.btn|\.control)[^{]*:active\s*\{([^}]+)\}/i;
      const activeMatch = cssContent.match(activeRegex);
      assert.ok(
        activeMatch !== null,
        'src/styles.css must provide :active visual feedback state for controls'
      );

      const activeBody = activeMatch[1];
      const hasActiveVisualEffect =
        /background(?:-color)?|border(?:-color)?|box-shadow|filter|transform|opacity/i.test(
          activeBody
        );
      assert.ok(
        hasActiveVisualEffect,
        'The :active state must provide observable visual feedback on press'
      );
    });
  });

  describe('Entrypoint Integration and Mounting Verification (src/main.js)', () => {
    it('should mount into document.getElementById("app") and render interactive controls', async () => {
      // Import the entrypoint module
      let mainModule;
      try {
        // Bust module cache using query parameter to ensure clean mount execution
        mainModule = await import(`${MAIN_PATH}?update=${Date.now()}`);
      } catch (err) {
        assert.fail(`Failed to load application entrypoint src/main.js: ${err.message}`);
      }

      // If entrypoint exports an explicit mount or init function, invoke it
      if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount(appContainer);
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      }

      // Acceptance Criteria: Must mount into document.getElementById('app')
      const targetApp = globalThis.document.getElementById('app');
      assert.ok(targetApp, 'Root #app element must exist in the live DOM');

      // Check that controls are mounted inside #app
      const buttons = targetApp.querySelectorAll('button');
      const inputs = targetApp.querySelectorAll('input');

      const totalControls = buttons.length + inputs.length;
      assert.ok(
        totalControls > 0,
        `Expected active interactive controls (buttons/inputs) mounted into #app, but found ${totalControls}`
      );
    });

    it('should apply dark-theme control tokens/classes to mounted DOM elements', async () => {
      const mainModule = await import(`${MAIN_PATH}?update=${Date.now()}`);
      if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount(appContainer);
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      }

      const targetApp = globalThis.document.getElementById('app');
      const controls = [...targetApp.querySelectorAll('button'), ...targetApp.querySelectorAll('input')];

      assert.ok(controls.length > 0, 'No controls found to inspect for theme application');

      for (const control of controls) {
        const hasThemeClass =
          control.classList.contains('btn') ||
          control.classList.contains('dark-control') ||
          control.classList.contains('form-control') ||
          control.classList.contains('input');

        const hasThemeAttribute =
          control.hasAttribute('data-theme') ||
          targetApp.getAttribute('data-theme') === 'dark' ||
          globalThis.document.body.getAttribute('data-theme') === 'dark';

        const hasInlineThemeStyle =
          Boolean(control.style.backgroundColor) ||
          Boolean(control.style.color) ||
          Boolean(control.style.borderRadius);

        const isThemeWired = hasThemeClass || hasThemeAttribute || hasInlineThemeStyle;

        assert.ok(
          isThemeWired,
          `Mounted <${control.tagName.toLowerCase()}> must be wired with dark-theme classes or attributes`
        );
      }
    });

    it('should wire interactive event listeners into the live DOM without throwing errors', async () => {
      const mainModule = await import(`${MAIN_PATH}?update=${Date.now()}`);
      if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount(appContainer);
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      }

      const targetApp = globalThis.document.getElementById('app');
      const buttons = targetApp.querySelectorAll('button');
      const inputs = targetApp.querySelectorAll('input');

      // Verify button interactive listener
      if (buttons.length > 0) {
        const btn = buttons[0];
        const clickHandlers = btn.listeners.get('click') || [];

        assert.ok(
          clickHandlers.length > 0,
          'Mounted button in live DOM must have interactive click event listeners wired'
        );

        // Dispatch simulated click and verify deterministic execution
        assert.doesNotThrow(() => {
          btn.dispatchEvent({ type: 'click', defaultPrevented: false });
        }, 'Clicking on mounted themed button must execute successfully');
      }

      // Verify input interactive listener if present
      if (inputs.length > 0) {
        const input = inputs[0];
        const hasInputOrChangeHandler =
          (input.listeners.get('input') || []).length > 0 ||
          (input.listeners.get('change') || []).length > 0 ||
          (input.listeners.get('keydown') || []).length > 0;

        assert.ok(
          hasInputOrChangeHandler,
          'Mounted input in live DOM must have input/change event listeners wired'
        );

        assert.doesNotThrow(() => {
          input.dispatchEvent({ type: 'input', defaultPrevented: false });
        }, 'Typing in mounted themed input must execute successfully');
      }
    });

    it('should satisfy architectural invariant: controls must not be rendered as isolated, unmounted nodes', async () => {
      const mainModule = await import(`${MAIN_PATH}?update=${Date.now()}`);
      if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount(appContainer);
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      }

      const targetApp = globalThis.document.getElementById('app');
      const allButtons = targetApp.querySelectorAll('button');

      for (const btn of allButtons) {
        let parent = btn.parentElement;
        let isConnectedToApp = false;

        while (parent) {
          if (parent.id === 'app') {
            isConnectedToApp = true;
            break;
          }
          parent = parent.parentElement;
        }

        assert.ok(
          isConnectedToApp,
          'Interactive control must be mounted in the active document.getElementById("app") hierarchy, not isolated or orphaned'
        );
      }
    });
  });
});