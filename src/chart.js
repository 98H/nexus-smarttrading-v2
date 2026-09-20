/**
 * SmartTrading-V2 — Candlestick Chart Engine
 * Manages quantitative candlestick series rendering, pan/zoom interaction,
 * and integrated background gridlines and scale axes coordinate systems.
 */

import { AxesRenderer, computeRanges } from './axes.js';

export { AxesRenderer, computeRanges };

export class Chart {
  /**
   * @param {HTMLElement|Object} [container] - Mount container or options
   * @param {Object} [options={}]
   */
  constructor(container, options) {
    let opts = options || {};
    let mountContainer = container || null;

    if (
      container &&
      typeof container === 'object' &&
      !('nodeType' in container) &&
      typeof container.appendChild !== 'function' &&
      typeof container.getContext !== 'function'
    ) {
      opts = container;
      mountContainer = null;
    }

    this.options = opts;
    this.container = mountContainer;

    if (this.container && typeof this.container.getContext === 'function') {
      this.canvas = this.container;
    } else if (opts.canvas) {
      this.canvas = opts.canvas;
    } else if (
      this.container &&
      typeof this.container.querySelector === 'function' &&
      this.container.querySelector('canvas')
    ) {
      this.canvas = this.container.querySelector('canvas');
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this.canvas = document.createElement('canvas');
      if (this.container && typeof this.container.appendChild === 'function') {
        this.container.appendChild(this.canvas);
      }
    } else {
      this.canvas = null;
    }

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

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.context =
      opts.context ||
      (this.canvas && typeof this.canvas.getContext === 'function'
        ? this.canvas.getContext('2d')
        : null);

    this.priceAxisWidth =
      opts.priceAxisWidth !== undefined
        ? opts.priceAxisWidth
        : (opts.priceScaleWidth !== undefined ? opts.priceScaleWidth : 70);
    this.timeAxisHeight =
      opts.timeAxisHeight !== undefined
        ? opts.timeAxisHeight
        : (opts.timeScaleHeight !== undefined ? opts.timeScaleHeight : 50);

    const plotWidth = Math.max(0, width - this.priceAxisWidth);
    const plotHeight = Math.max(0, height - this.timeAxisHeight);
    this.plotArea = {
      top: 0,
      left: 0,
      width: plotWidth,
      height: plotHeight,
    };

    this.axesRenderer = new AxesRenderer({
      canvas: this.canvas,
      context: this.context,
      plotArea: this.plotArea,
      priceAxisWidth: this.priceAxisWidth,
      timeAxisHeight: this.timeAxisHeight,
    });

    if (this.canvas) {
      this.canvas.axesRenderer = this.axesRenderer;
    }

    this.viewportOffset = { x: 0, y: 0 };
    this.zoomScale = 1;
    this.timeframe = opts.timeframe || '1h';
    this.ticker = opts.ticker || 'BTC-USD';

    this.candles = opts.candles ||
      opts.data || [
        { time: 1700000000, open: 120, high: 165, low: 110, close: 155 },
        { time: 1700018000, open: 155, high: 180, low: 145, close: 175 },
        { time: 1700036000, open: 175, high: 195, low: 160, close: 165 },
        { time: 1700054000, open: 165, high: 185, low: 150, close: 180 },
        { time: 1700072000, open: 180, high: 198, low: 170, close: 190 },
        { time: 1700086400, open: 190, high: 200, low: 175, close: 195 },
      ];

    this._timerId = null;
    this._isDragging = false;
    this._lastX = 0;
    this._lastY = 0;

    this._bindEvents();

    if (opts.autoRender !== false) {
      this.render();
    }
  }

  /**
   * Mounts the chart into a container element.
   *
   * @param {HTMLElement} [container]
   * @returns {Chart}
   */
  mount(container) {
    if (container) {
      this.container = container;
      if (
        this.canvas &&
        typeof container.appendChild === 'function' &&
        this.canvas.parentNode !== container
      ) {
        container.appendChild(this.canvas);
      }
    }
    this.render();
    return this;
  }

  /**
   * Unmounts canvas and destroys active subscriptions.
   *
   * @returns {Chart}
   */
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

  /**
   * Initializes chart state and renders frame.
   *
   * @returns {Chart}
   */
  init() {
    this.render();
    return this;
  }

  /**
   * Returns active coordinate axes renderer.
   *
   * @returns {AxesRenderer}
   */
  getAxesRenderer() {
    return this.axesRenderer;
  }

  /**
   * Sets active axes renderer instance.
   *
   * @param {AxesRenderer} renderer
   */
  setAxesRenderer(renderer) {
    this.axesRenderer = renderer;
    if (this.canvas) {
      this.canvas.axesRenderer = renderer;
    }
    this.render();
  }

  setTimeframe(tf) {
    this.timeframe = tf;
    this.render();
  }

  getTimeframe() {
    return this.timeframe;
  }

  setTicker(ticker) {
    this.ticker = ticker;
    this.render();
  }

  getTicker() {
    return this.ticker;
  }

  /**
   * Updates chart canvas and plot area dimensions.
   *
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const plotWidth = Math.max(0, width - this.priceAxisWidth);
    const plotHeight = Math.max(0, height - this.timeAxisHeight);
    this.plotArea = {
      top: 0,
      left: 0,
      width: plotWidth,
      height: plotHeight,
    };
    if (this.axesRenderer && typeof this.axesRenderer.resize === 'function') {
      this.axesRenderer.resize(width, height);
    }
    this.render();
  }

  handleResize(width, height) {
    this.resize(width, height);
  }

  onResize(width, height) {
    this.resize(width, height);
  }

  /**
   * Updates candlestick dataset and triggers coordinate redraw.
   *
   * @param {Array<Object>|Object} candles
   * @returns {Array<Object>}
   */
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
          if (itemTime === time) {
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
      this.candles.push(candles);
    }
    this.render();
    return this.candles;
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

  /**
   * Main active draw lifecycle executing coordinate calculations and layer drawing.
   */
  draw() {
    const ctx =
      this.context ||
      (this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null);
    if (!ctx) return;

    const width = (this.canvas && this.canvas.width) || 800;
    const height = (this.canvas && this.canvas.height) || 600;

    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, width, height);
    }

    // Active draw lifecycle: coordinate domain range calculation
    const ranges = computeRanges(this.candles);
    this.currentRanges = ranges;

    // 1. Draw coordinate axes: background gridlines across active plot area
    if (this.axesRenderer && typeof this.axesRenderer.renderGridlines === 'function') {
      this.axesRenderer.renderGridlines(ranges);
    }

    // 2. Draw candlestick series across active plot area
    this.renderCandlesticks(ctx, ranges);

    // 3. Draw coordinate scale axes: right-hand price scale & bottom time scale
    if (this.axesRenderer) {
      if (typeof this.axesRenderer.renderPriceScale === 'function') {
        this.axesRenderer.renderPriceScale(ranges.priceRange);
      }
      if (typeof this.axesRenderer.renderTimeScale === 'function') {
        this.axesRenderer.renderTimeScale(ranges.timeRange);
      }
    }

    return this;
  }

  render() {
    return this.draw();
  }

  /**
   * Renders candlestick shapes within plotArea bounds.
   */
  renderCandlesticks(ctx, ranges) {
    if (!Array.isArray(this.candles) || this.candles.length === 0) return;

    const plotArea = this.plotArea;
    const priceRange = ranges.priceRange;
    const timeRange = ranges.timeRange;
    const pMin = priceRange.min;
    const pMax = priceRange.max;
    const pSpan = pMax - pMin || 1;

    const tMin = timeRange.min;
    const tMax = timeRange.max;
    const tSpan = tMax - tMin || 1;

    const candleCount = this.candles.length;
    const candleWidth = Math.max(2, Math.min(24, (plotArea.width / (candleCount + 1)) * 0.7));

    ctx.save();
    for (let i = 0; i < this.candles.length; i++) {
      const candle = this.candles[i];
      if (!candle) continue;

      const time =
        candle.time !== undefined ? candle.time : (candle.timestamp !== undefined ? candle.timestamp : 0);
      const open =
        typeof candle.open === 'number'
          ? candle.open
          : (typeof candle.close === 'number' ? candle.close : 0);
      const close = typeof candle.close === 'number' ? candle.close : open;
      const high = typeof candle.high === 'number' ? candle.high : Math.max(open, close);
      const low = typeof candle.low === 'number' ? candle.low : Math.min(open, close);

      const isBullish = close >= open;
      const color = isBullish ? '#26a69a' : '#ef5350';

      const x = plotArea.left + ((time - tMin) / tSpan) * plotArea.width;
      const yHigh = plotArea.top + plotArea.height * (1 - (high - pMin) / pSpan);
      const yLow = plotArea.top + plotArea.height * (1 - (low - pMin) / pSpan);
      const yOpen = plotArea.top + plotArea.height * (1 - (open - pMin) / pSpan);
      const yClose = plotArea.top + plotArea.height * (1 - (close - pMin) / pSpan);

      // Draw wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Draw body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
      ctx.fillStyle = color;
      if (typeof ctx.fillRect === 'function') {
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      }
    }
    ctx.restore();
  }

  /* -------------------------------------------------------------------------- */
  /* Interactive Event Handlers & Pan/Zoom Lifecycle                            */
  /* -------------------------------------------------------------------------- */

  handleMouseDown(e) {
    this._isDragging = true;
    this._lastX = (e && e.clientX) || 0;
    this._lastY = (e && e.clientY) || 0;
  }

  onMouseDown(e) {
    this.handleMouseDown(e);
  }

  handleMouseMove(e) {
    if (!this._isDragging) return;
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
    this._isDragging = false;
  }

  onMouseUp(e) {
    this.handleMouseUp(e);
  }

  handleWheel(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const zoomFactor = e && e.deltaY < 0 ? 1.1 : 0.9;
    this.handleZoom(zoomFactor);
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
    this.zoomScale = Math.max(0.2, Math.min(5, this.zoomScale * zoomFactor));
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
    this._boundWheel = (e) => this.onWheel(e);
    this._boundClick = (e) => this.onClick(e);

    this._onMouseDown = this._boundMouseDown;
    this._onMouseMove = this._boundMouseMove;
    this._onMouseUp = this._boundMouseUp;
    this._onWheel = this._boundWheel;

    this.canvas.addEventListener('mousedown', this._boundMouseDown);
    this.canvas.addEventListener('mousemove', this._boundMouseMove);
    this.canvas.addEventListener('mouseup', this._boundMouseUp);
    this.canvas.addEventListener('wheel', this._boundWheel);
    this.canvas.addEventListener('click', this._boundClick);
  }

  _unbindEvents() {
    if (!this.canvas || typeof this.canvas.removeEventListener !== 'function') return;
    if (this._boundMouseDown) this.canvas.removeEventListener('mousedown', this._boundMouseDown);
    if (this._boundMouseMove) this.canvas.removeEventListener('mousemove', this._boundMouseMove);
    if (this._boundMouseUp) this.canvas.removeEventListener('mouseup', this._boundMouseUp);
    if (this._boundWheel) this.canvas.removeEventListener('wheel', this._boundWheel);
    if (this._boundClick) this.canvas.removeEventListener('click', this._boundClick);
  }

  /* -------------------------------------------------------------------------- */
  /* Real-time Tick Loop Lifecycle                                              */
  /* -------------------------------------------------------------------------- */

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
    }
  }
}

export default Chart;