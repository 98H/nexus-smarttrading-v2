import React from 'react';
import {
  useOrderExecution,
  type TradingPair,
  type AccountBalance,
  type OrderFormInput,
} from '../hooks/useOrderExecution.ts';

export interface OrderExecutionWidgetProps {
  pair: TradingPair;
  balance: AccountBalance;
  initialOpen?: boolean;
  onSubmitOrder?: (order: OrderFormInput) => void;
}

export function OrderExecutionWidget({
  pair,
  balance,
  initialOpen = false,
  onSubmitOrder,
}: OrderExecutionWidgetProps): React.ReactElement | null {
  const state = useOrderExecution({ pair, balance, initialOpen });

  if (!state.isOpen) {
    return null;
  }

  return (
    <div data-testid="docked-order-ticket-panel" className="docked-order-ticket-panel">
      <div className="ticket-header">
        <h3>Order Ticket - {pair.id}</h3>
        <button
          type="button"
          data-testid="btn-close-ticket"
          onClick={state.toggleTicket}
        >
          ×
        </button>
      </div>

      <div className="order-side-tabs">
        <button
          type="button"
          data-testid="order-side-buy-tab"
          className={state.side === 'BUY' ? 'active' : ''}
          onClick={() => state.setSide('BUY')}
        >
          Buy {pair.baseSymbol}
        </button>
        <button
          type="button"
          data-testid="order-side-sell-tab"
          className={state.side === 'SELL' ? 'active' : ''}
          onClick={() => state.setSide('SELL')}
        >
          Sell {pair.baseSymbol}
        </button>
      </div>

      <div className="order-type-tabs">
        <button
          type="button"
          data-testid="order-type-limit-tab"
          className={state.orderType === 'LIMIT' ? 'active' : ''}
          onClick={() => state.setOrderType('LIMIT')}
        >
          Limit
        </button>
        <button
          type="button"
          data-testid="order-type-market-tab"
          className={state.orderType === 'MARKET' ? 'active' : ''}
          onClick={() => state.setOrderType('MARKET')}
        >
          Market
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (state.calculations.hasSufficientBalance && onSubmitOrder) {
            onSubmitOrder({
              side: state.side,
              orderType: state.orderType,
              price: state.orderType === 'MARKET' ? null : state.price,
              quantity: state.quantity,
              takeProfit: state.takeProfit,
              stopLoss: state.stopLoss,
            });
          }
        }}
      >
        <div className="form-group">
          <label htmlFor="order-price">Price ({pair.quoteSymbol})</label>
          <input
            id="order-price"
            data-testid="input-order-price"
            type="number"
            step="any"
            placeholder={state.orderType === 'MARKET' ? 'Market' : '0.00'}
            disabled={state.orderType === 'MARKET'}
            value={
              state.orderType === 'MARKET'
                ? pair.currentPrice
                : (state.price ?? '')
            }
            onChange={(e) => {
              const val = e.target.value === '' ? null : parseFloat(e.target.value);
              state.setPrice(val);
            }}
          />
        </div>

        <div className="form-group">
          <label htmlFor="order-quantity">Quantity ({pair.baseSymbol})</label>
          <input
            id="order-quantity"
            data-testid="input-order-quantity"
            type="number"
            step="any"
            placeholder="0.00"
            value={state.quantity || ''}
            onChange={(e) => {
              state.setQuantity(parseFloat(e.target.value) || 0);
            }}
          />
        </div>

        <div className="form-group">
          <label htmlFor="take-profit">Take Profit ({pair.quoteSymbol})</label>
          <input
            id="take-profit"
            data-testid="input-take-profit"
            type="number"
            step="any"
            placeholder="Optional"
            value={state.takeProfit ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : parseFloat(e.target.value);
              state.setTakeProfit(val);
            }}
          />
        </div>

        <div className="form-group">
          <label htmlFor="stop-loss">Stop Loss ({pair.quoteSymbol})</label>
          <input
            id="stop-loss"
            data-testid="input-stop-loss"
            type="number"
            step="any"
            placeholder="Optional"
            value={state.stopLoss ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : parseFloat(e.target.value);
              state.setStopLoss(val);
            }}
          />
        </div>

        <div className="calculations-display">
          <div className="calc-item">
            <span>Total Cost:</span>
            <span data-testid="display-total-cost">
              {state.calculations.totalCost.toFixed(2)} {pair.quoteSymbol}
            </span>
          </div>

          <div className="calc-item">
            <span>Remaining Balance:</span>
            <span data-testid="display-remaining-balance">
              {state.side === 'BUY'
                ? `${state.calculations.remainingQuote.toFixed(2)} ${pair.quoteSymbol}`
                : `${state.calculations.remainingBase.toFixed(4)} ${pair.baseSymbol}`}
            </span>
          </div>

          <div className="calc-item">
            <span>Projected TP PnL:</span>
            <span data-testid="display-tp-pnl">
              {state.calculations.projectedTpPnL !== null
                ? `${state.calculations.projectedTpPnL >= 0 ? '+' : ''}${state.calculations.projectedTpPnL.toFixed(2)} ${pair.quoteSymbol}`
                : '--'}
            </span>
          </div>

          <div className="calc-item">
            <span>Projected SL PnL:</span>
            <span data-testid="display-sl-pnl">
              {state.calculations.projectedSlPnL !== null
                ? `${state.calculations.projectedSlPnL >= 0 ? '+' : ''}${state.calculations.projectedSlPnL.toFixed(2)} ${pair.quoteSymbol}`
                : '--'}
            </span>
          </div>

          {state.calculations.validationError && (
            <div data-testid="balance-validation-error" className="error-message">
              {state.calculations.validationError}
            </div>
          )}
        </div>

        <button
          type="submit"
          data-testid="btn-submit-order"
          disabled={!state.calculations.hasSufficientBalance}
        >
          {state.side} {pair.baseSymbol}
        </button>
      </form>
    </div>
  );
}