import React from 'react';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d' | string;

export const SUPPORTED_TIMEFRAMES: readonly Timeframe[] = [
  '1m',
  '5m',
  '15m',
  '1h',
  '1d',
] as const;

export interface ChartToolbarProps {
  timeframes?: readonly Timeframe[] | Timeframe[];
  activeTimeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
  disabled?: boolean;
  className?: string;
}

export function ChartToolbar({
  timeframes = SUPPORTED_TIMEFRAMES,
  activeTimeframe,
  onTimeframeChange,
  disabled = false,
  className = '',
}: ChartToolbarProps) {
  return (
    <div
      className={`chart-toolbar ${className}`.trim()}
      role="toolbar"
      aria-label="Chart Timeframes"
    >
      {timeframes.map((tf) => {
        const isActive = tf === activeTimeframe;
        return (
          <button
            key={tf}
            type="button"
            data-timeframe={tf}
            value={tf}
            data-active={isActive}
            aria-pressed={isActive}
            disabled={disabled}
            className={`chart-toolbar__button ${isActive ? 'active' : ''}`.trim()}
            onClick={(e) => {
              e?.preventDefault?.();
              e?.stopPropagation?.();
              if (!isActive && !disabled) {
                onTimeframeChange(tf);
              }
            }}
          >
            {tf}
          </button>
        );
      })}
    </div>
  );
}