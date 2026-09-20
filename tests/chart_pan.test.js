import test from 'node:test';
import assert from 'node:assert';
import { Chart } from '../src/chart.js';
import * as MainModule from '../src/main.js';

/* Setup minimal DOM primitives for Node.js test environment */
class MockCanvasContext2D {
  constructor(canvas) {
    this.canvas = canvas;
  }
  clearRect() {}
  save() {}
  restore() {}
  translate() {}
  scale() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
}

class MockElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.id = '';
    this.style = {};
    this.width = 800;
    this.height = 600;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
    return child;
  }

  querySelector(selector) {
    if (selector.toLowerCase() === 'canvas') {
      return Array.from(this.children).find((c) => c.tagName === 'CANVAS') || null;
    }
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
      y: 0,
    };
  }

  getContext(type) {
    if (type === '2d') {
      return new MockCanvasContext2D(this);
    }
    return null;
  }
}

class MockMouseEvent extends Event {
  constructor(type, init = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.button = init.button ?? 0;
    this.buttons = init.buttons ?? 1;
  }
}

function setupDOMEnvironment() {
  const appContainer = new MockElement('div');
  appContainer.id = 'app';

  const elementsById = new Map([['app', appContainer]]);

  globalThis.MouseEvent = MockMouseEvent;
  globalThis.HTMLCanvasElement = MockElement;
  globalThis.document = {
    getElementById: (id) => elementsById.get(id) || null,
    createElement: (tag) => new MockElement(tag),
    body: new MockElement('body'),
  };
  globalThis.window = new EventTarget();

  return { appContainer };
}

// ---------------------------------------------------------------------------
// Suite 1: Chart Pan Gestures & Viewport Delta Logic (src/chart.js)
// ---------------------------------------------------------------------------

test('Chart pan: clicking and dragging updates viewport offset by drag delta and triggers immediate re-render', () => {
  setupDOMEnvironment();
  const canvas = new MockElement('canvas');
  const chart = new Chart({ canvas, width: 800, height: 600 });

  const initialOffsetX = chart.viewport.offsetX ?? chart.viewport.x ?? 0;
  const initialOffsetY = chart.viewport.offsetY ?? chart.viewport.y ?? 0;
  const initialRenderCount = chart.renderCount ?? 0;

  // 1. Mouse down at (100, 100)
  canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0, buttons: 1 }));

  // 2. Drag mouse to (150, 180) -> delta dx: +50, dy: +80
  canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 150, clientY: 180, button: 0, buttons: 1 }));

  const currentOffsetX = chart.viewport.offsetX ?? chart.viewport.x;
  const currentOffsetY = chart.viewport.offsetY ?? chart.viewport.y;
  const currentRenderCount = chart.renderCount ?? 0;

  assert.strictEqual(
    currentOffsetX,
    initialOffsetX + 50,
    `Viewport X offset must advance by deltaX (+50). Received: ${currentOffsetX}`
  );
  assert.strictEqual(
    currentOffsetY,
    initialOffsetY + 80,
    `Viewport Y offset must advance by deltaY (+80). Received: ${currentOffsetY}`
  );
  assert.ok(
    currentRenderCount > initialRenderCount,
    `Canvas view must immediately re-render on pan drag. Initial renders: ${initialRenderCount}, Current: ${currentRenderCount}`
  );
});

test('Chart pan: releasing mouse button (mouseup) terminates panning state and retains updated viewport', () => {
  setupDOMEnvironment();
  const canvas = new MockElement('canvas');
  const chart = new Chart({ canvas, width: 800, height: 600 });

  // Initiate and drag
  canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 200, clientY: 200, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 250, clientY: 220, button: 0, buttons: 1 }));

  const offsetAfterDragX = chart.viewport.offsetX ?? chart.viewport.x;
  const offsetAfterDragY = chart.viewport.offsetY ?? chart.viewport.y;

  // Release mouse
  canvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 250, clientY: 220, button: 0, buttons: 0 }));

  // Subsequent mousemove should NOT modify viewport
  canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 300, clientY: 300, button: 0, buttons: 0 }));

  const offsetAfterReleaseX = chart.viewport.offsetX ?? chart.viewport.x;
  const offsetAfterReleaseY = chart.viewport.offsetY ?? chart.viewport.y;

  assert.strictEqual(
    offsetAfterReleaseX,
    offsetAfterDragX,
    'Viewport X offset must remain unchanged after mouseup when mouse moves'
  );
  assert.strictEqual(
    offsetAfterReleaseY,
    offsetAfterDragY,
    'Viewport Y offset must remain unchanged after mouseup when mouse moves'
  );
  assert.strictEqual(
    chart.isPanning,
    false,
    'Chart isPanning flag must be false after mouseup'
  );
});

test('Chart pan: leaving canvas bounds (mouseleave) terminates panning state and retains updated viewport', () => {
  setupDOMEnvironment();
  const canvas = new MockElement('canvas');
  const chart = new Chart({ canvas, width: 800, height: 600 });

  // Initiate and drag
  canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 50, clientY: 50, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 70, clientY: 90, button: 0, buttons: 1 }));

  const offsetAfterDragX = chart.viewport.offsetX ?? chart.viewport.x;
  const offsetAfterDragY = chart.viewport.offsetY ?? chart.viewport.y;

  // Leave canvas
  canvas.dispatchEvent(new MockMouseEvent('mouseleave', { clientX: 70, clientY: 90 }));

  // Subsequent mousemove should NOT modify viewport
  canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 100, clientY: 150, button: 0, buttons: 0 }));

  const offsetAfterLeaveX = chart.viewport.offsetX ?? chart.viewport.x;
  const offsetAfterLeaveY = chart.viewport.offsetY ?? chart.viewport.y;

  assert.strictEqual(
    offsetAfterLeaveX,
    offsetAfterDragX,
    'Viewport X offset must remain unchanged after mouseleave'
  );
  assert.strictEqual(
    offsetAfterLeaveY,
    offsetAfterDragY,
    'Viewport Y offset must remain unchanged after mouseleave'
  );
  assert.strictEqual(
    chart.isPanning,
    false,
    'Chart isPanning flag must be false after mouseleave'
  );
});

test('Chart pan: preserves accumulated offset across multiple distinct drag interactions', () => {
  setupDOMEnvironment();
  const canvas = new MockElement('canvas');
  const chart = new Chart({ canvas, width: 800, height: 600 });

  const initialX = chart.viewport.offsetX ?? chart.viewport.x ?? 0;
  const initialY = chart.viewport.offsetY ?? chart.viewport.y ?? 0;

  // Gesture 1: drag +30, +40
  canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 10, clientY: 10, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 40, clientY: 50, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 40, clientY: 50, button: 0, buttons: 0 }));

  // Gesture 2: drag +20, -15
  canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 120, clientY: 85, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 120, clientY: 85, button: 0, buttons: 0 }));

  const finalX = chart.viewport.offsetX ?? chart.viewport.x;
  const finalY = chart.viewport.offsetY ?? chart.viewport.y;

  assert.strictEqual(finalX, initialX + 50, 'Viewport X offset must accumulate both drag gestures (+30 + 20 = +50)');
  assert.strictEqual(finalY, initialY + 25, 'Viewport Y offset must accumulate both drag gestures (+40 - 15 = +25)');
});

// ---------------------------------------------------------------------------
// Suite 2: Entrypoint Integration & Active DOM Binding (src/main.js)
// ---------------------------------------------------------------------------

test('Entrypoint invariant: src/main.js exports mounting function and initializers', () => {
  const mountFn = MainModule.mountApp || MainModule.mount;
  assert.strictEqual(
    typeof mountFn,
    'function',
    'src/main.js must export a mounting function named mountApp or mount'
  );

  const initFn = MainModule.init || MainModule.initialize;
  assert.ok(
    typeof initFn === 'function' || typeof mountFn === 'function',
    'src/main.js must export an initialization or mount function'
  );
});

test('Entrypoint mounting: calling mount function mounts chart canvas to container without errors', () => {
  const { appContainer } = setupDOMEnvironment();
  const mountFn = MainModule.mountApp || MainModule.mount;

  assert.doesNotThrow(() => {
    mountFn(appContainer);
  }, 'mountApp must execute without uncaught errors when supplied with a container');

  const canvas = appContainer.querySelector('canvas');
  assert.ok(canvas, 'A canvas element must be created and mounted inside the container');
});

test('Live DOM wiring: src/main.js binds pan gesture handlers to the active canvas and updates viewport on drag', () => {
  const { appContainer } = setupDOMEnvironment();
  const mountFn = MainModule.mountApp || MainModule.mount;

  const instance = mountFn(appContainer);
  const canvas = appContainer.querySelector('canvas');
  assert.ok(canvas, 'Active canvas element must exist in the mounted DOM tree');

  const chart = instance?.chart || instance;
  assert.ok(chart, 'Mount function must expose or instantiate the chart instance');
  assert.ok(chart.viewport, 'Chart instance must maintain a viewport state');

  const initialX = chart.viewport.offsetX ?? chart.viewport.x ?? 0;
  const initialY = chart.viewport.offsetY ?? chart.viewport.y ?? 0;

  // Dispatch mouse pan gesture directly on the live DOM canvas element
  canvas.dispatchEvent(new MockMouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new MockMouseEvent('mousemove', { clientX: 175, clientY: 140, button: 0, buttons: 1 }));
  canvas.dispatchEvent(new MockMouseEvent('mouseup', { clientX: 175, clientY: 140, button: 0, buttons: 0 }));

  const updatedX = chart.viewport.offsetX ?? chart.viewport.x;
  const updatedY = chart.viewport.offsetY ?? chart.viewport.y;

  assert.strictEqual(
    updatedX,
    initialX + 75,
    'Dragging active canvas element must update the chart viewport X offset by drag delta (+75)'
  );
  assert.strictEqual(
    updatedY,
    initialY + 40,
    'Dragging active canvas element must update the chart viewport Y offset by drag delta (+40)'
  );
});