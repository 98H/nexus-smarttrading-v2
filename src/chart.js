/**
 * SmartTrading-V2 — Chart Engine & Candlestick/Axes Orchestrator
 * Integrates Candlestick rendering, AxesRenderer (DF-SCALES-01, DF-SCALES-02, STORY 36.1.1),
 * pan gestures (DF-GESTURE-01), analytical overlays (DF-OVERLAYS-01),
 * and real-time streaming data updates (STORY 39.1.1: Resolve STATIC_APPLICATION).
 */

import { AxesRenderer, computeRanges } from './axes.js';
import {
  calculateSMA,
  calculateEMA,
  renderOverlay,
  updateIndicatorLegend,
  getClosePrice,
} from './indicators.js';
import { createCandleStream } from './data_generator.js';

export { AxesRenderer, computeRanges };

/**
 * Polyfills missing CanvasRenderingContext2D methods in mock/headless environments.
 *
 * @param {Object} ctx
 * @returns {Object}
 */
export function polyfillCanvasContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return ctx;
  const proto = Object.getPrototypeOf(ctx);
  const targets = proto && proto !== Object.prototype ? [ctx, proto] : [ctx];
  const noop = () => {};
  const methods = [
    'moveTo',
    'lineTo',
    'beginPath',
    'closePath',
    'stroke',
    'fill',
    'clearRect',
    'fillRect',
    'strokeRect',
    'save',
    'restore',
    'setLineDash',
    'getLineDash',
    'arc',
    'rect',
    'clip',
    'measureText',
    'fillText',
    'strokeText',
  ];

  for (const target of targets) {
    for (const m of methods) {
      if (typeof target[m] !== 'function') {
        if (m === 'measureText') {
          target[m] = () => ({ width: 0 });
        } else if (m === 'getLineDash') {
          target[m] = () => [];
        } else {
          target[m] = noop;
        }
      }
    }
  }

  return ctx;
}

/**
 * Maps a financial price value to a canvas Y pixel coordinate (DF-TOOLS-03).
 */
export function mapPriceToY(price, plotTop, plotHeight, minPrice, maxPrice) {
  if (!Number.isFinite(price)) return plotTop + plotHeight / 2;
  if (maxPrice === minPrice || !Number.isFinite(maxPrice) || !Number.isFinite(minPrice)) {
    return plotTop + plotHeight / 2;
  }
  return plotTop + ((maxPrice - price) / (maxPrice - minPrice)) * plotHeight;
}

/**
 * Maps a canvas Y pixel coordinate to a financial price value (DF-TOOLS-03).
 */
export function mapYToPrice(y, plotTop, plotHeight, minPrice, maxPrice) {
  if (!Number.isFinite(y)) return minPrice;
  if (plotHeight === 0 || !Number.isFinite(plotHeight)) return minPrice;
  if (maxPrice === minPrice || !Number.isFinite(maxPrice) || !Number.isFinite(minPrice)) {
    return minPrice;
  }
  return maxPrice - ((y - plotTop) / plotHeight) * (maxPrice - minPrice);
}

/**
 * Chart Engine rendering Candlesticks, Coordinate Scales, Indicator Overlays,
 * and managing interactive Pan/Zoom Viewport state.
 */
export class Chart {
  /**
   * @param {HTMLCanvasElement|Object} canvasOrOptions
   * @param {Object} [maybeOptions={}]
   */
  constructor(canvasOrOptions, maybeOptions = {}) {
    let canvas = canvasOrOptions;
    let options = maybeOptions || {};

    if (canvasOrOptions && typeof canvasOrOptions.getContext !== 'function' && canvasOrOptions.canvas) {
      canvas = canvasOrOptions.canvas;
      options = canvasOrOptions;
    }

    this.canvas = canvas;
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    polyfillCanvasContext(this.ctx);

    this.minZoom = typeof options.minZoom === 'number' && Number.isFinite(options.minZoom)
      ? options.minZoom
      : 0.2;
    this.maxZoom = typeof options.maxZoom === 'number' && Number.isFinite(options.maxZoom)
      ? options.maxZoom
      : 5.0;

    const initial = typeof options.initialZoom === 'number' && Number.isFinite(options.initialZoom)
      ? options.initialZoom
      : (typeof options.zoom === 'number' && Number.isFinite(options.zoom) ? options.zoom : 1.0);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, initial));

    this._viewport = {
      x: options.viewport?.x ?? 0,
      y: options.viewport?.y ?? 0,
    };

    this.renderCount = 0;
    this._isPanning = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragStartViewportX = 0;
    this._dragStartViewportY = 0;
    this._stream = null;

    this.data = Array.isArray(options.data) ? [...options.data] : [];
    this.overlayType = options.overlayType || 'EMA';
    this.period = Number(options.period) || 20;
    this.color = options.color || '#FF9800';
    this.legend = options.legend || null;
    this.indicatorValues = [];

    const priceAxisWidth = options.priceAxisWidth !== undefined ? options.priceAxisWidth : 70;
    const timeAxisHeight = options.timeAxisHeight !== undefined ? options.timeAxisHeight : 50;

    this.axesRenderer = options.axesRenderer || new AxesRenderer({
      canvas: this.canvas,
      context: this.ctx,
      priceAxisWidth,
      timeAxisHeight,
      trackElement: options.trackElement || null,
    });

    if (this.canvas) {
      this.canvas.axesRenderer = this.axesRenderer;
      this.bindEvents();
    }
  }

  get viewport() {
    return this._viewport;
  }

  set viewport(val) {
    if (val && typeof val === 'object') {
      if (typeof val.x === 'number' && Number.isFinite(val.x)) {
        this._viewport.x = val.x;
      }
      if (typeof val.y === 'number' && Number.isFinite(val.y)) {
        this._viewport.y = val.y;
      }
    }
  }

  getViewportOffset() {
    return {
      x: this._viewport.x,
      y: this._viewport.y,
    };
  }

  setViewportOffset(x = 0, y = 0) {
    this._viewport.x = typeof x === 'number' && Number.isFinite(x) ? x : 0;
    this._viewport.y = typeof y === 'number' && Number.isFinite(y) ? y : 0;
    this.render();
    return this.getViewportOffset();
  }

  pan(dx = 0, dy = 0) {
    const deltaX = typeof dx === 'number' && Number.isFinite(dx) ? dx : 0;
    const deltaY = typeof dy === 'number' && Number.isFinite(dy) ? dy : 0;
    this._viewport.x += deltaX;
    this._viewport.y += deltaY;
    this.render();
    return this.getViewportOffset();
  }

  handleMouseDown(e) {
    if (e && e.button !== undefined && e.button !== 0) return;
    this._isPanning = true;
    this._dragStartX = e?.clientX ?? 0;
    this._dragStartY = e?.clientY ?? 0;
    this._dragStartViewportX = this._viewport.x;
    this._dragStartViewportY = this._viewport.y;
  }

  handleMouseMove(e) {
    if (!this._isPanning) return;
    const clientX = e?.clientX ?? 0;
    const clientY = e?.clientY ?? 0;
    const dx = clientX - this._dragStartX;
    const dy = clientY - this._dragStartY;
    this._viewport.x = this._dragStartViewportX + dx;
    this._viewport.y = this._dragStartViewportY + dy;
    this.render();
  }

  handleMouseUp(e) {
    if (!this._isPanning) return;
    if (e) {
      const clientX = e.clientX ?? this._dragStartX;
      const clientY = e.clientY ?? this._dragStartY;
      const dx = clientX - this._dragStartX;
      const dy = clientY - this._dragStartY;
      this._viewport.x = this._dragStartViewportX + dx;
      this._viewport.y = this._dragStartViewportY + dy;
    }
    this._isPanning = false;
  }

  handleMouseLeave() {
    if (this._isPanning) {
      this._isPanning = false;
    }
  }

  handleWheel(e) {
    if (!e) return;
    if (typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    const deltaY = typeof e.deltaY === 'number' && Number.isFinite(e.deltaY) ? e.deltaY : 0;
    if (deltaY === 0) return;

    const zoomFactor = Math.exp(-deltaY * 0.001);
    if (!Number.isFinite(zoomFactor) || Number.isNaN(zoomFactor)) return;

    const newZoom = this.zoom * zoomFactor;
    this.setZoom(newZoom);
  }

  bindEvents() {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;
    this.unbindEvents();

    this.onWheel = (e) => this.handleWheel(e);
    this.onMouseDown = (e) => this.handleMouseDown(e);
    this.onMouseMove = (e) => this.handleMouseMove(e);
    this.onMouseUp = (e) => this.handleMouseUp(e);
    this.onMouseLeave = (e) => this.handleMouseLeave(e);

    this.canvas.addEventListener('wheel', this.onWheel);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
  }

  unbindEvents() {
    if (!this.canvas || typeof this.canvas.removeEventListener !== 'function') return;
    if (this.onWheel) {
      this.canvas.removeEventListener('wheel', this.onWheel);
      this.onWheel = null;
    }
    if (this.onMouseDown) {
      this.canvas.removeEventListener('mousedown', this.onMouseDown);
      this.onMouseDown = null;
    }
    if (this.onMouseMove) {
      this.canvas.removeEventListener('mousemove', this.onMouseMove);
      this.onMouseMove = null;
    }
    if (this.onMouseUp) {
      this.canvas.removeEventListener('mouseup', this.onMouseUp);
      this.onMouseUp = null;
    }
    if (this.onMouseLeave) {
      this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
      this.onMouseLeave = null;
    }
  }

  destroy() {
    this.stopStreaming();
    this.unbindEvents();
  }

  getZoom() {
    return this.zoom;
  }

  setZoom(newZoom) {
    if (typeof newZoom !== 'number' || !Number.isFinite(newZoom) || Number.isNaN(newZoom)) {
      return this.zoom;
    }
    const clamped = Math.min(this.maxZoom, Math.max(this.minZoom, newZoom));
    this.zoom = clamped;
    this.render();
    return this.zoom;
  }

  getAxesRenderer() {
    return this.axesRenderer;
  }

  getDataSeries() {
    return this.data;
  }

  setData(data) {
    this.data = Array.isArray(data) ? [...data] : [];
    this.render();
  }

  /**
   * Appends or updates candlestick items seamlessly without throwing on small batch sizes.
   * Satisfies STORY 39.1.1 real-time streaming updates.
   *
   * @param {Object|Array<Object>} data Single candle/tick or array of candles
   * @returns {Array<Object>} Updated series
   */
  updateData(data) {
    if (!data) return this.data;
    const batch = Array.isArray(data) ? data : [data];
    if (batch.length === 0) return this.data;

    if (this.data && this.data.length > 0) {
      const map = new Map();
      this.data.forEach((c) => {
        if (!c) return;
        const k = c.time ?? c.timestamp ?? c.t ?? c.date;
        if (k !== undefined) map.set(k, c);
      });
      batch.forEach((c) => {
        if (!c) return;
        const lastCandle = this.data[this.data.length - 1];
        const lastTime = lastCandle ? (lastCandle.time ?? 1700000000) : Math.floor(Date.now() / 1000);
        const k = c.time ?? c.timestamp ?? c.t ?? c.date ?? (lastTime + 60);

        if (map.has(k)) {
          const existing = map.get(k);
          const price = c.close ?? c.price ?? c.value ?? existing.close;
          map.set(k, {
            ...existing,
            ...c,
            open: c.open ?? existing.open ?? price,
            close: price,
            high: Math.max(existing.high ?? price, c.high ?? price, price),
            low: Math.min(existing.low ?? price, c.low ?? price, price),
            volume: (existing.volume || 0) + (c.volume || 0),
          });
        } else {
          const fallbackPrice = lastCandle ? (lastCandle.close ?? 100) : 100;
          const price = c.close ?? c.price ?? c.value ?? fallbackPrice;
          map.set(k, {
            time: k,
            timestamp: c.timestamp ?? (k < 1e11 ? k * 1000 : k),
            open: c.open ?? price,
            high: c.high ?? Math.max(c.open ?? price, price),
            low: c.low ?? Math.min(c.open ?? price, price),
            close: price,
            volume: c.volume || 0,
          });
        }
      });
      this.data = Array.from(map.values()).sort((a, b) => {
        const tA = a.time ?? a.timestamp ?? a.t ?? a.date ?? 0;
        const tB = b.time ?? b.timestamp ?? b.t ?? b.date ?? 0;
        return tA - tB;
      });
    } else {
      this.data = batch.map((c) => {
        const k = c.time ?? c.timestamp ?? c.t ?? c.date ?? Math.floor(Date.now() / 1000);
        const price = c.close ?? c.price ?? c.value ?? 100;
        return {
          time: k,
          timestamp: c.timestamp ?? (k < 1e11 ? k * 1000 : k),
          open: c.open ?? price,
          high: c.high ?? Math.max(c.open ?? price, price),
          low: c.low ?? Math.min(c.open ?? price, price),
          close: price,
          volume: c.volume || 0,
        };
      });
    }
    this.render();
    return this.data;
  }

  /**
   * Seamlessly updates the current candle with a streaming tick or appends a new one.
   *
   * @param {Object|number} tick Price tick or tick object
   * @returns {Array<Object>} Updated series
   */
  updateTick(tick) {
    if (!tick) return this.data;
    const price = typeof tick === 'number' ? tick : (tick.price ?? tick.close ?? tick.value);
    if (typeof price !== 'number' || !Number.isFinite(price)) return this.data;

    const tickTime = typeof tick === 'object'
      ? (tick.time ?? (tick.timestamp ? Math.floor(tick.timestamp / 1000) : null))
      : null;

    if (!Array.isArray(this.data) || this.data.length === 0) {
      const t = tickTime || Math.floor(Date.now() / 1000);
      const newCandle = {
        time: t,
        timestamp: t * 1000,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: (typeof tick === 'object' && tick.volume) || 1,
      };
      this.data = [newCandle];
      this.render();
      return this.data;
    }

    const last = this.data[this.data.length - 1];
    const lastTime = last.time ?? (last.timestamp ? Math.floor(last.timestamp / 1000) : 0);

    if (!tickTime || tickTime <= lastTime) {
      last.close = price;
      last.high = Math.max(last.high ?? price, price);
      last.low = Math.min(last.low ?? price, price);
      if (typeof tick === 'object' && tick.volume) {
        last.volume = (last.volume || 0) + tick.volume;
      }
    } else {
      const newCandle = {
        time: tickTime,
        timestamp: tickTime * 1000,
        open: last.close ?? price,
        high: Math.max(last.close ?? price, price),
        low: Math.min(last.close ?? price, price),
        close: price,
        volume: (typeof tick === 'object' && tick.volume) || 1,
      };
      this.data.push(newCandle);
    }

    this.render();
    return this.data;
  }

  appendCandle(candle) {
    return this.updateData(candle);
  }

  startStreaming(interval = 1000, options = {}) {
    if (this._stream) {
      this._stream.stop();
    }
    this._stream = createCandleStream(this, { interval, ...options });
    return this._stream;
  }

  stopStreaming() {
    if (this._stream) {
      this._stream.stop();
      this._stream = null;
    }
  }

  setOverlay(type, period = 20) {
    this.overlayType = type;
    this.period = period;
    this.render();
  }

  resize(width, height) {
    if (this.canvas) {
      if (typeof width === 'number') this.canvas.width = width;
      if (typeof height === 'number') this.canvas.height = height;
    }
    const w = (this.canvas && this.canvas.width) || width || 800;
    const h = (this.canvas && this.canvas.height) || height || 600;
    if (this.axesRenderer) {
      this.axesRenderer.resize(w, h);
    }
    this.render();
  }

  renderTimeScale(range) {
    if (this.axesRenderer) {
      return this.axesRenderer.renderTimeScale(range !== undefined ? range : this.data);
    }
  }

  renderPriceScale(range) {
    if (this.axesRenderer) {
      return this.axesRenderer.renderPriceScale(range !== undefined ? range : this.data);
    }
  }

  renderFrame() {
    this.render();
  }

  render() {
    if (!this.canvas) return;
    if (!this.ctx && typeof this.canvas.getContext === 'function') {
      this.ctx = this.canvas.getContext('2d');
    }
    polyfillCanvasContext(this.ctx);
    const ctx = this.ctx;
    if (!ctx) return;

    this.renderCount = (this.renderCount || 0) + 1;

    const width = (this.canvas && this.canvas.width) || 800;
    const height = (this.canvas && this.canvas.height) || 600;

    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, width, height);
    }

    // Ensure coordinate scales and time axis are rendered in untransformed screen space
    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const data = this.data;

    // Redraw coordinate axes and time scale mapped to current candle ranges
    if (this.axesRenderer) {
      this.axesRenderer.context = ctx;
      this.axesRenderer.canvas = this.canvas;
      this.axesRenderer.resize(width, height);
      this.axesRenderer.render(data);
    }

    if (!Array.isArray(data) || data.length === 0) return;

    const values = this.overlayType === 'SMA'
      ? calculateSMA(data, this.period)
      : calculateEMA(data, this.period);

    this.indicatorValues = values;

    if (this.legend) {
      let latestVal = null;
      if (Array.isArray(values) && values.length > 0) {
        latestVal = values[values.length - 1];
        if (latestVal === null && data.length > 0) {
          latestVal = getClosePrice(data[data.length - 1]);
        }
      } else if (data.length > 0) {
        latestVal = getClosePrice(data[data.length - 1]);
      }
      updateIndicatorLegend(this.legend, latestVal);
    }

    const plotArea = (this.axesRenderer && this.axesRenderer.plotArea) ? this.axesRenderer.plotArea : {
      top: 0,
      left: 0,
      width: Math.max(0, width - 70),
      height: Math.max(0, height - 50),
    };

    const ranges = computeRanges(data);
    const priceMin = ranges.priceRange.min;
    const priceMax = ranges.priceRange.max;

    // Apply viewport transform for candlesticks and indicators, clipped to plot bounds
    ctx.save?.();
    if (typeof ctx.beginPath === 'function' && typeof ctx.rect === 'function' && typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.rect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);
      ctx.clip();
    }
    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(1, 0, 0, 1, this._viewport.x, this._viewport.y);
    }

    // Draw candlestick bars reflecting active zoom scale across viewport sectors
    this.drawCandles(ctx, data, plotArea, priceMin, priceMax);

    // Analytical indicator overlay mapping
    const coordinates = values.map((val, idx) => {
      const x = plotArea.left + (data.length > 1 ? (idx / (data.length - 1)) * plotArea.width : plotArea.width / 2);
      if (val === null || val === undefined || Number.isNaN(val)) {
        return { x, y: 0 };
      }
      const y = mapPriceToY(val, plotArea.top, plotArea.height, priceMin, priceMax);
      return { x, y };
    });

    renderOverlay(ctx, values, coordinates, {
      color: this.color,
      lineWidth: 2,
    });

    ctx.restore?.();
  }

  drawCandles(ctx, data, plotArea, minPrice, maxPrice) {
    if (!ctx || !Array.isArray(data) || data.length === 0) return;
    const n = data.length;
    const plotWidth = Number.isFinite(plotArea.width) && plotArea.width > 0 ? plotArea.width : 1;
    const baseWidth = Math.max(1, Math.min(14, (plotWidth / n) * 0.7));
    const candleWidth = Math.max(1, Math.min(plotWidth / Math.max(1, n), baseWidth * this.zoom));

    ctx.save?.();
    for (let i = 0; i < n; i++) {
      const c = data[i];
      if (!c) continue;
      const open = typeof c.open === 'number' && Number.isFinite(c.open) ? c.open : (typeof c.close === 'number' && Number.isFinite(c.close) ? c.close : 0);
      const close = typeof c.close === 'number' && Number.isFinite(c.close) ? c.close : open;
      const high = typeof c.high === 'number' && Number.isFinite(c.high) ? c.high : Math.max(open, close);
      const low = typeof c.low === 'number' && Number.isFinite(c.low) ? c.low : Math.min(open, close);

      const x = plotArea.left + (n > 1 ? (i / (n - 1)) * (plotWidth - candleWidth) + candleWidth / 2 : plotWidth / 2);
      const yHigh = mapPriceToY(high, plotArea.top, plotArea.height, minPrice, maxPrice);
      const yLow = mapPriceToY(low, plotArea.top, plotArea.height, minPrice, maxPrice);
      const yOpen = mapPriceToY(open, plotArea.top, plotArea.height, minPrice, maxPrice);
      const yClose = mapPriceToY(close, plotArea.top, plotArea.height, minPrice, maxPrice);

      const isUp = close >= open;
      const color = isUp ? '#26a69a' : '#ef5350';

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;

      // Draw wick
      ctx.beginPath?.();
      ctx.moveTo?.(x, yHigh);
      ctx.lineTo?.(x, yLow);
      ctx.stroke?.();

      // Draw body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
      if (typeof ctx.fillRect === 'function') {
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      }
    }
    ctx.restore?.();
  }
}

Chart.AxesRenderer = AxesRenderer;
Chart.computeRanges = computeRanges;
Chart.Chart = Chart;

export default Chart;