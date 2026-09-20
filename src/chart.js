/**
 * SmartTrading-V2 — Charting Engine
 * Implements financial chart rendering, price/time scales, candlestick series,
 * indicator overlays, layout geometry, interactive pan gestures, and canvas zoom.
 * Satisfies STORY 29.4.1 (DF-GRAPHICS-01), STORY 29.2.1 (DF-GESTURE-01),
 * STORY 29.3.1 (DF-GESTURE-02), and STORY 29.6.1 (DF-SCALES-02).
 */

export const PERIOD_DEFAULT = 20;
export const SECTOR_COUNT_MINIMUM = 3;

export const TIME_AXIS_FORMATS = {
  HOURLY: 'HH:mm',
  DAILY: 'YYYY-MM-DD',
  TIME: 'HH:mm',
  DATE: 'YYYY-MM-DD',
};

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
    candles.push({ timestamp, time: timestamp, open, high, low, close });
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
  const baseTime = typeof last.timestamp === 'number' ? last.timestamp : (typeof last.time === 'number' ? last.time : 1711929600000);
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
    result.push({ timestamp, time: timestamp, open, high, low, close });
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
 * Supports both timestamp and time entity properties.
 *
 * @param {Array<Object>} candles
 * @returns {{ priceRange: { min: number, max: number }, timeRange: { min: number, max: number } }}
 */
export function computeCandleRanges(candles = []) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      priceRange: { min: 0, max: 100 },
      timeRange: { min: 0, max: 1 },
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
    const t = c.timestamp !== undefined ? c.timestamp : c.time;
    if (t !== undefined) {
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }
  }

  if (minPrice === Infinity) { minPrice = 0; maxPrice = 100; }
  if (minTime === Infinity) { minTime = 0; maxTime = 1; }
  if (minPrice === maxPrice) { minPrice -= 1; maxPrice += 1; }
  if (minTime === maxTime) { maxTime += 1; }

  return {
    priceRange: { min: minPrice, max: maxPrice },
    timeRange: { min: minTime, max: maxTime },
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
    ctx.beginPath?.();
    ctx.moveTo?.(plotArea.left, y);
    ctx.lineTo?.(plotArea.right, y);
    ctx.stroke?.();
  }

  for (let i = 1; i < steps; i++) {
    const x = plotArea.left + (i / steps) * plotArea.width;
    ctx.beginPath?.();
    ctx.moveTo?.(x, plotArea.top);
    ctx.lineTo?.(x, plotArea.bottom);
    ctx.stroke?.();
  }
  ctx.restore?.();
}

/**
 * Renders vertical price scale along the right edge.
 */
export function renderPriceScale(ctx, plotArea, priceRange, width, height) {
  if (!ctx || !plotArea) return;
  ctx.save?.();

  ctx.beginPath?.();
  ctx.strokeStyle = '#2a2e39';
  ctx.lineWidth = 1;
  ctx.moveTo?.(plotArea.right, 0);
  ctx.lineTo?.(plotArea.right, plotArea.bottom);
  ctx.stroke?.();

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
 * Renders horizontal time scale baseline and timestamp markers anchored within the bottom axis (DF-SCALES-02).
 */
export function renderTimeScale(ctx, plotArea, candles, width, height, reservedBottom = 30) {
  if (!ctx) return;
  const axisLineY = height - reservedBottom;

  ctx.save?.();

  // Baseline separator along bottom boundary
  ctx.beginPath?.();
  ctx.strokeStyle = '#2a2e39';
  ctx.lineWidth = 1;
  ctx.moveTo?.(0, axisLineY);
  ctx.lineTo?.(width, axisLineY);
  ctx.stroke?.();

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

  const firstTime = candles[0].timestamp !== undefined ? candles[0].timestamp : candles[0].time;
  const secondTime = candles[1] ? (candles[1].timestamp !== undefined ? candles[1].timestamp : candles[1].time) : firstTime;
  const isDaily = count > 1 && (secondTime - firstTime >= 86400000);
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

    // Tick marker rendered on bottom axis line
    ctx.beginPath?.();
    ctx.strokeStyle = '#363c4e';
    ctx.lineWidth = 1;
    ctx.moveTo?.(x, axisLineY);
    ctx.lineTo?.(x, axisLineY + 4);
    ctx.stroke?.();

    const timestamp = candle.timestamp !== undefined ? candle.timestamp : candle.time;
    const text = formatTimestamp(timestamp, isDaily);
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
    ctx.beginPath?.();
    ctx.moveTo?.(x, highY);
    ctx.lineTo?.(x, lowY);
    ctx.stroke?.();

    ctx.fillStyle = color;
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(closeY - openY));
    if (typeof ctx.fillRect === 'function') {
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    } else {
      ctx.beginPath?.();
      ctx.moveTo?.(x - candleWidth / 2, bodyTop);
      ctx.lineTo?.(x + candleWidth / 2, bodyTop);
      ctx.lineTo?.(x + candleWidth / 2, bodyTop + bodyHeight);
      ctx.lineTo?.(x - candleWidth / 2, bodyTop + bodyHeight);
      ctx.stroke?.();
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
  ctx.beginPath?.();

  let started = false;
  for (let i = 0; i < count; i++) {
    const val = values[i];
    if (val === null || val === undefined) continue;
    const x = plotArea.left + (i + 0.5) * candleStep;
    const y = toY(val);
    if (!started) {
      ctx.moveTo?.(x, y);
      started = true;
    } else {
      ctx.lineTo?.(x, y);
    }
  }
  if (started) {
    ctx.stroke?.();
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
 * Core quantitative Chart class supporting viewport panning, responsive rendering,
 * horizontal time axis anchoring, and wheel gesture zooming (DF-SCALES-02, DF-GESTURE-02).
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

    let container = options.container || null;
    if (typeof container === 'string' && typeof document !== 'undefined') {
      container = document.querySelector(container);
    }

    if (container) {
      if (!canvas && typeof container.querySelector === 'function') {
        canvas = container.querySelector('canvas');
      }
      if (!canvas && typeof document !== 'undefined' && typeof document.createElement === 'function') {
        canvas = document.createElement('canvas');
        if (typeof container.appendChild === 'function') {
          container.appendChild(canvas);
        }
      }
    }

    this.canvas = canvas;
    this.container = container;
    this.options = options;
    this.width = options.width || (canvas ? canvas.width : 800) || 800;
    this.height = options.height || (canvas ? canvas.height : 600) || 600;

    if (this.canvas) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;

    // Viewport pan state (STORY 29.2.1: DF-GESTURE-01)
    this.viewport = { x: 0, y: 0 };
    this.renderCount = 0;
    this._isDragging = false;
    this._lastDragX = 0;
    this._lastDragY = 0;
    this._eventTarget = null;

    // Zoom level scale and boundary state (STORY 29.3.1: DF-GESTURE-02)
    this.initialZoom = typeof options.initialZoom === 'number'
      ? options.initialZoom
      : typeof options.zoom === 'number'
      ? options.zoom
      : typeof options.scale === 'number'
      ? options.scale
      : 1.0;
    this.scale = this.initialZoom;
    this.minZoom = typeof options.minZoom === 'number' ? options.minZoom : 0.2;
    this.maxZoom = typeof options.maxZoom === 'number' ? options.maxZoom : 5.0;

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
      bottomPadding: reservedBottom,
      leftMargin: 20,
      rightMargin: 65,
      padding: {
        top: 20,
        bottom: reservedBottom,
        left: 20,
        right: 65,
      },
    };

    const initialCandles = options.data !== undefined ? options.data : options.candles;
    this.candles = initialCandles !== undefined ? initialCandles : generateDenseCandles(80);
    this.data = this.candles;
    this.overlayType = options.overlay || 'SMA (20)';

    this.timeScale = { range: { min: 0, max: 1 } };
    this.priceScale = { range: { min: 0, max: 100 } };
    this._recalculateScales();

    if (this.canvas) {
      this._attachEvents(this.canvas);
    }

    this.updatePlotArea();
  }

  getLayout() {
    const bottomPadding = Math.max(
      20,
      this.layout.bottomMargin ?? this.layout.bottomPadding ?? this.layout.padding?.bottom ?? 30
    );
    return {
      ...this.layout,
      bottomPadding,
      bottomMargin: bottomPadding,
      topMargin: this.layout.topMargin ?? 20,
      leftMargin: this.layout.leftMargin ?? 20,
      rightMargin: this.layout.rightMargin ?? 65,
      padding: {
        ...this.layout.padding,
        top: this.layout.topMargin ?? 20,
        bottom: bottomPadding,
        left: this.layout.leftMargin ?? 20,
        right: this.layout.rightMargin ?? 65,
      },
    };
  }

  _recalculateScales() {
    const ranges = computeCandleRanges(this.candles);
    const timeMin = ranges.timeRange.min;
    const timeMax = ranges.timeRange.max;
    const timeCenter = (timeMin + timeMax) / 2;
    const timeSpan = (timeMax - timeMin) / (this.scale || 1.0);

    this.timeScale = {
      range: {
        min: timeCenter - timeSpan / 2,
        max: timeCenter + timeSpan / 2,
      },
    };

    const priceMin = ranges.priceRange.min;
    const priceMax = ranges.priceRange.max;
    const priceCenter = (priceMin + priceMax) / 2;
    const priceSpan = (priceMax - priceMin) / (this.scale || 1.0);

    this.priceScale = {
      range: {
        min: priceCenter - priceSpan / 2,
        max: priceCenter + priceSpan / 2,
      },
    };
  }

  getZoomLevel() {
    return this.scale;
  }

  setZoomLevel(scale) {
    const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, scale));
    if (clamped !== this.scale) {
      this.scale = clamped;
      this._recalculateScales();
      this.render();
      if (typeof this.options?.onZoom === 'function') {
        this.options.onZoom(this.scale);
      }
    }
  }

  getTimeRange() {
    return { ...this.timeScale.range };
  }

  getPriceRange() {
    return { ...this.priceScale.range };
  }

  zoomIn(factor = 1.2) {
    this.setZoomLevel(this.scale * factor);
  }

  zoomOut(factor = 1.2) {
    this.setZoomLevel(this.scale / factor);
  }

  handleWheel(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (!e || e.deltaY === 0 || e.deltaY === undefined) {
      return;
    }
    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    const targetScale = Math.max(this.minZoom, Math.min(this.maxZoom, this.scale * zoomFactor));
    if (targetScale === this.scale) return;
    this.scale = targetScale;
    this._recalculateScales();
    this.render();
    if (typeof this.options?.onZoom === 'function') {
      this.options.onZoom(this.scale);
    }
  }

  _attachEvents(canvas) {
    if (!canvas || typeof canvas.addEventListener !== 'function') return;
    if (this._eventTarget === canvas) return;
    this._detachEvents();
    this._eventTarget = canvas;

    this._onMouseDown = (e) => {
      if (!e || (e.button !== undefined && e.button !== 0)) return;
      this._isDragging = true;
      this._lastDragX = e.clientX ?? 0;
      this._lastDragY = e.clientY ?? 0;
    };

    this._onMouseMove = (e) => {
      if (!this._isDragging || !e) return;
      const clientX = e.clientX ?? 0;
      const clientY = e.clientY ?? 0;
      const dx = clientX - this._lastDragX;
      const dy = clientY - this._lastDragY;
      this._lastDragX = clientX;
      this._lastDragY = clientY;
      this.pan(dx, dy);
    };

    this._onMouseUp = () => {
      this._isDragging = false;
    };

    this._onMouseLeave = () => {
      this._isDragging = false;
    };

    this._onWheel = (e) => {
      this.handleWheel(e);
    };

    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('mouseleave', this._onMouseLeave);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _detachEvents() {
    if (this._eventTarget && typeof this._eventTarget.removeEventListener === 'function') {
      if (this._onMouseDown) this._eventTarget.removeEventListener('mousedown', this._onMouseDown);
      if (this._onMouseMove) this._eventTarget.removeEventListener('mousemove', this._onMouseMove);
      if (this._onMouseUp) this._eventTarget.removeEventListener('mouseup', this._onMouseUp);
      if (this._onMouseLeave) this._eventTarget.removeEventListener('mouseleave', this._onMouseLeave);
      if (this._onWheel) this._eventTarget.removeEventListener('wheel', this._onWheel);
    }
    this._eventTarget = null;
    this._isDragging = false;
  }

  destroy() {
    this._detachEvents();
  }

  getViewportOffset() {
    return { x: this.viewport.x, y: this.viewport.y };
  }

  setViewportOffset(x, y) {
    this.viewport.x = typeof x === 'number' && !isNaN(x) ? x : 0;
    this.viewport.y = typeof y === 'number' && !isNaN(y) ? y : 0;
    this.render();
  }

  pan(dx, dy) {
    const deltaX = typeof dx === 'number' && !isNaN(dx) ? dx : 0;
    const deltaY = typeof dy === 'number' && !isNaN(dy) ? dy : 0;
    this.viewport.x += deltaX;
    this.viewport.y += deltaY;
    this.render();
  }

  resetViewport() {
    this.viewport.x = 0;
    this.viewport.y = 0;
    this.scale = this.initialZoom || 1.0;
    this._recalculateScales();
    this.render();
  }

  mount(target) {
    const canvasElement = target && (target.getContext || target.tagName === 'CANVAS')
      ? target
      : target && typeof target.querySelector === 'function'
      ? target.querySelector('canvas')
      : this.canvas;

    if (canvasElement) {
      if (this.canvas !== canvasElement) {
        this._detachEvents();
        this.canvas = canvasElement;
        this._attachEvents(this.canvas);
      }
      if (typeof canvasElement.getContext === 'function') {
        this.ctx = canvasElement.getContext('2d');
      }
    } else if (this.canvas && typeof this.canvas.getContext === 'function') {
      this.ctx = this.canvas.getContext('2d');
      if (!this._eventTarget) {
        this._attachEvents(this.canvas);
      }
    }

    if (!this.candles || (this.candles.length === 0 && this.options.data === undefined)) {
      this.candles = generateDenseCandles(80);
      this.data = this.candles;
    }

    this.updatePlotArea();
    this._recalculateScales();
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
        candle: c,
      };
    });
  }

  updatePlotArea() {
    const w = (this.canvas && this.canvas.width) || this.width || 800;
    const h = (this.canvas && this.canvas.height) || this.height || 600;
    const reservedBottom = this.layout.bottomMargin ?? this.layout.bottomPadding ?? this.layout.padding.bottom;
    const reservedTop = this.layout.topMargin ?? this.layout.padding.top;
    const reservedLeft = this.layout.leftMargin ?? this.layout.padding.left;
    const reservedRight = this.layout.rightMargin ?? this.layout.padding.right;

    this.plotArea = {
      top: reservedTop,
      left: reservedLeft,
      bottom: h - reservedBottom,
      right: w - reservedRight,
      width: Math.max(10, w - reservedLeft - reservedRight),
      height: Math.max(10, h - reservedTop - reservedBottom),
    };
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
    this._recalculateScales();
    this.render();
  }

  /**
   * Synchronously updates timeseries or candlestick dataset and redraws time axis (DF-SCALES-02).
   *
   * @param {Array<Object>} candles New candlestick timeseries domain
   */
  updateData(candles) {
    this.candles = Array.isArray(candles) ? [...candles] : [];
    this.data = this.candles;
    this._recalculateScales();
    this.render();
  }

  setOverlay(type) {
    this.overlayType = type;
    this.render();
  }

  render() {
    if (!this.canvas && this.container && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      if (typeof this.container.appendChild === 'function') {
        this.container.appendChild(this.canvas);
      }
      this.ctx = typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;
      this._attachEvents(this.canvas);
    }

    const ctx = this.ctx || (this.canvas && this.canvas.getContext && this.canvas.getContext('2d'));
    if (!ctx) return;

    this.renderCount++;
    this.updatePlotArea();
    const w = (this.canvas && this.canvas.width) || this.width || 800;
    const h = (this.canvas && this.canvas.height) || this.height || 600;
    const reservedBottom = this.layout.bottomMargin ?? this.layout.bottomPadding ?? this.layout.padding.bottom;

    if (typeof ctx.setTransform === 'function') {
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } catch {}
    }
    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, w, h);
    }

    const priceRange = this.getPriceRange();

    // 1. Grid lines
    renderGrid(ctx, this.plotArea, w, h);

    // 2. Candlestick series and indicator overlay inside viewport transform
    if (typeof ctx.save === 'function') ctx.save();
    if (typeof ctx.translate === 'function') {
      try {
        ctx.translate(this.viewport.x, this.viewport.y);
      } catch {}
    }

    renderCandlesticksSeries(ctx, this.plotArea, this.candles, priceRange);

    if (this.overlayType && this.overlayType !== 'None') {
      renderOverlay(ctx, this.plotArea, this.candles, priceRange, this.overlayType);
    }

    if (typeof ctx.restore === 'function') ctx.restore();

    // 3. Vertical price scale along the right boundary
    renderPriceScale(ctx, this.plotArea, priceRange, w, h);

    // 4. Horizontal time scale axis anchored along the bottom boundary above the fold (DF-SCALES-02)
    renderTimeScale(ctx, this.plotArea, this.candles, w, h, reservedBottom);
  }
}

export default Chart;