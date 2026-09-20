import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Target Modules under test
import { Chart, TIME_AXIS_FORMATS } from '../src/chart.js';
import { mountApp, bootstrap, activeChartInstance } from '../src/main.js';

/**
 * Lightweight mock environment for Document and Canvas2D Context
 * simulating viewport boundaries and drawing coordinate inspections.
 */
class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.textCalls = [];
    this.lineCalls = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.font = '10px sans-serif';
  }

  fillText(text, x, y) {
    this.textCalls.push({ text: String(text), x, y, timestamp: Date.now() });
  }

  strokeText(text, x, y) {
    this.textCalls.push({ text: String(text), x, y, timestamp: Date.now() });
  }

  measureText(text) {
    return { width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  }

  beginPath() {
    this._currentPath = [];
  }

  moveTo(x, y) {
    this._currentPath = this._currentPath || [];
    this._currentPath.push({ op: 'moveTo', x, y });
  }

  lineTo(x, y) {
    this._currentPath = this._currentPath || [];
    this._currentPath.push({ op: 'lineTo', x, y });
  }

  stroke() {
    if (this._currentPath && this._currentPath.length > 0) {
      this.lineCalls.push([...this._currentPath]);
    }
  }

  clearRect() {
    this.textCalls = [];
    this.lineCalls = [];
  }

  save() {}
  restore() {}
  setLineDash() {}
}

class MockElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.clientWidth = 800;
    this.clientHeight = 600;
    this.width = 800;
    this.height = 600;
    this.style = {};
    this._listeners = new Map();
    this._ctx = null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
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

  addEventListener(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(handler);
  }

  removeEventListener(event, handler) {
    if (!this._listeners.has(event)) return;
    const list = this._listeners.get(event).filter((h) => h !== handler);
    this._listeners.set(event, list);
  }

  dispatchEvent(event) {
    const handlers = this._listeners.get(event.type) || [];
    for (const h of handlers) {
      h(event);
    }
    return true;
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      bottom: this.clientHeight,
      right: this.clientWidth,
      width: this.clientWidth,
      height: this.clientHeight,
    };
  }

  getContext(type) {
    if (type === '2d') {
      if (!this._ctx) {
        this._ctx = new MockCanvasRenderingContext2D(this);
      }
      return this._ctx;
    }
    return null;
  }
}

describe('STORY 29.6.1: Resolve MISSING_HORIZONTAL_TIME_AXIS (Defect ID: DF-SCALES-02)', () => {
  let originalWindow;
  let originalDocument;
  let appContainer;
  let windowListeners;

  const TIME_REGEX = /^(?:\d{4}-\d{2}-\d{2}|\d{2}:\d{2}(?::\d{2})?)$/;

  const SAMPLE_CANDLESTICKS = [
    { timestamp: 1704067200000, open: 100, high: 105, low: 98, close: 103 }, // 2024-01-01 00:00:00
    { timestamp: 1704070800000, open: 103, high: 107, low: 101, close: 106 }, // 2024-01-01 01:00:00
    { timestamp: 1704074400000, open: 106, high: 108, low: 104, close: 105 }, // 2024-01-01 02:00:00
    { timestamp: 1704078000000, open: 105, high: 110, low: 104, close: 109 }, // 2024-01-01 03:00:00
  ];

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalDocument = globalThis.document;
    windowListeners = new Map();

    appContainer = new MockElement('DIV', 'app');
    appContainer.clientWidth = 1024;
    appContainer.clientHeight = 768;

    globalThis.document = {
      getElementById: (id) => (id === 'app' ? appContainer : null),
      createElement: (tag) => new MockElement(tag),
    };

    globalThis.window = {
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: (event, handler) => {
        if (!windowListeners.has(event)) windowListeners.set(event, []);
        windowListeners.get(event).push(handler);
      },
      removeEventListener: (event, handler) => {
        if (!windowListeners.has(event)) return;
        windowListeners.set(
          event,
          windowListeners.get(event).filter((h) => h !== handler)
        );
      },
      dispatchEvent: (event) => {
        const list = windowListeners.get(event.type) || [];
        for (const h of list) h(event);
      },
    };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });

  describe('Acceptance Criteria 1: Visible Horizontal Time Scale Axis Above The Fold', () => {
    it('renders formatted time/date labels within canvas vertical bounds above viewport bottom fold', () => {
      const chart = new Chart({
        container: appContainer,
        width: 800,
        height: 600,
        data: SAMPLE_CANDLESTICKS,
      });

      chart.render();

      const canvas = appContainer.querySelector('canvas');
      assert.ok(canvas, 'Canvas element must be mounted into the app container');
      const ctx = canvas.getContext('2d');

      const timeLabels = ctx.textCalls.filter((call) => TIME_REGEX.test(call.text.trim()));

      assert.ok(
        timeLabels.length > 0,
        'Horizontal time scale must render formatted date/time labels (e.g. HH:mm or YYYY-MM-DD)'
      );

      const layout = chart.getLayout();
      assert.ok(
        layout.bottomPadding > 0,
        `Expected bottomPadding > 0 to reserve space for the time axis, got: ${layout.bottomPadding}`
      );

      for (const label of timeLabels) {
        // Assert label is rendered above the fold (within canvas view)
        assert.ok(
          label.y <= canvas.height,
          `Time label "${label.text}" y-coord (${label.y}) pushed outside visible fold bottom (${canvas.height})`
        );
        assert.ok(
          label.y >= canvas.height - layout.bottomPadding,
          `Time label "${label.text}" y-coord (${label.y}) should be positioned inside bottom axis region [${
            canvas.height - layout.bottomPadding
          }, ${canvas.height}]`
        );
      }
    });

    it('draws a distinct baseline or tick markers along the bottom margin boundary', () => {
      const chart = new Chart({
        container: appContainer,
        width: 800,
        height: 600,
        data: SAMPLE_CANDLESTICKS,
      });

      chart.render();

      const canvas = appContainer.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const layout = chart.getLayout();

      const bottomThreshold = canvas.height - layout.bottomPadding;

      // Verify lines/ticks rendered near or along the bottom border
      const bottomAxisLines = ctx.lineCalls.filter((path) =>
        path.some((pt) => pt.y >= bottomThreshold && pt.y <= canvas.height)
      );

      assert.ok(
        bottomAxisLines.length > 0,
        'Expected at least one tick line or axis separator rendered along the bottom boundary'
      );
    });
  });

  describe('Acceptance Criteria 2: Layout Resizing & Dynamic Viewport Padding Anchoring', () => {
    it('reserves bottom padding when viewport dynamically resizes down to smaller dimensions', () => {
      const chart = new Chart({
        container: appContainer,
        width: 1000,
        height: 800,
        data: SAMPLE_CANDLESTICKS,
      });

      chart.render();

      // Trigger dynamic window resizing down to 400px height
      chart.resize(600, 400);

      const canvas = appContainer.querySelector('canvas');
      assert.equal(canvas.height, 400);
      assert.equal(canvas.width, 600);

      const ctx = canvas.getContext('2d');
      const timeLabelsAfterResize = ctx.textCalls.filter((call) => TIME_REGEX.test(call.text.trim()));

      assert.ok(
        timeLabelsAfterResize.length > 0,
        'Time scale markers must still be rendered after dynamic resizing'
      );

      const layout = chart.getLayout();
      assert.ok(
        layout.bottomPadding >= 20,
        `Expected layout bottomPadding to remain >= 20px on small screen, found: ${layout.bottomPadding}`
      );

      for (const label of timeLabelsAfterResize) {
        assert.ok(
          label.y <= 400,
          `After resize, label "${label.text}" y-coord (${label.y}) exceeded viewport height (400)`
        );
        assert.ok(
          label.y >= 400 - layout.bottomPadding,
          `After resize, label "${label.text}" y-coord (${label.y}) must be anchored above fold within bottom axis`
        );
      }
    });

    it('synchronizes bounds when receiving native window resize events', () => {
      // Test wiring of window resize listener inside chart/entrypoint
      mountApp();

      const chart = activeChartInstance();
      assert.ok(chart, 'Active chart instance must exist upon mountApp() execution');

      // Change mock window dimensions
      globalThis.window.innerWidth = 500;
      globalThis.window.innerHeight = 350;
      globalThis.window.dispatchEvent({ type: 'resize' });

      const canvas = appContainer.querySelector('canvas');
      const ctx = canvas.getContext('2d');

      const latestTimeLabels = ctx.textCalls.filter((call) => TIME_REGEX.test(call.text.trim()));
      assert.ok(latestTimeLabels.length > 0, 'Labels must redraw upon window resize event');

      for (const label of latestTimeLabels) {
        assert.ok(
          label.y <= canvas.height && label.y >= canvas.height - chart.getLayout().bottomPadding,
          `Window resize did not anchor time axis within fold: y=${label.y}, canvas.height=${canvas.height}`
        );
      }
    });
  });

  describe('Acceptance Criteria 3: Data Updates & Synchronous Redraw of Time Scale Axis', () => {
    it('synchronously refreshes time ticks along the bottom boundary when timeseries data updates', () => {
      const chart = new Chart({
        container: appContainer,
        width: 800,
        height: 600,
        data: SAMPLE_CANDLESTICKS.slice(0, 2),
      });

      chart.render();
      const canvas = appContainer.querySelector('canvas');
      const ctx = canvas.getContext('2d');

      const initialLabels = ctx.textCalls
        .filter((c) => TIME_REGEX.test(c.text.trim()))
        .map((c) => c.text.trim());

      const appendedData = [
        ...SAMPLE_CANDLESTICKS,
        { timestamp: 1704081600000, open: 109, high: 112, low: 108, close: 111 }, // 2024-01-01 04:00:00
      ];

      // Update timeseries data
      chart.updateData(appendedData);

      const updatedLabels = ctx.textCalls
        .filter((c) => TIME_REGEX.test(c.text.trim()))
        .map((c) => c.text.trim());

      assert.ok(
        updatedLabels.length > 0,
        'Time axis must not become blank upon updating candlestick/timeseries data'
      );

      // Verify that labels reflect the new domain
      assert.notDeepEqual(
        initialLabels,
        updatedLabels,
        'Time scale ticks must synchronously recompute and change when domain shifts'
      );

      // Verify bottom fold constraint is still strictly observed
      const layout = chart.getLayout();
      for (const call of ctx.textCalls.filter((c) => TIME_REGEX.test(c.text.trim()))) {
        assert.ok(
          call.y <= 600 && call.y >= 600 - layout.bottomPadding,
          `Tick "${call.text}" rendered outside bottom margin: y=${call.y}`
        );
      }
    });

    it('handles empty or single-point timeseries without throwing or displacing time axis bounds', () => {
      const chart = new Chart({
        container: appContainer,
        width: 800,
        height: 600,
        data: [],
      });

      assert.doesNotThrow(() => {
        chart.render();
      }, 'Rendering with empty data should not fail');

      const layout = chart.getLayout();
      assert.ok(
        layout.bottomPadding > 0,
        'Layout must retain reserved bottom padding even with empty dataset'
      );

      assert.doesNotThrow(() => {
        chart.updateData([SAMPLE_CANDLESTICKS[0]]);
      }, 'Updating to single data point should not throw');
    });
  });

  describe('Architectural Invariant: Live Entrypoint Mounting (src/main.js)', () => {
    it('mounts into document.getElementById("app") and wires horizontal time axis to active canvas', () => {
      // Execute live entrypoint
      const instance = bootstrap();

      const canvas = appContainer.querySelector('canvas');
      assert.ok(canvas, 'Entrypoint bootstrap() must mount a canvas inside #app');

      const ctx = canvas.getContext('2d');
      const renderedTimeLabels = ctx.textCalls.filter((c) => TIME_REGEX.test(c.text.trim()));

      assert.ok(
        renderedTimeLabels.length > 0,
        'Live entrypoint must immediately render visible horizontal time scale'
      );

      const layout = instance.getLayout();
      assert.ok(layout.bottomPadding > 0, 'Active entrypoint chart must reserve bottom padding');

      // Check all labels reside above viewport fold
      for (const call of renderedTimeLabels) {
        assert.ok(
          call.y <= canvas.height && call.y >= canvas.height - layout.bottomPadding,
          `Label ${call.text} at y=${call.y} is outside bottom fold boundary for height=${canvas.height}`
        );
      }
    });
  });
});