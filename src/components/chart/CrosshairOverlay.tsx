import {
  isPointerInsideBounds,
  projectToAxes,
  type ChartBounds,
  type PriceScale,
  type TimeScale,
  type Point,
} from '../../utils/chartCoordinates.ts';

export interface MockCanvasRenderingContext2D {
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  stroke: () => void;
  clearRect: (x: number, y: number, w: number, h: number) => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
  measureText: (text: string) => { width: number };
  save: () => void;
  restore: () => void;
  setLineDash: (segments: number[]) => void;
}

export interface CrosshairOverlayState {
  visible: boolean;
  x: number | null;
  y: number | null;
  priceText: string | null;
  timeText: string | null;
}

export interface CrosshairOverlayControllerOptions {
  bounds: ChartBounds;
  priceScale: PriceScale;
  timeScale: TimeScale;
  devicePixelRatio?: number;
}

export class CrosshairOverlayController {
  private bounds: ChartBounds;
  private priceScale: PriceScale;
  private timeScale: TimeScale;
  private devicePixelRatio: number;
  private state: CrosshairOverlayState;

  constructor(options: CrosshairOverlayControllerOptions) {
    this.bounds = options.bounds;
    this.priceScale = options.priceScale;
    this.timeScale = options.timeScale;
    this.devicePixelRatio = options.devicePixelRatio ?? 1.0;
    this.state = {
      visible: false,
      x: null,
      y: null,
      priceText: null,
      timeText: null,
    };
  }

  public handleMouseMove(x: number, y: number): void {
    const pointer: Point = { x, y };

    if (!isPointerInsideBounds(pointer, this.bounds)) {
      this.handleMouseLeave();
      return;
    }

    const projections = projectToAxes(
      pointer,
      this.bounds,
      this.priceScale,
      this.timeScale,
      this.devicePixelRatio
    );

    if (!projections.isVisible) {
      this.handleMouseLeave();
      return;
    }

    this.state = {
      visible: true,
      x: projections.crosshair.x,
      y: projections.crosshair.y,
      priceText: projections.priceBadge.formattedText,
      timeText: projections.timeBadge.formattedText,
    };
  }

  public handleMouseLeave(): void {
    this.state = {
      visible: false,
      x: null,
      y: null,
      priceText: null,
      timeText: null,
    };
  }

  public getState(): CrosshairOverlayState {
    return { ...this.state };
  }

  public updateDevicePixelRatio(dpr: number): void {
    this.devicePixelRatio = dpr;
  }

  public updateBounds(bounds: ChartBounds): void {
    this.bounds = bounds;
  }

  public updateScales(priceScale: PriceScale, timeScale: TimeScale): void {
    this.priceScale = priceScale;
    this.timeScale = timeScale;
  }

  public render(ctx: CanvasRenderingContext2D | MockCanvasRenderingContext2D): void {
    ctx.clearRect(this.bounds.left, this.bounds.top, this.bounds.width, this.bounds.height);

    if (!this.state.visible || this.state.x === null || this.state.y === null) {
      return;
    }

    ctx.lineWidth = 1 / this.devicePixelRatio;

    // Crosshair lines
    ctx.beginPath();
    ctx.moveTo(this.state.x, this.bounds.top);
    ctx.lineTo(this.state.x, this.bounds.top + this.bounds.height);
    ctx.moveTo(this.bounds.left, this.state.y);
    ctx.lineTo(this.bounds.left + this.bounds.width, this.state.y);
    ctx.stroke();

    // Price badge pinned to right axis
    if (this.state.priceText !== null) {
      const text = this.state.priceText;
      const textMetrics = ctx.measureText(text);
      const padding = 4;
      const badgeWidth = textMetrics.width + padding * 2;
      const badgeHeight = 20;
      const badgeX = this.bounds.left + this.bounds.width - badgeWidth;
      const badgeY = this.state.y - badgeHeight / 2;

      ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
      ctx.fillText(text, badgeX + padding, this.state.y);
    }

    // Time badge pinned to bottom axis
    if (this.state.timeText !== null) {
      const text = this.state.timeText;
      const textMetrics = ctx.measureText(text);
      const padding = 4;
      const badgeWidth = textMetrics.width + padding * 2;
      const badgeHeight = 20;
      const badgeX = Math.max(
        this.bounds.left,
        Math.min(this.bounds.left + this.bounds.width - badgeWidth, this.state.x - badgeWidth / 2)
      );
      const badgeY = this.bounds.top + this.bounds.height - badgeHeight;

      ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
      ctx.fillText(text, badgeX + padding, this.bounds.top + this.bounds.height);
    }
  }
}

export interface CrosshairOverlayProps {
  bounds: ChartBounds;
  priceScale: PriceScale;
  timeScale: TimeScale;
  devicePixelRatio?: number;
  className?: string;
  style?: Record<string, unknown>;
  onPositionChange?: (state: CrosshairOverlayState) => void;
}

export const CrosshairOverlay = (_props: CrosshairOverlayProps): unknown => {
  return null;
};

export default CrosshairOverlay;