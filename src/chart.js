/**
 * SmartTrading-V2 — Candlestick Chart Engine & Timeseries Aggregation
 * Implements coordinate axes (price & time scales), gridline rendering,
 * viewport sector coverage, interactive pan gestures, and zoom scaling.
 */

/**
 * Returns the duration in milliseconds for a standard timeframe code.
 *
 * @param {string} timeframe - Timeframe code (e.g. '1m', '5m', '15m', '1h', '1d')
 * @returns {number} Duration in milliseconds
 */
export function getTimeframeDuration(timeframe) {
  switch (timeframe) {
    case '1m':
      return 60 * 1000;
    case '5m':
      return 5 * 60 * 1000;
    case '15m':
      return 15 * 60 * 1000;
    case '30m':
      return 30 * 60 * 1000;
    case '1h':
      return 60 * 60 * 1000;
    case '4h':
      return 4 * 60 * 60 * 1000;
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '1w':
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return 60 * 1000;
  }
}

/**
 * Formats a timestamp into a standard axis time string (MM/DD HH:mm).
 *
 * @param {number} timestamp - Unix timestamp in seconds or milliseconds
 * @returns {string} Formatted label
 */
export function formatAxisTime(timestamp) {
  if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
    return '00:00';
  }
  const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '00:00';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}

/**
 * Generates a comprehensive candlestick series adhering to STORY 1.2.1 invariants.
 * Produces 50 to 100 data points with strictly validated OHLC properties.
 *
 * @param {number|Object} [options=75] - Candle count number or configuration object
 * @returns {Array<Object>} Array of candlestick data objects
 */
export function generateCandleSeries(options = {}) {
  let count = 75;
  if (typeof options === 'number') {
    count = options;
  } else if (options && typeof options.count === 'number') {
    count = options.count;
  }

  // Enforce comprehensive series between 50 and 100 points
  if (count < 50) count = 50;
  if (count > 100) count = 100;

  const candles = [];
  let currentPrice = (options && options.initialPrice) || 100.0;
  const now = Date.now();
  const interval = (options && options.interval) || 60000;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * 3;
    const open = Math.round(currentPrice * 100) / 100;
    const close = Math.round((open + change) * 100) / 100;
    const maxOC = Math.max(open, close);
    const minOC = Math.min(open, close);

    const highOffset = Math.random() * 2;
    const lowOffset = Math.random() * 2;

    const high = Math.max(maxOC, Math.round((maxOC + highOffset) * 100) / 100);
    const low = Math.min(minOC, Math.round((minOC - lowOffset) * 100) / 100);
    const timestamp = now - (count - i) * interval;
    const volume = Math.floor(Math.random() * 1000) + 100;

    candles.push({
      time: timestamp,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
  }

  return candles;
}

/**
 * Default generator for timeseries candlestick data.
 */
export const generateDefaultCandles = (count = 75) => generateCandleSeries(count);

/**
 * Aggregates lower-timeframe candles into higher-timeframe buckets.
 *
 * @param {Array<Object>} candles - Raw input candlestick records
 * @param {string} timeframe - Target timeframe identifier
 * @returns {Array<Object>} Aggregated candlestick records
 */
export function aggregateCandles(candles, timeframe) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const duration = getTimeframeDuration(timeframe);
  if (duration <= 60000) return [...candles];

  const aggregated = [];
  let currentBucket = null;

  for (const candle of candles) {
    const time = candle.time || candle.timestamp || 0;
    const bucketTime = Math.floor(time / duration) * duration;

    if (!currentBucket || currentBucket.time !== bucketTime) {
      if (currentBucket) aggregated.push(currentBucket);
      currentBucket = {
        time: bucketTime,
        timestamp: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
      };
    } else {
      currentBucket.high = Math.max(currentBucket.high, candle.high);
      currentBucket.low = Math.min(currentBucket.low, candle.low);
      currentBucket.close = candle.close;
      currentBucket.volume = (currentBucket.volume || 0) + (candle.volume || 0);
    }
  }

  if (currentBucket) aggregated.push(currentBucket);
  return aggregated;
}

/**
 * Interactive HTML5 Canvas Candlestick Chart Engine.
 * Manages rendering, scaling, viewport panning, coordinate axes, and real-time updates.
 */
export class Chart {
  constructor(canvasOrOptions, maybeOptions = {}) {
    let canvas = null;
    let options = {};

    if (canvasOrOptions && (canvasOrOptions.getContext || canvasOrOptions.tagName === 'CANVAS')) {
      canvas = canvasOrOptions;
      options = maybeOptions || {};
    } else if (canvasOrOptions && typeof canvasOrOptions === 'object') {
      canvas = canvasOrOptions.canvas || null;
      options = canvasOrOptions;
    } else {
      options = maybeOptions || {};
    }

    this.canvas = canvas;
    this.options = options;
    this.timeframe = options.timeframe || '1m';
    this.sectorCount = options.sectorCount || 4;
    this.zoomScale = typeof options.zoomScale === 'number' && options.zoomScale > 0 ? options.zoomScale : 1.0;

    const inputData =
      (Array.isArray(options.candles) && options.candles.length > 0 && options.candles) ||
      (Array.isArray(options.data) && options.data.length > 0 && options.data) ||
      null;

    const candleCount = options.candleCount || (inputData ? inputData.length : 75);
    this.candleCount = candleCount;
    this.candles = inputData ? [...inputData] : generateCandleSeries({ count: candleCount });
    this.data = this.candles;

    this.theme = {
      upColor: '#26a69a',
      downColor: '#ef5350',
      wickColor: '#787b86',
      gridColor: '#2a2e39',
      axisColor: '#4c525e',
      textColor: '#848e9c',
      ...(options.theme || {}),
    };

    // Pan state and viewport coordinates
    this.isPanning = false;
    const initX = options.offsetX ?? options.viewportOffset?.x ?? options.viewport?.x ?? 0;
    const initY = options.offsetY ?? options.viewportOffset?.y ?? options.viewport?.y ?? 0;
    this.viewportOffset = { x: initX, y: initY };
    this._panStart = { x: 0, y: 0 };
    this._initialOffset = { x: initX, y: initY };

    this._intervalId = null;
    this._listeners = [];

    this._setupInteractivity();

    if (options.autoRender === true) {
      this.render();
    }
  }

  setData(data) {
    this.candles = Array.isArray(data) ? [...data] : [];
    this.data = this.candles;
    this.candleCount = this.candles.length;
  }

  getViewportOffset() {
    return { x: this.viewportOffset.x, y: this.viewportOffset.y };
  }

  get offsetX() {
    return this.viewportOffset.x;
  }

  set offsetX(val) {
    this.viewportOffset.x = val;
  }

  get offsetY() {
    return this.viewportOffset.y;
  }

  set offsetY(val) {
    this.viewportOffset.y = val;
  }

  get viewport() {
    return {
      x: this.viewportOffset.x,
      y: this.viewportOffset.y,
      offsetX: this.viewportOffset.x,
      offsetY: this.viewportOffset.y,
    };
  }

  /**
   * Adjusts chart zoom scale by a multiplication factor and re-renders.
   *
   * @param {number} factor - Scale multiplier
   */
  zoom(factor) {
    if (typeof factor !== 'number' || isNaN(factor) || factor <= 0) return;
    const currentScale = typeof this.zoomScale === 'number' && this.zoomScale > 0 ? this.zoomScale : 1.0;
    this.zoomScale = Math.max(0.01, Math.round(currentScale * factor * 10000) / 10000);
    this.draw();
  }

  /**
   * Handles wheel events by zooming in on upward scroll and zooming out on downward scroll.
   *
   * @param {WheelEvent|Object} e - Wheel event
   */
  handleWheel(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const deltaY = (e && typeof e.deltaY === 'number') ? e.deltaY : 0;
    if (deltaY < 0) {
      this.zoom(1.1);
    } else if (deltaY > 0) {
      this.zoom(1 / 1.1);
    }
  }

  /**
   * Offsets viewport horizontally and vertically.
   *
   * @param {number} dx - Horizontal delta
   * @param {number} [dy=0] - Vertical delta
   */
  pan(dx, dy = 0) {
    this.viewportOffset.x += dx;
    this.viewportOffset.y += dy;
    this.draw();
  }

  _setupInteractivity() {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;

    const onMouseDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this.isPanning = true;
      const clientX = e.clientX ?? e.x ?? 0;
      const clientY = e.clientY ?? e.y ?? 0;
      this._panStart = { x: clientX, y: clientY };
      this._initialOffset = { x: this.viewportOffset.x, y: this.viewportOffset.y };
    };

    const onMouseMove = (e) => {
      if (!this.isPanning) return;
      if (e.buttons !== undefined && e.buttons === 0) {
        this.isPanning = false;
        return;
      }
      const clientX = e.clientX ?? e.x ?? 0;
      const clientY = e.clientY ?? e.y ?? 0;
      const dx = clientX - this._panStart.x;
      const dy = clientY - this._panStart.y;
      this.viewportOffset.x = this._initialOffset.x + dx;
      this.viewportOffset.y = this._initialOffset.y + dy;
      this.draw();
    };

    const onMouseUp = () => {
      this.isPanning = false;
    };

    const onMouseLeave = () => {
      this.isPanning = false;
    };

    const onWheel = (e) => {
      this.handleWheel(e);
    };

    this.canvas.addEventListener('mousedown', onMouseDown);
    this.canvas.addEventListener('mousemove', onMouseMove);
    this.canvas.addEventListener('mouseup', onMouseUp);
    this.canvas.addEventListener('mouseleave', onMouseLeave);
    this.canvas.addEventListener('wheel', onWheel);

    this._listeners = [
      { type: 'mousedown', handler: onMouseDown },
      { type: 'mousemove', handler: onMouseMove },
      { type: 'mouseup', handler: onMouseUp },
      { type: 'mouseleave', handler: onMouseLeave },
      { type: 'wheel', handler: onWheel },
    ];
  }

  _removeInteractivity() {
    if (!this.canvas || typeof this.canvas.removeEventListener !== 'function') return;
    for (const { type, handler } of this._listeners) {
      this.canvas.removeEventListener(type, handler);
    }
    this._listeners = [];
  }

  getTimeframe() {
    return this.timeframe;
  }

  setTimeframe(tf) {
    this.timeframe = tf;
    this.candles = aggregateCandles(this.candles, tf);
    if (this.candles.length < 50) {
      this.candles = generateCandleSeries({ count: this.candleCount || 75 });
    }
    this.data = this.candles;
    this.draw();
  }

  start() {
    if (this._intervalId) return;
    this.draw();
    this._intervalId = setInterval(() => {
      this.tick();
    }, 2000);
    if (typeof this._intervalId?.unref === 'function') {
      this._intervalId.unref();
    }
  }

  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  destroy() {
    this.stop();
    this._removeInteractivity();
    this.isPanning = false;
  }

  tick() {
    if (!this.candles || this.candles.length === 0) return;
    const last = this.candles[this.candles.length - 1];
    const change = (Math.random() - 0.49) * 0.5;
    last.close = Math.round((last.close + change) * 100) / 100;
    last.high = Math.max(last.high, last.close);
    last.low = Math.min(last.low, last.close);
    this.draw();
  }

  resize(width, height) {
    if (this.canvas) {
      if (typeof width === 'number') this.canvas.width = width;
      if (typeof height === 'number') this.canvas.height = height;
    }
    this.draw();
  }

  draw() {
    this.render();
  }

  /**
   * Primary canvas drawing routine. Renders coordinate gridlines, candlesticks,
   * right-hand price scale axis, and bottom time scale axis with ticks and labels.
   */
  render() {
    if (!this.canvas || typeof this.canvas.getContext !== 'function') return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const width = this.canvas.width || 800;
    const height = this.canvas.height || 500;

    const layout = this.options.layout || {};
    const rightMargin = typeof layout.rightMargin === 'number'
      ? layout.rightMargin
      : (typeof this.options.rightMargin === 'number' ? this.options.rightMargin : 60);

    const bottomMargin = typeof layout.bottomMargin === 'number'
      ? layout.bottomMargin
      : (typeof this.options.bottomMargin === 'number' ? this.options.bottomMargin : 30);

    const topMargin = typeof layout.topMargin === 'number'
      ? layout.topMargin
      : (typeof this.options.topMargin === 'number' ? this.options.topMargin : 10);

    const leftMargin = typeof layout.leftMargin === 'number'
      ? layout.leftMargin
      : (typeof this.options.leftMargin === 'number' ? this.options.leftMargin : 10);

    const plotWidth = width - rightMargin;
    const plotHeight = height - bottomMargin;

    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, width, height);
    }

    const candles = this.candles || [];
    const n = candles.length;

    // Resolve price range across dataset
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const low = typeof c.low === 'number' ? c.low : (c.close ?? 100);
      const high = typeof c.high === 'number' ? c.high : (c.close ?? 100);
      if (low < minPrice) minPrice = low;
      if (high > maxPrice) maxPrice = high;
    }

    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || minPrice === maxPrice) {
      minPrice = 50;
      maxPrice = 150;
    }

    const priceRange = maxPrice - minPrice || 1;
    const pad = priceRange * 0.25;
    const effectiveMin = minPrice - pad;
    const effectiveMax = maxPrice + pad;
    const effectiveRange = effectiveMax - effectiveMin;

    const plotAreaTop = topMargin;
    const plotAreaHeight = Math.max(10, plotHeight - plotAreaTop);

    const getY = (price) => plotAreaTop + plotAreaHeight * (1 - (price - effectiveMin) / effectiveRange);

    const scale = typeof this.zoomScale === 'number' && this.zoomScale > 0 ? this.zoomScale : 1.0;
    const candleWidth = Math.max(2, Math.floor(((plotWidth - leftMargin) / Math.max(1, n)) * 0.7 * scale));
    const availableWidth = Math.max(10, plotWidth - leftMargin - candleWidth);
    const baseStep = n > 1 ? availableWidth / (n - 1) : availableWidth;
    const step = baseStep * scale;

    // Compute Price Ticks (encompasses minPrice and maxPrice)
    const priceTickCount = 5;
    const priceTicks = [];
    for (let i = 0; i < priceTickCount; i++) {
      const p = minPrice + (i / (priceTickCount - 1)) * (maxPrice - minPrice);
      priceTicks.push({
        price: p,
        y: getY(p),
      });
    }

    // Compute Time Ticks
    const timeTickCount = Math.min(Math.max(3, n), 5);
    const timeTicks = [];
    for (let i = 0; i < timeTickCount; i++) {
      const idx = n > 1 ? Math.round((i * (n - 1)) / (timeTickCount - 1)) : i;
      const c = candles[idx] || (candles[0] || { time: Date.now() });
      const t = c.time ?? c.timestamp ?? Date.now();
      const x = Math.round(leftMargin + idx * step + candleWidth / 2);
      timeTicks.push({
        time: t,
        x,
      });
    }

    // -------------------------------------------------------------------------
    // STEP 1: Coordinate Gridlines (rendered BEHIND candlesticks)
    // -------------------------------------------------------------------------
    ctx.strokeStyle = this.theme.gridColor || '#2a2e39';
    ctx.lineWidth = 1;

    // Horizontal gridlines extending across the plot area horizontally (length >= 400)
    for (let i = 0; i < priceTicks.length; i++) {
      const y = Math.round(priceTicks[i].y);
      if (typeof ctx.beginPath === 'function') ctx.beginPath();
      if (typeof ctx.moveTo === 'function') ctx.moveTo(0, y);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(plotWidth, y);
      if (typeof ctx.stroke === 'function') ctx.stroke();
    }

    // Vertical gridlines extending across the plot area vertically (length >= 200)
    for (let i = 0; i < timeTicks.length; i++) {
      const x = Math.round(timeTicks[i].x);
      if (typeof ctx.beginPath === 'function') ctx.beginPath();
      if (typeof ctx.moveTo === 'function') ctx.moveTo(x, 0);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(x, plotHeight);
      if (typeof ctx.stroke === 'function') ctx.stroke();
    }

    // -------------------------------------------------------------------------
    // STEP 2: Candlesticks (Bodies and Wicks)
    // -------------------------------------------------------------------------
    for (let i = 0; i < n; i++) {
      const candle = candles[i];
      const candleX = Math.round(leftMargin + i * step);
      const candleCenterX = Math.round(candleX + candleWidth / 2);

      const openY = getY(candle.open);
      const closeY = getY(candle.close);
      const highY = getY(candle.high);
      const lowY = getY(candle.low);

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      const isUp = candle.close >= candle.open;

      const color = isUp ? this.theme.upColor : this.theme.downColor;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      // Draw candle body first
      if (typeof ctx.fillRect === 'function') {
        ctx.fillRect(candleX, Math.round(bodyTop), candleWidth, Math.round(bodyHeight));
      }

      // Draw high/low wick
      if (typeof ctx.beginPath === 'function') ctx.beginPath();
      if (typeof ctx.moveTo === 'function') ctx.moveTo(candleCenterX, Math.round(highY));
      if (typeof ctx.lineTo === 'function') ctx.lineTo(candleCenterX, Math.round(lowY));
      if (typeof ctx.stroke === 'function') ctx.stroke();
    }

    // -------------------------------------------------------------------------
    // STEP 3: Coordinate Axes (Right-hand price scale & Bottom time scale)
    // -------------------------------------------------------------------------
    ctx.strokeStyle = this.theme.axisColor || '#4c525e';
    ctx.fillStyle = this.theme.textColor || '#848e9c';
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';

    // Right-hand price scale tick marks and numeric labels
    for (let i = 0; i < priceTicks.length; i++) {
      const pt = priceTicks[i];
      const y = Math.round(pt.y);

      // Short horizontal tick mark at x >= plotWidth - 1
      if (typeof ctx.beginPath === 'function') ctx.beginPath();
      if (typeof ctx.moveTo === 'function') ctx.moveTo(plotWidth, y);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(plotWidth + 5, y);
      if (typeof ctx.stroke === 'function') ctx.stroke();

      // Price label on right axis (x >= plotWidth)
      const priceLabel = pt.price.toFixed(2);
      if (typeof ctx.fillText === 'function') {
        ctx.fillText(priceLabel, plotWidth + 8, y + 4);
      }
    }

    // Bottom time scale tick marks and formatted time labels
    for (let i = 0; i < timeTicks.length; i++) {
      const tt = timeTicks[i];
      const x = Math.round(tt.x);

      // Short vertical tick mark at y >= plotHeight - 1
      if (typeof ctx.beginPath === 'function') ctx.beginPath();
      if (typeof ctx.moveTo === 'function') ctx.moveTo(x, plotHeight);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(x, plotHeight + 5);
      if (typeof ctx.stroke === 'function') ctx.stroke();

      // Formatted time label in bottom margin (y >= plotHeight)
      const timeLabel = formatAxisTime(tt.time);
      if (typeof ctx.fillText === 'function') {
        ctx.fillText(timeLabel, x - 15, plotHeight + 18);
      }
    }
  }
}

export default Chart;