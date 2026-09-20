import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Minimal Deterministic DOM & Canvas Mock Environment for Node.js ---

class MockEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    if (this._listeners.has(type)) {
      this._listeners.get(type).delete(listener);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const handlers = this._listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        if (typeof handler === 'function') {
          handler.call(this, event);
        } else if (handler && typeof handler.handleEvent === 'function') {
          handler.handleEvent(event);
        }
      }
    }
    return !event.defaultPrevented;
  }
}

class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderCalls = 0;
    this.transformHistory = [];
    this.currentTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  clearRect(x, y, w, h) {
    this.renderCalls++;
  }

  setTransform(a, b, c, d, e, f) {
    this.currentTransform = { a, b, c, d, e, f };
    this.transformHistory.push({ type: 'setTransform', args: { a, b, c, d, e, f } });
  }

  translate(dx, dy) {
    this.currentTransform.e += dx;
    this.currentTransform.f += dy;
    this.transformHistory.push({ type: 'translate', args: { dx, dy } });
  }

  scale(sx, sy) {
    this.currentTransform.a *= sx;
    this.currentTransform.d *= sy;
    this.transformHistory.push({ type: 'scale', args: { sx, sy } });
  }

  beginPath() {}
  stroke() {}
  fill() {}
  save() {}
  restore() {}
}

class MockElement extends MockEventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.id = '';
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      child.parentElement = null;
      this.children.splice(index, 1);
    }
    return child;
  }

  querySelector(selector) {
    if (selector === 'canvas') {
      return Array.from(this.children).find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
    };
  }
}

class MockHTMLCanvasElement extends MockElement {
  constructor() {
    super('canvas');
    this.width = 800;
    this.height = 600;
    this._context = new MockCanvasRenderingContext2D(this);
  }

  getContext(type) {
    if (type === '2d') {
      return this._context;
    }
    return null;
  }
}

class MockMouseEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.button = init.button ?? 0; // 0 = primary/left
    this.buttons = init.buttons ?? 1;
    this.bubbles = init.bubbles ?? true;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

// Attach simulated browser environment to global scope before importing target modules
globalThis.MockMouseEvent = MockMouseEvent;
globalThis.MockHTMLCanvasElement = MockHTMLCanvasElement;

const appContainer = new MockElement('div');
appContainer.id = 'app';

globalThis.document = {
  getElementById: (id) => (id === 'app' ? appContainer : null),
  createElement: (tagName) => {
    if (tagName.toLowerCase() === 'canvas') {
      return new MockHTMLCanvasElement();
    }
    return new MockElement(tagName);
  },
};

globalThis.window = new MockEventTarget();
globalThis.MouseEvent = MockMouseEvent;

// Dynamic import of target modules to ensure globals are active during module initialization
const { Chart } = await import('../src/chart.js');
const mainModule = await import('../src/main.js');

describe('STORY 29.2.1: Resolve UNRESPONSIVE_CANVAS_PAN (Defect ID: DF-GESTURE-01)', () => {
  let app;
  let chartInstance;
  let canvas;

  beforeEach(() => {
    // Reset app container
    appContainer.children = [];
    app = appContainer;

    // Boot or mount through main entrypoint
    if (typeof mainModule.init === 'function') {
      chartInstance = mainModule.init();
    } else if (typeof mainModule.bootstrap === 'function') {
      chartInstance = mainModule.bootstrap();
    } else if (mainModule.chart) {
      chartInstance = mainModule.chart;
    }

    canvas = app.querySelector('canvas') || chartInstance?.canvas;
  });

  afterEach(() => {
    if (chartInstance && typeof chartInstance.destroy === 'function') {
      chartInstance.destroy();
    }
  });

  describe('Architectural Invariant: Active Entrypoint Wiring', () => {
    it('should mount canvas inside document.getElementById("app") via src/main.js', () => {
      const mountedCanvas = app.querySelector('canvas');
      assert.ok(
        mountedCanvas,
        'Active entrypoint (src/main.js) must mount canvas to document.getElementById("app")'
      );
      assert.strictEqual(
        mountedCanvas.tagName,
        'CANVAS',
        'Mounted child must be a canvas element'
      );
    });

    it('should bind the active Chart instance to the mounted canvas element', () => {
      assert.ok(chartInstance, 'Entrypoint must expose or instantiate an active Chart instance');
      assert.strictEqual(
        chartInstance.canvas,
        app.querySelector('canvas'),
        'Chart instance canvas reference must match the mounted app canvas'
      );
    });
  });

  describe('Acceptance Criteria 1: Mousedown and Mousemove Viewport Translation & Re-render', () => {
    it('should update canvas viewport translation offset on drag gestures', () => {
      // Establish baseline viewport translation
      const initialViewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      // 1. Dispatch mousedown at starting position (100, 100)
      const downEvent = new MockMouseEvent('mousedown', {
        clientX: 100,
        clientY: 100,
        button: 0,
      });
      canvas.dispatchEvent(downEvent);

      // 2. Dispatch mousemove drag to (175, 140) => dx = +75, dy = +40
      const moveEvent = new MockMouseEvent('mousemove', {
        clientX: 175,
        clientY: 140,
        button: 0,
      });
      canvas.dispatchEvent(moveEvent);

      const updatedViewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      const deltaX = updatedViewport.x - initialViewport.x;
      const deltaY = updatedViewport.y - initialViewport.y;

      // Defect DF-GESTURE-01 check: zero pixel changes or viewport matrix updates
      assert.notStrictEqual(
        deltaX,
        0,
        'Viewport translation offset X must not remain 0 after mouse drag'
      );
      assert.notStrictEqual(
        deltaY,
        0,
        'Viewport translation offset Y must not remain 0 after mouse drag'
      );
      assert.strictEqual(
        deltaX,
        75,
        'Viewport offset X must translate by exact drag delta (+75)'
      );
      assert.strictEqual(
        deltaY,
        40,
        'Viewport offset Y must translate by exact drag delta (+40)'
      );
    });

    it('should trigger re-render reflecting updated pan coordinates upon dragging', () => {
      const ctx = canvas.getContext('2d');
      const initialRenderCount = chartInstance.renderCount ?? ctx.renderCalls;

      // Initiate drag
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 200, clientY: 200, button: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 250, clientY: 220, button: 0 }));

      const postDragRenderCount = chartInstance.renderCount ?? ctx.renderCalls;

      assert.ok(
        postDragRenderCount > initialRenderCount,
        'Canvas re-render must be triggered after mousemove drag updates viewport'
      );

      // Confirm transformation matrix was updated on context
      const hasMatrixUpdate = ctx.transformHistory.some(
        (entry) =>
          (entry.type === 'translate' && (entry.args.dx !== 0 || entry.args.dy !== 0)) ||
          (entry.type === 'setTransform' && (entry.args.e !== 0 || entry.args.f !== 0))
      );
      assert.ok(hasMatrixUpdate, 'Canvas 2D context transform matrix must reflect the pan operation');
    });

    it('should accumulate incremental translation across multiple mousemove events in a single drag', () => {
      const initialViewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      // Drag sequence: (50, 50) -> (70, 60) -> (100, 90)
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 50, clientY: 50, button: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 70, clientY: 60, button: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 100, clientY: 90, button: 0 }));

      const finalViewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      assert.strictEqual(
        finalViewport.x - initialViewport.x,
        50,
        'Cumulative translation X must equal total displacement (100 - 50 = +50)'
      );
      assert.strictEqual(
        finalViewport.y - initialViewport.y,
        40,
        'Cumulative translation Y must equal total displacement (90 - 50 = +40)'
      );
    });

    it('should ignore mousemove events when mousedown was not initiated (no active pan)', () => {
      const initialViewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      // Passive hover without mousedown
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 300, clientY: 300, button: 0 }));

      const currentViewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      assert.strictEqual(currentViewport.x, initialViewport.x, 'Hover mousemove must not alter viewport X');
      assert.strictEqual(currentViewport.y, initialViewport.y, 'Hover mousemove must not alter viewport Y');
    });
  });

  describe('Acceptance Criteria 2: Pan Termination and Viewport Locking', () => {
    it('should terminate pan tracking and lock viewport offset on mouseup without resetting position', () => {
      // Start and execute drag
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 180, clientY: 160, button: 0 }));

      const lockedViewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      // Dispatch mouseup to terminate pan tracking
      canvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 180, clientY: 160, button: 0 }));

      // Viewport must lock at current coordinates, NOT reset to origin (0, 0)
      assert.strictEqual(
        lockedViewport.x,
        chartInstance.viewport ? chartInstance.viewport.x : lockedViewport.x,
        'Viewport must remain locked at current position immediately after mouseup'
      );

      // Subsequent mousemove should NOT alter the locked viewport
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 300, clientY: 300, button: 0 }));

      const postUpViewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      assert.strictEqual(
        postUpViewport.x,
        lockedViewport.x,
        'Viewport X must remain locked at pan offset and ignore mousemove after mouseup'
      );
      assert.strictEqual(
        postUpViewport.y,
        lockedViewport.y,
        'Viewport Y must remain locked at pan offset and ignore mousemove after mouseup'
      );
    });

    it('should terminate pan tracking and lock viewport offset on mouseleave without resetting position', () => {
      // Start and execute drag
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 200, clientY: 200, button: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 240, clientY: 230, button: 0 }));

      const offsetBeforeLeave = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      // Dispatch mouseleave
      canvas.dispatchEvent(new MockMouseEvent('mouseleave', { clientX: 240, clientY: 230 }));

      // Verify viewport did not snap back to default
      const offsetAfterLeave = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      assert.strictEqual(
        offsetAfterLeave.x,
        offsetBeforeLeave.x,
        'Viewport X must lock at current pan position upon mouseleave'
      );
      assert.strictEqual(
        offsetAfterLeave.y,
        offsetBeforeLeave.y,
        'Viewport Y must lock at current pan position upon mouseleave'
      );

      // Move mouse outside while unclicked -> must not pan
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 500, clientY: 500, button: 0 }));

      const finalOffset = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      assert.strictEqual(finalOffset.x, offsetBeforeLeave.x, 'Pan tracking must be inactive after mouseleave');
      assert.strictEqual(finalOffset.y, offsetBeforeLeave.y, 'Pan tracking must be inactive after mouseleave');
    });

    it('should support subsequent distinct drag interactions preserving previous pan offsets', () => {
      // Drag session 1: delta +50, +30
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 150, clientY: 130, button: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 150, clientY: 130, button: 0 }));

      const session1Viewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      // Drag session 2: delta +20, -10 starting from a new point
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 300, clientY: 300, button: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 320, clientY: 290, button: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 320, clientY: 290, button: 0 }));

      const session2Viewport = chartInstance.getViewportOffset
        ? chartInstance.getViewportOffset()
        : { x: chartInstance.viewport.x, y: chartInstance.viewport.y };

      assert.strictEqual(
        session2Viewport.x - session1Viewport.x,
        20,
        'Second drag must incrementally translate from previous locked position on X'
      );
      assert.strictEqual(
        session2Viewport.y - session1Viewport.y,
        -10,
        'Second drag must incrementally translate from previous locked position on Y'
      );
    });
  });

  describe('Isolated Chart Module Gesture Panning Unit Tests (src/chart.js)', () => {
    it('should expose pan(dx, dy) API or handle pan gestures directly on chart canvas', () => {
      const standaloneCanvas = new MockHTMLCanvasElement();
      const chart = new Chart({ canvas: standaloneCanvas });

      const initialX = chart.viewport?.x ?? 0;
      const initialY = chart.viewport?.y ?? 0;

      if (typeof chart.pan === 'function') {
        chart.pan(30, 45);
        assert.strictEqual(chart.viewport.x, initialX + 30);
        assert.strictEqual(chart.viewport.y, initialY + 45);
      } else {
        // Must support canvas event listeners attached in constructor
        standaloneCanvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 10, clientY: 10, button: 0 }));
        standaloneCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 40, clientY: 55, button: 0 }));
        standaloneCanvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 40, clientY: 55, button: 0 }));

        const finalX = chart.viewport?.x ?? chart.getViewportOffset().x;
        const finalY = chart.viewport?.y ?? chart.getViewportOffset().y;

        assert.strictEqual(finalX, initialX + 30, 'Chart must update internal viewport X on gesture');
        assert.strictEqual(finalY, initialY + 45, 'Chart must update internal viewport Y on gesture');
      }
    });

    it('should ignore non-primary mouse clicks (e.g. right click) for canvas panning', () => {
      const standaloneCanvas = new MockHTMLCanvasElement();
      const chart = new Chart({ canvas: standaloneCanvas });

      const startX = chart.viewport?.x ?? 0;
      const startY = chart.viewport?.y ?? 0;

      // Right-click drag (button: 2)
      standaloneCanvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 50, clientY: 50, button: 2 }));
      standaloneCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 100, clientY: 100, button: 2 }));

      const currentX = chart.viewport?.x ?? (chart.getViewportOffset ? chart.getViewportOffset().x : startX);
      const currentY = chart.viewport?.y ?? (chart.getViewportOffset ? chart.getViewportOffset().y : startY);

      assert.strictEqual(currentX, startX, 'Secondary mouse button drag must not pan viewport X');
      assert.strictEqual(currentY, startY, 'Secondary mouse button drag must not pan viewport Y');
    });
  });
});