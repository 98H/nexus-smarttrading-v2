/**
 * SmartTrading-V2 — Candlestick Data Generator
 * Produces synthetic oscillating random-walk financial price series containing
 * balanced distributions of bullish (close > open) and bearish (close < open)
 * candles with dynamic high and low wicks (resolves DF-CANDLES-01, STORY 38.4.1).
 */

/**
 * Generates an oscillating candlestick series with dynamic wicks and realistic price steps.
 *
 * @param {Object} [options={}]
 * @param {number} [options.count=75] Total candle items to produce
 * @param {number} [options.initialPrice=100] Starting market base price
 * @param {number} [options.startPrice] Alias for initialPrice
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

  const initialPrice = typeof opts.initialPrice === 'number' && Number.isFinite(opts.initialPrice)
    ? opts.initialPrice
    : (typeof opts.startPrice === 'number' && Number.isFinite(opts.startPrice) ? opts.startPrice : 100);

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
      const openGap = Number(((Math.sin(i * 1.7) * 0.15) + (Math.random() - 0.5) * 0.1).toFixed(2));
      open = Number(Math.max(10, currentClose + openGap).toFixed(2));
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
    const bodyBase = 0.3 + Math.abs(Math.sin(i * 0.8)) * 0.8 * volatility;
    const bodyRand = (0.2 + Math.random() * 1.2) * volatility;
    const bodyHeight = Number(Math.max(0.15, bodyBase + bodyRand).toFixed(2));

    let close;
    if (isBullish) {
      close = Number((open + bodyHeight).toFixed(2));
      bullishCount++;
    } else {
      close = Number(Math.max(5, open - bodyHeight).toFixed(2));
      if (close >= open) {
        close = Number((open - 0.15).toFixed(2));
      }
      bearishCount++;
    }

    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);

    // Dynamic upper and lower wicks with non-zero variance across series
    const upperWickBase = 0.2 + Math.abs(Math.cos(i * 1.3)) * 0.9 * volatility;
    const upperWick = Number(Math.max(0.1, upperWickBase + Math.random() * 1.1 * volatility).toFixed(2));

    const lowerWickBase = 0.2 + Math.abs(Math.sin(i * 1.1 + 0.5)) * 0.9 * volatility;
    const lowerWick = Number(Math.max(0.1, lowerWickBase + Math.random() * 1.1 * volatility).toFixed(2));

    const high = Number((bodyTop + upperWick).toFixed(2));
    const low = Number((bodyBottom - lowerWick).toFixed(2));

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

export const generateDefaultData = generateCandlestickData;
export default generateCandlestickData;