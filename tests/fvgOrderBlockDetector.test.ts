/**
 * Test Suite: Fair Value Gap (FVG) and Order Block (OB) Detector
 * Story: Story 3.2.2: Fair Value Gap (FVG) and Order Block (OB) Detector
 * 
 * Location: tests/indicators/fvgOrderBlockDetector.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { FvgOrderBlockDetector } from '../src/indicators/fvgOrderBlockDetector.js';
import type {
  Candle,
  FairValueGap,
  OrderBlock,
  DetectorConfig,
} from '../src/types/marketStructure.js';

describe('Story 3.2.2: Fair Value Gap (FVG) and Order Block (OB) Detector', () => {
  let detector: FvgOrderBlockDetector;
  const defaultBaseTimestamp = 1_700_000_000_000;
  const candleIntervalMs = 60_000;

  /**
   * Helper factory to build test candles with deterministic defaults.
   */
  function buildCandle(index: number, overrides: Partial<Candle> = {}): Candle {
    return {
      timestamp: defaultBaseTimestamp + index * candleIntervalMs,
      open: 100,
      high: 105,
      low: 95,
      close: 100,
      volume: 1_000,
      ...overrides,
    };
  }

  beforeEach(() => {
    const config: DetectorConfig = {
      minGapAbsolute: 0.5,
      volumeMultiplierThreshold: 2.0,
      swingLookback: 3,
    };
    detector = new FvgOrderBlockDetector(config);
  });

  describe('AC1: 3-Candle Imbalance & Active Fair Value Gap (FVG) Detection', () => {
    it('should create an active unmitigated bullish FVG when Candle 1 High < Candle 3 Low', () => {
      // Candle 1: Base candle
      const c1 = buildCandle(0, {
        open: 100,
        high: 102,
        low: 98,
        close: 101,
        volume: 1_000,
      });

      // Candle 2: Strong bullish displacement
      const c2 = buildCandle(1, {
        open: 101,
        high: 115,
        low: 101,
        close: 114,
        volume: 3_500,
      });

      // Candle 3: Follow-through leaving an imbalance gap above Candle 1 High
      const c3 = buildCandle(2, {
        open: 114,
        high: 118,
        low: 106,
        close: 116,
        volume: 1_200,
      });

      detector.processCandle(c1);
      detector.processCandle(c2);
      const result = detector.processCandle(c3);

      const activeFvgs = detector.getActiveFVGs();
      assert.strictEqual(activeFvgs.length, 1, 'Should detect exactly one active FVG');

      const fvg = activeFvgs[0];
      assert.strictEqual(fvg.type, 'bullish');
      assert.strictEqual(fvg.bottom, 102, 'Bullish FVG bottom should equal Candle 1 High');
      assert.strictEqual(fvg.top, 106, 'Bullish FVG top should equal Candle 3 Low');
      assert.strictEqual(fvg.state, 'unmitigated', 'FVG must be initialized with unmitigated state');
      assert.deepStrictEqual(fvg.candleIndices, [0, 1, 2], 'FVG must reference the 3 participating candle indices');
      assert.strictEqual(fvg.createdAt, c3.timestamp);
      assert.strictEqual(result.newFvgs.length, 1, 'Result emit payload should contain new FVG');
    });

    it('should create an active unmitigated bearish FVG when Candle 1 Low > Candle 3 High', () => {
      // Candle 1: Base candle
      const c1 = buildCandle(0, {
        open: 200,
        high: 202,
        low: 198,
        close: 199,
        volume: 1_000,
      });

      // Candle 2: Strong bearish displacement
      const c2 = buildCandle(1, {
        open: 199,
        high: 199,
        low: 180,
        close: 181,
        volume: 4_000,
      });

      // Candle 3: Follow-through leaving an imbalance gap below Candle 1 Low
      const c3 = buildCandle(2, {
        open: 181,
        high: 192,
        low: 178,
        close: 180,
        volume: 1_100,
      });

      detector.processCandle(c1);
      detector.processCandle(c2);
      detector.processCandle(c3);

      const activeFvgs = detector.getActiveFVGs();
      assert.strictEqual(activeFvgs.length, 1, 'Should detect exactly one active FVG');

      const fvg = activeFvgs[0];
      assert.strictEqual(fvg.type, 'bearish');
      assert.strictEqual(fvg.bottom, 192, 'Bearish FVG bottom should equal Candle 3 High');
      assert.strictEqual(fvg.top, 198, 'Bearish FVG top should equal Candle 1 Low');
      assert.strictEqual(fvg.state, 'unmitigated');
      assert.deepStrictEqual(fvg.candleIndices, [0, 1, 2]);
    });

    it('should NOT create an FVG when Candle 1 and Candle 3 wicks overlap', () => {
      // Candle 1 High = 105
      const c1 = buildCandle(0, { open: 100, high: 105, low: 98, close: 104 });
      // Candle 2 Bullish bar
      const c2 = buildCandle(1, { open: 104, high: 112, low: 103, close: 111 });
      // Candle 3 Low dips down to 104 (overlaps with Candle 1 High: 105 >= 104)
      const c3 = buildCandle(2, { open: 111, high: 115, low: 104, close: 114 });

      detector.processCandle(c1);
      detector.processCandle(c2);
      detector.processCandle(c3);

      assert.strictEqual(detector.getActiveFVGs().length, 0, 'Must not create FVG when wicks overlap');
    });

    it('should ignore imbalances smaller than minGapAbsolute threshold', () => {
      const tightConfigDetector = new FvgOrderBlockDetector({
        minGapAbsolute: 5.0, // gap must be >= 5.0 points
        volumeMultiplierThreshold: 1.5,
      });

      // Gap is only 1.0 point (102 to 103)
      const c1 = buildCandle(0, { open: 100, high: 102, low: 98, close: 101 });
      const c2 = buildCandle(1, { open: 101, high: 108, low: 101, close: 107 });
      const c3 = buildCandle(2, { open: 107, high: 110, low: 103, close: 109 });

      tightConfigDetector.processCandle(c1);
      tightConfigDetector.processCandle(c2);
      tightConfigDetector.processCandle(c3);

      assert.strictEqual(tightConfigDetector.getActiveFVGs().length, 0, 'Gap below threshold must be ignored');
    });
  });

  describe('AC2: Liquidity Sweep, Displacement & Order Block (OB) Emission', () => {
    it('should emit a Bullish Order Block following a swing low sweep and high-volume upward displacement', () => {
      // 1. Establish an established swing low at 95.0
      const c0 = buildCandle(0, { open: 102, high: 104, low: 95, close: 98, volume: 1_000 });
      const c1 = buildCandle(1, { open: 98, high: 103, low: 97, close: 102, volume: 1_000 });
      const c2 = buildCandle(2, { open: 102, high: 106, low: 100, close: 105, volume: 1_000 });

      // 2. Bearish candle sweeps liquidity below swing low (Low = 93.0 < 95.0)
      const sweepCandle = buildCandle(3, {
        open: 104,
        high: 104,
        low: 93,
        close: 94,
        volume: 1_200,
      });

      // 3. High-volume displacement candle breaking back above sweep candle high
      const displacementCandle = buildCandle(4, {
        open: 94,
        high: 112,
        low: 94,
        close: 110,
        volume: 3_500, // 3.5x baseline volume
      });

      detector.processCandle(c0);
      detector.processCandle(c1);
      detector.processCandle(c2);
      detector.processCandle(sweepCandle);
      const result = detector.processCandle(displacementCandle);

      const orderBlocks = detector.getActiveOrderBlocks();
      assert.strictEqual(orderBlocks.length, 1, 'Should identify one bullish Order Block');

      const ob: OrderBlock = orderBlocks[0];
      assert.strictEqual(ob.type, 'bullish');
      assert.strictEqual(ob.top, 104, 'Bullish OB boundary top should match sweep candle high');
      assert.strictEqual(ob.bottom, 93, 'Bullish OB boundary bottom should match sweep candle low');
      assert.strictEqual(ob.state, 'unmitigated', 'Initial OB state must be unmitigated');
      assert.strictEqual(ob.candleIndex, 3, 'OB must refer to the sweep candle index');
      assert.strictEqual(ob.volume, 1_200);
      assert.strictEqual(result.newOrderBlocks.length, 1);
    });

    it('should emit a Bearish Order Block following a swing high sweep and high-volume downward displacement', () => {
      // 1. Establish swing high at 205.0
      const c0 = buildCandle(0, { open: 198, high: 205, low: 196, close: 200, volume: 1_000 });
      const c1 = buildCandle(1, { open: 200, high: 202, low: 195, close: 197, volume: 1_000 });
      const c2 = buildCandle(2, { open: 197, high: 201, low: 194, close: 195, volume: 1_000 });

      // 2. Bullish candle sweeps swing high (High = 208.0 > 205.0)
      const sweepCandle = buildCandle(3, {
        open: 196,
        high: 208,
        low: 196,
        close: 207,
        volume: 1_100,
      });

      // 3. High-volume bearish displacement candle breaking sweep candle low
      const displacementCandle = buildCandle(4, {
        open: 207,
        high: 207,
        low: 188,
        close: 190,
        volume: 3_200, // > 2.0x volume threshold
      });

      detector.processCandle(c0);
      detector.processCandle(c1);
      detector.processCandle(c2);
      detector.processCandle(sweepCandle);
      detector.processCandle(displacementCandle);

      const orderBlocks = detector.getActiveOrderBlocks();
      assert.strictEqual(orderBlocks.length, 1, 'Should identify one bearish Order Block');

      const ob = orderBlocks[0];
      assert.strictEqual(ob.type, 'bearish');
      assert.strictEqual(ob.top, 208, 'Bearish OB top should match sweep candle high');
      assert.strictEqual(ob.bottom, 196, 'Bearish OB bottom should match sweep candle low');
      assert.strictEqual(ob.state, 'unmitigated');
      assert.strictEqual(ob.candleIndex, 3);
    });

    it('should NOT emit an Order Block if displacement candle has insufficient volume', () => {
      // Swing high at 200
      const c0 = buildCandle(0, { open: 195, high: 200, low: 192, close: 196, volume: 1_000 });
      const c1 = buildCandle(1, { open: 196, high: 198, low: 191, close: 194, volume: 1_000 });
      const sweepCandle = buildCandle(2, { open: 194, high: 204, low: 194, close: 203, volume: 1_000 });
      // Low volume displacement (only 1_200 volume, below 2.0x threshold)
      const weakDisplacement = buildCandle(3, {
        open: 203,
        high: 203,
        low: 189,
        close: 190,
        volume: 1_200,
      });

      detector.processCandle(c0);
      detector.processCandle(c1);
      detector.processCandle(sweepCandle);
      detector.processCandle(weakDisplacement);

      assert.strictEqual(detector.getActiveOrderBlocks().length, 0, 'Low-volume displacement must not form an OB');
    });
  });

  describe('AC3: Boundary Testing & Mitigation State Lifecycle', () => {
    describe('Fair Value Gap Mitigation Transitions', () => {
      let bullishFvg: FairValueGap;

      beforeEach(() => {
        // Setup a bullish FVG: Range [102, 108]
        const c1 = buildCandle(0, { open: 98, high: 102, low: 96, close: 101 });
        const c2 = buildCandle(1, { open: 101, high: 115, low: 101, close: 114, volume: 3_000 });
        const c3 = buildCandle(2, { open: 114, high: 118, low: 108, close: 117 });

        detector.processCandle(c1);
        detector.processCandle(c2);
        detector.processCandle(c3);

        const fvgs = detector.getActiveFVGs();
        assert.strictEqual(fvgs.length, 1);
        bullishFvg = fvgs[0];
      });

      it('should transition to partially_mitigated when price penetrates the gap without breaching the opposite boundary', () => {
        // Candle 4 pulls back into the gap: Low drops to 105 (inside [102, 108])
        const c4 = buildCandle(3, {
          open: 117,
          high: 117,
          low: 105,
          close: 109,
        });

        const updateResult = detector.processCandle(c4);

        const active = detector.getActiveFVGs();
        assert.strictEqual(active.length, 1);
        assert.strictEqual(active[0].state, 'partially_mitigated');
        assert.strictEqual(updateResult.updatedFvgs.length, 1);
        assert.strictEqual(updateResult.updatedFvgs[0].state, 'partially_mitigated');
      });

      it('should transition to fully_mitigated when price completely breaches the bottom boundary', () => {
        // Candle 4 breaches through the entire gap: Low drops to 101 (below bottom 102)
        const c4 = buildCandle(3, {
          open: 117,
          high: 117,
          low: 101,
          close: 103,
        });

        detector.processCandle(c4);

        const allFvgs = detector.getAllFVGs();
        const fvg = allFvgs.find((item) => item.id === bullishFvg.id);
        assert.ok(fvg, 'FVG must be tracked in detector storage');
        assert.strictEqual(fvg.state, 'fully_mitigated');
        assert.strictEqual(fvg.mitigatedAt, c4.timestamp, 'mitigatedAt timestamp must be recorded');

        const activeFvgs = detector.getActiveFVGs();
        assert.strictEqual(activeFvgs.length, 0, 'Fully mitigated FVG must no longer be active');
      });

      it('should transition directly from unmitigated to fully_mitigated in a single aggressive bar', () => {
        // Massive gap-down / collapse cutting cleanly below 102
        const c4 = buildCandle(3, {
          open: 110,
          high: 110,
          low: 95,
          close: 96,
        });

        detector.processCandle(c4);

        const fvg = detector.getAllFVGs()[0];
        assert.strictEqual(fvg.state, 'fully_mitigated');
        assert.strictEqual(detector.getActiveFVGs().length, 0);
      });
    });

    describe('Order Block Mitigation Transitions', () => {
      let bullishOB: OrderBlock;

      beforeEach(() => {
        // Build setup for bullish OB with boundaries [92, 100]
        const c0 = buildCandle(0, { open: 101, high: 103, low: 94, close: 98 });
        const c1 = buildCandle(1, { open: 98, high: 100, low: 96, close: 99 });
        const sweepCandle = buildCandle(2, {
          open: 99,
          high: 100,
          low: 92,
          close: 93,
          volume: 1_200,
        });
        const displacementCandle = buildCandle(3, {
          open: 93,
          high: 115,
          low: 93,
          close: 114,
          volume: 4_000,
        });

        detector.processCandle(c0);
        detector.processCandle(c1);
        detector.processCandle(sweepCandle);
        detector.processCandle(displacementCandle);

        const obs = detector.getActiveOrderBlocks();
        assert.strictEqual(obs.length, 1);
        bullishOB = obs[0];
      });

      it('should transition to partially_mitigated when subsequent price enters OB zone', () => {
        // Price enters the zone [92, 100]: Low = 96
        const testCandle = buildCandle(4, {
          open: 114,
          high: 114,
          low: 96,
          close: 102,
        });

        const updateResult = detector.processCandle(testCandle);

        const activeOBs = detector.getActiveOrderBlocks();
        assert.strictEqual(activeOBs.length, 1);
        assert.strictEqual(activeOBs[0].state, 'partially_mitigated');
        assert.strictEqual(updateResult.updatedOrderBlocks.length, 1);
        assert.strictEqual(updateResult.updatedOrderBlocks[0].id, bullishOB.id);
      });

      it('should transition to fully_mitigated and deactivate when price breaches through bottom boundary', () => {
        // Price breaches through bottom (92.0): Low = 90.0, Close = 91.0
        const breachCandle = buildCandle(4, {
          open: 114,
          high: 114,
          low: 90,
          close: 91,
        });

        detector.processCandle(breachCandle);

        const allOBs = detector.getAllOrderBlocks();
        const ob = allOBs.find((item) => item.id === bullishOB.id);
        assert.ok(ob);
        assert.strictEqual(ob.state, 'fully_mitigated');
        assert.strictEqual(ob.mitigatedAt, breachCandle.timestamp);

        assert.strictEqual(detector.getActiveOrderBlocks().length, 0);
      });
    });

    describe('Bearish Structures Mitigation Testing', () => {
      it('should properly track bearish FVG partial and full mitigation on price rallies', () => {
        // Bearish FVG: [188, 195]
        const c1 = buildCandle(0, { open: 198, high: 200, low: 195, close: 197 });
        const c2 = buildCandle(1, { open: 197, high: 197, low: 180, close: 181, volume: 3_000 });
        const c3 = buildCandle(2, { open: 181, high: 188, low: 175, close: 176 });

        detector.processCandle(c1);
        detector.processCandle(c2);
        detector.processCandle(c3);

        const active = detector.getActiveFVGs();
        assert.strictEqual(active.length, 1);
        assert.strictEqual(active[0].type, 'bearish');
        assert.strictEqual(active[0].bottom, 188);
        assert.strictEqual(active[0].top, 195);

        // 1. Partial test: High crosses bottom (188) but remains below top (195)
        const partialCandle = buildCandle(3, {
          open: 176,
          high: 191,
          low: 175,
          close: 185,
        });
        detector.processCandle(partialCandle);
        assert.strictEqual(detector.getActiveFVGs()[0].state, 'partially_mitigated');

        // 2. Full breach: High breaches top (195)
        const fullCandle = buildCandle(4, {
          open: 185,
          high: 198,
          low: 184,
          close: 196,
        });
        detector.processCandle(fullCandle);
        assert.strictEqual(detector.getActiveFVGs().length, 0);
        assert.strictEqual(detector.getAllFVGs()[0].state, 'fully_mitigated');
      });
    });
  });

  describe('Edge Cases and Resilience', () => {
    it('should throw an error if an invalid candle with high < low is processed', () => {
      const invalidCandle = buildCandle(0, { high: 90, low: 100 });
      assert.throws(() => {
        detector.processCandle(invalidCandle);
      }, /Invalid candle: high must be greater than or equal to low/i);
    });

    it('should reset internal state properly on reset()', () => {
      const c1 = buildCandle(0, { open: 100, high: 102, low: 98, close: 101 });
      const c2 = buildCandle(1, { open: 101, high: 115, low: 101, close: 114, volume: 3_000 });
      const c3 = buildCandle(2, { open: 114, high: 118, low: 106, close: 116 });

      detector.processCandle(c1);
      detector.processCandle(c2);
      detector.processCandle(c3);

      assert.strictEqual(detector.getActiveFVGs().length, 1);

      detector.reset();

      assert.strictEqual(detector.getAllFVGs().length, 0);
      assert.strictEqual(detector.getActiveFVGs().length, 0);
      assert.strictEqual(detector.getAllOrderBlocks().length, 0);
      assert.strictEqual(detector.getActiveOrderBlocks().length, 0);
    });

    it('should preserve immutable state when returning list of structures', () => {
      const c1 = buildCandle(0, { open: 100, high: 102, low: 98, close: 101 });
      const c2 = buildCandle(1, { open: 101, high: 115, low: 101, close: 114, volume: 3_000 });
      const c3 = buildCandle(2, { open: 114, high: 118, low: 106, close: 116 });

      detector.processCandle(c1);
      detector.processCandle(c2);
      detector.processCandle(c3);

      const fvgs = detector.getActiveFVGs();
      // External mutation attempt
      (fvgs as FairValueGap[]).push({} as FairValueGap);

      assert.strictEqual(detector.getActiveFVGs().length, 1, 'Internal array must not be mutated externally');
    });
  });
});