/**
 * ChartCanvas — Interactive Canvas Viewport & Tool Controller
 * Manages 2D transformation matrix, pan gestures, tool drawing lifecycle
 * (crosshair, trendline, horizontal-level, measurement), animation loops,
 * and annotation state.
 */

/**
 * Normalizes tool mode identifier to lowercase kebab-case.
 *
 * @param {string} toolName
 * @returns {string}
 */
export function normalizeToolName(toolName) {
  if (!toolName) return '';
  return String(toolName).toLowerCase().replace(/[\s_]+/g, '-');
}

export class ChartCanvas {
  /**
   * @param {HTMLCanvasElement|HTMLElement} canvasOrContainer
   * @param {Object} [options={}]
   * @param {Function} [options.onRender]
   * @param {boolean} [options.autoAnimate=true]
   * @param {string} [options.toolMode='crosshair']
   */
  constructor(canvasOrContainer, options = {}) {
    let canvas = canvasOrContainer;
    let container = null;

    if (canvasOrContainer && canvasOrContainer.tagName !== 'CANVAS') {
      container = canvasOrContainer;
      canvas = container.querySelector ? container.querySelector('canvas') : null;
      if (!canvas && typeof container.appendChild === 'function') {
        const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
        if (doc && typeof doc.createElement === 'function') {
          canvas = doc.createElement('canvas');
          canvas.className = 'chart-canvas';
          canvas.width = (options && options.width) || 800;
          canvas.height = (options && options.height) || 600;
          container.appendChild(canvas);
        }
      }
    }

    this.container = container;
    this.canvas = canvas || canvasOrContainer;
    this.options = options || {};
    this.ctx = this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;

    this.offsetX = 0;
    this.offsetY = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.isPanning = false;

    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartOffsetX = 0;
    this.dragStartOffsetY = 0;

    this.toolMode = (options && (options.toolMode || options.mode)) || 'crosshair';
    this.activeMode = this.toolMode;
    this.annotations = [];
    this.currentDrawing = null;
    this._isDrawing = false;
    this.crosshair = { x: 0, y: 0, visible: false };

    this._animating = false;
    this._rafId = null;

    this._onMouseDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const clientX = e.clientX ?? 0;
      const clientY = e.clientY ?? 0;
      const mode = normalizeToolName(this.toolMode);

      if (mode === 'trendline') {
        this._isDrawing = true;
        this.currentDrawing = {
          type: 'trendline',
          startX: clientX,
          startY: clientY,
          endX: clientX,
          endY: clientY,
        };
      } else if (mode === 'measurement') {
        this._isDrawing = true;
        this.currentDrawing = {
          type: 'measurement',
          startX: clientX,
          startY: clientY,
          endX: clientX,
          endY: clientY,
          deltaX: 0,
          deltaY: 0,
        };
      } else if (mode === 'horizontal-level') {
        this._isDrawing = true;
        this.currentDrawing = {
          type: 'horizontal-level',
          x: clientX,
          y: clientY,
          price: clientY,
        };
      } else {
        this.isPanning = true;
        this.dragStartX = clientX;
        this.dragStartY = clientY;
        this.dragStartOffsetX = this.offsetX;
        this.dragStartOffsetY = this.offsetY;
      }
    };

    this._onMouseMove = (e) => {
      const clientX = e.clientX ?? 0;
      const clientY = e.clientY ?? 0;
      const mode = normalizeToolName(this.toolMode);

      if (mode === 'crosshair') {
        this.crosshair = { x: clientX, y: clientY, visible: true };
      }

      if (this._isDrawing && this.currentDrawing) {
        this.currentDrawing.endX = clientX;
        this.currentDrawing.endY = clientY;
        if (this.currentDrawing.type === 'measurement') {
          this.currentDrawing.deltaX = clientX - this.currentDrawing.startX;
          this.currentDrawing.deltaY = clientY - this.currentDrawing.startY;
        }
        this.render();
        return;
      }

      if (this.isPanning) {
        const dx = clientX - this.dragStartX;
        const dy = clientY - this.dragStartY;
        this.offsetX = this.dragStartOffsetX + dx;
        this.offsetY = this.dragStartOffsetY + dy;
        this.render();
      }
    };

    this._onMouseUp = (e) => {
      const clientX = e.clientX ?? 0;
      const clientY = e.clientY ?? 0;

      if (this._isDrawing && this.currentDrawing) {
        if (this.currentDrawing.type === 'trendline') {
          this.currentDrawing.endX = clientX;
          this.currentDrawing.endY = clientY;
          this.annotations.push({ ...this.currentDrawing });
        } else if (this.currentDrawing.type === 'measurement') {
          this.currentDrawing.endX = clientX;
          this.currentDrawing.endY = clientY;
          this.currentDrawing.deltaX = clientX - this.currentDrawing.startX;
          this.currentDrawing.deltaY = clientY - this.currentDrawing.startY;
          this.annotations.push({ ...this.currentDrawing });
        } else if (this.currentDrawing.type === 'horizontal-level') {
          this.annotations.push({ ...this.currentDrawing });
        }
        this.currentDrawing = null;
        this._isDrawing = false;
        this.render();
      }

      this.isPanning = false;
    };

    this._onClick = (e) => {
      const clientX = e.clientX ?? 0;
      const clientY = e.clientY ?? 0;
      const mode = normalizeToolName(this.toolMode);

      if (mode === 'horizontal-level') {
        const level = {
          type: 'horizontal-level',
          x: clientX,
          y: clientY,
          price: clientY,
        };
        this.annotations.push(level);
        this.render();
      }
    };

    this._onMouseLeave = () => {
      this.isPanning = false;
      if (this._isDrawing && this.currentDrawing) {
        this.annotations.push({ ...this.currentDrawing });
        this.currentDrawing = null;
        this._isDrawing = false;
      }
      if (this.crosshair) {
        this.crosshair.visible = false;
      }
      this.render();
    };

    if (this.canvas && typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('mousedown', this._onMouseDown);
      this.canvas.addEventListener('mousemove', this._onMouseMove);
      this.canvas.addEventListener('mouseup', this._onMouseUp);
      this.canvas.addEventListener('mouseleave', this._onMouseLeave);
      this.canvas.addEventListener('click', this._onClick);
    }

    this.setToolMode(this.toolMode);

    if (this.options.autoAnimate !== false) {
      this.startAnimationLoop();
    }
  }

  /**
   * Sets active tool mode and updates canvas cursor / interaction behavior.
   *
   * @param {string} mode
   * @returns {ChartCanvas}
   */
  setToolMode(mode) {
    this.toolMode = mode;
    this.activeMode = mode;
    const normalized = normalizeToolName(mode);

    if (this.canvas && this.canvas.style) {
      if (
        normalized === 'crosshair' ||
        normalized === 'trendline' ||
        normalized === 'horizontal-level' ||
        normalized === 'measurement'
      ) {
        this.canvas.style.cursor = 'crosshair';
      } else {
        this.canvas.style.cursor = 'default';
      }
    }
    this.render();
    return this;
  }

  setMode(mode) {
    return this.setToolMode(mode);
  }

  getToolMode() {
    return this.toolMode;
  }

  getActiveMode() {
    return this.toolMode;
  }

  getCursor() {
    return (
      (this.canvas && this.canvas.style && this.canvas.style.cursor) ||
      (normalizeToolName(this.toolMode) === 'crosshair' ? 'crosshair' : 'default')
    );
  }

  getAnnotations() {
    return this.annotations;
  }

  addAnnotation(annotation) {
    if (annotation) {
      this.annotations.push(annotation);
      this.render();
    }
    return annotation;
  }

  clearAnnotations() {
    this.annotations = [];
    this.render();
  }

  startAnimationLoop() {
    if (this._animating) return;
    this._animating = true;

    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame
        : null;

    if (!raf) return;

    const loop = (timestamp) => {
      if (!this._animating) return;
      this.render(timestamp);
      this._rafId = raf(loop);
    };

    this._rafId = raf(loop);
  }

  stopAnimationLoop() {
    this._animating = false;
    if (this._rafId !== null) {
      const caf =
        typeof cancelAnimationFrame === 'function'
          ? cancelAnimationFrame
          : typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
          ? window.cancelAnimationFrame
          : null;
      if (caf) {
        caf(this._rafId);
      }
      this._rafId = null;
    }
  }

  getViewport() {
    return {
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
    };
  }

  getViewportMatrix() {
    return [this.scaleX, 0, 0, this.scaleY, this.offsetX, this.offsetY];
  }

  setViewport(offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1) {
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.scaleX = scaleX;
    this.scaleY = scaleY;
    this.render();
  }

  _renderDynamicTick(timestamp) {
    if (!this.ctx) return;
    const w = (this.canvas && this.canvas.width) || 800;
    const h = (this.canvas && this.canvas.height) || 600;
    const t = typeof timestamp === 'number' ? timestamp : 0;
    const tickY = h / 2 + Math.sin(t / 200) * 20;

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

  _renderToolOverlay() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = (this.canvas && this.canvas.width) || 800;
    const h = (this.canvas && this.canvas.height) || 600;

    if (this.crosshair && this.crosshair.visible && normalizeToolName(this.toolMode) === 'crosshair') {
      if (typeof ctx.save === 'function') ctx.save();
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 1;

      if (typeof ctx.beginPath === 'function') ctx.beginPath();
      if (typeof ctx.moveTo === 'function') ctx.moveTo(0, this.crosshair.y);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(w, this.crosshair.y);
      if (typeof ctx.stroke === 'function') ctx.stroke();

      if (typeof ctx.beginPath === 'function') ctx.beginPath();
      if (typeof ctx.moveTo === 'function') ctx.moveTo(this.crosshair.x, 0);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(this.crosshair.x, h);
      if (typeof ctx.stroke === 'function') ctx.stroke();

      if (typeof ctx.restore === 'function') ctx.restore();
    }

    const allAnnotations = [...this.annotations];
    if (this.currentDrawing) {
      allAnnotations.push(this.currentDrawing);
    }

    for (const ann of allAnnotations) {
      if (ann.type === 'trendline') {
        if (typeof ctx.save === 'function') ctx.save();
        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 2;
        if (typeof ctx.moveTo === 'function') ctx.moveTo(ann.startX, ann.startY);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(ann.endX, ann.endY);
        if (typeof ctx.stroke === 'function') ctx.stroke();
        if (typeof ctx.restore === 'function') ctx.restore();
      } else if (ann.type === 'horizontal-level') {
        if (typeof ctx.save === 'function') ctx.save();
        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        if (typeof ctx.moveTo === 'function') ctx.moveTo(0, ann.y);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(w, ann.y);
        if (typeof ctx.stroke === 'function') ctx.stroke();
        if (typeof ctx.restore === 'function') ctx.restore();
      } else if (ann.type === 'measurement') {
        if (typeof ctx.save === 'function') ctx.save();
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1;
        const left = Math.min(ann.startX, ann.endX);
        const top = Math.min(ann.startY, ann.endY);
        const width = Math.abs(ann.endX - ann.startX);
        const height = Math.abs(ann.endY - ann.startY);

        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.moveTo === 'function') ctx.moveTo(left, top);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(left + width, top);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(left + width, top + height);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(left, top + height);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(left, top);
        if (typeof ctx.stroke === 'function') ctx.stroke();

        const text = `ΔX: ${width.toFixed(0)}px, ΔY: ${height.toFixed(0)}px`;
        if (typeof ctx.fillText === 'function') {
          ctx.fillStyle = '#10b981';
          ctx.fillText(text, left + 4, top + 14);
        }
        if (typeof ctx.restore === 'function') ctx.restore();
      }
    }
  }

  render(timestamp) {
    const time =
      timestamp ?? (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

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
      this._renderToolOverlay();
    }

    if (typeof this.options?.onRender === 'function') {
      try {
        this.options.onRender(this, time);
      } catch (_) {}
    }
  }

  destroy() {
    this.stopAnimationLoop();
    if (this.canvas && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
      this.canvas.removeEventListener('mousemove', this._onMouseMove);
      this.canvas.removeEventListener('mouseup', this._onMouseUp);
      this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
      this.canvas.removeEventListener('click', this._onClick);
    }
  }
}

export const CanvasWorkspace = ChartCanvas;
export const CanvasController = ChartCanvas;
export const initCanvas = (container, options) => new ChartCanvas(container, options);
export const createCanvas = (container, options) => new ChartCanvas(container, options);

export default ChartCanvas;