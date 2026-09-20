import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ChartCanvas } from '../src/main.js';

/**
 * Mock 2D Rendering Context to track operations deterministically in Node.js
 */
class MockCanvasRenderingContext2D {
  constructor() {
    this.calls = [];
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: 'clearRect', args: [x, y, w, h] });
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

  fillRect(x, y, w, h) {
    this.calls.push({ method: 'fillRect', args: [x, y, w, h] });
  }

  strokeRect(x, y, w, h) {
    this.calls.push({ method: 'strokeRect', args: [x, y, w, h] });
  }

  save() {
    this.calls.push({ method: 'save', args: [] });
  }

  restore() {
    this.calls.push({ method: 'restore', args: [] });
  }

  translate(x, y) {
    this.calls.push({ method: 'translate', args: [x, y] });
  }

  setTransform(...args) {
    this.calls.push({ method: 'setTransform', args });
  }

  resetCallHistory() {
    this.calls = [];
  }
}

/**
 * Mock Canvas Element supporting event dispatching and 2D context
 */
class MockCanvas {
  constructor(width = 800, height = 600) {
    this.tagName = 'CANVAS';
    this.width = width;
    this.height = height;
    this.context = new MockCanvasRenderingContext2D();
    this.listeners = new Map();
  }

  getContext(type) {
    if (type === '2d') {
      return this.context;
    }
    return null;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
      x: 0,
      y: 0,
    };
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(listener);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
    return !event.defaultPrevented;
  }
}

/**
 * Helper to create synthetic MouseEvent objects
 */
function createMouseEvent(type, { clientX = 0, clientY = 0, button = 0, buttons = 1 } = {}) {
  return {
    type,
    clientX,
    clientY,
    button,
    buttons,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
  };
}

/**
 * Helper to inspect the viewport offset from ChartCanvas
 */
function getViewportOffset(chart) {
  if (typeof chart.getViewportOffset === 'function') {
    return chart.getViewportOffset();
  }
  if (chart.viewport && typeof chart.viewport.offsetX === 'number') {
    return { x: chart.viewport.offsetX, y: chart.viewport.offsetY };
  }
  if (chart.viewportOffset) {
    return { x: chart.viewportOffset.x, y: chart.viewportOffset.y };
  }
  return { x: chart.offsetX ?? 0, y: chart.offsetY ?? 0 };
}

const sampleCandlesticks = [
  { timestamp: 1620000000, open: 100, high: 110, low: 95, close: 105, volume: 1000 },
  { timestamp: 1620000060, open: 105, high: 115, low: 102, close: 112, volume: 1500 },
  { timestamp: 1620000120, open: 112, high: 114, low: 98, close: 101, volume: 800 },
  { timestamp: 1620000180, open: 101, high: 108, low: 100, close: 107, volume: 1200 },
];

describe('STORY 1.1.1: Resolve UNRESPONSIVE_CANVAS_PAN (DF-GESTURE-01)', () => {
  let canvas;
  let chart;

  beforeEach(() => {
    canvas = new MockCanvas(800, 600);
    chart = new ChartCanvas(canvas, {
      data: sampleCandlesticks,
      initialOffset: { x: 0, y: 0 },
    });
    chart.render();
    canvas.context.resetCallHistory();
  });

  describe('Acceptance Criteria 1: Dragging updates viewport offset and triggers re-render', () => {
    it('should update viewport offset when user drags mouse across canvas', () => {
      const initialOffset = getViewportOffset(chart);
      assert.deepEqual(initialOffset, { x: 0, y: 0 }, 'Initial viewport offset must be at origin');

      // 1. Mouse down at (100, 100)
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));

      // 2. Mouse drag to (160, 140) => delta (+60, +40)
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 160, clientY: 140, button: 0 }));

      const updatedOffset = getViewportOffset(chart);
      assert.notDeepEqual(
        updatedOffset,
        initialOffset,
        'Viewport offset must update during drag (DF-GESTURE-01: zero pixel updates)'
      );
      assert.equal(updatedOffset.x, 60, 'Viewport X offset must reflect drag delta (+60px)');
      assert.equal(updatedOffset.y, 40, 'Viewport Y offset must reflect drag delta (+40px)');
    });

    it('should re-render candlesticks when mouse drag updates the position', () => {
      // Initiate drag
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 200, clientY: 200, button: 0 }));

      canvas.context.resetCallHistory();

      // Drag to new coordinate
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 250, clientY: 210, button: 0 }));

      // Re-render must have executed clear and redraw commands
      const clearCalls = canvas.context.calls.filter((c) => c.method === 'clearRect');
      const drawCalls = canvas.context.calls.filter(
        (c) => c.method === 'fillRect' || c.method === 'stroke' || c.method === 'strokeRect'
      );

      assert.ok(
        clearCalls.length >= 1,
        'Canvas must clear previous frame during pan re-render'
      );
      assert.ok(
        drawCalls.length > 0,
        'Candlesticks must be re-rendered onto canvas at updated viewport position'
      );
    });

    it('should incrementally update viewport offset during continuous dragging', () => {
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 50, clientY: 50, button: 0 }));

      // Step 1: Drag to (70, 60) -> dx: +20, dy: +10
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 70, clientY: 60, button: 0 }));
      let offset = getViewportOffset(chart);
      assert.equal(offset.x, 20);
      assert.equal(offset.y, 10);

      // Step 2: Drag further to (100, 80) -> total dx: +50, total dy: +30
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 100, clientY: 80, button: 0 }));
      offset = getViewportOffset(chart);
      assert.equal(offset.x, 50);
      assert.equal(offset.y, 30);

      // Step 3: Drag in opposite direction to (30, 20) -> total dx: -20, total dy: -30
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 30, clientY: 20, button: 0 }));
      offset = getViewportOffset(chart);
      assert.equal(offset.x, -20);
      assert.equal(offset.y, -30);
    });

    it('should NOT update viewport offset when mouse moves without mouse down', () => {
      const initialOffset = getViewportOffset(chart);

      // Hovering without clicking
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 300, clientY: 300, button: 0, buttons: 0 }));

      const offsetAfterHover = getViewportOffset(chart);
      assert.deepEqual(
        offsetAfterHover,
        initialOffset,
        'Hovering without active drag must not alter viewport offset'
      );
      assert.equal(
        canvas.context.calls.length,
        0,
        'Hovering without active drag must not trigger pan re-renders'
      );
    });

    it('should ignore dragging when initiated with secondary (non-left) mouse button', () => {
      const initialOffset = getViewportOffset(chart);

      // Right-click drag (button = 2)
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 2, buttons: 2 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 180, clientY: 180, button: 2, buttons: 2 }));

      const currentOffset = getViewportOffset(chart);
      assert.deepEqual(
        currentOffset,
        initialOffset,
        'Right mouse button drag must not engage canvas panning'
      );
    });
  });

  describe('Acceptance Criteria 2: Panning termination and offset preservation', () => {
    it('should terminate panning and preserve offset when mouse button is released (mouseup)', () => {
      // 1. Begin drag
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 180, clientY: 150, button: 0 }));

      const offsetAtRelease = getViewportOffset(chart);
      assert.equal(offsetAtRelease.x, 80);
      assert.equal(offsetAtRelease.y, 50);

      // 2. Release mouse button
      canvas.dispatchEvent(createMouseEvent('mouseup', { clientX: 180, clientY: 150, button: 0, buttons: 0 }));

      if ('isPanning' in chart) {
        assert.equal(chart.isPanning, false, 'Panning state must be inactive after mouseup');
      }

      // 3. Subsequent mouse movement must NOT modify the preserved offset
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 250, clientY: 220, button: 0, buttons: 0 }));

      const preservedOffset = getViewportOffset(chart);
      assert.deepEqual(
        preservedOffset,
        offsetAtRelease,
        'Viewport offset must remain preserved after mouseup'
      );
    });

    it('should terminate panning and preserve offset when mouse leaves canvas bounds (mouseleave)', () => {
      // 1. Begin drag
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 200, clientY: 200, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 240, clientY: 260, button: 0 }));

      const offsetBeforeExit = getViewportOffset(chart);
      assert.equal(offsetBeforeExit.x, 40);
      assert.equal(offsetBeforeExit.y, 60);

      // 2. Cursor leaves canvas boundary
      canvas.dispatchEvent(createMouseEvent('mouseleave', { clientX: 805, clientY: 260, button: 0, buttons: 0 }));

      if ('isPanning' in chart) {
        assert.equal(chart.isPanning, false, 'Panning state must be inactive after mouseleave');
      }

      // 3. Move event outside/re-entering without mousedown must not alter offset
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 300, clientY: 300, button: 0, buttons: 0 }));

      const preservedOffset = getViewportOffset(chart);
      assert.deepEqual(
        preservedOffset,
        offsetBeforeExit,
        'Viewport offset must remain preserved after mouseleave'
      );
    });

    it('should accumulate viewport offsets correctly across multiple distinct pan sessions', () => {
      // Session 1: Drag (+50, +30) then release
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 150, clientY: 130, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mouseup', { clientX: 150, clientY: 130, button: 0 }));

      const offsetSession1 = getViewportOffset(chart);
      assert.equal(offsetSession1.x, 50);
      assert.equal(offsetSession1.y, 30);

      // Session 2: Drag from different origin (+25, -15) then leave canvas
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 300, clientY: 300, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 325, clientY: 285, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mouseleave', { clientX: 801, clientY: 285, button: 0 }));

      const offsetSession2 = getViewportOffset(chart);
      assert.equal(offsetSession2.x, 75, 'Accumulated viewport X must sum both drag sessions (50 + 25)');
      assert.equal(offsetSession2.y, 15, 'Accumulated viewport Y must sum both drag sessions (30 - 15)');
    });

    it('should maintain stable offset when mousedown and mouseup occur at exact same point (click without drag)', () => {
      const initialOffset = getViewportOffset(chart);

      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 150, clientY: 150, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mouseup', { clientX: 150, clientY: 150, button: 0 }));

      const finalOffset = getViewportOffset(chart);
      assert.deepEqual(finalOffset, initialOffset, 'Stationary click must not corrupt viewport offset');
    });
  });
});