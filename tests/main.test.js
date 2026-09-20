import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Relative paths to target source modules
const MAIN_PATH = resolve(__dirname, '../src/main.js');
const CHART_PATH = resolve(__dirname, '../src/chart.js');

/**
 * Minimal DOM fixture to simulate the browser environment for testing
 * mounting and chart initialization without introducing third-party dependencies.
 */
function setupDomFixture() {
  const listeners = new Map();

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.innerHTML = '';
      this.id = '';
      this.attributes = new Map();
      this.style = {};
    }

    appendChild(child) {
      this.children.push(child);
      return child;
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    getAttribute(name) {
      return this.attributes.get(name) || null;
    }

    getContext(contextType) {
      if (this.tagName === 'CANVAS') {
        return {
          fillRect: () => {},
          clearRect: () => {},
          getImageData: (x, y, w, h) => ({ data: new Array(w * h * 4) }),
          putImageData: () => {},
          createImageData: () => [],
          setTransform: () => {},
          drawImage: () => {},
          save: () => {},
          fillText: () => {},
          restore: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          stroke: () => {},
          strokeRect: () => {},
          strokeText: () => {},
          arc: () => {},
          fill: () => {},
          measureText: () => ({ width: 0 }),
          transform: () => {},
          rect: () => {},
          clip: () => {},
        };
      }
      return null;
    }
  }

  const appContainer = new MockElement('div');
  appContainer.id = 'app';

  const mockDocument = {
    readyState: 'complete',
    getElementById(id) {
      if (id === 'app') {
        return appContainer;
      }
      return null;
    },
    createElement(tagName) {
      return new MockElement(tagName);
    },
    addEventListener(event, callback) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(callback);
    },
    removeEventListener(event, callback) {
      if (listeners.has(event)) {
        const list = listeners.get(event).filter((cb) => cb !== callback);
        listeners.set(event, list);
      }
    },
  };

  const mockWindow = {
    document: mockDocument,
    addEventListener: mockDocument.addEventListener,
    removeEventListener: mockDocument.removeEventListener,
  };

  globalThis.document = mockDocument;
  globalThis.window = mockWindow;

  return {
    appContainer,
    cleanup: () => {
      delete globalThis.document;
      delete globalThis.window;
    },
  };
}

test('STORY 2.1.1: Resolve UNCAUGHT_JAVASCRIPT_EXCEPTION [DF-CRASH-01]', async (t) => {
  await t.test('Defect DF-CRASH-01 Invariant: No git conflict markers or stray << tokens in source files', async () => {
    const filesToCheck = [
      { name: 'src/main.js', path: MAIN_PATH },
      { name: 'src/chart.js', path: CHART_PATH },
    ];

    const conflictPattern = /^(<<<<<<<|=======|>>>>>>>|<<(?![<=]))/m;

    for (const file of filesToCheck) {
      const content = await readFile(file.path, 'utf8');
      const match = content.match(conflictPattern);
      assert.strictEqual(
        match,
        null,
        `File ${file.name} contains invalid merge conflict or stray token: '${match?.[0]}'`
      );
    }
  });

  await t.test('Acceptance Criteria 1: Target modules import cleanly without syntax or parsing exceptions', async () => {
    let mainModule;
    let chartModule;

    try {
      mainModule = await import(`../src/main.js?cacheBust=${Date.now()}`);
    } catch (error) {
      assert.fail(`Failed to load src/main.js due to uncaught exception: ${error.message}`);
    }

    try {
      chartModule = await import(`../src/chart.js?cacheBust=${Date.now()}`);
    } catch (error) {
      assert.fail(`Failed to load src/chart.js due to uncaught exception: ${error.message}`);
    }

    assert.ok(mainModule, 'src/main.js must load and export a module namespace');
    assert.ok(chartModule, 'src/chart.js must load and export a module namespace');
  });

  await t.test('Entrypoint Testing Invariant: src/main.js exports active mounting functions and initializers', async () => {
    const mainModule = await import(`../src/main.js?cacheBust=${Date.now()}`);

    const mountFn = mainModule.mountApp || mainModule.mount;
    assert.strictEqual(
      typeof mountFn,
      'function',
      'src/main.js must export a mounting function (mountApp or mount)'
    );
  });

  await t.test('Chart Module Invariant: src/chart.js exports chart initializer or component class', async () => {
    const chartModule = await import(`../src/chart.js?cacheBust=${Date.now()}`);

    const ChartComponent = chartModule.Chart || chartModule.initChart || chartModule.default;
    assert.ok(
      typeof ChartComponent === 'function',
      'src/chart.js must export a Chart class, initChart function, or default component'
    );
  });

  await t.test('Acceptance Criteria 2: Cleanly mounts to document.getElementById("app") and initializes chart component without runtime crashes', async () => {
    const { appContainer, cleanup } = setupDomFixture();

    try {
      const mainModule = await import(`../src/main.js?cacheBust=${Date.now()}`);
      const mountFn = mainModule.mountApp || mainModule.mount;

      assert.doesNotThrow(() => {
        mountFn(appContainer);
      }, 'Calling the entrypoint mount function must not throw uncaught runtime exceptions');

      assert.ok(
        appContainer.children.length > 0,
        'DOM container (#app) must contain mounted UI elements after mountApp executes'
      );

      const hasCanvasOrChartElement = appContainer.children.some(
        (child) =>
          child.tagName === 'CANVAS' ||
          child.getAttribute('data-component') === 'chart' ||
          child.children.some((grandchild) => grandchild.tagName === 'CANVAS')
      );

      assert.strictEqual(
        hasCanvasOrChartElement,
        true,
        'Application must successfully instantiate and attach the chart component inside the root container'
      );
    } finally {
      cleanup();
    }
  });
});