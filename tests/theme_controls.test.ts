import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve directory paths in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');
const CSS_PATH = path.join(SRC_DIR, 'styles.css');
const MAIN_JS_PATH = path.join(SRC_DIR, 'main.js');

/**
 * Lightweight DOM simulation for headless Node.js environment
 */
class MockDOMElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.className = '';
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.style = {};
    this.listeners = new Map();
    this._innerHTML = '';

    this.classList = {
      _classes: new Set(),
      add: (...classes) => classes.forEach((c) => this.classList._classes.add(c)),
      remove: (...classes) => classes.forEach((c) => this.classList._classes.delete(c)),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c) => {
        if (this.classList._classes.has(c)) {
          this.classList._classes.delete(c);
          return false;
        }
        this.classList._classes.add(c);
        return true;
      },
      toString: () => Array.from(this.classList._classes).join(' ')
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    this._parseHTML(html);
  }

  _parseHTML(html) {
    // Parse top-level/nested tags to mock children
    const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9-]+)([^>]*)\/>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tagName = match[1] || match[4];
      const attrStr = match[2] || match[5] || '';
      const content = match[3] || '';

      const child = new MockDOMElement(tagName);
      const attrRegex = /([a-zA-Z0-9-]+)(?:=["']([^"']*)["'])?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        const name = attrMatch[1];
        const val = attrMatch[2] ?? '';
        child.setAttribute(name, val);
        if (name === 'id') child.id = val;
        if (name === 'class') {
          child.className = val;
          val.split(/\s+/).filter(Boolean).forEach((c) => child.classList.add(c));
        }
      }
      if (content.trim()) {
        child.innerHTML = content;
      }
      this.appendChild(child);
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = value;
    if (name === 'class') {
      this.className = value;
      this.classList._classes.clear();
      value.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);
  }

  querySelectorAll(selector) {
    const results = [];
    const selectors = selector.split(',').map((s) => s.trim().toLowerCase());

    const traverse = (node) => {
      for (const child of node.children) {
        const tag = child.tagName.toLowerCase();
        for (const sel of selectors) {
          if (sel === tag || child.classList.contains(sel.replace('.', ''))) {
            results.push(child);
            break;
          }
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

/**
 * Parses CSS text into an array of rule objects
 */
function parseCssRules(cssText) {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const ruleRegex = /([^{]+)\{([^}]+)\}/g;
  let match;

  while ((match = ruleRegex.exec(clean)) !== null) {
    const selectors = match[1].split(',').map((s) => s.trim());
    const declarationsBlock = match[2].trim();
    const declarations = {};

    declarationsBlock.split(';').forEach((decl) => {
      const colonIdx = decl.indexOf(':');
      if (colonIdx !== -1) {
        const prop = decl.slice(0, colonIdx).trim().toLowerCase();
        const val = decl.slice(colonIdx + 1).trim();
        if (prop && val) {
          declarations[prop] = val;
        }
      }
    });

    for (const selector of selectors) {
      rules.push({ selector, declarations });
    }
  }
  return rules;
}

/**
 * Parses CSS padding shorthand or individual dimensions
 * Returns { vertical: number, horizontal: number } in pixels
 */
function parsePaddingPx(declarations) {
  if (declarations['padding']) {
    const tokens = declarations['padding'].split(/\s+/).map((t) => parseFloat(t));
    if (tokens.length === 1 && !isNaN(tokens[0])) {
      return { vertical: tokens[0], horizontal: tokens[0] };
    }
    if (tokens.length >= 2 && !isNaN(tokens[0]) && !isNaN(tokens[1])) {
      return { vertical: tokens[0], horizontal: tokens[1] };
    }
  }

  const top = parseFloat(declarations['padding-top']) || 0;
  const bottom = parseFloat(declarations['padding-bottom']) || 0;
  const left = parseFloat(declarations['padding-left']) || 0;
  const right = parseFloat(declarations['padding-right']) || 0;

  return {
    vertical: Math.min(top, bottom) || Math.max(top, bottom),
    horizontal: Math.min(left, right) || Math.max(left, right)
  };
}

/**
 * Validates whether a CSS color represents a dark theme value
 */
function isDarkThemeColor(val) {
  if (!val) return false;
  const lower = val.toLowerCase();
  if (lower.includes('var(--') && (lower.includes('dark') || lower.includes('bg') || lower.includes('surface'))) {
    return true;
  }
  const hexMatch = lower.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    let r = 0, g = 0, b = 0;
    if (hex.length === 3 || hex.length === 4) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
    // Relative luminance threshold for dark background (< 128 / 255)
    return (0.299 * r + 0.587 * g + 0.114 * b) < 120;
  }
  const rgbMatch = lower.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 120;
  }
  return false;
}

test('STORY 27.1.1: Resolve UNSTYLED_FORM_CONTROLS (DF-THEME-01)', async (t) => {
  let cssContent = '';

  await t.test('Precondition: styles.css exists and can be loaded', () => {
    assert.ok(fs.existsSync(CSS_PATH), `Expected ${CSS_PATH} to exist.`);
    cssContent = fs.readFileSync(CSS_PATH, 'utf-8');
    assert.ok(cssContent.length > 0, 'src/styles.css should not be empty.');
  });

  await t.test('Acceptance Criteria 1: Form control base dark-theme styling in CSS', () => {
    const rules = parseCssRules(cssContent);

    // Target form controls: button and select
    const targetControls = ['button', 'select'];

    for (const control of targetControls) {
      // Find rules matching the control tag or corresponding control class
      const matchingRules = rules.filter((r) =>
        r.selector === control ||
        r.selector.endsWith(` ${control}`) ||
        r.selector.includes(`${control}.`) ||
        r.selector.includes(`.dark-theme ${control}`)
      );

      assert.ok(
        matchingRules.length > 0,
        `Expected CSS rules defined for '${control}' form control.`
      );

      const mergedDecls = Object.assign({}, ...matchingRules.map((r) => r.declarations));

      // 1. Dark-theme background
      const bgColor = mergedDecls['background-color'] || mergedDecls['background'];
      assert.ok(
        bgColor,
        `Expected '${control}' to define 'background' or 'background-color'.`
      );
      assert.ok(
        isDarkThemeColor(bgColor),
        `Expected '${control}' background color '${bgColor}' to match dark theme palette (luminance < 120 or dark variable).`
      );

      // 2. Padding >= 6px vertical and >= 12px horizontal
      const padding = parsePaddingPx(mergedDecls);
      assert.ok(
        padding.vertical >= 6,
        `Expected '${control}' vertical padding >= 6px, got ${padding.vertical}px.`
      );
      assert.ok(
        padding.horizontal >= 12,
        `Expected '${control}' horizontal padding >= 12px, got ${padding.horizontal}px.`
      );

      // 3. Border radius >= 4px
      const borderRadiusVal = parseFloat(mergedDecls['border-radius'] || '0');
      assert.ok(
        borderRadiusVal >= 4,
        `Expected '${control}' border-radius >= 4px, got ${borderRadiusVal}px.`
      );
    }
  });

  await t.test('Acceptance Criteria 1: Interactive pseudo-class states (:hover, :active) & transitions', () => {
    const rules = parseCssRules(cssContent);
    const targetControls = ['button', 'select'];

    for (const control of targetControls) {
      // Check for :hover state
      const hoverRule = rules.find((r) => r.selector.includes(`${control}:hover`));
      assert.ok(
        hoverRule !== undefined,
        `Expected defined hover state pseudo-class rule for '${control}:hover'.`
      );

      // Check for :active state
      const activeRule = rules.find((r) => r.selector.includes(`${control}:active`));
      assert.ok(
        activeRule !== undefined,
        `Expected defined active state pseudo-class rule for '${control}:active'.`
      );

      // Check for transition definition on base control or hover
      const baseRules = rules.filter((r) =>
        r.selector === control ||
        r.selector.endsWith(` ${control}`) ||
        r.selector.includes(`.dark-theme ${control}`)
      );
      const hasTransition = baseRules.some((r) => Boolean(r.declarations['transition']));
      assert.ok(
        hasTransition,
        `Expected smooth transition property defined on '${control}' for hover/active state changes.`
      );
    }
  });

  await t.test('Acceptance Criteria 2 & Invariant: Entrypoint wiring in src/main.js and mounting to #app', async () => {
    assert.ok(fs.existsSync(MAIN_JS_PATH), `Expected ${MAIN_JS_PATH} to exist.`);
    const mainJsSource = fs.readFileSync(MAIN_JS_PATH, 'utf-8');

    // Invariant check: main.js must reference styles or control wiring
    assert.ok(
      mainJsSource.includes('styles.css') || mainJsSource.includes('app'),
      'src/main.js must wire the stylesheet or configure root element styling.'
    );

    // Setup simulated DOM environment before executing main.js
    const appContainer = new MockDOMElement('div');
    appContainer.id = 'app';

    const documentMock = {
      getElementById: (id) => (id === 'app' ? appContainer : null),
      createElement: (tag) => new MockDOMElement(tag),
      querySelector: (sel) => (sel === '#app' ? appContainer : appContainer.querySelector(sel)),
      querySelectorAll: (sel) => appContainer.querySelectorAll(sel),
      head: new MockDOMElement('head'),
      body: new MockDOMElement('body')
    };

    globalThis.document = documentMock;
    globalThis.window = { document: documentMock };

    // Dynamically import entrypoint to test mounting
    const mainModule = await import(`../src/main.js?t=${Date.now()}`);

    // If main.js exports an explicit mount/init function, invoke it; otherwise it runs on import
    if (typeof mainModule.init === 'function') {
      mainModule.init();
    } else if (typeof mainModule.mount === 'function') {
      mainModule.mount(appContainer);
    } else if (typeof mainModule.default === 'function') {
      mainModule.default();
    }

    // Verify mounting into document.getElementById('app')
    assert.ok(
      appContainer.children.length > 0 || appContainer.innerHTML.length > 0,
      "Application failed to mount content into document.getElementById('app')."
    );

    // Defect Verification: Detected 8 unstyled form controls (buttons, selects)
    const interactiveControls = appContainer.querySelectorAll('button, select');
    assert.ok(
      interactiveControls.length >= 8,
      `Expected at least 8 interactive form controls mounted in #app resolving DF-THEME-01, found ${interactiveControls.length}.`
    );

    // Verify dark-theme control enforcement across mounted controls
    for (let i = 0; i < interactiveControls.length; i++) {
      const control = interactiveControls[i];
      const tag = control.tagName.toLowerCase();
      const hasDarkClass =
        control.classList.contains('dark-control') ||
        control.classList.contains('btn-dark') ||
        control.classList.contains('select-dark') ||
        control.hasAttribute('data-theme');

      const appHasDarkTheme =
        appContainer.classList.contains('dark-theme') ||
        appContainer.getAttribute('data-theme') === 'dark';

      assert.ok(
        hasDarkClass || appHasDarkTheme,
        `Interactive control #${i + 1} (${tag}) must either have a dark-theme class/attribute or be contained within a dark-themed root.`
      );
    }
  });
});