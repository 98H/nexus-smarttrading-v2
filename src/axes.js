/**
 * SmartTrading-V2 — Coordinate Axes Renderer
 * Handles rendering of background coordinate gridlines, right-hand vertical price scale,
 * and bottom horizontal time scale across active candlestick chart areas.
 */

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

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c) continue;

    const open = typeof c.open === 'number' ? c.open : (typeof c.close === 'number' ? c.close : 0);
    const close = typeof c.close === 'number' ? c.close : open;
    const low = typeof c.low === 'number' ? c.low : Math.min(open, close);
    const high = typeof c.high === 'number' ? c.high : Math.max(open, close);
    const time = typeof c.time === 'number' ? c.time : (typeof c.timestamp === 'number' ? c.timestamp : 0);

    if (low < minPrice) minPrice = low;
    if (high > maxPrice) maxPrice = high;
    if (time < minTime) minTime = time;
    if (time > maxTime) maxTime = time;
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
  } else if (minTime === maxTime) {
    minTime -= 60;
    maxTime += 60;
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
   */
  constructor(options) {
    const opts = options || {};
    this.canvas = opts.canvas || null;
    this.context =
      opts.context ||
      (this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null);
    this.priceAxisWidth = opts.priceAxisWidth !== undefined ? opts.priceAxisWidth : 70;
    this.timeAxisHeight = opts.timeAxisHeight !== undefined ? opts.timeAxisHeight : 50;

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

    this.gridColor = opts.gridColor || '#2a2e39';
    this.axisColor = opts.axisColor || '#363c4e';
    this.textColor = opts.textColor || '#787b86';
    this.font = opts.font || '11px sans-serif';
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
      top: top,
      left: left,
      width: Math.max(0, width - left - this.priceAxisWidth),
      height: Math.max(0, height - top - this.timeAxisHeight),
    };
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
  }

  /**
   * Renders horizontal and vertical background gridlines across active plot area.
   *
   * @param {Object} [ranges={}]
   * @param {{ min: number, max: number }} [ranges.priceRange]
   * @param {{ min: number, max: number }} [ranges.timeRange]
   */
  renderGridlines(ranges) {
    const ctx = this.context || (this.canvas && this.canvas.getContext('2d'));
    if (!ctx) return;

    const plotArea = this.plotArea;
    const hSteps = 5;
    const vSteps = 5;

    ctx.save();
    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 1;

    // Horizontal gridlines: span across full plot width (x: left -> left + width)
    for (let i = 0; i <= hSteps; i++) {
      const y = plotArea.top + (plotArea.height * i) / hSteps;
      ctx.beginPath();
      ctx.moveTo(plotArea.left, y);
      ctx.lineTo(plotArea.left + plotArea.width, y);
      ctx.stroke();
    }

    // Vertical gridlines: span across full plot height (y: top -> top + height)
    for (let i = 0; i <= vSteps; i++) {
      const x = plotArea.left + (plotArea.width * i) / vSteps;
      ctx.beginPath();
      ctx.moveTo(x, plotArea.top);
      ctx.lineTo(x, plotArea.top + plotArea.height);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draws a right-hand vertical price scale axis with price tick labels.
   *
   * @param {Object} [range={}]
   * @param {number} [range.min=100]
   * @param {number} [range.max=200]
   */
  renderPriceScale(range) {
    const ctx = this.context || (this.canvas && this.canvas.getContext('2d'));
    if (!ctx) return;

    const r = range || {};
    let min = 100;
    let max = 200;

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

    if (min === max) {
      min -= 1;
      max += 1;
    }
    const plotArea = this.plotArea;
    const axisX = plotArea.left + plotArea.width;

    ctx.save();
    ctx.strokeStyle = this.axisColor;
    ctx.fillStyle = this.textColor;
    ctx.font = this.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 1. Draw vertical price axis line separating plot and scale area
    ctx.beginPath();
    ctx.moveTo(axisX, plotArea.top);
    ctx.lineTo(axisX, plotArea.top + plotArea.height);
    ctx.stroke();

    // 2. Draw price tick marks and labels in the right-hand scale region (x >= axisX)
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const price = min + ((max - min) * i) / steps;
      const y = plotArea.top + (plotArea.height * (max - price)) / (max - min);

      // Tick mark extending rightward into scale area
      ctx.beginPath();
      ctx.moveTo(axisX, y);
      ctx.lineTo(axisX + 4, y);
      ctx.stroke();

      // Tick label strictly placed at x >= axisX
      const labelText = price.toFixed(2);
      ctx.fillText(labelText, axisX + 6, y);
    }

    ctx.restore();
  }

  /**
   * Draws a bottom horizontal time scale axis with timestamp tick marks and labels.
   *
   * @param {Object} [range={}]
   * @param {number} [range.min=1700000000]
   * @param {number} [range.max=1700086400]
   */
  renderTimeScale(range) {
    const ctx = this.context || (this.canvas && this.canvas.getContext('2d'));
    if (!ctx) return;

    const r = range || {};
    let min = 1700000000;
    let max = 1700086400;

    if (r.min !== undefined) {
      min = r.min;
    } else if (r.timeRange && r.timeRange.min !== undefined) {
      min = r.timeRange.min;
    }

    if (r.max !== undefined) {
      max = r.max;
    } else if (r.timeRange && r.timeRange.max !== undefined) {
      max = r.timeRange.max;
    }

    if (min === max) {
      min -= 1;
      max += 1;
    }
    const plotArea = this.plotArea;
    const axisY = plotArea.top + plotArea.height;

    ctx.save();
    ctx.strokeStyle = this.axisColor;
    ctx.fillStyle = this.textColor;
    ctx.font = this.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // 1. Draw horizontal time axis line separating plot and bottom scale area
    ctx.beginPath();
    ctx.moveTo(plotArea.left, axisY);
    ctx.lineTo(plotArea.left + plotArea.width, axisY);
    ctx.stroke();

    // 2. Draw timestamp tick marks and labels in the bottom scale region (y >= axisY)
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const timeVal = min + ((max - min) * i) / steps;
      const x = plotArea.left + (plotArea.width * i) / steps;

      // Tick mark: short vertical line crossing into bottom axis area (y >= axisY)
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + 5);
      ctx.stroke();

      // Timestamp label strictly placed in bottom scale region (y >= axisY)
      const date = new Date(timeVal > 1e11 ? timeVal : timeVal * 1000);
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const timeLabel = hours + ':' + minutes;

      ctx.fillText(timeLabel, x, axisY + 12);
    }

    ctx.restore();
  }

  /**
   * Renders the complete coordinate system: gridlines, price scale, and time scale.
   *
   * @param {Object} [ranges={}]
   * @param {{ min: number, max: number }} [ranges.priceRange]
   * @param {{ min: number, max: number }} [ranges.timeRange]
   */
  render(ranges) {
    const r = ranges || {};
    let priceRange = { min: 100, max: 200 };
    let timeRange = { min: 1700000000, max: 1700086400 };

    if (r.priceRange) {
      priceRange = r.priceRange;
    } else if (r.min !== undefined && r.max !== undefined) {
      priceRange = { min: r.min, max: r.max };
    }

    if (r.timeRange) {
      timeRange = r.timeRange;
    } else if (r.min !== undefined && r.max !== undefined && r.min > 1e6) {
      timeRange = { min: r.min, max: r.max };
    }

    this.renderGridlines({ priceRange: priceRange, timeRange: timeRange });
    this.renderPriceScale(priceRange);
    this.renderTimeScale(timeRange);
  }
}

export default AxesRenderer;