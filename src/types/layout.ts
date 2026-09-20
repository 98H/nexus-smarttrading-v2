import type { CSSProperties, ReactNode } from 'react';

/**
 * Supported split-screen layout configurations.
 */
export type LayoutType = '1x1' | '2x1' | '2x2' | '1x3';

/**
 * 2D container bounding dimensions in pixels.
 */
export interface ContainerDimensions {
  width: number;
  height: number;
}

/**
 * Grid gap configuration along column and row axes in pixels.
 */
export interface GridGapConfig {
  columnGap: number;
  rowGap: number;
}

/**
 * Layout geometry and metadata for an individual viewport slot.
 */
export interface ViewportSlot {
  id: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Structural definition of a layout configuration.
 */
export interface LayoutConfig {
  columns: number;
  rows: number;
  totalSlots: number;
}

/**
 * Generated CSS Grid template values and slot capacity.
 */
export interface GridTemplate {
  columns: string;
  rows: string;
  slotCount: number;
}

/**
 * Properties accepted by SplitScreenContainer.
 */
export interface SplitScreenContainerProps {
  layout: LayoutType;
  dimensions?: ContainerDimensions;
  gap?: number | GridGapConfig;
  className?: string;
  style?: CSSProperties;
  onViewportResize?: (slots: ViewportSlot[]) => void;
  children: ((slot: ViewportSlot) => ReactNode) | ReactNode;
}