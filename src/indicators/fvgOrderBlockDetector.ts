import type {
  Candle,
  FairValueGap,
  OrderBlock,
  DetectorConfig,
  DetectorProcessResult,
} from '../types/marketStructure.js';

interface ResolvedConfig {
  minGapAbsolute: number;
  volumeMultiplierThreshold: number;
  swingLookback: number;
}

const DEFAULT_CONFIG: ResolvedConfig = {
  minGapAbsolute: 0,
  volumeMultiplierThreshold: 2.0,
  swingLookback: 3,
};

export class FvgOrderBlockDetector {
  private readonly config: ResolvedConfig;
  private candles: Candle[] = [];
  private fvgs: FairValueGap[] = [];
  private orderBlocks: OrderBlock[] = [];
  private fvgCounter = 0;
  private obCounter = 0;

  constructor(config?: DetectorConfig) {
    this.config = {
      minGapAbsolute: config?.minGapAbsolute ?? DEFAULT_CONFIG.minGapAbsolute,
      volumeMultiplierThreshold:
        config?.volumeMultiplierThreshold ?? DEFAULT_CONFIG.volumeMultiplierThreshold,
      swingLookback: config?.swingLookback ?? DEFAULT_CONFIG.swingLookback,
    };
  }

  public processCandle(candle: Candle): DetectorProcessResult {
    if (candle.high < candle.low) {
      throw new Error('Invalid candle: high must be greater than or equal to low');
    }

    const currentCandle = { ...candle };
    const currentIndex = this.candles.length;

    const updatedFvgs: FairValueGap[] = [];
    const updatedOrderBlocks: OrderBlock[] = [];

    // 1. Update mitigation state of existing active structures
    this.updateFvgMitigations(currentCandle, updatedFvgs);
    this.updateOrderBlockMitigations(currentCandle, updatedOrderBlocks);

    // 2. Append candle to historical record
    this.candles.push(currentCandle);

    // 3. Detect new structures formed at the current candle
    const newFvgs = this.detectFvg(currentIndex, currentCandle);
    const newOrderBlocks = this.detectOrderBlock(currentIndex, currentCandle);

    return {
      newFvgs,
      newOrderBlocks,
      updatedFvgs,
      updatedOrderBlocks,
    };
  }

  public getActiveFVGs(): FairValueGap[] {
    return this.fvgs
      .filter((fvg) => fvg.state !== 'fully_mitigated')
      .map((fvg) => ({ ...fvg, candleIndices: [...fvg.candleIndices] }));
  }

  public getAllFVGs(): FairValueGap[] {
    return this.fvgs.map((fvg) => ({ ...fvg, candleIndices: [...fvg.candleIndices] }));
  }

  public getActiveOrderBlocks(): OrderBlock[] {
    return this.orderBlocks
      .filter((ob) => ob.state !== 'fully_mitigated')
      .map((ob) => ({ ...ob }));
  }

  public getAllOrderBlocks(): OrderBlock[] {
    return this.orderBlocks.map((ob) => ({ ...ob }));
  }

  public reset(): void {
    this.candles = [];
    this.fvgs = [];
    this.orderBlocks = [];
    this.fvgCounter = 0;
    this.obCounter = 0;
  }

  private updateFvgMitigations(candle: Candle, updated: FairValueGap[]): void {
    for (const fvg of this.fvgs) {
      if (fvg.state === 'fully_mitigated') {
        continue;
      }

      if (fvg.type === 'bullish') {
        if (candle.low <= fvg.bottom) {
          fvg.state = 'fully_mitigated';
          fvg.mitigatedAt = candle.timestamp;
          updated.push({ ...fvg, candleIndices: [...fvg.candleIndices] });
        } else if (fvg.state === 'unmitigated' && candle.low < fvg.top) {
          fvg.state = 'partially_mitigated';
          updated.push({ ...fvg, candleIndices: [...fvg.candleIndices] });
        }
      } else if (fvg.type === 'bearish') {
        if (candle.high >= fvg.top) {
          fvg.state = 'fully_mitigated';
          fvg.mitigatedAt = candle.timestamp;
          updated.push({ ...fvg, candleIndices: [...fvg.candleIndices] });
        } else if (fvg.state === 'unmitigated' && candle.high > fvg.bottom) {
          fvg.state = 'partially_mitigated';
          updated.push({ ...fvg, candleIndices: [...fvg.candleIndices] });
        }
      }
    }
  }

  private updateOrderBlockMitigations(candle: Candle, updated: OrderBlock[]): void {
    for (const ob of this.orderBlocks) {
      if (ob.state === 'fully_mitigated') {
        continue;
      }

      if (ob.type === 'bullish') {
        if (candle.low <= ob.bottom) {
          ob.state = 'fully_mitigated';
          ob.mitigatedAt = candle.timestamp;
          updated.push({ ...ob });
        } else if (ob.state === 'unmitigated' && candle.low < ob.top) {
          ob.state = 'partially_mitigated';
          updated.push({ ...ob });
        }
      } else if (ob.type === 'bearish') {
        if (candle.high >= ob.top) {
          ob.state = 'fully_mitigated';
          ob.mitigatedAt = candle.timestamp;
          updated.push({ ...ob });
        } else if (ob.state === 'unmitigated' && candle.high > ob.bottom) {
          ob.state = 'partially_mitigated';
          updated.push({ ...ob });
        }
      }
    }
  }

  private detectFvg(currentIndex: number, currentCandle: Candle): FairValueGap[] {
    if (currentIndex < 2) {
      return [];
    }

    const c1 = this.candles[currentIndex - 2];
    const c3 = currentCandle;
    const minGap = this.config.minGapAbsolute;
    const newFvgs: FairValueGap[] = [];

    // Bullish FVG: Candle 1 High < Candle 3 Low
    if (c3.low > c1.high && c3.low - c1.high >= minGap) {
      const fvg: FairValueGap = {
        id: `fvg-${++this.fvgCounter}`,
        type: 'bullish',
        bottom: c1.high,
        top: c3.low,
        state: 'unmitigated',
        candleIndices: [currentIndex - 2, currentIndex - 1, currentIndex],
        createdAt: c3.timestamp,
      };
      this.fvgs.push(fvg);
      newFvgs.push({ ...fvg, candleIndices: [...fvg.candleIndices] });
    }

    // Bearish FVG: Candle 1 Low > Candle 3 High
    if (c1.low > c3.high && c1.low - c3.high >= minGap) {
      const fvg: FairValueGap = {
        id: `fvg-${++this.fvgCounter}`,
        type: 'bearish',
        bottom: c3.high,
        top: c1.low,
        state: 'unmitigated',
        candleIndices: [currentIndex - 2, currentIndex - 1, currentIndex],
        createdAt: c3.timestamp,
      };
      this.fvgs.push(fvg);
      newFvgs.push({ ...fvg, candleIndices: [...fvg.candleIndices] });
    }

    return newFvgs;
  }

  private detectOrderBlock(currentIndex: number, currentCandle: Candle): OrderBlock[] {
    const sweepIndex = currentIndex - 1;
    if (sweepIndex < 1) {
      return [];
    }

    const sweepCandle = this.candles[sweepIndex];
    const lookbackStart = Math.max(0, sweepIndex - this.config.swingLookback);
    const lookbackCandles = this.candles.slice(lookbackStart, sweepIndex);

    if (lookbackCandles.length === 0) {
      return [];
    }

    const baselineVolume =
      lookbackCandles.reduce((sum, c) => sum + c.volume, 0) / lookbackCandles.length;
    const requiredVolume = baselineVolume * this.config.volumeMultiplierThreshold;

    if (currentCandle.volume < requiredVolume) {
      return [];
    }

    const newOrderBlocks: OrderBlock[] = [];

    // Bullish OB: Swept swing low + upward displacement breaking sweep candle high
    const swingLow = Math.min(...lookbackCandles.map((c) => c.low));
    const isBullishSweep = sweepCandle.low < swingLow;
    const isBullishDisplacement =
      currentCandle.close > currentCandle.open && currentCandle.close > sweepCandle.high;

    if (isBullishSweep && isBullishDisplacement) {
      const ob: OrderBlock = {
        id: `ob-${++this.obCounter}`,
        type: 'bullish',
        top: sweepCandle.high,
        bottom: sweepCandle.low,
        state: 'unmitigated',
        candleIndex: sweepIndex,
        volume: sweepCandle.volume,
        createdAt: currentCandle.timestamp,
      };
      this.orderBlocks.push(ob);
      newOrderBlocks.push({ ...ob });
    }

    // Bearish OB: Swept swing high + downward displacement breaking sweep candle low
    const swingHigh = Math.max(...lookbackCandles.map((c) => c.high));
    const isBearishSweep = sweepCandle.high > swingHigh;
    const isBearishDisplacement =
      currentCandle.close < currentCandle.open && currentCandle.close < sweepCandle.low;

    if (isBearishSweep && isBearishDisplacement) {
      const ob: OrderBlock = {
        id: `ob-${++this.obCounter}`,
        type: 'bearish',
        top: sweepCandle.high,
        bottom: sweepCandle.low,
        state: 'unmitigated',
        candleIndex: sweepIndex,
        volume: sweepCandle.volume,
        createdAt: currentCandle.timestamp,
      };
      this.orderBlocks.push(ob);
      newOrderBlocks.push({ ...ob });
    }

    return newOrderBlocks;
  }
}