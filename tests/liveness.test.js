import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Architectural Invariant & Liveness Harness for DF-LIVENESS-01
// ---------------------------------------------------------------------------

class MockCanvasContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawCalls = [];
    this.stateChanges = [];
    this._fillStyle = '#000000';
  }

  get fillStyle() {
    return this._fillStyle;
  }

  set fillStyle(val) {
    this._fillStyle = val;
    this.stateChanges.push({ type: 'fillStyle', value: val, time: globalThis.performance.now() });
  }

  clearRect(x, y, w, h) {
    this.drawCalls.push({ method: 'clearRect', args: [x, y, w, h], time: globalThis.performance.now() });
  }

  fillRect(x, y, w, h) {
    this.drawCalls.push({ method: 'fillRect', args: [x, y, w, h], time: globalThis.performance.now() });
  }

  drawImage(...args) {
    this.drawCalls.push({ method: 'drawImage', args, time: globalThis.performance.now() });
  }

  beginPath() {
    this.drawCalls.push({ method: 'beginPath', args: [], time: globalThis.performance.now() });
  }

  stroke() {
    this.drawCalls.push({ method: 'stroke', args: [], time: globalThis.performance.now() });
  }

  fill() {
    this.drawCalls.push({ method: 'fill', args: [], time: globalThis.performance.now() });
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this._innerHTML = '';
    this._textContent = '';
    this.mutations = [];

    if (this.tagName === 'CANVAS') {
      this.width = 800;
      this.height = 600;
      this._ctx = new MockCanvasContext2D(this);
    }
  }

  getContext(type) {
    if (this.tagName === 'CANVAS' && type === '2d') {
      return this._ctx;
    }
    return null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    this.mutations.push({ type: 'appendChild', child, time: globalThis.performance.now() });
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
      this.mutations.push({ type: 'removeChild', child, time: globalThis.performance.now() });
    }
    return child;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    this.mutations.push({ type: 'innerHTML', value: val, time: globalThis.performance.now() });
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = val;
    this.mutations.push({ type: 'textContent', value: val, time: globalThis.performance.now() });
  }
}

class VirtualTimeScheduler {
  constructor() {
    this.currentTime = 0;
    this.nextRafId = 1;
    this.rafCallbacks = new Map();
    this.timerId = 1;
    this.intervalCallbacks = new Map();
  }

  now() {
    return this.currentTime;
  }

  requestAnimationFrame(cb) {
    const id = this.nextRafId++;
    this.rafCallbacks.set(id, cb);
    return id;
  }

  cancelAnimationFrame(id) {
    this.rafCallbacks.delete(id);
  }

  setInterval(cb, delay) {
    const id = this.timerId++;
    this.intervalCallbacks.set(id, { cb, delay, nextRun: this.currentTime + delay });
    return id;
  }

  clearInterval(id) {
    this.intervalCallbacks.delete(id);
  }

  advance(ms, stepMs = 16.67) {
    const targetTime = this.currentTime + ms;
    while (this.currentTime < targetTime) {
      const nextStep = Math.min(stepMs, targetTime - this.currentTime);
      this.currentTime += nextStep;

      // Flush requestAnimationFrame queue
      const currentRafs = Array.from(this.rafCallbacks.entries());
      this.rafCallbacks.clear();
      for (const [_, cb] of currentRafs) {
        cb(this.currentTime);
      }

      // Flush setInterval triggers
      for (const [_, item] of this.intervalCallbacks.entries()) {
        if (this.currentTime >= item.nextRun) {
          item.cb();
          item.nextRun = this.currentTime + item.delay;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test Suite: STORY 30.2.1: Resolve STATIC_APPLICATION (DF-LIVENESS-01)
// ---------------------------------------------------------------------------

describe('STORY 30.2.1: Resolve STATIC_APPLICATION (DF-LIVENESS-01)', () => {
  let scheduler;
  let appRoot;
  let originalGlobals;

  beforeEach(() => {
    scheduler = new VirtualTimeScheduler();
    appRoot = new MockElement('div', 'app');

    originalGlobals = {
      window: globalThis.window,
      document: globalThis.document,
      performance: globalThis.performance,
      requestAnimationFrame: globalThis.requestAnimationFrame,
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    };

    // Construct deterministic DOM and timing environment
    globalThis.window = globalThis;
    globalThis.performance = { now: () => scheduler.now() };
    globalThis.requestAnimationFrame = (cb) => scheduler.requestAnimationFrame(cb);
    globalThis.cancelAnimationFrame = (id) => scheduler.cancelAnimationFrame(id);
    globalThis.setInterval = (cb, ms) => scheduler.setInterval(cb, ms);
    globalThis.clearInterval = (id) => scheduler.clearInterval(id);

    globalThis.document = {
      getElementById: (id) => (id === 'app' ? appRoot : null),
      createElement: (tagName) => new MockElement(tagName),
      body: new MockElement('body'),
    };
  });

  afterEach(() => {
    Object.assign(globalThis, originalGlobals);
  });

  async function loadEntrypoint() {
    // Cache bust import to guarantee fresh execution of the active entrypoint
    const entrypointUrl = `../src/main.js?cacheBust=${Date.now()}_${Math.random()}`;
    const module = await import(entrypointUrl);

    // Support both immediate side-effect execution and lifecycle export patterns
    if (typeof module.init === 'function') {
      await module.init();
    } else if (typeof module.start === 'function') {
      await module.start();
    } else if (typeof module.default === 'function') {
      await module.default();
    }

    return module;
  }

  it('AC 1: must mount to document.getElementById("app") upon initialization', async () => {
    await loadEntrypoint();

    const hasAppChildren = appRoot.children.length > 0;
    const hasAppHtml = appRoot.innerHTML.trim().length > 0;
    const hasAppText = appRoot.textContent.trim().length > 0;

    assert.ok(
      hasAppChildren || hasAppHtml || hasAppText,
      'Entrypoint src/main.js failed to mount DOM or canvas components into document.getElementById("app")'
    );
  });

  it('AC 1: must immediately schedule and start an active render loop (RAF or timer)', async () => {
    await loadEntrypoint();

    const initialRafQueued = scheduler.rafCallbacks.size > 0;
    const initialIntervalQueued = scheduler.intervalCallbacks.size > 0;

    assert.ok(
      initialRafQueued || initialIntervalQueued,
      'Active render loop was not started: neither requestAnimationFrame nor interval timer was registered'
    );
  });

  it('AC 2: must perform continuous render frames or state mutations throughout a 2.5-second observation window', async () => {
    await loadEntrypoint();

    const observationWindowMs = 2500;
    const sampleIntervalMs = 500;
    const samples = [];

    // Helper to capture total mutation and paint activity from DOM and canvas elements
    function captureActivitySnapshot() {
      let canvasCalls = 0;
      let canvasStateChanges = 0;

      const visit = (node) => {
        if (node.tagName === 'CANVAS' && node._ctx) {
          canvasCalls += node._ctx.drawCalls.length;
          canvasStateChanges += node._ctx.stateChanges.length;
        }
        for (const child of node.children) {
          visit(child);
        }
      };
      visit(appRoot);

      return {
        timestamp: scheduler.now(),
        domMutations: appRoot.mutations.length,
        canvasCalls,
        canvasStateChanges,
      };
    }

    // Advance virtual time through the 2.5-second observation window and collect periodic activity
    const totalSamplesCount = Math.floor(observationWindowMs / sampleIntervalMs);
    for (let i = 0; i < totalSamplesCount; i++) {
      const beforeSnapshot = captureActivitySnapshot();
      scheduler.advance(sampleIntervalMs);
      const afterSnapshot = captureActivitySnapshot();

      const deltaDom = afterSnapshot.domMutations - beforeSnapshot.domMutations;
      const deltaCanvasCalls = afterSnapshot.canvasCalls - beforeSnapshot.canvasCalls;
      const deltaCanvasState = afterSnapshot.canvasStateChanges - beforeSnapshot.canvasStateChanges;
      const totalDelta = deltaDom + deltaCanvasCalls + deltaCanvasState;

      samples.push({
        intervalStart: beforeSnapshot.timestamp,
        intervalEnd: afterSnapshot.timestamp,
        delta: totalDelta,
      });
    }

    // Verify continuous liveness: Every sample window inside the 2.5s timeframe must register dynamic mutations
    for (const sample of samples) {
      assert.ok(
        sample.delta > 0,
        `DF-LIVENESS-01 Failure: Detected static window between ${sample.intervalStart}ms and ${sample.intervalEnd}ms. Zero DOM mutations or frame renders occurred.`
      );
    }
  });

  it('AC 2: canvas context must clear or redraw repeatedly to prevent static paint detection', async () => {
    await loadEntrypoint();

    // Advance 2.5 seconds (2500ms) at standard ~60fps simulation
    scheduler.advance(2500, 16.67);

    // Locate mounted canvas if active renderer is canvas-based
    let canvasElement = null;
    const findCanvas = (node) => {
      if (node.tagName === 'CANVAS') return node;
      for (const child of node.children) {
        const found = findCanvas(child);
        if (found) return found;
      }
      return null;
    };
    canvasElement = findCanvas(appRoot);

    if (canvasElement) {
      const ctx = canvasElement.getContext('2d');
      assert.ok(
        ctx.drawCalls.length >= 60,
        `Expected active canvas render loop with frequent redraws over 2.5s, but received only ${ctx.drawCalls.length} draw calls`
      );

      // Verify that renders occurred across the entire time span (both early and late in the 2.5s window)
      const firstDraw = ctx.drawCalls[0];
      const lastDraw = ctx.drawCalls[ctx.drawCalls.length - 1];

      assert.ok(
        firstDraw.time <= 100,
        `Initial render occurred too late (${firstDraw.time}ms)`
      );
      assert.ok(
        lastDraw.time >= 2400,
        `Render loop stalled prematurely; last draw call was at ${lastDraw.time}ms during a 2500ms observation`
      );
    } else {
      // If DOM-based animation, ensure text or innerHTML mutated across multiple discrete timestamps
      const timestamps = appRoot.mutations.map((m) => m.time);
      const uniqueTimestamps = new Set(timestamps.map((t) => Math.round(t / 100) * 100));

      assert.ok(
        uniqueTimestamps.size >= 5,
        `DOM mutations ceased prematurely or only occurred during mounting. Unique time slots observed: ${uniqueTimestamps.size}`
      );
    }
  });
});