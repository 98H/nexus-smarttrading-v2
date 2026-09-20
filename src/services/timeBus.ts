export interface TimeCursorEvent {
  timestamp: number | null;
  sourcePaneId: string;
}

export type TimeCursorListener = (event: TimeCursorEvent) => void;

export class TimeBus {
  private syncEnabled: boolean = true;
  private currentTimestamp: number | null = null;
  private listeners: Set<TimeCursorListener> = new Set();

  public isSyncEnabled(): boolean {
    return this.syncEnabled;
  }

  public setSyncEnabled(enabled: boolean): void {
    this.syncEnabled = enabled;
    if (!enabled) {
      this.currentTimestamp = null;
    }
  }

  public getCurrentTimestamp(): number | null {
    return this.currentTimestamp;
  }

  public subscribe(listener: TimeCursorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public publish(event: TimeCursorEvent): void {
    if (!this.syncEnabled) {
      return;
    }

    this.currentTimestamp = event.timestamp;
    const activeListeners = Array.from(this.listeners);

    for (const listener of activeListeners) {
      try {
        listener(event);
      } catch {
        // Resilient against individual subscriber failures
      }
    }
  }
}