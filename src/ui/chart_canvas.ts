/**
 * ChartCanvas and Viewport modules for rendering financial charts with zoom gesture handling.
 */

import { ZoomController } from './zoom_controller';

export interface WheelEventOptions {
  deltaX?: number;
  deltaY?: number;
  clientX?: number;
  clientY?: number;
}

export class WheelEvent {
  public deltaX: number;
  public deltaY: number;
  public clientX: number;
  public clientY: number;
  public isHandled: boolean;

  constructor(options: WheelEventOptions = {}) {
    this.deltaX = options.deltaX !== undefined ? Number(options.deltaX) : 0.0;
    this.deltaY = options.deltaY !== undefined ? Number(options.deltaY) : 0.0;
    this.clientX = options.clientX !== undefined ? Number(options.clientX) : 0.0;
    this.clientY = options.clientY !== undefined ? Number(options.clientY) : 0.0;
    this.isHandled = false;
  }

  public preventDefault(): void {
    this.isHandled = true;
  }
}

export interface ViewportOptions {
  width?: number;
  height?: number;
  zoomScale?: number;
  minPrice?: number;
  maxPrice?: number;
}

export class Viewport {
  public width: number;
  public height: number;
  public zoomScale: number;
  public minPrice: number;
  public maxPrice: number;

  private _basePriceRange: number;
  private _focalPixelY: number;
  private _focalPrice: number;
  private _focalPixelX: number;
  private _focalDataX: number;

  constructor(
    widthOrOptions?: number | ViewportOptions,
    height: number = 600,
    zoomScale: number = 1.0,
    minPrice: number = 0.0,
    maxPrice: number = 100.0
  ) {
    if (typeof widthOrOptions === 'object' && widthOrOptions !== null) {
      this.width = Math.max(1.0, widthOrOptions.width ?? 800.0);
      this.height = Math.max(1.0, widthOrOptions.height ?? 600.0);
      this.zoomScale = Math.max(1e-4, widthOrOptions.zoomScale ?? 1.0);
      this.minPrice = widthOrOptions.minPrice ?? 0.0;
      this.maxPrice = widthOrOptions.maxPrice ?? 100.0;
    } else {
      this.width = Math.max(1.0, widthOrOptions ?? 800.0);
      this.height = Math.max(1.0, height);
      this.zoomScale = Math.max(1e-4, zoomScale);
      this.minPrice = minPrice;
      this.maxPrice = maxPrice;
    }

    this._basePriceRange = Math.max(1e-4, this.maxPrice - this.minPrice);
    this._focalPixelY = this.height / 2.0;
    this._focalPrice = (this.minPrice + this.maxPrice) / 2.0;
    this._focalPixelX = this.width / 2.0;
    this._focalDataX = this.width / 2.0;
  }

  public pixelToPrice(pixelY: number): number {
    const pricePerPixel = this._basePriceRange / (this.height * this.zoomScale);
    return this._focalPrice - (Number(pixelY) - this._focalPixelY) * pricePerPixel;
  }

  public priceToPixel(price: number): number {
    const pricePerPixel = this._basePriceRange / (this.height * this.zoomScale);
    return this._focalPixelY + (this._focalPrice - Number(price)) / pricePerPixel;
  }

  public pixelToDataX(pixelX: number): number {
    return this._focalDataX + (Number(pixelX) - this._focalPixelX) / this.zoomScale;
  }

  public dataXToPixel(dataX: number): number {
    return this._focalPixelX + (Number(dataX) - this._focalDataX) * this.zoomScale;
  }

  public zoomAt(clientX: number, clientY: number, newScale: number): void {
    const focalPrice = this.pixelToPrice(clientY);
    const focalDataX = this.pixelToDataX(clientX);

    this._focalPixelX = Number(clientX);
    this._focalPixelY = Number(clientY);
    this._focalPrice = focalPrice;
    this._focalDataX = focalDataX;

    this.zoomScale = Math.max(1e-4, Number(newScale));
  }
}

export interface Candlestick {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandlestickRenderCoord {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  openY: number;
  closeY: number;
  highY: number;
  lowY: number;
  open: number;
  close: number;
  high: number;
  low: number;
  isBullish: boolean;
  timestamp?: number;
  volume?: number;
  center_x?: number;
  open_y?: number;
  close_y?: number;
  high_y?: number;
  low_y?: number;
  is_bullish?: boolean;
}

export interface ChartCanvasOptions {
  context: any;
  zoomController: ZoomController;
  initialCandlesticks?: Candlestick[];
  width?: number;
  height?: number;
}

export class ChartCanvas {
  public context: any;
  public zoomController: ZoomController;
  public candlesticks: Candlestick[];
  public width: number;
  public height: number;
  public viewport: Viewport;
  private _listeners: Map<string, Array<(event: any) => void>>;

  constructor(options: ChartCanvasOptions) {
    this.context = options.context;
    this.zoomController = options.zoomController;
    this.candlesticks = options.initialCandlesticks ? [...options.initialCandlesticks] : [];

    if (options.width !== undefined) {
      this.width = Number(options.width);
    } else if (this.context?.canvas?.width !== undefined) {
      this.width = Number(this.context.canvas.width);
    } else {
      this.width = 800.0;
    }

    if (options.height !== undefined) {
      this.height = Number(options.height);
    } else if (this.context?.canvas?.height !== undefined) {
      this.height = Number(this.context.canvas.height);
    } else {
      this.height = 600.0;
    }

    let minPrice = 0.0;
    let maxPrice = 100.0;

    if (this.candlesticks.length > 0) {
      const lows = this.candlesticks
        .map((c) => Number(c.low))
        .filter((val) => !Number.isNaN(val));
      const highs = this.candlesticks
        .map((c) => Number(c.high))
        .filter((val) => !Number.isNaN(val));

      if (lows.length > 0 && highs.length > 0) {
        minPrice = Math.min(...lows);
        maxPrice = Math.max(...highs);
        if (minPrice === maxPrice) {
          minPrice -= 1.0;
          maxPrice += 1.0;
        }
        const margin = (maxPrice - minPrice) * 0.1;
        minPrice -= margin;
        maxPrice += margin;
      }
    }

    this.viewport = new Viewport({
      width: this.width,
      height: this.height,
      zoomScale: this.zoomController.currentScale,
      minPrice,
      maxPrice,
    });

    this._listeners = new Map();
    this._listeners.set('wheel', [(event: WheelEvent) => this.handleWheel(event)]);

    this.renderCandlesticks();
  }

  public getEventListeners(eventType: string): Array<(event: any) => void> {
    const list = this._listeners.get(eventType);
    return list ? [...list] : [];
  }

  public addEventListener(eventType: string, listener: (event: any) => void): void {
    let list = this._listeners.get(eventType);
    if (!list) {
      list = [];
      this._listeners.set(eventType, list);
    }
    if (!list.includes(listener)) {
      list.push(listener);
    }
  }

  public removeEventListener(eventType: string, listener: (event: any) => void): void {
    const list = this._listeners.get(eventType);
    if (list) {
      const index = list.indexOf(listener);
      if (index !== -1) {
        list.splice(index, 1);
      }
    }
  }

  public handleWheel(event: WheelEvent): void {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    event.isHandled = true;

    const deltaY = event.deltaY ?? 0;
    const newScale = this.zoomController.applyDelta(deltaY);
    const clientX = event.clientX ?? this.width / 2.0;
    const clientY = event.clientY ?? this.height / 2.0;

    this.viewport.zoomAt(clientX, clientY, newScale);
    this.renderCandlesticks();
  }

  public computeCandlestickRenderCoords(): CandlestickRenderCoord[] {
    const coords: CandlestickRenderCoord[] = [];
    const n = this.candlesticks.length;
    if (n === 0) {
      return coords;
    }

    const baseSpacing = this.width / (n + 1);
    const baseWidth = Math.max(2.0, baseSpacing * 0.6);
    const candleWidth = Math.max(1.0, baseWidth * this.viewport.zoomScale);

    for (let i = 0; i < n; i++) {
      const candle = this.candlesticks[i];
      const baseDataX = (i + 1) * baseSpacing;
      const centerX = this.viewport.dataXToPixel(baseDataX);
      const leftX = centerX - candleWidth / 2.0;

      const openPrice = Number(candle.open ?? 0.0);
      const closePrice = Number(candle.close ?? 0.0);
      const highPrice = Number(candle.high ?? 0.0);
      const lowPrice = Number(candle.low ?? 0.0);

      const openY = this.viewport.priceToPixel(openPrice);
      const closeY = this.viewport.priceToPixel(closePrice);
      const highY = this.viewport.priceToPixel(highPrice);
      const lowY = this.viewport.priceToPixel(lowPrice);

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.0, Math.abs(closeY - openY));

      coords.push({
        x: leftX,
        y: bodyTop,
        width: candleWidth,
        height: bodyHeight,
        centerX,
        openY,
        closeY,
        highY,
        lowY,
        open: openPrice,
        close: closePrice,
        high: highPrice,
        low: lowPrice,
        isBullish: closePrice >= openPrice,
        timestamp: candle.timestamp,
        volume: candle.volume,
        center_x: centerX,
        open_y: openY,
        close_y: closeY,
        high_y: highY,
        low_y: lowY,
        is_bullish: closePrice >= openPrice,
      });
    }

    return coords;
  }

  public renderCandlesticks(): void {
    if (!this.context) {
      return;
    }

    const coords = this.computeCandlestickRenderCoords();

    if (typeof this.context.clearRect === 'function') {
      this.context.clearRect(0, 0, this.width, this.height);
    }

    for (const c of coords) {
      if (typeof this.context.beginPath === 'function') {
        this.context.beginPath();
      }
      if (typeof this.context.fillRect === 'function') {
        this.context.fillRect(c.x, c.y, c.width, c.height);
      }
    }
  }
}