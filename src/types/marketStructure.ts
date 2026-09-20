export type StructureType = 'bullish' | 'bearish';

export type MitigationState = 'unmitigated' | 'partially_mitigated' | 'fully_mitigated';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FairValueGap {
  id: string;
  type: StructureType;
  top: number;
  bottom: number;
  state: MitigationState;
  candleIndices: [number, number, number];
  createdAt: number;
  mitigatedAt?: number;
}

export interface OrderBlock {
  id: string;
  type: StructureType;
  top: number;
  bottom: number;
  state: MitigationState;
  candleIndex: number;
  volume: number;
  createdAt: number;
  mitigatedAt?: number;
}

export interface DetectorConfig {
  minGapAbsolute?: number;
  volumeMultiplierThreshold?: number;
  swingLookback?: number;
}

export interface DetectorProcessResult {
  newFvgs: FairValueGap[];
  newOrderBlocks: OrderBlock[];
  updatedFvgs: FairValueGap[];
  updatedOrderBlocks: OrderBlock[];
}