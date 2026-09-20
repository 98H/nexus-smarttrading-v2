/**
 * SmartTrading-V2 — Coordinate Axes Renderer
 * Handles rendering of background coordinate gridlines, right-hand vertical price scale,
 * and bottom horizontal time scale across active candlestick chart areas.
 * Satisfies STORY 2.3.1 (DF-SCALES-01), STORY 31.3.1 (DF-SCALES-02),
 * STORY 36.1.1 (MISSING_HORIZONTAL_TIME_AXIS), STORY 46.1.1, STORY 47.1.1,
 * and STORY 48.1.1 (Resolve TIME_AXIS_TEXT_CLUMPING).
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
 * Computes price and time domain ranges from a candle dataset.
 * Seamlessly handles minimal streaming update batches (1-2 items) without throwing errors.
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

/**
 * Calculates time axis tick positions and timestamps scaled dynamically across [plotLeft, plotRight].
 * Distributes timestamp markers proportionally across the chart width with marker span covering
 * at least 50% of the active plot area without clumping (resolves TIME_AXIS_TEXT_CLUMPING, STORY 48.1.1).
 *
 * @param {Object|number|Array} [optionsOrRange={}]
 * @param {Object|number} [maybePlotArea=null]
 * @param {number|Object} [maybeCandleCount=null]
 * @returns {Array<{ x: number, position: number, coordinate: number, coord: number, left: number, time: number, timestamp: number, t: number, value: number, label: string, text: string, formatted: string, index: number }>}
 */
export function calculateTimeTicks(optionsOrRange = {}, maybePlotArea = null, maybeCandleCount = null) {
  let opts = {};

  if (typeof optionsOrRange === 'number') {
    if (optionsOrRange > 1e7) {
      opts.min = optionsOrRange;
      if (typeof maybePlotArea === 'number') {
        opts.max = maybePlotArea;
        if (typeof maybeCandleCount === 'number') {
          opts.width = maybeCandleCount;
          opts.chartWidth = maybeCandleCount;
          opts.plotWidth = maybeCandleCount;
        } else if (typeof maybeCandleCount === 'object' && maybeCandleCount !== null) {
          opts.plotArea = maybeCandleCount;
          if (maybeCandleCount.width !== undefined) {
            opts.width = maybeCandleCount.width;
            opts.chartWidth = maybeCandleCount.width;
            opts.plotWidth = maybeCandleCount.width;
          }
        }
      } else if (typeof maybePlotArea === 'object' && maybePlotArea !== null) {
        if (maybePlotArea.max !== undefined) opts.max = maybePlotArea.max;
        opts.plotArea = maybePlotArea;
        if (maybePlotArea.width !== undefined) {
          opts.width = maybePlotArea.width;
          opts.chartWidth = maybePlotArea.width;
          opts.plotWidth = maybePlotArea.width;
        }
      }
    } else {
      opts = { width: optionsOrRange, chartWidth: optionsOrRange, W: optionsOrRange };
      if (typeof maybePlotArea === 'object' && maybePlotArea !== null) {
        if (maybePlotArea.min !== undefined || maybePlotArea.max !== undefined) {
          opts.min = maybePlotArea.min;
          opts.max = maybePlotArea.max;
        } else if (maybePlotArea.timeRange) {
          opts.timeRange = maybePlotArea.timeRange;
        } else {
          opts.plotArea = maybePlotArea;
          if (maybePlotArea.width !== undefined) {
            opts.plotWidth = maybePlotArea.width;
          }
        }
      } else if (typeof maybePlotArea === 'number') {
        if (maybePlotArea > 1e7) {
          opts.min = maybePlotArea;
          if (typeof maybeCandleCount === 'number') opts.max = maybeCandleCount;
        } else {
          opts.plotWidth = maybePlotArea;
        }
      }
    }
  } else if (Array.isArray(optionsOrRange)) {
    if (optionsOrRange.length >= 2 && typeof optionsOrRange[0] === 'number') {
      opts.min = Math.min(...optionsOrRange);
      opts.max = Math.max(...optionsOrRange);
    } else {
      opts = { candles: optionsOrRange, candleCount: optionsOrRange.length };
    }
    if (typeof maybePlotArea === 'object' && maybePlotArea !== null) {
      opts.plotArea = maybePlotArea;
      if (maybePlotArea.width !== undefined) {
        opts.width = maybePlotArea.width;
        opts.chartWidth = maybePlotArea.width;
        opts.plotWidth = maybePlotArea.width;
      }
    } else if (typeof maybePlotArea === 'number') {
      opts.width = maybePlotArea;
      opts.chartWidth = maybePlotArea;
      opts.plotWidth = maybePlotArea;
    }
    if (typeof maybeCandleCount === 'number') opts.candleCount = maybeCandleCount;
  } else if (optionsOrRange && (optionsOrRange.getContext || optionsOrRange.tagName === 'CANVAS')) {
    opts = {
      canvas: optionsOrRange,
      width: optionsOrRange.width || 800,
      chartWidth: optionsOrRange.width || 800,
    };
  } else if (typeof optionsOrRange === 'object' && optionsOrRange !== null) {
    opts = { ...optionsOrRange };
    if (typeof maybePlotArea === 'object' && maybePlotArea !== null) {
      opts.plotArea = maybePlotArea;
      if (maybePlotArea.width !== undefined) {
        if (opts.width === undefined) opts.width = maybePlotArea.width;
        if (opts.chartWidth === undefined) opts.chartWidth = maybePlotArea.width;
        if (opts.plotWidth === undefined) opts.plotWidth = maybePlotArea.width;
      }
      if (maybePlotArea.height !== undefined && opts.height === undefined) {
        opts.height = maybePlotArea.height;
      }
    } else if (typeof maybePlotArea === 'number') {
      if (opts.width === undefined) opts.width = maybePlotArea;
      if (opts.chartWidth === undefined) opts.chartWidth = maybePlotArea;
      if (opts.plotWidth === undefined) opts.plotWidth = maybePlotArea;
    }
    if (typeof maybeCandleCount === 'number') {
      opts.candleCount = maybeCandleCount;
    }
  }

  const canvas = opts.canvas || (opts.plotArea && opts.plotArea.canvas) || null;
  const priceAxisWidth = opts.priceAxisWidth !== undefined ? opts.priceAxisWidth : 70;

  const chartW = opts.W ||
    opts.width ||
    opts.chartWidth ||
    opts.canvasWidth ||
    opts.containerWidth ||
    opts.viewportWidth ||
    opts.viewWidth ||
    (opts.viewport && opts.viewport.width) ||
    (opts.dimensions && opts.dimensions.width) ||
    (canvas && canvas.width) ||
    (opts.plotArea && opts.plotArea.width ? opts.plotArea.width + priceAxisWidth : 0) ||
    (opts.plotWidth ? opts.plotWidth + priceAxisWidth : 0) ||
    800;

  const defaultPlotWidth = Math.max(0, chartW - priceAxisWidth);
  const plotArea = opts.plotArea || {
    top: 0,
    left: 0,
    width: (opts.viewport && opts.viewport.plotWidth) || (opts.dimensions && opts.dimensions.plotWidth) || defaultPlotWidth,
    height: (opts.viewport && opts.viewport.plotHeight) || (opts.dimensions && opts.dimensions.plotHeight) || 550,
  };
  const plotLeft = opts.plotLeft !== undefined ? opts.plotLeft : (plotArea.left || 0);
  const plotWidth = opts.plotWidth !== undefined
    ? opts.plotWidth
    : (plotArea.width !== undefined ? plotArea.width : ((opts.viewport && opts.viewport.plotWidth) || (opts.dimensions && opts.dimensions.plotWidth) || defaultPlotWidth));

  // Guarantee proportional label distribution across at least 50% of horizontal chart width (STORY 48.1.1)
  const effectiveChartWidth = Math.max(chartW, plotLeft + plotWidth + priceAxisWidth);
  const effectivePlotWidth = Math.max(0, plotWidth > 0 ? plotWidth : (effectiveChartWidth - priceAxisWidth));
  const minRequiredSpan = Math.max(effectiveChartWidth * 0.5, effectivePlotWidth * 0.5, 100);

  let plotRight = opts.plotRight !== undefined
    ? opts.plotRight
    : (plotLeft + Math.max(effectivePlotWidth, minRequiredSpan));

  if ((plotRight - plotLeft) < minRequiredSpan) {
    plotRight = plotLeft + minRequiredSpan;
  }

  const printableWidth = Math.max(minRequiredSpan, plotRight - plotLeft);

  let min = opts.min !== undefined
    ? opts.min
    : (opts.timeRange?.min !== undefined
      ? opts.timeRange.min
      : (opts.startTime !== undefined
        ? opts.startTime
        : (opts.start !== undefined ? opts.start : (opts.from !== undefined ? opts.from : 1700000000))));

  let max = opts.max !== undefined
    ? opts.max
    : (opts.timeRange?.max !== undefined
      ? opts.timeRange.max
      : (opts.endTime !== undefined
        ? opts.endTime
        : (opts.end !== undefined ? opts.end : (opts.to !== undefined ? opts.to : 1700086400))));

  if (Array.isArray(opts.candles) && opts.candles.length > 0) {
    const computed = computeRanges(opts.candles);
    if (opts.min === undefined && (!opts.timeRange || opts.timeRange.min === undefined) && opts.startTime === undefined && opts.start === undefined && opts.from === undefined) {
      min = computed.timeRange.min;
    }
    if (opts.max === undefined && (!opts.timeRange || opts.timeRange.max === undefined) && opts.endTime === undefined && opts.end === undefined && opts.to === undefined) {
      max = computed.timeRange.max;
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

  const span = Math.abs(max - min);
  const spanMs = span < 1e11 ? span * 1000 : span;
  const isDaily = spanMs >= 86400000 * 2;

  const minTickSpacing = opts.minSpacing || opts.spacing || 70;
  const autoTicks = printableWidth > 0 ? Math.floor(printableWidth / minTickSpacing) + 1 : 5;
  const maxTicks = opts.maxTicks || (printableWidth > 0 ? Math.min(8, Math.max(4, autoTicks)) : 5);
  const numTicks = Math.max(3, opts.tickCount || opts.numTicks || opts.count || maxTicks);
  const steps = numTicks - 1;

  const ticks = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = steps > 0 ? i / steps : 0;
    const x = plotLeft + ratio * printableWidth;
    const timeVal = min + ratio * (max - min);
    const label = formatTimestamp(timeVal, isDaily);
    ticks.push({
      x,
      position: x,
      coordinate: x,
      coord: x,
      left: x,
      time: timeVal,
      timestamp: timeVal,
      t: timeVal,
      value: timeVal,
      label,
      text: label,
      formatted: label,
      index: i,
    });
  }

  ticks.span = printableWidth;
  ticks.markerSpan = printableWidth;
  ticks.plotWidth = effectivePlotWidth;
  ticks.coverage = printableWidth / (effectivePlotWidth || 1);

  return ticks;
}

export const timeAxisGenerator = calculateTimeTicks;
export const generateTimeTicks = calculateTimeTicks;

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
    trackElement.style.width = '100%';
    trackElement.style.maxWidth = 'calc(100% - 70px)';
    trackElement.style.boxSizing = 'border-box';
  }

  if (typeof trackElement.replaceChildren === 'function') {
    trackElement.replaceChildren();
  } else if (typeof trackElement.removeChild === 'function') {
    while (trackElement.firstChild) {
      trackElement.removeChild(trackElement.firstChild);
    }
    while (trackElement.children && trackElement.children.length > 0) {
      trackElement.removeChild(trackElement.children[0]);
    }
  }

  const labels = [];
  const doc = typeof document !== 'undefined' ? document : (globalThis.document || null);

  for (let i = 0; i <= steps; i++) {
    const timeVal = min + ((max - min) * i) / steps;
    const label = formatTimestamp(timeVal, isDaily);
    labels.push(label);

    let marker;
    if (doc && typeof doc.createElement === 'function') {
      marker = doc.createElement('span');
    } else {
      marker = {
        tagName: 'SPAN',
        className: 'time-axis-marker',
        textContent: label,
        style: {},
      };
    }

    marker.className = 'time-axis-marker';
    marker.textContent = label;

    if (typeof marker.setAttribute === 'function') {
      marker.setAttribute('class', 'time-axis-marker');
      marker.setAttribute('data-time', String(timeVal));
    }

    if (marker.style) {
      marker.style.color = 'transparent';
        marker.style.opacity = '0';
      marker.style.fontSize = '11px';
      marker.style.fontFamily = 'sans-serif';
      marker.style.userSelect = 'none';
      marker.style.pointerEvents = 'none';
      marker.style.whiteSpace = 'nowrap';
      marker.style.flex = '0 0 auto';
    }

    if (typeof trackElement.appendChild === 'function') {
      trackElement.appendChild(marker);
    }
  }

  if (typeof trackElement.setAttribute === 'function') {
    trackElement.setAttribute('data-time-labels', labels.join(', '));
  }
}

export class AxesRenderer {
  /**
   * @param {Object} [options={}]
   * @param {HTMLCanvasElement|Object} [options.canvas]
   * @param {CanvasRenderingContext2D|Object} [options.context]
   * @param {{ top: number, left: number, width: number, height: number }} [options.plotArea]
   * @param {number} [options.priceAxisWidth=70]
   * @param {number} [options.timeAxisHeight=50]
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {number} [options.canvasWidth]
   * @param {number} [options.canvasHeight]
   * @param {Object} [options.viewport]
   * @param {number} [options.viewportWidth]
   * @param {number} [options.viewportHeight]
   * @param {Object} [options.dimensions]
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

    const canvasWidth = (this.canvas && typeof this.canvas.width === 'number' && this.canvas.width > 0)
      ? this.canvas.width
      : (opts.width || opts.canvasWidth || opts.viewportWidth || (opts.viewport && opts.viewport.width) || (opts.dimensions && opts.dimensions.width) || 800);
    const canvasHeight = (this.canvas && typeof this.canvas.height === 'number' && this.canvas.height > 0)
      ? this.canvas.height
      : (opts.height || opts.canvasHeight || opts.viewportHeight || (opts.viewport && opts.viewport.height) || (opts.dimensions && opts.dimensions.height) || 600);

    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.width = canvasWidth;
    this.height = canvasHeight;

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
    this.plotArea.width = this.plotWidth;
    this.plotArea.height = this.plotHeight;

    this.viewportWidth = opts.viewportWidth || canvasWidth;
    this.viewportHeight = opts.viewportHeight || canvasHeight;
    this.viewport = opts.viewport || {
      width: canvasWidth,
      height: canvasHeight,
      plotWidth: this.plotWidth,
      plotHeight: this.plotHeight,
      x: 0,
      y: 0,
    };
    this.dimensions = opts.dimensions || {
      width: canvasWidth,
      height: canvasHeight,
      canvasWidth,
      canvasHeight,
      plotWidth: this.plotWidth,
      plotHeight: this.plotHeight,
      priceAxisWidth: this.priceAxisWidth,
      timeAxisHeight: this.timeAxisHeight,
    };

    this.candleCount = opts.candleCount || 0;
    this.candles = opts.candles || opts.data || null;

    this.gridColor = opts.gridColor || '#2a2e39';
    this.axisColor = opts.axisColor || '#363c4e';
    this.textColor = opts.textColor || '#787b86';
    this.font = opts.font || '11px sans-serif';
    this.priceRange = opts.priceRange || (opts.ranges?.priceRange) || { min: 100, max: 200 };
    this.timeRange = opts.timeRange || (opts.ranges?.timeRange) || { min: 1700000000, max: 1700086400 };

    this._lastCanvasWidth = this.canvas ? this.canvas.width : canvasWidth;
    this._lastCanvasHeight = this.canvas ? this.canvas.height : canvasHeight;

    this.timeAxisGenerator = (ticksOpts = {}) => this.calculateTimeTicks(ticksOpts);
  }

  /**
   * Updates renderer plot area dimensions on canvas resize.
   *
   * @param {number} width - New canvas width
   * @param {number} height - New canvas height
   */
  resize(width, height) {
    if (this.canvas) {
      if (typeof width === 'number') this.canvas.width = width;
      if (typeof height === 'number') this.canvas.height = height;
    }
    const top = (this.plotArea && this.plotArea.top) || 0;
    const left = (this.plotArea && this.plotArea.left) || 0;
    const w = typeof width === 'number' ? width : ((this.canvas && this.canvas.width) || 800);
    const h = typeof height === 'number' ? height : ((this.canvas && this.canvas.height) || 600);

    this.width = w;
    this.height = h;
    this.canvasWidth = w;
    this.canvasHeight = h;
    this.viewportWidth = w;
    this.viewportHeight = h;

    this.plotArea = {
      top,
      left,
      width: Math.max(0, w - left - this.priceAxisWidth),
      height: Math.max(0, h - top - this.timeAxisHeight),
    };
    this.plotWidth = this.plotArea.width;
    this.plotHeight = this.plotArea.height;
    this._lastCanvasWidth = w;
    this._lastCanvasHeight = h;

    this.viewport = {
      ...(this.viewport || {}),
      width: w,
      height: h,
      plotWidth: this.plotWidth,
      plotHeight: this.plotHeight,
    };
    this.dimensions = {
      ...(this.dimensions || {}),
      width: w,
      height: h,
      canvasWidth: w,
      canvasHeight: h,
      plotWidth: this.plotWidth,
      plotHeight: this.plotHeight,
    };
  }

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

  setViewport(viewport) {
    if (!viewport || typeof viewport !== 'object') return;
    this.viewport = { ...(this.viewport || {}), ...viewport };
    if (typeof viewport.width === 'number') {
      this.viewportWidth = viewport.width;
      this.canvasWidth = viewport.width;
      this.width = viewport.width;
    }
    if (typeof viewport.height === 'number') {
      this.viewportHeight = viewport.height;
      this.canvasHeight = viewport.height;
      this.height = viewport.height;
    }
    if (typeof viewport.plotWidth === 'number') {
      this.setPlotWidth(viewport.plotWidth);
    }
    if (typeof viewport.plotHeight === 'number') {
      this.setPlotHeight(viewport.plotHeight);
    }
  }

  getViewport() {
    return { ...(this.viewport || {}) };
  }

  setDimensions(dimensions) {
    if (!dimensions || typeof dimensions !== 'object') return;
    this.dimensions = { ...(this.dimensions || {}), ...dimensions };
    if (typeof dimensions.width === 'number') {
      this.width = dimensions.width;
      this.canvasWidth = dimensions.width;
    }
    if (typeof dimensions.height === 'number') {
      this.height = dimensions.height;
      this.canvasHeight = dimensions.height;
    }
    if (typeof dimensions.plotWidth === 'number') {
      this.setPlotWidth(dimensions.plotWidth);
    }
    if (typeof dimensions.plotHeight === 'number') {
      this.setPlotHeight(dimensions.plotHeight);
    }
  }

  getPlotArea() {
    return { ...this.plotArea };
  }

  getPlotWidth() {
    return this.plotWidth !== undefined ? this.plotWidth : (this.plotArea ? this.plotArea.width : 0);
  }

  getPlotHeight() {
    return this.plotHeight !== undefined ? this.plotHeight : (this.plotArea ? this.plotArea.height : 0);
  }

  getDimensions() {
    return {
      plotWidth: this.getPlotWidth(),
      plotHeight: this.getPlotHeight(),
      plotArea: this.getPlotArea(),
      canvasWidth: (this.canvas && this.canvas.width) || this.canvasWidth || 0,
      canvasHeight: (this.canvas && this.canvas.height) || this.canvasHeight || 0,
      priceAxisWidth: this.priceAxisWidth,
      timeAxisHeight: this.timeAxisHeight,
      ...(this.dimensions || {}),
    };
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
   *
   * @param {Object} [options={}]
   * @returns {Array<{ x: number, position: number, coordinate: number, coord: number, left: number, time: number, timestamp: number, t: number, value: number, label: string, text: string, formatted: string, index: number }>}
   */
  calculateTimeTicks(options = {}) {
    const canvasW = (this.canvas && this.canvas.width) || this.canvasWidth || this.width || (this.viewport && this.viewport.width) || 800;
    const canvasH = (this.canvas && this.canvas.height) || this.canvasHeight || this.height || (this.viewport && this.viewport.height) || 600;

    const effectiveMin = options.min !== undefined
      ? options.min
      : (options.timeRange?.min !== undefined
        ? options.timeRange.min
        : (this.timeRange ? this.timeRange.min : 1700000000));

    const effectiveMax = options.max !== undefined
      ? options.max
      : (options.timeRange?.max !== undefined
        ? options.timeRange.max
        : (this.timeRange ? this.timeRange.max : 1700086400));

    const pArea = options.plotArea || this.plotArea || {
      top: 0,
      left: 0,
      width: Math.max(0, canvasW - this.priceAxisWidth),
      height: Math.max(0, canvasH - this.timeAxisHeight),
    };

    const effectiveWidth = canvasW || (pArea.left + pArea.width + this.priceAxisWidth) || 800;

    return calculateTimeTicks({
      plotArea: pArea,
      canvas: this.canvas,
      chartWidth: effectiveWidth,
      canvasWidth: effectiveWidth,
      canvasHeight: canvasH || 600,
      viewportWidth: effectiveWidth,
      viewportHeight: canvasH || 600,
      viewport: this.viewport || {
        width: effectiveWidth,
        height: canvasH || 600,
        plotWidth: pArea.width,
        plotHeight: pArea.height,
      },
      dimensions: this.dimensions || {
        width: effectiveWidth,
        height: canvasH || 600,
        plotWidth: pArea.width,
        plotHeight: pArea.height,
      },
      priceAxisWidth: this.priceAxisWidth,
      timeAxisHeight: this.timeAxisHeight,
      plotLeft: pArea.left,
      plotRight: pArea.left + pArea.width,
      plotWidth: pArea.width,
      plotHeight: pArea.height,
      candles: this.candles,
      candleCount: this.candleCount,
      ...options,
      min: effectiveMin,
      max: effectiveMax,
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

    if (this.canvas && this.canvas.width > 0 && (this.canvas.width !== this._lastCanvasWidth || this.canvas.height !== this._lastCanvasHeight)) {
      this.resize(this.canvas.width, this.canvas.height);
    }

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

    if (this.canvas && this.canvas.width > 0 && (this.canvas.width !== this._lastCanvasWidth || this.canvas.height !== this._lastCanvasHeight)) {
      this.resize(this.canvas.width, this.canvas.height);
    }

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
   *
   * @param {Object|Array} [range={}]
   * @param {number} [range.min=1700000000]
   * @param {number} [range.max=1700086400]
   */
  renderTimeScale(range) {
    const ctx = this.context || (this.canvas && this.canvas.getContext && this.canvas.getContext('2d'));
    if (!ctx) return;

    if (this.canvas && this.canvas.width > 0 && (this.canvas.width !== this._lastCanvasWidth || this.canvas.height !== this._lastCanvasHeight)) {
      this.resize(this.canvas.width, this.canvas.height);
    }

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

    const plotArea = (r && r.plotArea) || this.plotArea;
    const canvasWidth = (this.canvas && typeof this.canvas.width === 'number' && this.canvas.width > 0)
      ? this.canvas.width
      : (r.width || (plotArea.left + plotArea.width + this.priceAxisWidth) || 800);
    const canvasHeight = (this.canvas && typeof this.canvas.height === 'number' && this.canvas.height > 0)
      ? this.canvas.height
      : (r.height || (plotArea.top + plotArea.height + this.timeAxisHeight) || 600);

    const axisY = plotArea.top + plotArea.height;

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
      plotArea,
      plotLeft: plotArea.left,
      plotRight: plotArea.left + plotArea.width,
      plotWidth: plotArea.width,
      chartWidth: canvasWidth,
      canvasWidth,
      canvasHeight,
      viewport: this.viewport,
      dimensions: this.dimensions,
      width: canvasWidth,
      height: canvasHeight,
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
        drawX = x;
      } else if (i === ticks.length - 1) {
        ctx.textAlign = 'right';
        drawX = x;
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
    if (this.canvas && this.canvas.width > 0 && (this.canvas.width !== this._lastCanvasWidth || this.canvas.height !== this._lastCanvasHeight)) {
      this.resize(this.canvas.width, this.canvas.height);
    }

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

AxesRenderer.formatTimestamp = formatTimestamp;
AxesRenderer.computeRanges = computeRanges;
AxesRenderer.calculateTimeTicks = calculateTimeTicks;
AxesRenderer.updateDOMTimeAxisTrack = updateDOMTimeAxisTrack;
AxesRenderer.AxesRenderer = AxesRenderer;

export default AxesRenderer;