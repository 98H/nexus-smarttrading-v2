import test from 'node:test';
import assert from 'node:assert';

/*
 * TEST SUITE: STORY 29.1.1: Resolve STATIC_APPLICATION
 * Defect ID: DF-LIVENESS-01 (Severity: HIGH)
 * Target: src/main.js
 *
 * Acceptance Criteria:
 * 1. Given the web application entrypoint src/main.js is mounted to document.getElementById('app'),
 *    When 2.5 seconds elapse in the browser, Then the application must execute a continuous
 *    render loop via requestAnimationFrame and reflect state mutations on the DOM or canvas.
 * 2. Given the active application entrypoint (src/main.js), When the browser renders the page,
 *    Then the entrypoint must bind all animation cycles and dynamic updates directly to the live DOM container.
 */

// --- Deterministic Mock Browser Environment ---

class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawHistory = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
  }

  _record(method, args) {
    this.drawHistory.push({
      method,
      args: structuredClone(args),
      timestamp: globalThis.performance.now(),
      fillStyle: this.fillStyle,
    });
  }

  clearRect(x, y, w, h) { this._record('clearRect', [x, y, w, h]); }
  fillRect(x, y, w, h) { this._record('fillRect', [x, y, w, h]); }
  strokeRect(x, y, w, h) { this._record('strokeRect', [x, y, w, h]); }
  fillText(text, x, y) { this._record('fillText', [text, x, y]); }
  strokeText(text, x, y) { this._record('strokeText', [text, x, y]); }
  beginPath() { this._record('beginPath', []); }
  closePath() { this._record('closePath', []); }
  stroke() { this._record('stroke', []); }
  fill() { this._record('fill', []); }
  arc(x, y, radius, startAngle, endAngle) { this._record('arc', [x, y, radius, startAngle, endAngle]); }
  drawImage(...args) { this._record('drawImage', args); }
}

class MockElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this._textContent = '';
    this._innerHTML = '';
    this.mutationEvents = [];
    this._ctx = null;
    this.width = 800;
    this.height = 600;
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    const prev = this._textContent;
    this._textContent = String(val);
    this.mutationEvents.push({
      type: 'textContent',
      from: prev,
      to: this._textContent,
      timestamp: globalThis.performance.now(),
    });
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    const prev = this._innerHTML;
    this._innerHTML = String(val);
    this.mutationEvents.push({
      type: 'innerHTML',
      from: prev,
      to: this._innerHTML,
      timestamp: globalThis.performance.now(),
    });
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    this.mutationEvents.push({
      type: 'appendChild',
      target: child,
      timestamp: globalThis.performance.now(),
    });
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
      this.mutationEvents.push({
        type: 'removeChild',
        target: child,
        timestamp: globalThis.performance.now(),
      });
    }
    return child;
  }

  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    for (const child of this.children) {
      if (child.contains ? child.contains(node) : child === node) {
        return true;
      }
    }
    return false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this.mutationEvents.push({
      type: 'attribute',
      name,
      value: String(value),
      timestamp: globalThis.performance.now(),
    });
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  getContext(contextType) {
    if (this.tagName === 'CANVAS' && contextType === '2d') {
      if (!this._ctx) {
        this._ctx = new MockCanvasRenderingContext2D(this);
      }
      return this._ctx;
    }
    return null;
  }
}

class MockDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new MockElement('BODY');
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  _registerElement(element) {
    if (element.id) {
      this.elementsById.set(element.id, element);
    }
  }
}

class BrowserEnvironmentSimulator {
  constructor() {
    this.currentTime = 0;
    this.rafIdCounter = 0;
    this.scheduledRafCallbacks = new Map();
    this.totalRafDispatched = 0;

    this.document = new MockDocument();
    this.appContainer = new MockElement('DIV', 'app');
    this.document._registerElement(this.appContainer);
    this.document.body.appendChild(this.appContainer);

    this.originalGlobals = {
      window: globalThis.window,
      document: globalThis.document,
      requestAnimationFrame: globalThis.requestAnimationFrame,
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      performance: globalThis.performance,
      HTMLCanvasElement: globalThis.HTMLCanvasElement,
    };
  }

  install() {
    globalThis.performance = {
      now: () => this.currentTime,
    };

    globalThis.requestAnimationFrame = (callback) => {
      const id = ++this.rafIdCounter;
      this.scheduledRafCallbacks.set(id, callback);
      return id;
    };

    globalThis.cancelAnimationFrame = (id) => {
      this.scheduledRafCallbacks.delete(id);
    };

    globalThis.document = this.document;
    globalThis.window = {
      document: this.document,
      requestAnimationFrame: globalThis.requestAnimationFrame,
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      performance: globalThis.performance,
    };
    globalThis.HTMLCanvasElement = MockElement;
  }

  restore() {
    globalThis.window = this.originalGlobals.window;
    globalThis.document = this.originalGlobals.document;
    globalThis.requestAnimationFrame = this.originalGlobals.requestAnimationFrame;
    globalThis.cancelAnimationFrame = this.originalGlobals.cancelAnimationFrame;
    globalThis.performance = this.originalGlobals.performance;
    globalThis.HTMLCanvasElement = this.originalGlobals.HTMLCanvasElement;
  }

  /**
   * Advances deterministic simulation time, triggering animation frames at discrete steps.
   * Standard 60Hz step ~16.666ms.
   */
  advanceTime(durationMs, stepMs = 16.666) {
    const targetTime = this.currentTime + durationMs;
    while (this.currentTime + stepMs <= targetTime) {
      this.currentTime += stepMs;
      const currentBatch = Array.from(this.scheduledRafCallbacks.entries());
      this.scheduledRafCallbacks.clear();

      for (const [id, callback] of currentBatch) {
        this.totalRafDispatched++;
        callback(this.currentTime);
      }
    }
    this.currentTime = targetTime;
  }
}

/**
 * Dynamically loads and bootstraps the entrypoint.
 * Evaluates both immediate auto-mount patterns and explicit exported hooks (mount/init).
 */
async function bootstrapEntrypoint(appContainer) {
  // Use unique query parameter to ensure fresh module instantiation per test
  const modulePath = `../src/main.js?test_run=${Date.now()}_${Math.random()}`;
  const entrypoint = await import(modulePath);

  if (typeof entrypoint.mount === 'function') {
    entrypoint.mount(appContainer);
  } else if (typeof entrypoint.init === 'function') {
    entrypoint.init();
  } else if (typeof entrypoint.default === 'function') {
    entrypoint.default();
  }

  return entrypoint;
}

// --- Unit Tests ---

test('DF-LIVENESS-01: Continuous render loop execution over 2.5s observation window', async (t) => {
  const env = new BrowserEnvironmentSimulator();
  env.install();

  try {
    await bootstrapEntrypoint(env.appContainer);

    // Initial frame request must be scheduled immediately upon mounting
    assert.ok(
      env.scheduledRafCallbacks.size > 0,
      'AC-1 Violation: Application mounted but did not request an initial animation frame via requestAnimationFrame.'
    );

    // Advance by exactly 2500ms (2.5 seconds observation window)
    const observationWindowMs = 2500;
    const stepMs = 16.666; // Standard 60 FPS frame delta
    const expectedMinFrames = Math.floor(observationWindowMs / stepMs) - 5; // Allow minor variance buffer

    env.advanceTime(observationWindowMs, stepMs);

    // Continuous execution verification
    assert.ok(
      env.totalRafDispatched >= expectedMinFrames,
      `AC-1 Violation (DF-LIVENESS-01): Render loop stalled or terminated prematurely. ` +
      `Expected at least ${expectedMinFrames} continuous frames over 2.5s, but only received ${env.totalRafDispatched}.`
    );

    // Ensure loop is self-sustaining and continuous (a next frame must be queued at t = 2500ms)
    assert.ok(
      env.scheduledRafCallbacks.size > 0,
      'AC-1 Violation: Render loop is not continuous; no subsequent animation frame was requested at the end of 2.5s.'
    );
  } finally {
    env.restore();
  }
});

test('DF-LIVENESS-01: State mutations reflected on DOM or Canvas across 2.5-second observation window', async (t) => {
  const env = new BrowserEnvironmentSimulator();
  env.install();

  try {
    await bootstrapEntrypoint(env.appContainer);

    // Locate active visual target inside #app (Canvas or dynamic Element)
    const findCanvas = (el) => {
      if (el.tagName === 'CANVAS') return el;
      for (const child of el.children) {
        const found = findCanvas(child);
        if (found) return found;
      }
      return null;
    };

    // Capture state snapshots across 5 discrete checkpoints during the 2.5s window:
    // t0 = 0ms, t1 = 500ms, t2 = 1000ms, t3 = 1500ms, t4 = 2000ms, t5 = 2500ms
    const checkpoints = [500, 500, 500, 500, 500]; // Incremental steps summing to 2500ms
    const snapshots = [];

    const captureSnapshot = (timestamp) => {
      const canvas = findCanvas(env.appContainer);
      const ctx = canvas ? canvas.getContext('2d') : null;
      return {
        timestamp,
        canvasCallsCount: ctx ? ctx.drawHistory.length : 0,
        lastDrawCall: ctx && ctx.drawHistory.length > 0 ? structuredClone(ctx.drawHistory.at(-1)) : null,
        domText: env.appContainer.textContent,
        domInnerHTML: env.appContainer.innerHTML,
        domMutationCount: env.appContainer.mutationEvents.length,
      };
    };

    snapshots.push(captureSnapshot(0));

    for (const step of checkpoints) {
      env.advanceTime(step);
      snapshots.push(captureSnapshot(env.currentTime));
    }

    assert.strictEqual(snapshots.length, 6, 'Internal Test Error: Expected 6 temporal state snapshots.');

    // Evaluation for Canvas-based mutations:
    const initialSnapshot = snapshots[0];
    const finalSnapshot = snapshots[snapshots.length - 1];

    let hasCanvasMutations = false;
    if (finalSnapshot.canvasCallsCount > initialSnapshot.canvasCallsCount) {
      // Validate that draw operations were not identical static duplicates
      const canvas = findCanvas(env.appContainer);
      const ctx = canvas.getContext('2d');
      const drawCallsOverTime = ctx.drawHistory;

      // Ensure draw calls occurred across the full window, including near t = 2500ms
      const lateFrames = drawCallsOverTime.filter((call) => call.timestamp >= 2000);
      assert.ok(
        lateFrames.length > 0,
        'AC-1 Violation (DF-LIVENESS-01): Canvas frame renders ceased before 2.5s observation window elapsed.'
      );

      // Verify that arguments or draw states mutated between initial and final snapshots
      const earlyArgs = JSON.stringify(drawCallsOverTime.slice(0, 5).map(c => ({ method: c.method, args: c.args })));
      const lateArgs = JSON.stringify(lateFrames.slice(-5).map(c => ({ method: c.method, args: c.args })));
      
      const statesDiverged = earlyArgs !== lateArgs;
      assert.ok(
        statesDiverged,
        'AC-1 Violation (DF-LIVENESS-01): Static painting detected. Canvas rendered frames without any state/coordinate mutations.'
      );
      hasCanvasMutations = true;
    }

    // Evaluation for DOM-based mutations:
    let hasDOMMutations = false;
    if (finalSnapshot.domText !== initialSnapshot.domText ||
        finalSnapshot.domInnerHTML !== initialSnapshot.domInnerHTML ||
        finalSnapshot.domMutationCount > initialSnapshot.domMutationCount) {
      hasDOMMutations = true;
    }

    // High Severity Defect Check: Neither DOM text nor canvas pixels underwent any state mutations
    assert.ok(
      hasCanvasMutations || hasDOMMutations,
      'DF-LIVENESS-01 Failure: Static application detected! Neither DOM text nor canvas pixels ' +
      'underwent any state mutations or dynamic frame renders over the 2.5-second observation window.'
    );
  } finally {
    env.restore();
  }
});

test('AC-2: Live DOM Container Binding and Structural Integrity', async (t) => {
  const env = new BrowserEnvironmentSimulator();
  env.install();

  try {
    await bootstrapEntrypoint(env.appContainer);

    // Verify that the entrypoint mounted dynamic visual nodes to document.getElementById('app')
    assert.ok(
      env.appContainer.children.length > 0 || env.appContainer.textContent.length > 0 || env.appContainer.innerHTML.length > 0,
      'AC-2 Violation: Entrypoint src/main.js failed to attach components to document.getElementById("app").'
    );

    // Advance 500ms to allow rendering updates to dispatch
    env.advanceTime(500);

    // Architectural Invariant: Never produce an isolated, unmounted file.
    // Verify all active canvas elements or mutating elements reside within the live #app container
    const isNodeInLiveApp = (node) => env.appContainer.contains(node);

    const canvasElements = [];
    const collectCanvases = (el) => {
      if (el.tagName === 'CANVAS') canvasElements.push(el);
      for (const child of el.children) collectCanvases(child);
    };
    collectCanvases(env.appContainer);

    for (const canvas of canvasElements) {
      assert.ok(
        isNodeInLiveApp(canvas),
        'Architectural Invariant Violation: Canvas element is detached from the active DOM container (#app).'
      );

      const ctx = canvas.getContext('2d');
      assert.ok(
        ctx !== null,
        'AC-2 Violation: Unable to acquire active 2D rendering context from mounted canvas.'
      );

      assert.ok(
        ctx.drawHistory.length > 0,
        'AC-2 Violation: Mounted canvas inside #app received zero render calls from the live animation loop.'
      );
    }
  } finally {
    env.restore();
  }
});

test('DF-LIVENESS-01: Render loop resilience against frame rate drops', async (t) => {
  const env = new BrowserEnvironmentSimulator();
  env.install();

  try {
    await bootstrapEntrypoint(env.appContainer);

    // Simulate unstable browser frame timing (e.g. jank, variable delta) across 2500ms
    const variableSteps = [33.3, 16.6, 50.0, 16.6, 100.0, 16.6, 16.6, 250.0];
    let elapsed = 0;
    let stepIndex = 0;

    while (elapsed < 2500) {
      const step = variableSteps[stepIndex % variableSteps.length];
      const remaining = 2500 - elapsed;
      const actualStep = Math.min(step, remaining);
      env.advanceTime(actualStep, actualStep);
      elapsed += actualStep;
      stepIndex++;
    }

    // Verify render loop recovers and maintains state mutation progression
    assert.ok(
      env.totalRafDispatched > 0,
      'AC-1 Violation: Render loop halted during variable frame pacing.'
    );

    assert.ok(
      env.scheduledRafCallbacks.size > 0,
      'AC-1 Violation: Render loop terminated when handling variable time intervals.'
    );
  } finally {
    env.restore();
  }
});