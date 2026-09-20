import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { Chart } from '../src/chart.js';
import * as Main from '../src/main.js';

/**
 * Mock implementation of CanvasRenderingContext2D to intercept drawing operations.
 */
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.font = '10px sans-serif';
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.drawCalls = [];
  }

  fillText(text, x, y, maxWidth) {
    this.drawCalls.push({
      type: 'fillText',
      text: String(text),
      x: Number(x),
      y: Number(y),
      maxWidth,
      font: this.font,
      fillStyle: this.fillStyle,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline
    });
  }

  strokeText(text, x, y, maxWidth) {
    this.drawCalls.push({
      type: 'strokeText',
      text: String(text),
      x: Number(x),
      y: Number(y),
      maxWidth
    });
  }

  beginPath() {
    this.drawCalls.push({ type: 'beginPath' });
  }

  moveTo(x, y) {
    this.drawCalls.push({ type: 'moveTo', x, y });
  }

  lineTo(x, y) {
    this.drawCalls.push({ type: 'lineTo', x, y });
  }

  stroke() {
    this.drawCalls.push({ type: 'stroke' });
  }

  fillRect(x, y, w, h) {
    this.drawCalls.push({ type: 'fillRect', x, y, w, h });
  }

  clearRect(x, y, w, h) {
    this.drawCalls.push({ type: 'clearRect', x, y, w, h });
  }

  measureText(text) {
    return {
      width: String(text).length * 6,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2
    };
  }

  save() {}
  restore() {}
  setLineDash() {}
}

/**
 * Mock HTMLCanvasElement for headless Node.js execution.
 */
class MockCanvas {
  constructor(width = 800, height = 600) {
    this.width = width;
    this.height = height;
    this.style = {};
    this.listeners = new Map();
    this.context = new MockCanvasRenderingContext2D(this);
  }

  getContext(type) {
    if (type === '2d') {
      return this.context;
    }
    return null;
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height
    };
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  removeEventListener(event, handler) {
    const list = this.listeners.get(event) || [];
    this.listeners.set(
      event,
      list.filter((cb) => cb !== handler)
    );
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const handler of list) {
      handler(event);
    }
  }
}

// Sample time-series / candlestick test data with ISO timestamps
const SAMPLE_CANDLESTICKS = [
  { timestamp: 1704067200000, open: 100, high: 105, low: 98, close: 103 }, // 2024-01-01 00:00 UTC
  { timestamp: 1704070800000, open: 103, high: 107, low: 101, close: 106 }, // 2024-01-01 01:00 UTC
  { timestamp: 1704074400000, open: 106, high: 108, low: 104, close: 105 }, // 2024-01-01 02:00 UTC
  { timestamp: 1704078000000, open: 105, high: 110, low: 103, close: 109 }, // 2024-01-01 03:00 UTC
  { timestamp: 1704081600000, open: 109, high: 112, low: 107, close: 111 }  // 2024-01-01 04:00 UTC
];

const TIME_FORMAT_REGEX = /(?:\d{1,2}:\d{2}(?::\d{2})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})/;

describe('STORY 27.2.1: Resolve MISSING_HORIZONTAL_TIME_AXIS (DF-SCALES-02)', () => {
  let originalWindow;
  let originalDocument;
  let mockWindow;
  let mockDocument;
  let canvas;

  beforeEach(() => {
    canvas = new MockCanvas(800, 600);

    mockDocument = {
      getElementById: (id) => {
        if (id === 'chart' || id === 'chart-canvas') return canvas;
        return null;
      },
      createElement: (tag) => {
        if (tag === 'canvas') return new MockCanvas(800, 600);
        return {};
      },
      body: {
        appendChild: () => {}
      }
    };

    mockWindow = {
      addEventListener: (event, handler) => {
        if (!mockWindow.listeners[event]) mockWindow.listeners[event] = [];
        mockWindow.listeners[event].push(handler);
      },
      removeEventListener: (event, handler) => {
        if (!mockWindow.listeners[event]) return;
        mockWindow.listeners[event] = mockWindow.listeners[event].filter((h) => h !== handler);
      },
      dispatchEvent: (event) => {
        const handlers = mockWindow.listeners[event.type] || [];
        for (const handler of handlers) handler(event);
      },
      listeners: {},
      innerWidth: 800,
      innerHeight: 600,
      requestAnimationFrame: (cb) => setTimeout(cb, 0),
      cancelAnimationFrame: (id) => clearTimeout(id)
    };

    originalWindow = globalThis.window;
    originalDocument = globalThis.document;

    globalThis.window = mockWindow;
    globalThis.document = mockDocument;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });

  describe('src/chart.js - Horizontal Time Axis Rendering & Bounds', () => {
    it('should render formatted horizontal time markers along the bottom edge within canvas viewport', () => {
      const chart = new Chart(canvas, {
        data: SAMPLE_CANDLESTICKS,
        timeAxis: { visible: true, height: 30 }
      });

      chart.render();

      const fillTextCalls = canvas.context.drawCalls.filter((c) => c.type === 'fillText');
      const timeLabels = fillTextCalls.filter((call) => TIME_FORMAT_REGEX.test(call.text));

      // Acceptance Criteria 1: Horizontal time scale labels must be clearly drawn
      assert.ok(
        timeLabels.length >= 2,
        `Expected at least 2 time labels, but received ${timeLabels.length}. Total text calls: ${fillTextCalls.length}`
      );

      const canvasHeight = canvas.height;
      const expectedBottomZoneTop = canvasHeight - 60; // Allowed bottom margin area

      for (const label of timeLabels) {
        // Must be within visible viewport fold: strictly > 0 and <= canvas.height
        assert.ok(
          label.y <= canvasHeight,
          `Time label "${label.text}" at y=${label.y} is pushed outside bottom canvas viewport boundary (${canvasHeight})`
        );
        assert.ok(
          label.y >= expectedBottomZoneTop,
          `Time label "${label.text}" at y=${label.y} is not positioned along the bottom edge (expected >= ${expectedBottomZoneTop})`
        );

        // Must be horizontally distributed within canvas width
        assert.ok(
          label.x >= 0 && label.x <= canvas.width,
          `Time label "${label.text}" at x=${label.x} is outside canvas horizontal width (${canvas.width})`
        );
      }
    });

    it('should recompute time axis positions and remain visible above bottom boundary when viewport dimensions resize', () => {
      const chart = new Chart(canvas, {
        data: SAMPLE_CANDLESTICKS
      });

      chart.render();

      // Viewport expands vertically and horizontally
      const newWidth = 1280;
      const newHeight = 900;
      canvas.width = newWidth;
      canvas.height = newHeight;

      if (typeof chart.resize === 'function') {
        chart.resize(newWidth, newHeight);
      } else {
        chart.render();
      }

      const recentCalls = canvas.context.drawCalls.filter((c) => c.type === 'fillText');
      const timeLabels = recentCalls.filter((call) => TIME_FORMAT_REGEX.test(call.text));

      assert.ok(timeLabels.length >= 2, 'Time axis labels missing after viewport resize');

      for (const label of timeLabels) {
        // Assert dynamically adjusted position for new canvas height
        assert.ok(
          label.y <= newHeight,
          `Resized time label "${label.text}" at y=${label.y} exceeded new canvas height (${newHeight})`
        );
        assert.ok(
          label.y >= newHeight - 70,
          `Resized time label "${label.text}" at y=${label.y} did not follow bottom boundary (expected >= ${newHeight - 70})`
        );
        assert.ok(
          label.x <= newWidth,
          `Resized time label "${label.text}" at x=${label.x} exceeded new canvas width (${newWidth})`
        );
      }
    });

    it('should update timestamp markers when timeseries data changes without clipping beneath viewport fold', () => {
      const chart = new Chart(canvas, {
        data: SAMPLE_CANDLESTICKS
      });

      chart.render();
      canvas.context.drawCalls = []; // Reset call log

      // Newer time range 24 hours later
      const nextDayCandles = [
        { timestamp: 1704153600000, open: 111, high: 115, low: 110, close: 114 },
        { timestamp: 1704157200000, open: 114, high: 118, low: 113, close: 117 },
        { timestamp: 1704160800000, open: 117, high: 120, low: 116, close: 119 }
      ];

      if (typeof chart.setData === 'function') {
        chart.setData(nextDayCandles);
      } else if (typeof chart.update === 'function') {
        chart.update({ data: nextDayCandles });
      } else {
        chart.data = nextDayCandles;
        chart.render();
      }

      const postUpdateLabels = canvas.context.drawCalls.filter(
        (c) => c.type === 'fillText' && TIME_FORMAT_REGEX.test(c.text)
      );

      assert.ok(postUpdateLabels.length >= 2, 'No time labels rendered after data update');

      // Verify labels are correctly sorted horizontally
      for (let i = 1; i < postUpdateLabels.length; i++) {
        assert.ok(
          postUpdateLabels[i].x > postUpdateLabels[i - 1].x,
          `Time labels must be rendered sequentially left-to-right: label ${i - 1} (${postUpdateLabels[i - 1].x}) vs label ${i} (${postUpdateLabels[i].x})`
        );
      }

      // Verify bottom fold visibility
      postUpdateLabels.forEach((label) => {
        assert.ok(
          label.y <= canvas.height && label.y >= canvas.height - 60,
          `Label ${label.text} positioned outside bottom fold at y=${label.y}`
        );
      });
    });

    it('should reserve dedicated vertical margin for the time axis so candle graphics do not bleed over timestamps', () => {
      const chart = new Chart(canvas, {
        data: SAMPLE_CANDLESTICKS
      });

      chart.render();

      const timeLabels = canvas.context.drawCalls.filter(
        (c) => c.type === 'fillText' && TIME_FORMAT_REGEX.test(c.text)
      );
      assert.ok(timeLabels.length > 0, 'No time labels available to check layout margin');

      const timeAxisTopY = Math.min(...timeLabels.map((l) => l.y - 12)); // Account for font height

      // Check all line drawing (candlestick wicks/grid lines) to ensure main candle plotting
      // is constrained above the horizontal time axis area
      const candleBodyCalls = canvas.context.drawCalls.filter(
        (c) => (c.type === 'lineTo' || c.type === 'fillRect') && c.y !== undefined
      );

      // Candlesticks should strictly plot above timeAxisTopY or viewport's bottom reserve
      const candlesOverlappingAxis = candleBodyCalls.filter((call) => {
        const yPos = call.y ?? call.y;
        return yPos > timeAxisTopY && call.type === 'fillRect';
      });

      assert.strictEqual(
        candlesOverlappingAxis.length,
        0,
        `Found ${candlesOverlappingAxis.length} candle plot elements overlapping into the horizontal time axis zone`
      );
    });
  });

  describe('src/main.js - Active Entrypoint Integration (Architectural Invariant)', () => {
    it('should mount chart on application bootstrap and verify time axis renders on active canvas', () => {
      // Invariant: Never produce an unmounted file; entrypoint must mount and render time scale in DOM
      assert.ok(
        typeof Main.start === 'function' ||
        typeof Main.init === 'function' ||
        typeof Main.mount === 'function' ||
        typeof Main.default === 'function',
        'src/main.js must expose an initialization/mount function'
      );

      const initFn = Main.start || Main.init || Main.mount || Main.default;
      const appInstance = initFn({ canvas, data: SAMPLE_CANDLESTICKS });

      // Trigger render if not automatically executed during mount
      if (appInstance && typeof appInstance.render === 'function') {
        appInstance.render();
      }

      const activeTextCalls = canvas.context.drawCalls.filter((c) => c.type === 'fillText');
      const timeAxisMarkers = activeTextCalls.filter((c) => TIME_FORMAT_REGEX.test(c.text));

      assert.ok(
        timeAxisMarkers.length >= 2,
        `Active entrypoint failed to render time axis on mounted canvas. Markers found: ${timeAxisMarkers.length}`
      );

      // Verify markers stay within viewport bounds
      for (const marker of timeAxisMarkers) {
        assert.ok(
          marker.y <= canvas.height && marker.y >= canvas.height - 60,
          `Mounted entrypoint rendered time marker "${marker.text}" outside bottom viewport fold at y=${marker.y}`
        );
      }
    });

    it('should respond to window resize events by preserving time axis visibility within modified viewport', () => {
      const initFn = Main.start || Main.init || Main.mount || Main.default;
      initFn({ canvas, data: SAMPLE_CANDLESTICKS });

      // Simulate browser window resize event
      mockWindow.innerWidth = 1024;
      mockWindow.innerHeight = 768;
      canvas.width = 1024;
      canvas.height = 768;

      mockWindow.dispatchEvent({ type: 'resize' });

      const callsAfterResize = canvas.context.drawCalls.filter((c) => c.type === 'fillText');
      const timeMarkers = callsAfterResize.filter((c) => TIME_FORMAT_REGEX.test(c.text));

      assert.ok(timeMarkers.length >= 2, 'Time markers not found after window resize event');

      const latestTimeMarkers = timeMarkers.slice(-5);
      for (const marker of latestTimeMarkers) {
        assert.ok(
          marker.y <= 768 && marker.y >= 700,
          `After window resize, time marker "${marker.text}" at y=${marker.y} is not positioned within bottom bounds of 768px height`
        );
      }
    });

    it('should format horizontal ticks with valid date or hour:minute strings according to span', () => {
      const initFn = Main.start || Main.init || Main.mount || Main.default;
      initFn({ canvas, data: SAMPLE_CANDLESTICKS });

      const textCalls = canvas.context.drawCalls.filter((c) => c.type === 'fillText');
      const timeMarkers = textCalls.filter((c) => TIME_FORMAT_REGEX.test(c.text));

      assert.ok(timeMarkers.length > 0, 'No time markers rendered to inspect format');

      for (const marker of timeMarkers) {
        // Ensure marker is not an unformatted raw millisecond or NaN
        assert.notStrictEqual(marker.text, 'NaN', 'Time marker rendered as "NaN"');
        assert.notStrictEqual(marker.text, 'undefined', 'Time marker rendered as "undefined"');
        assert.ok(
          isNaN(Number(marker.text)),
          `Time marker "${marker.text}" appears to be a raw numerical value instead of a formatted date/time string`
        );
      }
    });
  });
});