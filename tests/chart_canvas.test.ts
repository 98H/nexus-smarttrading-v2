import test from 'node:test';
import assert from 'node:assert/strict';

// Target modules under test
import { ChartCanvas, WheelEvent, Viewport } from '../src/ui/chart_canvas';
import { ZoomController } from '../src/ui/zoom_controller';

/*
Unit tests for STORY 1.2.1: Resolve UNRESPONSIVE_CANVAS_ZOOM (Defect ID: DF-GESTURE-02).

Acceptance Criteria:
1. Intercept wheel event (deltaY), update viewport zoom scale, and re-render candlesticks.
2. Clamp zoom scale to predefined min/max bounds without halting canvas rendering or dropping listeners.
*/

// ============================================================================
// Types & Fixtures
// ============================================================================

interface Candlestick {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MockCanvasRenderingContext2D {
  canvas: {
    width: number;
    height: number;
  };
}

/** Sample candlestick OHLCV dataset for testing rendering updates. */
const getDefaultCandlesticks = (): Candlestick[] => [
  { timestamp: 1672531140000, open: 100.0, high: 105.0, low: 99.0, close: 104.0, volume: 1000 },
  { timestamp: 1672531200000, open: 104.0, high: 108.0, low: 103.0, close: 107.0, volume: 1500 },
  { timestamp: 1672531260000, open: 107.0, high: 107.5, low: 102.0, close: 103.0, volume: 1200 },
  { timestamp: 1672531320000, open: 103.0, high: 106.0, low: 101.0, close: 105.5, volume: 1100 },
];

/** ZoomController instance with predefined min/max boundaries and sensitivity. */
const createZoomController = (): ZoomController =>
  new ZoomController({
    initialScale: 1.0,
    minScale: 0.2,
    maxScale: 5.0,
    sensitivity: 0.001,
  });

/** Mock 2D canvas rendering context. */
const createMockRenderContext = (): MockCanvasRenderingContext2D => ({
  canvas: {
    width: 800,
    height: 600,
  },
});

/** ChartCanvas initialized with zoom controller, render context, and sample data. */
const createChartCanvas = (
  zoomController: ZoomController = createZoomController(),
  mockContext: MockCanvasRenderingContext2D = createMockRenderContext(),
  candlesticks: Candlestick[] = getDefaultCandlesticks()
): ChartCanvas =>
  new ChartCanvas({
    context: mockContext,
    zoomController,
    initialCandlesticks: candlesticks,
    width: 800,
    height: 600,
  });

// ============================================================================
// Assertion Helpers (pytest.approx equivalents)
// ============================================================================

function assertApprox(actual: number, expected: number, tolerance = 1e-5, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `Expected ${actual} to be approximately ${expected} (within ±${tolerance}), diff: ${Math.abs(actual - expected)}`
  );
}

function assertApproxRel(actual: number, expected: number, relTolerance = 1e-3, message?: string): void {
  const tolerance = Math.abs(expected) * relTolerance;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `Expected ${actual} to be approximately ${expected} (rel ±${relTolerance}), diff: ${Math.abs(actual - expected)}`
  );
}

// ============================================================================
// ZoomController Unit Tests
// ============================================================================

test.describe('ZoomController', () => {
  test('verify initial zoom scale matches constructor arguments', () => {
    const zoomController = createZoomController();
    assertApprox(zoomController.currentScale, 1.0);
    assertApprox(zoomController.minScale, 0.2);
    assertApprox(zoomController.maxScale, 5.0);
  });

  test('negative deltaY (scroll up) must increase the zoom scale', () => {
    const zoomController = createZoomController();
    const initial = zoomController.currentScale;
    const newScale = zoomController.applyDelta(-100.0);

    assert.ok(newScale > initial);
    assert.equal(zoomController.currentScale, newScale);
  });

  test('positive deltaY (scroll down) must decrease the zoom scale', () => {
    const zoomController = createZoomController();
    const initial = zoomController.currentScale;
    const newScale = zoomController.applyDelta(100.0);

    assert.ok(newScale < initial);
    assert.equal(zoomController.currentScale, newScale);
  });

  test('deltaY = 0 must result in identical zoom scale', () => {
    const zoomController = createZoomController();
    const initial = zoomController.currentScale;
    const newScale = zoomController.applyDelta(0.0);

    assertApprox(newScale, initial);
    assertApprox(zoomController.currentScale, initial);
  });

  test('extreme zoom-in scrolling must be clamped to max_scale', () => {
    const zoomController = createZoomController();
    const newScale = zoomController.applyDelta(-100000.0);

    assertApprox(newScale, zoomController.maxScale);
    assertApprox(zoomController.currentScale, zoomController.maxScale);
  });

  test('extreme zoom-out scrolling must be clamped to min_scale', () => {
    const zoomController = createZoomController();
    const newScale = zoomController.applyDelta(100000.0);

    assertApprox(newScale, zoomController.minScale);
    assertApprox(zoomController.currentScale, zoomController.minScale);
  });

  test('zooming out immediately after hitting max limit must decrease scale without sticking', () => {
    const zoomController = createZoomController();
    zoomController.applyDelta(-50000.0);
    assertApprox(zoomController.currentScale, zoomController.maxScale);

    const reversedScale = zoomController.applyDelta(50.0);
    assert.ok(reversedScale < zoomController.maxScale);
  });

  test('zooming in immediately after hitting min limit must increase scale without sticking', () => {
    const zoomController = createZoomController();
    zoomController.applyDelta(50000.0);
    assertApprox(zoomController.currentScale, zoomController.minScale);

    const reversedScale = zoomController.applyDelta(-50.0);
    assert.ok(reversedScale > zoomController.minScale);
  });

  test('non-numeric deltaY values must raise appropriate exception', () => {
    const zoomController = createZoomController();

    assert.throws(
      () => {
        // @ts-expect-error Testing invalid runtime type
        zoomController.applyDelta('invalid');
      },
      (err: unknown) => err instanceof TypeError
    );

    assert.throws(
      () => {
        zoomController.applyDelta(Number.NaN);
      },
      (err: unknown) => err instanceof RangeError || err instanceof TypeError || err instanceof Error
    );
  });
});

// ============================================================================
// ChartCanvas Unit Tests (DF-GESTURE-02 Resolution)
// ============================================================================

test.describe('ChartCanvas Zoom (DF-GESTURE-02 Resolution)', () => {
  test('canvas must intercept wheel event and invoke preventDefault to stop page scrolling', (t) => {
    const chartCanvas = createChartCanvas();
    const wheelEvent = new WheelEvent({
      deltaX: 0.0,
      deltaY: -120.0,
      clientX: 400.0,
      clientY: 300.0,
    });
    const preventDefaultSpy = t.mock.fn();
    wheelEvent.preventDefault = preventDefaultSpy;

    chartCanvas.handleWheel(wheelEvent);

    assert.equal(preventDefaultSpy.mock.callCount(), 1);
    assert.equal(wheelEvent.isHandled, true);
  });

  test('wheel scroll must update the viewport zoom scale away from initial 1.0', () => {
    const chartCanvas = createChartCanvas();
    const initialScale = chartCanvas.viewport.zoomScale;
    assertApprox(initialScale, 1.0);

    const wheelEvent = new WheelEvent({
      deltaX: 0.0,
      deltaY: -150.0,
      clientX: 400.0,
      clientY: 300.0,
    });
    chartCanvas.handleWheel(wheelEvent);

    assert.ok(chartCanvas.viewport.zoomScale > initialScale);
    assertApprox(chartCanvas.viewport.zoomScale, chartCanvas.zoomController.currentScale);
  });

  test('wheel scroll must trigger a re-render of candlesticks with the new scale', (t) => {
    const chartCanvas = createChartCanvas();
    const mockRender = t.mock.method(chartCanvas, 'renderCandlesticks', () => {});

    const wheelEvent = new WheelEvent({
      deltaX: 0.0,
      deltaY: -100.0,
      clientX: 400.0,
      clientY: 300.0,
    });
    chartCanvas.handleWheel(wheelEvent);

    assert.equal(mockRender.mock.callCount(), 1);
  });

  test('verify DF-GESTURE-02 fix: wheel scroll MUST produce non-zero pixel coordinate changes', () => {
    const chartCanvas = createChartCanvas();
    const initialCoords = chartCanvas.computeCandlestickRenderCoords();
    assert.ok(initialCoords.length > 0);

    // Zoom in
    const wheelEvent = new WheelEvent({
      deltaX: 0.0,
      deltaY: -200.0,
      clientX: 400.0,
      clientY: 300.0,
    });
    chartCanvas.handleWheel(wheelEvent);

    const zoomedCoords = chartCanvas.computeCandlestickRenderCoords();
    assert.equal(zoomedCoords.length, initialCoords.length);

    // Pixel widths and X-positions of candlesticks must have changed
    const pixelDifferences = zoomedCoords.map((z, idx) => {
      const i = initialCoords[idx];
      return Math.abs(z.x - i.x) + Math.abs(z.width - i.width);
    });

    assert.ok(
      pixelDifferences.some((diff) => diff > 0.001),
      'Zero pixel changes detected after zoom wheel event (DF-GESTURE-02 regression).'
    );
  });

  test('scrolling beyond maximum zoom boundary clamps scale and continues rendering', (t) => {
    const chartCanvas = createChartCanvas();
    const mockRender = t.mock.method(chartCanvas, 'renderCandlesticks', () => {});

    for (let i = 0; i < 10; i++) {
      const wheelEvent = new WheelEvent({
        deltaX: 0.0,
        deltaY: -1000.0,
        clientX: 400.0,
        clientY: 300.0,
      });
      chartCanvas.handleWheel(wheelEvent);
    }

    // Viewport scale must be clamped exactly at max
    assertApprox(chartCanvas.viewport.zoomScale, chartCanvas.zoomController.maxScale);
    // Rendering must have been called for each event without crashing
    assert.equal(mockRender.mock.callCount(), 10);
  });

  test('scrolling beyond minimum zoom boundary clamps scale and continues rendering', (t) => {
    const chartCanvas = createChartCanvas();
    const mockRender = t.mock.method(chartCanvas, 'renderCandlesticks', () => {});

    for (let i = 0; i < 10; i++) {
      const wheelEvent = new WheelEvent({
        deltaX: 0.0,
        deltaY: 1000.0,
        clientX: 400.0,
        clientY: 300.0,
      });
      chartCanvas.handleWheel(wheelEvent);
    }

    // Viewport scale must be clamped exactly at min
    assertApprox(chartCanvas.viewport.zoomScale, chartCanvas.zoomController.minScale);
    // Rendering must have been called for each event without crashing
    assert.equal(mockRender.mock.callCount(), 10);
  });

  test('exceeding zoom limits must not drop or unregister event listeners', (t) => {
    const chartCanvas = createChartCanvas();
    const initialListenerCount = chartCanvas.getEventListeners('wheel').length;
    assert.ok(initialListenerCount > 0);

    // Push past boundaries
    for (const delta of [-5000.0, 5000.0]) {
      chartCanvas.handleWheel(
        new WheelEvent({ deltaX: 0.0, deltaY: delta, clientX: 400.0, clientY: 300.0 })
      );
    }

    const remainingListenerCount = chartCanvas.getEventListeners('wheel').length;
    assert.equal(remainingListenerCount, initialListenerCount);

    // Canvas must still respond to subsequent events
    const mockRender = t.mock.method(chartCanvas, 'renderCandlesticks', () => {});
    chartCanvas.handleWheel(
      new WheelEvent({ deltaX: 0.0, deltaY: 10.0, clientX: 400.0, clientY: 300.0 })
    );
    assert.equal(mockRender.mock.callCount(), 1);
  });

  test('zooming centered at mouse cursor (focal point) must adjust viewport offset so price remains anchored', () => {
    const chartCanvas = createChartCanvas();
    const cursorX = 400.0;
    const cursorY = 300.0;
    const initialFocalPrice = chartCanvas.viewport.pixelToPrice(cursorY);

    const wheelEvent = new WheelEvent({
      deltaX: 0.0,
      deltaY: -100.0,
      clientX: cursorX,
      clientY: cursorY,
    });
    chartCanvas.handleWheel(wheelEvent);

    const postZoomFocalPrice = chartCanvas.viewport.pixelToPrice(cursorY);
    assertApproxRel(postZoomFocalPrice, initialFocalPrice, 1e-3);
  });
});