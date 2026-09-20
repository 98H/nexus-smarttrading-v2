import React from 'react';
import { useCrosshairSync } from '../hooks/useCrosshairSync.ts';
import type { TimeBus } from '../services/timeBus.ts';

export interface ChartPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  timeBus: TimeBus;
  syncEnabled?: boolean;
  visible?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const ChartPane: React.FC<ChartPaneProps> = ({
  id,
  timeBus,
  syncEnabled = true,
  visible = true,
  className,
  style,
  children,
  ...rest
}) => {
  const { syncedTimestamp, isSyncEnabled } = useCrosshairSync({
    paneId: id,
    syncEnabled,
    visible,
    timeBus,
  });

  const showCrosshair = visible && isSyncEnabled && syncedTimestamp !== null;

  return (
    <div
      id={id}
      data-testid={`chart-pane-${id}`}
      className={className}
      style={{
        ...style,
        ...(visible ? {} : { display: 'none' }),
      }}
      {...rest}
    >
      {showCrosshair && (
        <div
          data-testid={`crosshair-line-${id}`}
          data-timestamp={syncedTimestamp}
          className="crosshair-line"
        />
      )}
      {children}
    </div>
  );
};