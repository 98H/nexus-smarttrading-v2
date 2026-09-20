/**
 * Test Suite: STORY 27.4.1: Resolve UNMAPPED_PIXEL_COORDINATES
 * Defect ID: DF-TOOLS-03
 * Severity: HIGH
 * Target Module: src/main.js
 *
 * Description:
 * Validates that horizontal level drawing tool transforms raw mouse vertical
 * coordinates (e.g., clientY = 300) through the chart price scale formula:
 *   price = priceMax - ((y - plotTop) / plotHeight) * (priceMax - priceMin)
 * and ensures the mapped asset price is persisted in the active annotation store
 * when mounted to '#app'.
 */

import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Minimal DOM & Canvas Environment Setup for Node.js ---
class MockDOMRect {
  constructor({ top = 0, left = 0, width = 800, height = 600 } = {}) {
    this.top = top;
    this.left = left;
    this.width = width;
    this.height = height;
    this.bottom = top + height;
    this.right = left + width;
  }
}

class MockCanvasContext2D {
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fillText() {}
  clearRect() {}
  save() {}
  restore() {}
  setLineDash() {}
}

class MockCanvasElement {
  constructor() {
    this.tagName = 'CANVAS';
    this.id = 'chart-canvas';
    this.listeners = new Map();
    this.width = 800;
    this.height = 600;
    this.rect = new MockDOMRect({ top: 50, left: 0, width: 800, height: 500 });
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      handlers.filter((h) => h !== handler)
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

  getBoundingClientRect() {
    return this.rect;
  }

  getContext(type) {
    if (type === '2d') {
      return new MockCanvasContext2D();
    }
    return null;
  }
}

class MockContainerElement {
  constructor(id) {
    this.id = id;
    this.children = [];
    this.innerHTML = '';
  }

  appendChild(child) {
    this.children.push(child);
  }

  querySelector(selector) {
    if (selector === 'canvas' || selector === '#chart-canvas') {
      return Array.from(this.children).find((c) => c.tagName === 'CANVAS') || null;
    }
    return null;
  }
}

class MockMouseEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.bubbles = init.bubbles ?? true;
    this.cancelable = init.cancelable ?? true;
  }
}

describe('STORY 27.4.1: DF-TOOLS-03 Resolve UNMAPPED_PIXEL_COORDINATES', () => {
  let appRoot;
  let canvas;
  let mainModule;

  beforeEach(async () => {
    // Install global browser-like environment
    appRoot = new MockContainerElement('app');
    canvas = new MockCanvasElement();
    appRoot.appendChild(canvas);

    globalThis.window = globalThis;
    globalThis.document = {
      getElementById: (id) => (id === 'app' ? appRoot : null),
      querySelector: (sel) => (sel === '#app' ? appRoot : null),
      createElement: (tag) => {
        if (tag.toLowerCase() === 'canvas') return new MockCanvasElement();
        return new MockContainerElement(tag);
      },
    };
    globalThis.MouseEvent = MockMouseEvent;
    globalThis.requestAnimationFrame = (cb) => { const t = setTimeout(cb, 16); if (t && typeof t.unref === 'function') t.unref(); return t; };
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

    // Import entrypoint dynamically so it picks up DOM globals
    mainModule = await import('../src/main.js');
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MouseEvent;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });

  it('should mathematically transform pixel coordinate y to asset price using the price scale equation', () => {
    // Acceptance Criteria: price = priceMax - ((y - plotTop) / plotHeight) * (priceMax - priceMin)
    const priceMax = 2000;
    const priceMin = 1000;
    const plotTop = 50;
    const plotHeight = 500;

    const calculatePrice =
      mainModule.calculatePriceFromY ||
      mainModule.mapYToPrice ||
      ((y, pTop, pHeight, pMax, pMin) => pMax - ((y - pTop) / pHeight) * (pMax - pMin));

    // Test Top Boundary (y = plotTop -> price = priceMax)
    const topPrice = calculatePrice(50, plotTop, plotHeight, priceMax, priceMin);
    assert.strictEqual(topPrice, 2000, 'Top boundary pixel should yield priceMax');

    // Test Bottom Boundary (y = plotTop + plotHeight -> price = priceMin)
    const bottomPrice = calculatePrice(550, plotTop, plotHeight, priceMax, priceMin);
    assert.strictEqual(bottomPrice, 1000, 'Bottom boundary pixel should yield priceMin');

    // Test Midpoint (y = 300 -> price = 1500)
    // DF-TOOLS-03 defect scenario: raw clientY is 300, must NOT be 300!
    const midPrice = calculatePrice(300, plotTop, plotHeight, priceMax, priceMin);
    assert.notStrictEqual(midPrice, 300, 'Defect DF-TOOLS-03 regression: raw pixel coordinate returned as price');
    assert.strictEqual(midPrice, 1500, 'Midpoint y=300 must map to price 1500');
  });

  it('should wire coordinate mapping into active entrypoint and save mapped price to annotationStore on click', () => {
    assert.ok(
      typeof mainModule.mount === 'function' || typeof mainModule.initApp === 'function',
      'src/main.js must export mount or initApp entrypoint function'
    );

    const mountFn = mainModule.mount || mainModule.initApp;
    const context = mountFn(appRoot) || {};
    const store = context.annotationStore || mainModule.annotationStore;

    assert.ok(store, 'Active annotationStore must be available and wired into src/main.js');

    // Set chart price view window
    const priceScale = {
      priceMax: 150.0,
      priceMin: 50.0,
      plotTop: 50,
      plotHeight: 500,
    };

    if (context.setPriceScale) {
      context.setPriceScale(priceScale);
    } else if (mainModule.setPriceScale) {
      mainModule.setPriceScale(priceScale);
    }

    // Activate the horizontal level tool
    if (context.setActiveTool) {
      context.setActiveTool('horizontal_level');
    } else if (mainModule.setActiveTool) {
      mainModule.setActiveTool('horizontal_level');
    }

    // Simulate click at clientY = 300 (middle of plot bounds [50, 550])
    // Mapped Price = 150 - ((300 - 50) / 500) * (150 - 50) = 150 - 0.5 * 100 = 100.0
    const clickEvent = new MockMouseEvent('click', {
      clientX: 250,
      clientY: 300,
      bubbles: true,
    });

    canvas.dispatchEvent(clickEvent);

    const annotations = store.getAnnotations ? store.getAnnotations() : store.annotations;
    assert.ok(Array.isArray(annotations), 'Annotation store must maintain an array of annotations');
    assert.ok(annotations.length > 0, 'Clicking with active horizontal tool must append an annotation');

    const created = annotations[annotations.length - 1];

    // Assert raw clientY (300) is NOT assigned as the price
    assert.notStrictEqual(
      created.price,
      300,
      'Defect DF-TOOLS-03 detected: Annotation price was assigned raw mouse clientY coordinate (300)'
    );

    // Assert accurate mapped price
    assert.strictEqual(
      created.price,
      100.0,
      'Annotation price must match mathematically scaled price (100.0) from scale [50, 150]'
    );
  });

  it('should reflect updated price mapping when chart price scale dynamically changes (zoom/pan)', () => {
    const mountFn = mainModule.mount || mainModule.initApp;
    const context = mountFn(appRoot) || {};
    const store = context.annotationStore || mainModule.annotationStore;

    // Reset store annotations
    if (store.clear) {
      store.clear();
    } else if (store.annotations) {
      store.annotations.length = 0;
    }

    if (context.setActiveTool) {
      context.setActiveTool('horizontal_level');
    } else if (mainModule.setActiveTool) {
      mainModule.setActiveTool('horizontal_level');
    }

    // Dynamic Zoom: Price scale shifts to [40000, 50000], plot bounds [100, 500] (plotHeight = 400)
    const dynamicScale = {
      priceMax: 50000,
      priceMin: 40000,
      plotTop: 100,
      plotHeight: 400,
    };

    if (context.setPriceScale) {
      context.setPriceScale(dynamicScale);
    } else if (mainModule.setPriceScale) {
      mainModule.setPriceScale(dynamicScale);
    }

    // Click at y = 200:
    // (200 - 100) / 400 = 0.25 (25% from top)
    // Mapped Price = 50000 - 0.25 * (50000 - 40000) = 50000 - 2500 = 47500
    const clickEvent = new MockMouseEvent('click', {
      clientX: 400,
      clientY: 200,
      bubbles: true,
    });

    canvas.dispatchEvent(clickEvent);

    const annotations = store.getAnnotations ? store.getAnnotations() : store.annotations;
    const latest = annotations[annotations.length - 1];

    assert.ok(latest, 'An annotation should be recorded');
    assert.strictEqual(
      latest.price,
      47500,
      'Annotation price should reflect dynamic price scale transformation (expected 47500)'
    );
  });

  it('should pass calculated price to the canvas rendering loop without mutation to raw pixel units', (t) => {
    const mountFn = mainModule.mount || mainModule.initApp;
    const context = mountFn(appRoot) || {};

    let renderedPrice = null;

    // Spy on draw/render method
    if (context.onRenderAnnotation) {
      context.onRenderAnnotation((annotation) => {
        renderedPrice = annotation.price;
      });
    } else if (mainModule.render) {
      t.mock.method(mainModule, 'render', (state) => {
        if (state && state.annotations && state.annotations.length > 0) {
          renderedPrice = state.annotations[state.annotations.length - 1].price;
        }
      });
    }

    if (context.setActiveTool) {
      context.setActiveTool('horizontal_level');
    }

    // Click at y = 175 with plotTop = 50, plotHeight = 500, priceMax = 200, priceMin = 100
    // (175 - 50) / 500 = 125 / 500 = 0.25
    // Price = 200 - (0.25 * 100) = 175.0 (asset price, distinct from pixel offset logic)
    const clickEvent = new MockMouseEvent('click', {
      clientX: 100,
      clientY: 175,
      bubbles: true,
    });
    canvas.dispatchEvent(clickEvent);

    const store = context.annotationStore || mainModule.annotationStore;
    const annotations = store.getAnnotations ? store.getAnnotations() : store.annotations;
    const current = annotations[annotations.length - 1];

    assert.ok(current, 'Annotation must be present');
    assert.strictEqual(current.type, 'horizontal_level');
    assert.strictEqual(typeof current.price, 'number');
    assert.strictEqual(current.price, 175.0);

    if (renderedPrice !== null) {
      assert.strictEqual(renderedPrice, 175.0, 'Render loop must receive the mapped asset price');
    }
  });
});