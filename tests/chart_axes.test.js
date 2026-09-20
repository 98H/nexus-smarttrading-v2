import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Chart, renderChart, renderGrid, renderPriceScale, renderTimeScale } from '../src/chart.js';
import { initApp } from '../src/main.js';

// Helper mock to create a simulated 2D rendering context
function createMockContext(width = 800, height = 600) {
  const calls = {
    beginPath: 0,
    stroke: 0,
    fill: 0,
    clearRect: [],
    lines: [],
    texts: [],
    strokes: []
  };

  let currentPath = [];

  const ctx = {
    canvas: { width, height },
    calls,
    strokeStyle: '#000000',
    fillStyle: '#000000',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',

    clearRect(x, y, w, h) {
      calls.clearRect.push({ x, y, w, h });
    },
    beginPath() {
      calls.beginPath++;
      currentPath = [];
    },
    moveTo(x, y) {
      currentPath.push({ type: 'moveTo', x, y });
    },
    lineTo(x, y) {
      currentPath.push({ type: 'lineTo', x, y });
    },
    stroke() {
      calls.stroke++;
      for (let i = 0; i < currentPath.length - 1; i++) {
        const from = currentPath[i];
        const to = currentPath[i + 1];
        if (from && to) {
          calls.lines.push({
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            strokeStyle: ctx.strokeStyle,
            lineWidth: ctx.lineWidth
          });
        }
      }
    },
    fillText(text, x, y, maxWidth) {
      calls.texts.push({
        text: String(text),
        x,
        y,
        maxWidth,
        fillStyle: ctx.fillStyle,
        textAlign: ctx.textAlign
      });
    },
    strokeText(text, x, y, maxWidth) {
      calls.texts.push({ text: String(text), x, y, maxWidth, stroke: true });
    },
    measureText(text) {
      return { width: String(text).length * 6 };
    },
    fillRect() {},
    save() {},
    restore() {},
    setLineDash() {}
  };

  return ctx;
}

// Sample candlestick fixture
const sampleCandles = [
  { time: 1700000000, open: 100, high: 110, low: 95, close: 105 },
  { time: 1700086400, open: 105, high: 115, low: 100, close: 112 },
  { time: 1700172800, open: 112, high: 120, low: 108, close: 118 },
  { time: 1700259200, open: 118, high: 125, low: 114, close: 122 }
];

describe('STORY 1.2.1: Resolve MISSING_COORDINATE_AXES (Defect DF-SCALES-01)', () => {
  let mockCtx;
  const canvasWidth = 800;
  const canvasHeight = 600;
  const priceScaleWidth = 60;
  const timeScaleHeight = 30;

  beforeEach(() => {
    mockCtx = createMockContext(canvasWidth, canvasHeight);
  });

  describe('src/chart.js - Gridlines & Axes Rendering Units', () => {
    test('renderGrid draws horizontal and vertical background gridlines across the chart body', () => {
      const chartArea = {
        left: 0,
        top: 0,
        width: canvasWidth - priceScaleWidth,
        height: canvasHeight - timeScaleHeight
      };

      renderGrid(mockCtx, {
        chartArea,
        horizontalTicks: [100, 105, 110, 115, 120],
        verticalTicks: [1700000000, 1700086400, 1700172800, 1700259200]
      });

      // Must draw horizontal lines across the entire chartArea width
      const horizontalLines = mockCtx.calls.lines.filter(
        line => line.y1 === line.y2 && Math.abs(line.x2 - line.x1) >= chartArea.width * 0.9
      );
      // Must draw vertical lines down the entire chartArea height
      const verticalLines = mockCtx.calls.lines.filter(
        line => line.x1 === line.x2 && Math.abs(line.y2 - line.y1) >= chartArea.height * 0.9
      );

      assert.ok(
        horizontalLines.length >= 3,
        `Expected at least 3 horizontal gridlines, received ${horizontalLines.length}`
      );
      assert.ok(
        verticalLines.length >= 3,
        `Expected at least 3 vertical gridlines, received ${verticalLines.length}`
      );
    });

    test('renderPriceScale renders a right-hand price scale axis with tick marks and numeric labels', () => {
      const priceMin = 95;
      const priceMax = 125;
      const rightBoundary = canvasWidth - priceScaleWidth;

      renderPriceScale(mockCtx, {
        x: rightBoundary,
        y: 0,
        width: priceScaleWidth,
        height: canvasHeight - timeScaleHeight,
        min: priceMin,
        max: priceMax
      });

      // Price labels must be drawn within the right-hand margin
      const priceLabels = mockCtx.calls.texts.filter(t => t.x >= rightBoundary);

      assert.ok(
        priceLabels.length >= 3,
        `Expected at least 3 price labels on the right scale, found ${priceLabels.length}`
      );

      // Verify that labels represent valid prices within range
      for (const label of priceLabels) {
        const num = parseFloat(label.text.replace(/[^0-9.-]/g, ''));
        assert.ok(!isNaN(num), `Price tick "${label.text}" is not a valid number`);
        assert.ok(
          num >= priceMin && num <= priceMax,
          `Price tick ${num} is out of expected bounds [${priceMin}, ${priceMax}]`
        );
      }
    });

    test('renderTimeScale renders a bottom time scale axis with timestamp/date labels', () => {
      const bottomBoundary = canvasHeight - timeScaleHeight;

      renderTimeScale(mockCtx, {
        x: 0,
        y: bottomBoundary,
        width: canvasWidth - priceScaleWidth,
        height: timeScaleHeight,
        timestamps: sampleCandles.map(c => c.time)
      });

      // Time labels must be drawn in the bottom scale area
      const timeLabels = mockCtx.calls.texts.filter(t => t.y >= bottomBoundary);

      assert.ok(
        timeLabels.length >= 3,
        `Expected at least 3 time labels along the bottom scale, found ${timeLabels.length}`
      );

      // Verify that labels contain timestamp or formatted date info (non-empty string)
      for (const label of timeLabels) {
        assert.ok(label.text.trim().length > 0, 'Time tick label should not be empty');
      }
    });

    test('renderChart renders candlesticks along with gridlines, price scale, and time scale', () => {
      renderChart(mockCtx, {
        data: sampleCandles,
        width: canvasWidth,
        height: canvasHeight,
        priceScaleWidth,
        timeScaleHeight
      });

      const rightBoundary = canvasWidth - priceScaleWidth;
      const bottomBoundary = canvasHeight - timeScaleHeight;

      const horizontalGrid = mockCtx.calls.lines.filter(
        line => line.y1 === line.y2 && line.x1 < rightBoundary && line.x2 <= rightBoundary
      );
      const verticalGrid = mockCtx.calls.lines.filter(
        line => line.x1 === line.x2 && line.y1 < bottomBoundary && line.y2 <= bottomBoundary
      );
      const priceLabels = mockCtx.calls.texts.filter(t => t.x >= rightBoundary);
      const timeLabels = mockCtx.calls.texts.filter(t => t.y >= bottomBoundary);

      assert.ok(horizontalGrid.length > 0, 'Chart must include horizontal gridlines in render output');
      assert.ok(verticalGrid.length > 0, 'Chart must include vertical gridlines in render output');
      assert.ok(priceLabels.length > 0, 'Chart must include price scale labels on the right-hand axis');
      assert.ok(timeLabels.length > 0, 'Chart must include time scale labels on the bottom axis');
    });

    test('Chart class updates coordinate scales and gridlines when dataset updates', () => {
      const chart = new Chart(mockCtx, {
        width: canvasWidth,
        height: canvasHeight,
        priceScaleWidth,
        timeScaleHeight
      });

      chart.setData(sampleCandles);

      const initialPriceLabels = mockCtx.calls.texts.filter(t => t.x >= canvasWidth - priceScaleWidth);
      assert.ok(initialPriceLabels.length > 0, 'Initial render must include price scale labels');

      // Update data with significantly higher prices
      const updatedCandles = [
        { time: 1700345600, open: 500, high: 550, low: 490, close: 530 },
        { time: 1700432000, open: 530, high: 580, low: 520, close: 575 }
      ];

      mockCtx.calls.texts = [];
      mockCtx.calls.lines = [];
      chart.setData(updatedCandles);

      const updatedPriceLabels = mockCtx.calls.texts.filter(t => t.x >= canvasWidth - priceScaleWidth);
      assert.ok(updatedPriceLabels.length > 0, 'Updated render must include price scale labels');

      // Check that updated scale reflects new price range (near 500-580)
      const numericLabels = updatedPriceLabels.map(l => parseFloat(l.text.replace(/[^0-9.-]/g, '')));
      const hasUpdatedPrices = numericLabels.some(n => n >= 490 && n <= 580);
      assert.ok(hasUpdatedPrices, 'Price scale labels must re-adjust to updated price data bounds');
    });
  });

  describe('src/main.js - Active Entrypoint & Pipeline Wiring Invariant', () => {
    let mockAppElement;
    let createdCanvas;

    beforeEach(() => {
      // Mock DOM environment for active entrypoint mounting
      createdCanvas = {
        tagName: 'CANVAS',
        width: canvasWidth,
        height: canvasHeight,
        getContext: (type) => {
          if (type === '2d') return mockCtx;
          return null;
        },
        setAttribute: () => {},
        style: {}
      };

      mockAppElement = {
        id: 'app',
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
        querySelector(selector) {
          if (selector === 'canvas') return createdCanvas;
          return null;
        }
      };

      globalThis.document = {
        getElementById(id) {
          if (id === 'app') return mockAppElement;
          return null;
        },
        createElement(tagName) {
          if (tagName.toLowerCase() === 'canvas') return createdCanvas;
          return {};
        }
      };
    });

    afterEach(() => {
      delete globalThis.document;
    });

    test('initApp wires coordinate axes and grid rendering into canvas mounted to #app', () => {
      // Initialize live application
      initApp();

      // Invariant: Canvas must be mounted to document.getElementById('app')
      assert.strictEqual(
        mockAppElement.children.length > 0,
        true,
        'Active entrypoint must mount chart canvas to document.getElementById("app")'
      );
      assert.strictEqual(
        mockAppElement.children[0],
        createdCanvas,
        'Mounted element must be the chart canvas'
      );

      // Verify that coordinates, scales, and gridlines were drawn during initialization
      const rightBoundary = canvasWidth - priceScaleWidth;
      const bottomBoundary = canvasHeight - timeScaleHeight;

      const horizontalGridlines = mockCtx.calls.lines.filter(line => line.y1 === line.y2);
      const verticalGridlines = mockCtx.calls.lines.filter(line => line.x1 === line.x2);
      const rightPriceLabels = mockCtx.calls.texts.filter(t => t.x >= rightBoundary);
      const bottomTimeLabels = mockCtx.calls.texts.filter(t => t.y >= bottomBoundary);

      assert.ok(
        horizontalGridlines.length > 0,
        'Main entrypoint canvas pipeline must draw horizontal gridlines'
      );
      assert.ok(
        verticalGridlines.length > 0,
        'Main entrypoint canvas pipeline must draw vertical gridlines'
      );
      assert.ok(
        rightPriceLabels.length > 0,
        'Main entrypoint canvas pipeline must render right-hand price scale axis'
      );
      assert.ok(
        bottomTimeLabels.length > 0,
        'Main entrypoint canvas pipeline must render bottom time scale axis'
      );
    });
  });
});