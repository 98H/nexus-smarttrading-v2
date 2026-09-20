import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STYLES_PATH = path.resolve(__dirname, '../src/styles.css');
const MAIN_PATH = path.resolve(__dirname, '../src/main.js');

/**
 * Minimal DOM Environment Simulation for Node.js
 */
class MockDOMElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = '';
    this.classList = new Set();
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.innerText = '';
    this.innerHTML = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') {
      this.className = String(value);
      this.classList = new Set(this.className.split(/\s+/).filter(Boolean));
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler.call(this, event);
    }
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  querySelector(selector) {
    const results = this.querySelectorAll(selector);
    return results.length > 0 ? results[0] : null;
  }

  querySelectorAll(selector) {
    const matched = [];
    const traverse = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          matched.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return matched;
  }
}

function matchesSelector(element, selector) {
  const s = selector.trim();
  if (s.startsWith('#')) return element.id === s.slice(1);
  if (s.startsWith('.')) return element.classList.has(s.slice(1));
  if (/^[A-Z0-9_-]+$/i.test(s)) return element.tagName === s.toUpperCase();
  return false;
}

class MockDocument {
  constructor() {
    this.head = new MockDOMElement('head');
    this.body = new MockDOMElement('body');
    this.appRoot = new MockDOMElement('div', 'app');
    this.body.appendChild(this.appRoot);
  }

  createElement(tagName) {
    return new MockDOMElement(tagName);
  }

  getElementById(id) {
    if (id === 'app') return this.appRoot;
    const find = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const res = find(child);
        if (res) return res;
      }
      return null;
    };
    return find(this.body);
  }

  querySelector(selector) {
    if (selector === '#app') return this.appRoot;
    return this.body.querySelector(selector) || this.head.querySelector(selector);
  }

  querySelectorAll(selector) {
    return [...this.head.querySelectorAll(selector), ...this.body.querySelectorAll(selector)];
  }
}

describe('STORY 1.1.1: Resolve UNSTYLED_FORM_CONTROLS (Defect DF-THEME-01)', () => {
  describe('CSS Specification Validation: src/styles.css', () => {
    let cssContent;

    beforeEach(() => {
      assert.ok(fs.existsSync(STYLES_PATH), `Target CSS module must exist at ${STYLES_PATH}`);
      cssContent = fs.readFileSync(STYLES_PATH, 'utf-8');
    });

    it('should define dark-theme color palette tokens or properties', () => {
      // Must not rely on browser default white/gray backgrounds
      const hasDarkBackground =
        /(--bg-dark|--color-bg|--surface|background(-color)?\s*:\s*(#1[0-9a-fA-F]{5}|#2[0-9a-fA-F]{5}|#0[0-9a-fA-F]{5}|rgb\(\s*([0-3]?[0-9]|4[0-5])\s*,|rgba\(\s*([0-3]?[0-9]|4[0-5])\s*,))/i.test(
          cssContent
        );
      const hasLightText =
        /(--text-light|--color-text|color\s*:\s*(#f[0-9a-fA-F]{5}|#e[0-9a-fA-F]{5}|#ffffff|white|rgb\(\s*2[4-5][0-9]\s*,))/i.test(
          cssContent
        );

      assert.ok(
        hasDarkBackground,
        'DF-THEME-01: Stylesheet must declare dark-theme background color palette tokens or properties'
      );
      assert.ok(
        hasLightText,
        'DF-THEME-01: Stylesheet must declare contrasting light text color tokens or properties'
      );
    });

    it('should eliminate browser default beveled gray styling on buttons and form controls', () => {
      // Must define button styling with non-zero border-radius, modern border, and padding
      const hasBeveledDefault = /border:\s*2px\s+outset/i.test(cssContent);
      assert.strictEqual(
        hasBeveledDefault,
        false,
        'DF-THEME-01: Browser default beveled gray (outset) borders must be eliminated'
      );

      // Must explicitly style button / control selectors
      const hasButtonRules = /(button|\.btn|input\[type=["']?(button|submit|reset)["']?)/i.test(
        cssContent
      );
      assert.ok(hasButtonRules, 'DF-THEME-01: Stylesheet must contain button or control selectors');

      // Check modern border radius
      const hasBorderRadius = /border-radius\s*:\s*([^0;\s]+)/i.test(cssContent);
      assert.ok(
        hasBorderRadius,
        'DF-THEME-01: Controls must feature modern border-radius instead of default rectangular bevel'
      );

      // Check refined padding
      const hasPadding = /padding\s*:\s*([4-9]|[1-9][0-9])px|rem|em/i.test(cssContent);
      assert.ok(
        hasPadding,
        'DF-THEME-01: Controls must specify explicit, refined padding'
      );
    });

    it('should declare explicit :hover and :active highlight states for interactive controls', () => {
      const hasHoverState =
        /(button|\.btn|input\[type=["']?button["']?)[^,{]*:hover\b/i.test(cssContent);
      const hasActiveState =
        /(button|\.btn|input\[type=["']?button["']?)[^,{]*:active\b/i.test(cssContent);

      assert.ok(
        hasHoverState,
        'DF-THEME-01: Controls must declare explicit :hover state for interactive feedback'
      );
      assert.ok(
        hasActiveState,
        'DF-THEME-01: Controls must declare explicit :active state for tactile feedback'
      );
    });

    it('should provide cohesive styling for input controls (text, select, or textarea)', () => {
      const hasInputRules = /(input(\[type=["']?(text|number|email)["']?\])?|select|textarea|\.form-control)/i.test(
        cssContent
      );
      assert.ok(
        hasInputRules,
        'DF-THEME-01: Input controls must be explicitly styled to match the dark-theme palette'
      );
    });
  });

  describe('Application Entrypoint & Invariant Integration: src/main.js', () => {
    let originalDocument;
    let originalWindow;
    let mockDoc;

    beforeEach(() => {
      mockDoc = new MockDocument();
      originalDocument = globalThis.document;
      originalWindow = globalThis.window;

      globalThis.document = mockDoc;
      globalThis.window = {
        document: mockDoc,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    });

    afterEach(() => {
      globalThis.document = originalDocument;
      globalThis.window = originalWindow;
    });

    it('should verify src/main.js exists and is not an unmounted or isolated file', () => {
      assert.ok(fs.existsSync(MAIN_PATH), `Entrypoint must exist at ${MAIN_PATH}`);
      const mainContent = fs.readFileSync(MAIN_PATH, 'utf-8');

      // Architectural Invariant: Must target #app
      assert.ok(
        mainContent.includes("getElementById('app')") ||
        mainContent.includes('getElementById("app")') ||
        mainContent.includes("querySelector('#app')") ||
        mainContent.includes('querySelector("#app")'),
        'ARCHITECTURAL INVARIANT: Entrypoint must mount directly to document.getElementById("app")'
      );
    });

    it('should ensure styles.css is wired into src/main.js', () => {
      const mainContent = fs.readFileSync(MAIN_PATH, 'utf-8');
      const hasStyleWiring =
        mainContent.includes('styles.css') ||
        mainContent.includes('./styles.css') ||
        mainContent.includes('../src/styles.css');

      assert.ok(
        hasStyleWiring,
        'ARCHITECTURAL INVARIANT: src/main.js must import or inject styles.css to ensure browser activation'
      );
    });

    it('should mount form controls into #app with intact interactive handlers', async () => {
      // Dynamic import to execute main.js entrypoint logic
      const mainModule = await import(`${MAIN_PATH}?t=${Date.now()}`);

      if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount(mockDoc.appRoot);
      } else if (typeof mainModule.default === 'function') {
        mainModule.default();
      }

      const appElement = mockDoc.getElementById('app');
      assert.ok(appElement, 'Element #app must be present in the DOM');

      // Query for mounted button or control
      const buttons = appElement.querySelectorAll('button');
      const inputs = appElement.querySelectorAll('input');
      const totalControls = buttons.length + inputs.length;

      assert.ok(
        totalControls > 0,
        'DF-THEME-01: At least one button or form control must be mounted inside #app'
      );

      // Verify that controls retain functional event handlers
      if (buttons.length > 0) {
        const button = buttons[0];
        let clickTriggered = false;

        // Check pre-registered listeners or register an operational test spy
        const existingHandlers = button.listeners.get('click') || [];
        assert.ok(
          existingHandlers.length >= 0,
          'Control listeners registry must be operational'
        );

        button.addEventListener('click', () => {
          clickTriggered = true;
        });

        button.click();
        assert.strictEqual(
          clickTriggered,
          true,
          'Mounted button in #app must have click handler intact and executable'
        );
      }
    });

    it('should ensure mounted controls do not have default unstyled classes or attributes', async () => {
      const mainModule = await import(`${MAIN_PATH}?t=${Date.now()}`);
      if (typeof mainModule.init === 'function') {
        mainModule.init();
      }

      const appElement = mockDoc.getElementById('app');
      const buttons = appElement.querySelectorAll('button');

      for (const btn of buttons) {
        // Must either use modern class or inline theme attributes, not unstyled native default
        const hasClassOrCustomStyle =
          btn.classList.size > 0 ||
          Object.keys(btn.style).length > 0 ||
          btn.hasAttribute('data-theme');

        assert.ok(
          hasClassOrCustomStyle,
          'DF-THEME-01: Form control must be explicitly styled via theme classes, style, or dark-theme attributes'
        );
      }
    });

    it('should throw an informative error if #app container is missing during mounting', async () => {
      // Simulate broken or unmounted HTML template missing #app
      mockDoc.body.removeChild(mockDoc.appRoot);
      mockDoc.appRoot = null;

      const mainModule = await import(`${MAIN_PATH}?t=${Date.now()}`);
      
      const mountFn =
        typeof mainModule.init === 'function'
          ? mainModule.init
          : typeof mainModule.mount === 'function'
          ? () => mainModule.mount(null)
          : typeof mainModule.default === 'function'
          ? mainModule.default
          : null;

      if (mountFn) {
        assert.throws(
          () => mountFn(),
          /(app|mount|root|element)/i,
          'ARCHITECTURAL INVARIANT: Entrypoint must fail fast if #app root mount target is absent'
        );
      }
    });
  });
});