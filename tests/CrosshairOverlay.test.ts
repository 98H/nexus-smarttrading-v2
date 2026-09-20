import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  alignToSubPixel,
  isPointerInsideBounds,
  projectToAxes,
  type ChartBounds,
  type PriceScale,
  type TimeScale,
  type AxisProjections,
  type Point,
} from '../src/utils/chartCoordinates.ts';

import {
  CrosshairOverlayController,
  type CrosshairOverlayState,
  type MockCanvasRenderingContext2D,
} from '../src/components/chart/CrosshairOverlay.tsx';

/**
 * Creates a lightweight mock CanvasRenderingContext2D spy to deterministically
 * verify 1px sub-pixel line rasterization and badge render commands.
 */
function createMockContext(): MockCanvasRenderingContext2D & {
  drawCalls: Array<{ method: string; args: unknown[] }>;
} {
  const drawCalls: Array<{ method: string; args: unknown[] }> = [];

  return {
    drawCalls,
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    beginPath: () => {
      drawCalls.push({ method: 'beginPath', args: [] });
    },
    moveTo: (x: number, y: number) => {
      drawCalls.push({ method: 'moveTo', args: [x, y] });
    },
    lineTo: (x: number, y: number) => {
      drawCalls.push({ method: 'lineTo', args: [x, y] });
    },
    stroke: () => {
      drawCalls.push({ method: 'stroke', args: [] });
    },
    clearRect: (x: number, y: number, w: number, h: number) => {
      drawCalls.push({ method: 'clearRect', args: [x, y, w, h] });
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      drawCalls.push({ method: 'fillRect', args: [x, y, w, h] });
    },
    fillText: (text: string, x: number, y: number) => {
      drawCalls.push({ method: 'fillText', args: [text, x, y] });
    },
    measureText: (text: string) => ({
      width: text.length * 8, // Fixed deterministic width simulation
    }),
    save: () => {
      drawCalls.push({ method: 'save', args: [] });
    },
    restore: () => {
      drawCalls.push({ method: 'restore', args: [] });
    },
    setLineDash: (segments: number[]) => {
      drawCalls.push({ method: 'setLineDash', args: [segments] });
    },
  };
}

describe('Story 2.2.2: Sub-Pixel Interactive Crosshair & Axis Tooltips', () => {
  const defaultBounds: ChartBounds = {
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  };

  const mockPriceScale: PriceScale = {
    priceFromY: (y: number) => 100 - (y / 600) * 50,
    formatPrice: (price: number) => `$${price.toFixed(2)}`,
  };

  const mockTimeScale: TimeScale = {
    timeFromX: (x: number) => 1700000000000 + Math.floor((x / 800) * 86400000),
    formatTime: (timestamp: number) => new Date(timestamp).toISOString().substring(11, 19),
  };

  describe('chartCoordinates: Sub-Pixel Alignment Math', () => {
    it('should calculate crisp 1px line offset for standard display (DPR = 1.0)', () => {
      const dpr = 1.0;
      const rawX = 120;
      const alignedX = alignToSubPixel(rawX, dpr);

      // 1px line centered on a standard pixel grid requires a 0.5px offset
      assert.equal(alignedX, 120.5);
    });

    it('should calculate crisp 1px line offset for Retina / high-DPI display (DPR = 2.0)', () => {
      const dpr = 2.0;
      const rawX = 120;
      const alignedX = alignToSubPixel(rawX, dpr);

      // On DPR 2, a 1-device-pixel stroke requires snapping to (Math.floor(x * 2) + 0.5) / 2
      // 120 -> (240 + 0.5) / 2 = 120.25
      assert.equal(alignedX, 120.25);
    });

    it('should calculate crisp 1px line offset for high-density display (DPR = 3.0)', () => {
      const dpr = 3.0;
      const rawX = 45.4;
      const alignedX = alignToSubPixel(rawX, dpr);

      // Floor(45.4 * 3) = 136 -> (136 + 0.5) / 3 = 136.5 / 3 = 45.5
      assert.equal(alignedX, 45.5);
    });

    it('should snap arbitrary floating pointer coordinates deterministically to crisp raster lines', () => {
      const dpr = 1.0;
      const rawCoord1 = 300.123;
      const rawCoord2 = 300.899;

      assert.equal(alignToSubPixel(rawCoord1, dpr), 300.5);
      assert.equal(alignToSubPixel(rawCoord2, dpr), 300.5);
    });
  });

  describe('chartCoordinates: Boundary Ingestion Checks', () => {
    it('should validate pointer is inside strictly bounded chart canvas', () => {
      const insidePoint: Point = { x: 400, y: 300 };
      assert.equal(isPointerInsideBounds(insidePoint, defaultBounds), true);
    });

    it('should return true for points on the exact inclusive boundary edges', () => {
      assert.equal(isPointerInsideBounds({ x: 0, y: 0 }, defaultBounds), true);
      assert.equal(isPointerInsideBounds({ x: 800, y: 600 }, defaultBounds), true);
      assert.equal(isPointerInsideBounds({ x: 0, y: 600 }, defaultBounds), true);
      assert.equal(isPointerInsideBounds({ x: 800, y: 0 }, defaultBounds), true);
    });

    it('should return false for negative pointer coordinates (outside boundary)', () => {
      assert.equal(isPointerInsideBounds({ x: -0.1, y: 300 }, defaultBounds), false);
      assert.equal(isPointerInsideBounds({ x: 300, y: -1 }, defaultBounds), false);
    });

    it('should return false when pointer coordinate exceeds width or height boundaries', () => {
      assert.equal(isPointerInsideBounds({ x: 800.1, y: 300 }, defaultBounds), false);
      assert.equal(isPointerInsideBounds({ x: 300, y: 600.01 }, defaultBounds), false);
    });
  });

  describe('chartCoordinates: Axis Projections & Floating Badges', () => {
    it('should project pointer position to aligned crosshairs and locked price/time badges', () => {
      const pointer: Point = { x: 400, y: 300 };
      const dpr = 1.0;

      const projections: AxisProjections = projectToAxes(
        pointer,
        defaultBounds,
        mockPriceScale,
        mockTimeScale,
        dpr
      );

      assert.equal(projections.isVisible, true);

      // Sub-pixel aligned crosshair coordinates
      assert.equal(projections.crosshair.x, 400.5);
      assert.equal(projections.crosshair.y, 300.5);

      // Price badge locked to vertical position of crosshair, pinned to right axis
      assert.equal(projections.priceBadge.visible, true);
      assert.equal(projections.priceBadge.y, 300.5);
      assert.equal(projections.priceBadge.x, defaultBounds.width);
      assert.equal(projections.priceBadge.value, 75);
      assert.equal(projections.priceBadge.formattedText, '$75.00');

      // Timestamp badge locked to horizontal position of crosshair, pinned to bottom axis
      assert.equal(projections.timeBadge.visible, true);
      assert.equal(projections.timeBadge.x, 400.5);
      assert.equal(projections.timeBadge.y, defaultBounds.height);
      assert.equal(projections.timeBadge.value, 1700043200000);
      assert.equal(typeof projections.timeBadge.formattedText, 'string');
      assert.match(projections.timeBadge.formattedText, /^\d{2}:\d{2}:\d{2}$/);
    });

    it('should clamp floating badges so they do not clip outside canvas borders', () => {
      // Pointer near the top-left extreme edge
      const edgePointer: Point = { x: 5, y: 5 };
      const dpr = 1.0;

      const projections = projectToAxes(
        edgePointer,
        defaultBounds,
        mockPriceScale,
        mockTimeScale,
        dpr
      );

      assert.equal(projections.isVisible, true);
      // Badges must have clamped min/max drawing anchors to remain fully readable
      assert.ok(projections.timeBadge.x >= 0, 'Time badge X must not be negative');
      assert.ok(projections.priceBadge.y >= 0, 'Price badge Y must not be negative');
    });

    it('should return invisible projections when pointer is outside boundaries', () => {
      const outPointer: Point = { x: -10, y: 150 };
      const dpr = 1.0;

      const projections = projectToAxes(
        outPointer,
        defaultBounds,
        mockPriceScale,
        mockTimeScale,
        dpr
      );

      assert.equal(projections.isVisible, false);
      assert.equal(projections.priceBadge.visible, false);
      assert.equal(projections.timeBadge.visible, false);
    });
  });

  describe('CrosshairOverlay: Motion, Rendering & Immediate Hide Lifecycle', () => {
    let mockCtx: ReturnType<typeof createMockContext>;
    let controller: CrosshairOverlayController;

    beforeEach(() => {
      mockCtx = createMockContext();
      controller = new CrosshairOverlayController({
        bounds: defaultBounds,
        priceScale: mockPriceScale,
        timeScale: mockTimeScale,
        devicePixelRatio: 1.0,
      });
    });

    it('AC-1: Pointer motion renders crisp 1px lines and locked axis badges', () => {
      // 1. Dispatch pointer move over valid canvas area
      controller.handleMouseMove(200, 150);

      const state: CrosshairOverlayState = controller.getState();
      assert.equal(state.visible, true);
      assert.equal(state.x, 200.5);
      assert.equal(state.y, 150.5);
      assert.equal(state.priceText, '$87.50');

      // 2. Render to canvas context
      controller.render(mockCtx as unknown as CanvasRenderingContext2D);

      // Verify canvas was cleared first
      const clearCall = mockCtx.drawCalls.find((c) => c.method === 'clearRect');
      assert.ok(clearCall, 'Canvas must be cleared before redraw');
      assert.deepEqual(clearCall.args, [0, 0, 800, 600]);

      // Verify crisp 1px stroke configuration
      assert.equal(mockCtx.lineWidth, 1.0);

      // Verify crosshair vertical line drawn through sub-pixel aligned X
      const verticalMove = mockCtx.drawCalls.some(
        (c) => c.method === 'moveTo' && c.args[0] === 200.5 && c.args[1] === 0
      );
      const verticalLine = mockCtx.drawCalls.some(
        (c) => c.method === 'lineTo' && c.args[0] === 200.5 && c.args[1] === 600
      );
      assert.ok(verticalMove && verticalLine, 'Vertical crosshair line must span 0 -> height at aligned X');

      // Verify crosshair horizontal line drawn through sub-pixel aligned Y
      const horizontalMove = mockCtx.drawCalls.some(
        (c) => c.method === 'moveTo' && c.args[0] === 0 && c.args[1] === 150.5
      );
      const horizontalLine = mockCtx.drawCalls.some(
        (c) => c.method === 'lineTo' && c.args[0] === 800 && c.args[1] === 150.5
      );
      assert.ok(horizontalMove && horizontalLine, 'Horizontal crosshair line must span 0 -> width at aligned Y');

      // Verify price badge text rendered on price axis
      const priceTextCall = mockCtx.drawCalls.find(
        (c) => c.method === 'fillText' && c.args[0] === '$87.50'
      );
      assert.ok(priceTextCall, 'Price badge text must be rendered');
      assert.equal(priceTextCall.args[2], 150.5, 'Price badge text Y must lock to crosshair Y');
    });

    it('AC-1 (High-DPI): Pointer motion applies DPR sub-pixel scaling to line widths and paths', () => {
      const retinaController = new CrosshairOverlayController({
        bounds: defaultBounds,
        priceScale: mockPriceScale,
        timeScale: mockTimeScale,
        devicePixelRatio: 2.0,
      });

      retinaController.handleMouseMove(100, 200);
      retinaController.render(mockCtx as unknown as CanvasRenderingContext2D);

      const state = retinaController.getState();
      // On DPR=2: (100 * 2 + 0.5) / 2 = 200.5 / 2 = 100.25
      assert.equal(state.x, 100.25);
      assert.equal(state.y, 200.25);

      // On high-DPI canvas, 1 physical pixel width in CSS coordinates is 1 / DPR = 0.5
      assert.equal(mockCtx.lineWidth, 0.5);

      const verticalMove = mockCtx.drawCalls.some(
        (c) => c.method === 'moveTo' && c.args[0] === 100.25
      );
      assert.ok(verticalMove, 'Retina vertical line must be aligned to 100.25');
    });

    it('AC-2: mouseleave immediately hides crosshair lines and axis badges', () => {
      // Establish active crosshair
      controller.handleMouseMove(300, 300);
      assert.equal(controller.getState().visible, true);

      // Trigger mouseleave
      controller.handleMouseLeave();

      const hiddenState = controller.getState();
      assert.equal(hiddenState.visible, false);
      assert.equal(hiddenState.x, null);
      assert.equal(hiddenState.y, null);
      assert.equal(hiddenState.priceText, null);
      assert.equal(hiddenState.timeText, null);

      // Clear recorded calls and invoke render cycle
      mockCtx.drawCalls.length = 0;
      controller.render(mockCtx as unknown as CanvasRenderingContext2D);

      // Canvas must be wiped clean immediately
      const clearCall = mockCtx.drawCalls.find((c) => c.method === 'clearRect');
      assert.ok(clearCall, 'Canvas clearRect must be called on hidden render');

      // No crosshair lines or text should be stroked/filled
      const strokeCalls = mockCtx.drawCalls.filter((c) => c.method === 'stroke');
      const textCalls = mockCtx.drawCalls.filter((c) => c.method === 'fillText');
      assert.equal(strokeCalls.length, 0, 'No strokes must occur when hidden');
      assert.equal(textCalls.length, 0, 'No badges must be drawn when hidden');
    });

    it('AC-2: Moving pointer beyond canvas bounding rect immediately transitions to hidden', () => {
      controller.handleMouseMove(400, 300);
      assert.equal(controller.getState().visible, true);

      // Pointer slips out beyond boundary (e.g., negative or exceeds width)
      controller.handleMouseMove(801, 300);

      const outOfBoundsState = controller.getState();
      assert.equal(
        outOfBoundsState.visible,
        false,
        'Crosshair must immediately hide when pointer coordinates exceed bounds'
      );
      assert.equal(outOfBoundsState.x, null);
      assert.equal(outOfBoundsState.y, null);
    });

    it('should maintain deterministic state across successive move-leave-move sequences', () => {
      // 1. Move inside
      controller.handleMouseMove(150, 250);
      assert.equal(controller.getState().visible, true);

      // 2. Leave
      controller.handleMouseLeave();
      assert.equal(controller.getState().visible, false);

      // 3. Move back inside at different coordinate
      controller.handleMouseMove(350, 450);
      const reEnteredState = controller.getState();
      assert.equal(reEnteredState.visible, true);
      assert.equal(reEnteredState.x, 350.5);
      assert.equal(reEnteredState.y, 450.5);
      assert.equal(reEnteredState.priceText, '$62.50');
    });

    it('should update devicePixelRatio dynamically if user zooms or changes display', () => {
      controller.handleMouseMove(200, 200);
      assert.equal(controller.getState().x, 200.5); // DPR = 1.0

      controller.updateDevicePixelRatio(2.0);
      controller.handleMouseMove(200, 200);
      assert.equal(controller.getState().x, 200.25); // DPR = 2.0
    });
  });
});