import React from 'react';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';

export interface TradingPair {
  id: string;
  baseSymbol: string;
  quoteSymbol: string;
  currentPrice: number;
  priceDecimals: number;
  quantityDecimals: number;
  feeRate: number;
}

export interface AccountBalance {
  baseAvailable: number;
  quoteAvailable: number;
}

export interface OrderFormInput {
  side: OrderSide;
  orderType: OrderType;
  price: number | null;
  quantity: number;
  takeProfit: number | null;
  stopLoss: number | null;
}

export interface OrderCalculations {
  subtotal: number;
  estimatedFee: number;
  totalCost: number;
  remainingQuote: number;
  remainingBase: number;
  hasSufficientBalance: boolean;
  validationError: string | null;
  projectedTpPnL: number | null;
  projectedSlPnL: number | null;
}

export interface OrderExecutionState {
  isOpen: boolean;
  orderType: OrderType;
  side: OrderSide;
  price: number | null;
  quantity: number;
  takeProfit: number | null;
  stopLoss: number | null;
  calculations: OrderCalculations;
  toggleTicket: () => void;
  setOpen: (open: boolean) => void;
  setOrderType: (orderType: OrderType) => void;
  setSide: (side: OrderSide) => void;
  setPrice: (price: number | null) => void;
  setQuantity: (quantity: number) => void;
  setTakeProfit: (tp: number | null) => void;
  setStopLoss: (sl: number | null) => void;
  resetForm: () => void;
}

export interface UseOrderExecutionOptions {
  pair: TradingPair;
  balance: AccountBalance;
  initialOpen?: boolean;
}

export function calculateOrderBalances(
  input: OrderFormInput,
  pair: TradingPair,
  balance: AccountBalance
): OrderCalculations {
  const isBuy = input.side === 'BUY';
  const execPrice =
    input.orderType === 'MARKET' || input.price === null || input.price === undefined
      ? pair.currentPrice
      : input.price;

  const subtotal = execPrice * input.quantity;
  const estimatedFee = subtotal * pair.feeRate;
  const totalCost = isBuy ? subtotal + estimatedFee : subtotal - estimatedFee;

  const remainingQuote = isBuy
    ? balance.quoteAvailable - totalCost
    : balance.quoteAvailable + (subtotal - estimatedFee);

  const remainingBase = isBuy
    ? balance.baseAvailable
    : balance.baseAvailable - input.quantity;

  let hasSufficientBalance = true;
  let validationError: string | null = null;

  if (isBuy) {
    if (remainingQuote < 0) {
      hasSufficientBalance = false;
      validationError = `Insufficient quote balance (need ${totalCost.toFixed(2)}, available ${balance.quoteAvailable.toFixed(2)})`;
    }
  } else {
    if (remainingBase < 0) {
      hasSufficientBalance = false;
      validationError = `Insufficient base balance (need ${input.quantity}, available ${balance.baseAvailable})`;
    }
  }

  let projectedTpPnL: number | null = null;
  let projectedSlPnL: number | null = null;

  if (input.takeProfit !== null && input.takeProfit !== undefined) {
    projectedTpPnL = isBuy
      ? (input.takeProfit - execPrice) * input.quantity
      : (execPrice - input.takeProfit) * input.quantity;
  }

  if (input.stopLoss !== null && input.stopLoss !== undefined) {
    projectedSlPnL = isBuy
      ? (input.stopLoss - execPrice) * input.quantity
      : (execPrice - input.stopLoss) * input.quantity;
  }

  return {
    subtotal,
    estimatedFee,
    totalCost,
    remainingQuote,
    remainingBase,
    hasSufficientBalance,
    validationError,
    projectedTpPnL,
    projectedSlPnL,
  };
}

class OrderExecutionStore implements OrderExecutionState {
  isOpen: boolean;
  orderType: OrderType;
  side: OrderSide;
  price: number | null;
  quantity: number;
  takeProfit: number | null;
  stopLoss: number | null;
  pair: TradingPair;
  balance: AccountBalance;

  private listeners = new Set<() => void>();
  private onUpdate?: () => void;

  constructor(options: UseOrderExecutionOptions, onUpdate?: () => void) {
    this.pair = options.pair;
    this.balance = options.balance;
    this.isOpen = options.initialOpen ?? false;
    this.orderType = 'LIMIT';
    this.side = 'BUY';
    this.price = options.pair.currentPrice;
    this.quantity = 0;
    this.takeProfit = null;
    this.stopLoss = null;
    this.onUpdate = onUpdate;
  }

  get calculations(): OrderCalculations {
    return calculateOrderBalances(
      {
        side: this.side,
        orderType: this.orderType,
        price: this.orderType === 'MARKET' ? null : this.price,
        quantity: this.quantity,
        takeProfit: this.takeProfit,
        stopLoss: this.stopLoss,
      },
      this.pair,
      this.balance
    );
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setOnUpdate(cb?: () => void) {
    this.onUpdate = cb;
  }

  private notify() {
    this.onUpdate?.();
    this.listeners.forEach((listener) => listener());
  }

  toggleTicket = () => {
    this.isOpen = !this.isOpen;
    this.notify();
  };

  setOpen = (open: boolean) => {
    this.isOpen = open;
    this.notify();
  };

  setOrderType = (orderType: OrderType) => {
    this.orderType = orderType;
    this.notify();
  };

  setSide = (side: OrderSide) => {
    this.side = side;
    this.notify();
  };

  setPrice = (price: number | null) => {
    this.price = price;
    this.notify();
  };

  setQuantity = (quantity: number) => {
    this.quantity = quantity;
    this.notify();
  };

  setTakeProfit = (tp: number | null) => {
    this.takeProfit = tp;
    this.notify();
  };

  setStopLoss = (sl: number | null) => {
    this.stopLoss = sl;
    this.notify();
  };

  resetForm = () => {
    this.orderType = 'LIMIT';
    this.side = 'BUY';
    this.price = this.pair.currentPrice;
    this.quantity = 0;
    this.takeProfit = null;
    this.stopLoss = null;
    this.notify();
  };

  updateOptions(options: UseOrderExecutionOptions) {
    this.pair = options.pair;
    this.balance = options.balance;
  }
}

function isReactDispatcherPresent(): boolean {
  try {
    const internals =
      (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED ??
      (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const dispatcher = internals?.ReactCurrentDispatcher?.current ?? internals?.H;
    return Boolean(dispatcher && typeof dispatcher.useState === 'function');
  } catch {
    return false;
  }
}

export function useOrderExecution(options: UseOrderExecutionOptions): OrderExecutionState {
  if (isReactDispatcherPresent()) {
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
    const storeRef = React.useRef<OrderExecutionStore | null>(null);

    if (!storeRef.current) {
      storeRef.current = new OrderExecutionStore(options, () => forceUpdate());
    } else {
      storeRef.current.updateOptions(options);
      storeRef.current.setOnUpdate(() => forceUpdate());
    }

    React.useEffect(() => {
      const store = storeRef.current;
      if (!store) return;
      return store.subscribe(() => {
        forceUpdate();
      });
    }, []);

    return storeRef.current;
  }

  return new OrderExecutionStore(options);
}