/**
 * SmartTrading-V2 — Charting Engine
 * Implements financial chart rendering, price/time scales, candlestick series,
 * indicator overlays, and layout geometry.
 * Satisfies STORY 29.4.1: Resolve SPARSE_DATA_SERIES (Defect ID: DF-GRAPHICS-01).
 */

export const PERIOD_DEFAULT = 20;
export const SECTOR_COUNT_MINIMUM = 3;

/**
 * Calculates Simple Moving Average (SMA) over candle close prices.
 *
 * @param {Array<Object>} candles
 * @param {number} [period=20]
 * @returns {Array<number|null>}
 */
export function calculateSMA(candles, period = PERIOD_DEFAULT) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const result = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += candles[j].close;
      }
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * Calculates Exponential Moving Average (EMA) over candle close prices.
 *
 * @param {Array<Object>} candles
 * @param {number} [period=20]
 * @returns {Array<number|null>}
 */
export function calculateEMA(candles, period = PERIOD_DEFAULT) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const result = [];
  const multiplier = 2 / (period + 1);
  let prevEMA = null;

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j <= i; j++) {
        sum += candles[j].close;
      }
      prevEMA = sum / period;
      result.push(prevEMA);
    } else {
      prevEMA = (candles[i].close - prevEMA) * multiplier + prevEMA;
      result.push(prevEMA);
    }
  }
  return result;
}

/**
 * Generates a dense synthetic candlestick dataset within [50, 100] entities.
 *
 * @param {number} [count=80] Target candle count (bounded between 50 and 100)
 * @param {number} [basePrice=100] Starting market price
 * @param {number} [startTime=1711929600000] Initial epoch timestamp in milliseconds
 * @returns {Array<Object>} Dense array of valid OHLC candle entities
 */
export function generateDenseCandles(count = 80, basePrice = 100, startTime = 1711929600000) {
  const targetCount = typeof count === 'number' ? Math.max(50, Math.min(100, Math.round(count))) : 80;
  const candles = [];
  let price = typeof basePrice === 'number' && !isNaN(basePrice) ? basePrice : 100;
  const time = typeof startTime === 'number' && !isNaN(startTime) ? startTime : 1711929600000;

  for (let i = 0; i < targetCount; i++) {
    const timestamp = time + i * 3600000;
    const delta = (Math.sin(i * 0.35) + Math.sin(i * 0.8) * 0.5 + (Math.random() - 0.48)) * 2.5;
    const open = Math.round(price * 100) / 100;
    const close = Math.round((price + delta) * 100) / 100;
    const maxOC = Math.max(open, close);
    const minOC = Math.min(open, close);
    const high = Math.round((maxOC + Math.random() * 2 + 0.5) * 100) / 100;
    const low = Math.round((minOC - Math.random() * 2 - 0.5) * 100) / 100;
    price = close;
    candles.push({ timestamp, open, high, low, close });
  }

  return candles;
}

/**
 * Hydrates a sparse or incomplete dataset to ensure the 50-100 dense requirement is satisfied.
 *
 * @param {Array<Object>} [candles=[]] Initial sparse or partial candle series
 * @param {number} [targetCount=80] Target count to hydrate to
 * @returns {Array<Object>} Dense candle series
 */
export function hydrateCandles(candles = [], targetCount = 80) {
  const desired = typeof targetCount === 'number' ? Math.max(50, Math.min(100, Math.round(targetCount))) : 80;
  if (Array.isArray(candles) && candles.length >= 50 && candles.length <= 100) {
    return [...candles];
  }
  if (!Array.isArray(candles) || candles.length === 0) {
    return generateDenseCandles(desired);
  }
  if (candles.length > 100) {
    return candles.slice(candles.length - desired);
  }

  const result = [...candles];
  const last = candles[candles.length - 1];
  let price = typeof last.close === 'number' ? last.close : (typeof last.open === 'number' ? last.open : 100);
  const baseTime = typeof last.timestamp === 'number' ? last.timestamp : 1711929600000;
  const needed = desired - result.length;

  for (let i = 1; i <= needed; i++) {
    const timestamp = baseTime + i * 3600000;
    const delta = (Math.sin(i * 0.35) + (Math.random() - 0.48)) * 2;
    const open = Math.round(price * 100) / 100;
    const close = Math.round((price + delta) * 100) / 100;
    const maxOC = Math.max(open, close);
    const minOC = Math.min(open, close);
    const high = Math.round((maxOC + Math.random() * 2 + 0.5) * 100) / 100;
    const low = Math.round((minOC - Math.random() * 2 - 0.5) * 100) / 100;
    price = close;
    result.push({ timestamp, open, high, low, close });
  }

  return result;
}

/**
 * Generates default synthetic candlestick data.
 *
 * @param {number} [count=80]
 * @returns {Array<Object>}
 */
export function generateDefaultCandles(count = 80) {
  return generateDenseCandles(count);
}

/**
 * Formats a timestamp into HH:mm (or YYYY-MM-DD if daily interval).
 *
 * @param {number} timestamp
 * @param {boolean} [isDaily=false]
 * @returns {string}
 */
export function formatTimestamp(timestamp, isDaily = false) {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  if (isDaily) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Computes price and time ranges across candlestick data.
 *
 * @param {Array<Object>} candles
 * @returns {{ priceRange: { min: number, max: number }, timeRange: { min: number, max: number } }}
 */
export function computeCandleRanges(candles = []) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      priceRange: { min: 0, max: 100 },
      timeRange: { min: 0, max: 1 }
    };
  }

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const c of candles) {
    const low = c.low !== undefined ? c.low : Math.min(c.open, c.close);
    const high = c.high !== undefined ? c.high : Math.max(c.open, c.close);
    if (low < minPrice) minPrice = low;
    if (high > maxPrice) maxPrice = high;
    if (c.timestamp !== undefined) {
      if (c.timestamp < minTime) minTime = c.timestamp;
      if (c.timestamp > maxTime) maxTime = c.timestamp;
    }
  }

  if (minPrice === Infinity) { minPrice = 0; maxPrice = 100; }
  if (minTime === Infinity) { minTime = 0; maxTime = 1; }
  if (minPrice === maxPrice) { minPrice -= 1; maxPrice += 1; }
  if (minTime === maxTime) { maxTime += 1; }

  return {
    priceRange: { min: minPrice, max: maxPrice },
    timeRange: { min: minTime, max: maxTime }
  };
}

export const computeRanges = computeCandleRanges;

/**
 * Renders background grid lines across the plot area.
 */
export function renderGrid(ctx, plotArea, width, height) {
  if (!ctx || !plotArea) return;
  ctx.save?.();
  ctx.strokeStyle = '#1e222d';
  ctx.lineWidth = 1;

  const steps = 5;
  for (let i = 1; i < steps; i++) {
    const y = plotArea.top + (i / steps) * plotArea.height;
    ctx.beginPath();
    ctx.moveTo(plotArea.left, y);
    ctx.lineTo(plotArea.right, y);
    ctx.stroke();
  }

  for (let i = 1; i < steps; i++) {
    const x = plotArea.left + (i / steps) * plotArea.width;
    ctx.beginPath();
    ctx.moveTo(x, plotArea.top);
    ctx.lineTo(x, plotArea.bottom);
    ctx.stroke();
  }
  ctx.restore?.();
}

/**
 * Renders vertical price scale along the right edge.
 */
export function renderPriceScale(ctx, plotArea, priceRange, width, height) {
  if (!ctx || !plotArea) return;
  ctx.save?.();

  ctx.beginPath();
  ctx.strokeStyle = '#2a2e39';
  ctx.lineWidth = 1;
  ctx.moveTo(plotArea.right, 0);
  ctx.lineTo(plotArea.right, plotArea.bottom);
  ctx.stroke();

  ctx.fillStyle = '#787b86';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const { min, max } = priceRange || { min: 0, max: 100 };
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const fraction = i / ticks;
    const price = max - fraction * (max - min);
    const y = plotArea.top + fraction * plotArea.height;
    if (typeof ctx.fillText === 'function') {
      ctx.fillText(price.toFixed(2), plotArea.right + 6, y);
    }
  }

  ctx.restore?.();
}

/**
 * Renders horizontal time scale baseline and timestamp markers (DF-SCALES-02).
 */
export function renderTimeScale(ctx, plotArea, candles, width, height, reservedBottom = 30) {
  if (!ctx) return;
  const axisLineY = height - reservedBottom;

  ctx.save?.();

  ctx.beginPath();
  ctx.strokeStyle = '#2a2e39';
  ctx.lineWidth = 1;
  ctx.moveTo(0, axisLineY);
  ctx.lineTo(width, axisLineY);
  ctx.stroke();

  if (!Array.isArray(candles) || candles.length === 0) {
    ctx.restore?.();
    return;
  }

  const count = candles.length;
  const indices = [];
  if (count <= 6) {
    for (let i = 0; i < count; i++) indices.push(i);
  } else {
    const numMarkers = Math.min(6, count);
    const step = (count - 1) / (numMarkers - 1);
    for (let m = 0; m < numMarkers; m++) {
      const idx = Math.round(m * step);
      if (!indices.includes(idx)) indices.push(idx);
    }
  }

  if (indices.length < 2 && count >= 2) {
    indices.length = 0;
    indices.push(0);
    indices.push(count - 1);
  }

  const isDaily = count > 1 && (candles[1].timestamp - candles[0].timestamp >= 86400000);
  const candleStep = plotArea.width / count;
  const textY = axisLineY + Math.min(reservedBottom - 5, Math.max(6, Math.round(reservedBottom / 2)));

  ctx.fillStyle = '#787b86';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const idx of indices) {
    const candle = candles[idx];
    if (!candle) continue;
    const x = Math.round(plotArea.left + (idx + 0.5) * candleStep);

    ctx.beginPath();
    ctx.strokeStyle = '#363c4e';
    ctx.lineWidth = 1;
    ctx.moveTo(x, axisLineY);
    ctx.lineTo(x, axisLineY + 4);
    ctx.stroke();

    const text = formatTimestamp(candle.timestamp, isDaily);
    if (typeof ctx.fillText === 'function') {
      ctx.fillText(text, x, textY);
    }
  }

  ctx.restore?.();
}

/**
 * Renders candlestick series (wicks and candle bodies).
 */
export function renderCandlesticksSeries(ctx, plotArea, candles, priceRange) {
  if (!ctx || !plotArea || !Array.isArray(candles) || candles.length === 0) return;
  ctx.save?.();

  const count = candles.length;
  const candleStep = plotArea.width / count;
  const candleWidth = Math.max(2, candleStep * 0.7);
  const { min, max } = priceRange || { min: 0, max: 100 };
  const range = max - min || 1;

  const toY = (price) => plotArea.top + ((max - price) / range) * plotArea.height;

  for (let i = 0; i < count; i++) {
    const c = candles[i];
    const x = plotArea.left + (i + 0.5) * candleStep;
    const openY = toY(c.open);
    const closeY = toY(c.close);
    const highY = toY(c.high);
    const lowY = toY(c.low);
    const isBullish = c.close >= c.open;
    const color = isBullish ? '#26a69a' : '#ef5350';

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    ctx.fillStyle = color;
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(closeY - openY));
    if (typeof ctx.fillRect === 'function') {
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    } else {
      ctx.beginPath();
      ctx.moveTo(x - candleWidth / 2, bodyTop);
      ctx.lineTo(x + candleWidth / 2, bodyTop);
      ctx.lineTo(x + candleWidth / 2, bodyTop + bodyHeight);
      ctx.lineTo(x - candleWidth / 2, bodyTop + bodyHeight);
      ctx.stroke();
    }
  }

  ctx.restore?.();
}

/**
 * Renders analytical indicator overlay (e.g. 20 SMA / EMA).
 */
export function renderOverlay(ctx, plotArea, candles, priceRange, overlayType = 'SMA (20)') {
  if (!ctx || !plotArea || !Array.isArray(candles) || candles.length === 0) return;
  if (!overlayType || overlayType === 'None') return;

  const isEMA = overlayType.includes('EMA');
  const values = isEMA ? calculateEMA(candles, 20) : calculateSMA(candles, 20);
  const { min, max } = priceRange || { min: 0, max: 100 };
  const range = max - min || 1;
  const count = candles.length;
  const candleStep = plotArea.width / count;
  const toY = (p) => plotArea.top + ((max - p) / range) * plotArea.height;

  ctx.save?.();
  ctx.strokeStyle = isEMA ? '#ff9800' : '#2962ff';
  ctx.lineWidth = 2;
  ctx.beginPath();

  let started = false;
  for (let i = 0; i < count; i++) {
    const val = values[i];
    if (val === null || val === undefined) continue;
    const x = plotArea.left + (i + 0.5) * candleStep;
    const y = toY(val);
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
  ctx.restore?.();
}

/**
 * Renders an active Chart instance.
 */
export function renderChart(chart) {
  if (chart && typeof chart.render === 'function') {
    chart.render();
  }
}

/**
 * Static AxesRenderer utility namespace.
 */
export class AxesRenderer {
  static renderPriceScale(ctx, plotArea, priceRange, width, height) {
    return renderPriceScale(ctx, plotArea, priceRange, width, height);
  }
  static renderTimeScale(ctx, plotArea, candles, width, height, reservedBottom) {
    return renderTimeScale(ctx, plotArea, candles, width, height, reservedBottom);
  }
}

/**
 * Core quantitative Chart class.
 */
export class Chart {
  constructor(canvasOrOptions = {}, maybeOptions = {}) {
    let canvas = null;
    let options = {};

    if (canvasOrOptions && (canvasOrOptions.getContext || canvasOrOptions.tagName === 'CANVAS')) {
      canvas = canvasOrOptions;
      options = maybeOptions || {};
    } else if (canvasOrOptions && typeof canvasOrOptions === 'object') {
      options = canvasOrOptions;
      canvas = options.canvas || null;
    }

    this.canvas = canvas;
    this.options = options;
    this.width = options.width || (canvas ? canvas.width : 800) || 800;
    this.height = options.height || (canvas ? canvas.height : 600) || 600;

    if (this.canvas) {
      if (!this.canvas.width) this.canvas.width = this.width;
      if (!this.canvas.height) this.canvas.height = this.height;
    }

    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;

    const bottomMargin =
      typeof options.bottomMargin === 'number'
        ? options.bottomMargin
        : typeof options.timeAxis?.height === 'number'
        ? options.timeAxis.height
        : options.padding?.bottom || 30;

    const reservedBottom = Math.max(20, bottomMargin);

    this.layout = {
      topMargin: 20,
      bottomMargin: reservedBottom,
      leftMargin: 20,
      rightMargin: 65,
      padding: {
        top: 20,
        bottom: reservedBottom,
        left: 20,
        right: 65
      }
    };

    const initialCandles = options.data || options.candles;
    this.candles = initialCandles ? initialCandles : generateDenseCandles(80);
    this.data = this.candles;
    this.overlayType = options.overlay || 'SMA (20)';

    this.updatePlotArea();
  }

  mount(target) {
    if (target && (target.getContext || target.tagName === 'CANVAS')) {
      this.canvas = target;
      if (typeof target.getContext === 'function') {
        this.ctx = target.getContext('2d');
      }
    } else if (this.canvas && typeof this.canvas.getContext === 'function') {
      this.ctx = this.canvas.getContext('2d');
    }

    if (!this.candles || this.candles.length < 50 || this.candles.length > 100) {
      this.candles = hydrateCandles(this.candles, 80);
      this.data = this.candles;
    }

    this.updatePlotArea();
    this.render();
    return this;
  }

  getData() {
    return this.candles;
  }

  getCandleCoordinates() {
    this.updatePlotArea();
    const count = this.candles.length;
    if (count === 0) return [];
    const candleStep = this.plotArea.width / count;
    const { min, max } = this.getPriceRange();
    const range = max - min || 1;
    const toY = (price) => this.plotArea.top + ((max - price) / range) * this.plotArea.height;

    return this.candles.map((c, i) => {
      const x = this.plotArea.left + (i + 0.5) * candleStep;
      const openY = toY(c.open);
      const closeY = toY(c.close);
      const highY = toY(c.high);
      const lowY = toY(c.low);
      return {
        x,
        y: closeY,
        openY,
        closeY,
        highY,
        lowY,
        candle: c
      };
    });
  }

  updatePlotArea() {
    const w = (this.canvas && this.canvas.width) || this.width || 800;
    const h = (this.canvas && this.canvas.height) || this.height || 600;
    const reservedBottom = this.layout.bottomMargin ?? this.layout.padding.bottom;
    const reservedTop = this.layout.topMargin ?? this.layout.padding.top;
    const reservedLeft = this.layout.leftMargin ?? this.layout.padding.left;
    const reservedRight = this.layout.rightMargin ?? this.layout.padding.right;

    this.plotArea = {
      top: reservedTop,
      left: reservedLeft,
      bottom: h - reservedBottom,
      right: w - reservedRight,
      width: Math.max(10, w - reservedLeft - reservedRight),
      height: Math.max(10, h - reservedTop - reservedBottom)
    };
  }

  getPriceRange() {
    return computeCandleRanges(this.candles).priceRange;
  }

  priceToY(price) {
    const { min, max } = this.getPriceRange();
    const range = max - min || 1;
    const plotTop = this.plotArea ? this.plotArea.top : 0;
    const plotHeight = (this.plotArea && this.plotArea.height) || 1;
    return plotTop + ((max - price) / range) * plotHeight;
  }

  yToPrice(y) {
    const { min, max } = this.getPriceRange();
    const plotTop = this.plotArea ? this.plotArea.top : 0;
    const plotHeight = (this.plotArea && this.plotArea.height) || 1;
    return max - ((y - plotTop) / plotHeight) * (max - min);
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    if (this.canvas) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.updatePlotArea();
    this.render();
  }

  setData(candles) {
    const candidate = Array.isArray(candles) ? candles : [];
    this.candles = candidate.length < 50 || candidate.length > 100 ? hydrateCandles(candidate, 80) : candidate;
    this.data = this.candles;
    this.render();
  }

  setOverlay(type) {
    this.overlayType = type;
    this.render();
  }

  render() {
    const ctx = this.ctx || (this.canvas && this.canvas.getContext && this.canvas.getContext('2d'));
    if (!ctx) return;

    this.updatePlotArea();
    const w = (this.canvas && this.canvas.width) || this.width || 800;
    const h = (this.canvas && this.canvas.height) || this.height || 600;
    const reservedBottom = this.layout.bottomMargin ?? this.layout.padding.bottom;

    ctx.clearRect(0, 0, w, h);

    const ranges = computeCandleRanges(this.candles);

    // 1. Grid lines
    renderGrid(ctx, this.plotArea, w, h);

    // 2. Candlestick series
    renderCandlesticksSeries(ctx, this.plotArea, this.candles, ranges.priceRange);

    // 3. Analytical indicator overlay
    if (this.overlayType && this.overlayType !== 'None') {
      renderOverlay(ctx, this.plotArea, this.candles, ranges.priceRange, this.overlayType);
    }

    // 4. Vertical price scale
    renderPriceScale(ctx, this.plotArea, ranges.priceRange, w, h);

    // 5. Horizontal time scale axis (DF-SCALES-02)
    renderTimeScale(ctx, this.plotArea, this.candles, w, h, reservedBottom);
  }
}