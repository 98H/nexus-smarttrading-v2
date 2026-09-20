import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const INDEX_HTML_PATH = resolve(PROJECT_ROOT, 'index.html');
const MAIN_JS_PATH = resolve(PROJECT_ROOT, 'src/main.js');

/**
 * Lightweight mock environment for headless browser lifecycle testing.
 * Provides isolated DOM tree, Canvas2D context tracking, and virtual rAF frame progression.
 */
class MockDOMNode {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this._textContent = '';
    this.attributes = new Map();
    this.mutationLog = [];
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    const oldVal = this._textContent;
    this._textContent = String(val);
    this.mutationLog.push({
      timestamp: globalThis.__mockClock?.now() ?? 0,
      property: 'textContent',
      oldValue: oldVal,
      newValue: this._textContent
    });
  }

  appendChild(child) {
    this.children.push(child);
    this.mutationLog.push({
      timestamp: globalThis.__mockClock?.now() ?? 0,
      property: 'children',
      action: 'appendChild',
      childTag: child.tagName
    });
    return child;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.findChild((n) => n.id === id);
    }
    return this.findChild((n) => n.tagName.toLowerCase() === selector.toLowerCase());
  }

  querySelectorAll(selector) {
    const results = [];
    this.walkChildren((n) => {
      if (selector.startsWith('#') && n.id === selector.slice(1)) results.push(n);
      else if (n.tagName.toLowerCase() === selector.toLowerCase()) results.push(n);
    });
    return results;
  }

  findChild(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.findChild(predicate);
      if (nested) return nested;
    }
    return null;
  }

  walkChildren(fn) {
    for (const child of this.children) {
      fn(child);
      child.walkChildren(fn);
    }
  }
}

class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawCalls = [];
  }

  _recordDraw(method, args) {
    this.drawCalls.push({
      time: globalThis.__mockClock?.now() ?? 0,
      method,
      args: [...args]
    });
  }

  clearRect(x, y, w, h) { this._recordDraw('clearRect', [x, y, w, h]); }
  fillRect(x, y, w, h) { this._recordDraw('fillRect', [x, y, w, h]); }
  strokeRect(x, y, w, h) { this._recordDraw('strokeRect', [x, y, w, h]); }
  fillText(text, x, y) { this._recordDraw('fillText', [text, x, y]); }
  strokeText(text, x, y) { this._recordDraw('strokeText', [text, x, y]); }
  drawImage(...args) { this._recordDraw('drawImage', args); }
  beginPath() { this._recordDraw('beginPath', []); }
  arc(...args) { this._recordDraw('arc', args); }
  fill() { this._recordDraw('fill', []); }
  stroke() { this._recordDraw('stroke', []); }
}

class MockCanvasElement extends MockDOMNode {
  constructor(id = '') {
    super('canvas', id);
    this.width = 800;
    this.height = 600;
    this.context = new MockCanvasRenderingContext2D(this);
  }

  getContext(type) {
    if (type === '2d') return this.context;
    return null;
  }
}

class VirtualClockAndScheduler {
  constructor() {
    this.currentTime = 0;
    this.rafQueue = new Map();
    this.rafIdCounter = 1;
    this.executedFrames = 0;
  }

  now() {
    return this.currentTime;
  }

  requestAnimationFrame(cb) {
    const id = this.rafIdCounter++;
    this.rafQueue.set(id, cb);
    return id;
  }

  cancelAnimationFrame(id) {
    this.rafQueue.delete(id);
  }

  advanceBy(durationMs, frameDeltaMs = 16.666667) {
    const targetTime = this.currentTime + durationMs;
    while (this.currentTime + frameDeltaMs <= targetTime) {
      this.currentTime += frameDeltaMs;
      const currentQueue = Array.from(this.rafQueue.entries());
      this.rafQueue.clear();

      for (const [, callback] of currentQueue) {
        callback(this.currentTime);
        this.executedFrames++;
      }
    }
  }
}

/**
 * Setup and teardown harness for browser environment isolation
 */
function setupTestDOM() {
  const clock = new VirtualClockAndScheduler();
  const appContainer = new MockDOMNode('div', 'app');

  const elementsById = new Map([['app', appContainer]]);

  const mockDocument = {
    getElementById: (id) => elementsById.get(id) || null,
    createElement: (tag) => {
      if (tag.toLowerCase() === 'canvas') return new MockCanvasElement();
      return new MockDOMNode(tag);
    },
    body: new MockDOMNode('body')
  };
  mockDocument.body.appendChild(appContainer);

  const originalGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    __mockClock: globalThis.__mockClock
  };

  globalThis.window = globalThis;
  globalThis.document = mockDocument;
  globalThis.__mockClock = clock;
  globalThis.requestAnimationFrame = (cb) => clock.requestAnimationFrame(cb);
  globalThis.cancelAnimationFrame = (id) => clock.cancelAnimationFrame(id);

  return {
    clock,
    appContainer,
    cleanup: () => {
      globalThis.window = originalGlobals.window;
      globalThis.document = originalGlobals.document;
      globalThis.requestAnimationFrame = originalGlobals.requestAnimationFrame;
      globalThis.cancelAnimationFrame = originalGlobals.cancelAnimationFrame;
      delete globalThis.__mockClock;
    }
  };
}

test('STORY 38.1.1: Resolve STATIC_APPLICATION (DF-LIVENESS-01)', async (t) => {

  await t.test('index.html: contains active mounting container #app and loads src/main.js entrypoint', () => {
    assert.ok(existsSync(INDEX_HTML_PATH), `Expected index.html to exist at ${INDEX_HTML_PATH}`);
    const htmlContent = readFileSync(INDEX_HTML_PATH, 'utf-8');

    // Acceptance Criteria: Document must have mounting element id="app"
    const hasAppElement = /<[a-z]+[^>]*id=["']app["'][^>]*>/i.test(htmlContent);
    assert.ok(
      hasAppElement,
      'index.html must declare an element with id="app" to serve as the mounting point'
    );

    // Architectural Invariant: Wire into active entrypoint src/main.js
    const hasMainScript = /<script[^>]+src=["'][^"']*src\/main\.js["'][^>]*>/i.test(htmlContent) ||
                          /<script[^>]+type=["']module["'][^>]+src=["'][^"']*main\.js["'][^>]*>/i.test(htmlContent);
    assert.ok(
      hasMainScript,
      'index.html must include a script tag wiring directly to the active entrypoint src/main.js'
    );
  });

  await t.test('src/main.js: mounts into document.getElementById("app") upon initialization', async () => {
    const env = setupTestDOM();
    try {
      assert.ok(existsSync(MAIN_JS_PATH), `Entrypoint src/main.js must exist at ${MAIN_JS_PATH}`);

      // Bust cache to simulate clean page load
      const mainModule = await import(`${MAIN_JS_PATH}?t=${Date.now()}`);

      // Support direct execution on import or exported init/mount lifecycles
      if (typeof mainModule.init === 'function') {
        await mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        await mainModule.mount();
      } else if (typeof mainModule.default === 'function') {
        await mainModule.default();
      }

      const appNode = globalThis.document.getElementById('app');
      assert.ok(appNode, 'Target #app must be resolvable from document');

      const isPopulated = appNode.children.length > 0 || appNode.textContent.trim().length > 0;
      assert.ok(
        isPopulated,
        'Application must mount active components (e.g. canvas or animated nodes) directly into document.getElementById("app")'
      );
    } finally {
      env.cleanup();
    }
  });

  await t.test('DF-LIVENESS-01: Application continuously renders frames and mutates state over 2.5-second observation window', async () => {
    const env = setupTestDOM();
    const { clock, appContainer } = env;

    try {
      const mainModule = await import(`${MAIN_JS_PATH}?t=${Date.now()}`);

      if (typeof mainModule.init === 'function') {
        await mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        await mainModule.mount();
      } else if (typeof mainModule.default === 'function') {
        await mainModule.default();
      }

      // Initial state capture at t = 0s
      assert.ok(
        clock.rafQueue.size > 0,
        'Entrypoint must schedule an active animation loop via requestAnimationFrame on mount'
      );

      const canvasElements = appContainer.querySelectorAll('canvas');
      const hasCanvas = canvasElements.length > 0;
      const initialText = appContainer.textContent;

      // Advance observation window over 2.5 seconds (2500ms) at standard 60 FPS (~16.6ms per frame)
      const OBSERVATION_WINDOW_MS = 2500;
      const FRAME_DELTA_MS = 16.666667;
      const EXPECTED_MIN_FRAMES = 120; // 2.5s at 60 FPS yields ~150 frames, allow reasonable threshold

      let intermediateMutationsCount = 0;
      const checkpoints = [500, 1000, 1500, 2000, 2500];
      let lastTime = 0;

      for (const checkpoint of checkpoints) {
        const step = checkpoint - lastTime;
        clock.advanceBy(step, FRAME_DELTA_MS);
        lastTime = checkpoint;

        // Check for continuous liveness during each segment of the 2.5s window
        if (hasCanvas) {
          const activeContext = canvasElements[0].getContext('2d');
          const recentCalls = activeContext.drawCalls.filter(
            (call) => call.time > checkpoint - step && call.time <= checkpoint
          );
          if (recentCalls.length > 0) {
            intermediateMutationsCount++;
          }
        } else {
          // Check DOM text mutations
          const recentTextMutations = appContainer.mutationLog.filter(
            (log) => log.timestamp > checkpoint - step && log.timestamp <= checkpoint
          );
          if (recentTextMutations.length > 0 || appContainer.textContent !== initialText) {
            intermediateMutationsCount++;
          }
        }

        // Loop must continue to queue frames, not stall midway
        assert.ok(
          clock.rafQueue.size > 0,
          `Animation loop halted prematurely before reaching 2.5s (halted at ${checkpoint}ms)`
        );
      }

      // Total rendered frames over 2.5s
      assert.ok(
        clock.executedFrames >= EXPECTED_MIN_FRAMES,
        `Expected at least ${EXPECTED_MIN_FRAMES} frames rendered across 2.5s, but only executed ${clock.executedFrames} frames`
      );

      // Must verify continuous state changes occurred (not a static painting)
      assert.ok(
        intermediateMutationsCount >= 3,
        `Application appeared static: state mutations detected in only ${intermediateMutationsCount} of ${checkpoints.length} observation checkpoints over 2.5s`
      );

      if (hasCanvas) {
        const activeContext = canvasElements[0].getContext('2d');
        assert.ok(
          activeContext.drawCalls.length >= EXPECTED_MIN_FRAMES,
          `Canvas 2D context received only ${activeContext.drawCalls.length} draw calls over 2.5s window`
        );
      }
    } finally {
      env.cleanup();
    }
  });

  await t.test('Architectural Invariant: entrypoint does not isolate render loop from active canvas', async () => {
    const env = setupTestDOM();
    const { clock, appContainer } = env;

    try {
      const mainModule = await import(`${MAIN_JS_PATH}?t=${Date.now()}`);
      if (typeof mainModule.init === 'function') await mainModule.init();

      clock.advanceBy(200, 16.666667);

      const canvasElements = appContainer.querySelectorAll('canvas');
      if (canvasElements.length > 0) {
        const ctx = canvasElements[0].getContext('2d');
        // Render calls must be linked to the canvas mounted in #app
        assert.ok(
          ctx.drawCalls.length > 0,
          'Active canvas element mounted in document.getElementById("app") must receive render calls from main.js'
        );
      } else {
        // If DOM-based, child nodes or text in #app must be active
        assert.ok(
          appContainer.mutationLog.length > 0,
          'DOM mutations must occur on elements wired within document.getElementById("app")'
        );
      }
    } finally {
      env.cleanup();
    }
  });

});