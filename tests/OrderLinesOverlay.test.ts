import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeOrderLines,
  type Order,
  type OrderLineOverlayModel,
  type CoordinateConverter,
} from '../src/components/chart/OrderLinesOverlay.js';

import {
  createDraggableOrderLineSession,
  type DraggableOrderLineSession,
  type DragEventPayload,
  type DragUpdateResult,
} from '../src/hooks/useDraggableOrderLine.js';

describe('Story 5.3.2: Interactive Draggable Order Lines on Canvas', () => {
  // Test coordinate mapping helper: Linear price to Y mapping
  // Visible chart range: Price $40,000 (bottom, y=500) to $60,000 (top, y=0)
  const chartHeight = 500;
  const minPrice = 40000;
  const maxPrice = 60000;
  const priceRange = maxPrice - minPrice;

  const priceToCoordinate: CoordinateConverter['priceToCoordinate'] = (price: number): number => {
    return chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  };

  const coordinateToPrice: CoordinateConverter['coordinateToPrice'] = (y: number): number => {
    return minPrice + ((chartHeight - y) / chartHeight) * priceRange;
  };

  const converter: CoordinateConverter = {
    priceToCoordinate,
    coordinateToPrice,
  };

  describe('AC1: Rendering horizontal interactive lines at respective price coordinates', () => {
    it('should project Stop Loss and Take Profit levels to exact vertical canvas coordinates for an active order', () => {
      const activeOrder: Order = {
        id: 'ord-buy-btc-001',
        symbol: 'BTC/USD',
        side: 'BUY',
        entryPrice: 50000,
        stopLoss: 45000,
        takeProfit: 55000,
        status: 'OPEN',
      };

      const lines: OrderLineOverlayModel[] = computeOrderLines([activeOrder], converter, 800);

      assert.equal(lines.length, 2, 'Expected exactly two lines for order with SL and TP');

      // Stop Loss calculation: 45,000 -> 500 - ((45000 - 40000)/20000) * 500 = 500 - 125 = 375
      const slLine = lines.find((l) => l.lineType === 'STOP_LOSS');
      assert.ok(slLine, 'Stop Loss line must be present');
      assert.equal(slLine.orderId, 'ord-buy-btc-001');
      assert.equal(slLine.price, 45000);
      assert.equal(slLine.coordinateY, 375);
      assert.equal(slLine.isInteractive, true);
      assert.equal(slLine.color, '#EF4444', 'Stop Loss should have distinct warning/red color');

      // Take Profit calculation: 55,000 -> 500 - ((55000 - 40000)/20000) * 500 = 500 - 375 = 125
      const tpLine = lines.find((l) => l.lineType === 'TAKE_PROFIT');
      assert.ok(tpLine, 'Take Profit line must be present');
      assert.equal(tpLine.orderId, 'ord-buy-btc-001');
      assert.equal(tpLine.price, 55000);
      assert.equal(tpLine.coordinateY, 125);
      assert.equal(tpLine.isInteractive, true);
      assert.equal(tpLine.color, '#10B981', 'Take Profit should have distinct success/green color');
    });

    it('should render only Stop Loss line when Take Profit is not defined', () => {
      const orderWithOnlySL: Order = {
        id: 'ord-buy-btc-002',
        symbol: 'BTC/USD',
        side: 'BUY',
        entryPrice: 50000,
        stopLoss: 48000,
        status: 'OPEN',
      };

      const lines = computeOrderLines([orderWithOnlySL], converter, 800);

      assert.equal(lines.length, 1);
      assert.equal(lines[0].lineType, 'STOP_LOSS');
      assert.equal(lines[0].price, 48000);
      assert.equal(lines[0].coordinateY, 300); // 500 - ((48000 - 40000)/20000)*500 = 300
    });

    it('should ignore orders without Stop Loss and Take Profit levels', () => {
      const orderWithoutLevels: Order = {
        id: 'ord-buy-btc-003',
        symbol: 'BTC/USD',
        side: 'BUY',
        entryPrice: 50000,
        status: 'OPEN',
      };

      const lines = computeOrderLines([orderWithoutLevels], converter, 800);
      assert.equal(lines.length, 0, 'No overlay lines should be produced when SL/TP are omitted');
    });

    it('should ignore orders that are closed or cancelled', () => {
      const closedOrder: Order = {
        id: 'ord-buy-btc-004',
        symbol: 'BTC/USD',
        side: 'BUY',
        entryPrice: 50000,
        stopLoss: 45000,
        takeProfit: 55000,
        status: 'FILLED',
      };

      const lines = computeOrderLines([closedOrder], converter, 800);
      assert.equal(lines.length, 0, 'Inactive or closed orders must not render draggable canvas lines');
    });

    it('should assign a high hit-test tolerance thickness for interactive grab handles', () => {
      const activeOrder: Order = {
        id: 'ord-buy-btc-005',
        symbol: 'BTC/USD',
        side: 'BUY',
        entryPrice: 50000,
        stopLoss: 44000,
        status: 'OPEN',
      };

      const [line] = computeOrderLines([activeOrder], converter, 800);
      assert.ok(
        line.hitZoneHeight >= 8,
        `Interactive hit-zone (${line.hitZoneHeight}px) should be at least 8px for reliable cursor grab`
      );
    });
  });

  describe('AC2: Dragging line vertically and releasing mouse updates order price level', () => {
    it('should track dragging lifecycle: start drag, calculate preview price on move, and commit new price on release', () => {
      const onCommitPriceMock = mock.fn<(result: DragUpdateResult) => void>();

      const session: DraggableOrderLineSession = createDraggableOrderLineSession({
        orderId: 'ord-buy-btc-001',
        lineType: 'STOP_LOSS',
        initialPrice: 45000,
        tickSize: 10,
        converter,
        onCommitPrice: onCommitPriceMock,
      });

      // 1. Initial State
      assert.equal(session.isDragging(), false);
      assert.equal(session.getCurrentPrice(), 45000);

      // 2. User clicks on the Stop Loss line at initial Y = 375
      const downEvent: DragEventPayload = { clientY: 375, button: 0 };
      const startResult = session.handleMouseDown(downEvent);
      assert.equal(startResult, true, 'Mouse down on line hit-box should start drag session');
      assert.equal(session.isDragging(), true);

      // 3. User moves line vertically upwards to clientY = 325 (50px higher)
      // New Price: 40000 + ((500 - 325) / 500) * 20000 = 40000 + 0.35 * 20000 = 47,000
      const moveEvent: DragEventPayload = { clientY: 325, button: 0 };
      session.handleMouseMove(moveEvent);

      assert.equal(session.getCurrentPrice(), 47000);
      assert.equal(session.getCurrentCoordinateY(), 325);
      assert.equal(
        onCommitPriceMock.mock.calls.length,
        0,
        'Price change must not be committed while still dragging'
      );

      // 4. User releases the mouse button at clientY = 325
      const upEvent: DragEventPayload = { clientY: 325, button: 0 };
      session.handleMouseUp(upEvent);

      assert.equal(session.isDragging(), false);
      assert.equal(onCommitPriceMock.mock.calls.length, 1, 'Commit callback must fire exactly once on mouse up');

      const committedCall = onCommitPriceMock.mock.calls[0].arguments[0];
      assert.deepEqual(committedCall, {
        orderId: 'ord-buy-btc-001',
        lineType: 'STOP_LOSS',
        previousPrice: 45000,
        newPrice: 47000,
      });
    });

    it('should ignore mouse moves if dragging was not initiated', () => {
      const onCommitPriceMock = mock.fn<(result: DragUpdateResult) => void>();

      const session = createDraggableOrderLineSession({
        orderId: 'ord-buy-btc-001',
        lineType: 'TAKE_PROFIT',
        initialPrice: 55000,
        tickSize: 1,
        converter,
        onCommitPrice: onCommitPriceMock,
      });

      session.handleMouseMove({ clientY: 100, button: 0 });
      session.handleMouseUp({ clientY: 100, button: 0 });

      assert.equal(session.isDragging(), false);
      assert.equal(session.getCurrentPrice(), 55000, 'Price should remain unchanged without mouse down');
      assert.equal(onCommitPriceMock.mock.calls.length, 0);
    });

    it('should ignore non-primary mouse buttons (e.g., right click context menu clicks)', () => {
      const session = createDraggableOrderLineSession({
        orderId: 'ord-buy-btc-001',
        lineType: 'STOP_LOSS',
        initialPrice: 45000,
        tickSize: 1,
        converter,
        onCommitPrice: mock.fn(),
      });

      const rightClickEvent: DragEventPayload = { clientY: 375, button: 2 };
      const started = session.handleMouseDown(rightClickEvent);

      assert.equal(started, false, 'Right-click must not activate dragging');
      assert.equal(session.isDragging(), false);
    });

    it('should clamp dragged price to instrument tickSize granularity', () => {
      const onCommitPriceMock = mock.fn<(result: DragUpdateResult) => void>();

      const session = createDraggableOrderLineSession({
        orderId: 'ord-buy-btc-001',
        lineType: 'TAKE_PROFIT',
        initialPrice: 55000,
        tickSize: 50, // All prices must be multiples of 50
        converter,
        onCommitPrice: onCommitPriceMock,
      });

      session.handleMouseDown({ clientY: 125, button: 0 });

      // Move to clientY = 124 -> unquantized price = 40000 + ((500 - 124) / 500) * 20000 = 55040
      // Quantized to nearest 50 -> 55050
      session.handleMouseMove({ clientY: 124, button: 0 });
      session.handleMouseUp({ clientY: 124, button: 0 });

      assert.equal(onCommitPriceMock.mock.calls.length, 1);
      assert.equal(onCommitPriceMock.mock.calls[0].arguments[0].newPrice, 55050);
    });

    it('should enforce chart boundaries and not allow dragging beyond minimum and maximum visible price limits', () => {
      const onCommitPriceMock = mock.fn<(result: DragUpdateResult) => void>();

      const session = createDraggableOrderLineSession({
        orderId: 'ord-buy-btc-001',
        lineType: 'TAKE_PROFIT',
        initialPrice: 55000,
        minPriceLimit: 40000,
        maxPriceLimit: 60000,
        tickSize: 10,
        converter,
        onCommitPrice: onCommitPriceMock,
      });

      session.handleMouseDown({ clientY: 125, button: 0 });

      // Drag completely beyond the top of the canvas (negative Y)
      session.handleMouseMove({ clientY: -150, button: 0 });
      session.handleMouseUp({ clientY: -150, button: 0 });

      assert.equal(
        session.getCurrentPrice(),
        60000,
        'Price must be clamped to maxPriceLimit when dragged off top edge'
      );
      assert.equal(onCommitPriceMock.mock.calls[0].arguments[0].newPrice, 60000);
    });

    it('should cancel drag and revert price if cancellation event is received', () => {
      const onCommitPriceMock = mock.fn<(result: DragUpdateResult) => void>();

      const session = createDraggableOrderLineSession({
        orderId: 'ord-buy-btc-001',
        lineType: 'STOP_LOSS',
        initialPrice: 45000,
        tickSize: 1,
        converter,
        onCommitPrice: onCommitPriceMock,
      });

      session.handleMouseDown({ clientY: 375, button: 0 });
      session.handleMouseMove({ clientY: 200, button: 0 }); // Dragged to $52,000

      assert.equal(session.getCurrentPrice(), 52000);

      // User presses ESC or pointer is cancelled
      session.cancelDrag();

      assert.equal(session.isDragging(), false);
      assert.equal(session.getCurrentPrice(), 45000, 'Price must revert to initialPrice upon cancel');
      assert.equal(onCommitPriceMock.mock.calls.length, 0, 'Commit must not be triggered on cancel');
    });
  });
});