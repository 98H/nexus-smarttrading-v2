import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Chart } from '../src/main.js';

// Helper to create a mock 2D canvas context and canvas element for headless Node.js testing
function createMockCanvas(width = 800, height = 600) {
  const listeners = new Map();
  const drawCalls = [];

  const ctx = {
    clearRect: (...args) => drawCalls.push({ method: 'clearRect', args }),
    beginPath: (...args) => drawCalls.push({ method: 'beginPath', args }),
    stroke: (...args) => drawCalls.push({ method: 'stroke', args }),
    fill: (...args) => drawCalls.push({ method: 'fill', args }),
    fillRect: (...args) => drawCalls.push({ method: 'fillRect', args }),
    strokeRect: (...args) => drawCalls.push({ method: 'strokeRect', args }),
    moveTo: (...args) => drawCalls.push({ method: 'moveTo', args }),
    lineTo: (...args) => drawCalls.push({ method: 'lineTo', args }),
    save: () => drawCalls.push({ method: 'save', args: [] }),
    restore: () => drawCalls.push({ method: 'restore', args: [] }),
    scale: (...args) => drawCalls.push({ method: 'scale', args }),
    translate: (...args) => drawCalls.push({ method: 'translate', args }),
    setTransform: (...args) => drawCalls.push({ method: 'setTransform', args }),
  };

  const canvas = {
    width,
    height,
    getContext: (type) => (type === '2d' ? ctx : null),
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener: (type, handler) => {
      if (listeners.has(type)) {
        const filtered = listeners.get(type).filter((fn) => fn !== handler);
        listeners.set(type, filtered);
      }
    },
    dispatchEvent: (event) => {
      const handlers = listeners.get(event.type) || [];
      for (const handler of handlers) {
        handler(event);
      }
      return !event.defaultPrevented;
    },
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
    }),
    _ctx: ctx,
    _drawCalls: drawCalls,
  };

  return canvas;
}

// Custom WheelEvent mock to verify preventDefault and delta values
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

  stopPropagation() {
    this.propagationStopped = true;
  }
}

describe('STORY 1.2.1: Resolve UNRESPONSIVE_CANVAS_ZOOM (DF-GESTURE-02)', () => {
  const sampleCandlesticks = [
    { time: 1620000000, open: 100, high: 110, low: 95, close: 105 },
    { time: 1620003600, open: 105, high: 115, low: 102, close: 112 },
    { time: 1620007200, open: 112, high: 120, low: 108, close: 118 },
    { time: 1620010800, open: 118, high: 125, low: 115, close: 122 },
  ];

  let canvas;
  let chart;

  beforeEach(() => {
    canvas = createMockCanvas(800, 600);
    chart = new Chart(canvas, {
      data: sampleCandlesticks,
      minZoom: 0.5,
      maxZoom: 5.0,
      initialZoom: 1.0,
    });
    chart.render();
  });

  it('should prevent default scrolling when wheel event occurs within zoom boundaries', () => {
    const wheelEvent = new MockWheelEvent('wheel', {
      deltaY: -100,
      clientX: 400,
      clientY: 300,
    });

    canvas.dispatchEvent(wheelEvent);

    assert.equal(
      wheelEvent.defaultPrevented,
      true,
      'Expected event.preventDefault() to be called to suppress native scroll'
    );
  });

  it('should adjust zoom factor proportionally based on deltaY magnitude and direction', () => {
    const initialZoom = chart.getZoom();
    assert.equal(initialZoom, 1.0, 'Initial zoom factor should be 1.0');

    // Zoom in (negative deltaY)
    const zoomInEvent = new MockWheelEvent('wheel', {
      deltaY: -120,
      clientX: 400,
      clientY: 300,
    });
    canvas.dispatchEvent(zoomInEvent);

    const zoomedInFactor = chart.getZoom();
    assert.ok(
      zoomedInFactor > initialZoom,
      `Expected zoom factor (${zoomedInFactor}) to be greater than initial (${initialZoom}) after scrolling up`
    );

    // Zoom out (positive deltaY)
    const zoomOutEvent = new MockWheelEvent('wheel', {
      deltaY: 240,
      clientX: 400,
      clientY: 300,
    });
    canvas.dispatchEvent(zoomOutEvent);

    const zoomedOutFactor = chart.getZoom();
    assert.ok(
      zoomedOutFactor < zoomedInFactor,
      `Expected zoom factor (${zoomedOutFactor}) to decrease after scrolling down`
    );
  });

  it('should update time and price scales when mouse wheel scrolls over canvas', () => {
    const initialTimeScale = { ...chart.getTimeScale() };
    const initialPriceScale = { ...chart.getPriceScale() };

    const wheelEvent = new MockWheelEvent('wheel', {
      deltaY: -150,
      clientX: 400,
      clientY: 300,
    });
    canvas.dispatchEvent(wheelEvent);

    const updatedTimeScale = chart.getTimeScale();
    const updatedPriceScale = chart.getPriceScale();

    assert.notDeepEqual(
      updatedTimeScale,
      initialTimeScale,
      'Time scale range/domain must update after wheel zoom'
    );
    assert.notDeepEqual(
      updatedPriceScale,
      initialPriceScale,
      'Price scale range/domain must update after wheel zoom'
    );
  });

  it('should re-render candlesticks at the new zoom level upon wheel scroll', () => {
    // Clear draw call history from initial render
    canvas._drawCalls.length = 0;

    const wheelEvent = new MockWheelEvent('wheel', {
      deltaY: -100,
      clientX: 400,
      clientY: 300,
    });
    canvas.dispatchEvent(wheelEvent);

    // Verify canvas cleared and new render operations occurred
    const clearOperations = canvas._drawCalls.filter(
      (call) => call.method === 'clearRect'
    );
    const drawOperations = canvas._drawCalls.filter((call) =>
      ['fillRect', 'strokeRect', 'stroke', 'fill'].includes(call.method)
    );

    assert.ok(
      clearOperations.length > 0,
      'Canvas must clear previous frame when re-rendering at new zoom level'
    );
    assert.ok(
      drawOperations.length > 0,
      'Candlesticks must be redrawn on canvas after zoom update'
    );
  });

  it('should clamp zoom factor at minZoom and maxZoom boundaries', () => {
    // Attempt extreme zoom-in
    for (let i = 0; i < 20; i++) {
      canvas.dispatchEvent(
        new MockWheelEvent('wheel', { deltaY: -500, clientX: 400, clientY: 300 })
      );
    }
    assert.equal(
      chart.getZoom(),
      5.0,
      'Zoom factor must not exceed maxZoom boundary (5.0)'
    );

    // Attempt extreme zoom-out
    for (let i = 0; i < 40; i++) {
      canvas.dispatchEvent(
        new MockWheelEvent('wheel', { deltaY: 500, clientX: 400, clientY: 300 })
      );
    }
    assert.equal(
      chart.getZoom(),
      0.5,
      'Zoom factor must not fall below minZoom boundary (0.5)'
    );
  });
});