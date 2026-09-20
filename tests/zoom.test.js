import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupCanvasZoom,
  DEFAULT_MIN_ZOOM,
  DEFAULT_MAX_ZOOM
} from '../src/main.js';

/**
 * Minimal mock implementation of DOM EventTarget and HTMLCanvasElement
 * to test canvas gesture listeners deterministically in Node.js.
 */
class MockCanvas {
  constructor(width = 800, height = 600) {
    this.width = width;
    this.height = height;
    this.listeners = new Map();
    this.redrawCount = 0;
  }

  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push({ listener, options });
  }

  removeEventListener(type, listener) {
    const registered = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      registered.filter((entry) => entry.listener !== listener)
    );
  }

  dispatchEvent(event) {
    const registered = this.listeners.get(event.type) || [];
    for (const { listener } of registered) {
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }

  getContext(type) {
    if (type === '2d') {
      return {
        clearRect: () => {},
        save: () => {},
        restore: () => {},
        scale: () => {},
        translate: () => {},
        beginPath: () => {},
        stroke: () => {}
      };
    }
    return null;
  }
}

/**
 * Minimal mock of a WheelEvent.
 */
class MockWheelEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.deltaY = init.deltaY ?? 0;
    this.deltaX = init.deltaX ?? 0;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

describe('STORY 2.2.1: Resolve UNRESPONSIVE_CANVAS_ZOOM (DF-GESTURE-02)', () => {
  let canvas;

  beforeEach(() => {
    canvas = new MockCanvas();
  });

  it('should invoke event.preventDefault() to suppress default browser window scrolling on wheel gesture', () => {
    setupCanvasZoom(canvas);

    const wheelEvent = new MockWheelEvent('wheel', { deltaY: -100 });
    canvas.dispatchEvent(wheelEvent);

    assert.strictEqual(
      wheelEvent.defaultPrevented,
      true,
      'Expected event.preventDefault() to be called on wheel event to prevent window scroll'
    );
  });

  it('should capture negative deltaY (scroll up/zoom in), increase zoom level, and update visible scales', () => {
    let redrawCalled = false;
    let redrawState = null;

    const controller = setupCanvasZoom(canvas, {
      initialZoom: 1.0,
      initialTimeScale: 1.0,
      initialPriceScale: 1.0,
      onRedraw: (state) => {
        redrawCalled = true;
        redrawState = state;
      }
    });

    const initialZoom = controller.getZoomLevel();
    const initialTimeScale = controller.getTimeScale();
    const initialPriceScale = controller.getPriceScale();

    // Scroll up (zoom in)
    const wheelEvent = new MockWheelEvent('wheel', { deltaY: -120 });
    canvas.dispatchEvent(wheelEvent);

    assert.strictEqual(redrawCalled, true, 'Canvas redraw must be triggered after wheel zoom');
    assert.ok(
      controller.getZoomLevel() > initialZoom,
      `Expected zoomLevel to increase from ${initialZoom}, got ${controller.getZoomLevel()}`
    );
    assert.ok(
      controller.getTimeScale() > initialTimeScale,
      `Expected timeScale to update from ${initialTimeScale}, got ${controller.getTimeScale()}`
    );
    assert.ok(
      controller.getPriceScale() > initialPriceScale,
      `Expected priceScale to update from ${initialPriceScale}, got ${controller.getPriceScale()}`
    );

    assert.deepStrictEqual(
      redrawState,
      {
        zoomLevel: controller.getZoomLevel(),
        timeScale: controller.getTimeScale(),
        priceScale: controller.getPriceScale()
      },
      'Redraw callback must receive the updated scale and zoom state'
    );
  });

  it('should capture positive deltaY (scroll down/zoom out), decrease zoom level, and update visible scales', () => {
    let redrawCalled = false;

    const controller = setupCanvasZoom(canvas, {
      initialZoom: 2.0,
      initialTimeScale: 2.0,
      initialPriceScale: 2.0,
      onRedraw: () => {
        redrawCalled = true;
      }
    });

    const initialZoom = controller.getZoomLevel();

    // Scroll down (zoom out)
    const wheelEvent = new MockWheelEvent('wheel', { deltaY: 120 });
    canvas.dispatchEvent(wheelEvent);

    assert.strictEqual(redrawCalled, true, 'Canvas redraw must be triggered after zoom out');
    assert.ok(
      controller.getZoomLevel() < initialZoom,
      `Expected zoomLevel to decrease from ${initialZoom}, got ${controller.getZoomLevel()}`
    );
    assert.ok(
      controller.getTimeScale() < 2.0,
      'Expected timeScale to decrease on zoom out'
    );
    assert.ok(
      controller.getPriceScale() < 2.0,
      'Expected priceScale to decrease on zoom out'
    );
  });

  it('should clamp zoom level to predefined maximum boundary when zooming in repeatedly', () => {
    const maxZoom = 3.0;
    const controller = setupCanvasZoom(canvas, {
      initialZoom: 2.5,
      maxZoom
    });

    // Send multiple extreme zoom-in wheel gestures
    for (let i = 0; i < 10; i++) {
      canvas.dispatchEvent(new MockWheelEvent('wheel', { deltaY: -500 }));
    }

    assert.strictEqual(
      controller.getZoomLevel(),
      maxZoom,
      `Zoom level must not exceed defined maximum zoom limit of ${maxZoom}`
    );
  });

  it('should clamp zoom level to predefined minimum boundary when zooming out repeatedly', () => {
    const minZoom = 0.5;
    const controller = setupCanvasZoom(canvas, {
      initialZoom: 0.8,
      minZoom
    });

    // Send multiple extreme zoom-out wheel gestures
    for (let i = 0; i < 10; i++) {
      canvas.dispatchEvent(new MockWheelEvent('wheel', { deltaY: 500 }));
    }

    assert.strictEqual(
      controller.getZoomLevel(),
      minZoom,
      `Zoom level must not fall below defined minimum zoom limit of ${minZoom}`
    );
  });

  it('should use DEFAULT_MIN_ZOOM and DEFAULT_MAX_ZOOM constants when boundaries are omitted', () => {
    assert.ok(
      typeof DEFAULT_MIN_ZOOM === 'number' && DEFAULT_MIN_ZOOM > 0,
      'DEFAULT_MIN_ZOOM must be exported as a positive number'
    );
    assert.ok(
      typeof DEFAULT_MAX_ZOOM === 'number' && DEFAULT_MAX_ZOOM > DEFAULT_MIN_ZOOM,
      'DEFAULT_MAX_ZOOM must be exported and greater than DEFAULT_MIN_ZOOM'
    );

    const controller = setupCanvasZoom(canvas, { initialZoom: 1.0 });

    // Try zooming past max default
    for (let i = 0; i < 50; i++) {
      canvas.dispatchEvent(new MockWheelEvent('wheel', { deltaY: -1000 }));
    }
    assert.strictEqual(
      controller.getZoomLevel(),
      DEFAULT_MAX_ZOOM,
      'Should clamp to DEFAULT_MAX_ZOOM when maxZoom option is omitted'
    );

    // Try zooming past min default
    for (let i = 0; i < 100; i++) {
      canvas.dispatchEvent(new MockWheelEvent('wheel', { deltaY: 1000 }));
    }
    assert.strictEqual(
      controller.getZoomLevel(),
      DEFAULT_MIN_ZOOM,
      'Should clamp to DEFAULT_MIN_ZOOM when minZoom option is omitted'
    );
  });

  it('should not update scale or trigger redraw when deltaY is 0', () => {
    let redrawCount = 0;

    const controller = setupCanvasZoom(canvas, {
      initialZoom: 1.0,
      onRedraw: () => {
        redrawCount++;
      }
    });

    const wheelEvent = new MockWheelEvent('wheel', { deltaY: 0 });
    canvas.dispatchEvent(wheelEvent);

    assert.strictEqual(
      wheelEvent.defaultPrevented,
      true,
      'event.preventDefault() should still be called when deltaY is 0'
    );
    assert.strictEqual(
      controller.getZoomLevel(),
      1.0,
      'Zoom level must remain unchanged when deltaY is 0'
    );
    assert.strictEqual(
      redrawCount,
      0,
      'Redraw must not be triggered when no scale change occurs'
    );
  });

  it('should properly unbind listeners and stop responding to wheel events upon destroy()', () => {
    let redrawCount = 0;

    const controller = setupCanvasZoom(canvas, {
      initialZoom: 1.0,
      onRedraw: () => {
        redrawCount++;
      }
    });

    controller.destroy();

    const wheelEvent = new MockWheelEvent('wheel', { deltaY: -100 });
    canvas.dispatchEvent(wheelEvent);

    assert.strictEqual(
      wheelEvent.defaultPrevented,
      false,
      'Listener should not intercept wheel event after controller is destroyed'
    );
    assert.strictEqual(
      redrawCount,
      0,
      'Redraw must not be called after controller is destroyed'
    );
    assert.strictEqual(
      controller.getZoomLevel(),
      1.0,
      'Zoom level must remain unchanged after destroy'
    );
  });
});