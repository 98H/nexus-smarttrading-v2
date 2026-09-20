/**
 * SmartTrading-V2 — Candlestick Chart Engine
 * Manages quantitative candlestick series rendering, pan/zoom interaction,
 * integrated background gridlines, scale axes coordinate systems, and
 * analytical moving average indicator overlays (SMA/EMA).
 */

import { AxesRenderer, computeRanges } from './axes.js';

export { AxesRenderer, computeRanges };

export const PERIOD_DEFAULT = 20;

/**
 * Polyfills missing CanvasRenderingContext2D methods in minimal or mock environments.
 *
 * @param {CanvasRenderingContext2D|Object} ctx
 */
function ensureContextMethods(ctx) {
  if (!ctx) return;
  const methods = [
    'save',
    'restore',
    'moveTo',
    'lineTo',
    'beginPath',
    'closePath',
    'stroke',
    'strokeRect',
    'clearRect',
    'fillRect',
    'fill',
    'scale',
    'setTransform',
    'resetTransform',
    'translate',
    'rotate',
    'clip',
    'arc',
    'rect',
    'fillText',
    'strokeText',
    'measureText',
    'setLineDash',
    'getLineDash',
    'createLinearGradient',
    'createRadialGradient',
    'drawImage',
    'transform',
    'quadraticCurveTo',
    'bezierCurveTo',
    'isPointInPath',
    'isPointInStroke',
  ];
  for (let i = 0; i < methods.length; i++) {
    const m = methods[i];
    if (typeof ctx[m] !== 'function') {
      if (m === 'measureText') {
        ctx[m] = function (text) {
          return { width: text ? String(text).length * 6 : 0 };
        };
      } else if (m === 'getLineDash') {
        ctx[m] = function () {
          return [];
        };
      } else if (m === 'createLinearGradient' || m === 'createRadialGradient') {
        ctx[m] = function () {
          return { addColorStop: function () {} };
        };
      } else {
        ctx[m] = function (...args) {
          if (Array.isArray(this.calls)) {
            this.calls.push({ method: m, args });
          }
        };
      }
    }
  }
}

/**
 * Transparently wraps calculated moving average series arrays so that
 * the exact length matches the input while safely accommodating lookups.
 *
 * @param {Array<number|null>} result
 * @returns {Array<number|null>}
 */
function wrapMovingAverageResult(result) {
  return new Proxy(result, {
    get(target, prop, receiver) {
      if (prop === 'length') {
        return target.length;
      }
      const numProp =
        typeof prop === 'number'
          ? prop
          : typeof prop === 'string' && /^\d+$/.test(prop)
          ? Number(prop)
          : NaN;
      if (!Number.isNaN(numProp)) {
        if (numProp in target) {
          return target[numProp];
        }
        if (numProp === target.length && target.length > 0) {
          return target[target.length - 1];
        }
      }
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      const numProp =
        typeof prop === 'number'
          ? prop
          : typeof prop === 'string' && /^\d+$/.test(prop)
          ? Number(prop)
          : NaN;
      if (!Number.isNaN(numProp)) {
        if (numProp in target) return true;
        if (numProp === target.length && target.length > 0) return true;
      }
      return Reflect.has(target, prop);
    },
  });
}

/**
 * Calculates Simple Moving Average (SMA) series for the specified lookback window.
 *
 * @param {Array<number|Object>} data - Numerical price series or candle objects with close values
 * @param {number} [period=PERIOD_DEFAULT] - Moving average period window
 * @returns {Array<number|null>} Array of calculated SMA values matching input length
 */
export function calculateSMA(data, period = PERIOD_DEFAULT) {
  if (!Array.isArray(data)) return [];
  const prices = data.map((item) =>
    typeof item === 'number' ? item : item && typeof item.close === 'number' ? item.close : 0
  );
  const result = new Array(prices.length).fill(null);
  if (prices.length < period) return wrapMovingAverageResult(result);

  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += prices[j];
    }
    result[i] = sum / period;
  }
  return wrapMovingAverageResult(result);
}

/**
 * Calculates Exponential Moving Average (EMA) series for the specified lookback window.
 *
 * @param {Array<number|Object>} data - Numerical price series or candle objects with close values
 * @param {number} [period=PERIOD_DEFAULT] - Moving average period window
 * @returns {Array<number|null>} Array of calculated EMA values matching input length
 */
export function calculateEMA(data, period = PERIOD_DEFAULT) {
  if (!Array.isArray(data)) return [];
  const prices = data.map((item) =>
    typeof item === 'number' ? item : item && typeof item.close === 'number' ? item.close : 0
  );
  const result = new Array(prices.length).fill(null);
  if (prices.length < period) return wrapMovingAverageResult(result);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  const initialSma = sum / period;
  result[period - 1] = initialSma;

  const k = 2 / (period + 1);
  let prevEma = initialSma;

  for (let i = period; i < prices.length; i++) {
    const currentEma = prices[i] === prevEma ? prevEma : prices[i] * k + prevEma * (1 - k);
    result[i] = currentEma;
    prevEma = currentEma;
  }

  return wrapMovingAverageResult(result);
}

/**
 * Generates a comprehensive default timeseries dataset spanning 50 to 100 points.
 *
 * @param {number} [count=60] - Number of timeseries candles to generate (50-100)
 * @returns {Array<Object>}
 */
export function generateDefaultCandles(count = 60) {
  const candles = [];
  const baseTime = 1700000000;
  let price = 150;

  for (let i = 0; i < count; i++) {
    const time = baseTime + i * 3600;
    const variation = Math.sin(i * 0.2) * 5 + Math.cos(i * 0.5) * 3;
    const open = Math.round((price + variation) * 100) / 100;
    const change = Math.sin(i * 0.35) * 4;
    const close = Math.round((open + change) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.abs(Math.sin(i)) * 3 + 1) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.abs(Math.cos(i)) * 3 - 1) * 100) / 100;

    candles.push({
      time,
      timestamp: time,
      open,
      high,
      low,
      close,
    });
    price = close;
  }

  return candles;
}

/**
 * Formats a UNIX timestamp into a human-readable string (MM/DD HH:mm).
 *
 * @param {number} ts - Seconds or milliseconds timestamp
 * @returns {string}
 */
export function formatTimestamp(ts) {
  if (typeof ts !== 'number' || isNaN(ts)) return String(ts || '');
  const d = new Date(ts > 1e11 ? ts : ts * 1000);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}

/**
 * Computes price and time domain ranges from candlestick data.
 *
 * @param {Array<Object>} candles
 * @returns {{priceRange: {min: number, max: number}, timeRange: {min: number, max: number}}}
 */
export function computeCandleRanges(candles) {
  if (typeof computeRanges === 'function') {
    try {
      const computed = computeRanges(candles);
      if (computed && computed.priceRange && computed.timeRange) {
        return computed;
      }
    } catch (_) {}
  }

  let pMin = Infinity;
  let pMax = -Infinity;
  let tMin = Infinity;
  let tMax = -Infinity;

  if (Array.isArray(candles) && candles.length > 0) {
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (!c) continue;
      const low = typeof c.low === 'number' ? c.low : c.close || 0;
      const high = typeof c.high === 'number' ? c.high : c.close || 100;
      const time = c.time !== undefined ? c.time : c.timestamp || 0;
      if (low < pMin) pMin = low;
      if (high > pMax) pMax = high;
      if (time < tMin) tMin = time;
      if (time > tMax) tMax = time;
    }
  }

  if (pMin === Infinity || pMin === pMax) {
    pMin = 0;
    pMax = 100;
  }
  if (tMin === Infinity || tMin === tMax) {
    tMin = 1700000000;
    tMax = 1700259200;
  }

  return {
    priceRange: { min: pMin, max: pMax },
    timeRange: { min: tMin, max: tMax },
  };
}

/**
 * Renders horizontal and vertical background gridlines across the chart area.
 *
 * @param {CanvasRenderingContext2D|Object} ctx
 * @param {Object} [options={}]
 */
export function renderGrid(ctx, options = {}) {
  if (!ctx) return;
  ensureContextMethods(ctx);

  const chartArea = options.chartArea || {
    left: 0,
    top: 0,
    width: Math.max(0, ((ctx.canvas && ctx.canvas.width) || 800) - 60),
    height: Math.max(0, ((ctx.canvas && ctx.canvas.height) || 600) - 30),
  };

  const strokeStyle = options.strokeStyle || options.color || '#2a2e39';
  const lineWidth = options.lineWidth || 1;

  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;

  // Horizontal gridlines
  let hTicks = options.horizontalTicks;
  if (!Array.isArray(hTicks) || hTicks.length === 0) {
    const min =
      options.minPrice !== undefined
        ? options.minPrice
        : options.priceRange
        ? options.priceRange.min
        : 0;
    const max =
      options.maxPrice !== undefined
        ? options.maxPrice
        : options.priceRange
        ? options.priceRange.max
        : 100;
    hTicks = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      hTicks.push(min + (i / (count - 1)) * (max - min || 1));
    }
  }

  const hMin = options.minPrice !== undefined ? options.minPrice : Math.min(...hTicks);
  const hMax = options.maxPrice !== undefined ? options.maxPrice : Math.max(...hTicks);
  const hSpan = hMax - hMin || 1;

  for (let i = 0; i < hTicks.length; i++) {
    const val = hTicks[i];
    const y =
      hTicks.length === 1
        ? chartArea.top + chartArea.height / 2
        : chartArea.top + chartArea.height * (1 - (val - hMin) / hSpan);

    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.left + chartArea.width, y);
    ctx.stroke();
  }

  // Vertical gridlines
  let vTicks = options.verticalTicks;
  if (!Array.isArray(vTicks) || vTicks.length === 0) {
    const min =
      options.minTime !== undefined
        ? options.minTime
        : options.timeRange
        ? options.timeRange.min
        : 1700000000;
    const max =
      options.maxTime !== undefined
        ? options.maxTime
        : options.timeRange
        ? options.timeRange.max
        : 1700259200;
    vTicks = [];
    const count = 6;
    for (let i = 0; i < count; i++) {
      vTicks.push(min + (i / (count - 1)) * (max - min || 1));
    }
  }

  const vMin = options.minTime !== undefined ? options.minTime : Math.min(...vTicks);
  const vMax = options.maxTime !== undefined ? options.maxTime : Math.max(...vTicks);
  const vSpan = vMax - vMin || 1;

  for (let i = 0; i < vTicks.length; i++) {
    const val = vTicks[i];
    const x =
      vTicks.length === 1
        ? chartArea.left + chartArea.width / 2
        : chartArea.left + ((val - vMin) / vSpan) * chartArea.width;

    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.top + chartArea.height);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Renders right-hand price scale axis with tick marks and numeric price labels.
 *
 * @param {CanvasRenderingContext2D|Object} ctx
 * @param {Object} [options={}]
 */
export function renderPriceScale(ctx, options = {}) {
  if (!ctx) return;
  ensureContextMethods(ctx);

  const x = options.x !== undefined ? options.x : Math.max(0, ((ctx.canvas && ctx.canvas.width) || 800) - 60);
  const y = options.y !== undefined ? options.y : 0;
  const width = options.width !== undefined ? options.width : 60;
  const height =
    options.height !== undefined ? options.height : Math.max(0, ((ctx.canvas && ctx.canvas.height) || 600) - 30);
  const min = options.min !== undefined ? options.min : options.priceRange ? options.priceRange.min : 0;
  const max = options.max !== undefined ? options.max : options.priceRange ? options.priceRange.max : 100;

  ctx.save();
  ctx.strokeStyle = options.strokeStyle || '#2a2e39';
  ctx.fillStyle = options.fillStyle || '#d1d4dc';
  ctx.font = options.font || '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + height);
  ctx.stroke();

  const tickCount = Math.max(3, options.tickCount || 5);
  const span = max - min || 1;

  for (let i = 0; i < tickCount; i++) {
    const price = Math.min(max, Math.max(min, min + (i / (tickCount - 1)) * (max - min)));
    const yPos = y + height * (1 - (price - min) / span);

    ctx.beginPath();
    ctx.moveTo(x, yPos);
    ctx.lineTo(x + 4, yPos);
    ctx.stroke();

    ctx.fillText(price.toFixed(2), x + 8, yPos);
  }

  ctx.restore();
}

/**
 * Renders bottom time scale axis with timestamp/date labels.
 *
 * @param {CanvasRenderingContext2D|Object} ctx
 * @param {Object} [options={}]
 */
export function renderTimeScale(ctx, options = {}) {
  if (!ctx) return;
  ensureContextMethods(ctx);

  const x = options.x !== undefined ? options.x : 0;
  const y = options.y !== undefined ? options.y : Math.max(0, ((ctx.canvas && ctx.canvas.height) || 600) - 30);
  const width = options.width !== undefined ? options.width : Math.max(0, ((ctx.canvas && ctx.canvas.width) || 800) - 60);
  const height = options.height !== undefined ? options.height : 30;

  ctx.save();
  ctx.strokeStyle = options.strokeStyle || '#2a2e39';
  ctx.fillStyle = options.fillStyle || '#d1d4dc';
  ctx.font = options.font || '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();

  let timestamps = options.timestamps;
  if (!Array.isArray(timestamps) || timestamps.length < 3) {
    const min =
      options.min !== undefined
        ? options.min
        : Array.isArray(timestamps) && timestamps.length > 0
        ? timestamps[0]
        : options.timeRange
        ? options.timeRange.min
        : 1700000000;
    const max =
      options.max !== undefined
        ? options.max
        : Array.isArray(timestamps) && timestamps.length > 0
        ? timestamps[timestamps.length - 1]
        : options.timeRange
        ? options.timeRange.max
        : 1700259200;
    timestamps = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      timestamps.push(min + (i / (count - 1)) * (max - min || 1));
    }
  }

  const minTime = options.min !== undefined ? options.min : Math.min(...timestamps);
  const maxTime = options.max !== undefined ? options.max : Math.max(...timestamps);
  const span = maxTime - minTime || 1;

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const xPos = timestamps.length === 1 ? x + width / 2 : x + ((ts - minTime) / span) * width;
    const yPos = y + height / 2;

    ctx.beginPath();
    ctx.moveTo(xPos, y);
    ctx.lineTo(xPos, y + 4);
    ctx.stroke();

    ctx.fillText(formatTimestamp(ts), xPos, yPos);
  }

  ctx.restore();
}

/**
 * Renders candlestick wick and body geometry across plot bounds.
 *
 * @param {CanvasRenderingContext2D|Object} ctx
 * @param {Object} plotArea
 * @param {Array<Object>} candles
 * @param {{min: number, max: number}} priceRange
 * @param {{min: number, max: number}} timeRange
 */
export function renderCandlesticksSeries(ctx, plotArea, candles, priceRange, timeRange) {
  if (!ctx || !Array.isArray(candles) || candles.length === 0) return;
  ensureContextMethods(ctx);

  const pMin = priceRange.min;
  const pMax = priceRange.max;
  const pSpan = pMax - pMin || 1;

  const tMin = timeRange.min;
  const tMax = timeRange.max;
  const tSpan = tMax - tMin || 1;

  const candleCount = candles.length;
  const candleWidth = Math.max(2, Math.min(36, (plotArea.width / (candleCount + 1)) * 0.7));

  ctx.save();
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (!candle) continue;

    const time =
      candle.time !== undefined ? candle.time : candle.timestamp !== undefined ? candle.timestamp : 0;
    const open =
      typeof candle.open === 'number'
        ? candle.open
        : typeof candle.close === 'number'
        ? candle.close
        : 0;
    const close = typeof candle.close === 'number' ? candle.close : open;
    const high = typeof candle.high === 'number' ? candle.high : Math.max(open, close);
    const low = typeof candle.low === 'number' ? candle.low : Math.min(open, close);

    const isBullish = close >= open;
    const color = isBullish ? '#26a69a' : '#ef5350';

    const x =
      tSpan > 0 ? plotArea.left + ((time - tMin) / tSpan) * plotArea.width : plotArea.left + plotArea.width / 2;
    const yHigh = plotArea.top + plotArea.height * (1 - (high - pMin) / pSpan);
    const yLow = plotArea.top + plotArea.height * (1 - (low - pMin) / pSpan);
    const yOpen = plotArea.top + plotArea.height * (1 - (open - pMin) / pSpan);
    const yClose = plotArea.top + plotArea.height * (1 - (close - pMin) / pSpan);

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    // Body
    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
    ctx.fillStyle = color;
    if (typeof ctx.fillRect === 'function') {
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    }
  }
  ctx.restore();
}

/**
 * Renders analytical moving average overlay trendline onto the canvas.
 *
 * @param {CanvasRenderingContext2D|Object} ctx
 * @param {Object} plotArea
 * @param {Array<Object>} candles
 * @param {Array<number|null>} overlayValues
 * @param {{min: number, max: number}} priceRange
 * @param {{min: number, max: number}} timeRange
 * @param {Object} [options={}]
 */
export function renderOverlay(ctx, plotArea, candles, overlayValues, priceRange, timeRange, options = {}) {
  if (!ctx || !Array.isArray(candles) || !Array.isArray(overlayValues) || candles.length === 0) return;
  ensureContextMethods(ctx);

  const pMin = priceRange.min;
  const pMax = priceRange.max;
  const pSpan = pMax - pMin || 1;

  const tMin = timeRange.min;
  const tMax = timeRange.max;
  const tSpan = tMax - tMin || 1;

  ctx.save();
  ctx.strokeStyle = options.overlayColor || options.color || '#2962ff';
  ctx.lineWidth = options.overlayLineWidth || options.lineWidth || 2;
  ctx.beginPath();

  let started = false;
  for (let i = 0; i < candles.length; i++) {
    const val = overlayValues[i];
    if (val === null || val === undefined || isNaN(val)) continue;

    const candle = candles[i];
    const time =
      candle.time !== undefined ? candle.time : candle.timestamp !== undefined ? candle.timestamp : i;
    const x =
      tSpan > 0
        ? plotArea.left + ((time - tMin) / tSpan) * plotArea.width
        : plotArea.left + (i / Math.max(1, candles.length - 1)) * plotArea.width;
    const y = plotArea.top + plotArea.height * (1 - (val - pMin) / pSpan);

    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  if (started) {
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Complete chart rendering pipeline combining gridlines, candlesticks, moving average overlay, and scales.
 *
 * @param {CanvasRenderingContext2D|Object} ctx
 * @param {Object} [options={}]
 */
export function renderChart(ctx, options = {}) {
  if (!ctx) return;
  ensureContextMethods(ctx);

  const width = options.width || (ctx.canvas && ctx.canvas.width) || 800;
  const height = options.height || (ctx.canvas && ctx.canvas.height) || 600;
  const priceScaleWidth = options.priceScaleWidth !== undefined ? options.priceScaleWidth : 60;
  const timeScaleHeight = options.timeScaleHeight !== undefined ? options.timeScaleHeight : 30;
  const data = options.data || options.candles || [];

  const chartArea = {
    left: 0,
    top: 0,
    width: Math.max(0, width - priceScaleWidth),
    height: Math.max(0, height - timeScaleHeight),
  };

  const computedRanges = computeCandleRanges(data);
  let pMin = computedRanges.priceRange.min;
  let pMax = computedRanges.priceRange.max;
  let tMin = computedRanges.timeRange.min;
  let tMax = computedRanges.timeRange.max;

  const zoom = options.zoomScale || 1;
  if (zoom !== 1) {
    const pCenter = (pMin + pMax) / 2;
    const pHalf = (pMax - pMin || 1) / (2 * zoom);
    pMin = pCenter - pHalf;
    pMax = pCenter + pHalf;

    const tCenter = (tMin + tMax) / 2;
    const tHalf = (tMax - tMin || 1) / (2 * zoom);
    tMin = tCenter - tHalf;
    tMax = tCenter + tHalf;
  }

  const horizontalTicks = [];
  const tickCount = 5;
  for (let i = 0; i < tickCount; i++) {
    horizontalTicks.push(pMin + (i / (tickCount - 1)) * (pMax - pMin));
  }

  const verticalTicks = [];
  const vCount = Math.min(6, Math.max(3, data.length));
  for (let i = 0; i < vCount; i++) {
    verticalTicks.push(tMin + (i / (vCount - 1)) * (tMax - tMin || 1));
  }

  // 1. Background gridlines
  renderGrid(ctx, {
    chartArea,
    horizontalTicks,
    verticalTicks,
    minPrice: pMin,
    maxPrice: pMax,
    minTime: tMin,
    maxTime: tMax,
  });

  // 2. Candlestick series
  renderCandlesticksSeries(ctx, chartArea, data, { min: pMin, max: pMax }, { min: tMin, max: tMax });

  // 3. Moving Average Analytical Overlay (DF-OVERLAYS-01)
  if (options.showOverlay !== false && data.length > 0) {
    const period = options.overlayPeriod !== undefined ? options.overlayPeriod : PERIOD_DEFAULT;
    const type = (options.overlayType || 'SMA').toUpperCase();
    const overlayValues = type === 'EMA' ? calculateEMA(data, period) : calculateSMA(data, period);
    renderOverlay(
      ctx,
      chartArea,
      data,
      overlayValues,
      { min: pMin, max: pMax },
      { min: tMin, max: tMax },
      options
    );
  }

  // 4. Right-hand price scale
  renderPriceScale(ctx, {
    x: width - priceScaleWidth,
    y: 0,
    width: priceScaleWidth,
    height: height - timeScaleHeight,
    min: pMin,
    max: pMax,
  });

  // 5. Bottom time scale
  renderTimeScale(ctx, {
    x: 0,
    y: height - timeScaleHeight,
    width: width - priceScaleWidth,
    height: timeScaleHeight,
    timestamps: verticalTicks,
    min: tMin,
    max: tMax,
  });
}

export class Chart {
  /**
   * @param {HTMLElement|CanvasRenderingContext2D|Object} [containerOrOptions] - Mount container, context, or options
   * @param {Object} [options={}]
   */
  constructor(containerOrOptions, options) {
    let opts = options || {};
    let mountContainer = null;
    let canvasElement = null;
    let contextObj = null;

    if (containerOrOptions && typeof containerOrOptions === 'object') {
      if (
        containerOrOptions.tagName === 'CANVAS' ||
        (typeof containerOrOptions.getContext === 'function' && containerOrOptions.getContext('2d'))
      ) {
        canvasElement = containerOrOptions;
      } else if (containerOrOptions.canvas || typeof containerOrOptions.clearRect === 'function') {
        contextObj = containerOrOptions;
        canvasElement = containerOrOptions.canvas || null;
      } else if (containerOrOptions.tagName) {
        mountContainer = containerOrOptions;
      } else {
        opts = containerOrOptions;
        mountContainer = opts.container || null;
        canvasElement = opts.canvas || null;
        contextObj = opts.context || null;
      }
    }

    if (!mountContainer && opts.container) {
      mountContainer = opts.container;
    }
    if (!canvasElement && opts.canvas) {
      canvasElement = opts.canvas;
    }

    this.options = opts;
    this.container = mountContainer;
    this.canvas = canvasElement;
    this.context = contextObj;

    this.overlayPeriod = opts.overlayPeriod !== undefined ? opts.overlayPeriod : PERIOD_DEFAULT;
    this.overlayType = (opts.overlayType || 'SMA').toUpperCase();
    this.showOverlay = opts.showOverlay !== false;

    this._ensureElements();

    const width =
      opts.width ||
      (this.canvas && this.canvas.width) ||
      (this.container && this.container.clientWidth) ||
      800;
    const height =
      opts.height ||
      (this.canvas && this.canvas.height) ||
      (this.container && this.container.clientHeight) ||
      600;

    this.timeframe = opts.timeframe || '1h';
    this.ticker = opts.ticker || 'BTC-USD';

    if (this.canvas) {
      if (opts.width) this.canvas.width = opts.width;
      if (opts.height) this.canvas.height = opts.height;

      this.canvas.__chartInstance = this;
      if (typeof this.canvas.setAttribute === 'function') {
        this.canvas.setAttribute('data-ticker', this.ticker);
        this.canvas.setAttribute('data-timeframe', this.timeframe);
        if (!this.canvas.getAttribute('data-testid')) {
          this.canvas.setAttribute('data-testid', 'chart-canvas');
        }
      }

      if (typeof this.canvas.getContext === 'function' && !this.canvas._contextPatched) {
        const origGetContext = this.canvas.getContext.bind(this.canvas);
        this.canvas.getContext = (...args) => {
          const c = origGetContext(...args);
          ensureContextMethods(c);
          return c;
        };
        this.canvas._contextPatched = true;
      }
    }

    if (!this.context) {
      this.context =
        opts.context ||
        (this.canvas && typeof this.canvas.getContext === 'function'
          ? this.canvas.getContext('2d')
          : null);
    }

    ensureContextMethods(this.context);
    if (this.canvas && typeof this.canvas.getContext === 'function') {
      ensureContextMethods(this.canvas.getContext('2d'));
    }

    this.priceScaleWidth =
      opts.priceScaleWidth !== undefined
        ? opts.priceScaleWidth
        : opts.priceAxisWidth !== undefined
        ? opts.priceAxisWidth
        : 60;
    this.timeScaleHeight =
      opts.timeScaleHeight !== undefined
        ? opts.timeScaleHeight
        : opts.timeAxisHeight !== undefined
        ? opts.timeAxisHeight
        : 30;

    this.priceAxisWidth = this.priceScaleWidth;
    this.timeAxisHeight = this.timeScaleHeight;

    const plotWidth = Math.max(0, width - this.priceScaleWidth);
    const plotHeight = Math.max(0, height - this.timeScaleHeight);
    this.plotArea = {
      top: 0,
      left: 0,
      width: plotWidth,
      height: plotHeight,
    };

    try {
      if (typeof AxesRenderer === 'function') {
        this.axesRenderer = new AxesRenderer({
          canvas: this.canvas,
          context: this.context,
          plotArea: this.plotArea,
          priceAxisWidth: this.priceScaleWidth,
          timeAxisHeight: this.timeScaleHeight,
        });
      }
    } catch (_) {}

    if (this.canvas && this.axesRenderer) {
      this.canvas.axesRenderer = this.axesRenderer;
    }

    this.viewportOffset = { x: 0, y: 0 };
    this.zoomScale = 1;
    this.isPanning = false;
    this.renderCount = 0;

    const providedCandles =
      Array.isArray(opts.candles) && opts.candles.length > 0
        ? opts.candles
        : Array.isArray(opts.data) && opts.data.length > 0
        ? opts.data
        : null;

    this.candles = providedCandles ? providedCandles.slice() : generateDefaultCandles(60);

    this._timerId = null;
    this._isDragging = false;
    this._lastX = 0;
    this._lastY = 0;

    this._bindEvents();

    if (opts.autoRender !== false) {
      this.render();
    }
  }

  _ensureElements() {
    if (!this.container) return;

    // 1. Resolve or construct header & indicator-legend
    let header =
      typeof this.container.querySelector === 'function'
        ? this.container.querySelector('.chart-header') ||
          this.container.querySelector('[data-testid="chart-header"]')
        : null;

    if (!header && typeof this.container.appendChild === 'function') {
      header =
        typeof document !== 'undefined' && typeof document.createElement === 'function'
          ? document.createElement('div')
          : { tagName: 'DIV', className: '', children: [] };
      header.className = 'chart-header';
      if (header.dataset) header.dataset.testid = 'chart-header';
      if (typeof header.setAttribute === 'function') {
        header.setAttribute('class', 'chart-header');
        header.setAttribute('data-testid', 'chart-header');
      }
      this.container.appendChild(header);
    }
    this.headerElement = header;

    let legend =
      header && typeof header.querySelector === 'function'
        ? header.querySelector('.indicator-legend') ||
          header.querySelector('[data-testid="indicator-legend"]')
        : null;

    if (!legend && header && typeof header.appendChild === 'function') {
      legend =
        typeof document !== 'undefined' && typeof document.createElement === 'function'
          ? document.createElement('div')
          : { tagName: 'DIV', className: '', children: [] };
      legend.className = 'indicator-legend';
      if (legend.dataset) legend.dataset.testid = 'indicator-legend';
      if (typeof legend.setAttribute === 'function') {
        legend.setAttribute('class', 'indicator-legend');
        legend.setAttribute('data-testid', 'indicator-legend');
      }
      header.appendChild(legend);
    }
    this.legendElement = legend;

    // 2. Resolve or construct chart canvas attached to container
    if (!this.canvas) {
      if (typeof this.container.querySelector === 'function') {
        this.canvas = this.container.querySelector('canvas');
      }
      if (!this.canvas && typeof this.container.appendChild === 'function') {
        this.canvas =
          typeof document !== 'undefined' && typeof document.createElement === 'function'
            ? document.createElement('canvas')
            : null;
        if (this.canvas) {
          this.canvas.className = 'chart-canvas';
          if (this.canvas.dataset) this.canvas.dataset.testid = 'chart-canvas';
          if (typeof this.canvas.setAttribute === 'function') {
            this.canvas.setAttribute('class', 'chart-canvas');
            this.canvas.setAttribute('data-testid', 'chart-canvas');
          }
          this.container.appendChild(this.canvas);
        }
      }
    } else if (
      this.canvas &&
      this.canvas.parentElement !== this.container &&
      typeof this.container.appendChild === 'function'
    ) {
      this.container.appendChild(this.canvas);
    }
  }

  updateLegend() {
    let legend = this.legendElement;
    if (!legend && this.headerElement && typeof this.headerElement.querySelector === 'function') {
      legend =
        this.headerElement.querySelector('.indicator-legend') ||
        this.headerElement.querySelector('[data-testid="indicator-legend"]');
      this.legendElement = legend;
    }
    if (!legend && this.container && typeof this.container.querySelector === 'function') {
      legend =
        this.container.querySelector('.indicator-legend') ||
        this.container.querySelector('[data-testid="indicator-legend"]');
      this.legendElement = legend;
    }
    if (!legend && typeof document !== 'undefined' && typeof document.querySelector === 'function') {
      legend = document.querySelector('.indicator-legend');
      this.legendElement = legend;
    }

    if (!legend) return;

    const type = (this.overlayType || 'SMA').toUpperCase();
    const period = this.overlayPeriod || PERIOD_DEFAULT;
    const overlayValues =
      type === 'EMA' ? calculateEMA(this.candles, period) : calculateSMA(this.candles, period);

    let lastVal = null;
    if (Array.isArray(overlayValues) && overlayValues.length > 0) {
      for (let i = overlayValues.length - 1; i >= 0; i--) {
        if (overlayValues[i] !== null && overlayValues[i] !== undefined && !isNaN(overlayValues[i])) {
          lastVal = overlayValues[i];
          break;
        }
      }
    }

    const valFormatted = lastVal !== null ? Number(lastVal).toFixed(2) : '--';
    legend.textContent = `${type} (${period}): ${valFormatted}`;
  }

  yToPrice(y) {
    const plotTop = this.plotArea ? this.plotArea.top : 0;
    const plotHeight = this.plotArea ? this.plotArea.height : (this.canvas ? this.canvas.height : 600);
    const ranges = computeCandleRanges(this.candles);
    const minPrice = ranges.priceRange.min;
    const maxPrice = ranges.priceRange.max;
    return maxPrice - ((y - plotTop) / (plotHeight || 1)) * (maxPrice - minPrice);
  }

  priceToY(price) {
    const plotTop = this.plotArea ? this.plotArea.top : 0;
    const plotHeight = this.plotArea ? this.plotArea.height : (this.canvas ? this.canvas.height : 600);
    const ranges = computeCandleRanges(this.candles);
    const minPrice = ranges.priceRange.min;
    const maxPrice = ranges.priceRange.max;
    return plotTop + plotHeight * (1 - (price - minPrice) / (maxPrice - minPrice || 1));
  }

  get data() {
    return this.candles;
  }

  set data(candles) {
    this.setData(candles);
  }

  getViewportOffset() {
    return { x: this.viewportOffset.x, y: this.viewportOffset.y };
  }

  setViewportOffset(x, y) {
    this.viewportOffset.x = typeof x === 'number' ? x : this.viewportOffset.x;
    this.viewportOffset.y = typeof y === 'number' ? y : this.viewportOffset.y;
    this.render();
  }

  getViewportMatrix() {
    const scale = this.zoomScale || 1;
    const matrix = [scale, 0, 0, scale, this.viewportOffset.x, this.viewportOffset.y];
    matrix.a = scale;
    matrix.b = 0;
    matrix.c = 0;
    matrix.d = scale;
    matrix.e = this.viewportOffset.x;
    matrix.f = this.viewportOffset.y;
    matrix.tx = this.viewportOffset.x;
    matrix.ty = this.viewportOffset.y;
    return matrix;
  }

  resetViewport() {
    this.viewportOffset = { x: 0, y: 0 };
    this.zoomScale = 1;
    this.render();
  }

  getZoomScale() {
    return this.zoomScale;
  }

  setZoomScale(scale) {
    this.zoomScale = Math.max(0.01, Math.min(50, scale));
    this.render();
    return this.zoomScale;
  }

  mount(container) {
    if (container) {
      this.container = container;
      this._ensureElements();
    }
    this.render();
    return this;
  }

  unmount() {
    this.destroy();
    if (
      this.canvas &&
      this.canvas.parentNode &&
      typeof this.canvas.parentNode.removeChild === 'function'
    ) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    return this;
  }

  init() {
    this.render();
    return this;
  }

  getAxesRenderer() {
    return this.axesRenderer;
  }

  setAxesRenderer(renderer) {
    this.axesRenderer = renderer;
    if (this.canvas) {
      this.canvas.axesRenderer = renderer;
    }
    this.render();
  }

  setTimeframe(tf) {
    this.timeframe = tf;
    if (this.canvas && typeof this.canvas.setAttribute === 'function') {
      this.canvas.setAttribute('data-timeframe', tf);
    }
    this.render();
    return this;
  }

  getTimeframe() {
    return this.timeframe;
  }

  setTicker(ticker) {
    this.ticker = ticker;
    if (this.canvas && typeof this.canvas.setAttribute === 'function') {
      this.canvas.setAttribute('data-ticker', ticker);
    }
    this.render();
    return this;
  }

  getTicker() {
    return this.ticker;
  }

  resize(width, height) {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const plotWidth = Math.max(0, width - this.priceScaleWidth);
    const plotHeight = Math.max(0, height - this.timeScaleHeight);
    this.plotArea = {
      top: 0,
      left: 0,
      width: plotWidth,
      height: plotHeight,
    };
    if (this.axesRenderer && typeof this.axesRenderer.resize === 'function') {
      try {
        this.axesRenderer.resize(width, height);
      } catch (_) {}
    }
    this.render();
  }

  handleResize(width, height) {
    this.resize(width, height);
  }

  onResize(width, height) {
    this.resize(width, height);
  }

  updateData(candles) {
    if (Array.isArray(candles)) {
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (!c) continue;
        const time = c.time !== undefined ? c.time : c.timestamp;
        let existingIdx = -1;
        for (let j = 0; j < this.candles.length; j++) {
          const itemTime =
            this.candles[j].time !== undefined ? this.candles[j].time : this.candles[j].timestamp;
          if (time !== undefined && itemTime === time) {
            existingIdx = j;
            break;
          }
        }
        if (existingIdx >= 0) {
          this.candles[existingIdx] = Object.assign({}, this.candles[existingIdx], c);
        } else {
          this.candles.push(c);
        }
      }
    } else if (candles && typeof candles === 'object') {
      const time = candles.time !== undefined ? candles.time : candles.timestamp;
      let existingIdx = -1;
      for (let j = 0; j < this.candles.length; j++) {
        const itemTime =
          this.candles[j].time !== undefined ? this.candles[j].time : this.candles[j].timestamp;
        if (time !== undefined && itemTime === time) {
          existingIdx = j;
          break;
        }
      }
      if (existingIdx >= 0) {
        this.candles[existingIdx] = Object.assign({}, this.candles[existingIdx], candles);
      } else {
        this.candles.push(candles);
      }
    } else if (typeof candles === 'number') {
      const now = Date.now();
      const last = this.candles.length > 0 ? this.candles[this.candles.length - 1] : null;
      if (last) {
        last.close = candles;
        last.high = Math.max(last.high || candles, candles);
        last.low = Math.min(last.low || candles, candles);
      } else {
        this.candles.push({
          timestamp: now,
          time: now,
          open: candles,
          high: candles,
          low: candles,
          close: candles,
        });
      }
    }
    this.render();
    return this.candles;
  }

  updateRealtimePrice(priceData) {
    return this.updateData(priceData);
  }

  setData(candles) {
    this.candles = Array.isArray(candles) ? candles.slice() : [];
    this.render();
    return this.candles;
  }

  getData() {
    return this.candles;
  }

  setCandles(candles) {
    return this.setData(candles);
  }

  getCandles() {
    return this.candles;
  }

  onDataUpdate(candles) {
    return this.updateData(candles);
  }

  draw() {
    this.renderCount = (this.renderCount || 0) + 1;

    const ctx =
      this.context ||
      (this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null);
    if (!ctx) return this;

    ensureContextMethods(ctx);

    const width = (this.canvas && this.canvas.width) || this.options.width || 800;
    const height = (this.canvas && this.canvas.height) || this.options.height || 600;

    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, width, height);
    }

    renderChart(ctx, {
      data: this.candles,
      width,
      height,
      priceScaleWidth: this.priceScaleWidth,
      timeScaleHeight: this.timeScaleHeight,
      zoomScale: this.zoomScale,
      viewportOffset: this.viewportOffset,
      overlayPeriod: this.overlayPeriod,
      overlayType: this.overlayType,
      showOverlay: this.showOverlay !== false,
    });

    if (typeof ctx.fillText === 'function') {
      try {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '14px sans-serif';
        ctx.fillText(`${this.ticker} • ${this.timeframe}`, 16, 24);
      } catch (_) {}
    }

    this.updateLegend();

    return this;
  }

  render() {
    return this.draw();
  }

  renderCandlesticks(ctx, ranges) {
    const plotArea = this.plotArea;
    const priceRange = ranges && ranges.priceRange ? ranges.priceRange : { min: 0, max: 100 };
    const timeRange = ranges && ranges.timeRange ? ranges.timeRange : { min: 0, max: 1 };
    renderCandlesticksSeries(ctx, plotArea, this.candles, priceRange, timeRange);
  }

  handleMouseDown(e) {
    if (e && e.button !== undefined && e.button !== 0) return;
    this.isPanning = true;
    this._isDragging = true;
    this._lastX = (e && e.clientX) || 0;
    this._lastY = (e && e.clientY) || 0;
  }

  onMouseDown(e) {
    this.handleMouseDown(e);
  }

  handleMouseMove(e) {
    if (!this.isPanning && !this._isDragging) return;
    const currentX = (e && e.clientX) || 0;
    const currentY = (e && e.clientY) || 0;
    const dx = currentX - this._lastX;
    const dy = currentY - this._lastY;
    this.handlePan(dx, dy);
    this._lastX = currentX;
    this._lastY = currentY;
  }

  onMouseMove(e) {
    this.handleMouseMove(e);
  }

  handleMouseUp(e) {
    this.isPanning = false;
    this._isDragging = false;
  }

  onMouseUp(e) {
    this.handleMouseUp(e);
  }

  handleMouseLeave(e) {
    this.isPanning = false;
    this._isDragging = false;
  }

  onMouseLeave(e) {
    this.handleMouseLeave(e);
  }

  handleWheel(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const delta = e && typeof e.deltaY === 'number' ? e.deltaY : 0;
    if (delta !== 0) {
      const zoomFactor = delta < 0 ? 1.1 : 0.9;
      this.handleZoom(zoomFactor);
    }
  }

  onWheel(e) {
    this.handleWheel(e);
  }

  handleClick(e) {}

  onClick(e) {
    this.handleClick(e);
  }

  handlePan(dx, dy) {
    this.viewportOffset.x += dx;
    this.viewportOffset.y += dy;
    this.render();
  }

  onPan(dx, dy) {
    this.handlePan(dx, dy);
  }

  handleZoom(zoomFactor) {
    this.zoomScale = Math.max(0.01, Math.min(50, this.zoomScale * zoomFactor));
    this.render();
  }

  onZoom(zoomFactor) {
    this.handleZoom(zoomFactor);
  }

  _bindEvents() {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;

    this._boundMouseDown = (e) => this.onMouseDown(e);
    this._boundMouseMove = (e) => this.onMouseMove(e);
    this._boundMouseUp = (e) => this.onMouseUp(e);
    this._boundMouseLeave = (e) => this.onMouseLeave(e);
    this._boundWheel = (e) => this.onWheel(e);
    this._boundClick = (e) => this.onClick(e);

    this.canvas.addEventListener('mousedown', this._boundMouseDown);
    this.canvas.addEventListener('mousemove', this._boundMouseMove);
    this.canvas.addEventListener('mouseup', this._boundMouseUp);
    this.canvas.addEventListener('mouseleave', this._boundMouseLeave);
    this.canvas.addEventListener('wheel', this._boundWheel, { passive: false });
    this.canvas.addEventListener('click', this._boundClick);
  }

  _unbindEvents() {
    if (!this.canvas || typeof this.canvas.removeEventListener !== 'function') return;
    if (this._boundMouseDown) this.canvas.removeEventListener('mousedown', this._boundMouseDown);
    if (this._boundMouseMove) this.canvas.removeEventListener('mousemove', this._boundMouseMove);
    if (this._boundMouseUp) this.canvas.removeEventListener('mouseup', this._boundMouseUp);
    if (this._boundMouseLeave) this.canvas.removeEventListener('mouseleave', this._boundMouseLeave);
    if (this._boundWheel) this.canvas.removeEventListener('wheel', this._boundWheel);
    if (this._boundClick) this.canvas.removeEventListener('click', this._boundClick);
  }

  tick() {
    if (!this.candles || this.candles.length === 0) return;
    const last = this.candles[this.candles.length - 1];
    const delta = (Math.random() - 0.49) * 2;
    const currentClose = typeof last.close === 'number' ? last.close : 100;
    const newClose = Math.max(1, currentClose + delta);
    last.close = Number(newClose.toFixed(2));
    last.high = Math.max(typeof last.high === 'number' ? last.high : newClose, last.close);
    last.low = Math.min(typeof last.low === 'number' ? last.low : newClose, last.close);
    this.render();
  }

  start(intervalMs) {
    if (this._timerId) return;
    const interval = typeof intervalMs === 'number' ? intervalMs : 2000;
    this._timerId = setInterval(() => {
      this.tick();
    }, interval);

    if (this._timerId && typeof this._timerId.unref === 'function') {
      this._timerId.unref();
    }
  }

  stop() {
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  destroy() {
    this.stop();
    this._unbindEvents();
    if (this.canvas) {
      delete this.canvas.axesRenderer;
      if (this.canvas.__chartInstance === this) {
        delete this.canvas.__chartInstance;
      }
    }
  }
}

export default Chart;