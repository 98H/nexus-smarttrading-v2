import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Target Modules under test as specified in STORY 1.3.1 / DF-CONTROL-01
import {
  ChartToolbar,
  type ChartToolbarProps,
  type Timeframe,
  SUPPORTED_TIMEFRAMES,
} from '../src/components/ChartToolbar.tsx';

import {
  CandleChart,
  type CandleChartProps,
  type Candle,
  aggregateCandles,
  CandleChartRenderer,
} from '../src/components/CandleChart.tsx';

/**
 * Deterministic Mock Canvas 2D Rendering Context
 * Used to verify canvas clearing, drawing commands, and candle count re-renders
 * without requiring a headless browser or heavy external DOM dependencies.
 */
class MockCanvasRenderingContext2D {
  canvas: MockHTMLCanvasElement;
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  lineWidth: number = 1;

  clearRectCalls: Array<{ x: number; y: number; w: number; h: number }> = [];
  fillRectCalls: Array<{ x: number; y: number; w: number; h: number; fillStyle: any }> = [];
  strokeRectCalls: Array<{ x: number; y: number; w: number; h: number }> = [];
  beginPathCalls: number = 0;
  moveToCalls: Array<{ x: number; y: number }> = [];
  lineToCalls: Array<{ x: number; y: number }> = [];
  strokeCalls: number = 0;
  saveCalls: number = 0;
  restoreCalls: number = 0;

  clearRect(x: number, y: number, w: number, h: number): void {
    this.clearRectCalls.push({ x, y, w, h });
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.fillRectCalls.push({ x, y, w, h, fillStyle: this.fillStyle });
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.strokeRectCalls.push({ x, y, w, h });
  }

  beginPath(): void {
    this.beginPathCalls++;
  }

  moveTo(x: number, y: number): void {
    this.moveToCalls.push({ x, y });
  }

  lineTo(x: number, y: number): void {
    this.lineToCalls.push({ x, y });
  }

  stroke(): void {
    this.strokeCalls++;
  }

  save(): void {
    this.saveCalls++;
  }

  restore(): void {
    this.restoreCalls++;
  }

  resetSpies(): void {
    this.clearRectCalls = [];
    this.fillRectCalls = [];
    this.strokeRectCalls = [];
    this.beginPathCalls = 0;
    this.moveToCalls = [];
    this.lineToCalls = [];
    this.strokeCalls = 0;
    this.saveCalls = 0;
    this.restoreCalls = 0;
  }
}

class MockHTMLCanvasElement {
  width: number = 800;
  height: number = 400;
  ctx: MockCanvasRenderingContext2D;

  constructor(width = 800, height = 400) {
    this.width = width;
    this.height = height;
    this.ctx = new MockCanvasRenderingContext2D();
    this.ctx.canvas = this;
  }

  getContext(type: string): MockCanvasRenderingContext2D | null {
    if (type === '2d') {
      return this.ctx;
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
      height: this.height,
    };
  }
}

/**
 * Generates deterministic 1-minute candle fixtures for testing aggregation.
 * Starts at UTC 1700000000000 ms (spaced exactly 60,000 ms apart).
 */
function createOneMinuteCandleFixtures(count = 60, basePrice = 100): Candle[] {
  const baseTimestamp = 1700000000000;
  const candles: Candle[] = [];
  let currentPrice = basePrice;

  for (let i = 0; i < count; i++) {
    const open = currentPrice;
    const high = open + 2.5;
    const low = open - 1.5;
    const close = i % 2 === 0 ? open + 1.0 : open - 0.8;
    const volume = 100 + i * 10;
    currentPrice = close;

    candles.push({
      timestamp: baseTimestamp + i * 60 * 1000,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return candles;
}

/**
 * Helper to traverse React VDOM elements tree to find timeframe buttons
 */
function findVdomButton(tree: any, targetTextOrTf: string): any {
  if (!tree) return null;

  if (
    tree.props?.['data-timeframe'] === targetTextOrTf ||
    tree.props?.value === targetTextOrTf ||
    tree.props?.children === targetTextOrTf
  ) {
    return tree;
  }

  const children = tree.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const match = findVdomButton(child, targetTextOrTf);
      if (match) return match;
    }
  } else if (typeof children === 'object') {
    return findVdomButton(children, targetTextOrTf);
  }

  return null;
}

describe('STORY 1.3.1: Resolve INACTIVE_TOOLBAR_CONTROLS (Defect ID: DF-CONTROL-01)', () => {
  let mockCanvas: MockHTMLCanvasElement;
  let mockCtx: MockCanvasRenderingContext2D;

  beforeEach(() => {
    mockCanvas = new MockHTMLCanvasElement(800, 400);
    mockCtx = mockCanvas.ctx;
  });

  describe('Component: ChartToolbar (Defect Verification: Button Click and State Dispatch)', () => {
    it('DF-CONTROL-01.TB-1: Should render all supported timeframes with default active selection', () => {
      const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '1d'];
      const activeTimeframe: Timeframe = '1m';
      let triggeredTf: Timeframe | null = null;

      const vdom = ChartToolbar({
        timeframes,
        activeTimeframe,
        onTimeframeChange: (tf) => {
          triggeredTf = tf;
        },
      });

      assert.ok(vdom, 'ChartToolbar must return a valid component tree');

      for (const tf of timeframes) {
        const btn = findVdomButton(vdom, tf);
        assert.ok(btn, `Toolbar must contain a button control for timeframe: ${tf}`);

        if (tf === activeTimeframe) {
          const isActive =
            btn.props['aria-pressed'] === true ||
            btn.props['data-active'] === true ||
            (typeof btn.props.className === 'string' && btn.props.className.includes('active'));
          assert.strictEqual(
            isActive,
            true,
            `Default timeframe [${tf}] must be styled/flagged as active`
          );
        }
      }
      assert.strictEqual(triggeredTf, null, 'Initial render must not invoke onTimeframeChange');
    });

    it('DF-CONTROL-01.TB-2: Clicking an alternative timeframe button triggers onTimeframeChange (not ignored/inactive)', () => {
      let selectedTimeframe: Timeframe | null = null;
      let callCount = 0;

      const toolbarProps: ChartToolbarProps = {
        timeframes: ['1m', '5m', '15m', '1h'],
        activeTimeframe: '1m',
        onTimeframeChange: (newTf: Timeframe) => {
          callCount++;
          selectedTimeframe = newTf;
        },
      };

      const vdom = ChartToolbar(toolbarProps);
      const button5m = findVdomButton(vdom, '5m');

      assert.ok(button5m, 'Toolbar must expose 5m timeframe button');
      assert.strictEqual(
        button5m.props.disabled ?? false,
        false,
        'Timeframe button must not be disabled when toolbar is interactive'
      );
      assert.strictEqual(
        typeof button5m.props.onClick,
        'function',
        'Timeframe button must have an active onClick handler attached'
      );

      // Simulate user click event on 5m button
      button5m.props.onClick({
        preventDefault: () => {},
        stopPropagation: () => {},
      });

      assert.strictEqual(
        callCount,
        1,
        'DF-CONTROL-01 regression: Clicking 5m button was ignored or failed to dispatch event'
      );
      assert.strictEqual(
        selectedTimeframe,
        '5m',
        'Toolbar must dispatch the clicked timeframe (5m) to parent listener'
      );
    });

    it('DF-CONTROL-01.TB-3: Repeated click on already active timeframe is idempotent and avoids redundant re-triggering', () => {
      let callCount = 0;
      const toolbarProps: ChartToolbarProps = {
        timeframes: ['1m', '5m', '1h'],
        activeTimeframe: '1m',
        onTimeframeChange: () => {
          callCount++;
        },
      };

      const vdom = ChartToolbar(toolbarProps);
      const button1m = findVdomButton(vdom, '1m');

      assert.ok(button1m, 'Active 1m button exists');
      button1m.props.onClick?.({
        preventDefault: () => {},
        stopPropagation: () => {},
      });

      assert.strictEqual(
        callCount,
        0,
        'Clicking currently active timeframe should not trigger redundant state change'
      );
    });
  });

  describe('Core Aggregation Engine: aggregateCandles (Timeframe Bucketing Logic)', () => {
    it('DF-CONTROL-01.AG-1: Aggregates 60 1m candles into 12 5m candles with mathematically correct OHLCV', () => {
      const raw1mCandles = createOneMinuteCandleFixtures(60, 100);
      const aggregated = aggregateCandles(raw1mCandles, '5m');

      assert.strictEqual(
        aggregated.length,
        12,
        '60 1m candles aggregated to 5m must yield exactly 12 candles'
      );

      for (let i = 0; i < 12; i++) {
        const bucket = raw1mCandles.slice(i * 5, (i + 1) * 5);
        const aggCandle = aggregated[i];

        const expectedOpen = bucket[0].open;
        const expectedHigh = Math.max(...bucket.map((c) => c.high));
        const expectedLow = Math.min(...bucket.map((c) => c.low));
        const expectedClose = bucket[bucket.length - 1].close;
        const expectedVolume = bucket.reduce((sum, c) => sum + (c.volume ?? 0), 0);
        const expectedTimestamp = bucket[0].timestamp;

        assert.strictEqual(aggCandle.timestamp, expectedTimestamp, `Bucket ${i} timestamp mismatch`);
        assert.strictEqual(aggCandle.open, expectedOpen, `Bucket ${i} open price mismatch`);
        assert.strictEqual(aggCandle.high, expectedHigh, `Bucket ${i} high price mismatch`);
        assert.strictEqual(aggCandle.low, expectedLow, `Bucket ${i} low price mismatch`);
        assert.strictEqual(aggCandle.close, expectedClose, `Bucket ${i} close price mismatch`);
        assert.strictEqual(aggCandle.volume, expectedVolume, `Bucket ${i} aggregated volume mismatch`);
      }
    });

    it('DF-CONTROL-01.AG-2: Aggregates 60 1m candles into 1 1h candle spanning the entire interval', () => {
      const raw1mCandles = createOneMinuteCandleFixtures(60, 250);
      const aggregated = aggregateCandles(raw1mCandles, '1h');

      assert.strictEqual(
        aggregated.length,
        1,
        '60 1m candles aggregated to 1h must yield exactly 1 candle'
      );

      const hourCandle = aggregated[0];
      const expectedHigh = Math.max(...raw1mCandles.map((c) => c.high));
      const expectedLow = Math.min(...raw1mCandles.map((c) => c.low));
      const expectedVolume = raw1mCandles.reduce((sum, c) => sum + (c.volume ?? 0), 0);

      assert.strictEqual(hourCandle.timestamp, raw1mCandles[0].timestamp);
      assert.strictEqual(hourCandle.open, raw1mCandles[0].open);
      assert.strictEqual(hourCandle.close, raw1mCandles[59].close);
      assert.strictEqual(hourCandle.high, expectedHigh);
      assert.strictEqual(hourCandle.low, expectedLow);
      assert.strictEqual(hourCandle.volume, expectedVolume);
    });
  });

  describe('Canvas Re-render Engine: CandleChart (Defect Verification: Canvas Updates on Timeframe Change)', () => {
    it('DF-CONTROL-01.CR-1: Renders initial default 1m candles onto the canvas context', () => {
      const raw1mCandles = createOneMinuteCandleFixtures(60, 100);
      const renderer = new CandleChartRenderer(mockCanvas as any);

      renderer.render(raw1mCandles, '1m');

      assert.ok(
        mockCtx.clearRectCalls.length >= 1,
        'Canvas must be cleared before rendering candlesticks'
      );
      assert.strictEqual(
        mockCtx.fillRectCalls.length,
        60,
        'Must draw 60 candle bodies for 60 1-minute candles'
      );
      assert.ok(
        mockCtx.strokeCalls >= 60,
        'Must draw at least 60 candle wick strokes for 60 1-minute candles'
      );
    });

    it('DF-CONTROL-01.CR-2: Defect DF-CONTROL-01 Core - Switching timeframe to 5m triggers canvas clear and re-renders aggregated candlesticks', () => {
      const raw1mCandles = createOneMinuteCandleFixtures(60, 100);
      const renderer = new CandleChartRenderer(mockCanvas as any);

      // 1. Initial render with default 1m candles
      renderer.render(raw1mCandles, '1m');
      assert.strictEqual(mockCtx.fillRectCalls.length, 60);

      // Reset spy call tallies prior to timeframe transition
      mockCtx.resetSpies();

      // 2. Simulate timeframe switch to '5m'
      renderer.setTimeframe('5m', raw1mCandles);

      // Acceptance Criteria Verifications:
      // (a) Canvas must be cleared on timeframe switch
      assert.ok(
        mockCtx.clearRectCalls.length >= 1,
        'Canvas context must call clearRect when timeframe updates to prevent stale visual frames'
      );

      // (b) Canvas must draw aggregated 5m candle data (12 bars instead of stale 60 bars)
      assert.strictEqual(
        mockCtx.fillRectCalls.length,
        12,
        'DF-CONTROL-01 Regression: Canvas failed to re-render with aggregated 5m candles (expected 12 bodies)'
      );
      assert.ok(
        mockCtx.strokeCalls >= 12,
        'Canvas must draw aggregated candle wicks corresponding to 5m timeframe'
      );
    });

    it('DF-CONTROL-01.CR-3: Switching timeframe to 1h clears canvas and renders exactly 1 aggregated candle', () => {
      const raw1mCandles = createOneMinuteCandleFixtures(60, 100);
      const renderer = new CandleChartRenderer(mockCanvas as any);

      renderer.render(raw1mCandles, '1m');
      mockCtx.resetSpies();

      renderer.setTimeframe('1h', raw1mCandles);

      assert.ok(mockCtx.clearRectCalls.length >= 1, 'Canvas must clear before rendering 1h candle');
      assert.strictEqual(
        mockCtx.fillRectCalls.length,
        1,
        'DF-CONTROL-01 Regression: Canvas did not re-render with 1h aggregated candle'
      );
    });

    it('DF-CONTROL-01.CR-4: Handles remote candle fetch and triggers canvas re-render upon fetch resolution', async () => {
      const initialCandles = createOneMinuteCandleFixtures(10, 50);
      const remoteHourlyCandles: Candle[] = [
        { timestamp: 1700000000000, open: 50, high: 58, low: 48, close: 55, volume: 5000 },
        { timestamp: 1700003600000, open: 55, high: 62, low: 53, close: 60, volume: 6200 },
      ];

      let fetchCalledWith: Timeframe | null = null;
      const fetchCandlesMock = async (tf: Timeframe): Promise<Candle[]> => {
        fetchCalledWith = tf;
        return remoteHourlyCandles;
      };

      const renderer = new CandleChartRenderer(mockCanvas as any, {
        fetchCandles: fetchCandlesMock,
      });

      renderer.render(initialCandles, '1m');
      mockCtx.resetSpies();

      // Trigger timeframe change that depends on asynchronous fetch
      await renderer.changeTimeframeWithFetch('1h');

      assert.strictEqual(fetchCalledWith, '1h', 'Must invoke candle fetch for selected timeframe');
      assert.ok(mockCtx.clearRectCalls.length >= 1, 'Canvas must clear upon async fetch completion');
      assert.strictEqual(
        mockCtx.fillRectCalls.length,
        2,
        'Canvas must re-render exactly the fetched candles (2 hourly candles)'
      );
    });
  });

  describe('Integration: Toolbar Interaction to Canvas Re-render Flow (DF-CONTROL-01)', () => {
    it('DF-CONTROL-01.INT-1: Complete user flow - Toolbar click updates active state, aggregates data, and re-renders canvas', () => {
      const raw1mCandles = createOneMinuteCandleFixtures(60, 100);

      // Simulate a stateful chart view container coordinating toolbar and canvas
      class ChartContainerController {
        activeTimeframe: Timeframe = '1m';
        rawCandles: Candle[] = raw1mCandles;
        renderer: CandleChartRenderer;

        constructor(canvas: MockHTMLCanvasElement) {
          this.renderer = new CandleChartRenderer(canvas as any);
          this.renderer.render(this.rawCandles, this.activeTimeframe);
        }

        handleTimeframeChange = (newTf: Timeframe) => {
          this.activeTimeframe = newTf;
          this.renderer.setTimeframe(newTf, this.rawCandles);
        };

        renderToolbar() {
          return ChartToolbar({
            timeframes: ['1m', '5m', '15m', '1h'],
            activeTimeframe: this.activeTimeframe,
            onTimeframeChange: this.handleTimeframeChange,
          });
        }
      }

      const controller = new ChartContainerController(mockCanvas);

      // Given: Chart displays default 1m candles
      assert.strictEqual(controller.activeTimeframe, '1m');
      assert.strictEqual(mockCtx.fillRectCalls.length, 60, 'Initial canvas contains 60 1m candles');

      // When: User clicks 5m button on toolbar
      let toolbarVdom = controller.renderToolbar();
      const btn5m = findVdomButton(toolbarVdom, '5m');
      assert.ok(btn5m, '5m button must be present in toolbar');

      mockCtx.resetSpies();
      btn5m.props.onClick({ preventDefault: () => {}, stopPropagation: () => {} });

      // Then:
      // 1. Active timeframe updates
      assert.strictEqual(
        controller.activeTimeframe,
        '5m',
        'Controller active timeframe state must update to 5m'
      );

      // 2. Toolbar re-renders with 5m marked as active
      toolbarVdom = controller.renderToolbar();
      const updatedBtn5m = findVdomButton(toolbarVdom, '5m');
      const is5mActive =
        updatedBtn5m.props['aria-pressed'] === true ||
        updatedBtn5m.props['data-active'] === true ||
        (typeof updatedBtn5m.props.className === 'string' &&
          updatedBtn5m.props.className.includes('active'));
      assert.strictEqual(is5mActive, true, '5m button must now be visually/semantically active');

      // 3. Canvas re-renders with aggregated 5m candle data (12 bars)
      assert.ok(mockCtx.clearRectCalls.length >= 1, 'Canvas must be cleared on timeframe change');
      assert.strictEqual(
        mockCtx.fillRectCalls.length,
        12,
        'DF-CONTROL-01 Fixed: Canvas must re-render with 12 aggregated 5m candles'
      );

      // And When: User clicks 1h button on toolbar
      const btn1h = findVdomButton(toolbarVdom, '1h');
      assert.ok(btn1h, '1h button must be present in toolbar');

      mockCtx.resetSpies();
      btn1h.props.onClick({ preventDefault: () => {}, stopPropagation: () => {} });

      // Then:
      assert.strictEqual(controller.activeTimeframe, '1h');
      assert.ok(mockCtx.clearRectCalls.length >= 1, 'Canvas cleared for 1h re-render');
      assert.strictEqual(
        mockCtx.fillRectCalls.length,
        1,
        'Canvas re-rendered with 1 aggregated 1h candle'
      );
    });
  });
});