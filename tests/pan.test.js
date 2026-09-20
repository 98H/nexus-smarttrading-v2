import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Chart } from '../src/chart.js';
import * as main from '../src/main.js';

/*
 * Test Mock Infrastructure
 * Provides deterministic simulation of DOM, Canvas 2D Context, and MouseEvents
 * to validate gesture handling and viewport transformations in Node.js.
 */

class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
    this.currentTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: 'clearRect', args: [x, y, w, h] });
  }

  fillRect(x, y, w, h) {
    this.calls.push({ method: 'fillRect', args: [x, y, w, h] });
  }

  strokeRect(x, y, w, h) {
    this.calls.push({ method: 'strokeRect', args: [x, y, w, h] });
  }

  beginPath() {
    this.calls.push({ method: 'beginPath', args: [] });
  }

  moveTo(x, y) {
    this.calls.push({ method: 'moveTo', args: [x, y] });
  }

  lineTo(x, y) {
    this.calls.push({ method: 'lineTo', args: [x, y] });
  }

  stroke() {
    this.calls.push({ method: 'stroke', args: [] });
  }

  fill() {
    this.calls.push({ method: 'fill', args: [] });
  }

  save() {
    this.calls.push({ method: 'save', args: [] });
  }

  restore() {
    this.calls.push({ method: 'restore', args: [] });
  }

  translate(x, y) {
    this.currentTransform.e += x;
    this.currentTransform.f += y;
    this.calls.push({ method: 'translate', args: [x, y] });
  }

  setTransform(a, b, c, d, e, f) {
    this.currentTransform = { a, b, c, d, e, f };
    this.calls.push({ method: 'setTransform', args: [a, b, c, d, e, f] });
  }

  resetTransform() {
    this.currentTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    this.calls.push({ method: 'resetTransform', args: [] });
  }

  clearCallHistory() {
    this.calls = [];
  }
}

class MockCanvasElement {
  constructor() {
    this.tagName = 'CANVAS';
    this.width = 800;
    this.height = 600;
    this.listeners = new Map();
    this.context = new MockCanvasRenderingContext2D(this);
    this.parentElement = null;
    this.style = {};
  }

  getContext(type) {
    if (type === '2d') return this.context;
    return null;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 };
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    if (!this.listeners.has(type)) return;
    this.listeners.set(
      type,
      this.listeners.get(type).filter((fn) => fn !== handler)
    );
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler.call(this, event);
    }
    return !event.defaultPrevented;
  }
}

class MockContainerElement {
  constructor(id = 'app') {
    this.id = id;
    this.tagName = 'DIV';
    this.children = [];
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  querySelector(selector) {
    if (selector === 'canvas') {
      return this.children.find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === 'canvas') {
      return this.children.filter((c) => c.tagName === 'CANVAS');
    }
    return [];
  }
}

class MockMouseEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.button = init.button ?? 0;
    this.buttons = init.buttons ?? 1;
    this.movementX = init.movementX ?? 0;
    this.movementY = init.movementY ?? 0;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {}
}

// Sample candlestick data for rendering verification
const mockCandlestickData = [
  { time: 1620000000, open: 100, high: 110, low: 95, close: 105 },
  { time: 1620003600, open: 105, high: 115, low: 102, close: 112 },
  { time: 1620007200, open: 112, high: 120, low: 108, close: 118 },
  { time: 1620010800, open: 118, high: 122, low: 114, close: 115 },
];

// Helper to extract viewport offset across various implementation styles
function getViewportOffset(chart) {
  if (typeof chart.getViewportOffset === 'function') {
    return chart.getViewportOffset();
  }
  if (chart.viewportOffset) {
    return { x: chart.viewportOffset.x, y: chart.viewportOffset.y };
  }
  if (chart.viewport) {
    return {
      x: chart.viewport.offsetX ?? chart.viewport.x ?? 0,
      y: chart.viewport.offsetY ?? chart.viewport.y ?? 0,
    };
  }
  return { x: chart.offsetX ?? 0, y: chart.offsetY ?? 0 };
}

describe('STORY 1.2.1: Resolve UNRESPONSIVE_CANVAS_PAN (DF-GESTURE-01)', () => {
  let originalDocument;
  let originalWindow;
  let originalMouseEvent;
  let appElement;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    originalMouseEvent = globalThis.MouseEvent;

    appElement = new MockContainerElement('app');

    globalThis.MouseEvent = MockMouseEvent;
    globalThis.document = {
      getElementById: (id) => (id === 'app' ? appElement : null),
      querySelector: (selector) => {
        if (selector === '#app') return appElement;
        if (selector === '#app canvas' || selector === 'canvas') {
          return appElement.querySelector('canvas');
        }
        return null;
      },
      createElement: (tag) => {
        if (tag.toLowerCase() === 'canvas') {
          return new MockCanvasElement();
        }
        return new MockContainerElement();
      },
    };
    globalThis.window = globalThis;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.MouseEvent = originalMouseEvent;
  });

  describe('Acceptance Criteria 1: Drag Pan Delta and Candlestick Series Shift', () => {
    it('should update viewport offset by drag delta (dx, dy) when mousedown and mousemove are dispatched', () => {
      const canvas = new MockCanvasElement();
      const chart = new Chart(canvas, { data: mockCandlestickData });

      // Initial viewport offset must be at origin (0, 0)
      const initialOffset = getViewportOffset(chart);
      assert.strictEqual(initialOffset.x, 0, 'Initial viewport offset X must be 0');
      assert.strictEqual(initialOffset.y, 0, 'Initial viewport offset Y must be 0');

      // Step 1: Initiate drag sequence at (100, 150)
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 150, button: 0, buttons: 1 }));
      assert.strictEqual(chart.isPanning, true, 'isPanning state must be true after mousedown');

      // Step 2: Drag to (160, 190) -> deltaX = +60, deltaY = +40
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 160, clientY: 190, button: 0, buttons: 1 }));

      const updatedOffset = getViewportOffset(chart);
      assert.strictEqual(
        updatedOffset.x,
        60,
        'Viewport offset X must update exactly by drag delta (+60)'
      );
      assert.strictEqual(
        updatedOffset.y,
        40,
        'Viewport offset Y must update exactly by drag delta (+40)'
      );
    });

    it('should re-render candlestick series at shifted coordinates upon drag pan delta', () => {
      const canvas = new MockCanvasElement();
      const chart = new Chart(canvas, { data: mockCandlestickData });
      const ctx = canvas.getContext('2d');

      // Capture initial render call count
      const initialDrawCount = ctx.calls.length;
      assert.ok(initialDrawCount > 0, 'Initial candlestick chart render must execute draw commands');

      ctx.clearCallHistory();

      // Dispatch mousedown and mousemove drag
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 200, clientY: 200, buttons: 1 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 250, clientY: 220, buttons: 1 }));

      // Verify redraw was executed
      assert.ok(
        ctx.calls.length > 0,
        'Candlestick series re-render must be triggered after mouse drag'
      );

      // Verify canvas was either cleared or matrix/coordinates transformed with offset
      const hasClearRect = ctx.calls.some((c) => c.method === 'clearRect');
      const hasTransformOrTranslate = ctx.calls.some(
        (c) => c.method === 'translate' || c.method === 'setTransform'
      );
      const hasDrawingOp = ctx.calls.some(
        (c) => c.method === 'fillRect' || c.method === 'stroke' || c.method === 'lineTo'
      );

      assert.ok(
        hasClearRect,
        'Chart must invoke clearRect to wipe previous viewport buffer before rendering shifted frame'
      );
      assert.ok(
        hasTransformOrTranslate || hasDrawingOp,
        'Chart must apply matrix translation or calculate shifted coordinates for candlestick series'
      );

      // If matrix translation is used, verify translation offsets match delta (+50, +20)
      if (hasTransformOrTranslate) {
        const translateCall = ctx.calls.find((c) => c.method === 'translate');
        if (translateCall) {
          assert.strictEqual(translateCall.args[0], 50, 'Translation X must match pan delta 50');
          assert.strictEqual(translateCall.args[1], 20, 'Translation Y must match pan delta 20');
        }
      }
    });

    it('should accumulate drag delta across continuous mousemove drag events', () => {
      const canvas = new MockCanvasElement();
      const chart = new Chart(canvas, { data: mockCandlestickData });

      // Start drag at (100, 100)
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 100, buttons: 1 }));

      // Move 1: to (120, 110) -> delta: +20, +10
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 120, clientY: 110, buttons: 1 }));
      let offset = getViewportOffset(chart);
      assert.strictEqual(offset.x, 20, 'Viewport X after move 1 must be 20');
      assert.strictEqual(offset.y, 10, 'Viewport Y after move 1 must be 10');

      // Move 2: to (150, 135) -> cumulative delta from start: +50, +35
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 150, clientY: 135, buttons: 1 }));
      offset = getViewportOffset(chart);
      assert.strictEqual(offset.x, 50, 'Viewport X after move 2 must accumulate to 50');
      assert.strictEqual(offset.y, 35, 'Viewport Y after move 2 must accumulate to 35');

      // Move 3: drag backwards to (80, 70) -> cumulative delta from start: -20, -30
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 80, clientY: 70, buttons: 1 }));
      offset = getViewportOffset(chart);
      assert.strictEqual(offset.x, -20, 'Viewport X must reflect negative delta (-20)');
      assert.strictEqual(offset.y, -30, 'Viewport Y must reflect negative delta (-30)');
    });
  });

  describe('Acceptance Criteria 2: Pan State Deactivation on mouseup and mouseleave', () => {
    it('should deactivate panning on mouseup and freeze viewport offset during subsequent mouse movements', () => {
      const canvas = new MockCanvasElement();
      const chart = new Chart(canvas, { data: mockCandlestickData });
      const ctx = canvas.getContext('2d');

      // Drag to (150, 150) from (100, 100)
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 100, buttons: 1 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 150, clientY: 150, buttons: 1 }));

      assert.strictEqual(chart.isPanning, true, 'isPanning must be true while dragging');
      const offsetAtRelease = getViewportOffset(chart);
      assert.strictEqual(offsetAtRelease.x, 50);
      assert.strictEqual(offsetAtRelease.y, 50);

      // Trigger mouseup
      canvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 150, clientY: 150, buttons: 0 }));

      assert.strictEqual(chart.isPanning, false, 'isPanning state must deactivate (false) on mouseup');

      ctx.clearCallHistory();

      // Subsequent mousemove should NOT alter viewport offset
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 300, clientY: 300, buttons: 0 }));

      const offsetAfterMove = getViewportOffset(chart);
      assert.strictEqual(
        offsetAfterMove.x,
        50,
        'Viewport offset X must remain locked at 50 after mouseup'
      );
      assert.strictEqual(
        offsetAfterMove.y,
        50,
        'Viewport offset Y must remain locked at 50 after mouseup'
      );
      assert.strictEqual(
        ctx.calls.length,
        0,
        'No re-render operations should be triggered by inactive mousemove'
      );
    });

    it('should deactivate panning on mouseleave and ignore subsequent mouse movements outside canvas', () => {
      const canvas = new MockCanvasElement();
      const chart = new Chart(canvas, { data: mockCandlestickData });

      // Drag sequence
      canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 50, clientY: 50, buttons: 1 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 80, clientY: 90, buttons: 1 }));

      assert.strictEqual(chart.isPanning, true);
      const lockedOffset = getViewportOffset(chart);
      assert.strictEqual(lockedOffset.x, 30);
      assert.strictEqual(lockedOffset.y, 40);

      // Cursor leaves canvas area
      canvas.dispatchEvent(new MockMouseEvent('mouseleave', { clientX: 80, clientY: 90 }));

      assert.strictEqual(
        chart.isPanning,
        false,
        'isPanning state must deactivate immediately when mouse leaves canvas'
      );

      // Dispatched moves should not change offset
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 200, clientY: 250, buttons: 0 }));

      const currentOffset = getViewportOffset(chart);
      assert.strictEqual(
        currentOffset.x,
        30,
        'Viewport offset X must remain unchanged after mouseleave'
      );
      assert.strictEqual(
        currentOffset.y,
        40,
        'Viewport offset Y must remain unchanged after mouseleave'
      );
    });

    it('should ignore mousemove events if mousedown was never initiated', () => {
      const canvas = new MockCanvasElement();
      const chart = new Chart(canvas, { data: mockCandlestickData });

      // Move mouse across canvas without mousedown
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 100, clientY: 100, buttons: 0 }));
      canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 250, clientY: 300, buttons: 0 }));

      assert.strictEqual(chart.isPanning, false, 'isPanning must remain false');
      const offset = getViewportOffset(chart);
      assert.strictEqual(offset.x, 0, 'Offset X must remain 0 when no drag occurred');
      assert.strictEqual(offset.y, 0, 'Offset Y must remain 0 when no drag occurred');
    });
  });

  describe('Architectural Invariant: Live Entrypoint Wiring (src/main.js & #app)', () => {
    it('should mount canvas into "#app" container and attach active pannable Chart instance', () => {
      // Ensure #app exists in DOM
      const container = globalThis.document.querySelector('#app');
      assert.ok(container, '#app container must exist in the document');

      // Execute entrypoint boot/mount
      if (typeof main.mount === 'function') {
        main.mount('#app');
      } else if (typeof main.init === 'function') {
        main.init('#app');
      } else if (typeof main.bootstrap === 'function') {
        main.bootstrap();
      }

      // Architectural Invariant check: #app must contain mounted canvas element
      const mountedCanvas = container.querySelector('canvas');
      assert.ok(
        mountedCanvas,
        'Architectural invariant violated: src/main.js must mount a canvas element into "#app"'
      );

      // Verify canvas event listeners for panning are wired
      const hasMouseDown = mountedCanvas.listeners.has('mousedown');
      const hasMouseMove = mountedCanvas.listeners.has('mousemove');
      const hasMouseUp = mountedCanvas.listeners.has('mouseup');
      const hasMouseLeave = mountedCanvas.listeners.has('mouseleave');

      assert.ok(hasMouseDown, 'Mounted canvas must have "mousedown" listener attached');
      assert.ok(hasMouseMove, 'Mounted canvas must have "mousemove" listener attached');
      assert.ok(hasMouseUp, 'Mounted canvas must have "mouseup" listener attached');
      assert.ok(hasMouseLeave, 'Mounted canvas must have "mouseleave" listener attached');
    });

    it('should allow end-to-end user drag panning directly through the active "#app" canvas', () => {
      // Initialize application entrypoint
      if (typeof main.mount === 'function') {
        main.mount('#app');
      } else if (typeof main.init === 'function') {
        main.init('#app');
      } else if (typeof main.bootstrap === 'function') {
        main.bootstrap();
      }

      const activeCanvas = globalThis.document.querySelector('#app canvas');
      assert.ok(activeCanvas, 'Active canvas in #app must be accessible for gesture testing');

      const ctx = activeCanvas.getContext('2d');
      ctx.clearCallHistory();

      // Dispatch full user drag gesture sequence on the mounted live canvas
      activeCanvas.dispatchEvent(
        new MockMouseEvent('mousedown', { clientX: 200, clientY: 200, button: 0, buttons: 1 })
      );
      activeCanvas.dispatchEvent(
        new MockMouseEvent('mousemove', { clientX: 275, clientY: 230, button: 0, buttons: 1 })
      );

      // Assert that defect DF-GESTURE-01 is resolved: zero pixel/matrix updates must NOT occur
      assert.ok(
        ctx.calls.length > 0,
        'Defect DF-GESTURE-01 check: Dispatching drag across live canvas must produce rendering updates'
      );

      // Check chart instance if exposed via main or attached to canvas
      const chartInstance = activeCanvas.__chart || main.chart || main.getChart?.();
      if (chartInstance) {
        const offset = getViewportOffset(chartInstance);
        assert.strictEqual(
          offset.x,
          75,
          'Live chart viewport offset X must be updated by drag delta (+75)'
        );
        assert.strictEqual(
          offset.y,
          30,
          'Live chart viewport offset Y must be updated by drag delta (+30)'
        );
      }

      // Complete drag release
      activeCanvas.dispatchEvent(
        new MockMouseEvent('mouseup', { clientX: 275, clientY: 230, button: 0, buttons: 0 })
      );

      if (chartInstance) {
        assert.strictEqual(
          chartInstance.isPanning,
          false,
          'Live chart isPanning state must be deactivated after mouseup'
        );
      }
    });
  });
});