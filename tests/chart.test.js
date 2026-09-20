import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as mainModule from '../src/main.js';
import { Chart, aggregateCandles } from '../src/chart.js';

/*
 * Minimal DOM harness for Node.js test execution
 * Simulates standard DOM APIs without external dependencies.
 */
function createMockElement(tagName = 'div', attributes = {}) {
  const listeners = new Map();
  const children = [];
  const classListSet = new Set();

  const element = {
    tagName: tagName.toUpperCase(),
    attributes: { ...attributes },
    dataset: {},
    style: {},
    children,
    parentElement: null,
    classList: {
      add: (...tokens) => tokens.forEach((t) => classListSet.add(t)),
      remove: (...tokens) => tokens.forEach((t) => classListSet.delete(t)),
      contains: (token) => classListSet.has(token),
      toggle: (token, force) => {
        const has = classListSet.has(token);
        const next = force !== undefined ? force : !has;
        if (next) classListSet.add(token);
        else classListSet.delete(token);
        return next;
      },
      toString: () => Array.from(classListSet).join(' '),
    },
    getAttribute: (key) => element.attributes[key] ?? null,
    setAttribute: (key, value) => {
      element.attributes[key] = String(value);
      if (key.startsWith('data-')) {
        const dataKey = key
          .slice(5)
          .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        element.dataset[dataKey] = String(value);
      }
    },
    removeAttribute: (key) => {
      delete element.attributes[key];
    },
    appendChild: (child) => {
      child.parentElement = element;
      children.push(child);
      return child;
    },
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener: (type, handler) => {
      const handlers = listeners.get(type) || [];
      const index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
    },
    dispatchEvent: (event) => {
      event.target = element;
      event.currentTarget = element;
      const handlers = listeners.get(event.type) || [];
      handlers.forEach((fn) => fn(event));
      return !event.defaultPrevented;
    },
    click: () => {
      element.dispatchEvent({
        type: 'click',
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      });
    },
    querySelector: (selector) => {
      const all = element.querySelectorAll(selector);
      return all.length > 0 ? all[0] : null;
    },
    querySelectorAll: (selector) => {
      const results = [];
      function traverse(node) {
        for (const child of node.children) {
          if (matchesSelector(child, selector)) {
            results.push(child);
          }
          traverse(child);
        }
      }
      traverse(element);
      return results;
    },
  };

  // Synchronize initial data attributes
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }

  return element;
}

function matchesSelector(element, selector) {
  if (selector.startsWith('.')) {
    return element.classList.contains(selector.slice(1));
  }
  if (selector.startsWith('#')) {
    return element.attributes.id === selector.slice(1);
  }
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const attrExpr = selector.slice(1, -1);
    if (attrExpr.includes('=')) {
      const [attr, val] = attrExpr.split('=');
      const cleanVal = val.replace(/['"]/g, '');
      return element.getAttribute(attr) === cleanVal;
    }
    return element.getAttribute(attrExpr) !== null;
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function createMockCanvas(width = 800, height = 400) {
  const canvas = createMockElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const drawCalls = [];
  const ctx = {
    canvas,
    drawCalls,
    clearRect: (x, y, w, h) => drawCalls.push({ type: 'clearRect', x, y, w, h }),
    fillRect: (x, y, w, h) => drawCalls.push({ type: 'fillRect', x, y, w, h }),
    strokeRect: (x, y, w, h) => drawCalls.push({ type: 'strokeRect', x, y, w, h }),
    beginPath: () => drawCalls.push({ type: 'beginPath' }),
    moveTo: (x, y) => drawCalls.push({ type: 'moveTo', x, y }),
    lineTo: (x, y) => drawCalls.push({ type: 'lineTo', x, y }),
    stroke: () => drawCalls.push({ type: 'stroke' }),
    fill: () => drawCalls.push({ type: 'fill' }),
    save: () => drawCalls.push({ type: 'save' }),
    restore: () => drawCalls.push({ type: 'restore' }),
  };

  canvas.getContext = (contextId) => {
    if (contextId === '2d') return ctx;
    return null;
  };

  return canvas;
}

// Sample raw 1-minute candle fixtures for testing aggregation and rendering
const RAW_1M_FIXTURES = [
  { timestamp: 1609459200000, open: 100, high: 105, low: 99, close: 104, volume: 10 },  // 00:00
  { timestamp: 1609459260000, open: 104, high: 108, low: 103, close: 107, volume: 15 }, // 00:01
  { timestamp: 1609459320000, open: 107, high: 109, low: 106, close: 106, volume: 20 }, // 00:02
  { timestamp: 1609459380000, open: 106, high: 110, low: 105, close: 108, volume: 25 }, // 00:03
  { timestamp: 1609459440000, open: 108, high: 112, low: 107, close: 111, volume: 30 }, // 00:04
  { timestamp: 1609459500000, open: 111, high: 113, low: 110, close: 112, volume: 12 }, // 00:05
  { timestamp: 1609459560000, open: 112, high: 115, low: 111, close: 114, volume: 18 }, // 00:06
  { timestamp: 1609459620000, open: 114, high: 116, low: 113, close: 115, volume: 22 }, // 00:07
  { timestamp: 1609459680000, open: 115, high: 117, low: 114, close: 116, volume: 16 }, // 00:08
  { timestamp: 1609459740000, open: 116, high: 118, low: 115, close: 117, volume: 14 }, // 00:09
];

describe('ENTRYPOINT INVARIANT: src/main.js', () => {
  it('exports mounting functions (mountApp or mount) and initializers', () => {
    const mountFn = mainModule.mountApp || mainModule.mount;
    assert.strictEqual(
      typeof mountFn,
      'function',
      'src/main.js must export a mounting function: `mountApp` or `mount`'
    );

    const initFn =
      mainModule.initApp || mainModule.init || mainModule.initialize;
    assert.strictEqual(
      typeof initFn,
      'function',
      'src/main.js must export an initializer function: `initApp`, `init`, or `initialize`'
    );
  });

  it('initializes and mounts the application UI into a DOM container without uncaught errors', () => {
    const mountFn = mainModule.mountApp || mainModule.mount;
    const container = createMockElement('div', { id: 'app-root' });

    assert.doesNotThrow(() => {
      const appInstance = mountFn(container, {
        candles: RAW_1M_FIXTURES,
        initialTimeframe: '1m',
        timeframes: ['1m', '5m', '1h'],
        createCanvas: () => createMockCanvas(800, 400),
      });
      assert.ok(appInstance, 'Mounting function should return an application instance');
    }, 'Calling the mounting function with a DOM container must not throw errors');

    const toolbar = container.querySelector('.toolbar') || container.querySelector('[data-role="toolbar"]');
    assert.ok(toolbar, 'Application UI must mount a toolbar container');

    const canvas = container.querySelector('canvas');
    assert.ok(canvas, 'Application UI must mount a chart canvas element');

    const buttons = container.querySelectorAll('button[data-timeframe]');
    assert.ok(buttons.length >= 3, 'Application UI must render timeframe buttons (e.g. 1m, 5m, 1h)');
  });
});

describe('STORY 1.3.1: Resolve INACTIVE_TOOLBAR_CONTROLS (DF-CONTROL-01)', () => {
  let container;
  let canvas;
  let mountFn;

  beforeEach(() => {
    container = createMockElement('div', { id: 'test-root' });
    mountFn = mainModule.mountApp || mainModule.mount;
    canvas = createMockCanvas(800, 400);
  });

  it('AC1: clicking an alternative timeframe button updates active state and re-renders chart canvas with aggregated candle data', () => {
    const app = mountFn(container, {
      candles: RAW_1M_FIXTURES,
      initialTimeframe: '1m',
      timeframes: ['1m', '5m', '1h'],
      createCanvas: () => canvas,
    });

    const btn1m = container.querySelector('button[data-timeframe="1m"]');
    const btn5m = container.querySelector('button[data-timeframe="5m"]');

    assert.ok(btn1m, '1m button must be rendered');
    assert.ok(btn5m, '5m button must be rendered');

    // Initial state: 1m is active
    assert.strictEqual(
      btn1m.classList.contains('active') || btn1m.getAttribute('aria-pressed') === 'true',
      true,
      'Initial 1m button must have active state'
    );
    assert.strictEqual(
      btn5m.classList.contains('active') || btn5m.getAttribute('aria-pressed') === 'true',
      false,
      'Initial 5m button must NOT have active state'
    );

    const ctx = canvas.getContext('2d');
    const initialDrawCallCount = ctx.drawCalls.length;
    assert.ok(initialDrawCallCount > 0, 'Chart must perform initial render on mount');

    // Act: Click '5m' button
    btn5m.click();

    // Verification 1: Button active state toggled
    const is5mActive =
      btn5m.classList.contains('active') || btn5m.getAttribute('aria-pressed') === 'true';
    const is1mActive =
      btn1m.classList.contains('active') || btn1m.getAttribute('aria-pressed') === 'true';

    assert.strictEqual(is5mActive, true, '5m button must update to active state after click');
    assert.strictEqual(is1mActive, false, '1m button must be deactivated after switching to 5m');

    // Verification 2: Canvas redraw cycle executed
    const postClickDrawCallCount = ctx.drawCalls.length;
    assert.ok(
      postClickDrawCallCount > initialDrawCallCount,
      'Chart canvas must execute a redraw cycle after timeframe selection'
    );

    const clearRectCalls = ctx.drawCalls.filter((c) => c.type === 'clearRect');
    assert.ok(
      clearRectCalls.length >= 2,
      'Canvas must clear previous render when switching timeframe'
    );

    // Verification 3: Candle data was aggregated to 5m timeframe
    const chart = app.chart || (app.getChart && app.getChart());
    assert.ok(chart, 'App must provide access to the underlying chart instance');

    const visibleCandles = chart.getVisibleCandles();
    // 10 1-minute candles aggregate to exactly 2 5-minute candles
    assert.strictEqual(
      visibleCandles.length,
      2,
      'Visible candles must be aggregated to 2 candles for 5m timeframe from 10 1m candles'
    );

    // Verify correct aggregation values for first 5m bucket (00:00 - 00:04)
    // Open: 100, High: 112, Low: 99, Close: 111, Volume: 10+15+20+25+30 = 100
    const first5mCandle = visibleCandles[0];
    assert.strictEqual(first5mCandle.open, 100);
    assert.strictEqual(first5mCandle.high, 112);
    assert.strictEqual(first5mCandle.low, 99);
    assert.strictEqual(first5mCandle.close, 111);
    assert.strictEqual(first5mCandle.volume, 100);
  });

  it('AC2: timeframe change executes redraw cycle and updates all visible candle coordinates', () => {
    const chart = new Chart(canvas, {
      candles: RAW_1M_FIXTURES,
      timeframe: '1m',
      width: 800,
      height: 400,
    });

    chart.render();
    const initialCoordinates = chart.getCandleCoordinates();

    assert.ok(
      Array.isArray(initialCoordinates),
      'Chart must return an array of candle coordinates'
    );
    assert.strictEqual(
      initialCoordinates.length,
      10,
      '1m timeframe should have 10 visible candle coordinate sets'
    );

    // Validate coordinate structure
    initialCoordinates.forEach((coord, idx) => {
      assert.strictEqual(typeof coord.x, 'number', `Candle ${idx} x-coordinate must be a number`);
      assert.strictEqual(typeof coord.candleWidth, 'number', `Candle ${idx} width must be a number`);
      assert.strictEqual(typeof coord.openY, 'number', `Candle ${idx} openY must be a number`);
      assert.strictEqual(typeof coord.closeY, 'number', `Candle ${idx} closeY must be a number`);
      assert.strictEqual(typeof coord.highY, 'number', `Candle ${idx} highY must be a number`);
      assert.strictEqual(typeof coord.lowY, 'number', `Candle ${idx} lowY must be a number`);
    });

    const ctx = canvas.getContext('2d');
    const drawCountBefore = ctx.drawCalls.length;

    // Trigger timeframe change to 5m
    chart.setTimeframe('5m');

    // Ensure redraw occurred
    const drawCountAfter = ctx.drawCalls.length;
    assert.ok(
      drawCountAfter > drawCountBefore,
      'chart.setTimeframe must trigger a redraw cycle'
    );

    // Validate updated candle coordinates
    const updatedCoordinates = chart.getCandleCoordinates();
    assert.strictEqual(
      updatedCoordinates.length,
      2,
      '5m timeframe must have exactly 2 visible candle coordinate sets'
    );

    // Candle widths must adapt to aggregated candle count (wider candles for fewer points)
    assert.ok(
      updatedCoordinates[0].candleWidth > initialCoordinates[0].candleWidth,
      'Aggregated candles should have wider body coordinates compared to finer timeframe'
    );

    // Coordinates must not match the old 1m coordinates
    assert.notDeepStrictEqual(
      updatedCoordinates,
      initialCoordinates,
      'Visible candle coordinates must be recalculated and updated on timeframe change'
    );
  });

  it('rejects unsupported or identical timeframe without redundant redraws', () => {
    const chart = new Chart(canvas, {
      candles: RAW_1M_FIXTURES,
      timeframe: '1m',
      width: 800,
      height: 400,
    });

    chart.render();
    const ctx = canvas.getContext('2d');
    const callCountAfterFirstRender = ctx.drawCalls.length;

    // Setting same timeframe should be a no-op and avoid redundant redraws
    chart.setTimeframe('1m');
    assert.strictEqual(
      ctx.drawCalls.length,
      callCountAfterFirstRender,
      'Setting the already active timeframe should not trigger a redundant canvas redraw'
    );

    // Setting an invalid timeframe must throw an Error and keep canvas intact
    assert.throws(() => {
      chart.setTimeframe('unsupported_tf');
    }, /unsupported timeframe/i);
  });
});

describe('AGGREGATION LOGIC: src/chart.js (aggregateCandles)', () => {
  it('correctly aggregates 1m candles into 5m buckets according to Defect DF-CONTROL-01 requirements', () => {
    const aggregated5m = aggregateCandles(RAW_1M_FIXTURES, '5m');

    assert.strictEqual(aggregated5m.length, 2, '10 1m candles must aggregate into 2 5m candles');

    // Bucket 1 (00:00 - 00:04)
    assert.strictEqual(aggregated5m[0].timestamp, 1609459200000);
    assert.strictEqual(aggregated5m[0].open, 100);
    assert.strictEqual(aggregated5m[0].high, 112);
    assert.strictEqual(aggregated5m[0].low, 99);
    assert.strictEqual(aggregated5m[0].close, 111);
    assert.strictEqual(aggregated5m[0].volume, 100);

    // Bucket 2 (00:05 - 00:09)
    // Open: 111, High: 118, Low: 110, Close: 117, Volume: 12+18+22+16+14 = 82
    assert.strictEqual(aggregated5m[1].timestamp, 1609459500000);
    assert.strictEqual(aggregated5m[1].open, 111);
    assert.strictEqual(aggregated5m[1].high, 118);
    assert.strictEqual(aggregated5m[1].low, 110);
    assert.strictEqual(aggregated5m[1].close, 117);
    assert.strictEqual(aggregated5m[1].volume, 82);
  });

  it('correctly aggregates candles into 1h buckets', () => {
    const aggregated1h = aggregateCandles(RAW_1M_FIXTURES, '1h');

    assert.strictEqual(aggregated1h.length, 1, '10 1m candles within the same hour aggregate into 1 candle');
    assert.strictEqual(aggregated1h[0].timestamp, 1609459200000);
    assert.strictEqual(aggregated1h[0].open, 100);
    assert.strictEqual(aggregated1h[0].high, 118);
    assert.strictEqual(aggregated1h[0].low, 99);
    assert.strictEqual(aggregated1h[0].close, 117);
    assert.strictEqual(aggregated1h[0].volume, 182);
  });
});