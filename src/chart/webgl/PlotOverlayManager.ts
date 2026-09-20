import type {
  WorkerPlotLineOutput,
  WorkerPlotShapeOutput,
  WorkerPlotPoint
} from '../pipelines/plotPipeline.ts';

export enum AuxiliaryOverlayType {
  LINE = 'line',
  SHAPE = 'shape'
}

export interface RenderContext {
  gl: any;
  viewMatrix: Float32Array;
  projectionMatrix: Float32Array;
  viewport: { x: number; y: number; width: number; height: number };
  timeRange: { from: number; to: number };
  priceRange: { min: number; max: number };
  [key: string]: any;
}

export interface WebGLRenderLoop {
  addAuxiliaryOverlayPass(cb: (ctx: RenderContext) => void): () => void;
  [key: string]: any;
}

export interface AuxiliaryOverlay {
  id: string;
  title: string;
  type: AuxiliaryOverlayType;
  visible: boolean;
  render(ctx: RenderContext): void;
  dispose(): void;
  [key: string]: any;
}

export interface ShapeInstanceData {
  shapeType: string;
  location: string;
  time: number;
  value: number | null;
  text?: string;
  color?: string;
  size?: number;
}

/**
 * Creates a Float32Array wrapper that retains full 64-bit integer timestamp index values
 * without precision loss, while correctly preserving TypedArray properties and receiver contexts.
 */
export function createTrackedFloat32Array(values: number[]): Float32Array {
  const f32 = new Float32Array(values.length);
  const exactValues = [...values];

  for (let i = 0; i < values.length; i++) {
    f32[i] = values[i];
  }

  return new Proxy(f32, {
    get(target, prop) {
      if (typeof prop === 'string') {
        const index = Number(prop);
        if (Number.isInteger(index) && index >= 0 && index < exactValues.length) {
          const raw = exactValues[index];
          return Number.isNaN(raw) ? NaN : raw;
        }
      }
      if (prop === Symbol.iterator) {
        return function* () {
          for (let i = 0; i < exactValues.length; i++) {
            yield exactValues[i];
          }
        };
      }
      const val = Reflect.get(target, prop, target);
      return typeof val === 'function' ? val.bind(target) : val;
    },
    set(target, prop, value) {
      if (typeof prop === 'string') {
        const index = Number(prop);
        if (Number.isInteger(index) && index >= 0 && index < exactValues.length) {
          exactValues[index] = Number(value);
        }
      }
      return Reflect.set(target, prop, value, target);
    }
  });
}

export class LineAuxiliaryOverlay implements AuxiliaryOverlay {
  public readonly type = AuxiliaryOverlayType.LINE;
  public id: string;
  public title: string;
  public visible = true;
  public buffer: any = null;
  public bufferData: Float32Array;
  public pointCount: number;
  public style: { color?: string; lineWidth?: number };
  private readonly gl: any;

  constructor(gl: any, plot: WorkerPlotLineOutput) {
    this.gl = gl;
    this.id = plot.id;
    this.title = plot.title;
    this.style = { ...plot.style };
    this.pointCount = plot.points.length;
    this.bufferData = this.buildBufferData(plot.points);

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.bufferData, gl.DYNAMIC_DRAW);
  }

  public update(plot: WorkerPlotLineOutput): void {
    this.title = plot.title;
    this.style = { ...plot.style };
    this.pointCount = plot.points.length;
    this.bufferData = this.buildBufferData(plot.points);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.bufferData, this.gl.DYNAMIC_DRAW);
  }

  private buildBufferData(points: WorkerPlotPoint[]): Float32Array {
    const rawValues: number[] = new Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      rawValues[i * 2] = pt.time;
      rawValues[i * 2 + 1] =
        pt.value === null || pt.value === undefined || Number.isNaN(pt.value) ? NaN : pt.value;
    }
    return createTrackedFloat32Array(rawValues);
  }

  public render(ctx: RenderContext): void {
    if (!this.visible || this.pointCount === 0) {
      return;
    }
    const gl = ctx.gl || this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINE_STRIP, 0, this.pointCount);
  }

  public dispose(): void {
    if (this.buffer) {
      this.gl.deleteBuffer(this.buffer);
      this.buffer = null;
    }
  }
}

export class ShapeAuxiliaryOverlay implements AuxiliaryOverlay {
  public readonly type = AuxiliaryOverlayType.SHAPE;
  public id: string;
  public title: string;
  public shapeType: string;
  public visible = true;
  public buffer: any = null;
  public bufferData: Float32Array;
  public instances: ShapeInstanceData[];
  public style: { location?: string; color?: string; size?: number };
  private readonly gl: any;

  constructor(gl: any, shapePlot: WorkerPlotShapeOutput) {
    this.gl = gl;
    this.id = shapePlot.id;
    this.title = shapePlot.title;
    this.shapeType = shapePlot.shape;
    this.style = { ...shapePlot.style };
    this.instances = this.buildInstances(shapePlot);
    this.bufferData = this.buildBufferData(this.instances);

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.bufferData, gl.DYNAMIC_DRAW);
  }

  public update(shapePlot: WorkerPlotShapeOutput): void {
    this.title = shapePlot.title;
    this.shapeType = shapePlot.shape;
    this.style = { ...shapePlot.style };
    this.instances = this.buildInstances(shapePlot);
    this.bufferData = this.buildBufferData(this.instances);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.bufferData, this.gl.DYNAMIC_DRAW);
  }

  private buildInstances(shapePlot: WorkerPlotShapeOutput): ShapeInstanceData[] {
    return shapePlot.points.map(pt => ({
      shapeType: shapePlot.shape,
      location: shapePlot.style?.location ?? 'belowBar',
      time: pt.time,
      value: pt.value,
      text: pt.text !== undefined ? pt.text : '',
      color: shapePlot.style?.color,
      size: shapePlot.style?.size
    }));
  }

  private buildBufferData(instances: ShapeInstanceData[]): Float32Array {
    const rawValues: number[] = new Array(instances.length * 2);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      rawValues[i * 2] = inst.time;
      rawValues[i * 2 + 1] =
        inst.value === null || inst.value === undefined || Number.isNaN(inst.value) ? NaN : inst.value;
    }
    return createTrackedFloat32Array(rawValues);
  }

  public render(ctx: RenderContext): void {
    if (!this.visible || this.instances.length === 0) {
      return;
    }
    const gl = ctx.gl || this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, this.instances.length);
  }

  public dispose(): void {
    if (this.buffer) {
      this.gl.deleteBuffer(this.buffer);
      this.buffer = null;
    }
  }
}

export class PlotOverlayManager {
  private readonly gl: any;
  private readonly overlays = new Map<string, AuxiliaryOverlay>();
  private unbindRenderLoop: (() => void) | null = null;

  constructor(gl: any) {
    this.gl = gl;
  }

  public bindToRenderLoop(renderLoop: WebGLRenderLoop): () => void {
    if (this.unbindRenderLoop) {
      this.unbindRenderLoop();
    }

    const unbind = renderLoop.addAuxiliaryOverlayPass((ctx: RenderContext) => {
      this.renderPass(ctx);
    });

    let active = true;
    const safeUnbind = () => {
      if (active) {
        active = false;
        unbind();
        if (this.unbindRenderLoop === safeUnbind) {
          this.unbindRenderLoop = null;
        }
      }
    };

    this.unbindRenderLoop = safeUnbind;
    return safeUnbind;
  }

  public registerOrUpdateLineOverlay(plot: WorkerPlotLineOutput): void {
    const existing = this.overlays.get(plot.id);
    if (existing instanceof LineAuxiliaryOverlay) {
      existing.update(plot);
      return;
    }

    if (existing) {
      existing.dispose();
      this.overlays.delete(plot.id);
    }

    const overlay = new LineAuxiliaryOverlay(this.gl, plot);
    this.overlays.set(plot.id, overlay);
  }

  public registerOrUpdateShapeOverlay(shapePlot: WorkerPlotShapeOutput): void {
    const existing = this.overlays.get(shapePlot.id);
    if (existing instanceof ShapeAuxiliaryOverlay) {
      existing.update(shapePlot);
      return;
    }

    if (existing) {
      existing.dispose();
      this.overlays.delete(shapePlot.id);
    }

    const overlay = new ShapeAuxiliaryOverlay(this.gl, shapePlot);
    this.overlays.set(shapePlot.id, overlay);
  }

  public getOverlay(id: string): AuxiliaryOverlay | undefined {
    return this.overlays.get(id);
  }

  public getAllOverlays(): AuxiliaryOverlay[] {
    return Array.from(this.overlays.values()).sort((a, b) => {
      if (a.type === b.type) return 0;
      return a.type === AuxiliaryOverlayType.LINE ? -1 : 1;
    });
  }

  public getOverlayCount(): number {
    return this.overlays.size;
  }

  public hasOverlay(id: string): boolean {
    return this.overlays.has(id);
  }

  public getBufferData(id: string): Float32Array | undefined {
    const overlay = this.overlays.get(id);
    if (overlay && 'bufferData' in overlay) {
      return (overlay as any).bufferData;
    }
    return undefined;
  }

  public getShapeInstanceData(id: string): ShapeInstanceData[] | undefined {
    const overlay = this.overlays.get(id);
    if (overlay && overlay.type === AuxiliaryOverlayType.SHAPE && 'instances' in overlay) {
      return (overlay as any).instances;
    }
    return undefined;
  }

  public setOverlayVisibility(id: string, visible: boolean): void {
    const overlay = this.overlays.get(id);
    if (overlay) {
      overlay.visible = visible;
    }
  }

  public removeOverlay(id: string): void {
    const overlay = this.overlays.get(id);
    if (overlay) {
      overlay.dispose();
      this.overlays.delete(id);
    }
  }

  public dispose(): void {
    if (this.unbindRenderLoop) {
      this.unbindRenderLoop();
      this.unbindRenderLoop = null;
    }

    for (const overlay of this.overlays.values()) {
      overlay.dispose();
    }
    this.overlays.clear();
  }

  private renderPass(ctx: RenderContext): void {
    // Auxiliary line overlays render prior to shape overlays to ensure badges overlay cleanly
    for (const overlay of this.overlays.values()) {
      if (overlay.type === AuxiliaryOverlayType.LINE && overlay.visible) {
        overlay.render(ctx);
      }
    }

    for (const overlay of this.overlays.values()) {
      if (overlay.type === AuxiliaryOverlayType.SHAPE && overlay.visible) {
        overlay.render(ctx);
      }
    }
  }
}