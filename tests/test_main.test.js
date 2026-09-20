import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MAIN_MODULE_PATH = resolve(__dirname, '../src/main.js');

/**
 * Lightweight mock DOM element simulating browser container behavior.
 */
class MockDOMElement {
  constructor(tagName = 'div', id = '') {
try {     this.tagName = tagName.toUpperCase(); } catch (_) {}
    this.id = id;
    this.children = [];
    this._innerHTML = '';
    this.attributes = new Map();
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === '') {
      this.children = [];
    }
  }

  appendChild(child) {
    if (!child) {
      throw new TypeError("Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'.");
    }
    this.children.push(child);
    return child;
  }

  setAttribute(key, value) {
    this.attributes.set(key, String(value));
  }

  getAttribute(key) {
    return this.attributes.get(key) ?? null;
  }

  querySelector(selector) {
    return Array.from(this.children).find((c) => `#${c.id}` === selector || c.tagName.toLowerCase() === selector.toLowerCase()) || null;
  }
}

/**
 * Lightweight mock DOM Document for mounting tests.
 */
class MockDocument {
  constructor() {
    this.elements = new Map();
    this.appContainer = new MockDOMElement('div', 'app');
    this.elements.set('app', this.appContainer);
    this.body = new MockDOMElement('body');
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  createElement(tagName) {
    return new MockDOMElement(tagName);
  }

  addEventListener() {}
  removeEventListener() {}
}

/**
 * Helper to setup browser-like environment on globalThis.
 */
function setupMockBrowserEnvironment() {
  const mockDoc = new MockDocument();
  const mockWin = {
    document: mockDoc,
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };

  globalThis.document = mockDoc;
  globalThis.window = mockWin;

  return {
    mockDoc,
    mockWin,
    cleanup: () => {
      delete globalThis.document;
      delete globalThis.window;
    },
  };
}

test('STORY 4.1.1: Resolve UNCAUGHT_JAVASCRIPT_EXCEPTION (Defect: DF-CRASH-01)', async (t) => {
  await t.test('AC-1: src/main.js contains zero syntax errors or unexpected tokens (e.g. malformed ")")', () => {
    const rawSource = readFileSync(MAIN_MODULE_PATH, 'utf8');

    assert.ok(rawSource.length > 0, 'Target file src/main.js must not be empty');

    // 1. Static AST/Syntax Parse: Detect any syntax errors, particularly malformed token ')'
    let scriptCompilationError = null;
    try {
      new vm.Script(rawSource, { filename: 'src/main.js' });
    } catch (err) {
      scriptCompilationError = err;
    }

    assert.equal(
      scriptCompilationError,
      null,
      `Expected src/main.js to parse without syntax errors, but got: ${scriptCompilationError?.message}`
    );

    // 2. Explicit assertion confirming no syntax error matches the reported defect
    if (scriptCompilationError) {
      assert.doesNotMatch(
        scriptCompilationError.message,
        /Unexpected token '\)'/,
        'DF-CRASH-01: Found malformed token ")" in src/main.js'
      );
    }
  });

  await t.test('AC-1: Evaluating src/main.js module throws no uncaught JavaScript exceptions during execution', async () => {
    const env = setupMockBrowserEnvironment();

    try {
      // Dynamic import with cache buster to force fresh evaluation
      const moduleUrl = new URL(`../src/main.js?test_ac1=${Date.now()}`, import.meta.url).href;
      
      let importError = null;
      try {
        await import(moduleUrl);
      } catch (err) {
        importError = err;
      }

      assert.equal(
        importError,
        null,
        `Evaluation of src/main.js threw an uncaught exception: ${importError?.stack || importError?.message}`
      );
    } finally {
      env.cleanup();
    }
  });

  await t.test('AC-2: Entrypoint cleanly mounts into document.getElementById("app") without runtime crashes', async () => {
    const env = setupMockBrowserEnvironment();

    try {
      const appContainer = env.mockDoc.getElementById('app');
      assert.ok(appContainer, 'document.getElementById("app") must exist in DOM prior to entrypoint execution');

      const moduleUrl = new URL(`../src/main.js?test_ac2=${Date.now()}`, import.meta.url).href;
      const mainModule = await import(moduleUrl);

      // If the module exports an explicit mount/bootstrap function, invoke it; otherwise module execution self-mounts
      if (typeof mainModule.mount === 'function') {
        assert.doesNotThrow(() => {
          mainModule.mount(appContainer);
        }, 'Explicit mount() function must execute without crashing');
      } else if (typeof mainModule.init === 'function') {
        assert.doesNotThrow(() => {
          mainModule.init();
        }, 'Explicit init() function must execute without crashing');
      } else if (typeof mainModule.default === 'function') {
        assert.doesNotThrow(() => {
          mainModule.default();
        }, 'Default exported bootstrap function must execute without crashing');
      }

      // Verify that the entrypoint actually mounted canvas or components into #app
      const hasContent = appContainer.children.length > 0 || appContainer.innerHTML.trim().length > 0;
      assert.equal(
        hasContent,
        true,
        'Entrypoint src/main.js must populate document.getElementById("app") with active canvas or components'
      );
    } finally {
      env.cleanup();
    }
  });

  await t.test('AC-2: Active canvas/components are attached to DOM and root element state is valid', async () => {
    const env = setupMockBrowserEnvironment();

    try {
      const appContainer = env.mockDoc.getElementById('app');
      const moduleUrl = new URL(`../src/main.js?test_invariants=${Date.now()}`, import.meta.url).href;
      const mainModule = await import(moduleUrl);

      if (typeof mainModule.mount === 'function') {
        mainModule.mount(appContainer);
      }

      // Assert that mounted DOM is structurally valid and non-crashing
      assert.ok(
        appContainer.children.length > 0 || appContainer.innerHTML.length > 0,
        'Active container must not remain empty after entrypoint initialization'
      );
    } finally {
      env.cleanup();
    }
  });
});