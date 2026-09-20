/**
 * SmartTrading-V2 — Coordinate Axes Renderer
 * Handles rendering of background coordinate gridlines, right-hand vertical price scale,
 * and bottom horizontal time scale across active candlestick chart areas.
 * Satisfies STORY 2.3.1 (DF-SCALES-01), STORY 31.3.1 (DF-SCALES-02),
 * STORY 36.1.1 (MISSING_HORIZONTAL_TIME_AXIS), and STORY 40.2.1 (Resolve TIME_AXIS_TEXT_CLUMPING).
 */

/**
 * Formats a numeric timestamp into a readable date/time marker string.
 *
 * @param {number} timestamp - Unix epoch in seconds or milliseconds
 * @param {boolean} [isDaily=false] - Whether the time span spans multiple days
 * @returns {string} Formatted timestamp marker (HH:mm or YYYY-MM-DD)
 */
export function formatTimestamp(timestamp, isDaily = false) {
  const t = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  const validTime = Number.isFinite(t) ? t : Date.now();
  const date = new Date(validTime);

  if (Number.isNaN(date.getTime())) {
    return String(Math.round(timestamp));
  }

  if (isDaily) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Calculates time axis tick positions and timestamps scaled dynamically across [plotLeft, plotRight].
 * Resolves TIME_AXIS_TEXT_CLUMPING (STORY 40.2.1).
 *
 * @param {Object} [optionsOrRange={}]
 * @param {Object} [maybePlotArea=null]
 * @param {number} [maybeCandleCount=null]
 * @returns {Array<{ x: number, time: number, label: string, index: number }>}
 */
export function calculateTimeTicks(optionsOrRange = {}, maybePlotArea = null, maybeCandleCount = null) {
  let opts = {};
  if (Array.isArray(optionsOrRange)) {
    opts = { candles: optionsOrRange, candleCount: optionsOrRange.length };
    if (maybePlotArea) opts.plotArea = maybePlotArea;
    if (typeof maybeCandleCount === 'number') opts.candleCount = maybeCandleCount;
  } else if (typeof optionsOrRange === 'object' && optionsOrRange !== null) {
    opts = { ...optionsOrRange };
    if (maybePlotArea && typeof maybePlotArea === 'object') {
      opts.plotArea = maybePlotArea;
    }
    if (typeof maybeCandleCount === 'number') {
      opts.candleCount = maybeCandleCount;
    }
  }

  const plotArea = opts.plotArea || { top: 0, left: 0, width: 730, height: 550 };
  const plotLeft = opts.plotLeft !== undefined ? opts.plotLeft : (plotArea.left || 0);
  const plotWidth = opts.plotWidth !== undefined ? opts.plotWidth : (plotArea.width || 730);
  const plotRight = opts.plotRight !== undefined ? opts.plotRight : (plotLeft + plotWidth);

  let min = opts.min !== undefined ? opts.min : (opts.timeRange ? opts.timeRange.min : 1700000000);
  let max = opts.max !== undefined ? opts.max : (opts.timeRange ? opts.timeRange.max : 1700086400);

  const candles = opts.candles || null;
  let candleCount = typeof opts.candleCount === 'number'
    ? opts.candleCount
    : (candles && Array.isArray(candles) ? candles.length : (opts.count || 0));

  if (typeof min === 'string' || min instanceof Date) {
    const parsed = new Date(min).getTime();
    if (!Number.isNaN(parsed)) min = parsed;
  }
  if (typeof max === 'string' || max instanceof Date) {
    const parsed = new Date(max).getTime();
    if (!Number.isNaN(parsed)) max = parsed;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 1700000000;
    max = 1700086400;
  }

  if (min === max) {
    const delta = min > 1e11 ? 60000 : 60;
    min -= delta;
    max += delta;
  } else if (min > max) {
    const tmp = min;
    min = max;
    max = tmp;
  }

  const span = Math.abs(max - min);
  const spanMs = span < 1e11 ? span * 1000 : span;
  const isDaily = spanMs >= 86400000 * 2;

  const printableWidth = Math.max(0, plotRight - plotLeft);
  const minTickSpacing = opts.minSpacing || 80;
  const maxTicks = opts.maxTicks || (printableWidth > 0 ? Math.min(8, Math.max(3, Math.floor(printableWidth / minTickSpacing) + 1)) : 5);

  let numTicks = maxTicks;
  if (candleCount > 1 && candleCount < numTicks) {
    numTicks = Math.max(3, candleCount);
  }
  numTicks = Math.max(3, numTicks);
  const steps = numTicks - 1;

  const ticks = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = steps > 0 ? i / steps : 0;
    let x = plotLeft + ratio * printableWidth;
    let timeVal = min + ratio * (max - min);

    if (candleCount > 1) {
      const candleIndex = Math.round(ratio * (candleCount - 1));
      const candleRatio = (candleCount - 1 > 0) ? candleIndex / (candleCount - 1) : ratio;
      x = plotLeft + candleRatio * printableWidth;

      if (candles && candles[candleIndex]) {
        const c = candles[candleIndex];
        const t = c.time ?? c.timestamp ?? c.t ?? c.date;
        if (t !== undefined) {
          timeVal = typeof t === 'string' ? new Date(t).getTime() : t;
        }
      } else {
        timeVal = min + candleRatio * (max - min);
      }
    }

    const label = formatTimestamp(timeVal, isDaily);
    ticks.push({
      x,
      time: timeVal,
      label,
      index: i,
    });
  }

  return ticks;
}

/**
 * Synchronizes and updates the DOM-based time axis track container with formatted marker spans.
 *
 * @param {HTMLElement|Object} trackElement - Bottom axis DOM container
 * @param {{ min: number, max: number }} timeRange - Domain time bounds
 * @param {number} [steps=5] - Number of scale divisions
 */
export function updateDOMTimeAxisTrack(trackElement, timeRange, steps = 5) {
  if (!trackElement) return;
  const { min, max } = timeRange || { min: 1700000000, max: 1700086400 };
  const span = Math.abs(max - min);
  const spanMs = span < 1e11 ? span * 1000 : span;
  const isDaily = spanMs >= 86400000 * 2;

  if (trackElement.style) {
    trackElement.style.display = 'flex';
    trackElement.style.justifyContent = 'space-between';
    trackElement.style.alignItems = 'center';
    trackElement.style.width = trackElement.style.width || '100%';
    trackElement.style.boxSizing = 'border-box';
  }

  if (typeof trackElement.removeChild === 'function') {
    while (trackElement.firstChild) {
      trackElement.removeChild(trackElement.firstChild);
    }
    while (trackElement.children && trackElement.children.length > 0) {
      trackElement.removeChild(trackElement.children[0]);
    }
  } else if (Array.isArray(trackElement.children)) {
    trackElement.children.length = 0;
  }

  const labels = [];
  for (let i = 0; i <= steps; i++) {
    const timeVal = min + ((max - min) * i) / steps;
    const label = formatTimestamp(timeVal, isDaily);
    labels.push(label);

    let marker;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      marker = document.createElement('span');
      marker.className = 'time-axis-marker';
      marker.textContent = label;
      if (marker.style) {
        marker.style.color = '#787b86';
        marker.style.fontSize = '11px';
        marker.style.fontFamily = 'sans-serif';
        marker.style.userSelect = 'none';
        marker.style.pointerEvents = 'none';
        marker.style.whiteSpace = 'nowrap';
        marker.style.flex = '0 0 auto';
      }
    } else {
      marker = {
        tagName: 'SPAN',
        className: 'time-axis-marker',
        textContent: label,
        style: {
          color: '#787b86',
          fontSize: '11px',
          fontFamily: 'sans-serif',
          userSelect: 'none',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          flex: '0 0 auto',
        },
      };
    }

    if (typeof trackElement.appendChild === 'function') {
      trackElement.appendChild(marker);
    }
  }

  if (typeof trackElement.setAttribute === 'function') {
    trackElement.setAttribute('data-time-labels', labels.join(', '));
  }
}

/**
 * Computes price and time domain ranges from a candle dataset.
 *
 * @param {Array<Object>} candles - Candlestick series
 * @returns {{ priceRange: { min: number, max: number }, timeRange: { min: number, max: number } }}
 */
export function computeRanges(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      priceRange: { min: 100, max: 200 },
      timeRange: { min: 1700000000, max: 1700086400 },
    };
  }

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let minTime = Infinity;
  let maxTime = -Infinity;
  let hasSeconds = false;
  let hasMillis = false;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c) continue;

    const open = typeof c.open === 'number'
      ? c.open
      : (typeof c.close === 'number'
        ? c.close
        : (typeof c.price === 'number'
          ? c.price
          : (typeof c.value === 'number' ? c.value : 0)));
    const close = typeof c.close === 'number' ? c.close : open;
    const low = typeof c.low === 'number' ? c.low : Math.min(open, close);
    const high = typeof c.high === 'number' ? c.high : Math.max(open, close);
    const time = typeof c.time === 'number'
      ? c.time
      : (typeof c.timestamp === 'number'
        ? c.timestamp
        : (typeof c.t === 'number'
          ? c.t
          : (typeof c.date === 'number'
            ? c.date
            : (c.date ? new Date(c.date).getTime() : 0))));

    if (low < minPrice) minPrice = low;
    if (high > maxPrice) maxPrice = high;
    if (Number.isFinite(time) && time > 0) {
      if (time < 1e11) hasSeconds = true;
      else hasMillis = true;
      if (time < minTime) minTime = time;
      if (time > maxTime) maxTime = time;
    }
  }

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    minPrice = 100;
    maxPrice = 200;
  } else if (minPrice === maxPrice) {
    minPrice -= 1;
    maxPrice += 1;
  }

  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime)) {
    minTime = 1700000000;
    maxTime = 1700086400;
  } else if (hasSeconds && hasMillis) {
    minTime = minTime >= 1e11 ? Math.floor(minTime / 1000) : minTime;
    maxTime = maxTime >= 1e11 ? Math.floor(maxTime / 1000) : maxTime;
  } else if (minTime === maxTime) {
    const delta = minTime > 1e11 ? 60000 : 60;
    minTime -= delta;
    maxTime += delta;
  }

  return {
    priceRange: { min: minPrice, max: maxPrice },
    timeRange: { min: minTime, max: maxTime },
  };
}

export class AxesRenderer {
  /**
   * @param {Object} [options={}]
   * @param {HTMLCanvasElement|Object} [options.canvas]
   * @param {CanvasRenderingContext2D|Object} [options.context]
   * @param {{ top: number, left: number, width: number, height: number }} [options.plotArea]
   * @param {number} [options.priceAxisWidth=70]
   * @param {number} [options.timeAxisHeight=50]
   * @param {string} [options.gridColor='#2a2e39']
   * @param {string} [options.axisColor='#363c4e']
   * @param {string} [options.textColor='#787b86']
   * @param {string} [options.font='11px sans-serif']
   * @param {HTMLElement|Object} [options.trackElement]
   * @param {number} [options.candleCount=0]
   * @param {Array<Object>} [options.candles=null]
   */
  constructor(options) {
    const opts = options || {};
    this.canvas = opts.canvas || null;
    this.context =
      opts.context ||
      (this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null);
    this.priceAxisWidth = opts.priceAxisWidth !== undefined ? opts.priceAxisWidth : 70;
    this.timeAxisHeight = opts.timeAxisHeight !== undefined ? opts.timeAxisHeight : 50;
    this.trackElement = opts.trackElement || null;

    const canvasWidth = this.canvas ? this.canvas.width : 800;
    const canvasHeight = this.canvas ? this.canvas.height : 600;

    if (opts.plotArea) {
      this.plotArea = {
        top: opts.plotArea.top !== undefined ? opts.plotArea.top : 0,
        left: opts.plotArea.left !== undefined ? opts.plotArea.left : 0,
        width: opts.plotArea.width !== undefined ? opts.plotArea.width : Math.max(0, canvasWidth - this.priceAxisWidth),
        height: opts.plotArea.height !== undefined ? opts.plotArea.height : Math.max(0, canvasHeight - this.timeAxisHeight),
      };
    } else {
      this.plotArea = {
        top: 0,
        left: 0,
        width: Math.max(0, canvasWidth - this.priceAxisWidth),
        height: Math.max(0, canvasHeight - this.timeAxisHeight),
      };
    }

    this.plotWidth = opts.plotWidth !== undefined ? opts.plotWidth : this.plotArea.width;
    this.plotHeight = opts.plotHeight !== undefined ? opts.plotHeight : this.plotArea.height;
    this.candleCount = opts.candleCount || 0;
    this.candles = opts.candles || opts.data || null;

    this.gridColor = opts.gridColor || '#2a2e39';
    this.axisColor = opts.axisColor || '#363c4e';
    this.textColor = opts.textColor || '#787b86';
    this.font = opts.font || '11px sans-serif';
    this.priceRange = opts.priceRange || (opts.ranges?.priceRange) || { min: 100, max: 200 };
    this.timeRange = opts.timeRange || (opts.ranges?.timeRange) || { min: 1700000000, max: 1700086400 };
  }

  /**
   * Updates renderer plot area dimensions on canvas resize.
   *
   * @param {number} width - New canvas width
   * @param {number} height - New canvas height
   */
  resize(width, height) {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const top = (this.plotArea && this.plotArea.top) || 0;
    const left = (this.plotArea && this.plotArea.left) || 0;
    this.plotArea = {
      top,
      left,
      width: Math.max(0, width - left - this.priceAxisWidth),
      height: Math.max(0, height - top - this.timeAxisHeight),
    };
    this.plotWidth = this.plotArea.width;
    this.plotHeight = this.plotArea.height;
  }

  /**
   * Sets plot area bounds directly.
   *
   * @param {{ top: number, left: number, width: number, height: number }} plotArea
   */
  setPlotArea(plotArea) {
    if (!plotArea) return;
    this.plotArea = {
      top: plotArea.top !== undefined ? plotArea.top : 0,
      left: plotArea.left !== undefined ? plotArea.left : 0,
      width: plotArea.width !== undefined ? plotArea.width : 0,
      height: plotArea.height !== undefined ? plotArea.height : 0,
    };
    this.plotWidth = this.plotArea.width;
    this.plotHeight = this.plotArea.height;
  }

  setPlotWidth(w) {
    if (typeof w === 'number') {
      this.plotWidth = w;
      if (this.plotArea) this.plotArea.width = w;
    }
  }

  setPlotHeight(h) {
    if (typeof h === 'number') {
      this.plotHeight = h;
      if (this.plotArea) this.plotArea.height = h;
    }
  }

  updateDimensions(w, h) {
    if (typeof w === 'number') {
      this.plotWidth = w;
      if (this.plotArea) this.plotArea.width = w;
    }
    if (typeof h === 'number') {
      this.plotHeight = h;
      if (this.plotArea) this.plotArea.height = h;
    }
  }

  setCoordinateScale(ranges) {
    if (!ranges) return;
    if (ranges.priceRange) this.priceRange = ranges.priceRange;
    if (ranges.timeRange) this.timeRange = ranges.timeRange;
  }

  setScale(ranges) {
    this.setCoordinateScale(ranges);
  }

  setCandles(candles) {
    if (Array.isArray(candles)) {
      this.candles = candles;
      this.candleCount = candles.length;
    }
  }

  setData(data) {
    this.setCandles(data);
  }

  /**
   * Calculates time axis tick positions and timestamps scaled dynamically across [plotLeft, plotRight].
   * Resolves TIME_AXIS_TEXT_CLUMPING (STORY 40.2.1).
   *
   * @param {Object} [options={}]
   * @returns {Array<{ x: number, time: number, label: string, index: number }>}
   */
  calculateTimeTicks(options = {}) {
    return calculateTimeTicks({
      plotArea: this.plotArea,
      min: this.timeRange ? this.timeRange.min : 1700000000,
      max: this.timeRange ? this.timeRange.max : 1700086400,
      candles: this.candles,
      candleCount: this.candleCount,
      ...options,
    });
  }

  getTimeTicks(options = {}) {
    return this.calculateTimeTicks(options);
  }

  /**
   * Renders horizontal and vertical background gridlines across active plot area.
   *
   * @param {Object} [ranges={}]
   * @param {{ min: number, max: number }} [ranges.priceRange]
   * @param {{ min: number, max: number }} [ranges.timeRange]
   */
  renderGridlines(ranges) {
    const ctx = this.context || (this.canvas && this.canvas.getContext && this.canvas.getContext('2d'));
    if (!ctx) return;

    const plotArea = this.plotArea;
    const hSteps = 5;
    const vSteps = 5;

    ctx.save?.();
    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 1;

    // Horizontal gridlines: span across full plot width (x: left -> left + width)
    for (let i = 0; i <= hSteps; i++) {
      const y = plotArea.top + (plotArea.height * i) / hSteps;
      ctx.beginPath?.();
      ctx.moveTo?.(plotArea.left, y);
      ctx.lineTo?.(plotArea.left + plotArea.width, y);
      ctx.stroke?.();
    }

    // Vertical gridlines: span across full plot height (y: top -> top + height)
    for (let i = 0; i <= vSteps; i++) {
      const x = plotArea.left + (plotArea.width * i) / vSteps;
      ctx.beginPath?.();
      ctx.moveTo?.(x, plotArea.top);
      ctx.lineTo?.(x, plotArea.top + plotArea.height);
      ctx.stroke?.();
    }

    ctx.restore?.();
  }

  /**
   * Draws a right-hand vertical price scale axis with price tick labels.
   *
   * @param {Object|Array} [range={}]
   * @param {number} [range.min=100]
   * @param {number} [range.max=200]
   */
  renderPriceScale(range) {
    const ctx = this.context || (this.canvas && this.canvas.getContext && this.canvas.getContext('2d'));
    if (!ctx) return;

    const r = range || {};
    let min = 100;
    let max = 200;

    if (Array.isArray(r)) {
      const computed = computeRanges(r);
      min = computed.priceRange.min;
      max = computed.priceRange.max;
    } else {
      if (r.min !== undefined) {
        min = r.min;
      } else if (r.priceRange && r.priceRange.min !== undefined) {
        min = r.priceRange.min;
      }

      if (r.max !== undefined) {
        max = r.max;
      } else if (r.priceRange && r.priceRange.max !== undefined) {
        max = r.priceRange.max;
      }
    }

    if (min === max) {
      min -= 1;
      max += 1;
    }
    const plotArea = this.plotArea;
    const axisX = plotArea.left + plotArea.width;

    ctx.save?.();
    ctx.strokeStyle = this.axisColor;
    ctx.fillStyle = this.textColor;
    ctx.font = this.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 1. Draw vertical price axis line separating plot and scale area
    ctx.beginPath?.();
    ctx.moveTo?.(axisX, plotArea.top);
    ctx.lineTo?.(axisX, plotArea.top + plotArea.height);
    ctx.stroke?.();

    // 2. Draw price tick marks and labels in the right-hand scale region (x >= axisX)
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const price = min + ((max - min) * i) / steps;
      const y = plotArea.top + (plotArea.height * (max - price)) / (max - min);

      // Tick mark extending rightward into scale area
      ctx.beginPath?.();
      ctx.moveTo?.(axisX, y);
      ctx.lineTo?.(axisX + 4, y);
      ctx.stroke?.();

      // Tick label strictly placed at x >= axisX
      const labelText = price.toFixed(2);
      ctx.fillText?.(labelText, axisX + 6, y);
    }

    ctx.restore?.();
  }

  /**
   * Draws a bottom horizontal time scale axis with timestamp tick marks and formatted labels.
   * Resolves MISSING_HORIZONTAL_TIME_AXIS (STORY 36.1.1) and TIME_AXIS_TEXT_CLUMPING (STORY 40.2.1).
   *
   * @param {Object|Array} [range={}]
   * @param {number} [range.min=1700000000]
   * @param {number} [range.max=1700086400]
   */
  renderTimeScale(range) {
    const ctx = this.context || (this.canvas && this.canvas.getContext && this.canvas.getContext('2d'));
    if (!ctx) return;

    const r = range || {};
    let min = 1700000000;
    let max = 1700086400;
    let candles = this.candles || null;
    let candleCount = this.candleCount || 0;

    if (Array.isArray(r)) {
      candles = r;
      candleCount = r.length;
      const computed = computeRanges(r);
      min = computed.timeRange.min;
      max = computed.timeRange.max;
    } else {
      if (Array.isArray(r.candles)) {
        candles = r.candles;
        candleCount = r.candles.length;
      } else if (typeof r.candleCount === 'number') {
        candleCount = r.candleCount;
      } else if (typeof r.count === 'number') {
        candleCount = r.count;
      }

      if (r.min !== undefined) {
        min = r.min;
      } else if (r.timeRange && r.timeRange.min !== undefined) {
        min = r.timeRange.min;
      } else if (r.startTime !== undefined) {
        min = r.startTime;
      } else if (r.start !== undefined) {
        min = r.start;
      } else if (r.from !== undefined) {
        min = r.from;
      } else if (this.timeRange && this.timeRange.min !== undefined) {
        min = this.timeRange.min;
      }

      if (r.max !== undefined) {
        max = r.max;
      } else if (r.timeRange && r.timeRange.max !== undefined) {
        max = r.timeRange.max;
      } else if (r.endTime !== undefined) {
        max = r.endTime;
      } else if (r.end !== undefined) {
        max = r.end;
      } else if (r.to !== undefined) {
        max = r.to;
      } else if (this.timeRange && this.timeRange.max !== undefined) {
        max = this.timeRange.max;
      }
    }

    if (typeof min === 'string' || min instanceof Date) {
      const parsed = new Date(min).getTime();
      if (!Number.isNaN(parsed)) min = parsed;
    }
    if (typeof max === 'string' || max instanceof Date) {
      const parsed = new Date(max).getTime();
      if (!Number.isNaN(parsed)) max = parsed;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 1700000000;
      max = 1700086400;
    }

    if (min === max) {
      const delta = min > 1e11 ? 60000 : 60;
      min -= delta;
      max += delta;
    } else if (min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }

    const plotArea = this.plotArea;
    const axisY = plotArea.top + plotArea.height;
    const canvasHeight = (this.canvas && typeof this.canvas.height === 'number' && this.canvas.height > 0)
      ? this.canvas.height
      : (axisY + this.timeAxisHeight);

    ctx.save?.();
    ctx.strokeStyle = this.axisColor;
    ctx.fillStyle = this.textColor;
    ctx.font = this.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // 1. Draw horizontal time axis line separating plot and bottom scale area
    ctx.beginPath?.();
    ctx.moveTo?.(plotArea.left, axisY);
    ctx.lineTo?.(plotArea.left + plotArea.width, axisY);
    ctx.stroke?.();

    // 2. Draw timestamp tick marks and labels dynamically across full [plotLeft, plotRight]
    const ticks = this.calculateTimeTicks({
      min,
      max,
      candles,
      candleCount,
      plotLeft: plotArea.left,
      plotRight: plotArea.left + plotArea.width,
      plotWidth: plotArea.width,
    });

    const span = Math.abs(max - min);
    const spanMs = span < 1e11 ? span * 1000 : span;
    const isDaily = spanMs >= 86400000 * 2;

    const tickLength = 5;
    const fontSize = 11;
    const availableHeight = Math.max(0, canvasHeight - axisY);
    const idealOffset = Math.min(12, Math.max(tickLength + 2, Math.floor(availableHeight / 3)));
    const maxOffset = Math.max(0, availableHeight - fontSize - 2);
    const labelOffset = Math.min(idealOffset, maxOffset);
    const labelY = axisY + Math.max(0, labelOffset);

    for (let i = 0; i < ticks.length; i++) {
      const tick = ticks[i];
      const x = tick.x;
      const timeVal = tick.time;

      // Tick mark: short vertical line crossing into bottom axis area (y >= axisY)
      const tickEndY = Math.min(canvasHeight, axisY + tickLength);
      ctx.beginPath?.();
      ctx.moveTo?.(x, axisY);
      ctx.lineTo?.(x, tickEndY);
      ctx.stroke?.();

      // Formatted timestamp label placed strictly in bottom scale region (y >= axisY)
      const timeLabel = tick.label || formatTimestamp(timeVal, isDaily);

      let drawX = x;
      if (i === 0) {
        ctx.textAlign = 'left';
        drawX = Math.max(x, plotArea.left);
      } else if (i === ticks.length - 1) {
        ctx.textAlign = 'right';
        drawX = Math.min(x, plotArea.left + plotArea.width);
      } else {
        ctx.textAlign = 'center';
      }

      ctx.fillText?.(timeLabel, drawX, labelY);
    }

    ctx.restore?.();

    if (this.trackElement) {
      updateDOMTimeAxisTrack(this.trackElement, { min, max }, ticks.length - 1);
    }
  }

  /**
   * Renders the complete coordinate system: gridlines, price scale, and time scale.
   *
   * @param {Object|Array} [ranges={}]
   * @param {{ min: number, max: number }} [ranges.priceRange]
   * @param {{ min: number, max: number }} [ranges.timeRange]
   */
  render(ranges) {
    let priceRange = { min: 100, max: 200 };
    let timeRange = { min: 1700000000, max: 1700086400 };

    if (Array.isArray(ranges)) {
      this.candles = ranges;
      this.candleCount = ranges.length;
      const computed = computeRanges(ranges);
      priceRange = computed.priceRange;
      timeRange = computed.timeRange;
    } else if (ranges) {
      if (Array.isArray(ranges.candles)) {
        this.candles = ranges.candles;
        this.candleCount = ranges.candles.length;
      } else if (Array.isArray(ranges.data)) {
        this.candles = ranges.data;
        this.candleCount = ranges.data.length;
      } else if (typeof ranges.candleCount === 'number') {
        this.candleCount = ranges.candleCount;
      }

      if (ranges.priceRange) {
        priceRange = ranges.priceRange;
      } else if (ranges.min !== undefined && ranges.max !== undefined && ranges.max <= 100000) {
        priceRange = { min: ranges.min, max: ranges.max };
      }

      if (ranges.timeRange) {
        timeRange = ranges.timeRange;
      } else if (ranges.min !== undefined && ranges.max !== undefined && ranges.min > 1e6) {
        timeRange = { min: ranges.min, max: ranges.max };
      }
    } else if (this.priceRange && this.timeRange) {
      priceRange = this.priceRange;
      timeRange = this.timeRange;
    }

    this.priceRange = priceRange;
    this.timeRange = timeRange;

    this.renderGridlines({ priceRange, timeRange });
    this.renderPriceScale(priceRange);
    this.renderTimeScale(timeRange);
  }
}

export default AxesRenderer;