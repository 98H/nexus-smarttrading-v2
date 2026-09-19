export type RGBAColor = [number, number, number, number];
export const RGBAColor = {};

export const BoxType = {
  OrderBlock: 'OrderBlock',
  FairValueGap: 'FairValueGap',
} as const;

export type BoxType = (typeof BoxType)[keyof typeof BoxType];

export const BoxDirection = {
  Bullish: 'Bullish',
  Bearish: 'Bearish',
} as const;

export type BoxDirection = (typeof BoxDirection)[keyof typeof BoxDirection];

export interface BoundingBox {
  id: string;
  type: BoxType;
  direction: BoxDirection;
  top: number;
  bottom: number;
  left: number;
  mitigated: boolean;
  mitigationRight?: number;
}
export const BoundingBox = {};

export interface ColorPalette {
  obBullish: RGBAColor;
  obBearish: RGBAColor;
  fvgBullish: RGBAColor;
  fvgBearish: RGBAColor;
}
export const ColorPalette = {};

export interface ViewportTransform {
  width: number;
  height: number;
  activeCanvasEdgeX: number;
  timeToX: (time: number) => number;
  priceToY: (price: number) => number;
}
export const ViewportTransform = {};

export const DEFAULT_BOX_COLOR_PALETTE: ColorPalette = {
  obBullish: [0.125, 0.5, 0.875, 0.375],
  obBearish: [0.875, 0.25, 0.25, 0.375],
  fvgBullish: [0.25, 0.75, 0.25, 0.25],
  fvgBearish: [1.0, 0.625, 0.0, 0.25],
};