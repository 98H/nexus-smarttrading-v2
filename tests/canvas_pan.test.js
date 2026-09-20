import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Minimal DOM / Canvas Mock implementation to enable deterministic
 * execution of browser gesture and canvas rendering lifecycles in Node.js.
 */

class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.button = init.button ?? 0;
    this.buttons = init.buttons ?? 1;
    this.bubbles = init.bubbles ?? true;
    this.cancelable = init.cancelable ?? true;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {}
}

class MockHTMLElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.id = '';
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.parentElement = null;
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
      for (const handler of Array.from(handlers)) {
        handler.call(this, event);
      }
    }
    return !event.defaultPrevented;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
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

  getBoundingClientRect() {
    return { top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 };
  }
}

class MockHTMLCanvasElement extends MockHTMLElement {
  constructor() {
    super('canvas');
    this.width = 800;
    this.height = 600;
  }

  getContext(type) {
    return {
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      setTransform: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {}
    };
  }
}

class MockDocument {
  constructor() {
    this.elementsById = new Map();
  }

  createElement(tagName) {
    if (tagName.toLowerCase() === 'canvas') {
      return new MockHTMLCanvasElement();
    }
    return new MockHTMLElement(tagName);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElement(id, element) {
    element.id = id;
    this.elementsById.set(id, element);
  }

  clear() {
    this.elementsById.clear();
  }
}

// Install mock browser environment prior to importing production modules
let mockDocument;
let appContainer;

beforeEach(() => {
  mockDocument = new MockDocument();
  appContainer = new MockHTMLElement('div');
  mockDocument.registerElement('app', appContainer);

  globalThis.document = mockDocument;
  globalThis.window = globalThis;
  globalThis.MouseEvent = MockEvent;
  globalThis.HTMLElement = MockHTMLElement;
  globalThis.HTMLCanvasElement = MockHTMLCanvasElement;
});

afterEach(() => {
  mockDocument.clear();
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.MouseEvent;
  delete globalThis.HTMLElement;
  delete globalThis.HTMLCanvasElement;
});

describe('Feature: STORY 5.3.1: Resolve UNRESPONSIVE_CANVAS_PAN (DF-GESTURE-01)', () => {
  describe('src/chart.js: Pan Gesture Handling and Viewport Matrix', () => {
    it('AC1: should update viewport offset matrix proportionally and trigger re-render on mousedown + mousemove', async () => {
      const { Chart } = await import('../src/chart.js');

      const canvas = mockDocument.createElement('canvas');
      const chart = new Chart({ canvas, width: 800, height: 600 });

      // Initial state assertions
      const initialOffset = chart.getViewportOffset();
      assert.deepEqual(initialOffset, { x: 0, y: 0 }, 'Initial viewport offset must be at origin (0, 0)');
      
      const initialMatrix = chart.getViewportMatrix();
      assert.ok(Array.isArray(initialMatrix) || typeof initialMatrix === 'object', 'Matrix must be exposed');
      
      const initialRenderCount = chart.renderCount || 0;

      // Begin drag interaction
      const mouseDownEvent = new MockEvent('mousedown', { clientX: 100, clientY: 100, button: 0 });
      canvas.dispatchEvent(mouseDownEvent);

      assert.equal(chart.isPanning, true, 'isPanning must be engaged following mousedown');

      // Drag by delta (+50px X, +30px Y)
      const mouseMoveEvent = new MockEvent('mousemove', { clientX: 150, clientY: 130, button: 0 });
      canvas.dispatchEvent(mouseMoveEvent);

      // Verify viewport offset updated proportionally
      const updatedOffset = chart.getViewportOffset();
      assert.equal(updatedOffset.x, 50, 'Viewport offset X must shift by +50px');
      assert.equal(updatedOffset.y, 30, 'Viewport offset Y must shift by +30px');

      // Verify viewport matrix was translated
      const updatedMatrix = chart.getViewportMatrix();
      if (Array.isArray(updatedMatrix)) {
        // Affine matrix [a, b, c, d, e, f] where e = tx, f = ty
        assert.equal(updatedMatrix[4], 50, 'Matrix TX translation must reflect 50px delta');
        assert.equal(updatedMatrix[5], 30, 'Matrix TY translation must reflect 30px delta');
      } else {
        assert.equal(updatedMatrix.e ?? updatedMatrix.tx, 50, 'Matrix TX translation must reflect 50px delta');
        assert.equal(updatedMatrix.f ?? updatedMatrix.ty, 30, 'Matrix TY translation must reflect 30px delta');
      }

      // Verify chart view was re-rendered
      assert.ok(
        (chart.renderCount || 0) > initialRenderCount,
        'Chart render must be invoked during viewport matrix update'
      );

      // Subsequent movement (+20px X, -10px Y from previous)
      const secondaryMoveEvent = new MockEvent('mousemove', { clientX: 170, clientY: 120, button: 0 });
      canvas.dispatchEvent(secondaryMoveEvent);

      const secondaryOffset = chart.getViewportOffset();
      assert.equal(secondaryOffset.x, 70, 'Viewport offset X must accumulate to 70px');
      assert.equal(secondaryOffset.y, 20, 'Viewport offset Y must accumulate to 20px');
    });

    it('AC2: should disengage panning on mouseup and persist the final viewport offset', async () => {
      const { Chart } = await import('../src/chart.js');

      const canvas = mockDocument.createElement('canvas');
      const chart = new Chart({ canvas, width: 800, height: 600 });

      // Initiate and move
      canvas.dispatchEvent(new MockEvent('mousedown', { clientX: 200, clientY: 200 }));
      canvas.dispatchEvent(new MockEvent('mousemove', { clientX: 240, clientY: 260 }));

      const intermediateOffset = chart.getViewportOffset();
      assert.equal(intermediateOffset.x, 40);
      assert.equal(intermediateOffset.y, 60);

      // Disengage via mouseup
      const mouseUpEvent = new MockEvent('mouseup', { clientX: 240, clientY: 260 });
      canvas.dispatchEvent(mouseUpEvent);

      assert.equal(chart.isPanning, false, 'isPanning must disengage on mouseup');

      const renderCountAtMouseUp = chart.renderCount || 0;

      // Dispatch subsequent mousemove without mousedown
      const unengagedMoveEvent = new MockEvent('mousemove', { clientX: 300, clientY: 300 });
      canvas.dispatchEvent(unengagedMoveEvent);

      // Viewport must persist unchanged
      const finalOffset = chart.getViewportOffset();
      assert.equal(finalOffset.x, 40, 'Final viewport offset X must persist after pan disengagement');
      assert.equal(finalOffset.y, 60, 'Final viewport offset Y must persist after pan disengagement');
      assert.equal(chart.renderCount || 0, renderCountAtMouseUp, 'No re-render when dragging is disengaged');
    });

    it('AC2: should disengage panning on mouseleave and persist the final viewport offset', async () => {
      const { Chart } = await import('../src/chart.js');

      const canvas = mockDocument.createElement('canvas');
      const chart = new Chart({ canvas, width: 800, height: 600 });

      // Initiate drag
      canvas.dispatchEvent(new MockEvent('mousedown', { clientX: 100, clientY: 100 }));
      canvas.dispatchEvent(new MockEvent('mousemove', { clientX: 150, clientY: 80 }));

      const currentOffset = chart.getViewportOffset();
      assert.equal(currentOffset.x, 50);
      assert.equal(currentOffset.y, -20);

      // Mouse leaves canvas boundary
      const mouseLeaveEvent = new MockEvent('mouseleave', { clientX: 150, clientY: 80 });
      canvas.dispatchEvent(mouseLeaveEvent);

      assert.equal(chart.isPanning, false, 'isPanning must disengage when mouse leaves canvas');

      // Subsequent movement without mousedown must not mutate offset
      canvas.dispatchEvent(new MockEvent('mousemove', { clientX: 500, clientY: 500 }));

      const persistedOffset = chart.getViewportOffset();
      assert.equal(persistedOffset.x, 50, 'Persisted offset X must remain intact');
      assert.equal(persistedOffset.y, -20, 'Persisted offset Y must remain intact');
    });
  });

  describe('src/main.js: Entrypoint Integration and Live DOM Wiring', () => {
    it('AC3: must mount canvas directly to document.getElementById("app") with active pan listeners', async () => {
      const mainModule = await import('../src/main.js');

      // If entrypoint exports an initialization function or auto-mounts on load
      if (typeof mainModule.initApp === 'function') {
        mainModule.initApp();
      } else if (typeof mainModule.mountChart === 'function') {
        mainModule.mountChart(appContainer);
      }

      const mountedCanvas = appContainer.children.find((c) => c.tagName === 'CANVAS');
      assert.ok(mountedCanvas, 'Canvas must be directly mounted into document.getElementById("app")');

      // Verify pan gesture event listeners are attached to the mounted canvas
      assert.ok(mountedCanvas.listeners.has('mousedown'), 'Mounted canvas must have mousedown listener');
      assert.ok(mountedCanvas.listeners.has('mousemove'), 'Mounted canvas must have mousemove listener');
      assert.ok(mountedCanvas.listeners.has('mouseup'), 'Mounted canvas must have mouseup listener');
      assert.ok(mountedCanvas.listeners.has('mouseleave'), 'Mounted canvas must have mouseleave listener');

      // Verify that active pan interaction works end-to-end through the mounted canvas
      const startX = 50;
      const startY = 50;
      const moveX = 120;
      const moveY = 90;

      mountedCanvas.dispatchEvent(new MockEvent('mousedown', { clientX: startX, clientY: startY }));
      mountedCanvas.dispatchEvent(new MockEvent('mousemove', { clientX: moveX, clientY: moveY }));

      // Fetch active chart reference either from canvas property or module export
      const activeChart = mountedCanvas.__chartInstance || mainModule.activeChart;
      assert.ok(activeChart, 'Active chart instance must be accessible from mounted canvas or main module');

      const offset = activeChart.getViewportOffset();
      assert.equal(offset.x, moveX - startX, 'Live mounted canvas drag must update viewport offset X');
      assert.equal(offset.y, moveY - startY, 'Live mounted canvas drag must update viewport offset Y');
    });
  });
});