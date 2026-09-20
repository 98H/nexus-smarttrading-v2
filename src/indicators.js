/**
 * SmartTrading-V2 — Analytical Indicators & Visual Overlays
 * Provides technical indicator calculations (SMA, EMA), DOM legend rendering,
 * and canvas path stroke operations for price trendline overlays.
 * Satisfies STORY 30.5.1 (DF-OVERLAYS-01: Resolve MISSING_ANALYTICAL_OVERLAYS).
 */

/**
 * Extracts a numeric close price from a data point object or raw number.
 *
 * @param {Object|number} item
 * @returns {number}
 */
export function getClosePrice(item) {
  if (item === null || item === undefined) return NaN;
  if (typeof item === 'number') return item;
  if (typeof item === 'object') {
    if (typeof item.close === 'number') return item.close;
    if (typeof item.price === 'number') return item.price;
    if (typeof item.value === 'number') return item.value;
  }
  return Number(item);
}

/**
 * Calculates a Simple Moving Average (SMA) series for the given price window.
 * Returns an array of identical length to `series`. Indices prior to window satisfaction are `null`.
 *
 * @param {Array<Object|number>} series Price history series
 * @param {number} [period=20] SMA window period
 * @returns {Array<number|null>} Calculated SMA values
 */
export function calculateSMA(series, period = 20) {
  if (!Array.isArray(series)) return [];
  const len = series.length;
  const result = new Array(len).fill(null);
  if (len < period || period <= 0) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += getClosePrice(series[i]);
  }
  result[period - 1] = sum / period;

  for (let i = period; i < len; i++) {
    sum += getClosePrice(series[i]) - getClosePrice(series[i - period]);
    result[i] = sum / period;
  }

  return result;
}

/**
 * Calculates an Exponential Moving Average (EMA) series for the given price window.
 * The initial EMA value is the SMA of the first `period` bars.
 * Subsequent bars follow standard exponential smoothing: EMA_t = Price_t * k + EMA_(t-1) * (1 - k).
 *
 * @param {Array<Object|number>} series Price history series
 * @param {number} [period=20] EMA window period
 * @returns {Array<number|null>} Calculated EMA values
 */
export function calculateEMA(series, period = 20) {
  if (!Array.isArray(series)) return [];
  const len = series.length;
  const result = new Array(len).fill(null);
  if (len < period || period <= 0) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += getClosePrice(series[i]);
  }
  const initialSMA = sum / period;
  result[period - 1] = initialSMA;

  const k = 2 / (period + 1);
  let prevEMA = initialSMA;

  for (let i = period; i < len; i++) {
    const currentPrice = getClosePrice(series[i]);
    const currentEMA = currentPrice * k + prevEMA * (1 - k);
    result[i] = currentEMA;
    prevEMA = currentEMA;
  }

  return result;
}

/**
 * Renders an indicator overlay trendline onto an active 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx Active 2D rendering context
 * @param {Array<number|null>} indicatorValues Computed indicator values
 * @param {Array<{x: number, y: number}>} coordinates Mapped screen coordinates
 * @param {Object} [options={}] Line rendering styles
 */
export function renderOverlay(ctx, indicatorValues, coordinates, options = {}) {
  if (!ctx || !Array.isArray(indicatorValues) || !Array.isArray(coordinates)) {
    return;
  }

  const color = options.color || '#2196F3';
  const lineWidth = options.lineWidth || 1.5;

  ctx.beginPath();
  if (ctx.strokeStyle !== undefined) ctx.strokeStyle = color;
  if (ctx.lineWidth !== undefined) ctx.lineWidth = lineWidth;

  let started = false;
  const count = Math.min(indicatorValues.length, coordinates.length);

  for (let i = 0; i < count; i++) {
    const val = indicatorValues[i];
    const coord = coordinates[i];

    if (val !== null && val !== undefined && !Number.isNaN(val) && coord) {
      if (!started) {
        ctx.moveTo(coord.x, coord.y);
        started = true;
      } else {
        ctx.lineTo(coord.x, coord.y);
      }
    } else {
      started = false;
    }
  }

  ctx.stroke();
}

/**
 * Instantiates an indicator legend element and mounts it into the specified container.
 *
 * @param {HTMLElement|Object} container Target container (e.g. .chart-header)
 * @param {Object} [options={}] Configuration options
 * @returns {HTMLElement|Object} Created legend element
 */
export function createIndicatorLegend(container, options = {}) {
  const { id = 'ema-20', label = 'EMA (20)', color = '#FF9800' } = options;

  let legendElement = null;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    legendElement = document.createElement('div');
  } else {
    legendElement = {
      tagName: 'DIV',
      className: '',
      children: [],
      style: {},
      dataset: {},
    };
  }

  legendElement.id = id;
  legendElement.className = 'indicator-legend';
  legendElement._label = label;
  legendElement._color = color;
  legendElement.textContent = label;

  if (legendElement.style) {
    legendElement.style.color = color;
    legendElement.style.fontSize = '12px';
    legendElement.style.fontWeight = '500';
    legendElement.style.display = 'inline-flex';
    legendElement.style.alignItems = 'center';
    legendElement.style.gap = '6px';
  }

  if (container && typeof container.appendChild === 'function') {
    container.appendChild(legendElement);
  }

  return legendElement;
}

/**
 * Updates the text content of an indicator legend element with the latest computed value.
 *
 * @param {HTMLElement|Object} legendElement Legend element to update
 * @param {number|null} value Latest calculated indicator value
 */
export function updateIndicatorLegend(legendElement, value) {
  if (!legendElement) return;
  const label = legendElement._label || 'EMA (20)';

  if (value === null || value === undefined || Number.isNaN(value)) {
    legendElement.textContent = label;
  } else {
    const formatted = typeof value === 'number' ? value.toFixed(2) : String(value);
    legendElement.textContent = `${label}: ${formatted}`;
  }
}