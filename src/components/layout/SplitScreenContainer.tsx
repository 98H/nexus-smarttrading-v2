import React from 'react';
import type {
  LayoutType,
  LayoutConfig,
  GridTemplate,
  ContainerDimensions,
  GridGapConfig,
  ViewportSlot,
  SplitScreenContainerProps
} from '../../types/layout.js';

/**
 * Specification mapping layout keys to grid dimensions and slot counts.
 */
export const LAYOUT_CONFIGS: Record<LayoutType, LayoutConfig> = {
  '1x1': { columns: 1, rows: 1, totalSlots: 1 },
  '2x1': { columns: 2, rows: 1, totalSlots: 2 },
  '2x2': { columns: 2, rows: 2, totalSlots: 4 },
  '1x3': { columns: 3, rows: 1, totalSlots: 3 }
};

/**
 * Derives CSS Grid template rows and columns strings for a given layout.
 */
export function getGridTemplate(layout: LayoutType): GridTemplate {
  const config = LAYOUT_CONFIGS[layout];
  if (!config) {
    throw new TypeError(`Unsupported layout configuration: ${layout}`);
  }

  return {
    columns: `repeat(${config.columns}, 1fr)`,
    rows: `repeat(${config.rows}, 1fr)`,
    slotCount: config.totalSlots
  };
}

/**
 * Dynamically computes pixel-aligned slot dimensions and offsets given container
 * dimensions and gap configuration. Clamps values to non-negative bounds.
 */
export function calculateViewportDimensions(
  layout: LayoutType,
  dimensions: ContainerDimensions,
  gapConfig?: GridGapConfig | number
): ViewportSlot[] {
  const config = LAYOUT_CONFIGS[layout];
  if (!config) {
    throw new TypeError(`Unsupported layout configuration: ${layout}`);
  }

  let columnGap = 0;
  let rowGap = 0;

  if (typeof gapConfig === 'number') {
    columnGap = gapConfig;
    rowGap = gapConfig;
  } else if (gapConfig && typeof gapConfig === 'object') {
    columnGap = gapConfig.columnGap ?? 0;
    rowGap = gapConfig.rowGap ?? 0;
  }

  const { columns, rows, totalSlots } = config;

  const width = Math.max(0, dimensions?.width ?? 0);
  const height = Math.max(0, dimensions?.height ?? 0);

  if (width === 0 || height === 0) {
    return Array.from({ length: totalSlots }, (_, index) => ({
      id: `slot-${index}`,
      index,
      x: 0,
      y: 0,
      width: 0,
      height: 0
    }));
  }

  const totalColumnGaps = (columns - 1) * columnGap;
  const totalRowGaps = (rows - 1) * rowGap;

  const availableWidth = Math.max(0, width - totalColumnGaps);
  const availableHeight = Math.max(0, height - totalRowGaps);

  const slotWidth = availableWidth > 0 ? Math.floor(availableWidth / columns) : 0;
  const slotHeight = availableHeight > 0 ? Math.floor(availableHeight / rows) : 0;

  const slots: ViewportSlot[] = [];

  for (let index = 0; index < totalSlots; index++) {
    const col = index % columns;
    const row = Math.floor(index / columns);

    const x = slotWidth > 0 ? col * (slotWidth + columnGap) : 0;
    const y = slotHeight > 0 ? row * (slotHeight + rowGap) : 0;

    slots.push({
      id: `slot-${index}`,
      index,
      x,
      y,
      width: slotWidth,
      height: slotHeight
    });
  }

  return slots;
}

/**
 * SplitScreenContainer component rendering responsive CSS grid viewports
 * for WebGL charts.
 */
export const SplitScreenContainer: React.FC<SplitScreenContainerProps> = ({
  layout,
  dimensions = { width: 0, height: 0 },
  gap,
  className,
  style,
  onViewportResize,
  children
}) => {
  if (!LAYOUT_CONFIGS[layout]) {
    throw new TypeError(`Unsupported layout configuration: ${layout}`);
  }

  const template = getGridTemplate(layout);
  const slots = calculateViewportDimensions(layout, dimensions, gap);

  const prevKeyRef = React.useRef<string>('');
  const currentKey = `${layout}:${dimensions.width}x${dimensions.height}:${
    typeof gap === 'number'
      ? gap
      : gap
      ? `${gap.rowGap}x${gap.columnGap}`
      : 'none'
  }`;

  if (onViewportResize && prevKeyRef.current !== currentKey) {
    prevKeyRef.current = currentKey;
    onViewportResize(slots);
  }

  React.useEffect(() => {
    if (onViewportResize && prevKeyRef.current !== currentKey) {
      prevKeyRef.current = currentKey;
      onViewportResize(slots);
    }
  }, [currentKey, onViewportResize, slots]);

  const gapValue =
    typeof gap === 'number'
      ? `${gap}px`
      : gap && typeof gap === 'object'
      ? `${gap.rowGap}px ${gap.columnGap}px`
      : undefined;

  const containerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: template.columns,
    gridTemplateRows: template.rows,
    ...(gapValue !== undefined ? { gap: gapValue } : {}),
    ...style
  };

  const containerClasses = [
    'split-screen-container',
    `layout-${layout}`,
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses} style={containerStyle}>
      {slots.map((slot) => (
        <div
          key={slot.id}
          className="split-screen-slot"
          data-slot-id={slot.id}
          data-slot-index={slot.index}
          data-width={slot.width}
          data-height={slot.height}
          data-x={slot.x}
          data-y={slot.y}
        >
          {typeof children === 'function' ? children(slot) : children}
        </div>
      ))}
    </div>
  );
};

export default SplitScreenContainer;