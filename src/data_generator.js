/**
 * SmartTrading-V2 — Candlestick Data Generator & Streaming Provider
 * Produces synthetic oscillating random-walk financial price series containing
 * balanced distributions of bullish (close > open) and bearish (close < open)
 * candles with dynamic high and low wicks (resolves DF-CANDLES-01, STORY 38.4.1),
 * authentic multi-asset price regimes coherent with market depth data (STORY 52.1.1: Resolve INCOHERENT_MARKET_DATA),
 * next-candle synthesis, tick generation, and live streaming utilities (STORY 39.1.1: Resolve STATIC_APPLICATION).
 */

export const TICKER_PRICES = {
  'BTC/USD': 64000,
  'BTC-USD': 64000,
  'BTC': 64000,
  'ETH/USD': 3450,
  'ETH-USD': 3450,
  'ETH': 3450,
  'SOL/USD': 145,
  'SOL-USD': 145,
  'SOL': 145,
};

export const DEFAULT_TICKER = 'BTC/USD';
export const DEFAULT_PRICE = 64000;

/**
 * Returns the realistic baseline market price for a given ticker symbol.
 *
 * @param {string} [ticker='BTC/USD'] Asset ticker symbol
 * @returns {number} Authentic market base price
 */
export function getTickerPrice(ticker = 'BTC/USD') {
  if (typeof ticker !== 'string') return DEFAULT_PRICE;
  const normalized = ticker.trim().toUpperCase();
  if (TICKER_PRICES[normalized] !== undefined) {
    return TICKER_PRICES[normalized];
  }
  if (normalized.includes('BTC')) return 64000;
  if (normalized.includes('ETH')) return 3450;
  if (normalized.includes('SOL')) return 145;
  return DEFAULT_PRICE;
}

/**
 * Generates market depth / order book data coherent with current ticker and price regime.
 * Satisfies STORY 52.1.1 (Resolve INCOHERENT_MARKET_DATA).
 *
 * @param {Object} [options={}]
 * @param {string} [options.ticker='BTC/USD'] Asset ticker symbol
 * @param {number} [options.initialPrice] Base market price (defaults to authentic ticker price)
 * @param {number} [options.price] Alias for initialPrice
 * @param {number} [options.basePrice] Alias for initialPrice
 * @param {number} [options.midPrice] Alias for initialPrice
 * @param {number} [options.depth=10] Number of order book levels to generate per side
 * @param {number} [options.levels] Alias for depth
 * @param {number} [options.count] Alias for depth
 * @param {number} [options.spread] Price spread between top bid and top ask
 * @returns {{ ticker: string, symbol: string, midPrice: number, price: number, spread: number, bids: Array, asks: Array }}
 */
export function generateMarketDepth(options = {}) {
  const opts = options || {};
  const ticker = opts.ticker || opts.symbol || opts.pair || DEFAULT_TICKER;
  const basePrice = typeof opts.initialPrice === 'number' && Number.isFinite(opts.initialPrice)
    ? opts.initialPrice
    : (typeof opts.price === 'number' && Number.isFinite(opts.price)
      ? opts.price
      : (typeof opts.basePrice === 'number' && Number.isFinite(opts.basePrice)
        ? opts.basePrice
        : (typeof opts.midPrice === 'number' && Number.isFinite(opts.midPrice)
          ? opts.midPrice
          : getTickerPrice(ticker))));

  const depthCount = typeof opts.depth === 'number' && opts.depth > 0
    ? Math.floor(opts.depth)
    : (typeof opts.levels === 'number' && opts.levels > 0
      ? Math.floor(opts.levels)
      : (typeof opts.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 10));

  const scale = basePrice > 10000 ? 5 : (basePrice > 1000 ? 0.5 : (basePrice > 50 ? 0.05 : 0.01));
  const spread = typeof opts.spread === 'number' && opts.spread > 0 ? opts.spread : scale;

  const halfSpread = spread / 2;
  const bestBid = Number((basePrice - halfSpread).toFixed(2));
  const bestAsk = Number((basePrice + halfSpread).toFixed(2));

  const bids = [];
  let cumBidVol = 0;
  for (let i = 0; i < depthCount; i++) {
    const price = Number((bestBid - i * scale).toFixed(2));
    const size = Number((0.5 + Math.random() * 2.5 + Math.sin(i * 0.7 + 1) * 0.4).toFixed(4));
    cumBidVol = Number((cumBidVol + size).toFixed(4));
    const bidItem = [price, size];
    bidItem.price = price;
    bidItem.size = size;
    bidItem.amount = size;
    bidItem.quantity = size;
    bidItem.volume = size;
    bidItem.total = cumBidVol;
    bids.push(bidItem);
  }

  const asks = [];
  let cumAskVol = 0;
  for (let i = 0; i < depthCount; i++) {
    const price = Number((bestAsk + i * scale).toFixed(2));
    const size = Number((0.5 + Math.random() * 2.5 + Math.cos(i * 0.7 + 1) * 0.4).toFixed(4));
    cumAskVol = Number((cumAskVol + size).toFixed(4));
    const askItem = [price, size];
    askItem.price = price;
    askItem.size = size;
    askItem.amount = size;
    askItem.quantity = size;
    askItem.volume = size;
    askItem.total = cumAskVol;
    asks.push(askItem);
  }

  return {
    ticker,
    symbol: ticker,
    midPrice: basePrice,
    price: basePrice,
    spread,
    bids,
    asks,
  };
}

/**
 * Generates an oscillating candlestick series with dynamic wicks and realistic price steps.
 * Satisfies STORY 38.4.1 (Resolve SYNTHETIC_STRAIGHT_LINE_DATA) and STORY 52.1.1 (Resolve INCOHERENT_MARKET_DATA).
 *
 * @param {Object} [options={}]
 * @param {number} [options.count=75] Total candle items to produce
 * @param {string} [options.ticker='BTC/USD'] Active instrument ticker
 * @param {number} [options.initialPrice] Starting market base price (defaults to authentic ticker price ~64,000 for BTC/USD)
 * @param {number} [options.startPrice] Alias for initialPrice
 * @param {number} [options.price] Alias for initialPrice
 * @param {number} [options.baseTime=1700000000] Initial epoch timestamp (seconds)
 * @param {number} [options.startTime] Alias for baseTime
 * @param {number} [options.interval=60] Time delta per candle step (seconds)
 * @param {number} [options.volatility=1.5] Step magnitude scalar
 * @returns {Array<{ time: number, timestamp: number, open: number, high: number, low: number, close: number, volume: number }>}
 */
export function generateCandlestickData(options = {}) {
  const opts = options || {};
  const count = typeof opts.count === 'number' && Number.isFinite(opts.count) && opts.count > 0
    ? Math.floor(opts.count)
    : 75;

  if (count <= 0) return [];

  const ticker = opts.ticker || opts.symbol || opts.pair || opts.instrument || DEFAULT_TICKER;
  const defaultBasePrice = getTickerPrice(ticker);

  const initialPrice = typeof opts.initialPrice === 'number' && Number.isFinite(opts.initialPrice)
    ? opts.initialPrice
    : (typeof opts.startPrice === 'number' && Number.isFinite(opts.startPrice)
      ? opts.startPrice
      : (typeof opts.price === 'number' && Number.isFinite(opts.price)
        ? opts.price
        : defaultBasePrice));

  const baseTime = typeof opts.baseTime === 'number' && Number.isFinite(opts.baseTime)
    ? opts.baseTime
    : (typeof opts.startTime === 'number' && Number.isFinite(opts.startTime)
      ? opts.startTime
      : (typeof opts.time === 'number' && Number.isFinite(opts.time) ? opts.time : 1700000000));

  const interval = typeof opts.interval === 'number' && Number.isFinite(opts.interval) && opts.interval > 0
    ? opts.interval
    : 60;

  const volatility = typeof opts.volatility === 'number' && Number.isFinite(opts.volatility) && opts.volatility > 0
    ? opts.volatility
    : 1.5;

  const priceScale = initialPrice > 1000 ? (initialPrice / 2000) : 1;

  const data = [];
  let currentClose = initialPrice;
  let bullishCount = 0;
  let bearishCount = 0;

  for (let i = 0; i < count; i++) {
    const remaining = count - 1 - i;

    let open;
    if (i === 0) {
      open = Number(currentClose.toFixed(2));
    } else {
      const openGap = Number((((Math.sin(i * 1.7) * 0.15) + (Math.random() - 0.5) * 0.1) * priceScale).toFixed(2));
      open = Number(Math.max(1, currentClose + openGap).toFixed(2));
    }

    // Mean-reverting Bernoulli probability keeps bullish/bearish ratio balanced between 0.3 and 0.7
    const currentBullishRatio = i > 0 ? bullishCount / i : 0.5;
    let bullishProb = 0.5 + (0.5 - currentBullishRatio) * 0.7;
    bullishProb = Math.max(0.3, Math.min(0.7, bullishProb));

    let isBullish = Math.random() < bullishProb;

    // Strict boundary guards ensuring AC1 balance constraints (ratio between 0.2 and 0.8)
    if ((bullishCount + 1 + remaining) / count <= 0.3) {
      isBullish = true;
    } else if (bullishCount / count >= 0.7) {
      isBullish = false;
    }

    // Dynamic, non-zero body height so close !== open
    const minBody = Math.max(0.15, 0.15 * priceScale);
    const bodyBase = (0.3 + Math.abs(Math.sin(i * 0.8)) * 0.8 * volatility) * priceScale;
    const bodyRand = (0.2 + Math.random() * 1.2) * volatility * priceScale;
    const bodyHeight = Number(Math.max(minBody, bodyBase + bodyRand).toFixed(2));

    let close;
    if (isBullish) {
      close = Number((open + bodyHeight).toFixed(2));
      bullishCount++;
    } else {
      close = Number(Math.max(1, open - bodyHeight).toFixed(2));
      if (close >= open) {
        close = Number((open - minBody).toFixed(2));
      }
      bearishCount++;
    }

    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);

    // Dynamic upper and lower wicks with non-zero variance across series
    const upperWickBase = (0.2 + Math.abs(Math.cos(i * 1.3)) * 0.9 * volatility) * priceScale;
    const upperWick = Number(Math.max(0.1 * priceScale, upperWickBase + Math.random() * 1.1 * volatility * priceScale).toFixed(2));

    const lowerWickBase = (0.2 + Math.abs(Math.sin(i * 1.1 + 0.5)) * 0.9 * volatility) * priceScale;
    const lowerWick = Number(Math.max(0.1 * priceScale, lowerWickBase + Math.random() * 1.1 * volatility * priceScale).toFixed(2));

    const high = Number((bodyTop + upperWick).toFixed(2));
    const low = Number(Math.max(1, bodyBottom - lowerWick).toFixed(2));

    const candleTime = baseTime + i * interval;
    const volume = Math.floor(1000 + Math.random() * 2000 + Math.abs(Math.sin(i * 0.5)) * 1500);

    data.push({
      time: candleTime,
      timestamp: candleTime * 1000,
      open,
      high,
      low,
      close,
      volume,
    });

    currentClose = close;
  }

  return data;
}

/**
 * Generates the next realistic incremental candle continuing from a preceding candle or base price.
 *
 * @param {Object|number|null} [previousCandle=null] Previous candle bar or close price
 * @param {Object} [options={}]
 * @param {number} [options.interval=60] Time increment in seconds
 * @param {number} [options.volatility=1.5] Step magnitude scalar
 * @returns {{ time: number, timestamp: number, open: number, high: number, low: number, close: number, volume: number }}
 */
export function generateNextCandle(previousCandle = null, options = {}) {
  const opts = options || {};
  const ticker = opts.ticker || opts.symbol || DEFAULT_TICKER;
  const defaultPrice = getTickerPrice(ticker);
  let prevClose = defaultPrice;
  let prevTime = 1700000000;

  if (typeof previousCandle === 'number' && Number.isFinite(previousCandle)) {
    prevClose = previousCandle;
  } else if (previousCandle && typeof previousCandle === 'object') {
    if (typeof previousCandle.close === 'number' && Number.isFinite(previousCandle.close)) {
      prevClose = previousCandle.close;
    } else if (typeof previousCandle.price === 'number' && Number.isFinite(previousCandle.price)) {
      prevClose = previousCandle.price;
    } else if (typeof previousCandle.value === 'number' && Number.isFinite(previousCandle.value)) {
      prevClose = previousCandle.value;
    }

    if (typeof previousCandle.time === 'number' && Number.isFinite(previousCandle.time)) {
      prevTime = previousCandle.time;
    } else if (typeof previousCandle.timestamp === 'number' && Number.isFinite(previousCandle.timestamp)) {
      prevTime = previousCandle.timestamp > 1e11
        ? Math.floor(previousCandle.timestamp / 1000)
        : previousCandle.timestamp;
    }
  }

  const interval = typeof opts.interval === 'number' && Number.isFinite(opts.interval) && opts.interval > 0
    ? opts.interval
    : 60;

  const volatility = typeof opts.volatility === 'number' && Number.isFinite(opts.volatility) && opts.volatility > 0
    ? opts.volatility
    : 1.5;

  const priceScale = prevClose > 1000 ? (prevClose / 2000) : 1;
  const minBody = Math.max(0.15, 0.15 * priceScale);

  const candleTime = prevTime + interval;
  const open = Number(prevClose.toFixed(2));

  const isBullish = Math.random() < 0.5;
  const bodyHeight = Number(Math.max(minBody, (0.2 + Math.random() * 1.1) * volatility * priceScale).toFixed(2));

  let close;
  if (isBullish) {
    close = Number((open + bodyHeight).toFixed(2));
  } else {
    close = Number(Math.max(1, open - bodyHeight).toFixed(2));
    if (close >= open) {
      close = Number((open - minBody).toFixed(2));
    }
  }

  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);

  const upperWick = Number(Math.max(0.1 * priceScale, (0.1 + Math.random() * 0.8) * volatility * priceScale).toFixed(2));
  const lowerWick = Number(Math.max(0.1 * priceScale, (0.1 + Math.random() * 0.8) * volatility * priceScale).toFixed(2));

  const high = Number((bodyTop + upperWick).toFixed(2));
  const low = Number(Math.max(1, bodyBottom - lowerWick).toFixed(2));
  const volume = Math.floor(500 + Math.random() * 2500);

  return {
    time: candleTime,
    timestamp: candleTime * 1000,
    open,
    high,
    low,
    close,
    volume,
  };
}

/**
 * Generates an incremental price tick event for live streaming.
 *
 * @param {Object|number|null} [previousCandleOrPrice=null]
 * @param {Object} [options={}]
 * @returns {{ time: number, timestamp: number, price: number, close: number, volume: number }}
 */
export function generateTick(previousCandleOrPrice = null, options = {}) {
  const opts = options || {};
  const ticker = opts.ticker || opts.symbol || DEFAULT_TICKER;
  const defaultPrice = getTickerPrice(ticker);
  let basePrice = defaultPrice;
  let baseTime = Math.floor(Date.now() / 1000);

  if (typeof previousCandleOrPrice === 'number' && Number.isFinite(previousCandleOrPrice)) {
    basePrice = previousCandleOrPrice;
  } else if (previousCandleOrPrice && typeof previousCandleOrPrice === 'object') {
    if (typeof previousCandleOrPrice.close === 'number' && Number.isFinite(previousCandleOrPrice.close)) {
      basePrice = previousCandleOrPrice.close;
    } else if (typeof previousCandleOrPrice.price === 'number' && Number.isFinite(previousCandleOrPrice.price)) {
      basePrice = previousCandleOrPrice.price;
    } else if (typeof previousCandleOrPrice.value === 'number' && Number.isFinite(previousCandleOrPrice.value)) {
      basePrice = previousCandleOrPrice.value;
    }

    if (typeof previousCandleOrPrice.time === 'number' && Number.isFinite(previousCandleOrPrice.time)) {
      baseTime = previousCandleOrPrice.time;
    } else if (typeof previousCandleOrPrice.timestamp === 'number' && Number.isFinite(previousCandleOrPrice.timestamp)) {
      baseTime = previousCandleOrPrice.timestamp > 1e11
        ? Math.floor(previousCandleOrPrice.timestamp / 1000)
        : previousCandleOrPrice.timestamp;
    }
  }

  const volatility = typeof opts.volatility === 'number' && Number.isFinite(opts.volatility) && opts.volatility > 0
    ? opts.volatility
    : 0.5;

  const scale = basePrice > 1000 ? (basePrice / 2000) : 1;
  const delta = (Math.random() - 0.49) * volatility * scale;
  const price = Number(Math.max(1, basePrice + delta).toFixed(2));
  const tickTime = typeof opts.time === 'number' && Number.isFinite(opts.time) ? opts.time : baseTime + 1;
  const volume = Math.floor(10 + Math.random() * 100);

  return {
    time: tickTime,
    timestamp: tickTime * 1000,
    price,
    close: price,
    volume,
  };
}

/**
 * Creates a reactive candle and tick stream emitter pipeable to chart workspaces.
 * Satisfies STORY 39.1.1 (Resolve STATIC_APPLICATION) and STORY 52.1.1 (Resolve INCOHERENT_MARKET_DATA).
 *
 * @param {Object|Function} [targetOrOptions] Target chart or options object
 * @param {Object|number} [maybeOptionsOrInterval={}] Interval in ms or options
 * @returns {Object} Stream controller
 */
export function createCandleStream(targetOrOptions, maybeOptionsOrInterval = {}) {
  let targetChart = null;
  let callback = null;
  let opts = {};

  if (typeof targetOrOptions === 'function') {
    callback = targetOrOptions;
    if (typeof maybeOptionsOrInterval === 'number') {
      opts = { interval: maybeOptionsOrInterval };
    } else if (typeof maybeOptionsOrInterval === 'object' && maybeOptionsOrInterval !== null) {
      opts = maybeOptionsOrInterval;
    }
  } else if (
    targetOrOptions &&
    (typeof targetOrOptions.updateData === 'function' ||
      typeof targetOrOptions.updateTick === 'function' ||
      typeof targetOrOptions.setData === 'function' ||
      typeof targetOrOptions.render === 'function')
  ) {
    targetChart = targetOrOptions;
    if (typeof maybeOptionsOrInterval === 'number') {
      opts = { interval: maybeOptionsOrInterval };
    } else if (typeof maybeOptionsOrInterval === 'object' && maybeOptionsOrInterval !== null) {
      opts = maybeOptionsOrInterval;
    }
  } else if (typeof targetOrOptions === 'object' && targetOrOptions !== null) {
    opts = targetOrOptions;
    if (typeof opts.chart === 'object' && opts.chart) {
      targetChart = opts.chart;
    }
    if (typeof opts.onCandle === 'function') {
      callback = opts.onCandle;
    } else if (typeof opts.onTick === 'function') {
      callback = opts.onTick;
    } else if (typeof opts.callback === 'function') {
      callback = opts.callback;
    }
  }

  const subscribers = new Set();
  if (callback) subscribers.add(callback);

  if (targetChart) {
    subscribers.add((candle) => {
      if (typeof targetChart.updateData === 'function') {
        targetChart.updateData(candle);
      } else if (typeof targetChart.updateTick === 'function') {
        targetChart.updateTick(candle);
      } else if (Array.isArray(targetChart.data)) {
        targetChart.data.push(candle);
        if (typeof targetChart.render === 'function') targetChart.render();
      }
    });
  }

  const intervalMs =
    typeof opts.interval === 'number' && opts.interval > 0
      ? opts.interval
      : (opts.intervalMs || 1000);
  const candleInterval = opts.candleInterval || 60;
  const volatility = opts.volatility || 1.5;

  const streamTicker = opts.ticker || opts.symbol || DEFAULT_TICKER;
  const streamBasePrice = typeof opts.initialPrice === 'number' && Number.isFinite(opts.initialPrice)
    ? opts.initialPrice
    : (typeof opts.price === 'number' && Number.isFinite(opts.price)
      ? opts.price
      : getTickerPrice(streamTicker));

  let lastCandle = opts.lastCandle || opts.initialCandle || null;
  if (!lastCandle && targetChart && Array.isArray(targetChart.data) && targetChart.data.length > 0) {
    lastCandle = targetChart.data[targetChart.data.length - 1];
  }
  if (!lastCandle) {
    const scale = streamBasePrice > 1000 ? (streamBasePrice / 2000) : 1;
    lastCandle = {
      time: Math.floor(Date.now() / 1000),
      timestamp: Date.now(),
      open: streamBasePrice,
      high: Number((streamBasePrice + 1 * scale).toFixed(2)),
      low: Number((streamBasePrice - 1 * scale).toFixed(2)),
      close: Number((streamBasePrice + 0.5 * scale).toFixed(2)),
      volume: 1000,
    };
  }

  let timerId = null;
  let running = false;

  const emitNext = () => {
    if (targetChart && Array.isArray(targetChart.data) && targetChart.data.length > 0) {
      lastCandle = targetChart.data[targetChart.data.length - 1];
    }
    const next = generateNextCandle(lastCandle, { interval: candleInterval, volatility, ticker: streamTicker });
    lastCandle = next;
    for (const sub of subscribers) {
      try {
        sub(next);
      } catch (_) {}
    }
    return next;
  };

  const emitTick = () => {
    if (targetChart && Array.isArray(targetChart.data) && targetChart.data.length > 0) {
      lastCandle = targetChart.data[targetChart.data.length - 1];
    }
    const tick = generateTick(lastCandle, { volatility, ticker: streamTicker });
    for (const sub of subscribers) {
      try {
        sub(tick);
      } catch (_) {}
    }
    return tick;
  };

  const start = () => {
    if (running) return;
    running = true;
    if (typeof setInterval === 'function') {
      timerId = setInterval(() => {
        emitNext();
      }, intervalMs);
      if (timerId && typeof timerId.unref === 'function') {
        timerId.unref();
      }
    }
  };

  const stop = () => {
    running = false;
    if (timerId !== null) {
      if (typeof clearInterval === 'function') {
        clearInterval(timerId);
      }
      timerId = null;
    }
  };

  const subscribe = (fn) => {
    if (typeof fn === 'function') {
      subscribers.add(fn);
      if (!running && opts.autoStart !== false) {
        start();
      }
    }
    return () => subscribers.delete(fn);
  };

  const pipe = (chart) => {
    if (chart && typeof chart.updateData === 'function') {
      return subscribe((c) => chart.updateData(c));
    }
    return () => {};
  };

  if (opts.autoStart !== false && (callback || targetChart)) {
    start();
  }

  return {
    start,
    stop,
    subscribe,
    unsubscribe: (fn) => subscribers.delete(fn),
    pipe,
    emitNext,
    emitTick,
    next: emitNext,
    getLastCandle: () => lastCandle,
    get isRunning() {
      return running;
    },
    get timerId() {
      return timerId;
    },
  };
}

export const generateDefaultData = generateCandlestickData;
export const generateNextTick = generateTick;
export const createStream = createCandleStream;
export const CandleStream = createCandleStream;
export const generateDepthData = generateMarketDepth;
export const generateMarketDepthData = generateMarketDepth;
export const generateOrderBook = generateMarketDepth;
export const generateOrderBookData = generateMarketDepth;
export default generateCandlestickData;