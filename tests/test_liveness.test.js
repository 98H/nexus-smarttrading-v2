import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Test Suite: STORY 28.1.1: Resolve STATIC_APPLICATION
 * Defect ID: DF-LIVENESS-01
 * Target Module: src/main.js
 *
 * Invariant: The application entrypoint must mount to #app and maintain
 * an active, continuous render/tick loop producing observable mutations over time.
 */

describe('DF-LIVENESS-01: Application Liveness and Render Loop', () => {
  let originalWindow;
  let originalDocument;
  let originalRaf;
  let originalCaf;
  let originalPerformance;

  // Mock Environment State
  let currentTime = 0;
  let rafIdCounter = 0;
  let activeRafCallbacks = new Map();
  let appContainer;
  let mockCanvas;
  let mockCanvasContext;
  let renderFrameCount = 0;
  let stateMutationSnapshots = [];

  class MockCanvasContext2D {
    constructor(canvas) {
      this.canvas = canvas;
      this.operations = [];
      this.fillStyle = '#000000';
      this.strokeStyle = '#000000';
    }

    clearRect(x, y, w, h) {
      this.operations.push({ type: 'clearRect', x, y, w, h, time: currentTime });
    }

    fillRect(x, y, w, h) {
      this.operations.push({ type: 'fillRect', x, y, w, h, time: currentTime, fillStyle: this.fillStyle });
    }

    fillText(text, x, y) {
      this.operations.push({ type: 'fillText', text, x, y, time: currentTime });
    }

    strokeRect(x, y, w, h) {
      this.operations.push({ type: 'strokeRect', x, y, w, h, time: currentTime });
    }

    beginPath() {
      this.operations.push({ type: 'beginPath', time: currentTime });
    }

    arc(...args) {
      this.operations.push({ type: 'arc', args, time: currentTime });
    }

    fill() {
      this.operations.push({ type: 'fill', time: currentTime });
    }

    stroke() {
      this.operations.push({ type: 'stroke', time: currentTime });
    }

    getImageData(x, y, w, h) {
      return { data: new Uint8ClampedArray(w * h * 4) };
    }
  }

  class MockElement {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.children = [];
      this.parentElement = null;
      this._textContent = '';
      this._innerHTML = '';
      this.style = {};
      this.attributes = new Map();
      this.dataset = {};

      if (this.tagName === 'CANVAS') {
        this.width = 800;
        this.height = 600;
        this._ctx = new MockCanvasContext2D(this);
      }
    }

    get textContent() {
      return this._textContent;
    }

    set textContent(val) {
      this._textContent = String(val);
      stateMutationSnapshots.push({
        time: currentTime,
        type: 'DOM_TEXT_MUTATION',
        targetId: this.id || this.tagName,
        content: this._textContent
      });
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(val) {
      this._innerHTML = String(val);
      stateMutationSnapshots.push({
        time: currentTime,
        type: 'DOM_HTML_MUTATION',
        targetId: this.id || this.tagName,
        content: this._innerHTML
      });
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        child.parentElement = null;
        this.children.splice(idx, 1);
      }
      return child;
    }

    querySelector(selector) {
      if (selector === 'canvas') {
        return Array.from(this.children).find(c => c.tagName === 'CANVAS') || null;
      }
      return null;
    }

    querySelectorAll(selector) {
      if (selector === 'canvas') {
        return Array.from(this.children).filter(c => c.tagName === 'CANVAS');
      }
      return [];
    }

    getContext(type) {
      if (this.tagName === 'CANVAS' && type === '2d') {
        return this._ctx;
      }
      return null;
    }

    setAttribute(key, value) {
      this.attributes.set(key, String(value));
    }

    getAttribute(key) {
      return this.attributes.get(key) || null;
    }
  }

  // Simulation Clock Runner
  function stepTime(ms, stepInterval = 16.666) {
    const targetTime = currentTime + ms;
    while (currentTime + stepInterval <= targetTime + 0.001) {
      currentTime += stepInterval;
      const callbacks = Array.from(activeRafCallbacks.entries());
      activeRafCallbacks.clear();

      for (const [id, cb] of callbacks) {
        renderFrameCount++;
        cb(currentTime);
      }
    }
  }

  beforeEach(() => {
    // Preserve originals
    originalWindow = globalThis.window;
    originalDocument = globalThis.document;
    originalRaf = globalThis.requestAnimationFrame;
    originalCaf = globalThis.cancelAnimationFrame;
    originalPerformance = globalThis.performance;

    // Reset loop state
    currentTime = 0;
    rafIdCounter = 0;
    activeRafCallbacks.clear();
    renderFrameCount = 0;
    stateMutationSnapshots = [];

    // Root #app container
    appContainer = new MockElement('div', 'app');

    // Document setup
    const elementsById = new Map([['app', appContainer]]);

    globalThis.document = {
      getElementById: (id) => elementsById.get(id) || null,
      createElement: (tagName) => new MockElement(tagName),
      body: new MockElement('body')
    };
    globalThis.document.body.appendChild(appContainer);

    // RAF & Timers setup
    globalThis.requestAnimationFrame = (callback) => {
      const id = ++rafIdCounter;
      activeRafCallbacks.set(id, callback);
      return id;
    };

    globalThis.cancelAnimationFrame = (id) => {
      activeRafCallbacks.delete(id);
    };

    globalThis.performance = {
      now: () => currentTime
    };

    globalThis.window = globalThis;
  });

  afterEach(() => {
    // Teardown globals
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    globalThis.performance = originalPerformance;
  });

  async function loadEntrypoint() {
    // Cache bust so each test receives an unpolluted module execution
    const cacheBuster = `?t=${Date.now()}_${Math.random()}`;
    return await import(`../src/main.js${cacheBuster}`);
  }

  it('mounts into document.getElementById("app") and schedules the initial animation frame', async () => {
    const mainModule = await loadEntrypoint();

    // In case main exports an explicit mount/bootstrap, invoke it if not auto-executed
    if (typeof mainModule.mount === 'function') {
      mainModule.mount(appContainer);
    } else if (typeof mainModule.default === 'function') {
      mainModule.default(appContainer);
    }

    // Verify mounting into #app
    const hasCanvasChild = Array.from(appContainer.children).some(c => c.tagName === 'CANVAS');
    const hasTextContent = appContainer.textContent.trim().length > 0;
    const hasInnerHtml = appContainer.innerHTML.trim().length > 0;
    const hasMountedContent = hasCanvasChild || hasTextContent || hasInnerHtml || appContainer.children.length > 0;

    assert.ok(
      hasMountedContent,
      'Application entrypoint (src/main.js) must mount components or canvas inside document.getElementById("app")'
    );

    // Verify continuous loop initialized (at least one rAF registered immediately on mount)
    assert.ok(
      activeRafCallbacks.size > 0,
      'Application must register an initial requestAnimationFrame loop callback upon mounting'
    );
  });

  it('continuously schedules frames and does not stall after the first frame', async () => {
    const mainModule = await loadEntrypoint();
    if (typeof mainModule.mount === 'function') {
      mainModule.mount(appContainer);
    }

    assert.ok(activeRafCallbacks.size >= 1, 'Loop must start with at least one pending rAF callback');

    // Run 1 frame (~16.6ms)
    stepTime(16.7);
    assert.strictEqual(renderFrameCount, 1, 'Exactly one frame should execute at 16.7ms');

    // Invariant: The loop must re-queue requestAnimationFrame to ensure continuous rendering
    assert.ok(
      activeRafCallbacks.size >= 1,
      'Animation loop must continuously re-register requestAnimationFrame on each tick'
    );

    // Run 5 more frames (~83.3ms)
    stepTime(83.3);
    assert.ok(renderFrameCount >= 5, `Expected continuous frames, but only ${renderFrameCount} frames were executed`);
  });

  it('guarantees continuous frame renders and state mutations over a 2.5-second (2500ms) observation window', async () => {
    const mainModule = await loadEntrypoint();
    if (typeof mainModule.mount === 'function') {
      mainModule.mount(appContainer);
    }

    const canvas = appContainer.querySelector('canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    const initialDrawCount = ctx ? ctx.operations.length : 0;
    const initialDomMutations = stateMutationSnapshots.length;

    // Advance by 2.5 seconds (2500 ms) in standard 60fps increments (~16.666 ms)
    // 2500 ms / 16.666 ms ~= 150 frames
    const observationWindowMs = 2500;
    stepTime(observationWindowMs);

    // Frame execution check: ~150 frames expected over 2.5s
    assert.ok(
      renderFrameCount >= 140,
      `Defect DF-LIVENESS-01: Render loop stalled. Expected >= 140 frames over 2.5s, but received ${renderFrameCount}`
    );

    // Check Canvas mutations or DOM mutations
    const finalDrawCount = ctx ? ctx.operations.length : 0;
    const finalDomMutations = stateMutationSnapshots.length;

    const canvasOperationsDelta = finalDrawCount - initialDrawCount;
    const domMutationsDelta = finalDomMutations - initialDomMutations;

    const hasContinuousLiveness = canvasOperationsDelta >= 140 || domMutationsDelta >= 2;

    assert.ok(
      hasContinuousLiveness,
      `Defect DF-LIVENESS-01: Static Painting detected. Neither canvas draws (${canvasOperationsDelta} operations) ` +
      `nor DOM state mutations (${domMutationsDelta} mutations) progressed over the 2.5-second observation window.`
    );
  });

  it('verifies non-static state progression across distinct intervals (0s, 1.0s, 2.5s)', async () => {
    const mainModule = await loadEntrypoint();
    if (typeof mainModule.mount === 'function') {
      mainModule.mount(appContainer);
    }

    const canvas = appContainer.querySelector('canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    // Snapshot at t = 0s
    stepTime(16.7);
    const snapT0 = {
      textContent: appContainer.textContent,
      innerHTML: appContainer.innerHTML,
      canvasOpsCount: ctx ? ctx.operations.length : 0,
      lastOp: ctx && ctx.operations.length ? ctx.operations[ctx.operations.length - 1] : null
    };

    // Advance to t = 1.0s (step ~983.3ms)
    stepTime(983.3);
    const snapT1 = {
      textContent: appContainer.textContent,
      innerHTML: appContainer.innerHTML,
      canvasOpsCount: ctx ? ctx.operations.length : 0,
      lastOp: ctx && ctx.operations.length ? ctx.operations[ctx.operations.length - 1] : null
    };

    // Advance to t = 2.5s (step ~1500ms)
    stepTime(1500);
    const snapT2 = {
      textContent: appContainer.textContent,
      innerHTML: appContainer.innerHTML,
      canvasOpsCount: ctx ? ctx.operations.length : 0,
      lastOp: ctx && ctx.operations.length ? ctx.operations[ctx.operations.length - 1] : null
    };

    if (ctx) {
      // For Canvas-driven applications: operations must increment continually across intervals
      assert.ok(
        snapT1.canvasOpsCount > snapT0.canvasOpsCount,
        'Canvas must render new frame operations between t = 0s and t = 1.0s'
      );
      assert.ok(
        snapT2.canvasOpsCount > snapT1.canvasOpsCount,
        'Canvas must render new frame operations between t = 1.0s and t = 2.5s'
      );

      // Verify operations are not just identical replays at the exact same timestamp
      if (snapT1.lastOp && snapT2.lastOp) {
        assert.notDeepStrictEqual(
          snapT1.lastOp,
          snapT2.lastOp,
          'Canvas frame operations must reflect dynamic state changes over time'
        );
      }
    } else {
      // For DOM-driven applications: text/markup must mutate across intervals
      const stateMutatedAtT1 = snapT1.textContent !== snapT0.textContent || snapT1.innerHTML !== snapT0.innerHTML;
      const stateMutatedAtT2 = snapT2.textContent !== snapT1.textContent || snapT2.innerHTML !== snapT1.innerHTML;

      assert.ok(
        stateMutatedAtT1 || stateMutatedAtT2,
        'DOM text or markup must mutate across observation windows (0s -> 1.0s -> 2.5s) to avoid static painting'
      );
    }
  });

  it('provides a teardown/stop capability if exported, canceling active rAF callbacks', async () => {
    const mainModule = await loadEntrypoint();
    if (typeof mainModule.mount === 'function') {
      mainModule.mount(appContainer);
    }

    // Advance time slightly to ensure loop is active
    stepTime(50);
    assert.ok(activeRafCallbacks.size > 0, 'Animation loop should be actively running');

    // If an unmount/stop/destroy is provided by main.js, ensure it cancels the animation frame
    const cleanupFn = mainModule.stop || mainModule.unmount || mainModule.destroy;
    if (typeof cleanupFn === 'function') {
      cleanupFn();
      assert.strictEqual(
        activeRafCallbacks.size,
        0,
        'Active requestAnimationFrame callbacks must be cleared when teardown is invoked'
      );

      const framesBefore = renderFrameCount;
      stepTime(100);
      assert.strictEqual(
        renderFrameCount,
        framesBefore,
        'Render loop must not produce further frames after teardown'
      );
    }
  });
});