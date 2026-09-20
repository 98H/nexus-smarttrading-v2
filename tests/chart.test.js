import test from 'node:test';
import assert from 'node:assert';

/*
 * MOCK INFRASTRUCTURE FOR HEADLESS NODE ENVIRONMENT
 * Simulates standard HTML5 Canvas and DOM tree for chart mounting.
 */

class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: 'clearRect', args: { x, y, w, h } });
  }

  fillRect(x, y, w, h) {
    this.calls.push({ method: 'fillRect', args: { x, y, w, h }, fillStyle: this.fillStyle });
  }

  strokeRect(x, y, w, h) {
    this.calls.push({ method: 'strokeRect', args: { x, y, w, h }, strokeStyle: this.strokeStyle });
  }

  beginPath() {
    this.calls.push({ method: 'beginPath' });
  }

  moveTo(x, y) {
    this.calls.push({ method: 'moveTo', args: { x, y } });
  }

  lineTo(x, y) {
    this.calls.push({ method: 'lineTo', args: { x, y } });
  }

  stroke() {
    this.calls.push({ method: 'stroke', strokeStyle: this.strokeStyle });
  }

  fill() {
    this.calls.push({ method: 'fill', fillStyle: this.fillStyle });
  }

  save() {
    this.calls.push({ method: 'save' });
  }

  restore() {
    this.calls.push({ method: 'restore' });
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.width = 1000;
    this.height = 500;
    this._context = null;
    this.style = {};
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parentElement = null;
    }
    return child;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      return Array.from(this.children).find((c) => c.id === targetId) || null;
    }
    return Array.from(this.children).find((c) => c.tagName.toLowerCase() === selector.toLowerCase()) || null;
  }

  getContext(type) {
    if (this.tagName !== 'CANVAS') return null;
    if (type === '2d') {
      if (!this._context) {
        this._context = new MockCanvasRenderingContext2D(this);
      }
      return this._context;
    }
    return null;
  }

  getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      width: this.width,
      height: this.height,
      right: this.width,
      bottom: this.height,
    };
  }
}

class MockDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new MockElement('body', 'body');
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  registerElement(id, element) {
    element.id = id;
    this.elementsById.set(id, element);
  }
}

// Global DOM setup
const mockDocument = new MockDocument();
const appContainer = new MockElement('div', 'app');
mockDocument.registerElement('app', appContainer);

globalThis.document = mockDocument;
globalThis.window = {
  document: mockDocument,
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: () => {},
  removeEventListener: () => {},
};

// Target imports under test
import { Chart, generateDenseCandles, SECTOR_COUNT_MINIMUM } from '../src/chart.js';

// Helper to evaluate sector occupancy across viewport width
function getSectorDistribution(xCoords, canvasWidth, numSectors = 3) {
  const sectorWidth = canvasWidth / numSectors;
  const sectorCounts = new Array(numSectors).fill(0);

  for (const x of xCoords) {
    let index = Math.floor(x / sectorWidth);
    if (index >= numSectors) index = numSectors - 1;
    if (index >= 0) {
      sectorCounts[index]++;
    }
  }
  return sectorCounts;
}

test('STORY 29.4.1 / DF-GRAPHICS-01: Resolve SPARSE_DATA_SERIES in Chart Rendering', async (t) => {
  await t.test('Defect Specification: SECTOR_COUNT_MINIMUM invariant constant is defined', () => {
    assert.strictEqual(
      typeof SECTOR_COUNT_MINIMUM,
      'number',
      'SECTOR_COUNT_MINIMUM constant must be exported as a number'
    );
    assert.ok(
      SECTOR_COUNT_MINIMUM >= 3,
      `SECTOR_COUNT_MINIMUM must require at least 3 sectors to eliminate DF-GRAPHICS-01 (found: ${SECTOR_COUNT_MINIMUM})`
    );
  });

  await t.test('Dense Dataset Generation: produces between 50 and 100 valid candle entities', () => {
    const candles = generateDenseCandles(80);

    assert.ok(Array.isArray(candles), 'generateDenseCandles must return an Array');
    assert.ok(
      candles.length >= 50 && candles.length <= 100,
      `Generated candle count (${candles.length}) must be within required dense boundary [50, 100]`
    );

    // Validate OHLC semantic structure of generated candles
    candles.forEach((candle, index) => {
      assert.strictEqual(typeof candle.open, 'number', `Candle [${index}] must have numeric 'open'`);
      assert.strictEqual(typeof candle.high, 'number', `Candle [${index}] must have numeric 'high'`);
      assert.strictEqual(typeof candle.low, 'number', `Candle [${index}] must have numeric 'low'`);
      assert.strictEqual(typeof candle.close, 'number', `Candle [${index}] must have numeric 'close'`);

      assert.ok(
        candle.high >= candle.low,
        `Candle [${index}] high (${candle.high}) must be >= low (${candle.low})`
      );
      assert.ok(
        candle.high >= Math.max(candle.open, candle.close),
        `Candle [${index}] high must envelop open and close`
      );
      assert.ok(
        candle.low <= Math.min(candle.open, candle.close),
        `Candle [${index}] low must be <= open and close`
      );
    });
  });

  await t.test('Chart Mount: automatically resolves sparse inputs by hydrating to 50-100 candles', () => {
    const canvas = mockDocument.createElement('canvas');
    canvas.width = 900;
    canvas.height = 450;

    // Simulate an initially sparse input (e.g. 5 points) triggering DF-GRAPHICS-01
    const sparseData = [
      { open: 100, high: 105, low: 95, close: 102 },
      { open: 102, high: 107, low: 98, close: 104 },
    ];

    const chart = new Chart(canvas, { data: sparseData });
    chart.mount();

    const resolvedCandles = chart.getData();
    assert.ok(
      resolvedCandles.length >= 50 && resolvedCandles.length <= 100,
      `Sparse data series must be hydrated to [50, 100] candles upon mount. Received: ${resolvedCandles.length}`
    );
  });

  await t.test('Viewport Coverage: visual elements populate ALL horizontal sectors (minimum 3 sectors)', () => {
    const canvas = mockDocument.createElement('canvas');
    const CANVAS_WIDTH = 900;
    canvas.width = CANVAS_WIDTH;
    canvas.height = 400;

    const chart = new Chart(canvas);
    chart.mount();
    chart.render();

    const ctx = canvas.getContext('2d');
    const drawCalls = ctx.calls;

    // Extract horizontal coordinates where candles or wicks are drawn
    const renderedXPositions = [];

    for (const call of drawCalls) {
      if (call.method === 'fillRect' || call.method === 'strokeRect') {
        renderedXPositions.push(call.args.x);
      } else if (call.method === 'moveTo' || call.method === 'lineTo') {
        renderedXPositions.push(call.args.x);
      }
    }

    assert.ok(
      renderedXPositions.length >= 50,
      `Expected at least 50 rendered candle operations, got ${renderedXPositions.length}`
    );

    // Compute distribution across 3 horizontal sectors: [0, 300), [300, 600), [600, 900]
    const sectors = getSectorDistribution(renderedXPositions, CANVAS_WIDTH, 3);

    assert.strictEqual(
      sectors.length,
      3,
      'There must be 3 configured viewport sectors'
    );

    // Defect DF-GRAPHICS-01 specifically: visual elements populated fewer than 3 horizontal sectors
    sectors.forEach((count, idx) => {
      assert.ok(
        count > 0,
        `Sector ${idx} [${idx * 300}px - ${(idx + 1) * 300}px) is starved (count: ${count}). All sectors must be populated.`
      );
    });

    const populatedSectors = sectors.filter((c) => c > 0).length;
    assert.ok(
      populatedSectors >= 3,
      `At least 3 horizontal viewport sectors must be populated with data elements. Populated: ${populatedSectors}`
    );

    // Verify horizontal span covers full canvas width (accounting for standard margins)
    const minX = Math.min(...renderedXPositions);
    const maxX = Math.max(...renderedXPositions);
    const totalSpan = maxX - minX;
    const coverageRatio = totalSpan / CANVAS_WIDTH;

    assert.ok(
      coverageRatio >= 0.85,
      `Candle series must span across the full canvas width. Expected >= 85% coverage, got ${(coverageRatio * 100).toFixed(1)}%`
    );
  });

  await t.test('Defect DF-GRAPHICS-01 Regression: Candles are evenly distributed, not clustered into <3 sectors', () => {
    const canvas = mockDocument.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 600;

    const chart = new Chart(canvas);
    chart.mount();
    chart.render();

    const candlePositions = chart.getCandleCoordinates();
    assert.ok(Array.isArray(candlePositions), 'chart.getCandleCoordinates() must return coordinate array');
    assert.ok(
      candlePositions.length >= 50 && candlePositions.length <= 100,
      `Coordinate count (${candlePositions.length}) must match dense series bounds [50, 100]`
    );

    const xCoords = candlePositions.map((p) => p.x);
    const sectorDistribution = getSectorDistribution(xCoords, canvas.width, 3);

    // Ensure balanced density across left, middle, right sectors
    const [leftSector, centerSector, rightSector] = sectorDistribution;
    assert.ok(leftSector >= 10, `Left sector must contain >= 10 candles, got ${leftSector}`);
    assert.ok(centerSector >= 10, `Center sector must contain >= 10 candles, got ${centerSector}`);
    assert.ok(rightSector >= 10, `Right sector must contain >= 10 candles, got ${rightSector}`);
  });
});

test('STORY 29.4.1 / Architectural Invariant: Entrypoint Wiring in src/main.js', async (t) => {
  await t.test('Active entrypoint mounts chart canvas to document.getElementById("app") on load', async () => {
    // Reset app container before entrypoint load
    appContainer.children = [];

    // Dynamically import src/main.js to execute top-level browser initialization
    const mainModule = await import(`../src/main.js?ts=${Date.now()}`);

    // If main exports an explicit init/bootstrap function, call it; otherwise top-level mount executes
    if (typeof mainModule.init === 'function') {
      mainModule.init();
    } else if (typeof mainModule.bootstrap === 'function') {
      mainModule.bootstrap();
    }

    const appNode = mockDocument.getElementById('app');
    assert.ok(appNode, 'Target element document.getElementById("app") must exist');

    const canvasChild = Array.from(appNode.children).find((child) => child.tagName === 'CANVAS');
    assert.ok(
      canvasChild,
      'Active entrypoint (src/main.js) must mount a <canvas> element inside document.getElementById("app")'
    );
    assert.ok(
      canvasChild.parentElement === appNode,
      'Canvas must be actively attached to the DOM tree (#app)'
    );

    const ctx = canvasChild.getContext('2d');
    assert.ok(ctx, 'Mounted canvas must provide a 2D rendering context');

    // Verify drawing calls took place immediately upon mount
    assert.ok(
      ctx.calls.length > 0,
      'Entrypoint must render charting visual elements immediately upon page load'
    );

    // Extract horizontal positions rendered via main.js
    const renderedXCoords = ctx.calls
      .filter((c) => (c.method === 'fillRect' || c.method === 'moveTo') && c.args && typeof c.args.x === 'number')
      .map((c) => c.args.x);

    assert.ok(
      renderedXCoords.length >= 50,
      `Entrypoint render must output 50 to 100 candle elements immediately. Found: ${renderedXCoords.length}`
    );

    const sectors = getSectorDistribution(renderedXCoords, canvasChild.width, 3);
    const populatedSectors = sectors.filter((c) => c > 0).length;

    assert.strictEqual(
      populatedSectors,
      3,
      `Live browser entrypoint must populate all 3 viewport sectors immediately upon mount to prevent DF-GRAPHICS-01. Populated: ${populatedSectors}/3`
    );
  });
});