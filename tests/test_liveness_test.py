import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * STORY 53.1.1: Resolve STATIC_APPLICATION
 * Defect ID: DF-LIVENESS-01
 * 
 * Target: src/main.js
 * Verification of active animation loop, liveness over 2.5s observation window,
 * and continuous DOM/Canvas state mutation without user input.
 */

// --- Mock Browser & Virtual Clock Harness ---

class MockCanvasRenderingContext2D {
  constructor(canvas, recordMutation) {
    this.canvas = canvas;
    this.recordMutation = recordMutation;
    this._fillStyle = '#000000';
    this._strokeStyle = '#000000';
    this.renderCallCount = 0;
  }

  get fillStyle() {
    return this._fillStyle;
  }

  set fillStyle(val) {
    this._fillStyle = val;
  }

  get strokeStyle() {
    return this._strokeStyle;
  }

  set strokeStyle(val) {
    this._strokeStyle = val;
  }

  clearRect(x, y, w, h) {
    this.renderCallCount++;
    this.recordMutation('canvas:clearRect', { x, y, w, h, callCount: this.renderCallCount });
  }

  fillRect(x, y, w, h) {
    this.renderCallCount++;
    this.recordMutation('canvas:fillRect', { x, y, w, h, fillStyle: this._fillStyle, callCount: this.renderCallCount });
  }

  strokeRect(x, y, w, h) {
    this.renderCallCount++;
    this.recordMutation('canvas:strokeRect', { x, y, w, h, strokeStyle: this._strokeStyle, callCount: this.renderCallCount });
  }

  fillText(text, x, y) {
    this.renderCallCount++;
    this.recordMutation('canvas:fillText', { text, x, y, callCount: this.renderCallCount });
  }

  beginPath() {}
  closePath() {}
  stroke() {
    this.renderCallCount++;
    this.recordMutation('canvas:stroke', { callCount: this.renderCallCount });
  }
  fill() {
    this.renderCallCount++;
    this.recordMutation('canvas:fill', { callCount: this.renderCallCount });
  }
  arc() {}
  drawImage() {
    this.renderCallCount++;
    this.recordMutation('canvas:drawImage', { callCount: this.renderCallCount });
  }

  getImageData(sx, sy, sw, sh) {
    // Return mock pixel buffer reflecting current renderCallCount
    const data = new Uint8ClampedArray(sw * sh * 4);
    const val = this.renderCallCount % 256;
    data.fill(val);
    return { data, width: sw, height: sh };
  }
}

class MockElement {
  constructor(tagName, id = '', recordMutation) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.recordMutation = recordMutation;
    this.children = [];
    this._textContent = '';
    this._innerHTML = '';
    this.attributes = new Map();
    this._context2D = null;
    this.width = 800;
    this.height = 600;
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(val) {
    const prev = this._textContent;
    this._textContent = String(val);
    if (prev !== this._textContent) {
      this.recordMutation('dom:textContent', { id: this.id, text: this._textContent });
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    const prev = this._innerHTML;
    this._innerHTML = String(val);
    if (prev !== this._innerHTML) {
      this.recordMutation('dom:innerHTML', { id: this.id, html: this._innerHTML });
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this.recordMutation('dom:setAttribute', { id: this.id, name, value });
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  appendChild(child) {
    this.children.push(child);
    this.recordMutation('dom:appendChild', { parentId: this.id, childTag: child.tagName, childId: child.id });
    return child;
  }

  getContext(type) {
    if (this.tagName === 'CANVAS' && type === '2d') {
      if (!this._context2D) {
        this._context2D = new MockCanvasRenderingContext2D(this, this.recordMutation);
      }
      return this._context2D;
    }
    return null;
  }

  addEventListener() {}
  removeEventListener() {}
}

class VirtualEnvironment {
  constructor() {
    this.currentTime = 0;
    this.mutationLog = [];
    this.rafCallbacks = new Map();
    this.timerCallbacks = new Map();
    this.nextRafId = 1;
    this.nextTimerId = 1;
    this.elements = new Map();

    const appContainer = new MockElement('div', 'app', (type, meta) => this.logMutation(type, meta));
    this.elements.set('app', appContainer);

    this.setupGlobals();
  }

  logMutation(type, meta) {
    this.mutationLog.push({
      time: this.currentTime,
      type,
      meta,
    });
  }

  setupGlobals() {
    globalThis.window = globalThis;

    globalThis.document = {
      getElementById: (id) => {
        if (!this.elements.has(id)) {
          const el = new MockElement('div', id, (t, m) => this.logMutation(t, m));
          this.elements.set(id, el);
        }
        return this.elements.get(id);
      },
      createElement: (tagName) => {
        return new MockElement(tagName, '', (t, m) => this.logMutation(t, m));
      },
      body: new MockElement('body', 'body', (t, m) => this.logMutation(t, m)),
    };

    globalThis.requestAnimationFrame = (cb) => {
      const id = this.nextRafId++;
      this.rafCallbacks.set(id, cb);
      return id;
    };

    globalThis.cancelAnimationFrame = (id) => {
      this.rafCallbacks.delete(id);
    };

    globalThis.setInterval = (cb, delay) => {
      const id = this.nextTimerId++;
      this.timerCallbacks.set(id, { cb, delay: Math.max(delay || 0, 1), nextRun: this.currentTime + Math.max(delay || 0, 1), recurring: true });
      return id;
    };

    globalThis.clearInterval = (id) => {
      this.timerCallbacks.delete(id);
    };

    globalThis.setTimeout = (cb, delay) => {
      const id = this.nextTimerId++;
      this.timerCallbacks.set(id, { cb, delay: Math.max(delay || 0, 1), nextRun: this.currentTime + Math.max(delay || 0, 1), recurring: false });
      return id;
    };

    globalThis.clearTimeout = (id) => {
      this.timerCallbacks.delete(id);
    };

    globalThis.performance = {
      now: () => this.currentTime,
    };
  }

  advanceTime(ms, stepMs = 16.67) {
    const targetTime = this.currentTime + ms;
    while (this.currentTime < targetTime) {
      this.currentTime = Math.min(this.currentTime + stepMs, targetTime);

      // Execute queued requestAnimationFrame callbacks for this frame
      if (this.rafCallbacks.size > 0) {
        const currentCallbacks = Array.from(this.rafCallbacks.entries());
        this.rafCallbacks.clear();
        for (const [id, cb] of currentCallbacks) {
          cb(this.currentTime);
        }
      }

      // Execute due timer callbacks
      for (const [id, timer] of Array.from(this.timerCallbacks.entries())) {
        if (this.currentTime >= timer.nextRun) {
          timer.cb();
          if (timer.recurring) {
            timer.nextRun = this.currentTime + timer.delay;
          } else {
            this.timerCallbacks.delete(id);
          }
        }
      }
    }
  }

  cleanup() {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
    delete globalThis.setInterval;
    delete globalThis.clearInterval;
    delete globalThis.setTimeout;
    delete globalThis.clearTimeout;
    delete globalThis.performance;
  }
}

// Helper to initialize entrypoint supporting both default/named exports and top-level side effects
async function loadMainEntrypoint() {
  const cacheBust = `?t=${Date.now()}_${Math.random()}`;
  const module = await import(`../src/main.js${cacheBust}`);
  const appElement = globalThis.document.getElementById('app');

  if (typeof module.mount === 'function') {
    await module.mount(appElement);
  } else if (typeof module.init === 'function') {
    await module.init(appElement);
  } else if (typeof module.default === 'function') {
    await module.default(appElement);
  }

  return { module, appElement };
}

describe('STORY 53.1.1: Resolve STATIC_APPLICATION (Defect DF-LIVENESS-01)', () => {
  let env;

  beforeEach(() => {
    env = new VirtualEnvironment();
  });

  afterEach(() => {
    env.cleanup();
  });

  it('AC-1: mounts to document.getElementById("app") and starts continuous loop mutating DOM or Canvas at least once every 1000ms', async () => {
    await loadMainEntrypoint();

    const app = env.elements.get('app');
    assert.ok(
      app.children.length > 0 || app.textContent.length > 0 || app.innerHTML.length > 0,
      'App container document.getElementById("app") must be populated upon mounting src/main.js'
    );

    // Initial state after mount
    const initialLogCount = env.mutationLog.length;

    // Advance 1000ms in discrete frame steps
    env.advanceTime(1000);

    const mutationsInFirstSec = env.mutationLog.slice(initialLogCount);
    assert.ok(
      mutationsInFirstSec.length >= 1,
      `Expected at least 1 DOM or Canvas render mutation in the first 1000ms, but recorded ${mutationsInFirstSec.length}`
    );

    // Advance another 1000ms and verify continuous execution
    const beforeSec2 = env.mutationLog.length;
    env.advanceTime(1000);
    const mutationsInSec2 = env.mutationLog.slice(beforeSec2);

    assert.ok(
      mutationsInSec2.length >= 1,
      `Animation loop must continuously run; expected at least 1 mutation in the second 1000ms window, got ${mutationsInSec2.length}`
    );
  });

  it('AC-1: maximum elapsed interval between consecutive frame renders or DOM mutations must not exceed 1000ms', async () => {
    await loadMainEntrypoint();

    // Advance through 3000ms to observe continuous intervals
    const observationMs = 3000;
    env.advanceTime(observationMs);

    assert.ok(
      env.mutationLog.length >= 3,
      `Over a ${observationMs}ms execution, expected at least 3 mutations (1 every 1000ms), but got ${env.mutationLog.length}`
    );

    // Check interval between consecutive render timestamps
    let previousTimestamp = 0;
    for (let i = 0; i < env.mutationLog.length; i++) {
      const currentTimestamp = env.mutationLog[i].time;
      const interval = currentTimestamp - previousTimestamp;

      assert.ok(
        interval <= 1000,
        `Render lag detected at mutation index ${i}: interval of ${interval}ms exceeds maximum permissible 1000ms cadence (DF-LIVENESS-01)`
      );
      previousTimestamp = currentTimestamp;
    }
  });

  it('AC-2: observation window >= 2.5 seconds with no user input registers visible DOM or Canvas pixel mutations (non-static)', async () => {
    await loadMainEntrypoint();

    const app = env.elements.get('app');
    const canvasElement = app.children.find((child) => child.tagName === 'CANVAS');

    let initialPixels = null;
    let initialDomContent = app.innerHTML || app.textContent;

    if (canvasElement) {
      const ctx = canvasElement.getContext('2d');
      initialPixels = Array.from(ctx.getImageData(0, 0, 10, 10).data);
    }

    // 2.5-second (2500ms) observation window without any user input events
    const observationWindowMs = 2500;
    const startMutationIndex = env.mutationLog.length;

    env.advanceTime(observationWindowMs);

    const mutationsDuringWindow = env.mutationLog.slice(startMutationIndex);

    // Verify non-static execution: mutations must have been registered during this idle window
    assert.ok(
      mutationsDuringWindow.length > 0,
      `DF-LIVENESS-01 Failure: No state mutations or frame renders occurred over the ${observationWindowMs}ms observation window. Application appears to be a static painting.`
    );

    // Verify visible difference in DOM text or Canvas buffer
    let stateMutated = false;

    if (canvasElement) {
      const ctx = canvasElement.getContext('2d');
      const currentPixels = Array.from(ctx.getImageData(0, 0, 10, 10).data);
      const canvasDrawCalls = ctx.renderCallCount;

      const pixelsChanged = !initialPixels.every((val, idx) => val === currentPixels[idx]);
      if (pixelsChanged || canvasDrawCalls > 0) {
        stateMutated = true;
      }
    }

    const currentDomContent = app.innerHTML || app.textContent;
    if (currentDomContent !== initialDomContent) {
      stateMutated = true;
    }

    assert.equal(
      stateMutated,
      true,
      'Either Canvas buffer pixels or DOM text content must register visible mutations confirming non-static runtime execution over 2.5s window.'
    );
  });

  it('verifies animation loop schedules via requestAnimationFrame or recurring interval', async () => {
    await loadMainEntrypoint();

    // Verify that at least one RAF or interval is active upon mounting
    const hasActiveRaf = env.rafCallbacks.size > 0;
    const hasActiveInterval = env.timerCallbacks.size > 0;

    assert.ok(
      hasActiveRaf || hasActiveInterval,
      'Mounting src/main.js must register an active requestAnimationFrame loop or tick timer.'
    );

    // Step a single frame and check that the loop re-schedules itself
    env.advanceTime(16.67);

    const persistsActiveRaf = env.rafCallbacks.size > 0;
    const persistsActiveInterval = env.timerCallbacks.size > 0;

    assert.ok(
      persistsActiveRaf || persistsActiveInterval,
      'Active animation loop must continuously re-queue next frame (not terminate after 1 cycle).'
    );
  });
});