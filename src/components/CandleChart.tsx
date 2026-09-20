import React from 'react';
import {
  ChartToolbar,
  type Timeframe,
  SUPPORTED_TIMEFRAMES,
} from './ChartToolbar.tsx';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function parseTimeframeToMs(timeframe: Timeframe): number {
  const match = timeframe.match(/^(\d+)([mhd])$/);
  if (!match) return 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  return 60 * 1000;
}

export function aggregateCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (!candles || candles.length === 0) {
    return [];
  }

  const intervalMs = parseTimeframeToMs(timeframe);
  const firstTimestamp = candles[0].timestamp;
  const buckets: Map<number, Candle[]> = new Map();

  for (const candle of candles) {
    const bucketIndex = Math.floor((candle.timestamp - firstTimestamp) / intervalMs);
    let bucket = buckets.get(bucketIndex);
    if (!bucket) {
      bucket = [];
      buckets.set(bucketIndex, bucket);
    }
    bucket.push(candle);
  }

  const aggregated: Candle[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length === 0) continue;

    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const c of bucket) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume ?? 0;
    }

    aggregated.push({
      timestamp: bucket[0].timestamp,
      open: bucket[0].open,
      high,
      low,
      close: bucket[bucket.length - 1].close,
      volume,
    });
  }

  return aggregated;
}

export interface CandleChartRendererOptions {
  fetchCandles?: (timeframe: Timeframe) => Promise<Candle[]>;
}

export class CandleChartRenderer {
  private canvas: HTMLCanvasElement;
  private options?: CandleChartRendererOptions;
  private rawCandles: Candle[] = [];
  private activeTimeframe: Timeframe = '1m';

  constructor(canvas: HTMLCanvasElement, options?: CandleChartRendererOptions) {
    this.canvas = canvas;
    this.options = options;
  }

  render(candles: Candle[], timeframe: Timeframe = '1m'): void {
    this.rawCandles = candles;
    this.activeTimeframe = timeframe;
    const aggregated = aggregateCandles(candles, timeframe);
    this.draw(aggregated);
  }

  setTimeframe(timeframe: Timeframe, rawCandles?: Candle[]): void {
    this.activeTimeframe = timeframe;
    if (rawCandles) {
      this.rawCandles = rawCandles;
    }
    const aggregated = aggregateCandles(this.rawCandles, timeframe);
    this.draw(aggregated);
  }

  async changeTimeframeWithFetch(timeframe: Timeframe): Promise<void> {
    this.activeTimeframe = timeframe;
    if (this.options?.fetchCandles) {
      const fetched = await this.options.fetchCandles(timeframe);
      this.rawCandles = fetched;
      this.draw(fetched);
    } else {
      this.setTimeframe(timeframe);
    }
  }

  draw(candles: Candle[]): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!candles || candles.length === 0) return;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const c of candles) {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }

    const priceRange = maxPrice - minPrice || 1;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const candleWidth = width / candles.length;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = i * candleWidth;
      const midX = x + candleWidth / 2;

      const yHigh = height - ((c.high - minPrice) / priceRange) * height;
      const yLow = height - ((c.low - minPrice) / priceRange) * height;
      const yOpen = height - ((c.open - minPrice) / priceRange) * height;
      const yClose = height - ((c.close - minPrice) / priceRange) * height;

      const isBullish = c.close >= c.open;
      const color = isBullish ? '#26a69a' : '#ef5350';

      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      ctx.beginPath();
      ctx.moveTo(midX, yHigh);
      ctx.lineTo(midX, yLow);
      ctx.stroke();

      const bodyY = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(Math.abs(yOpen - yClose), 1);
      const bodyWidth = Math.max(candleWidth * 0.8, 1);
      const bodyX = x + (candleWidth - bodyWidth) / 2;

      ctx.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);
    }
  }
}

export interface CandleChartProps {
  candles?: Candle[];
  timeframe?: Timeframe;
  timeframes?: readonly Timeframe[] | Timeframe[];
  onTimeframeChange?: (timeframe: Timeframe) => void;
  fetchCandles?: (timeframe: Timeframe) => Promise<Candle[]>;
  width?: number;
  height?: number;
  className?: string;
}

export function CandleChart({
  candles = [],
  timeframe = '1m',
  timeframes = SUPPORTED_TIMEFRAMES,
  onTimeframeChange,
  fetchCandles,
  width = 800,
  height = 400,
  className = '',
}: CandleChartProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<CandleChartRenderer | null>(null);
  const [activeTimeframe, setActiveTimeframe] = React.useState<Timeframe>(timeframe);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = new CandleChartRenderer(canvasRef.current, { fetchCandles });
    rendererRef.current = renderer;
    renderer.render(candles, activeTimeframe);
  }, []);

  React.useEffect(() => {
    if (!rendererRef.current) return;
    if (fetchCandles) {
      rendererRef.current.changeTimeframeWithFetch(activeTimeframe);
    } else {
      rendererRef.current.setTimeframe(activeTimeframe, candles);
    }
  }, [activeTimeframe, candles, fetchCandles]);

  const handleTimeframeChange = (newTf: Timeframe) => {
    setActiveTimeframe(newTf);
    onTimeframeChange?.(newTf);
  };

  return (
    <div className={`candle-chart ${className}`.trim()}>
      <ChartToolbar
        timeframes={timeframes}
        activeTimeframe={activeTimeframe}
        onTimeframeChange={handleTimeframeChange}
      />
      <canvas ref={canvasRef} width={width} height={height} />
    </div>
  );
}