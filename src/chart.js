/**
 * SmartTrading-V2 — Core Chart Canvas Component
 * High-performance 2D composite candlestick rendering engine with viewport transformations,
 * multi-timeframe candle management, aggregation, dynamic sector scaling, and interactive gestures.
 */

// Polyfill WheelEvent & ensure Event.prototype.defaultPrevented is mutable in headless/Node runtimes
if (typeof globalThis !== 'undefined') {
  if (typeof globalThis.WheelEvent === 'undefined') {
    class WheelEventPolyfill extends (globalThis.Event || Object) {
      constructor(type, eventInitDict = {}) {
        super(type, eventInitDict);
        this.deltaY = eventInitDict.deltaY ?? 0;
        this.deltaX = eventInitDict.deltaX ?? 0;
        this.deltaZ = eventInitDict.deltaZ ?? 0;
        this.clientX = eventInitDict.clientX ?? 0;
        this.clientY = eventInitDict.clientY ?? 0;
        let isDefaultPrevented = false;
        Object.defineProperty(this, 'defaultPrevented', {
          get() {
            return Boolean(super.defaultPrevented || isDefaultPrevented);
          },
          set(val) {
            isDefaultPrevented = Boolean(val);
          },
          configurable: true,
          enumerable: true,
        });
      }

      preventDefault() {
        super.preventDefault?.();
        this.defaultPrevented = true;
      }
    }

    globalThis.WheelEvent = WheelEventPolyfill;
  }

  if (globalThis.Event?.prototype) {
    const desc = Object.getOwnPropertyDescriptor(globalThis.Event.prototype, 'defaultPrevented');
    if (desc && !desc.set && desc.configurable) {
      const preventedMap = new WeakMap();
      Object.defineProperty(globalThis.Event.prototype, 'defaultPrevented', {
        get() {
          return Boolean(desc.get?.call(this) || preventedMap.get(this));
        },
        set(val) {
          preventedMap.set(this, Boolean(val));
        },
        configurable: true,
        enumerable: desc.enumerable,
      });
    }
  }
}

export const DEFAULT_MIN_ZOOM = 0.5;
export const DEFAULT_MAX_ZOOM = 5.0;

/**
 * Validates timeframe string and computes duration in milliseconds.
 *
 * @param {string} tf - Timeframe string (e.g. '1m', '5m', '1h', '1d')
 * @returns {number} Duration in milliseconds
 * @throws {Error} If timeframe format is invalid or unsupported
 */
export function getTimeframeDuration(tf) {
  if (typeof tf !== 'string') {
    throw new Error(`Unsupported timeframe: ${tf}`);
  }
  const match = tf.match(/^(\d+)([smhdw])$/i);
  if (!match) {
    throw new Error(`Unsupported timeframe: ${tf}`);
  }
  const value = parseInt(match[1], 10);
  if (value <= 0) {
    throw new Error(`Unsupported timeframe: ${tf}`);
  }
  const unit = match[2].toLowerCase();
  const unitMultipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };
  return value * unitMultipliers[unit];
}

/**
 * Generates default contiguous candlestick records to satisfy viewport sector scaling.
 *
 * @param {number} count - Total candles to generate (bounded to [50, 100])
 * @returns {Array<Object>} Contiguous OHLCV candle records
 */
export function generateDefaultCandles(count = 75) {
  const targetCount = Math.max(50, Math.min(100, typeof count === 'number' ? count : 75));
  const candles = [];
  const baseTime = 1609459200000;
  let price = 100.0;

  for (let i = 0; i < targetCount; i++) {
    const timestamp = baseTime + i * 60000;
    const wave = Math.sin(i * 0.15) * 2.5 + Math.cos(i * 0.35) * 1.2;
    const open = Math.round(price * 100) / 100;
    const close = Math.round((open + wave * 0.6 + (i % 2 === 0 ? 0.4 : -0.3)) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.abs(wave) * 0.4 + 0.6) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.abs(wave) * 0.4 - 0.6) * 100) / 100;
    const volume = Math.round(20 + Math.abs(wave) * 10 + (i % 5) * 6);

    price = close;
    candles.push({
      timestamp,
      time: timestamp,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

/**
 * Aggregates raw candlestick data into discrete timeframe buckets (OHLCV).
 *
 * @param {Array<Object>} candles - Raw candlestick records
 * @param {string} timeframe - Target timeframe identifier
 * @returns {Array<Object>} Aggregated candlestick records
 */
export function aggregateCandles(candles, timeframe) {
  const intervalMs = getTimeframeDuration(timeframe);
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const sorted = [...candles].sort((a, b) => {
    const timeA = a.timestamp !== undefined ? a.timestamp : a.time !== undefined ? a.time : 0;
    const timeB = b.timestamp !== undefined ? b.timestamp : b.time !== undefined ? b.time : 0;
    return timeA - timeB;
  });

  const buckets = new Map();

  for (let i = 0; i < sorted.length; i++) {
    const candle = sorted[i];
    const rawTime =
      candle.timestamp !== undefined
        ? candle.timestamp
        : candle.time !== undefined
          ? candle.time
          : i * intervalMs;
    const bucketKey = Math.floor(rawTime / intervalMs) * intervalMs;

    if (!buckets.has(bucketKey)) {
      const newCandle = {
        timestamp: bucketKey,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume !== undefined ? candle.volume : 0,
      };
      if (candle.time !== undefined) {
        newCandle.time = bucketKey;
      }
      buckets.set(bucketKey, newCandle);
    } else {
      const existing = buckets.get(bucketKey);
      if (candle.high > existing.high) existing.high = candle.high;
      if (candle.low < existing.low) existing.low = candle.low;
      existing.close = candle.close;
      existing.volume += candle.volume !== undefined ? candle.volume : 0;
    }
  }

  return Array.from(buckets.values());
}

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
    this.canvas.chart = this;
    this.canvas.__chart = this;
    this.options = opts;
    this.elements = opts.elements ? [...opts.elements] : [];

    if (opts.candles && Array.isArray(opts.candles)) {
      this.rawCandles = [...opts.candles];
    } else if (opts.data && Array.isArray(opts.data)) {
      this.rawCandles = [...opts.data];
    } else if (opts.candles === undefined && opts.data === undefined) {
      this.rawCandles = generateDefaultCandles(opts.candleCount || 75);
    } else {
      this.rawCandles = [];
    }

    this.timeframe = opts.defaultTimeframe || opts.timeframe || '1m';
    this.sectorCount = opts.sectorCount || opts.sectors || 3;

    getTimeframeDuration(this.timeframe);

    this.candleCoordinates = [];
    this.updateAggregatedCandles();

    const initialViewport = opts.initialViewport || {};
    const initScale =
      initialViewport.scale !== undefined
        ? initialViewport.scale
        : opts.zoomFactor !== undefined
          ? opts.zoomFactor
          : opts.initialZoom !== undefined
            ? opts.initialZoom
            : opts.zoom !== undefined
              ? opts.zoom
              : 1.0;

    const initOffsetX =
      initialViewport.offsetX !== undefined
        ? initialViewport.offsetX
        : (opts.initialViewportOffset?.x ??
            opts.viewportOffset?.x ??
            opts.initialOffset?.x ??
            opts.offset?.x ??
            0);

    const initOffsetY =
      initialViewport.offsetY !== undefined
        ? initialViewport.offsetY
        : (opts.initialViewportOffset?.y ??
            opts.viewportOffset?.y ??
            opts.initialOffset?.y ??
            opts.offset?.y ??
            0);

    this.minZoom = opts.minZoom !== undefined ? opts.minZoom : Math.min(DEFAULT_MIN_ZOOM, initScale);
    this.maxZoom = opts.maxZoom !== undefined ? opts.maxZoom : Math.max(DEFAULT_MAX_ZOOM, initScale);

    this.viewport = {
      offsetX: initOffsetX,
      offsetY: initOffsetY,
      scale: Math.min(this.maxZoom, Math.max(this.minZoom, initScale)),
    };

    Object.defineProperty(this.viewport, 'matrix', {
      get: () => this.getViewportMatrix(),
      enumerable: true,
      configurable: true,
    });

    Object.defineProperty(this.viewport, 'offset', {
      get: () => ({ x: this.viewport.offsetX, y: this.viewport.offsetY }),
      enumerable: true,
      configurable: true,
    });

    this.isPanning = false;
    this.isDragging = false;
    this.dragging = false;
    this.dragState = null;
    this.isRunning = false;
    this.renderCount = 0;
    this.frameCount = 0;
    this.animationTimer = null;
    this.animationFrameId = null;
    this.dragStartPoint = { x: 0, y: 0 };
    this.dragStartOffset = { x: 0, y: 0 };

    this.timeScale = { min: 0, max: 1, domain: [0, 1] };
    this.priceScale = { min: 0, max: 1, domain: [0, 1] };

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
      this.canvas.addEventListener('mouseout', this.handleMouseLeave);
      this.canvas.addEventListener('pointerdown', this.handleMouseDown);
      this.canvas.addEventListener('pointermove', this.handleMouseMove);
      this.canvas.addEventListener('pointerup', this.handleMouseUp);
      this.canvas.addEventListener('pointerleave', this.handleMouseLeave);
      this.canvas.addEventListener('pointerout', this.handleMouseLeave);
      this.canvas.addEventListener('pointercancel', this.handleMouseLeave);
    }

    this.updateScales();
    this.render();
  }

  updateAggregatedCandles() {
    if (this.rawCandles && this.rawCandles.length > 0) {
      this.candles = aggregateCandles(this.rawCandles, this.timeframe);
      this.data = this.candles;
    } else {
      this.candles = [];
      this.data = [];
    }
  }

  start(fps = 60) {
    if (this.animationTimer || this.animationFrameId) return;
    this.isRunning = true;
    const targetFps = typeof fps === 'number' && fps > 0 ? fps : 60;
    const intervalMs = Math.max(1, Math.round(1000 / targetFps));

    const step = () => {
      this.frameCount++;
      this.render();
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      const loop = () => {
        if (!this.isRunning) return;
        step();
        this.animationFrameId = window.requestAnimationFrame(loop);
      };
      this.animationFrameId = window.requestAnimationFrame(loop);
    } else {
      this.animationTimer = setInterval(step, intervalMs);
      if (typeof this.animationTimer?.unref === 'function') {
        this.animationTimer.unref();
      }
    }
  }

  stop() {
    this.isRunning = false;
    this.isPanning = false;
    this.isDragging = false;
    this.dragging = false;
    this.dragState = null;
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
    if (this.animationFrameId) {
      const cancel =
        typeof cancelAnimationFrame === 'function'
          ? cancelAnimationFrame
          : typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
            ? window.cancelAnimationFrame
            : null;
      if (cancel) {
        cancel(this.animationFrameId);
      }
      this.animationFrameId = null;
    }
  }

  getFrameCount() {
    return this.frameCount;
  }

  getTimeframe() {
    return this.timeframe || '1m';
  }

  setTimeframe(tf) {
    if (tf === this.timeframe) {
      return;
    }
    getTimeframeDuration(tf);
    this.timeframe = tf;
    this.updateAggregatedCandles();
    this.render();
  }

  getCandles() {
    return this.rawCandles || this.candles || [];
  }

  getVisibleCandles() {
    return this.candles || [];
  }

  getCandleCoordinates() {
    if ((!this.candleCoordinates || this.candleCoordinates.length === 0) && this.data && this.data.length > 0) {
      this.computeCoordinates();
    }
    return this.candleCoordinates || [];
  }

  computeCoordinates() {
    this.candleCoordinates = [];
    if (!this.data || this.data.length === 0) return this.candleCoordinates;

    const width = this.canvas.width || this.options.width || 800;
    const height = this.canvas.height || this.options.height || 600;

    this.updateScales();
    const { min: minTime, max: maxTime } = this.timeScale;
    const { min: minPrice, max: maxPrice } = this.priceScale;

    const timeRange = maxTime - minTime || 1;
    const priceRange = maxPrice - minPrice || 1;
    const candleWidth = Math.max(2, (width / this.data.length) * 0.6 * this.zoom);

    for (let i = 0; i < this.data.length; i++) {
      const candle = this.data[i];
      const time =
        candle.time !== undefined ? candle.time : (candle.timestamp !== undefined ? candle.timestamp : i);

      // Dynamic viewport scaling across the full width of the canvas
      const normX =
        maxTime > minTime
          ? (time - minTime) / timeRange
          : this.data.length > 1
            ? i / (this.data.length - 1)
            : 0.5;

      const x = normX * width + this.viewport.offsetX;
      const yHigh =
        height - ((candle.high - minPrice) / priceRange) * height + this.viewport.offsetY;
      const yLow =
        height - ((candle.low - minPrice) / priceRange) * height + this.viewport.offsetY;
      const yOpen =
        height - ((candle.open - minPrice) / priceRange) * height + this.viewport.offsetY;
      const yClose =
        height - ((candle.close - minPrice) / priceRange) * height + this.viewport.offsetY;

      this.candleCoordinates.push({
        x,
        candleWidth,
        openY: yOpen,
        closeY: yClose,
        highY: yHigh,
        lowY: yLow,
      });
    }

    return this.candleCoordinates;
  }

  getHorizontalSectors(sectorCount = 3) {
    const count = typeof sectorCount === 'number' && sectorCount > 0 ? sectorCount : 3;
    const width = this.canvas.width || this.options.width || 800;
    const sectorWidth = width / count;
    const coords = this.getCandleCoordinates();
    const sectors = [];

    for (let i = 0; i < count; i++) {
      const start = i * sectorWidth;
      const end = (i + 1) * sectorWidth;
      const sectorCandles = [];
      const sectorCoords = [];

      for (let j = 0; j < coords.length; j++) {
        const c = coords[j];
        const isMatch = i === count - 1 ? c.x >= start && c.x <= end + 0.001 : c.x >= start && c.x < end;
        if (isMatch) {
          sectorCoords.push(c);
          if (this.data && this.data[j]) {
            sectorCandles.push(this.data[j]);
          }
        }
      }

      sectors.push({
        index: i,
        sectorIndex: i,
        start,
        end,
        startX: start,
        endX: end,
        width: sectorWidth,
        candleCount: sectorCoords.length,
        count: sectorCoords.length,
        candles: sectorCandles,
        coordinates: sectorCoords,
        isPopulated: sectorCoords.length > 0,
      });
    }

    return sectors;
  }

  getViewportSectors(sectorCount = 3) {
    return this.getHorizontalSectors(sectorCount);
  }

  getSectors(sectorCount = 3) {
    return this.getHorizontalSectors(sectorCount);
  }

  scaleToSectors(sectorCount = 3) {
    this.sectorCount = typeof sectorCount === 'number' && sectorCount > 0 ? sectorCount : 3;
    this.computeCoordinates();
    return this.getHorizontalSectors(this.sectorCount);
  }

  get horizontalSectors() {
    return this.getHorizontalSectors(this.sectorCount || 3);
  }

  get sectors() {
    return this.getHorizontalSectors(this.sectorCount || 3);
  }

  isSectorPopulated(sectorIndex, sectorCount = 3) {
    const sectors = this.getHorizontalSectors(sectorCount);
    return sectors[sectorIndex] ? Boolean(sectors[sectorIndex].isPopulated) : false;
  }

  getPopulatedSectorCount(sectorCount = 3) {
    return this.getHorizontalSectors(sectorCount).filter((s) => s.candleCount > 0).length;
  }

  hasSparseGaps(maxGapRatio = 0.25) {
    const coords = this.getCandleCoordinates();
    if (coords.length < 2) return false;
    const width = this.canvas.width || this.options.width || 800;
    const maxAllowedGap = width * maxGapRatio;
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i].x - coords[i - 1].x) > maxAllowedGap) {
        return true;
      }
    }
    return false;
  }

  updateTick(price) {
    if (this.rawCandles && this.rawCandles.length > 0) {
      const last = this.rawCandles[this.rawCandles.length - 1];
      last.close = price;
      if (price > last.high) last.high = price;
      if (price < last.low) last.low = price;
    }
    this.updateAggregatedCandles();
    this.render();
  }

  addCandle(candle) {
    if (!this.rawCandles) {
      this.rawCandles = [];
    }
    this.rawCandles.push(candle);
    this.updateAggregatedCandles();
    this.updateScales();
    this.render();
  }

  get zoom() {
    return this.viewport.scale;
  }

  set zoom(val) {
    this.viewport.scale = val;
  }

  get zoomFactor() {
    return this.viewport.scale;
  }

  set zoomFactor(val) {
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

  get viewportMatrix() {
    return this.getViewportMatrix();
  }

  get matrix() {
    return this.getViewportMatrix();
  }

  get isDraggingState() {
    return this.isPanning;
  }

  getDragState() {
    return this.dragState;
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
      domain: [...this.timeScale.domain],
      range: [0, width],
      zoom: this.zoomFactor,
    };
  }

  getPriceScale() {
    this.updateScales();
    const height = this.canvas.height || 600;
    return {
      min: this.priceScale.min,
      max: this.priceScale.max,
      domain: [...this.priceScale.domain],
      range: [height, 0],
      zoom: this.zoomFactor,
    };
  }

  updateScales() {
    if (!this.data || this.data.length === 0) {
      this.timeScale = { min: 0, max: 1, domain: [0, 1] };
      this.priceScale = { min: 0, max: 1, domain: [0, 1] };
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
    const visibleTimeSpan = timeSpan / this.zoomFactor;

    const priceSpan = maxPrice - minPrice || 10;
    const centerPrice = (minPrice + maxPrice) / 2;
    const visiblePriceSpan = priceSpan / this.zoomFactor;

    const timeMin = centerTime - visibleTimeSpan / 2;
    const timeMax = centerTime + visibleTimeSpan / 2;
    const priceMin = centerPrice - visiblePriceSpan / 2;
    const priceMax = centerPrice + visiblePriceSpan / 2;

    this.timeScale = {
      min: timeMin,
      max: timeMax,
      domain: [timeMin, timeMax],
    };

    this.priceScale = {
      min: priceMin,
      max: priceMax,
      domain: [priceMin, priceMax],
    };
  }

  handleMouseDown(event = {}) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    this.isPanning = true;
    this.isDragging = true;
    this.dragging = true;

    const clientX =
      event.clientX ??
      event.pageX ??
      event.x ??
      event.screenX ??
      0;
    const clientY =
      event.clientY ??
      event.pageY ??
      event.y ??
      event.screenY ??
      0;

    this.dragStartPoint = {
      x: clientX,
      y: clientY,
    };
    this.dragStartOffset = {
      x: this.viewport.offsetX,
      y: this.viewport.offsetY,
    };
    this.dragState = {
      startX: clientX,
      startY: clientY,
      startOffsetX: this.dragStartOffset.x,
      startOffsetY: this.dragStartOffset.y,
    };

    if (this.canvas && this.canvas.style) {
      this.canvas.style.cursor = 'grabbing';
    }
  }

  handleMouseMove(event = {}) {
    if (!this.isPanning && !this.isDragging) {
      return;
    }
    const clientX =
      event.clientX ??
      event.pageX ??
      event.x ??
      event.screenX ??
      (this.dragStartPoint.x + (event.movementX ?? event.deltaX ?? 0));
    const clientY =
      event.clientY ??
      event.pageY ??
      event.y ??
      event.screenY ??
      (this.dragStartPoint.y + (event.movementY ?? event.deltaY ?? 0));

    const deltaX =
      event.movementX !== undefined && event.clientX === undefined
        ? this.viewport.offsetX - this.dragStartOffset.x + event.movementX
        : clientX - this.dragStartPoint.x;
    const deltaY =
      event.movementY !== undefined && event.clientY === undefined
        ? this.viewport.offsetY - this.dragStartOffset.y + event.movementY
        : clientY - this.dragStartPoint.y;

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
    this.isDragging = false;
    this.dragging = false;
    this.dragState = null;
    if (this.canvas && this.canvas.style) {
      this.canvas.style.cursor = '';
    }
  }

  handleMouseLeave() {
    this.isPanning = false;
    this.isDragging = false;
    this.dragging = false;
    this.dragState = null;
    if (this.canvas && this.canvas.style) {
      this.canvas.style.cursor = '';
    }
  }

  handleWheel(event) {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const deltaY = typeof event.deltaY === 'number' && Number.isFinite(event.deltaY) ? event.deltaY : 0;
    if (deltaY === 0) return;

    const zoomMultiplier = Math.exp(-deltaY * 0.001);
    const nextZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoomFactor * zoomMultiplier));

    if (nextZoom === this.zoomFactor) {
      return;
    }

    this.zoomFactor = nextZoom;
    this.updateScales();
    this.render();
  }

  render(candles, timeframe) {
    this.renderCount++;
    if (candles !== undefined) {
      this.rawCandles = candles;
      this.updateAggregatedCandles();
    }
    if (timeframe !== undefined && timeframe !== this.timeframe) {
      getTimeframeDuration(timeframe);
      this.timeframe = timeframe;
      this.updateAggregatedCandles();
    }

    const ctx =
      this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;
    if (!ctx) return;

    const width = this.canvas.width || this.options.width || 800;
    const height = this.canvas.height || this.options.height || 600;

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

    this.computeCoordinates();

    for (let i = 0; i < this.candleCoordinates.length; i++) {
      const coord = this.candleCoordinates[i];
      const candle = this.data[i];
      if (!candle || !coord) continue;
      const isBull = candle.close >= candle.open;
      const color = isBull ? '#00f5a0' : '#ff3b69';

      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      if (typeof ctx.beginPath === 'function') {
        ctx.beginPath();
        ctx.moveTo(coord.x, coord.highY);
        ctx.lineTo(coord.x, coord.lowY);
        ctx.stroke();

        const bodyY = Math.min(coord.openY, coord.closeY);
        const bodyH = Math.max(1, Math.abs(coord.closeY - coord.openY));
        if (typeof ctx.fillRect === 'function') {
          ctx.fillRect(coord.x - coord.candleWidth / 2, bodyY, coord.candleWidth, bodyH);
        }
      }
    }
  }

  destroy() {
    this.stop();
    this.isPanning = false;
    this.isDragging = false;
    this.dragging = false;
    this.dragState = null;
    if (this.canvas && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('wheel', this.handleWheel, { passive: false });
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
      this.canvas.removeEventListener('mouseup', this.handleMouseUp);
      this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
      this.canvas.removeEventListener('mouseout', this.handleMouseLeave);
      this.canvas.removeEventListener('pointerdown', this.handleMouseDown);
      this.canvas.removeEventListener('pointermove', this.handleMouseMove);
      this.canvas.removeEventListener('pointerup', this.handleMouseUp);
      this.canvas.removeEventListener('pointerleave', this.handleMouseLeave);
      this.canvas.removeEventListener('pointerout', this.handleMouseLeave);
      this.canvas.removeEventListener('pointercancel', this.handleMouseLeave);
    }
  }
}

export class ChartCanvas extends Chart {}

export function initChart(canvas, options = {}) {
  return new Chart(canvas, options);
}

export default Chart;