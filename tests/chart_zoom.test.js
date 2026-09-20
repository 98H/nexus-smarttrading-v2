import test from 'node:test';
import assert from 'node:assert/strict';
import { Chart } from '../src/chart.js';
import * as main from '../src/main.js';

// Polyfill WheelEvent if not present in the runtime Node environment
if (typeof globalThis.WheelEvent === 'undefined') {
  globalThis.WheelEvent = class WheelEvent extends Event {
    constructor(type, eventInitDict = {}) {
      super(type, eventInitDict);
      this.deltaY = eventInitDict.deltaY ?? 0;
      this.deltaX = eventInitDict.deltaX ?? 0;
      this.deltaZ = eventInitDict.deltaZ ?? 0;
      this.clientX = eventInitDict.clientX ?? 0;
      this.clientY = eventInitDict.clientY ?? 0;
      this.defaultPrevented = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

// Test utility: creates an event-capable mock canvas with 2D context tracking
function createMockCanvas(width = 800, height = 600) {
  const target = new EventTarget();
  let clearRectCalls = 0;
  let strokeCalls = 0;
  let fillRectCalls = 0;

  const ctx = {
    canvas: null,
    clearRect: (x, y, w, h) => { clearRectCalls++; },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => { strokeCalls++; },
    fillRect: () => { fillRectCalls++; },
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    measureText: () => ({ width: 50 }),
    fillText: () => {},
    get clearRectCalls() { return clearRectCalls; },
    get strokeCalls() { return strokeCalls; },
    get fillRectCalls() { return fillRectCalls; },
    get totalDrawCalls() { return clearRectCalls + strokeCalls + fillRectCalls; },
    resetMetrics: () => {
      clearRectCalls = 0;
      strokeCalls = 0;
      fillRectCalls = 0;
    }
  };

  const canvas = {
    tagName: 'CANVAS',
    nodeName: 'CANVAS',
    nodeType: 1,
    width,
    height,
    style: {},
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
    }),
    getContext: (type) => {
      if (type === '2d') {
        ctx.canvas = canvas;
        return ctx;
      }
      return null;
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    _ctx: ctx,
  };

  return canvas;
}

// Test utility: creates a DOM container for mounting application UI
function createMockContainer() {
  const target = new EventTarget();
  const children = [];
  return {
    tagName: 'DIV',
    nodeName: 'DIV',
    nodeType: 1,
    children,
    style: {},
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      return child;
    },
    querySelector: (selector) => {
      if (selector === 'canvas') return children.find((c) => c.tagName === 'CANVAS') || null;
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === 'canvas') return children.filter((c) => c.tagName === 'CANVAS');
      return [];
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
}

// Polyfill global document for entrypoint mounting tests if missing in headless Node
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      if (tag.toLowerCase() === 'canvas') return createMockCanvas();
      return createMockContainer();
    },
  };
}

// Standard sample candlestick data set
const sampleCandlesticks = [
  { time: 1600000000, open: 100, high: 105, low: 98, close: 104, volume: 1000 },
  { time: 1600003600, open: 104, high: 110, low: 103, close: 108, volume: 1200 },
  { time: 1600007200, open: 108, high: 109, low: 101, close: 102, volume: 800 },
  { time: 1600010800, open: 102, high: 107, low: 100, close: 106, volume: 1500 },
  { time: 1600014400, open: 106, high: 112, low: 105, close: 111, volume: 2000 },
];

test.describe('ENTRYPOINT INVARIANT: Application Initialization and Mounting (src/main.js)', () => {
  test('should export mounting functions (mountApp or mount) and initializers', () => {
    const mountFn = main.mountApp || main.mount;
    assert.equal(
      typeof mountFn,
      'function',
      'src/main.js must export a mounting function: mountApp or mount'
    );

    const initFn = main.init || main.initialize || main.initApp;
    assert.equal(
      typeof initFn,
      'function',
      'src/main.js must export an initialization function: init, initialize, or initApp'
    );
  });

  test('should successfully initialize and mount chart UI inside a DOM container without uncaught errors', () => {
    const mountFn = main.mountApp || main.mount;
    const container = createMockContainer();

    let appInstance;
    assert.doesNotThrow(() => {
      appInstance = mountFn(container);
    }, 'Calling mount function with container must not throw errors');

    assert.ok(container.children.length > 0, 'Container must have mounted UI children');
    const canvasElement = container.querySelector('canvas');
    assert.ok(canvasElement, 'Mounting must create and attach a canvas element');
    assert.ok(appInstance, 'Mounting must return an initialized application or chart instance');
  });
});

test.describe('STORY 1.2.1 / DF-GESTURE-02: Canvas Wheel Zoom and Scale Recalculation (src/chart.js)', () => {
  test('should bind wheel event handler to canvas upon initialization and render initial candlesticks', () => {
    const canvas = createMockCanvas();
    const chart = new Chart(canvas, { data: sampleCandlesticks });

    assert.equal(typeof chart.zoomFactor, 'number', 'Chart must track numeric zoomFactor');
    assert.equal(chart.zoomFactor, 1.0, 'Initial zoomFactor must be 1.0');
    assert.ok(chart.timeScale, 'Chart must initialize timeScale');
    assert.ok(chart.priceScale, 'Chart must initialize priceScale');
    assert.ok(
      canvas._ctx.totalDrawCalls > 0,
      'Chart must perform an initial render of candlesticks to the canvas'
    );
  });

  test('should capture deltaY < 0 (scroll up / zoom in), increase zoomFactor, recalculate scales, and trigger immediate re-render', () => {
    const canvas = createMockCanvas();
    const chart = new Chart(canvas, { data: sampleCandlesticks });

    const initialZoom = chart.zoomFactor;
    const initialTimeDomainSpan = chart.timeScale.domain[1] - chart.timeScale.domain[0];
    const initialPriceDomainSpan = chart.priceScale.domain[1] - chart.priceScale.domain[0];

    canvas._ctx.resetMetrics();

    // Dispatch scroll up (zoom in)
    const wheelEvent = new globalThis.WheelEvent('wheel', {
      deltaY: -100,
      clientX: 400,
      clientY: 300,
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(wheelEvent);

    assert.ok(
      chart.zoomFactor > initialZoom,
      `Expected zoomFactor (${chart.zoomFactor}) to be greater than initialZoom (${initialZoom}) on zoom in`
    );

    const newTimeDomainSpan = chart.timeScale.domain[1] - chart.timeScale.domain[0];
    const newPriceDomainSpan = chart.priceScale.domain[1] - chart.priceScale.domain[0];

    assert.ok(
      newTimeDomainSpan < initialTimeDomainSpan,
      `Time scale visible range must contract on zoom in: expected ${newTimeDomainSpan} < ${initialTimeDomainSpan}`
    );
    assert.ok(
      newPriceDomainSpan < initialPriceDomainSpan,
      `Price scale visible range must contract on zoom in: expected ${newPriceDomainSpan} < ${initialPriceDomainSpan}`
    );

    assert.ok(
      canvas._ctx.totalDrawCalls > 0,
      'Canvas must immediately execute draw commands to re-render candlesticks after wheel zoom in'
    );
  });

  test('should capture deltaY > 0 (scroll down / zoom out), decrease zoomFactor, recalculate scales, and trigger immediate re-render', () => {
    const canvas = createMockCanvas();
    const chart = new Chart(canvas, { data: sampleCandlesticks });

    // First zoom in so we have headroom to zoom out
    canvas.dispatchEvent(new globalThis.WheelEvent('wheel', { deltaY: -200 }));
    const zoomedInFactor = chart.zoomFactor;
    const zoomedInTimeSpan = chart.timeScale.domain[1] - chart.timeScale.domain[0];
    const zoomedInPriceSpan = chart.priceScale.domain[1] - chart.priceScale.domain[0];

    canvas._ctx.resetMetrics();

    // Now dispatch scroll down (zoom out)
    const wheelEvent = new globalThis.WheelEvent('wheel', {
      deltaY: 100,
      clientX: 400,
      clientY: 300,
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(wheelEvent);

    assert.ok(
      chart.zoomFactor < zoomedInFactor,
      `Expected zoomFactor (${chart.zoomFactor}) to decrease from ${zoomedInFactor} on zoom out`
    );

    const zoomedOutTimeSpan = chart.timeScale.domain[1] - chart.timeScale.domain[0];
    const zoomedOutPriceSpan = chart.priceScale.domain[1] - chart.priceScale.domain[0];

    assert.ok(
      zoomedOutTimeSpan > zoomedInTimeSpan,
      `Time scale visible range must expand on zoom out: expected ${zoomedOutTimeSpan} > ${zoomedInTimeSpan}`
    );
    assert.ok(
      zoomedOutPriceSpan > zoomedInPriceSpan,
      `Price scale visible range must expand on zoom out: expected ${zoomedOutPriceSpan} > ${zoomedInPriceSpan}`
    );

    assert.ok(
      canvas._ctx.totalDrawCalls > 0,
      'Canvas must immediately execute draw commands to re-render candlesticks after wheel zoom out'
    );
  });
});

test.describe('STORY 1.2.1 / DF-GESTURE-02: Boundary Limits and Clamping Verification', () => {
  test('should clamp zoomFactor at minZoom threshold without runtime errors when over-scrolling zoom out', () => {
    const canvas = createMockCanvas();
    const minZoomLimit = 0.2;
    const chart = new Chart(canvas, {
      data: sampleCandlesticks,
      minZoom: minZoomLimit,
    });

    assert.equal(chart.minZoom, minZoomLimit, 'Chart must honor minZoom configuration');

    // Repeatedly scroll out beyond the lower limit
    assert.doesNotThrow(() => {
      for (let i = 0; i < 20; i++) {
        canvas.dispatchEvent(new globalThis.WheelEvent('wheel', { deltaY: 500 }));
      }
    }, 'Over-scrolling past minZoom limit must not throw errors');

    assert.equal(
      chart.zoomFactor,
      minZoomLimit,
      `zoomFactor must clamp exactly at minZoom threshold (${minZoomLimit})`
    );

    // Verify scales remain valid finite numbers and are not NaN or Infinity
    assert.ok(Number.isFinite(chart.timeScale.domain[0]), 'Time scale domain min must be finite');
    assert.ok(Number.isFinite(chart.timeScale.domain[1]), 'Time scale domain max must be finite');
    assert.ok(Number.isFinite(chart.priceScale.domain[0]), 'Price scale domain min must be finite');
    assert.ok(Number.isFinite(chart.priceScale.domain[1]), 'Price scale domain max must be finite');
    assert.ok(
      chart.timeScale.domain[1] > chart.timeScale.domain[0],
      'Time scale domain max must strictly exceed min at minZoom clamp'
    );
    assert.ok(
      chart.priceScale.domain[1] > chart.priceScale.domain[0],
      'Price scale domain max must strictly exceed min at minZoom clamp'
    );
  });

  test('should clamp zoomFactor at maxZoom threshold without runtime errors when over-scrolling zoom in', () => {
    const canvas = createMockCanvas();
    const maxZoomLimit = 5.0;
    const chart = new Chart(canvas, {
      data: sampleCandlesticks,
      maxZoom: maxZoomLimit,
    });

    assert.equal(chart.maxZoom, maxZoomLimit, 'Chart must honor maxZoom configuration');

    // Repeatedly scroll in beyond the upper limit
    assert.doesNotThrow(() => {
      for (let i = 0; i < 20; i++) {
        canvas.dispatchEvent(new globalThis.WheelEvent('wheel', { deltaY: -500 }));
      }
    }, 'Over-scrolling past maxZoom limit must not throw errors');

    assert.equal(
      chart.zoomFactor,
      maxZoomLimit,
      `zoomFactor must clamp exactly at maxZoom threshold (${maxZoomLimit})`
    );

    assert.ok(Number.isFinite(chart.timeScale.domain[0]), 'Time scale domain min must be finite');
    assert.ok(Number.isFinite(chart.timeScale.domain[1]), 'Time scale domain max must be finite');
    assert.ok(Number.isFinite(chart.priceScale.domain[0]), 'Price scale domain min must be finite');
    assert.ok(Number.isFinite(chart.priceScale.domain[1]), 'Price scale domain max must be finite');
    assert.ok(
      chart.timeScale.domain[1] > chart.timeScale.domain[0],
      'Time scale domain max must strictly exceed min at maxZoom clamp'
    );
    assert.ok(
      chart.priceScale.domain[1] > chart.priceScale.domain[0],
      'Price scale domain max must strictly exceed min at maxZoom clamp'
    );
  });

  test('should remain responsive and unfreeze gesture listeners after hitting boundary limits', () => {
    const canvas = createMockCanvas();
    const maxZoomLimit = 3.0;
    const minZoomLimit = 0.5;
    const chart = new Chart(canvas, {
      data: sampleCandlesticks,
      minZoom: minZoomLimit,
      maxZoom: maxZoomLimit,
    });

    // 1. Force chart to max zoom limit
    for (let i = 0; i < 15; i++) {
      canvas.dispatchEvent(new globalThis.WheelEvent('wheel', { deltaY: -300 }));
    }
    assert.equal(chart.zoomFactor, maxZoomLimit, 'Zoom must clamp at max limit');

    // 2. Dispatch additional wheel event in limiting direction (still up)
    canvas.dispatchEvent(new globalThis.WheelEvent('wheel', { deltaY: -100 }));
    assert.equal(chart.zoomFactor, maxZoomLimit, 'Zoom remains clamped at max');

    // 3. Reverse direction: dispatch wheel down (zoom out)
    canvas.dispatchEvent(new globalThis.WheelEvent('wheel', { deltaY: 100 }));
    assert.ok(
      chart.zoomFactor < maxZoomLimit,
      'Gesture listener must not freeze: chart must zoom out immediately when reversing wheel direction from max bound'
    );

    // 4. Force chart to min zoom limit
    for (let i = 0; i < 20; i++) {
      canvas.dispatchEvent(new globalThis.WheelEvent('wheel', { deltaY: 300 }));
    }
    assert.equal(chart.zoomFactor, minZoomLimit, 'Zoom must clamp at min limit');

    // 5. Dispatch additional wheel event in limiting direction (still down)
    canvas.dispatchEvent(new globalThis.WheelEvent('wheel', { deltaY: 100 }));
    assert.equal(chart.zoomFactor, minZoomLimit, 'Zoom remains clamped at min');

    // 6. Reverse direction: dispatch wheel up (zoom in)
    canvas.dispatchEvent(new globalThis.WheelEvent('wheel', { deltaY: -100 }));
    assert.ok(
      chart.zoomFactor > minZoomLimit,
      'Gesture listener must not freeze: chart must zoom in immediately when reversing wheel direction from min bound'
    );
  });
});