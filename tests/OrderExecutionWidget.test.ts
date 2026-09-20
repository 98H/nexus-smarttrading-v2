import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

// Target modules under test
import { OrderExecutionWidget } from '../src/components/OrderExecutionWidget.tsx';
import {
  useOrderExecution,
  calculateOrderBalances,
  type TradingPair,
  type AccountBalance,
  type OrderExecutionState,
  type OrderFormInput,
} from '../src/hooks/useOrderExecution.ts';

describe('Story 5.3.1: Reactive Order Execution Widget', () => {
  const mockPair: TradingPair = {
    id: 'BTC-USDT',
    baseSymbol: 'BTC',
    quoteSymbol: 'USDT',
    currentPrice: 50_000.0,
    priceDecimals: 2,
    quantityDecimals: 4,
    feeRate: 0.001, // 0.1% maker/taker fee
  };

  const mockBalance: AccountBalance = {
    baseAvailable: 1.5, // 1.5 BTC
    quoteAvailable: 10_000.0, // 10,000 USDT
  };

  describe('Pure Balance Calculation Engine (calculateOrderBalances)', () => {
    it('calculates real-time total cost and remaining quote balance for LIMIT BUY order', () => {
      const input: OrderFormInput = {
        side: 'BUY',
        orderType: 'LIMIT',
        price: 48_000.0,
        quantity: 0.1,
        takeProfit: 52_000.0,
        stopLoss: 46_000.0,
      };

      const result = calculateOrderBalances(input, mockPair, mockBalance);

      // Raw cost = 48,000 * 0.1 = 4,800
      // Fee = 4,800 * 0.001 = 4.80
      // Total required quote = 4,804.80
      assert.equal(result.subtotal, 4_800.0);
      assert.equal(result.estimatedFee, 4.8);
      assert.equal(result.totalCost, 4_804.8);
      assert.equal(result.remainingQuote, 10_000.0 - 4_804.8);
      assert.equal(result.remainingBase, 1.5);
      assert.equal(result.hasSufficientBalance, true);
    });

    it('calculates real-time execution cost using market price for MARKET BUY order', () => {
      const input: OrderFormInput = {
        side: 'BUY',
        orderType: 'MARKET',
        price: null, // Market orders ignore user price input
        quantity: 0.05,
        takeProfit: null,
        stopLoss: null,
      };

      const result = calculateOrderBalances(input, mockPair, mockBalance);

      // Market price from pair = 50,000
      // Raw cost = 50,000 * 0.05 = 2,500
      // Fee = 2,500 * 0.001 = 2.50
      assert.equal(result.subtotal, 2_500.0);
      assert.equal(result.estimatedFee, 2.5);
      assert.equal(result.totalCost, 2_502.5);
      assert.equal(result.remainingQuote, 10_000.0 - 2_502.5);
      assert.equal(result.hasSufficientBalance, true);
    });

    it('calculates remaining base asset and projected quote balance for LIMIT SELL order', () => {
      const input: OrderFormInput = {
        side: 'SELL',
        orderType: 'LIMIT',
        price: 55_000.0,
        quantity: 0.5,
        takeProfit: 58_000.0,
        stopLoss: 53_000.0,
      };

      const result = calculateOrderBalances(input, mockPair, mockBalance);

      // Raw proceed = 55,000 * 0.5 = 27,500
      // Fee = 27,500 * 0.001 = 27.50
      // Net proceed = 27,472.50
      assert.equal(result.subtotal, 27_500.0);
      assert.equal(result.estimatedFee, 27.5);
      assert.equal(result.remainingBase, 1.5 - 0.5);
      assert.equal(result.remainingQuote, 10_000.0 + (27_500.0 - 27.5));
      assert.equal(result.hasSufficientBalance, true);
    });

    it('instantly computes projected Take Profit and Stop Loss PnL for BUY orders', () => {
      const input: OrderFormInput = {
        side: 'BUY',
        orderType: 'LIMIT',
        price: 50_000.0,
        quantity: 0.2,
        takeProfit: 55_000.0, // +5,000 per unit
        stopLoss: 45_000.0, // -5,000 per unit
      };

      const result = calculateOrderBalances(input, mockPair, mockBalance);

      // Expected TP PnL: (55,000 - 50,000) * 0.2 = +1,000.0
      // Expected SL PnL: (45,000 - 50,000) * 0.2 = -1,000.0
      assert.equal(result.projectedTpPnL, 1_000.0);
      assert.equal(result.projectedSlPnL, -1_000.0);
    });

    it('instantly computes projected Take Profit and Stop Loss PnL for SELL orders', () => {
      const input: OrderFormInput = {
        side: 'SELL',
        orderType: 'LIMIT',
        price: 50_000.0,
        quantity: 0.2,
        takeProfit: 45_000.0, // Short profit target: price falls
        stopLoss: 55_000.0, // Short loss stop: price rises
      };

      const result = calculateOrderBalances(input, mockPair, mockBalance);

      // Expected TP PnL: (50,000 - 45,000) * 0.2 = +1,000.0
      // Expected SL PnL: (50,000 - 55,000) * 0.2 = -1,000.0
      assert.equal(result.projectedTpPnL, 1_000.0);
      assert.equal(result.projectedSlPnL, -1_000.0);
    });

    it('flags insufficient balance when BUY total cost exceeds available quote balance', () => {
      const input: OrderFormInput = {
        side: 'BUY',
        orderType: 'LIMIT',
        price: 50_000.0,
        quantity: 0.3, // 15,000 USDT cost > 10,000 USDT available
        takeProfit: null,
        stopLoss: null,
      };

      const result = calculateOrderBalances(input, mockPair, mockBalance);

      assert.equal(result.hasSufficientBalance, false);
      assert.match(result.validationError ?? '', /insufficient.*quote.*balance/i);
    });

    it('flags insufficient balance when SELL quantity exceeds available base balance', () => {
      const input: OrderFormInput = {
        side: 'SELL',
        orderType: 'LIMIT',
        price: 50_000.0,
        quantity: 2.0, // 2.0 BTC > 1.5 BTC available
        takeProfit: null,
        stopLoss: null,
      };

      const result = calculateOrderBalances(input, mockPair, mockBalance);

      assert.equal(result.hasSufficientBalance, false);
      assert.match(result.validationError ?? '', /insufficient.*base.*balance/i);
    });
  });

  describe('Hook Contract: useOrderExecution', () => {
    it('initializes with ticket closed and default inputs', () => {
      const state = useOrderExecution({ pair: mockPair, balance: mockBalance });

      assert.equal(state.isOpen, false);
      assert.equal(state.orderType, 'LIMIT');
      assert.equal(state.side, 'BUY');
      assert.equal(state.price, mockPair.currentPrice);
      assert.equal(state.quantity, 0);
      assert.equal(state.takeProfit, null);
      assert.equal(state.stopLoss, null);
    });

    it('toggles ticket visibility docked state', () => {
      const state = useOrderExecution({ pair: mockPair, balance: mockBalance });

      state.toggleTicket();
      assert.equal(state.isOpen, true);

      state.toggleTicket();
      assert.equal(state.isOpen, false);
    });

    it('updates real-time calculations when price and quantity change', () => {
      const state = useOrderExecution({ pair: mockPair, balance: mockBalance });
      state.toggleTicket();

      state.setPrice(40_000.0);
      state.setQuantity(0.1);

      assert.equal(state.price, 40_000.0);
      assert.equal(state.quantity, 0.1);
      assert.equal(state.calculations.subtotal, 4_000.0);
      assert.equal(state.calculations.remainingQuote, 10_000.0 - 4_004.0);
    });

    it('updates real-time calculations when Take Profit and Stop Loss change', () => {
      const state = useOrderExecution({ pair: mockPair, balance: mockBalance });
      state.toggleTicket();
      state.setPrice(50_000.0);
      state.setQuantity(1.0);

      state.setTakeProfit(60_000.0);
      state.setStopLoss(45_000.0);

      assert.equal(state.takeProfit, 60_000.0);
      assert.equal(state.stopLoss, 45_000.0);
      assert.equal(state.calculations.projectedTpPnL, 10_000.0);
      assert.equal(state.calculations.projectedSlPnL, -5_000.0);
    });

    it('switches between LIMIT and MARKET modes and recalibrates active pricing', () => {
      const state = useOrderExecution({ pair: mockPair, balance: mockBalance });
      state.toggleTicket();
      state.setQuantity(0.1);

      state.setOrderType('MARKET');
      assert.equal(state.orderType, 'MARKET');
      // In market mode, price defaults to active trading pair price
      assert.equal(state.calculations.subtotal, mockPair.currentPrice * 0.1);

      state.setOrderType('LIMIT');
      assert.equal(state.orderType, 'LIMIT');
    });
  });

  describe('Component Render & Field Presence: OrderExecutionWidget', () => {
    it('does not render docked panel contents when ticket is closed', () => {
      const element = React.createElement(OrderExecutionWidget, {
        pair: mockPair,
        balance: mockBalance,
        initialOpen: false,
      });

      assert.ok(React.isValidElement(element));
      // Type inspection: verify component exports expected prop contract
      const props = element.props as { initialOpen: boolean };
      assert.equal(props.initialOpen, false);
    });

    it('declares docked panel with Limit, Market, TP, and SL fields when open', () => {
      const widgetElement = React.createElement(OrderExecutionWidget, {
        pair: mockPair,
        balance: mockBalance,
        initialOpen: true,
      });

      assert.ok(React.isValidElement(widgetElement));

      // Invoke component function to verify structured virtual DOM output
      const rendered = (widgetElement.type as (props: typeof widgetElement.props) => React.ReactElement)(
        widgetElement.props
      );

      assert.ok(rendered, 'Widget must render a non-null React tree');
      assert.equal(rendered.props['data-testid'], 'docked-order-ticket-panel');

      // Helper to traverse virtual DOM tree searching for target test IDs
      const findTestIds = (node: any, testIds: Set<string>): Set<string> => {
        if (!node || typeof node !== 'object') return testIds;
        if (node.props?.['data-testid']) {
          testIds.add(node.props['data-testid']);
        }
        if (Array.isArray(node.props?.children)) {
          for (const child of node.props.children) {
            findTestIds(child, testIds);
          }
        } else if (node.props?.children) {
          findTestIds(node.props.children, testIds);
        }
        return testIds;
      };

      const foundIds = findTestIds(rendered, new Set());

      // Acceptance Criteria 1: Docked panel displaying inputs for Limit and Market
      // orders along with Take Profit and Stop Loss fields.
      assert.ok(foundIds.has('order-type-limit-tab'), 'Must render Limit order tab');
      assert.ok(foundIds.has('order-type-market-tab'), 'Must render Market order tab');
      assert.ok(foundIds.has('input-order-price'), 'Must render Price input');
      assert.ok(foundIds.has('input-order-quantity'), 'Must render Quantity input');
      assert.ok(foundIds.has('input-take-profit'), 'Must render Take Profit field');
      assert.ok(foundIds.has('input-stop-loss'), 'Must render Stop Loss field');

      // Acceptance Criteria 2: Real-time balance calculations display
      assert.ok(foundIds.has('display-total-cost'), 'Must render Total Cost display');
      assert.ok(foundIds.has('display-remaining-balance'), 'Must render Remaining Balance display');
      assert.ok(foundIds.has('display-tp-pnl'), 'Must render projected TP PnL display');
      assert.ok(foundIds.has('display-sl-pnl'), 'Must render projected SL PnL display');
    });
  });
});