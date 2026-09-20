/**
 * ChartCanvas — Interactive Canvas Viewport Controller
 * Manages 2D transformation matrix, pan offsets, drag gesture lifecycles,
 * continuous animation rendering loop, and coordinate re-rendering.
 */

export class ChartCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} [options={}]
   * @param {Function} [options.onRender]
   * @param {boolean} [options.autoAnimate=true]
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

    this._animating = false;
    this._rafId = null;

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

    if (this.options.autoAnimate !== false) {
      this.startAnimationLoop();
    }
  }

  /**
   * Initiates the continuous requestAnimationFrame rendering loop.
   */
  startAnimationLoop() {
    if (this._animating) return;
    this._animating = true;

    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame : null);

    if (!raf) return;

    const loop = (timestamp) => {
      if (!this._animating) return;
      this.render(timestamp);
      this._rafId = raf(loop);
    };

    this._rafId = raf(loop);
  }

  /**
   * Halts the continuous requestAnimationFrame rendering loop.
   */
  stopAnimationLoop() {
    this._animating = false;
    if (this._rafId !== null) {
      const caf = typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame
        : (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame : null);
      if (caf) {
        caf(this._rafId);
      }
      this._rafId = null;
    }
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
   * Renders dynamic real-time market tick and price indicators on canvas.
   *
   * @param {number} timestamp
   * @private
   */
  _renderDynamicTick(timestamp) {
    if (!this.ctx) return;
    const w = (this.canvas && this.canvas.width) || 800;
    const h = (this.canvas && this.canvas.height) || 600;
    const t = typeof timestamp === 'number' ? timestamp : 0;
    const tickY = (h / 2) + Math.sin(t / 200) * 20;

    if (typeof this.ctx.beginPath === 'function') {
      this.ctx.beginPath();
    }
    this.ctx.strokeStyle = '#2962ff';
    this.ctx.lineWidth = 1;
    if (typeof this.ctx.moveTo === 'function') {
      this.ctx.moveTo(0, tickY);
    }
    if (typeof this.ctx.lineTo === 'function') {
      this.ctx.lineTo(w, tickY);
    }
    if (typeof this.ctx.stroke === 'function') {
      this.ctx.stroke();
    }

    this.ctx.fillStyle = '#2962ff';
    if (typeof this.ctx.fillRect === 'function') {
      this.ctx.fillRect(w - 65, tickY - 10, 60, 20);
    }
    this.ctx.fillStyle = '#ffffff';
    if (typeof this.ctx.fillText === 'function') {
      this.ctx.fillText(tickY.toFixed(1), w - 60, tickY + 4);
    }
  }

  /**
   * Applies the viewport transform and invokes rendering lifecycle hooks.
   *
   * @param {number} [timestamp]
   */
  render(timestamp) {
    const time = timestamp ?? (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

    if (this.ctx) {
      const w = (this.canvas && this.canvas.width) || 800;
      const h = (this.canvas && this.canvas.height) || 600;
      if (typeof this.ctx.clearRect === 'function') {
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

    if (this.ctx) {
      this._renderDynamicTick(time);
    }

    if (typeof this.options?.onRender === 'function') {
      try {
        this.options.onRender(this, time);
      } catch (_) {}
    }
  }

  /**
   * Cleans up bound gesture listeners and halts active animation frames.
   */
  destroy() {
    this.stopAnimationLoop();
    if (this.canvas && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
      this.canvas.removeEventListener('mousemove', this._onMouseMove);
      this.canvas.removeEventListener('mouseup', this._onMouseUp);
      this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    }
  }
}

export default ChartCanvas;