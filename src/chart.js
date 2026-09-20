/**
 * SmartTrading-V2 — Chart Engine & Candlestick/Axes Orchestrator
 * Integrates Candlestick rendering, AxesRenderer (DF-SCALES-01, DF-SCALES-02),
 * and analytical overlays (DF-OVERLAYS-01) within constrained viewport bounds.
 */

import { AxesRenderer, computeRanges } from './axes.js';
import {
  calculateSMA,
  calculateEMA,
  renderOverlay,
  updateIndicatorLegend,
  getClosePrice,
} from './indicators.js';

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
  if (maxPrice === minPrice) return plotTop + plotHeight / 2;
  return plotTop + ((maxPrice - price) / (maxPrice - minPrice)) * plotHeight;
}

/**
 * Maps a canvas Y pixel coordinate to a financial price value (DF-TOOLS-03).
 */
export function mapYToPrice(y, plotTop, plotHeight, minPrice, maxPrice) {
  if (plotHeight === 0) return minPrice;
  return maxPrice - ((y - plotTop) / plotHeight) * (maxPrice - minPrice);
}

/**
 * Chart Engine rendering Candlesticks, Coordinate Scales, and Indicator Overlays.
 */
export class Chart {
  /**
   * @param {HTMLCanvasElement|Object} canvas
   * @param {Object} [options={}]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    polyfillCanvasContext(this.ctx);
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
    });

    if (this.canvas) {
      this.canvas.axesRenderer = this.axesRenderer;
    }
  }

  getAxesRenderer() {
    return this.axesRenderer;
  }

  setData(data) {
    this.data = Array.isArray(data) ? [...data] : [];
    this.render();
  }

  updateData(data) {
    this.setData(data);
  }

  setOverlay(type, period = 20) {
    this.overlayType = type;
    this.period = period;
    this.render();
  }

  resize(width, height) {
    if (this.canvas) {
      if (width !== undefined) this.canvas.width = width;
      if (height !== undefined) this.canvas.height = height;
    }
    const w = this.canvas ? this.canvas.width : (width || 800);
    const h = this.canvas ? this.canvas.height : (height || 600);
    if (this.axesRenderer) {
      this.axesRenderer.resize(w, h);
    }
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

    const width = this.canvas.width || 800;
    const height = this.canvas.height || 600;

    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, width, height);
    }

    const data = this.data;

    // Redraw axes mapped accurately to current candle ranges
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
      const latestVal = values.length > 0 ? values[values.length - 1] : null;
      updateIndicatorLegend(this.legend, latestVal);
    }

    const plotArea = this.axesRenderer ? this.axesRenderer.plotArea : {
      top: 0,
      left: 0,
      width: Math.max(0, width - 70),
      height: Math.max(0, height - 50),
    };

    const ranges = computeRanges(data);
    const priceMin = ranges.priceRange.min;
    const priceMax = ranges.priceRange.max;

    // Draw candlestick bars
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
  }

  drawCandles(ctx, data, plotArea, minPrice, maxPrice) {
    if (!ctx || !Array.isArray(data) || data.length === 0) return;
    const n = data.length;
    const candleWidth = Math.max(1, Math.min(14, (plotArea.width / n) * 0.7));

    ctx.save?.();
    for (let i = 0; i < n; i++) {
      const c = data[i];
      if (!c) continue;
      const open = typeof c.open === 'number' ? c.open : (typeof c.close === 'number' ? c.close : 0);
      const close = typeof c.close === 'number' ? c.close : open;
      const high = typeof c.high === 'number' ? c.high : Math.max(open, close);
      const low = typeof c.low === 'number' ? c.low : Math.min(open, close);

      const x = plotArea.left + (n > 1 ? (i / (n - 1)) * (plotArea.width - candleWidth) + candleWidth / 2 : plotArea.width / 2);
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