export interface Point {
  x: number;
  y: number;
}

export interface ChartBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PriceScale {
  priceFromY: (y: number) => number;
  formatPrice: (price: number) => string;
}

export interface TimeScale {
  timeFromX: (x: number) => number;
  formatTime: (timestamp: number) => string;
}

export interface BadgeProjection<T = number> {
  visible: boolean;
  x: number;
  y: number;
  value: T;
  formattedText: string;
}

export interface AxisProjections {
  isVisible: boolean;
  crosshair: Point;
  priceBadge: BadgeProjection;
  timeBadge: BadgeProjection;
}

/**
 * Aligns a raw coordinate to a crisp 1px device-pixel boundary based on devicePixelRatio.
 * On standard displays (DPR=1), 1px lines are centered with a 0.5 offset.
 * On high-DPI displays (e.g., DPR=2), aligns to (Math.floor(coord * dpr) + 0.5) / dpr.
 */
export function alignToSubPixel(coord: number, dpr: number = 1.0): number {
  return (Math.floor(coord * dpr) + 0.5) / dpr;
}

/**
 * Validates whether a pointer coordinate is within the chart boundaries (inclusive).
 */
export function isPointerInsideBounds(point: Point, bounds: ChartBounds): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.left + bounds.width &&
    point.y >= bounds.top &&
    point.y <= bounds.top + bounds.height
  );
}

/**
 * Projects a pointer coordinate onto chart axes, calculating sub-pixel aligned
 * crosshair lines and floating price and timestamp badges locked to their axes.
 */
export function projectToAxes(
  pointer: Point,
  bounds: ChartBounds,
  priceScale: PriceScale,
  timeScale: TimeScale,
  dpr: number = 1.0
): AxisProjections {
  if (!isPointerInsideBounds(pointer, bounds)) {
    return {
      isVisible: false,
      crosshair: { x: 0, y: 0 },
      priceBadge: {
        visible: false,
        x: bounds.left + bounds.width,
        y: 0,
        value: 0,
        formattedText: '',
      },
      timeBadge: {
        visible: false,
        x: 0,
        y: bounds.top + bounds.height,
        value: 0,
        formattedText: '',
      },
    };
  }

  const alignedX = alignToSubPixel(pointer.x, dpr);
  const alignedY = alignToSubPixel(pointer.y, dpr);

  const clampedTimeX = Math.max(bounds.left, Math.min(bounds.left + bounds.width, alignedX));
  const clampedPriceY = Math.max(bounds.top, Math.min(bounds.top + bounds.height, alignedY));

  const priceValue = priceScale.priceFromY(pointer.y);
  const timeValue = timeScale.timeFromX(pointer.x);

  return {
    isVisible: true,
    crosshair: {
      x: alignedX,
      y: alignedY,
    },
    priceBadge: {
      visible: true,
      x: bounds.left + bounds.width,
      y: clampedPriceY,
      value: priceValue,
      formattedText: priceScale.formatPrice(priceValue),
    },
    timeBadge: {
      visible: true,
      x: clampedTimeX,
      y: bounds.top + bounds.height,
      value: timeValue,
      formattedText: timeScale.formatTime(timeValue),
    },
  };
}