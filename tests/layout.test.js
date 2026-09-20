import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT_DIR = process.cwd();
const INDEX_HTML_PATH = path.resolve(ROOT_DIR, 'index.html');
const MAIN_JS_PATH = path.resolve(ROOT_DIR, 'src/main.js');

describe('STORY 1.4.1: Resolve UNSTRUCTURED_UI_LAYOUT (Defect ID: DF-LAYOUT-01)', () => {
  let dom;
  let originalGlobalDocument;
  let originalGlobalWindow;

  beforeEach(() => {
    // Preserve global state
    originalGlobalDocument = globalThis.document;
    originalGlobalWindow = globalThis.window;
  });

  afterEach(() => {
    // Restore global state
    globalThis.document = originalGlobalDocument;
    globalThis.window = originalGlobalWindow;
  });

  /**
   * Helper to initialize JSDOM and polyfill minimal Canvas/DOM APIs
   * before invoking or importing src/main.js
   */
  function setupDOMEnvironment(htmlContent) {
    const virtualDom = new JSDOM(htmlContent, {
      url: 'http://localhost:3000',
      runScripts: 'outside-only',
      resources: 'usable',
    });

    globalThis.window = virtualDom.window;
    globalThis.document = virtualDom.window.document;
    globalThis.HTMLElement = virtualDom.window.HTMLElement;
    globalThis.HTMLCanvasElement = virtualDom.window.HTMLCanvasElement;

    // Polyfill 2D context for chart canvas rendering within main.js
    if (virtualDom.window.HTMLCanvasElement) {
      virtualDom.window.HTMLCanvasElement.prototype.getContext = () => ({
        fillRect: () => {},
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        arc: () => {},
        fill: () => {},
        scale: () => {},
        save: () => {},
        restore: () => {},
      });
    }

    return virtualDom;
  }

  describe('index.html static layout integrity', () => {
    it('should declare a dedicated #app root element and wire src/main.js entrypoint', () => {
      assert.ok(
        fs.existsSync(INDEX_HTML_PATH),
        `index.html must exist at: ${INDEX_HTML_PATH}`
      );

      const htmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
      const staticDom = new JSDOM(htmlContent);
      const { document } = staticDom.window;

      const appRoot = document.getElementById('app');
      assert.ok(appRoot, 'index.html must contain a root element with id="app"');

      // Verify that active entrypoint src/main.js is included as an ES module
      const scriptTags = Array.from(document.querySelectorAll('script'));
      const mainScript = scriptTags.find((script) => {
        const src = script.getAttribute('src') || '';
        return (
          src.includes('src/main.js') ||
          src.includes('/src/main.js') ||
          src === 'main.js'
        );
      });

      assert.ok(
        mainScript,
        'index.html must reference src/main.js directly to avoid unmounted isolated code'
      );
      assert.strictEqual(
        mainScript.getAttribute('type'),
        'module',
        'src/main.js must be loaded as an ES module (type="module")'
      );

      // Verify body does not contain orphaned canvas or raw controls outside #app
      const bodyChildren = Array.from(document.body.children).filter(
        (child) => child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE'
      );
      assert.strictEqual(
        bodyChildren.length,
        1,
        'Only #app should exist as a visible root container in index.html body'
      );
      assert.strictEqual(
        bodyChildren[0].id,
        'app',
        'Visible root container in <body> must be #app'
      );
    });
  });

  describe('src/main.js dynamic mounting & structured UI hierarchy', () => {
    it('should mount header and workspace directly into #app without uncontained siblings', async () => {
      assert.ok(
        fs.existsSync(MAIN_JS_PATH),
        `src/main.js must exist at: ${MAIN_JS_PATH}`
      );

      dom = setupDOMEnvironment('<!DOCTYPE html><html><body><div id="app"></div></body></html>');
      const appRoot = dom.window.document.getElementById('app');

      // Import active entrypoint with cache-busting query to ensure clean module execution
      const cacheBustUrl = `file://${MAIN_JS_PATH}?t=${Date.now()}`;
      const mainModule = await import(cacheBustUrl);

      // If module exports an explicit init/mount function, execute it; otherwise it self-mounts
      if (typeof mainModule.mountApp === 'function') {
        mainModule.mountApp(appRoot);
      } else if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.default === 'function') {
        mainModule.default(appRoot);
      }

      // 1. Acceptance Criteria: Must mount directly into document.getElementById('app')
      assert.ok(
        appRoot.children.length > 0,
        'src/main.js must populate document.getElementById("app")'
      );

      // 2. Acceptance Criteria: Top-level components must be organized as semantic children
      // The top-level children of #app must only be structured structural nodes (header and workspace)
      const topLevelTags = Array.from(appRoot.children).map((el) =>
        el.tagName.toLowerCase()
      );

      const headerElement =
        appRoot.querySelector('header') ||
        appRoot.querySelector('[data-testid="app-header"]') ||
        appRoot.querySelector('.app-header');

      const workspaceContainer =
        appRoot.querySelector('main') ||
        appRoot.querySelector('[data-testid="workspace"]') ||
        appRoot.querySelector('.workspace') ||
        appRoot.querySelector('.workspace-container');

      assert.ok(
        headerElement,
        '#app must contain a dedicated application header (<header>, [data-testid="app-header"], or .app-header)'
      );
      assert.ok(
        workspaceContainer,
        '#app must contain a dedicated workspace container (<main>, [data-testid="workspace"], or .workspace-container)'
      );

      // Ensure root children are ONLY semantic structural containers (header, workspace)
      for (const child of appRoot.children) {
        const isHeader =
          child === headerElement || child.contains(headerElement);
        const isWorkspace =
          child === workspaceContainer || child.contains(workspaceContainer);

        assert.ok(
          isHeader || isWorkspace,
          `Found unstructured top-level sibling <${child.tagName.toLowerCase()} class="${child.className}" id="${child.id}"> directly inside #app. Elements must be organized inside header or workspace.`
        );
      }
    });

    it('should include application header with title, ticker selector, and timeframe controls', async () => {
      dom = setupDOMEnvironment('<!DOCTYPE html><html><body><div id="app"></div></body></html>');
      const appRoot = dom.window.document.getElementById('app');

      const cacheBustUrl = `file://${MAIN_JS_PATH}?t=${Date.now()}`;
      const mainModule = await import(cacheBustUrl);

      if (typeof mainModule.mountApp === 'function') {
        mainModule.mountApp(appRoot);
      } else if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.default === 'function') {
        mainModule.default(appRoot);
      }

      const headerElement =
        appRoot.querySelector('header') ||
        appRoot.querySelector('[data-testid="app-header"]') ||
        appRoot.querySelector('.app-header');

      assert.ok(headerElement, 'Header element must exist');

      // Title validation
      const titleElement =
        headerElement.querySelector('h1') ||
        headerElement.querySelector('[data-testid="app-title"]') ||
        headerElement.querySelector('.title') ||
        headerElement.querySelector('.app-title');

      assert.ok(
        titleElement,
        'Application header must contain a title element (h1, [data-testid="app-title"], or .app-title)'
      );
      assert.ok(
        titleElement.textContent.trim().length > 0,
        'Application title must not be empty'
      );

      // Ticker selector validation
      const tickerSelector =
        headerElement.querySelector('select') ||
        headerElement.querySelector('[data-testid="ticker-selector"]') ||
        headerElement.querySelector('.ticker-selector');

      assert.ok(
        tickerSelector,
        'Application header must contain a ticker selector (select, [data-testid="ticker-selector"], or .ticker-selector)'
      );

      // Timeframe controls validation
      const timeframeControls =
        headerElement.querySelector('[data-testid="timeframe-controls"]') ||
        headerElement.querySelector('.timeframe-controls') ||
        headerElement.querySelector('.timeframes');

      assert.ok(
        timeframeControls,
        'Application header must contain timeframe controls ([data-testid="timeframe-controls"] or .timeframe-controls)'
      );

      const timeframeButtons = timeframeControls.querySelectorAll('button, option');
      assert.ok(
        timeframeButtons.length >= 2,
        'Timeframe controls must offer selectable options/buttons (e.g. 1m, 5m, 1h, 1d)'
      );
    });

    it('should house the chart area and side panels strictly within workspace container', async () => {
      dom = setupDOMEnvironment('<!DOCTYPE html><html><body><div id="app"></div></body></html>');
      const appRoot = dom.window.document.getElementById('app');

      const cacheBustUrl = `file://${MAIN_JS_PATH}?t=${Date.now()}`;
      const mainModule = await import(cacheBustUrl);

      if (typeof mainModule.mountApp === 'function') {
        mainModule.mountApp(appRoot);
      } else if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.default === 'function') {
        mainModule.default(appRoot);
      }

      const workspaceContainer =
        appRoot.querySelector('main') ||
        appRoot.querySelector('[data-testid="workspace"]') ||
        appRoot.querySelector('.workspace') ||
        appRoot.querySelector('.workspace-container');

      assert.ok(workspaceContainer, 'Workspace container must exist');

      // Chart area validation within workspace
      const chartArea =
        workspaceContainer.querySelector('canvas') ||
        workspaceContainer.querySelector('[data-testid="chart-area"]') ||
        workspaceContainer.querySelector('.chart-container') ||
        workspaceContainer.querySelector('.chart-workspace');

      assert.ok(
        chartArea,
        'Workspace must contain the chart area/canvas (<canvas>, [data-testid="chart-area"], or .chart-container)'
      );

      // Verify chart canvas is NOT a loose sibling under #app
      const rootLevelCanvases = Array.from(appRoot.children).filter(
        (child) => child.tagName.toLowerCase() === 'canvas'
      );
      assert.strictEqual(
        rootLevelCanvases.length,
        0,
        'Chart canvas must not be an uncontained sibling at the root of #app'
      );

      // Side panel validation (for orders/tools) within workspace
      const sidePanel =
        workspaceContainer.querySelector('aside') ||
        workspaceContainer.querySelector('[data-testid="side-panel"]') ||
        workspaceContainer.querySelector('[data-testid="orders-panel"]') ||
        workspaceContainer.querySelector('.side-panel') ||
        workspaceContainer.querySelector('.tools-panel');

      assert.ok(
        sidePanel,
        'Workspace must house side panels for orders/tools (<aside>, [data-testid="side-panel"], or .side-panel)'
      );

      // Verify side panel is a descendant of workspace, not header or root
      assert.ok(
        workspaceContainer.contains(sidePanel),
        'Side panel must be contained inside the workspace container'
      );
    });
  });
});