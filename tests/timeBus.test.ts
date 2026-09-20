// tests/crosshairSync.test.ts

import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  TimeBus,
  type TimeCursorEvent,
  type TimeCursorListener,
} from '../src/services/timeBus.ts';
import {
  useCrosshairSync,
  type UseCrosshairSyncProps,
  type UseCrosshairSyncResult,
} from '../src/hooks/useCrosshairSync.ts';
import {
  ChartPane,
  type ChartPaneProps,
} from '../src/components/ChartPane.tsx';

describe('Story 5.1.2: Synchronized Cross-Pane Cursor & Time Bus', () => {
  /* -------------------------------------------------------------------------- */
  /* Unit Tests: TimeBus Service                                                */
  /* -------------------------------------------------------------------------- */
  describe('TimeBus Service (src/services/timeBus.ts)', () => {
    let bus: TimeBus;

    beforeEach(() => {
      bus = new TimeBus();
    });

    it('should initialize with sync enabled by default and null timestamp', () => {
      assert.strictEqual(bus.isSyncEnabled(), true);
      assert.strictEqual(bus.getCurrentTimestamp(), null);
    });

    it('AC1: should broadcast identical timestamp to all subscribers across panes when sync is enabled', () => {
      const receivedEventsPaneB: TimeCursorEvent[] = [];
      const receivedEventsPaneC: TimeCursorEvent[] = [];

      const unsubB = bus.subscribe((event) => receivedEventsPaneB.push(event));
      const unsubC = bus.subscribe((event) => receivedEventsPaneC.push(event));

      const targetTimestamp = 1711929600000;
      bus.publish({ timestamp: targetTimestamp, sourcePaneId: 'pane-A' });

      assert.strictEqual(receivedEventsPaneB.length, 1);
      assert.strictEqual(receivedEventsPaneC.length, 1);

      assert.strictEqual(receivedEventsPaneB[0].timestamp, targetTimestamp);
      assert.strictEqual(receivedEventsPaneB[0].sourcePaneId, 'pane-A');

      assert.strictEqual(receivedEventsPaneC[0].timestamp, targetTimestamp);
      assert.strictEqual(receivedEventsPaneC[0].sourcePaneId, 'pane-A');

      assert.strictEqual(bus.getCurrentTimestamp(), targetTimestamp);

      unsubB();
      unsubC();
    });

    it('AC2: should not notify subscribers when sync is disabled on the bus', () => {
      const receivedEvents: TimeCursorEvent[] = [];
      const unsub = bus.subscribe((event) => receivedEvents.push(event));

      bus.setSyncEnabled(false);
      assert.strictEqual(bus.isSyncEnabled(), false);

      bus.publish({ timestamp: 1711929600000, sourcePaneId: 'pane-A' });

      assert.strictEqual(receivedEvents.length, 0);
      assert.strictEqual(bus.getCurrentTimestamp(), null);

      unsub();
    });

    it('should broadcast null timestamp when cursor exits a pane', () => {
      const receivedEvents: TimeCursorEvent[] = [];
      const unsub = bus.subscribe((event) => receivedEvents.push(event));

      bus.publish({ timestamp: 1711929600000, sourcePaneId: 'pane-A' });
      bus.publish({ timestamp: null, sourcePaneId: 'pane-A' });

      assert.strictEqual(receivedEvents.length, 2);
      assert.strictEqual(receivedEvents[1].timestamp, null);
      assert.strictEqual(receivedEvents[1].sourcePaneId, 'pane-A');
      assert.strictEqual(bus.getCurrentTimestamp(), null);

      unsub();
    });

    it('should properly unsubscribe listeners to avoid memory leaks', () => {
      let callCount = 0;
      const unsub = bus.subscribe(() => {
        callCount += 1;
      });

      bus.publish({ timestamp: 1000, sourcePaneId: 'pane-A' });
      assert.strictEqual(callCount, 1);

      unsub();

      bus.publish({ timestamp: 2000, sourcePaneId: 'pane-A' });
      assert.strictEqual(callCount, 1);
    });

    it('should remain resilient if an individual subscriber throws an error', () => {
      let survivingSubscriberReceived = false;

      bus.subscribe(() => {
        throw new Error('Subscriber failure');
      });

      bus.subscribe(() => {
        survivingSubscriberReceived = true;
      });

      assert.doesNotThrow(() => {
        bus.publish({ timestamp: 1711929600000, sourcePaneId: 'pane-A' });
      });

      assert.strictEqual(survivingSubscriberReceived, true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Unit Tests: useCrosshairSync Hook                                          */
  /* -------------------------------------------------------------------------- */
  describe('useCrosshairSync Hook (src/hooks/useCrosshairSync.ts)', () => {
    let bus: TimeBus;

    beforeEach(() => {
      bus = new TimeBus();
    });

    // Test harness component to execute React hooks in Node.js
    function HookHarness(props: {
      hookProps: UseCrosshairSyncProps;
      onRender: (result: UseCrosshairSyncResult) => void;
    }) {
      const result = useCrosshairSync(props.hookProps);
      props.onRender(result);
      return null;
    }

    it('AC1: should subscribe to TimeBus and reflect incoming synced timestamp', () => {
      let hookOutput: UseCrosshairSyncResult | undefined;
      const targetTimestamp = 1711929600000;

      // Broadcast event prior to snapshot
      bus.publish({ timestamp: targetTimestamp, sourcePaneId: 'pane-A' });

      renderToStaticMarkup(
        React.createElement(HookHarness, {
          hookProps: { paneId: 'pane-B', syncEnabled: true, timeBus: bus },
          onRender: (result) => {
            hookOutput = result;
          },
        })
      );

      assert.ok(hookOutput);
      assert.strictEqual(hookOutput.syncedTimestamp, targetTimestamp);
      assert.strictEqual(hookOutput.isSyncEnabled, true);
    });

    it('AC1: should dispatch cursor movement to TimeBus when updateCursor is invoked', () => {
      let hookOutput: UseCrosshairSyncResult | undefined;

      renderToStaticMarkup(
        React.createElement(HookHarness, {
          hookProps: { paneId: 'pane-A', syncEnabled: true, timeBus: bus },
          onRender: (result) => {
            hookOutput = result;
          },
        })
      );

      assert.ok(hookOutput);
      const newTimestamp = 1711929650000;
      hookOutput.updateCursor(newTimestamp);

      assert.strictEqual(bus.getCurrentTimestamp(), newTimestamp);
    });

    it('AC2: should ignore TimeBus broadcasts when hook syncEnabled is false', () => {
      let hookOutput: UseCrosshairSyncResult | undefined;

      bus.publish({ timestamp: 1711929600000, sourcePaneId: 'pane-A' });

      renderToStaticMarkup(
        React.createElement(HookHarness, {
          hookProps: { paneId: 'pane-B', syncEnabled: false, timeBus: bus },
          onRender: (result) => {
            hookOutput = result;
          },
        })
      );

      assert.ok(hookOutput);
      assert.strictEqual(hookOutput.syncedTimestamp, null);
      assert.strictEqual(hookOutput.isSyncEnabled, false);
    });

    it('AC2: should not publish cursor updates to TimeBus when syncEnabled is false', () => {
      let hookOutput: UseCrosshairSyncResult | undefined;

      renderToStaticMarkup(
        React.createElement(HookHarness, {
          hookProps: { paneId: 'pane-A', syncEnabled: false, timeBus: bus },
          onRender: (result) => {
            hookOutput = result;
          },
        })
      );

      assert.ok(hookOutput);
      hookOutput.updateCursor(1711929600000);

      assert.strictEqual(bus.getCurrentTimestamp(), null);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Unit & Integration Tests: ChartPane Component                              */
  /* -------------------------------------------------------------------------- */
  describe('ChartPane Component (src/components/ChartPane.tsx)', () => {
    let bus: TimeBus;

    beforeEach(() => {
      bus = new TimeBus();
    });

    it('AC1: renders synced crosshair lines at identical timestamp across all visible panes when sync enabled', () => {
      const activeTimestamp = 1711929600000;

      // Cursor moves in Pane A
      bus.publish({ timestamp: activeTimestamp, sourcePaneId: 'pane-A' });

      const paneAOutput = renderToStaticMarkup(
        React.createElement(ChartPane, {
          id: 'pane-A',
          syncEnabled: true,
          visible: true,
          timeBus: bus,
        })
      );

      const paneBOutput = renderToStaticMarkup(
        React.createElement(ChartPane, {
          id: 'pane-B',
          syncEnabled: true,
          visible: true,
          timeBus: bus,
        })
      );

      const paneCOutput = renderToStaticMarkup(
        React.createElement(ChartPane, {
          id: 'pane-C',
          syncEnabled: true,
          visible: true,
          timeBus: bus,
        })
      );

      // Verify crosshair presence and identical timestamp in Pane A
      assert.match(
        paneAOutput,
        /data-testid="crosshair-line-pane-A"/,
        'Pane A must render crosshair line'
      );
      assert.match(
        paneAOutput,
        new RegExp(`data-timestamp="${activeTimestamp}"`),
        'Pane A crosshair must match identical cursor timestamp'
      );

      // Verify crosshair presence and identical timestamp in Pane B
      assert.match(
        paneBOutput,
        /data-testid="crosshair-line-pane-B"/,
        'Pane B must render synced crosshair line'
      );
      assert.match(
        paneBOutput,
        new RegExp(`data-timestamp="${activeTimestamp}"`),
        'Pane B crosshair must match identical timestamp'
      );

      // Verify crosshair presence and identical timestamp in Pane C
      assert.match(
        paneCOutput,
        /data-testid="crosshair-line-pane-C"/,
        'Pane C must render synced crosshair line'
      );
      assert.match(
        paneCOutput,
        new RegExp(`data-timestamp="${activeTimestamp}"`),
        'Pane C crosshair must match identical timestamp'
      );
    });

    it('AC2: crosshairs in other panes remain unaffected when crosshair sync is disabled', () => {
      const activeTimestamp = 1711929600000;

      // Cursor moves in Pane A
      bus.publish({ timestamp: activeTimestamp, sourcePaneId: 'pane-A' });

      // Pane B has crosshair sync explicitly disabled
      const paneBOutput = renderToStaticMarkup(
        React.createElement(ChartPane, {
          id: 'pane-B',
          syncEnabled: false,
          visible: true,
          timeBus: bus,
        })
      );

      // Pane B must not render a synced crosshair line
      assert.doesNotMatch(
        paneBOutput,
        /data-testid="crosshair-line-pane-B"/,
        'Pane B must NOT render crosshair line when sync is disabled'
      );
      assert.doesNotMatch(
        paneBOutput,
        new RegExp(`data-timestamp="${activeTimestamp}"`),
        'Pane B must remain unaffected by other panes cursor events'
      );
    });

    it('should NOT render crosshair lines on hidden/invisible panes even if sync is enabled', () => {
      const activeTimestamp = 1711929600000;
      bus.publish({ timestamp: activeTimestamp, sourcePaneId: 'pane-A' });

      // Pane Hidden is not visible
      const hiddenPaneOutput = renderToStaticMarkup(
        React.createElement(ChartPane, {
          id: 'pane-hidden',
          syncEnabled: true,
          visible: false,
          timeBus: bus,
        })
      );

      assert.doesNotMatch(
        hiddenPaneOutput,
        /data-testid="crosshair-line-pane-hidden"/,
        'Invisible pane must not render active crosshairs'
      );
    });

    it('should clear crosshair lines across all synced panes when cursor exits (timestamp is null)', () => {
      // First, set active timestamp
      bus.publish({ timestamp: 1711929600000, sourcePaneId: 'pane-A' });
      // Then cursor leaves
      bus.publish({ timestamp: null, sourcePaneId: 'pane-A' });

      const paneAOutput = renderToStaticMarkup(
        React.createElement(ChartPane, {
          id: 'pane-A',
          syncEnabled: true,
          visible: true,
          timeBus: bus,
        })
      );

      const paneBOutput = renderToStaticMarkup(
        React.createElement(ChartPane, {
          id: 'pane-B',
          syncEnabled: true,
          visible: true,
          timeBus: bus,
        })
      );

      assert.doesNotMatch(
        paneAOutput,
        /data-testid="crosshair-line-pane-A"/,
        'Pane A must remove crosshair when cursor leaves'
      );
      assert.doesNotMatch(
        paneBOutput,
        /data-testid="crosshair-line-pane-B"/,
        'Pane B must remove crosshair when cursor leaves'
      );
    });
  });
});