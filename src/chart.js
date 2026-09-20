/**
 * SmartTrading-V2 — Core Chart Canvas Component
 * High-performance 2D composite candlestick rendering engine with viewport transformations,
 * multi-timeframe candle management, and interactive gestures.
 */

export const DEFAULT_MIN_ZOOM = 0.5;
export const DEFAULT_MAX_ZOOM = 5.0;

export class Chart {
  constructor(canvasOrOptions, options = {}) {
    let canvas;
    let opts;
    if (
      canvasOrOptions &&
      canvasOrOptions.canvas &&
      (typeof canvasOrOptions.getContext !== 'function' ||
        canvasOrOptions.elements !== undefined ||
        canvasOrOptions.initialViewport !== undefined)
    ) {
      canvas = canvasOrOptions.canvas;
      opts = canvasOrOptions;
    } else {
      canvas = canvasOrOptions;
      opts = options || {};
    }

    if (!canvas) {
      throw new Error('Canvas element is required for Chart initialization');
    }

    this.canvas = canvas;
    this.options = opts;
    this.elements = opts.elements ? [...opts.elements] : [];
    this.candles = opts.candles || opts.data ? [...(opts.candles || opts.data)] : [];
    this.data = this.candles;
    this.timeframe = opts.defaultTimeframe || opts.timeframe || '1m';

    const initialViewport = opts.initialViewport || {};
    const initScale =
      initialViewport.scale !== undefined
        ? initialViewport.scale
        : opts.initialZoom !== undefined
          ? opts.initialZoom
          : opts.zoom !== undefined
            ? opts.zoom
            : 1.0;

    const initOffsetX =
      initialViewport.offsetX !== undefined
        ? initialViewport.offsetX
        : (opts.initialOffset?.x ?? opts.offset?.x ?? 0);

    const initOffsetY =
      initialViewport.offsetY !== undefined
        ? initialViewport.offsetY
        : (opts.initialOffset?.y ?? opts.offset?.y ?? 0);

    this.minZoom = opts.minZoom !== undefined ? opts.minZoom : Math.min(DEFAULT_MIN_ZOOM, initScale);
    this.maxZoom = opts.maxZoom !== undefined ? opts.maxZoom : Math.max(DEFAULT_MAX_ZOOM, initScale);

    this.viewport = {
      offsetX: initOffsetX,
      offsetY: initOffsetY,
      scale: initScale,
    };

    this.isPanning = false;
    this.renderCount = 0;
    this.frameCount = 0;
    this.animationTimer = null;
    this.dragStartPoint = { x: 0, y: 0 };
    this.dragStartOffset = { x: 0, y: 0 };

    this.timeScale = { min: 0, max: 1 };
    this.priceScale = { min: 0, max: 1 };

    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);

    if (typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
      this.canvas.addEventListener('mousedown', this.handleMouseDown);
      this.canvas.addEventListener('mousemove', this.handleMouseMove);
      this.canvas.addEventListener('mouseup', this.handleMouseUp);
      this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
    }

    this.updateScales();
  }

  start(fps = 60) {
    if (this.animationTimer) return;
    const intervalMs = Math.max(1, Math.round(1000 / fps));
    this.animationTimer = setInterval(() => {
      this.frameCount++;
      this.render();
    }, intervalMs);
  }

  stop() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
  }

  getFrameCount() {
    return this.frameCount;
  }

  getTimeframe() {
    return this.timeframe || '1m';
  }

  setTimeframe(tf) {
    this.timeframe = tf;
  }

  getCandles() {
    return this.candles || [];
  }

  get zoom() {
    return this.viewport.scale;
  }

  set zoom(val) {
    this.viewport.scale = val;
  }

  get viewportOffset() {
    return {
      x: this.viewport.offsetX,
      y: this.viewport.offsetY,
    };
  }

  set viewportOffset(val) {
    if (val) {
      this.viewport.offsetX = val.x ?? this.viewport.offsetX;
      this.viewport.offsetY = val.y ?? this.viewport.offsetY;
    }
  }

  get offsetX() {
    return this.viewport.offsetX;
  }

  get offsetY() {
    return this.viewport.offsetY;
  }

  getViewportOffset() {
    return { x: this.viewport.offsetX, y: this.viewport.offsetY };
  }

  getViewportMatrix() {
    const scale = this.viewport.scale ?? 1.0;
    return [scale, 0, 0, scale, this.viewport.offsetX, this.viewport.offsetY];
  }

  getElementRenderPosition(id) {
    let el = null;
    if (Array.isArray(this.elements)) {
      el = this.elements.find((item) => item.id === id);
    } else if (this.elements instanceof Map) {
      el = this.elements.get(id);
    } else if (this.elements && typeof this.elements === 'object') {
      el = this.elements[id];
    }
    if (!el) return null;
    const scale = this.viewport.scale ?? 1.0;
    return {
      x: el.x * scale + this.viewport.offsetX,
      y: el.y * scale + this.viewport.offsetY,
    };
  }

  getZoom() {
    return this.viewport.scale;
  }

  getTimeScale() {
    this.updateScales();
    const width = this.canvas.width || 800;
    return {
      min: this.timeScale.min,
      max: this.timeScale.max,
      domain: [this.timeScale.min, this.timeScale.max],
      range: [0, width],
      zoom: this.zoom,
    };
  }

  getPriceScale() {
    this.updateScales();
    const height = this.canvas.height || 600;
    return {
      min: this.priceScale.min,
      max: this.priceScale.max,
      domain: [this.priceScale.min, this.priceScale.max],
      range: [height, 0],
      zoom: this.zoom,
    };
  }

  updateScales() {
    if (!this.data || this.data.length === 0) {
      this.timeScale = { min: 0, max: 1 };
      this.priceScale = { min: 0, max: 1 };
      return;
    }

    let minTime = Infinity;
    let maxTime = -Infinity;
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (let i = 0; i < this.data.length; i++) {
      const c = this.data[i];
      const time = c.time !== undefined ? c.time : (c.timestamp !== undefined ? c.timestamp : i);
      if (time < minTime) minTime = time;
      if (time > maxTime) maxTime = time;
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }

    const timeSpan = maxTime - minTime || 3600;
    const centerTime = (minTime + maxTime) / 2;
    const visibleTimeSpan = timeSpan / this.zoom;

    const priceSpan = maxPrice - minPrice || 10;
    const centerPrice = (minPrice + maxPrice) / 2;
    const visiblePriceSpan = priceSpan / this.zoom;

    this.timeScale = {
      min: centerTime - visibleTimeSpan / 2,
      max: centerTime + visibleTimeSpan / 2,
    };

    this.priceScale = {
      min: centerPrice - visiblePriceSpan / 2,
      max: centerPrice + visiblePriceSpan / 2,
    };
  }

  handleMouseDown(event) {
    if (event.button !== 0) {
      return;
    }
    this.isPanning = true;
    this.dragStartPoint = {
      x: event.clientX ?? 0,
      y: event.clientY ?? 0,
    };
    this.dragStartOffset = {
      x: this.viewport.offsetX,
      y: this.viewport.offsetY,
    };
  }

  handleMouseMove(event) {
    if (!this.isPanning) {
      return;
    }
    const clientX = event.clientX ?? 0;
    const clientY = event.clientY ?? 0;
    const deltaX = clientX - this.dragStartPoint.x;
    const deltaY = clientY - this.dragStartPoint.y;

    const nextOffsetX = this.dragStartOffset.x + deltaX;
    const nextOffsetY = this.dragStartOffset.y + deltaY;

    if (nextOffsetX === this.viewport.offsetX && nextOffsetY === this.viewport.offsetY) {
      return;
    }

    this.viewport.offsetX = nextOffsetX;
    this.viewport.offsetY = nextOffsetY;

    this.render();
  }

  handleMouseUp() {
    this.isPanning = false;
  }

  handleMouseLeave() {
    this.isPanning = false;
  }

  handleWheel(event) {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const deltaY = event.deltaY ?? 0;
    if (deltaY === 0) return;

    const zoomFactor = Math.exp(-deltaY * 0.001);
    const nextZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * zoomFactor));

    if (nextZoom === this.zoom) return;

    this.zoom = nextZoom;
    this.updateScales();
    this.render();
  }

  render(candles, timeframe) {
    this.renderCount++;
    if (candles !== undefined) {
      this.candles = candles;
      this.data = candles;
    }
    if (timeframe !== undefined) {
      this.timeframe = timeframe;
    }

    const ctx = this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;
    if (!ctx) return;

    const width = this.canvas.width || 800;
    const height = this.canvas.height || 600;

    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, width, height);
    }

    if (typeof ctx.setTransform === 'function') {
      const matrix = this.getViewportMatrix();
      ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    }

    if (this.elements && Array.isArray(this.elements)) {
      for (const el of this.elements) {
        if (typeof ctx.fillRect === 'function' && el.x !== undefined && el.y !== undefined) {
          ctx.fillRect(el.x, el.y, el.width || 10, el.height || 10);
        }
      }
    }

    if (!this.data || this.data.length === 0) return;

    this.updateScales();
    const { min: minTime, max: maxTime } = this.timeScale;
    const { min: minPrice, max: maxPrice } = this.priceScale;

    const timeRange = maxTime - minTime || 1;
    const priceRange = maxPrice - minPrice || 1;
    const candleWidth = Math.max(2, (width / this.data.length) * 0.6 * this.zoom);

    for (let i = 0; i < this.data.length; i++) {
      const candle = this.data[i];
      const time = candle.time !== undefined ? candle.time : (candle.timestamp !== undefined ? candle.timestamp : i);
      const x = ((time - minTime) / timeRange) * width + this.viewport.offsetX;
      const yHigh = height - ((candle.high - minPrice) / priceRange) * height + this.viewport.offsetY;
      const yLow = height - ((candle.low - minPrice) / priceRange) * height + this.viewport.offsetY;
      const yOpen = height - ((candle.open - minPrice) / priceRange) * height + this.viewport.offsetY;
      const yClose = height - ((candle.close - minPrice) / priceRange) * height + this.viewport.offsetY;

      const isBull = candle.close >= candle.open;
      const color = isBull ? '#00f5a0' : '#ff3b69';

      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      if (typeof ctx.beginPath === 'function') {
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        const bodyY = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyH);
      }
    }
  }

  destroy() {
    this.stop();
    this.isPanning = false;
    if (this.canvas && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('wheel', this.handleWheel, { passive: false });
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
      this.canvas.removeEventListener('mouseup', this.handleMouseUp);
      this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    }
  }
}

export class ChartCanvas extends Chart {}