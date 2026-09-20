import test, { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolve paths to target source modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');
const MAIN_PATH = path.join(SRC_DIR, 'main.js');
const CHART_PATH = path.join(SRC_DIR, 'chart.js');

// Minimal DOM implementation for headless Node.js environment
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
  }
  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  fillText() {}
  measureText() {
    return { width: 0 };
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.attributes = new Map();
    this.eventListeners = new Map();
    this._innerHTML = '';
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
    return child;
  }

  querySelector(selector) {
    if (selector.toLowerCase() === 'canvas') {
      return this.children.find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector.toLowerCase() === 'canvas') {
      return this.children.filter((c) => c.tagName === 'CANVAS');
    }
    return [];
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
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
}

class MockCanvasElement extends MockElement {
  constructor(id = '') {
    super('canvas', id);
    this.width = 800;
    this.height = 600;
  }

  getContext(contextType) {
    if (contextType === '2d') {
      return new MockCanvasRenderingContext2D(this);
    }
    return null;
  }
}

class MockDocument {
  constructor() {
    this.elements = new Map();
    this.eventListeners = new Map();
  }

  createElement(tagName) {
    if (tagName.toLowerCase() === 'canvas') {
      return new MockCanvasElement();
    }
    return new MockElement(tagName);
  }

  getElementById(id) {
    return this.elements.get(id) || null;
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
  }

  reset() {
    this.elements.clear();
    this.eventListeners.clear();
  }
}

describe('STORY 1.1.1: Resolve UNCAUGHT_JAVASCRIPT_EXCEPTION (Defect ID: DF-CRASH-01)', () => {
  let mockDoc;
  let originalDocument;
  let originalWindow;

  before(() => {
    mockDoc = new MockDocument();
  });

  beforeEach(() => {
    mockDoc.reset();
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    globalThis.document = mockDoc;
    globalThis.window = globalThis;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  describe('Acceptance Criterion 1: Zero uncaught syntax exceptions or unexpected tokens ("<<")', () => {
    it('should not contain git conflict markers or rogue "<<" tokens in src/main.js', async () => {
      const mainContent = await fs.readFile(MAIN_PATH, 'utf-8');
      
      // Check for git merge conflict markers
      assert.doesNotMatch(
        mainContent,
        /^<{7}\s.*$/m,
        'Found unresolved merge conflict marker "<<<<<<<" in src/main.js'
      );

      // Check for standalone/malformed "<<" tokens that cause parser failures
      assert.doesNotMatch(
        mainContent,
        /^\s*<<(?!=)/m,
        'Found illegal unexpected token "<<" at line start in src/main.js'
      );
    });

    it('should not contain git conflict markers or rogue "<<" tokens in src/chart.js', async () => {
      const chartContent = await fs.readFile(CHART_PATH, 'utf-8');

      assert.doesNotMatch(
        chartContent,
        /^<{7}\s.*$/m,
        'Found unresolved merge conflict marker "<<<<<<<" in src/chart.js'
      );

      assert.doesNotMatch(
        chartContent,
        /^\s*<<(?!=)/m,
        'Found illegal unexpected token "<<" at line start in src/chart.js'
      );
    });

    it('should evaluate and parse src/chart.js without throwing SyntaxError', async () => {
      try {
        const chartModule = await import(`../src/chart.js?t=${Date.now()}`);
        assert.ok(chartModule, 'src/chart.js must successfully evaluate as an ES module');
      } catch (err) {
        assert.fail(`Failed to load src/chart.js due to exception: ${err.message}`);
      }
    });

    it('should evaluate and parse src/main.js without throwing SyntaxError', async () => {
      try {
        const mainModule = await import(`../src/main.js?t=${Date.now()}`);
        assert.ok(mainModule, 'src/main.js must successfully evaluate as an ES module');
      } catch (err) {
        assert.fail(`Failed to load src/main.js due to exception: ${err.message}`);
      }
    });
  });

  describe('Acceptance Criterion 2 & Entrypoint Testing Invariants: Active Entrypoint & Canvas Mounting', () => {
    it('src/main.js must export mounting functions (mountApp or mount) and initializers', async () => {
      const mainModule = await import(`../src/main.js?t=${Date.now()}`);
      
      const mountFn = mainModule.mountApp || mainModule.mount;
      assert.strictEqual(
        typeof mountFn,
        'function',
        'src/main.js must export a mounting function named "mountApp" or "mount"'
      );
    });

    it('calling the mounting function with a DOM container must mount UI and chart canvas without errors', async () => {
      const mainModule = await import(`../src/main.js?t=${Date.now()}`);
      const mountFn = mainModule.mountApp || mainModule.mount;

      const container = new MockElement('div', 'app');
      mockDoc.elements.set('app', container);

      assert.doesNotThrow(() => {
        mountFn(container);
      }, 'Calling mounting function with DOM container threw an uncaught error');

      // Assert canvas has been created and attached into the container
      const canvas = container.querySelector('canvas');
      assert.ok(canvas, 'Mounting function must initialize and append a <canvas> element into the container');
      assert.strictEqual(canvas.tagName, 'CANVAS', 'Attached element must be a CANVAS tag');

      // Assert chart context can be acquired
      const ctx = canvas.getContext('2d');
      assert.ok(ctx, 'Canvas element within container must support 2d rendering context');
    });

    it('should successfully mount to document.getElementById("app") automatically when DOM is ready', async () => {
      const appContainer = new MockElement('div', 'app');
      mockDoc.elements.set('app', appContainer);

      const mainModule = await import(`../src/main.js?t=${Date.now()}`);
      const mountFn = mainModule.mountApp || mainModule.mount;

      // If main.js wires into active entrypoint and document exists
      if (typeof mainModule.init === 'function') {
        assert.doesNotThrow(() => {
          mainModule.init();
        }, 'Entrypoint init() threw runtime exception');
      } else {
        assert.doesNotThrow(() => {
          mountFn(mockDoc.getElementById('app'));
        }, 'Mounting to document.getElementById("app") threw runtime exception');
      }

      const canvas = appContainer.querySelector('canvas');
      assert.ok(
        canvas,
        'Application must have mounted canvas to document.getElementById("app")'
      );
    });

    it('src/chart.js must export a valid chart initialization or rendering function', async () => {
      const chartModule = await import(`../src/chart.js?t=${Date.now()}`);
      
      const chartInitializer =
        chartModule.initChart ||
        chartModule.renderChart ||
        chartModule.createChart ||
        chartModule.Chart ||
        chartModule.default;

      assert.ok(
        typeof chartInitializer === 'function',
        'src/chart.js must export a chart initialization/rendering function or Chart class'
      );

      // Verify that calling the chart initializer with a canvas does not throw
      const canvas = new MockCanvasElement('test-chart');
      assert.doesNotThrow(() => {
        if (typeof chartInitializer === 'function' && chartInitializer.prototype?.constructor === chartInitializer) {
          try {
            new chartInitializer(canvas);
          } catch {
            // Fallback if not a constructor
            chartInitializer(canvas);
          }
        } else {
          chartInitializer(canvas);
        }
      }, 'Initializing chart with canvas element threw runtime exception');
    });
  });
});