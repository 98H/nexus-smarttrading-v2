/**
 * ChartCanvas — Interactive Canvas Viewport Controller
 * Manages 2D transformation matrix, pan offsets, drag gesture lifecycles,
 * and coordinate re-rendering.
 */

export class ChartCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} [options={}]
   * @param {Function} [options.onRender]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options || {};
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;

    this.offsetX = 0;
    this.offsetY = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.isPanning = false;

    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartOffsetX = 0;
    this.dragStartOffsetY = 0;

    this._onMouseDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this.isPanning = true;
      this.dragStartX = e.clientX ?? 0;
      this.dragStartY = e.clientY ?? 0;
      this.dragStartOffsetX = this.offsetX;
      this.dragStartOffsetY = this.offsetY;
    };

    this._onMouseMove = (e) => {
      if (!this.isPanning) return;
      const dx = (e.clientX ?? 0) - this.dragStartX;
      const dy = (e.clientY ?? 0) - this.dragStartY;
      this.offsetX = this.dragStartOffsetX + dx;
      this.offsetY = this.dragStartOffsetY + dy;
      this.render();
    };

    this._onMouseUp = () => {
      this.isPanning = false;
    };

    this._onMouseLeave = () => {
      this.isPanning = false;
    };

    if (this.canvas && typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('mousedown', this._onMouseDown);
      this.canvas.addEventListener('mousemove', this._onMouseMove);
      this.canvas.addEventListener('mouseup', this._onMouseUp);
      this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    }

    this.render();
  }

  /**
   * Retrieves current viewport offset and scaling values.
   *
   * @returns {{offsetX: number, offsetY: number, scaleX: number, scaleY: number}}
   */
  getViewport() {
    return {
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
    };
  }

  /**
   * Computes affine transformation matrix: [a, b, c, d, tx, ty].
   *
   * @returns {[number, number, number, number, number, number]}
   */
  getViewportMatrix() {
    return [this.scaleX, 0, 0, this.scaleY, this.offsetX, this.offsetY];
  }

  /**
   * Resets or updates viewport parameters explicitly.
   *
   * @param {number} [offsetX=0]
   * @param {number} [offsetY=0]
   * @param {number} [scaleX=1]
   * @param {number} [scaleY=1]
   */
  setViewport(offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1) {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.scaleX = scaleX;
    this.scaleY = scaleY;
    this.render();
  }

  /**
   * Applies the viewport transform and invokes rendering lifecycle hooks.
   */
  render() {
    if (this.ctx) {
      if (typeof this.ctx.clearRect === 'function') {
        const w = (this.canvas && this.canvas.width) || 800;
        const h = (this.canvas && this.canvas.height) || 600;
        this.ctx.clearRect(0, 0, w, h);
      }
      if (typeof this.ctx.setTransform === 'function') {
        this.ctx.setTransform(this.scaleX, 0, 0, this.scaleY, this.offsetX, this.offsetY);
      }
    }

    if (this.innerChart && typeof this.innerChart.render === 'function') {
      try {
        this.innerChart.render();
      } catch (_) {}
    }

    if (typeof this.options?.onRender === 'function') {
      this.options.onRender(this);
    }
  }

  /**
   * Cleans up bound gesture listeners.
   */
  destroy() {
    if (this.canvas && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
      this.canvas.removeEventListener('mousemove', this._onMouseMove);
      this.canvas.removeEventListener('mouseup', this._onMouseUp);
      this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    }
  }
}

export default ChartCanvas;