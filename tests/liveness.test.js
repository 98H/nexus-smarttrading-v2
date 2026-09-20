import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Test Suite: STORY 1.1.1: Resolve STATIC_APPLICATION
 * Defect ID: DF-LIVENESS-01
 * Target: src/main.js
 *
 * Ensures the application entrypoint establishes an active, continuous rendering
 * loop via requestAnimationFrame, driving state mutations and canvas renders
 * across a 2.5-second (2500ms) observation window without freezing.
 */

// Virtual environment and harness for Node.js
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawCalls = [];
    this.stateLog = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
  }

  _record(op, args) {
    const record = {
      op,
      args: JSON.parse(JSON.stringify(args || [])),
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      time: globalThis.performance.now()
    };
    this.drawCalls.push(record);
    this.stateLog.push(record);
  }

  clearRect(x, y, w, h) { this._record('clearRect', [x, y, w, h]); }
  fillRect(x, y, w, h) { this._record('fillRect', [x, y, w, h]); }
  strokeRect(x, y, w, h) { this._record('strokeRect', [x, y, w, h]); }
  beginPath() { this._record('beginPath', []); }
  closePath() { this._record('closePath', []); }
  moveTo(x, y) { this._record('moveTo', [x, y]); }
  lineTo(x, y) { this._record('lineTo', [x, y]); }
  arc(...args) { this._record('arc', args); }
  stroke() { this._record('stroke', []); }
  fill() { this._record('fill', []); }
  drawImage(...args) { this._record('drawImage', args); }
  fillText(text, x, y) { this._record('fillText', [text, x, y]); }
  putImageData(data, x, y) { this._record('putImageData', [x, y]); }
  getImageData(x, y, w, h) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this._textContent = '';
    this._innerHTML = '';
    this.mutationHistory = [];
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    this._textContent = String(val);
    this.mutationHistory.push({
      property: 'textContent',
      value: this._textContent,
      time: globalThis.performance.now()
    });
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = String(val);
    this.mutationHistory.push({
      property: 'innerHTML',
      value: this._innerHTML,
      time: globalThis.performance.now()
    });
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    this.mutationHistory.push({
      property: 'appendChild',
      tag: child.tagName,
      time: globalThis.performance.now()
    });
    return child;
  }

  querySelector(selector) {
    if (selector === 'canvas' || selector === `#${this.id} canvas`) {
      return this.children.find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }
}

class MockCanvasElement extends MockElement {
  constructor() {
    super('canvas');
    this.width = 800;
    this.height = 600;
    this.context2d = new MockCanvasRenderingContext2D(this);
  }

  getContext(type) {
    if (type === '2d') {
      return this.context2d;
    }
    return null;
  }
}

// Global harness state
let virtualTime = 0;
let nextRafId = 1;
let activeRafCallbacks = new Map();
let domListeners = new Map();
let appRoot = null;

function setupVirtualBrowser() {
  virtualTime = 0;
  nextRafId = 1;
  activeRafCallbacks.clear();
  domListeners.clear();

  appRoot = new MockElement('div', 'app');

  globalThis.performance = {
    now: () => virtualTime
  };

  globalThis.requestAnimationFrame = (callback) => {
    const id = nextRafId++;
    activeRafCallbacks.set(id, callback);
    return id;
  };

  globalThis.cancelAnimationFrame = (id) => {
    activeRafCallbacks.delete(id);
  };

  globalThis.document = {
    getElementById: (id) => {
      if (id === 'app') return appRoot;
      return null;
    },
    createElement: (tag) => {
      if (tag.toLowerCase() === 'canvas') {
        return new MockCanvasElement();
      }
      return new MockElement(tag);
    },
    addEventListener: (event, handler) => {
      if (!domListeners.has(event)) {
        domListeners.set(event, []);
      }
      domListeners.get(event).push(handler);
    }
  };

  globalThis.window = {
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    addEventListener: globalThis.document.addEventListener
  };
}

/**
 * Advances simulated time by deltaMs in deterministic increments (60 FPS default),
 * executing queued requestAnimationFrame callbacks.
 */
function advanceTime(totalMs, stepMs = 1000 / 60) {
  const endTime = virtualTime + totalMs;
  while (virtualTime + stepMs <= endTime + 0.0001) {
    virtualTime += stepMs;
    const callbacks = Array.from(activeRafCallbacks.entries());
    activeRafCallbacks.clear();
    for (const [, cb] of callbacks) {
      cb(virtualTime);
    }
  }
}

/**
 * Boots the entrypoint module dynamically to guarantee isolation per test.
 */
async function loadMainEntrypoint() {
  const cacheBuster = `?t=${Date.now()}-${Math.random()}`;
  const mainModule = await import(`../src/main.js${cacheBuster}`);

  // Trigger any lifecycle hooks registered on DOMContentLoaded
  const readyHandlers = domListeners.get('DOMContentLoaded') || [];
  for (const handler of readyHandlers) {
    handler();
  }

  // If entrypoint exports an explicit mount/init API, invoke it
  if (typeof mainModule.init === 'function') {
    await mainModule.init();
  } else if (typeof mainModule.mount === 'function') {
    await mainModule.mount();
  } else if (typeof mainModule.default === 'function') {
    await mainModule.default();
  }

  return mainModule;
}

beforeEach(() => {
  setupVirtualBrowser();
});

afterEach(() => {
  activeRafCallbacks.clear();
  domListeners.clear();
});

test('Resolve STATIC_APPLICATION: Entrypoint mounts active continuous animation loop to #app', async () => {
  await loadMainEntrypoint();

  assert.ok(appRoot, 'Target container #app must exist');
  
  // Verify canvas is mounted inside #app or exists as render target
  const canvas = appRoot.children.find((child) => child.tagName === 'CANVAS');
  assert.ok(
    canvas || appRoot.children.length > 0,
    'Entrypoint must mount active UI components or canvas into #app'
  );

  // Application must have registered an initial requestAnimationFrame
  assert.ok(
    activeRafCallbacks.size > 0,
    'Application must schedule a frame via requestAnimationFrame on initialization'
  );

  // Step 1 frame
  advanceTime(1000 / 60);

  // Frame loop must re-register continuously
  assert.ok(
    activeRafCallbacks.size > 0,
    'Render loop must continuously re-queue requestAnimationFrame and not terminate after frame 1'
  );
});

test('Resolve STATIC_APPLICATION: Continuous canvas frame renders over 2.5-second observation window', async () => {
  await loadMainEntrypoint();

  const canvas = appRoot.querySelector('canvas') || appRoot.children.find((c) => c.tagName === 'CANVAS');
  assert.ok(canvas, 'Canvas must be mounted to #app for pixel rendering');
  const ctx = canvas.getContext('2d');

  const observationDuration = 2500; // 2.5 seconds
  const stepInterval = 500; // Sample every 500ms
  const sampleSnapshots = [];

  // Observe across 5 consecutive 500ms windows (total 2500ms)
  for (let elapsed = 0; elapsed < observationDuration; elapsed += stepInterval) {
    const drawsBefore = ctx.drawCalls.length;
    advanceTime(stepInterval);
    const drawsAfter = ctx.drawCalls.length;

    sampleSnapshots.push({
      windowStart: elapsed,
      windowEnd: elapsed + stepInterval,
      framesRendered: drawsAfter - drawsBefore
    });
  }

  // Ensure every sample window exhibited active frame renders (no freezing)
  for (const sample of sampleSnapshots) {
    assert.ok(
      sample.framesRendered > 0,
      `Defect DF-LIVENESS-01 detected: Application froze during window [${sample.windowStart}ms - ${sample.windowEnd}ms]. Rendered ${sample.framesRendered} frames.`
    );
  }

  // At 60 FPS, 2.5s corresponds to ~150 frames. Assert substantial continuous activity.
  const totalDrawCalls = ctx.drawCalls.length;
  assert.ok(
    totalDrawCalls >= 100,
    `Expected >= 100 frame draw calls over 2.5s window at 60 FPS, but observed only ${totalDrawCalls}`
  );
});

test('Resolve STATIC_APPLICATION: Dynamic state mutations occur across the 2.5s observation window', async () => {
  await loadMainEntrypoint();

  const canvas = appRoot.querySelector('canvas') || appRoot.children.find((c) => c.tagName === 'CANVAS');
  assert.ok(canvas, 'Canvas must be present');
  const ctx = canvas.getContext('2d');

  // Baseline at t = 0
  advanceTime(16.6);
  const initialDraws = [...ctx.drawCalls];
  const initialDomMutations = [...appRoot.mutationHistory];

  // Advance to midpoint (1250ms)
  advanceTime(1233.4);
  const midDraws = [...ctx.drawCalls];

  // Advance to end of 2.5s window (2500ms total)
  advanceTime(1250);
  const finalDraws = [...ctx.drawCalls];
  const finalDomMutations = [...appRoot.mutationHistory];

  // Verify draw operations change parameters or state over time (not just rendering static dead pixels)
  assert.notDeepEqual(
    initialDraws,
    midDraws,
    'Canvas render operations must actively evolve between 0s and 1.25s'
  );

  assert.notDeepEqual(
    midDraws,
    finalDraws,
    'Canvas render operations must actively evolve between 1.25s and 2.5s'
  );

  // Check state mutation: either canvas operations contain varying arguments/timestamps,
  // or DOM text/attributes undergo mutations.
  const hasVaryingCanvasDraws = finalDraws.some((call, index) => {
    if (index === 0) return false;
    const prev = finalDraws[index - 1];
    return (
      call.time !== prev.time &&
      (JSON.stringify(call.args) !== JSON.stringify(prev.args) ||
        call.fillStyle !== prev.fillStyle ||
        call.op !== prev.op)
    );
  });

  const hasDomMutations = finalDomMutations.length > initialDomMutations.length;

  assert.ok(
    hasVaryingCanvasDraws || hasDomMutations,
    'Acceptance Criteria Violation: Neither canvas pixels nor DOM state mutated dynamically over 2.5s'
  );
});

test('Resolve STATIC_APPLICATION: Maximum inter-frame freeze gap must not exceed 100ms', async () => {
  await loadMainEntrypoint();

  const canvas = appRoot.querySelector('canvas') || appRoot.children.find((c) => c.tagName === 'CANVAS');
  const ctx = canvas.getContext('2d');

  // Run full 2.5s simulation in individual 16.6ms frame increments
  const totalFrames = Math.floor(2500 / (1000 / 60));
  const frameTimestamps = [];

  for (let i = 0; i < totalFrames; i++) {
    const prevCount = ctx.drawCalls.length;
    advanceTime(1000 / 60);
    if (ctx.drawCalls.length > prevCount) {
      frameTimestamps.push(virtualTime);
    }
  }

  assert.ok(
    frameTimestamps.length > 0,
    'Application failed to render any frames during the 2.5s observation period'
  );

  // Compute maximum gap between consecutive renders
  let maxGap = 0;
  for (let i = 1; i < frameTimestamps.length; i++) {
    const gap = frameTimestamps[i] - frameTimestamps[i - 1];
    if (gap > maxGap) {
      maxGap = gap;
    }
  }

  const FREEZE_THRESHOLD_MS = 100; // Gaps > 100ms constitute perceptible UI freeze
  assert.ok(
    maxGap <= FREEZE_THRESHOLD_MS,
    `Liveness defect detected: Max freeze duration between frames was ${maxGap.toFixed(2)}ms (exceeds ${FREEZE_THRESHOLD_MS}ms threshold)`
  );
});