import type { PlotOverlayManager } from '../webgl/PlotOverlayManager.ts';

export interface WorkerPlotPoint {
  time: number;
  value: number | null;
}

export interface WorkerPlotLineOutput {
  id: string;
  title: string;
  type: string;
  style?: {
    color?: string;
    lineWidth?: number;
    [key: string]: any;
  };
  points: WorkerPlotPoint[];
  [key: string]: any;
}

export interface WorkerPlotShapePoint {
  time: number;
  value: number | null;
  text?: string;
  [key: string]: any;
}

export interface WorkerPlotShapeOutput {
  id: string;
  title: string;
  shape: string;
  style?: {
    location?: string;
    color?: string;
    size?: number;
    [key: string]: any;
  };
  points: WorkerPlotShapePoint[];
  [key: string]: any;
}

export interface WorkerScriptResult {
  scriptId: string;
  executionTimeMs?: number;
  plots: WorkerPlotLineOutput[];
  plotShapes: WorkerPlotShapeOutput[];
  [key: string]: any;
}

export interface PlotPipelineOptions {
  overlayManager: PlotOverlayManager;
}

export class PlotPipeline {
  private readonly overlayManager: PlotOverlayManager;
  private readonly scriptOverlays = new Map<string, Set<string>>();

  constructor(options: PlotPipelineOptions) {
    this.overlayManager = options.overlayManager;
  }

  public consumeWorkerResults(result: WorkerScriptResult): void {
    if (!this.isValidPayload(result)) {
      return;
    }

    const { scriptId, plots, plotShapes } = result;
    const previousOverlayIds = this.scriptOverlays.get(scriptId) ?? new Set<string>();
    const currentOverlayIds = new Set<string>();

    for (const plot of plots) {
      currentOverlayIds.add(plot.id);
      this.overlayManager.registerOrUpdateLineOverlay(plot);
    }

    for (const shapePlot of plotShapes) {
      currentOverlayIds.add(shapePlot.id);
      this.overlayManager.registerOrUpdateShapeOverlay(shapePlot);
    }

    for (const previousId of previousOverlayIds) {
      if (!currentOverlayIds.has(previousId)) {
        this.overlayManager.removeOverlay(previousId);
      }
    }

    this.scriptOverlays.set(scriptId, currentOverlayIds);
  }

  public clear(): void {
    this.scriptOverlays.clear();
  }

  private isValidPayload(result: unknown): result is WorkerScriptResult {
    if (!result || typeof result !== 'object') {
      return false;
    }

    const candidate = result as Partial<WorkerScriptResult>;
    if (typeof candidate.scriptId !== 'string' || candidate.scriptId.trim() === '') {
      return false;
    }

    if (!Array.isArray(candidate.plots) || !Array.isArray(candidate.plotShapes)) {
      return false;
    }

    for (const plot of candidate.plots) {
      if (!plot || typeof plot !== 'object') {
        return false;
      }
      if (typeof plot.id !== 'string' || plot.id.trim() === '') {
        return false;
      }
      if (!Array.isArray(plot.points)) {
        return false;
      }
    }

    for (const shape of candidate.plotShapes) {
      if (!shape || typeof shape !== 'object') {
        return false;
      }
      if (typeof shape.id !== 'string' || shape.id.trim() === '') {
        return false;
      }
      if (!Array.isArray(shape.points)) {
        return false;
      }
    }

    return true;
  }
}