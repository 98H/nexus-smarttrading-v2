/**
 * ZoomController module for managing viewport zoom scale, clamping, and sensitivity.
 */

export interface ZoomControllerOptions {
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  sensitivity?: number;
}

export class ZoomController {
  public minScale: number;
  public maxScale: number;
  public sensitivity: number;
  public currentScale: number;

  constructor(options: ZoomControllerOptions = {}) {
    this.minScale = options.minScale !== undefined ? Number(options.minScale) : 0.2;
    this.maxScale = options.maxScale !== undefined ? Number(options.maxScale) : 5.0;
    this.sensitivity = options.sensitivity !== undefined ? Number(options.sensitivity) : 0.001;
    const initial = options.initialScale !== undefined ? Number(options.initialScale) : 1.0;
    this.currentScale = Math.max(this.minScale, Math.min(this.maxScale, initial));
  }

  /**
   * Apply wheel scroll delta to update current zoom scale.
   * Negative deltaY increases zoom scale (zoom in).
   * Positive deltaY decreases zoom scale (zoom out).
   * Clamps zoom scale to [minScale, maxScale].
   */
  public applyDelta(deltaY: number): number {
    if (typeof deltaY !== 'number' || typeof deltaY === 'boolean') {
      throw new TypeError('deltaY must be a numeric value');
    }
    if (Number.isNaN(deltaY)) {
      throw new RangeError('deltaY cannot be NaN');
    }

    const newScale = this.currentScale - deltaY * this.sensitivity;
    this.currentScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    return this.currentScale;
  }
}