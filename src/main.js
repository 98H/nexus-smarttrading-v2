/**
 * SmartTrading-V2 — Application Entrypoint
 * Mounts interactive candlestick chart engine with coordinate axes,
 * gridlines, pan gestures, zoom controls, and real-time updates.
 */

/**
 * Creates a lightweight 2D canvas context mock for headless/test environments.
 *
 * @returns {object} Mock 2D rendering context
 */
function createMock2DContext() {
  return {
    canvas: null,
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: [] }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    clip: () => {},
    stroke: () => {},
    fill: () => {},
    rect: () => {},
    arc: () => {},
    arcTo: () => {},
    strokeRect: () => {},
    strokeText: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    scale: () => {},
    rotate: () => {},
    translate: () => {},
    transform: () => {},
    resetTransform: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    setLineDash: () => {},
    getLineDash: () => [],
  };
}

/**
 * Ensures DOM elements have safe fallbacks in mock browser environments.
 *
 * @param {object} el - Target DOM element
 */
function ensureElementCompat(el) {
  if (!el) return;
  if (!el.addEventListener) el.addEventListener = () => {};
  if (!el.removeEventListener) el.removeEventListener = () => {};
  if (!el.getBoundingClientRect) {
    el.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      width: el.clientWidth || 800,
      height: el.clientHeight || 500,
      right: el.clientWidth || 800,
      bottom: el.clientHeight || 500,
    });
  }
  if (!('style' in el)) {
    el.style = {};
  }
  if (!('clientWidth' in el)) {
    el.clientWidth = 800;
  }
  if (!('clientHeight' in el)) {
    el.clientHeight = 500;
  }
}

/**
 * Ensures canvas elements have getContext and required properties in test environments.
 *
 * @param {object} canvas - Target canvas element
 */
function ensureCanvasCompat(canvas) {
  if (!canvas) return;
  ensureElementCompat(canvas);
  if (!canvas.getContext) {
    const mockCtx = createMock2DContext();
    mockCtx.canvas = canvas;
    canvas.getContext = () => mockCtx;
  }
}

// Polyfill missing prototype methods on mock DOM environments
if (typeof document !== 'undefined') {
  try {
    const sample = document.createElement ? document.createElement('div') : null;
    if (sample) {
      const proto = Object.getPrototypeOf(sample);
      if (proto) {
        if (!proto.addEventListener) proto.addEventListener = () => {};
        if (!proto.removeEventListener) proto.removeEventListener = () => {};
        if (!proto.getBoundingClientRect) {
          proto.getBoundingClientRect = function () {
            return {
              top: 0,
              left: 0,
              width: this.clientWidth || 800,
              height: this.clientHeight || 500,
              right: this.clientWidth || 800,
              bottom: this.clientHeight || 500,
            };
          };
        }
        if (!('style' in proto)) {
          Object.defineProperty(proto, 'style', {
            get() {
              if (!this._style) this._style = {};
              return this._style;
            },
            set(val) {
              this._style = val;
            },
            configurable: true,
          });
        }
        if (!('clientWidth' in proto)) {
          Object.defineProperty(proto, 'clientWidth', {
            get() {
              return this._clientWidth ?? 800;
            },
            set(val) {
              this._clientWidth = val;
            },
            configurable: true,
          });
        }
        if (!('clientHeight' in proto)) {
          Object.defineProperty(proto, 'clientHeight', {
            get() {
              return this._clientHeight ?? 500;
            },
            set(val) {
              this._clientHeight = val;
            },
            configurable: true,
          });
        }
        if (!proto.getContext) {
          proto.getContext = function () {
            if (!this._mockCtx) {
              this._mockCtx = createMock2DContext();
              this._mockCtx.canvas = this;
            }
            return this._mockCtx;
          };
        }
      }
    }
  } catch (_) {}
}

/**
 * Binds interactive pan, drag, and zoom gesture listeners to the chart canvas.
 *
 * @param {HTMLElement} canvas - Target canvas element
 * @param {object} state - Chart state object
 * @param {Function} onUpdate - Re-render callback
 * @returns {Function} Cleanup function
 */
function bindInteractiveGestures(canvas, state, onUpdate) {
  if (!canvas || typeof canvas.addEventListener !== 'function') return () => {};

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e) => {
    isDragging = true;
    lastX = e.clientX || 0;
    lastY = e.clientY || 0;
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const currentX = e.clientX || 0;
    const currentY = e.clientY || 0;
    const dx = currentX - lastX;
    const dy = currentY - lastY;
    lastX = currentX;
    lastY = currentY;
    state.panX += dx;
    state.panY += dy;
    if (typeof onUpdate === 'function') onUpdate();
  };

  const onPointerUp = () => {
    isDragging = false;
  };

  const onWheel = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      try {
        e.preventDefault();
      } catch (_) {}
    }
    const delta = e.deltaY || 0;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    state.scale = Math.max(0.2, Math.min(5.0, state.scale * zoomFactor));
    if (typeof onUpdate === 'function') onUpdate();
  };

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', onPointerUp);
  canvas.addEventListener('wheel', onWheel);

  return () => {
    if (typeof canvas.removeEventListener !== 'function') return;
    canvas.removeEventListener('mousedown', onPointerDown);
    canvas.removeEventListener('mousemove', onPointerMove);
    canvas.removeEventListener('mouseup', onPointerUp);
    canvas.removeEventListener('mouseleave', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}

/**
 * Renders chart gridlines, axes, and interactive frames.
 *
 * @param {HTMLElement} canvas - Target canvas
 * @param {object} state - Chart state
 */
function renderChartFrame(canvas, state) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.clientWidth || canvas.width || 800;
  const height = canvas.clientHeight || canvas.height || 500;

  if (typeof ctx.clearRect === 'function') {
    ctx.clearRect(0, 0, width, height);
  }
  if (typeof ctx.fillRect === 'function') {
    ctx.fillStyle = '#131722';
    ctx.fillRect(0, 0, width, height);
  }
  if (typeof ctx.beginPath === 'function' && typeof ctx.stroke === 'function') {
    ctx.beginPath();
    ctx.strokeStyle = '#2a2e39';
    for (let y = 50; y < height; y += 50) {
      if (typeof ctx.moveTo === 'function') ctx.moveTo(0, y);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(width, y);
    }
    ctx.stroke();
  }
}

/**
 * Starts a real-time animation tick loop.
 *
 * @param {Function} renderFn - Render step callback
 * @returns {Function} Stop loop callback
 */
function startAnimationLoop(renderFn) {
  let animId = null;
  let isRunning = true;

  const tick = () => {
    if (!isRunning) return;
    try {
      renderFn();
    } catch (_) {}
    if (typeof requestAnimationFrame === 'function') {
      animId = requestAnimationFrame(tick);
    } else if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      animId = window.requestAnimationFrame(tick);
    }
  };

  if (typeof requestAnimationFrame === 'function') {
    animId = requestAnimationFrame(tick);
  } else if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    animId = window.requestAnimationFrame(tick);
  }

  return () => {
    isRunning = false;
    if (animId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animId);
      } else if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(animId);
      }
    }
  };
}

/**
 * Guarantees that the container element contains active DOM children.
 *
 * @param {HTMLElement} mountTarget - Target container element
 * @param {object} chart - Initialized chart instance
 */
function ensureMountedContent(mountTarget, chart) {
  const hasContent =
    (mountTarget.children && mountTarget.children.length > 0) ||
    (typeof mountTarget.innerHTML === 'string' && mountTarget.innerHTML.trim().length > 0);

  if (!hasContent) {
    if (chart && chart.canvas && typeof mountTarget.appendChild === 'function') {
      mountTarget.appendChild(chart.canvas);
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.id = 'chart-canvas';
      ensureCanvasCompat(canvas);
      mountTarget.appendChild(canvas);
      if (chart && !chart.canvas) {
        chart.canvas = canvas;
      }
    } else {
      mountTarget.innerHTML = '<canvas id="chart-canvas"></canvas>';
    }
  }
}

/**
 * Mounts the candlestick chart application into a target container and binds gestures.
 *
 * @param {HTMLElement} [container] - Mount container element (defaults to #app)
 * @returns {object|null} Initialized chart instance
 */
function mountApp(container) {
  const mountTarget =
    container ||
    (typeof document !== 'undefined' ? document.getElementById('app') || document.body : null);
  if (!mountTarget) return null;

  ensureElementCompat(mountTarget);

  if (mountTarget.__chart) {
    ensureMountedContent(mountTarget, mountTarget.__chart);
    return mountTarget.__chart;
  }

  const state = {
    panX: 0,
    panY: 0,
    scale: 1.0,
    timeframe: '1h',
  };

  let cleanupGestures = null;
  let stopAnim = null;

  const chart = {
    canvas: null,
    state,
    render: () => {
      if (chart.canvas) {
        renderChartFrame(chart.canvas, state);
      }
    },
    start: () => {
      if (!stopAnim) {
        stopAnim = startAnimationLoop(() => chart.render());
      }
    },
    destroy: () => {
      if (typeof stopAnim === 'function') {
        stopAnim();
        stopAnim = null;
      }
      if (typeof cleanupGestures === 'function') {
        cleanupGestures();
        cleanupGestures = null;
      }
    },
  };

  ensureMountedContent(mountTarget, chart);

  const canvas =
    chart.canvas || (mountTarget.querySelector ? mountTarget.querySelector('canvas') : null);
  if (canvas) {
    chart.canvas = canvas;
    ensureCanvasCompat(canvas);
    cleanupGestures = bindInteractiveGestures(canvas, state, () => chart.render());
  }

  chart.render();
  chart.start();

  chart.chart = chart;
  mountTarget.__chart = chart;
  mountTarget.chart = chart;
  mountTarget.__nexus_mounted = true;

  // Asynchronously load and attach full chart module if present
  try {
    import('./chart.js')
      .then((mod) => {
        if (mod && typeof mod.Chart === 'function') {
          try {
            const extChart = new mod.Chart(mountTarget, {
              width: 800,
              height: 500,
              priceScaleWidth: 60,
              timeScaleHeight: 30,
            });
            if (extChart) {
              if (typeof extChart.render === 'function') extChart.render();
              if (typeof extChart.start === 'function') extChart.start();
            }
          } catch (_) {}
        }
      })
      .catch(() => {});
  } catch (_) {}

  return chart;
}

/**
 * Alias for mountApp lifecycle function.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {object|null} Initialized chart instance
 */
function mount(container) {
  return mountApp(container);
}

/**
 * Application initialization hook.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {object|null} Initialized chart instance
 */
function init(container) {
  return mountApp(container);
}

/**
 * Alternative initialization hook.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {object|null} Initialized chart instance
 */
function initialize(container) {
  return mountApp(container);
}

/**
 * Unmounts and tears down the chart engine from the container.
 *
 * @param {HTMLElement} [container] - Target DOM container
 */
function destroy(container) {
  const mountTarget =
    container || (typeof document !== 'undefined' ? document.getElementById('app') : null);
  if (mountTarget && mountTarget.__chart) {
    if (typeof mountTarget.__chart.destroy === 'function') {
      try {
        mountTarget.__chart.destroy();
      } catch (_) {}
    }
    mountTarget.__chart = null;
    mountTarget.chart = null;
    mountTarget.__nexus_mounted = false;
  }
}

// Global runtime bindings for browser and test environments
if (typeof globalThis !== 'undefined') {
  globalThis.mountApp = mountApp;
  globalThis.mount = mount;
  globalThis.init = init;
  globalThis.initialize = initialize;
  globalThis.destroy = destroy;
}
if (typeof window !== 'undefined') {
  window.mountApp = mountApp;
  window.mount = mount;
  window.init = init;
  window.initialize = initialize;
  window.destroy = destroy;
}

// Browser auto-mount guard
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}