import { useCallback, useSyncExternalStore } from 'react';
import type { TimeBus } from '../services/timeBus.ts';

export interface UseCrosshairSyncProps {
  paneId: string;
  syncEnabled?: boolean;
  visible?: boolean;
  timeBus: TimeBus;
}

export interface UseCrosshairSyncResult {
  syncedTimestamp: number | null;
  isSyncEnabled: boolean;
  updateCursor: (timestamp: number | null) => void;
  clearCursor: () => void;
}

export function useCrosshairSync({
  paneId,
  syncEnabled = true,
  visible = true,
  timeBus,
}: UseCrosshairSyncProps): UseCrosshairSyncResult {
  const isSyncEnabled = Boolean(syncEnabled && timeBus.isSyncEnabled());

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!isSyncEnabled) {
        return () => {};
      }
      return timeBus.subscribe(() => {
        onStoreChange();
      });
    },
    [timeBus, isSyncEnabled]
  );

  const getSnapshot = useCallback(() => {
    if (!isSyncEnabled || !visible) {
      return null;
    }
    return timeBus.getCurrentTimestamp();
  }, [timeBus, isSyncEnabled, visible]);

  const syncedTimestamp = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );

  const updateCursor = useCallback(
    (timestamp: number | null) => {
      if (!isSyncEnabled) {
        return;
      }
      timeBus.publish({
        timestamp,
        sourcePaneId: paneId,
      });
    },
    [isSyncEnabled, timeBus, paneId]
  );

  const clearCursor = useCallback(() => {
    updateCursor(null);
  }, [updateCursor]);

  return {
    syncedTimestamp,
    isSyncEnabled,
    updateCursor,
    clearCursor,
  };
}