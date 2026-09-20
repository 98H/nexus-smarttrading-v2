import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ChartCanvas } from '../src/canvas.js';
import { init } from '../src/main.js';

// DOM Fixture and Mock Environment Setup for Headless Node.js Testing
class MockCanvasContext2D {
  constructor() {
    this.transforms = [];
    this.clearedRects = [];
  }

  setTransform(a, b, c, d, e, f) {
    this.transforms.push({ a, b, c, d, e, f });
  }

  clearRect(x, y, w, h) {
    this.clearedRects.push({ x, y, w, h });
  }

  save() {}
  restore() {}
  beginPath() {}
  stroke() {}
  fill() {}
}

class MockCanvasElement extends EventTarget {
  constructor() {
    super();
    this.tagName = 'CANVAS';
    this.id = 'chart-canvas';
    this.width = 800;
    this.height = 600;
    this.style = {};
    this.context = new MockCanvasContext2D();
    this.registeredListeners = new Map();
  }

  getContext(type) {
    if (type === '2d') return this.context;
    return null;
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: this.width,
      height: this.height,
      right: this.width,
      bottom: this.height,
      x: 0,
      y: 0
    };
  }

  addEventListener(type, listener, options) {
    if (!this.registeredListeners.has(type)) {
      this.registeredListeners.set(type, new Set());
    }
    this.registeredListeners.get(type).add(listener);
    super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    if (this.registeredListeners.has(type)) {
      this.registeredListeners.get(type).delete(listener);
    }
    super.removeEventListener(type, listener, options);
  }
}

class MockContainerElement extends EventTarget {
  constructor(id = 'app') {
    super();
    this.id = id;
    this.children = [];
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    if (selector === 'canvas') {
      return Array.from(this.children).find((child) => child.tagName === 'CANVAS') || null;
    }
    return null;
  }
}

class MockMouseEvent extends Event {
  constructor(type, init = {}) {
    super(type, { bubbles: true, cancelable: true });
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.button = init.button ?? 0;
    this.buttons = init.buttons ?? 1;
  }
}

describe('STORY 2.1.1: Resolve UNRESPONSIVE_CANVAS_PAN (Defect ID: DF-GESTURE-01)', () => {
  let originalDocument;
  let originalWindow;
  let originalMouseEvent;
  let originalHTMLCanvasElement;

  let mockAppContainer;
  let mockCanvas;

  beforeEach(() => {
    // Preserve global state
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    originalMouseEvent = globalThis.MouseEvent;
    originalHTMLCanvasElement = globalThis.HTMLCanvasElement;

    // Install mock DOM environment
    mockCanvas = new MockCanvasElement();
    mockAppContainer = new MockContainerElement('app');

    globalThis.MouseEvent = MockMouseEvent;
    globalThis.HTMLCanvasElement = MockCanvasElement;

    globalThis.document = {
      getElementById: (id) => {
        if (id === 'app') return mockAppContainer;
        if (id === 'chart-canvas') return mockCanvas;
        return null;
      },
      createElement: (tagName) => {
        if (tagName.toLowerCase() === 'canvas') {
          return new MockCanvasElement();
        }
        return new EventTarget();
      }
    };

    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  });

  afterEach(() => {
    // Restore global state
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.MouseEvent = originalMouseEvent;
    globalThis.HTMLCanvasElement = originalHTMLCanvasElement;
  });

  describe('Acceptance Criteria 1: Viewport Matrix & Offset Updates with Immediate Re-render', () => {
    it('should update viewport offset and transformation matrix proportionally during drag and trigger re-renders', () => {
      let renderCallCount = 0;
      const chart = new ChartCanvas(mockCanvas, {
        onRender: () => {
          renderCallCount++;
        }
      });

      // Assert initial default viewport state
      const initialViewport = chart.getViewport();
      assert.strictEqual(initialViewport.offsetX, 0, 'Initial offsetX must be 0');
      assert.strictEqual(initialViewport.offsetY, 0, 'Initial offsetY must be 0');
      assert.deepStrictEqual(
        chart.getViewportMatrix(),
        [1, 0, 0, 1, 0, 0],
        'Initial viewport matrix must be identity matrix [1, 0, 0, 1, 0, 0]'
      );

      const baselineRenders = renderCallCount;

      // 1. Dispatch mousedown at starting coordinates (100, 100)
      mockCanvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
      assert.strictEqual(chart.isPanning, true, 'isPanning flag must be true after mousedown');

      // 2. Dispatch mousemove to (160, 140) => dx: +60, dy: +40
      mockCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 160, clientY: 140 }));

      // Offset and Matrix must reflect the delta
      const updatedViewport = chart.getViewport();
      assert.strictEqual(updatedViewport.offsetX, 60, 'Viewport offsetX must update to +60');
      assert.strictEqual(updatedViewport.offsetY, 40, 'Viewport offsetY must update to +40');

      const updatedMatrix = chart.getViewportMatrix();
      assert.strictEqual(updatedMatrix[4], 60, 'Matrix translation X (index 4) must equal offsetX (60)');
      assert.strictEqual(updatedMatrix[5], 40, 'Matrix translation Y (index 5) must equal offsetY (40)');
      assert.strictEqual(
        renderCallCount > baselineRenders,
        true,
        'Immediate re-render must be triggered after mousemove delta'
      );

      // 3. Dispatch second mousemove step to (190, 150) => cumulative dx: +90, dy: +50
      const prevRenderCount = renderCallCount;
      mockCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 190, clientY: 150 }));

      const intermediateViewport = chart.getViewport();
      assert.strictEqual(intermediateViewport.offsetX, 90, 'Viewport offsetX must accumulate to +90');
      assert.strictEqual(intermediateViewport.offsetY, 50, 'Viewport offsetY must accumulate to +50');

      const intermediateMatrix = chart.getViewportMatrix();
      assert.strictEqual(intermediateMatrix[4], 90, 'Matrix translation X must accumulate to 90');
      assert.strictEqual(intermediateMatrix[5], 50, 'Matrix translation Y must accumulate to 50');
      assert.strictEqual(
        renderCallCount > prevRenderCount,
        true,
        'Immediate re-render must be triggered for each drag increment'
      );
    });

    it('should NOT update viewport matrix or trigger panning render if mousemove occurs without mousedown', () => {
      let renderCallCount = 0;
      const chart = new ChartCanvas(mockCanvas, {
        onRender: () => {
          renderCallCount++;
        }
      });

      const initialRenders = renderCallCount;

      // Dispatch mousemove without preceding mousedown
      mockCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 300, clientY: 400 }));

      const viewport = chart.getViewport();
      assert.strictEqual(viewport.offsetX, 0, 'Offset X must remain 0 when not dragging');
      assert.strictEqual(viewport.offsetY, 0, 'Offset Y must remain 0 when not dragging');
      assert.deepStrictEqual(
        chart.getViewportMatrix(),
        [1, 0, 0, 1, 0, 0],
        'Viewport matrix must remain identity'
      );
      assert.strictEqual(
        renderCallCount,
        initialRenders,
        'No re-renders must be dispatched when cursor moves without active drag'
      );
    });
  });

  describe('Acceptance Criteria 2: Entrypoint Initialization (src/main.js)', () => {
    it('should mount canvas inside #app and bind mousedown, mousemove, and mouseup drag handlers', () => {
      // Execute the live entrypoint initialization
      const appInstance = init();

      assert.ok(appInstance, 'init() must return an application runtime instance');

      // Verify canvas element exists under document.getElementById('app')
      const mountedCanvas = mockAppContainer.querySelector('canvas');
      assert.ok(mountedCanvas, 'Canvas element must be mounted under document.getElementById("app")');

      // Verify necessary drag listeners are registered on the canvas element
      const listeners = mountedCanvas.registeredListeners;
      assert.ok(
        listeners.has('mousedown') && listeners.get('mousedown').size > 0,
        'Canvas must have a "mousedown" event listener registered'
      );
      assert.ok(
        listeners.has('mousemove') && listeners.get('mousemove').size > 0,
        'Canvas must have a "mousemove" event listener registered'
      );
      assert.ok(
        listeners.has('mouseup') && listeners.get('mouseup').size > 0,
        'Canvas must have a "mouseup" event listener registered'
      );
      assert.ok(
        listeners.has('mouseleave') && listeners.get('mouseleave').size > 0,
        'Canvas must have a "mouseleave" event listener registered to guard boundary exit'
      );
    });

    it('should execute end-to-end pan interaction through entrypoint-mounted chart', () => {
      const appInstance = init();
      const mountedCanvas = mockAppContainer.querySelector('canvas');
      assert.ok(mountedCanvas, 'Mounted canvas must exist');

      const chart = appInstance.chart || appInstance.getChart();
      assert.ok(chart, 'Active ChartCanvas instance must be exposed on application instance');

      // Simulate real user gesture sequence on the mounted element
      mountedCanvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 200, clientY: 200 }));
      mountedCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 250, clientY: 220 }));

      const viewport = chart.getViewport();
      assert.strictEqual(viewport.offsetX, 50, 'Entrypoint chart must handle live mousedown + mousemove pan');
      assert.strictEqual(viewport.offsetY, 20, 'Entrypoint chart must handle live mousedown + mousemove pan');
    });
  });

  describe('Acceptance Criteria 3: Drag Lifecycle Termination and Offset Retention', () => {
    it('should clear panning state on mouseup and retain final viewport offset without further drag movement', () => {
      const chart = new ChartCanvas(mockCanvas);

      // Pan to (45, -30)
      mockCanvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 100 }));
      mockCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 145, clientY: 70 }));

      assert.strictEqual(chart.isPanning, true);
      assert.strictEqual(chart.getViewport().offsetX, 45);
      assert.strictEqual(chart.getViewport().offsetY, -30);

      // Release mouse
      mockCanvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 145, clientY: 70 }));

      assert.strictEqual(chart.isPanning, false, 'isPanning must be false after mouseup');
      assert.strictEqual(chart.getViewport().offsetX, 45, 'Final viewport offsetX must be retained');
      assert.strictEqual(chart.getViewport().offsetY, -30, 'Final viewport offsetY must be retained');

      // Subsequent movement without mousedown must NOT alter the retained offset
      mockCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 200, clientY: 200 }));

      assert.strictEqual(
        chart.getViewport().offsetX,
        45,
        'Retained offsetX must not change after drag is terminated'
      );
      assert.strictEqual(
        chart.getViewport().offsetY,
        -30,
        'Retained offsetY must not change after drag is terminated'
      );
    });

    it('should clear panning state and preserve offset when pointer leaves canvas bounds (mouseleave)', () => {
      const chart = new ChartCanvas(mockCanvas);

      // Start drag: move from (50, 50) to (80, 110) => dx: 30, dy: 60
      mockCanvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 50, clientY: 50 }));
      mockCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 80, clientY: 110 }));

      assert.strictEqual(chart.isPanning, true);
      assert.strictEqual(chart.getViewport().offsetX, 30);
      assert.strictEqual(chart.getViewport().offsetY, 60);

      // Pointer leaves canvas bounds
      mockCanvas.dispatchEvent(new MockMouseEvent('mouseleave', { clientX: 850, clientY: 700 }));

      assert.strictEqual(chart.isPanning, false, 'isPanning must be false when pointer leaves canvas bounds');
      assert.strictEqual(chart.getViewport().offsetX, 30, 'Offset must be retained on mouseleave');
      assert.strictEqual(chart.getViewport().offsetY, 60, 'Offset must be retained on mouseleave');

      // Moving back in without new mousedown should not resume pan
      mockCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 80, clientY: 110 }));
      assert.strictEqual(chart.getViewport().offsetX, 30);
      assert.strictEqual(chart.getViewport().offsetY, 60);
    });

    it('should support multiple consecutive pan-and-release cycles accumulating total offset accurately', () => {
      const chart = new ChartCanvas(mockCanvas);

      // Cycle 1: Drag dx: 50, dy: 25
      mockCanvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 10, clientY: 10 }));
      mockCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 60, clientY: 35 }));
      mockCanvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 60, clientY: 35 }));

      assert.strictEqual(chart.getViewport().offsetX, 50);
      assert.strictEqual(chart.getViewport().offsetY, 25);

      // Cycle 2: Drag dx: -20, dy: 15 from a new origin (200, 200) -> (180, 215)
      mockCanvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 200, clientY: 200 }));
      mockCanvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 180, clientY: 215 }));
      mockCanvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 180, clientY: 215 }));

      assert.strictEqual(
        chart.getViewport().offsetX,
        30,
        'Cumulative offsetX must be 50 + (-20) = 30'
      );
      assert.strictEqual(
        chart.getViewport().offsetY,
        40,
        'Cumulative offsetY must be 25 + 15 = 40'
      );

      const matrix = chart.getViewportMatrix();
      assert.strictEqual(matrix[4], 30, 'Viewport matrix tx must match cumulative offsetX (30)');
      assert.strictEqual(matrix[5], 40, 'Viewport matrix ty must match cumulative offsetY (40)');
    });
  });
});