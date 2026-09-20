import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ChartCanvas } from '../src/main.js';

/**
 * Creates a synthetic DOM-like Canvas mock implementing the Minimal EventTarget
 * interface required for gesture lifecycle testing in Node.js.
 *
 * @param {number} width
 * @param {number} height
 * @returns {object} Mock canvas instance
 */
function createMockCanvas(width = 800, height = 600) {
  const eventListeners = new Map();

  return {
    width,
    height,
    addEventListener(type, handler) {
      if (!eventListeners.has(type)) {
        eventListeners.set(type, new Set());
      }
      eventListeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      if (eventListeners.has(type)) {
        eventListeners.get(type).delete(handler);
      }
    },
    dispatchEvent(event) {
      const handlers = eventListeners.get(event.type);
      if (handlers) {
        for (const handler of handlers) {
          handler(event);
        }
      }
      return true;
    },
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height,
        x: 0,
        y: 0,
      };
    },
    getContext() {
      return {
        setTransform: () => {},
        clearRect: () => {},
        save: () => {},
        restore: () => {},
      };
    },
  };
}

/**
 * Helper to construct synthetic MouseEvents.
 *
 * @param {string} type - Event type (e.g., 'mousedown', 'mousemove', 'mouseup', 'mouseleave')
 * @param {object} props - Mouse coordinates and button information
 * @returns {object} Synthetic event object
 */
function createMouseEvent(type, { clientX = 0, clientY = 0, button = 0, buttons = 1 } = {}) {
  return {
    type,
    clientX,
    clientY,
    button,
    buttons,
    bubbles: true,
    cancelable: true,
    preventDefault: () => {},
    stopPropagation: () => {},
  };
}

describe('STORY 2.1.1: Resolve UNRESPONSIVE_CANVAS_PAN (Defect ID: DF-GESTURE-01)', () => {
  let canvas;
  let chart;
  const initialElements = [
    { id: 'node-1', x: 100, y: 100, width: 50, height: 50 },
    { id: 'node-2', x: 300, y: 250, width: 60, height: 40 },
  ];

  beforeEach(() => {
    canvas = createMockCanvas(800, 600);
    chart = new ChartCanvas({
      canvas,
      elements: initialElements,
      initialViewport: {
        offsetX: 0,
        offsetY: 0,
        scale: 1.0,
      },
    });
  });

  describe('AC1: Viewport Offset Matrix Proportional Updates on Mouse Drag', () => {
    it('should update viewport offset matrix proportionally when dragging across positive deltas', () => {
      // 1. Initial matrix state verification [scaleX, skewY, skewX, scaleY, transX, transY]
      assert.deepStrictEqual(chart.getViewportMatrix(), [1, 0, 0, 1, 0, 0]);
      assert.strictEqual(chart.viewport.offsetX, 0);
      assert.strictEqual(chart.viewport.offsetY, 0);

      // 2. Initiate mousedown at (100, 100)
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));

      // Panning interaction has started
      assert.strictEqual(chart.isPanning, true, 'Canvas must be in panning state after mousedown');

      // 3. Drag to (180, 145) -> deltaX = +80, deltaY = +45
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 180, clientY: 145, button: 0, buttons: 1 }));

      assert.strictEqual(chart.viewport.offsetX, 80, 'Viewport offsetX must equal mouse drag deltaX');
      assert.strictEqual(chart.viewport.offsetY, 45, 'Viewport offsetY must equal mouse drag deltaY');
      assert.deepStrictEqual(
        chart.getViewportMatrix(),
        [1, 0, 0, 1, 80, 45],
        'Viewport transformation matrix must update translation parameters proportionally'
      );
    });

    it('should correctly calculate negative delta offsets when dragging left and upwards', () => {
      // Initiate drag at (250, 300) and drag backwards to (150, 200) -> deltaX = -100, deltaY = -100
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 250, clientY: 300, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 150, clientY: 200, button: 0, buttons: 1 }));

      assert.strictEqual(chart.viewport.offsetX, -100);
      assert.strictEqual(chart.viewport.offsetY, -100);
      assert.deepStrictEqual(chart.getViewportMatrix(), [1, 0, 0, 1, -100, -100]);
    });

    it('should accumulate viewport offsets correctly over multiple incremental mousemove events', () => {
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 50, clientY: 50, button: 0 }));

      // Incremental move 1: delta +20, +15
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 70, clientY: 65, button: 0, buttons: 1 }));
      assert.strictEqual(chart.viewport.offsetX, 20);
      assert.strictEqual(chart.viewport.offsetY, 15);

      // Incremental move 2: delta +30, -5 from original reference
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 100, clientY: 60, button: 0, buttons: 1 }));
      assert.strictEqual(chart.viewport.offsetX, 50);
      assert.strictEqual(chart.viewport.offsetY, 10);
      assert.deepStrictEqual(chart.getViewportMatrix(), [1, 0, 0, 1, 50, 10]);
    });

    it('should NOT update viewport matrix when mousemove occurs without active mousedown', () => {
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 200, clientY: 200, button: 0, buttons: 0 }));

      assert.strictEqual(chart.isPanning, false);
      assert.strictEqual(chart.viewport.offsetX, 0);
      assert.strictEqual(chart.viewport.offsetY, 0);
      assert.deepStrictEqual(chart.getViewportMatrix(), [1, 0, 0, 1, 0, 0]);
    });
  });

  describe('AC2: Re-render Triggering and Visual Element Position Updates', () => {
    it('should trigger a re-render on every panning mousemove event', () => {
      const initialRenders = chart.renderCount;

      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      assert.strictEqual(chart.renderCount, initialRenders, 'Mousedown alone should not trigger visual re-render');

      // First move
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 120, clientY: 130, button: 0, buttons: 1 }));
      assert.strictEqual(chart.renderCount, initialRenders + 1, 'First drag step must trigger re-render');

      // Second move
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 150, clientY: 160, button: 0, buttons: 1 }));
      assert.strictEqual(chart.renderCount, initialRenders + 2, 'Subsequent drag step must trigger re-render');
    });

    it('should dynamically update the computed screen coordinates of chart elements during pan', () => {
      // Node 1 initial visual coordinates at origin offset
      let renderedNode = chart.getElementRenderPosition('node-1');
      assert.deepStrictEqual(renderedNode, { x: 100, y: 100 });

      // Pan by (+60, +40)
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 200, clientY: 200, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 260, clientY: 240, button: 0, buttons: 1 }));

      // Verify transformed screen coordinates
      renderedNode = chart.getElementRenderPosition('node-1');
      assert.deepStrictEqual(
        renderedNode,
        { x: 160, y: 140 },
        'Visual position must reflect the updated viewport translation matrix'
      );

      const renderedNode2 = chart.getElementRenderPosition('node-2');
      assert.deepStrictEqual(
        renderedNode2,
        { x: 360, y: 290 },
        'All elements must translate consistently according to the viewport offset'
      );
    });

    it('should not re-render if mousemove delta is zero during panning', () => {
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 110, clientY: 110, button: 0, buttons: 1 }));
      const rendersAfterFirstMove = chart.renderCount;

      // Dispatch identical coordinates
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 110, clientY: 110, button: 0, buttons: 1 }));
      assert.strictEqual(
        chart.renderCount,
        rendersAfterFirstMove,
        'Redundant mousemove with 0 delta should not trigger redundant re-render'
      );
    });
  });

  describe('AC3: Panning Release and Viewport Offset Persistence', () => {
    it('should release panning state and persist final viewport offset when mouseup is triggered', () => {
      // 1. Drag interaction
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 175, clientY: 125, button: 0, buttons: 1 }));

      assert.strictEqual(chart.isPanning, true);
      assert.strictEqual(chart.viewport.offsetX, 75);
      assert.strictEqual(chart.viewport.offsetY, 25);

      // 2. Conclude interaction via mouseup
      canvas.dispatchEvent(createMouseEvent('mouseup', { clientX: 175, clientY: 125, button: 0, buttons: 0 }));

      assert.strictEqual(chart.isPanning, false, 'Panning state must be released on mouseup');
      assert.strictEqual(chart.viewport.offsetX, 75, 'Final offsetX must persist');
      assert.strictEqual(chart.viewport.offsetY, 25, 'Final offsetY must persist');
      assert.deepStrictEqual(chart.getViewportMatrix(), [1, 0, 0, 1, 75, 25]);

      // 3. Subsequent mousemove without mousedown should NOT alter the persisted viewport
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 300, clientY: 300, button: 0, buttons: 0 }));

      assert.strictEqual(chart.viewport.offsetX, 75, 'Persisted offsetX must remain unchanged on hover');
      assert.strictEqual(chart.viewport.offsetY, 25, 'Persisted offsetY must remain unchanged on hover');
      assert.deepStrictEqual(chart.getViewportMatrix(), [1, 0, 0, 1, 75, 25]);
    });

    it('should release panning state and persist final viewport offset when mouseleave is triggered', () => {
      // 1. Drag interaction
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 200, clientY: 200, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 240, clientY: 270, button: 0, buttons: 1 }));

      assert.strictEqual(chart.isPanning, true);
      assert.strictEqual(chart.viewport.offsetX, 40);
      assert.strictEqual(chart.viewport.offsetY, 70);

      // 2. Canvas loses pointer focus via mouseleave
      canvas.dispatchEvent(createMouseEvent('mouseleave', { clientX: 805, clientY: 300, button: 0, buttons: 0 }));

      assert.strictEqual(chart.isPanning, false, 'Panning state must be released on mouseleave');
      assert.strictEqual(chart.viewport.offsetX, 40, 'Final offsetX must persist after mouseleave');
      assert.strictEqual(chart.viewport.offsetY, 70, 'Final offsetY must persist after mouseleave');
      assert.deepStrictEqual(chart.getViewportMatrix(), [1, 0, 0, 1, 40, 70]);
    });

    it('should support cumulative panning across multiple distinct drag-release sessions', () => {
      // Session 1: Drag +50, +30 then mouseup
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 150, clientY: 130, button: 0, buttons: 1 }));
      canvas.dispatchEvent(createMouseEvent('mouseup', { clientX: 150, clientY: 130, button: 0, buttons: 0 }));

      assert.strictEqual(chart.viewport.offsetX, 50);
      assert.strictEqual(chart.viewport.offsetY, 30);

      // Session 2: Drag from a different starting position by another +25, -10 then mouseup
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 400, clientY: 400, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 425, clientY: 390, button: 0, buttons: 1 }));
      canvas.dispatchEvent(createMouseEvent('mouseup', { clientX: 425, clientY: 390, button: 0, buttons: 0 }));

      assert.strictEqual(
        chart.viewport.offsetX,
        75,
        'Cumulative offsetX must be 50 + 25 = 75'
      );
      assert.strictEqual(
        chart.viewport.offsetY,
        20,
        'Cumulative offsetY must be 30 + (-10) = 20'
      );
      assert.deepStrictEqual(chart.getViewportMatrix(), [1, 0, 0, 1, 75, 20]);
    });
  });

  describe('Edge Cases & Gesture Robustness', () => {
    it('should ignore non-primary mouse clicks (e.g. right click / context menu)', () => {
      // button 2 = secondary/right click
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 2 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 150, clientY: 150, button: 2, buttons: 2 }));

      assert.strictEqual(chart.isPanning, false, 'Right click drag must not initiate panning');
      assert.strictEqual(chart.viewport.offsetX, 0);
      assert.strictEqual(chart.viewport.offsetY, 0);
      assert.deepStrictEqual(chart.getViewportMatrix(), [1, 0, 0, 1, 0, 0]);
    });

    it('should preserve existing zoom scaling while updating translations in the matrix', () => {
      // Re-initialize with scale = 2.0
      chart = new ChartCanvas({
        canvas,
        elements: initialElements,
        initialViewport: {
          offsetX: 0,
          offsetY: 0,
          scale: 2.0,
        },
      });

      assert.deepStrictEqual(chart.getViewportMatrix(), [2, 0, 0, 2, 0, 0]);

      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 150, clientY: 120, button: 0, buttons: 1 }));
      canvas.dispatchEvent(createMouseEvent('mouseup', { clientX: 150, clientY: 120, button: 0, buttons: 0 }));

      assert.strictEqual(chart.viewport.offsetX, 50);
      assert.strictEqual(chart.viewport.offsetY, 20);
      // Zoom scale must remain intact in matrix indices 0 and 3
      assert.deepStrictEqual(chart.getViewportMatrix(), [2, 0, 0, 2, 50, 20]);
    });

    it('should correctly detach all gesture listeners on destroy without state leakage', () => {
      chart.destroy();

      // Dispatch events on detached canvas
      canvas.dispatchEvent(createMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(createMouseEvent('mousemove', { clientX: 200, clientY: 200, button: 0, buttons: 1 }));

      assert.strictEqual(chart.isPanning, false);
      assert.strictEqual(chart.viewport.offsetX, 0);
      assert.strictEqual(chart.viewport.offsetY, 0);
    });
  });
});