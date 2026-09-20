import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/* -------------------------------------------------------------------------- */
/*                               DOM & Canvas Mocks                            */
/* -------------------------------------------------------------------------- */

class MockCanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.drawCalls = [];
    this.xCoords = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
  }

  clearRect(x, y, w, h) {
    this.drawCalls.push({ type: 'clearRect', x, y, w, h });
  }

  fillRect(x, y, w, h) {
    this.drawCalls.push({ type: 'fillRect', x, y, w, h });
    this.xCoords.push(x, x + w);
  }

  strokeRect(x, y, w, h) {
    this.drawCalls.push({ type: 'strokeRect', x, y, w, h });
    this.xCoords.push(x, x + w);
  }

  beginPath() {
    this.drawCalls.push({ type: 'beginPath' });
  }

  moveTo(x, y) {
    this.drawCalls.push({ type: 'moveTo', x, y });
    this.xCoords.push(x);
  }

  lineTo(x, y) {
    this.drawCalls.push({ type: 'lineTo', x, y });
    this.xCoords.push(x);
  }

  stroke() {
    this.drawCalls.push({ type: 'stroke' });
  }

  fill() {
    this.drawCalls.push({ type: 'fill' });
  }

  save() {}
  restore() {}
  scale() {}
  translate() {}
}

class MockCanvas {
  constructor(width = 1000, height = 500) {
    this.tagName = 'CANVAS';
    this.width = width;
    this.height = height;
    this.clientWidth = width;
    this.clientHeight = height;
    this._ctx = new MockCanvasRenderingContext2D(this);
  }

  getContext(type) {
    if (type === '2d') {
      return this._ctx;
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
      bottom: this.height
    };
  }
}

class MockElement {
  constructor(id = '', tagName = 'DIV') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.innerHTML = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    if (selector.toLowerCase() === 'canvas') {
      return this.children.find(c => c.tagName === 'CANVAS') || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector.toLowerCase() === 'canvas') {
      return this.children.filter(c => c.tagName === 'CANVAS');
    }
    return [];
  }
}

// Global DOM setup for headless Node.js environment
const elementsMap = new Map();
const domListeners = new Map();

function setupGlobalDOM() {
  elementsMap.clear();
  domListeners.clear();

  const appElement = new MockElement('app', 'DIV');
  elementsMap.set('app', appElement);

  globalThis.document = {
    createElement: (tag) => {
      if (tag.toLowerCase() === 'canvas') {
        return new MockCanvas();
      }
      return new MockElement('', tag);
    },
    getElementById: (id) => elementsMap.get(id) || null,
    addEventListener: (event, callback) => {
      if (!domListeners.has(event)) {
        domListeners.set(event, []);
      }
      domListeners.get(event).push(callback);
    },
    removeEventListener: (event, callback) => {
      if (domListeners.has(event)) {
        const list = domListeners.get(event).filter(cb => cb !== callback);
        domListeners.set(event, list);
      }
    }
  };

  globalThis.window = {
    document: globalThis.document,
    addEventListener: globalThis.document.addEventListener
  };
}

setupGlobalDOM();

/* -------------------------------------------------------------------------- */
/*                               Helper Methods                               */
/* -------------------------------------------------------------------------- */

/**
 * Splits canvas horizontal range [0, width] into N sectors and counts points per sector.
 * Used to verify resolution of Defect DF-GRAPHICS-01.
 */
function evaluateSectorOccupancy(xCoords, canvasWidth, totalSectors = 3) {
  const sectorCounts = new Array(totalSectors).fill(0);
  const sectorSize = canvasWidth / totalSectors;

  for (const x of xCoords) {
    if (x >= 0 && x <= canvasWidth) {
      const sectorIndex = Math.min(Math.floor(x / sectorSize), totalSectors - 1);
      sectorCounts[sectorIndex]++;
    }
  }

  return {
    sectorCounts,
    populatedSectorsCount: sectorCounts.filter(c => c > 0).length
  };
}

/* -------------------------------------------------------------------------- */
/*                                Unit Tests                                  */
/* -------------------------------------------------------------------------- */

describe('STORY 1.1.1: Resolve SPARSE_DATA_SERIES (Defect DF-GRAPHICS-01)', () => {
  beforeEach(() => {
    setupGlobalDOM();
  });

  afterEach(() => {
    elementsMap.clear();
    domListeners.clear();
  });

  describe('src/chart.js - Timeseries Data Series and Canvas Sector Population', () => {
    it('should generate or accept a comprehensive data series of at least 50 to 100 points', async () => {
      const chartModule = await import('../src/chart.js');
      const ChartClass = chartModule.Chart || chartModule.default;
      const canvas = new MockCanvas(1000, 500);

      const chart = new ChartClass(canvas);
      const data = chart.getData ? chart.getData() : chart.data;

      assert.ok(
        Array.isArray(data),
        'Chart data must be an array of timeseries / candle elements'
      );
      assert.ok(
        data.length >= 50 && data.length <= 100,
        `Expected dataset to contain between 50 and 100 points, but got ${data ? data.length : 0}`
      );
    });

    it('should populate visual elements across all horizontal viewport sectors (at least 3 sectors)', async () => {
      const chartModule = await import('../src/chart.js');
      const ChartClass = chartModule.Chart || chartModule.default;
      const canvasWidth = 1200;
      const canvas = new MockCanvas(canvasWidth, 600);

      const chart = new ChartClass(canvas);
      chart.render();

      const ctx = canvas.getContext('2d');
      assert.ok(
        ctx.xCoords.length > 0,
        'Chart render must produce graphical commands recording horizontal x coordinates'
      );

      // Defect DF-GRAPHICS-01 specifies that rendering previously populated fewer than 3 sectors.
      // Must populate at least 3 sectors (left, center, right across the viewport).
      const { sectorCounts, populatedSectorsCount } = evaluateSectorOccupancy(
        ctx.xCoords,
        canvasWidth,
        3
      );

      assert.ok(
        populatedSectorsCount >= 3,
        `DF-GRAPHICS-01 Defect: Expected elements in >= 3 viewport sectors, but found only ${populatedSectorsCount}. Sector counts: [${sectorCounts.join(', ')}]`
      );

      // Every sector must have meaningful series density (at least 10 rendered coordinate touches)
      for (let i = 0; i < sectorCounts.length; i++) {
        assert.ok(
          sectorCounts[i] >= 10,
          `Viewport Sector ${i + 1} is underpopulated: ${sectorCounts[i]} draw points detected`
        );
      }
    });

    it('should span across the full width of the canvas view from left to right', async () => {
      const chartModule = await import('../src/chart.js');
      const ChartClass = chartModule.Chart || chartModule.default;
      const canvasWidth = 1000;
      const canvas = new MockCanvas(canvasWidth, 400);

      const chart = new ChartClass(canvas);
      chart.render();

      const ctx = canvas.getContext('2d');
      const minX = Math.min(...ctx.xCoords);
      const maxX = Math.max(...ctx.xCoords);

      // Full width criteria: series begins near the left edge (< 15% width) and ends near the right edge (> 85% width)
      const leftThreshold = canvasWidth * 0.15;
      const rightThreshold = canvasWidth * 0.85;

      assert.ok(
        minX <= leftThreshold,
        `First series elements must start near the left viewport boundary. Expected <= ${leftThreshold}, got ${minX}`
      );
      assert.ok(
        maxX >= rightThreshold,
        `Last series elements must reach toward the right viewport boundary. Expected >= ${rightThreshold}, got ${maxX}`
      );
    });
  });

  describe('src/main.js - Application Entrypoint & Invariant Wiring', () => {
    it('should automatically mount chart component to document.getElementById("app")', async () => {
      const appContainer = globalThis.document.getElementById('app');
      assert.strictEqual(
        appContainer.children.length,
        0,
        'Initial state of #app must be empty before entrypoint initialization'
      );

      const mainModule = await import(`../src/main.js?t=${Date.now()}`);

      // If main exports an explicit init/mount function, call it, or trigger DOMContentLoaded if registered
      if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount();
      } else if (domListeners.has('DOMContentLoaded')) {
        for (const cb of domListeners.get('DOMContentLoaded')) {
          cb();
        }
      }

      const mountedCanvas = appContainer.querySelector('canvas');
      assert.ok(
        mountedCanvas !== null,
        'Architectural Invariant Violated: Chart canvas is not mounted to document.getElementById("app")'
      );
    });

    it('should mount with a full-width horizontal timeseries containing 50-100 data points', async () => {
      const appContainer = globalThis.document.getElementById('app');

      const mainModule = await import(`../src/main.js?t=${Date.now() + 1}`);

      if (typeof mainModule.init === 'function') {
        mainModule.init();
      } else if (typeof mainModule.mount === 'function') {
        mainModule.mount();
      } else if (domListeners.has('DOMContentLoaded')) {
        for (const cb of domListeners.get('DOMContentLoaded')) {
          cb();
        }
      }

      const canvas = appContainer.querySelector('canvas');
      assert.ok(canvas, 'Expected canvas to be mounted inside #app');

      const ctx = canvas.getContext('2d');
      assert.ok(
        ctx.drawCalls.length > 0,
        'Mounted chart canvas in #app must have executed draw/render operations'
      );

      const { sectorCounts, populatedSectorsCount } = evaluateSectorOccupancy(
        ctx.xCoords,
        canvas.width,
        3
      );

      assert.strictEqual(
        populatedSectorsCount,
        3,
        `Mounted production chart must populate all 3 horizontal viewport sectors. Counts: [${sectorCounts.join(', ')}]`
      );
    });

    it('should not produce an isolated or unmounted instance', async () => {
      const appContainer = globalThis.document.getElementById('app');

      await import(`../src/main.js?t=${Date.now() + 2}`);

      // Invariant: The active entrypoint must directly attach and wire the active component
      const canvases = appContainer.querySelectorAll('canvas');
      assert.strictEqual(
        canvases.length,
        1,
        'Exactly one active chart canvas component must be wired to document.getElementById("app")'
      );
      assert.ok(
        canvases[0].getContext('2d').drawCalls.length > 0,
        'The mounted component must be fully rendered in the live browser view'
      );
    });
  });
});