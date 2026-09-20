import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Chart } from '../src/chart.js';
import { bootstrap, initApp } from '../src/main.js';

// Mock Canvas 2D Context to record drawing commands and coordinates
function createMockContext() {
  return {
    calls: [],
    texts: [],
    lines: [],
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '10px sans-serif',
    textAlign: 'center',
    textBaseline: 'top',
    beginPath() {
      this.calls.push({ method: 'beginPath' });
    },
    moveTo(x, y) {
      this.calls.push({ method: 'moveTo', x, y });
    },
    lineTo(x, y) {
      this.calls.push({ method: 'lineTo', x, y });
      this.lines.push({ toX: x, toY: y });
    },
    stroke() {
      this.calls.push({ method: 'stroke' });
    },
    fillText(text, x, y) {
      const record = { text: String(text), x, y, font: this.font, textAlign: this.textAlign };
      this.calls.push({ method: 'fillText', ...record });
      this.texts.push(record);
    },
    measureText(text) {
      return { width: String(text).length * 7 };
    },
    clearRect(x, y, w, h) {
      this.calls.push({ method: 'clearRect', x, y, w, h });
    },
    save() {
      this.calls.push({ method: 'save' });
    },
    restore() {
      this.calls.push({ method: 'restore' });
    }
  };
}

// Mock DOM environment for Node.js
function setupMockDom() {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  const appElement = {
    id: 'app',
    children: [],
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
    },
    innerHTML: '',
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 })
  };

  const documentMock = {
    getElementById(id) {
      if (id === 'app') return appElement;
      return null;
    },
    createElement(tag) {
      if (tag === 'canvas') {
        const ctx = createMockContext();
        return {
          tagName: 'CANVAS',
          width: 800,
          height: 600,
          clientWidth: 800,
          clientHeight: 600,
          parentElement: null,
          getContext(type) {
            if (type === '2d') return ctx;
            return null;
          },
          getBoundingClientRect: () => ({ top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800 }),
          style: {}
        };
      }
      return {
        tagName: tag.toUpperCase(),
        style: {},
        appendChild() {},
        children: []
      };
    }
  };

  globalThis.document = documentMock;
  globalThis.window = {
    document: documentMock,
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1
  };

  return {
    restore() {
      globalThis.document = originalDocument;
      globalThis.window = originalWindow;
    },
    appElement
  };
}

describe('STORY 28.4.1: Resolve MISSING_HORIZONTAL_TIME_AXIS (Defect ID: DF-SCALES-02)', () => {
  let domHandle;

  beforeEach(() => {
    domHandle = setupMockDom();
  });

  afterEach(() => {
    domHandle.restore();
  });

  describe('src/chart.js - Horizontal Time Axis Rendering', () => {
    const sampleCandlesticks = [
      { timestamp: 1711929600000, open: 100, high: 105, low: 98, close: 104 }, // 2024-04-01 00:00:00 UTC
      { timestamp: 1711933200000, open: 104, high: 108, low: 103, close: 107 }, // 2024-04-01 01:00:00 UTC
      { timestamp: 1711936800000, open: 107, high: 110, low: 106, close: 109 }, // 2024-04-01 02:00:00 UTC
      { timestamp: 1711940400000, open: 109, high: 112, low: 108, close: 111 }, // 2024-04-01 03:00:00 UTC
      { timestamp: 1711944000000, open: 111, high: 115, low: 110, close: 114 }  // 2024-04-01 04:00:00 UTC
    ];

    it('should reserve dedicated bottom margin/padding for the time axis in layout calculations', () => {
      const canvas = globalThis.document.createElement('canvas');
      const chart = new Chart({
        canvas,
        width: 800,
        height: 600,
        data: sampleCandlesticks
      });

      // Defect verification: Bottom margin must not be 0 or omitted
      assert.ok(chart.layout, 'Chart must expose layout configuration');
      assert.ok(
        typeof chart.layout.bottomMargin === 'number' || typeof chart.layout.padding?.bottom === 'number',
        'Chart layout must explicitly define bottom margin/padding for the time scale'
      );

      const reservedBottom = chart.layout.bottomMargin ?? chart.layout.padding.bottom;
      assert.ok(
        reservedBottom >= 20,
        `Expected reserved bottom padding >= 20px to fit timestamp text, got ${reservedBottom}`
      );

      // Plot area height should not occupy the entire canvas height
      assert.ok(
        chart.plotArea.height <= canvas.height - reservedBottom,
        `Plot area height (${chart.plotArea.height}) must leave room for bottom axis (canvas height: ${canvas.height}, reserved: ${reservedBottom})`
      );
    });

    it('should visibly render formatted timestamp markers along the bottom edge within the viewport fold', () => {
      const canvas = globalThis.document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const chart = new Chart({
        canvas,
        width: 800,
        height: 600,
        data: sampleCandlesticks
      });

      chart.render();

      // Ensure text was drawn on canvas
      assert.ok(ctx.texts.length > 0, 'Canvas must render text elements');

      // Acceptance Criteria: Formatted timestamp/date markers (e.g. HH:mm or YYYY-MM-DD) must be rendered along the bottom edge
      const timeMarkerRegex = /(\d{2}:\d{2})|(\d{4}-\d{2}-\d{2})/;
      const timeMarkerTexts = ctx.texts.filter((t) => timeMarkerRegex.test(t.text));

      assert.ok(
        timeMarkerTexts.length >= 2,
        `Expected at least 2 formatted time axis markers along bottom edge, found ${timeMarkerTexts.length}`
      );

      // Acceptance Criteria: Drawn within the viewport fold rather than clipped or rendered off-screen (Y <= canvas.height and Y >= canvas.height - bottomMargin)
      const reservedBottom = chart.layout.bottomMargin ?? chart.layout.padding.bottom ?? 30;
      const minAcceptableY = canvas.height - reservedBottom;
      const maxAcceptableY = canvas.height;

      timeMarkerTexts.forEach((marker) => {
        assert.ok(
          marker.y >= minAcceptableY && marker.y <= maxAcceptableY,
          `Marker "${marker.text}" Y-coordinate (${marker.y}) is outside the visible bottom time axis fold [${minAcceptableY}, ${maxAcceptableY}]`
        );
        assert.ok(
          marker.x >= 0 && marker.x <= canvas.width,
          `Marker "${marker.text}" X-coordinate (${marker.x}) must be within canvas width [0, ${canvas.width}]`
        );
      });
    });

    it('should align time markers with candlestick data positions along the X-axis', () => {
      const canvas = globalThis.document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const chart = new Chart({
        canvas,
        width: 800,
        height: 600,
        data: sampleCandlesticks
      });

      chart.render();

      const timeMarkerRegex = /(\d{2}:\d{2})|(\d{4}-\d{2}-\d{2})/;
      const timeMarkerTexts = ctx.texts.filter((t) => timeMarkerRegex.test(t.text));

      // Markers must be monotonically increasing along the X axis
      for (let i = 1; i < timeMarkerTexts.length; i++) {
        assert.ok(
          timeMarkerTexts[i].x > timeMarkerTexts[i - 1].x,
          `Time marker X coordinates must be monotonically increasing: index ${i} (${timeMarkerTexts[i].x}) <= index ${i - 1} (${timeMarkerTexts[i - 1].x})`
        );
      }
    });

    it('should draw a horizontal axis line separating the plot area and the time scale', () => {
      const canvas = globalThis.document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const chart = new Chart({
        canvas,
        width: 800,
        height: 600,
        data: sampleCandlesticks
      });

      chart.render();

      const reservedBottom = chart.layout.bottomMargin ?? chart.layout.padding?.bottom ?? 30;
      const axisLineY = canvas.height - reservedBottom;

      // Check if a line was drawn across the canvas at approximately axisLineY
      const horizontalAxisLine = ctx.lines.find(
        (line) => Math.abs(line.toY - axisLineY) <= 2
      );

      assert.ok(
        horizontalAxisLine,
        `Expected horizontal baseline for time axis near Y=${axisLineY}, none found in rendered lines`
      );
    });
  });

  describe('src/main.js - Active Entrypoint Integration', () => {
    it('should mount into document.getElementById("app") and render the chart with bottom time scale', () => {
      const appContainer = globalThis.document.getElementById('app');
      assert.ok(appContainer, '#app container must exist');

      // Execute application bootstrap / initialization
      const initFn = typeof bootstrap === 'function' ? bootstrap : initApp;
      assert.ok(typeof initFn === 'function', 'src/main.js must export an initialization function (bootstrap or initApp)');

      initFn();

      // Verify canvas is mounted inside #app
      const mountedCanvas = appContainer.children.find((c) => c.tagName === 'CANVAS');
      assert.ok(mountedCanvas, 'Active entrypoint src/main.js must mount a canvas into document.getElementById("app")');

      const ctx = mountedCanvas.getContext('2d');
      assert.ok(ctx, 'Mounted canvas must have a 2d context');

      // Verify time scale markers exist on the mounted canvas
      const timeMarkerRegex = /(\d{2}:\d{2})|(\d{4}-\d{2}-\d{2})/;
      const timeMarkers = ctx.texts.filter((t) => timeMarkerRegex.test(t.text));

      assert.ok(
        timeMarkers.length > 0,
        'Entrypoint mount must render horizontal time scale markers on the active canvas'
      );

      // Verify markers do not clip beyond viewport height
      timeMarkers.forEach((marker) => {
        assert.ok(
          marker.y <= mountedCanvas.height,
          `Mounted marker "${marker.text}" at Y=${marker.y} exceeds canvas height ${mountedCanvas.height} (pushed outside viewport fold)`
        );
      });
    });
  });
});