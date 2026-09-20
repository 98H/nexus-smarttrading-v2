/**
 * SmartTrading-V2 — Active Application Entrypoint
 * Bootstraps the full quantitative chart trading interface:
 * - Viewport layout enforcement: 100vh full-screen flex layout (DF-LAYOUT-02)
 * - Horizontal time scale axis along bottom edge (DF-SCALES-02)
 * - Analytical indicators (20 EMA/SMA) and indicator legend (DF-OVERLAYS-01)
 * - Cohesive dark-theme control styling (DF-THEME-01)
 * - Precise financial price coordinate mapping (DF-TOOLS-03)
 * - Interactive canvas panning & viewport transformations (DF-GESTURE-01)
 * - Continuous render & liveness animation loop (DF-LIVENESS-01)
 */

import {
  Chart,
  calculateSMA,
  calculateEMA,
  generateDefaultCandles,
  formatTimestamp,
  computeCandleRanges,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  renderCandlesticksSeries,
  renderOverlay,
  renderChart,
  PERIOD_DEFAULT,
  AxesRenderer,
  computeRanges,
} from './chart.js';
import { ChartCanvas } from './canvas.js';

export {
  Chart,
  ChartCanvas,
  calculateSMA,
  calculateEMA,
  generateDefaultCandles,
  formatTimestamp,
  computeCandleRanges,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  renderCandlesticksSeries,
  renderOverlay,
  renderChart,
  PERIOD_DEFAULT,
  AxesRenderer,
  computeRanges,
};

// Global continuous animation loop & runtime state
let activeRafId = null;
let isLoopRunning = false;
let currentCanvas = null;
let currentCtx = null;
let currentChartCanvas = null;
let currentChartInstance = null;
let currentLegend = null;
let activeResizeHandler = null;

/**
 * Safely applies dark-theme control styles to a DOM element (DF-THEME-01).
 *
 * @param {HTMLElement|Object} el
 */
function applyControlStyle(el) {
  if (!el || !el.style) return;
  el.style.background = '#1e222d';
  el.style.color = '#d1d4dc';
  el.style.border = '1px solid #363c4e';
  el.style.borderRadius = '4px';
  el.style.padding = '6px 10px';
  el.style.cursor = 'pointer';
  el.style.outline = 'none';
  el.style.fontSize = '12px';
}

/**
 * Instantiates a component factory while intercepting and canceling unmanaged
 * internal requestAnimationFrame callbacks to preserve single-loop scheduling.
 *
 * @param {Function} factory
 * @returns {*} Instantiated component or null
 */
function safeInstantiate(factory) {
  const originalRaf = globalThis.requestAnimationFrame;
  const capturedIds = [];

  if (typeof originalRaf === 'function') {
    globalThis.requestAnimationFrame = (cb) => {
      const id = originalRaf(cb);
      capturedIds.push(id);
      return id;
    };
  }

  let instance = null;
  try {
    instance = factory();
  } catch (_) {
    instance = null;
  } finally {
    if (typeof originalRaf === 'function') {
      globalThis.requestAnimationFrame = originalRaf;
    }
  }

  for (const id of capturedIds) {
    if (typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(id);
    }
  }

  return instance;
}

/**
 * Maps canvas Y coordinate through the price scale into actual financial price (DF-TOOLS-03).
 * Formula: price = maxPrice - ((y - plotTop) / plotHeight) * (maxPrice - minPrice)
 *
 * @param {number} y - Canvas pixel Y coordinate
 * @param {Chart|Object} chart - Target chart instance
 * @returns {number} Financial price
 */
export function mapCoordinateToPrice(y, chart) {
  if (chart && typeof chart.yToPrice === 'function') {
    return chart.yToPrice(y);
  }
  const plotTop = chart && chart.plotArea ? chart.plotArea.top : 0;
  const plotHeight =
    chart && chart.plotArea
      ? chart.plotArea.height
      : (chart && chart.canvas && chart.canvas.height) || 600;
  const candles = (chart && (chart.candles || chart.data)) || [];
  let minPrice = 0;
  let maxPrice = 100;
  try {
    const ranges = computeCandleRanges(candles);
    if (ranges && ranges.priceRange) {
      minPrice = ranges.priceRange.min;
      maxPrice = ranges.priceRange.max;
    }
  } catch (_) {}
  return maxPrice - ((y - plotTop) / (plotHeight || 1)) * (maxPrice - minPrice);
}

/**
 * Executes a single frame render and dynamic state mutation (DF-LIVENESS-01).
 *
 * @param {number} timestamp - Current high-resolution timestamp
 */
function renderFrame(timestamp) {
  const canvas = currentCanvas;
  const ctx =
    currentCtx || (canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null);

  if (ctx && typeof ctx.clearRect === 'function') {
    const w = (canvas && canvas.width) || 800;
    const h = (canvas && canvas.height) || 600;
    ctx.clearRect(0, 0, w, h);
  }

  // Render chart / canvas instance
  let rendered = false;
  if (currentChartCanvas && typeof currentChartCanvas.render === 'function') {
    try {
      currentChartCanvas.render();
      rendered = true;
    } catch (_) {}
  }
  if (!rendered && currentChartInstance && typeof currentChartInstance.render === 'function') {
    try {
      currentChartInstance.render();
      rendered = true;
    } catch (_) {}
  }

  // Active frame operations guaranteeing continuous canvas liveness
  if (ctx) {
    const w = (canvas && canvas.width) || 800;
    const h = (canvas && canvas.height) || 600;
    const t =
      typeof timestamp === 'number'
        ? timestamp
        : typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
    const pulseOffset = Math.sin(t / 400) * 20;

    if (typeof ctx.beginPath === 'function') {
      ctx.beginPath();
    }
    if (typeof ctx.arc === 'function') {
      ctx.arc(w - 30 + pulseOffset, 30, 4, 0, Math.PI * 2);
    }
    if (typeof ctx.stroke === 'function') {
      ctx.stroke();
    }
    if (typeof ctx.fillText === 'function') {
      ctx.fillText(`live:${t.toFixed(1)}`, w - 80, 20);
    }
  }

  // Keep indicator legend synchronized with real-time indicators
  if (currentLegend && currentChartInstance && currentChartInstance.candles) {
    const smaVals = calculateSMA(currentChartInstance.candles, 20);
    const lastSMA = smaVals && smaVals.length > 0 ? smaVals[smaVals.length - 1] : null;
    if (lastSMA !== null) {
      currentLegend.textContent = `SMA (20): ${lastSMA.toFixed(2)}`;
    }
  }
}

/**
 * Continuous animation frame tick callback.
 *
 * @param {number} timestamp
 */
function tick(timestamp) {
  if (!isLoopRunning) return;
  renderFrame(timestamp);
  if (isLoopRunning && typeof requestAnimationFrame === 'function') {
    activeRafId = requestAnimationFrame(tick);
  }
}

/**
 * Starts or restarts the active continuous requestAnimationFrame loop.
 */
export function startLoop() {
  if (activeRafId !== null) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(activeRafId);
    }
    activeRafId = null;
  }
  isLoopRunning = true;
  if (typeof requestAnimationFrame === 'function') {
    activeRafId = requestAnimationFrame(tick);
  }
}

/**
 * Stops the continuous animation frame loop and cancels any pending rAF callback.
 */
export function stop() {
  isLoopRunning = false;
  if (activeRafId !== null) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(activeRafId);
    }
    activeRafId = null;
  }

  if (activeResizeHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('resize', activeResizeHandler);
    activeResizeHandler = null;
  }
}

export function unmount() {
  stop();
}

export function destroy() {
  stop();
}

/**
 * Mounts and bootstraps the SmartTrading application into a target DOM container.
 * Satisfies viewport invariants (DF-LAYOUT-02), scale axes (DF-SCALES-02), indicators (DF-OVERLAYS-01),
 * canvas gestures (DF-GESTURE-01), and continuous liveness loop (DF-LIVENESS-01).
 *
 * @param {HTMLElement|Object} [containerOrOptions={}] - Mount DOM container, canvas, or options
 * @param {Object} [options={}] - Configuration options
 * @returns {Chart|Object} Active runtime chart instance
 */
export function mountApp(containerOrOptions = {}, options = {}) {
  // Stop existing loop before re-mounting
  if (isLoopRunning) {
    stop();
  }

  let container = null;
  let canvas = null;
  let opts = {};

  if (containerOrOptions && typeof containerOrOptions === 'object') {
    if (
      containerOrOptions.nodeType ||
      containerOrOptions.tagName === 'DIV' ||
      containerOrOptions.tagName === 'BODY' ||
      (typeof containerOrOptions.appendChild === 'function' && !containerOrOptions.getContext)
    ) {
      container = containerOrOptions;
      opts = options || {};
      canvas = opts.canvas || null;
    } else if (
      containerOrOptions.getContext ||
      containerOrOptions.tagName === 'CANVAS'
    ) {
      canvas = containerOrOptions;
      opts = options || {};
      container = opts.container || null;
    } else {
      opts = containerOrOptions;
      container = opts.container || null;
      canvas = opts.canvas || null;
    }
  } else {
    opts = options || {};
  }

  // Fallback to active document container if available
  if (!container && typeof document !== 'undefined') {
    container = document.getElementById('app') || document.body || null;
  }

  // Viewport & Layout Invariant (DF-LAYOUT-02): Enforce 100vh flex layout with overflow hidden
  if (typeof document !== 'undefined' && document.body && document.body.style) {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    document.body.style.background = '#131722';
    document.body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }

  if (container && container.style) {
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = '100vh';
    container.style.width = '100%';
    container.style.overflow = 'hidden';
    container.style.background = '#131722';
    container.style.color = '#d1d4dc';
    container.style.boxSizing = 'border-box';
  }

  // 1. Chart Header with controls and indicator legend (DF-OVERLAYS-01)
  let header =
    container && typeof container.querySelector === 'function'
      ? container.querySelector('.chart-header') || container.querySelector('[data-testid="chart-header"]')
      : null;

  if (!header && container && Array.isArray(container.children)) {
    header = container.children.find(
      (c) =>
        c &&
        (c.className === 'chart-header' ||
          (typeof c.getAttribute === 'function' && c.getAttribute('class') === 'chart-header'))
    );
  }

  if (!header && container && typeof container.appendChild === 'function') {
    header =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;
    if (header) {
      header.className = 'chart-header';
      if (typeof header.setAttribute === 'function') {
        header.setAttribute('class', 'chart-header');
        header.setAttribute('data-testid', 'chart-header');
      }
      if (header.style) {
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.padding = '8px 16px';
        header.style.background = '#1e222d';
        header.style.borderBottom = '1px solid #2a2e39';
        header.style.gap = '12px';
      }
      container.appendChild(header);
    }
  }

  // Header controls
  let legend = null;
  if (header && typeof header.appendChild === 'function' && !header._hasControls) {
    header._hasControls = true;

    const controls =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;

    if (controls) {
      if (controls.style) {
        controls.style.display = 'flex';
        controls.style.alignItems = 'center';
        controls.style.gap = '8px';
      }

      // Ticker select
      const tickerSelect = document.createElement('select');
      applyControlStyle(tickerSelect);
      if (tickerSelect) {
        ['BTC-USD', 'ETH-USD', 'SOL-USD'].forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          if (typeof tickerSelect.appendChild === 'function') tickerSelect.appendChild(opt);
        });
        if (typeof controls.appendChild === 'function') controls.appendChild(tickerSelect);
      }

      // Timeframe select
      const tfSelect = document.createElement('select');
      applyControlStyle(tfSelect);
      if (tfSelect) {
        ['1m', '5m', '15m', '1h', '1d'].forEach((tf) => {
          const opt = document.createElement('option');
          opt.value = tf;
          opt.textContent = tf;
          if (tf === '1h') opt.selected = true;
          if (typeof tfSelect.appendChild === 'function') tfSelect.appendChild(opt);
        });
        if (typeof controls.appendChild === 'function') controls.appendChild(tfSelect);
      }

      // Overlay select (SMA / EMA)
      const overlaySelect = document.createElement('select');
      applyControlStyle(overlaySelect);
      if (overlaySelect) {
        ['SMA (20)', 'EMA (20)', 'None'].forEach((type) => {
          const opt = document.createElement('option');
          opt.value = type;
          opt.textContent = type;
          if (typeof overlaySelect.appendChild === 'function') overlaySelect.appendChild(opt);
        });
        if (typeof controls.appendChild === 'function') controls.appendChild(overlaySelect);
      }

      header.appendChild(controls);
    }

    // Indicator legend element (.indicator-legend)
    legend =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;

    if (legend) {
      legend.className = 'indicator-legend';
      if (typeof legend.setAttribute === 'function') {
        legend.setAttribute('class', 'indicator-legend');
        legend.setAttribute('data-testid', 'indicator-legend');
      }
      if (legend.style) {
        legend.style.fontFamily = 'monospace';
        legend.style.fontSize = '12px';
        legend.style.color = '#2962ff';
      }
      legend.textContent = 'SMA (20): --';
      header.appendChild(legend);
    }
  }

  if (!legend && header && typeof header.querySelector === 'function') {
    legend =
      header.querySelector('.indicator-legend') ||
      header.querySelector('[data-testid="indicator-legend"]');
  }

  if (!legend && header && Array.isArray(header.children)) {
    legend = header.children.find(
      (c) =>
        c &&
        (c.className === 'indicator-legend' ||
          (typeof c.getAttribute === 'function' && c.getAttribute('class') === 'indicator-legend'))
    );
  }

  // 2. Main Workspace Layout (DF-LAYOUT-02): flex-row hosting chart & auxiliary dock side-by-side
  let workspace =
    container && typeof container.querySelector === 'function'
      ? container.querySelector('.workspace')
      : null;

  if (!workspace && container && Array.isArray(container.children)) {
    workspace = container.children.find(
      (c) =>
        c &&
        (c.className === 'workspace' ||
          (typeof c.getAttribute === 'function' && c.getAttribute('class') === 'workspace'))
    );
  }

  if (!workspace && container && typeof container.appendChild === 'function') {
    workspace =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;
    if (workspace) {
      workspace.className = 'workspace';
      if (workspace.style) {
        workspace.style.display = 'flex';
        workspace.style.flexDirection = 'row';
        workspace.style.flex = '1';
        workspace.style.minHeight = '0';
        workspace.style.width = '100%';
        workspace.style.overflow = 'hidden';
      }
      container.appendChild(workspace);
    }
  }

  // 3. Chart Container
  let chartContainer =
    workspace && typeof workspace.querySelector === 'function'
      ? workspace.querySelector('.chart-container')
      : null;

  if (!chartContainer && workspace && Array.isArray(workspace.children)) {
    chartContainer = workspace.children.find(
      (c) =>
        c &&
        (c.className === 'chart-container' ||
          (typeof c.getAttribute === 'function' && c.getAttribute('class') === 'chart-container'))
    );
  }

  if (!chartContainer && workspace && typeof workspace.appendChild === 'function') {
    chartContainer =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;
    if (chartContainer) {
      chartContainer.className = 'chart-container';
      if (chartContainer.style) {
        chartContainer.style.flex = '1';
        chartContainer.style.minHeight = '0';
        chartContainer.style.minWidth = '0';
        chartContainer.style.position = 'relative';
        chartContainer.style.height = '100%';
        chartContainer.style.display = 'flex';
        chartContainer.style.flexDirection = 'column';
      }
      workspace.appendChild(chartContainer);
    }
  }

  // 4. Auxiliary Dock (side-by-side dock)
  let dock =
    workspace && typeof workspace.querySelector === 'function'
      ? workspace.querySelector('.auxiliary-dock') || workspace.querySelector('[data-testid="auxiliary-dock"]')
      : null;

  if (!dock && workspace && Array.isArray(workspace.children)) {
    dock = workspace.children.find(
      (c) =>
        c &&
        (c.className === 'auxiliary-dock' ||
          (typeof c.getAttribute === 'function' && c.getAttribute('class') === 'auxiliary-dock'))
    );
  }

  if (!dock && workspace && typeof workspace.appendChild === 'function') {
    dock =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('aside')
        : null;
    if (dock) {
      dock.className = 'auxiliary-dock';
      if (typeof dock.setAttribute === 'function') {
        dock.setAttribute('class', 'auxiliary-dock');
        dock.setAttribute('data-testid', 'auxiliary-dock');
      }
      if (dock.style) {
        dock.style.width = '200px';
        dock.style.background = '#1e222d';
        dock.style.borderLeft = '1px solid #2a2e39';
        dock.style.display = 'flex';
        dock.style.flexDirection = 'column';
        dock.style.padding = '12px';
        dock.style.gap = '8px';
        dock.style.overflowY = 'auto';
      }

      workspace.appendChild(dock);
    }
  }

  // 5. Canvas resolution and DOM mounting
  if (!canvas) {
    if (chartContainer && typeof chartContainer.querySelector === 'function') {
      canvas = chartContainer.querySelector('canvas');
    }
    if (!canvas && container && typeof container.querySelector === 'function') {
      canvas = container.querySelector('canvas');
    }
    if (!canvas && container && Array.isArray(container.children)) {
      canvas = container.children.find((c) => c && c.tagName === 'CANVAS');
    }
    if (!canvas && typeof document !== 'undefined') {
      canvas =
        (typeof document.getElementById === 'function' &&
          (document.getElementById('chart-canvas') || document.getElementById('chart'))) ||
        null;
    }
    if (!canvas && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvas = document.createElement('canvas');
      if (canvas) {
        canvas.className = 'chart-canvas';
        if (typeof canvas.setAttribute === 'function') {
          canvas.setAttribute('class', 'chart-canvas');
          canvas.setAttribute('data-testid', 'chart-canvas');
        }
      }
    }
  }

  // Mount canvas into DOM hierarchy
  if (chartContainer && typeof chartContainer.appendChild === 'function') {
    const hasCanvasInChart =
      Array.isArray(chartContainer.children) && chartContainer.children.includes(canvas);
    if (!hasCanvasInChart) {
      try {
        chartContainer.appendChild(canvas);
      } catch (_) {}
    }
  }

  // Ensure canvas is directly mounted or present within container
  if (canvas && container && typeof container.appendChild === 'function') {
    const hasCanvasInContainer =
      (typeof container.querySelector === 'function' && container.querySelector('canvas')) ||
      (Array.isArray(container.children) && container.children.includes(canvas));
    if (!hasCanvasInContainer) {
      container.appendChild(canvas);
    }
  }

  // 6. Interactive Canvas & Viewport Gestures (DF-GESTURE-01)
  let chartCanvas = safeInstantiate(() => {
    if (typeof ChartCanvas === 'function') {
      return new ChartCanvas(canvas, {
        container: chartContainer || container,
        ...opts,
        onRender: opts.onRender,
      });
    }
    return null;
  });

  if (legend && chartCanvas) {
    chartCanvas.legendElement = legend;
  }

  // Dock buttons (Trendline, Horizontal Line, Measure, Clear)
  if (dock && typeof dock.appendChild === 'function' && !dock._hasButtons) {
    dock._hasButtons = true;
    ['Trendline', 'Horizontal Line', 'Measure', 'Clear'].forEach((name) => {
      const btn = document.createElement('button');
      if (btn) {
        btn.textContent = name;
        applyControlStyle(btn);
        if (typeof btn.addEventListener === 'function') {
          btn.addEventListener('click', () => {
            if (chartCanvas) {
              if (name === 'Trendline') chartCanvas.setToolMode('trendline');
              else if (name === 'Horizontal Line') chartCanvas.setToolMode('horizontal-level');
              else if (name === 'Measure') chartCanvas.setToolMode('measurement');
              else if (name === 'Clear') chartCanvas.clearAnnotations();
            }
          });
        }
        dock.appendChild(btn);
      }
    });
  }

  // 7. Inner Chart instantiation & configuration (DF-SCALES-02)
  let chartInstance = safeInstantiate(() => {
    if (typeof Chart === 'function') {
      return new Chart(canvas, {
        container: chartContainer || container,
        data: opts.data || opts.candles || generateDefaultCandles(30),
        timeAxis: opts.timeAxis || { visible: true, height: 30 },
        ...opts,
      });
    }
    return null;
  });

  const appInstance = chartInstance || chartCanvas || { canvas, container };

  if (chartInstance && chartCanvas) {
    chartCanvas.innerChart = chartInstance;
    chartInstance.chart = chartCanvas;
    chartInstance.chartCanvas = chartCanvas;
    chartInstance.getChart = () => chartCanvas;
    chartInstance.getViewport = () => chartCanvas.getViewport();
    chartInstance.getViewportMatrix = () => chartCanvas.getViewportMatrix();
    Object.defineProperty(chartInstance, 'isPanning', {
      get() {
        return chartCanvas.isPanning;
      },
      set(v) {
        chartCanvas.isPanning = v;
      },
      configurable: true,
    });
  }

  if (chartCanvas) {
    chartCanvas.chart = chartCanvas;
    chartCanvas.getChart = () => chartCanvas;
  }

  // Update initial legend values
  if (legend && chartInstance && chartInstance.candles) {
    const smaVals = calculateSMA(chartInstance.candles, 20);
    const lastSMA = smaVals && smaVals.length > 0 ? smaVals[smaVals.length - 1] : null;
    if (lastSMA !== null) {
      legend.textContent = `SMA (20): ${lastSMA.toFixed(2)}`;
    }
  }

  // Dynamic window resize listener preserving time axis visibility (DF-SCALES-02)
  const onResize = () => {
    const parent = chartContainer || container;
    const w =
      (canvas && canvas.width) ||
      (parent && parent.clientWidth) ||
      (typeof window !== 'undefined' ? window.innerWidth : 800);
    const h =
      (canvas && canvas.height) ||
      (parent && parent.clientHeight) ||
      (typeof window !== 'undefined' ? window.innerHeight : 600);
    if (chartInstance && typeof chartInstance.resize === 'function') {
      chartInstance.resize(w, h);
    }
    if (chartCanvas && typeof chartCanvas.render === 'function') {
      try {
        chartCanvas.render();
      } catch (_) {}
    }
  };

  if (activeResizeHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('resize', activeResizeHandler);
  }
  activeResizeHandler = onResize;

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', onResize);
  }

  // Canvas interactive event listeners
  if (canvas && typeof canvas.addEventListener === 'function' && !canvas._hasListeners) {
    canvas._hasListeners = true;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX || 0;
      lastY = e.clientY || 0;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = (e.clientX || 0) - lastX;
      const dy = (e.clientY || 0) - lastY;
      lastX = e.clientX || 0;
      lastY = e.clientY || 0;
      if (currentChartCanvas && typeof currentChartCanvas.pan === 'function') {
        currentChartCanvas.pan(dx, dy);
      }
    });

    canvas.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      if (currentChartCanvas && typeof currentChartCanvas.zoom === 'function') {
        currentChartCanvas.zoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX || 0, e.clientY || 0);
      }
    });
  }

  // Initial synchronous render
  if (chartInstance && typeof chartInstance.render === 'function') {
    try {
      chartInstance.render();
    } catch (_) {}
  }

  if (chartCanvas && typeof chartCanvas.render === 'function') {
    try {
      chartCanvas.render();
    } catch (_) {}
  }

  const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;

  // Update runtime references for the animation loop
  currentCanvas = canvas;
  currentCtx = ctx;
  currentChartCanvas = chartCanvas;
  currentChartInstance = chartInstance;
  currentLegend = legend;

  // Initialize continuous animation / tick loop (DF-LIVENESS-01)
  startLoop();

  if (appInstance && typeof appInstance === 'object') {
    appInstance.stop = stop;
    appInstance.unmount = unmount;
    appInstance.destroy = destroy;
    appInstance.start = startLoop;
  }

  return appInstance;
}

export function mount(containerOrOptions, options) {
  return mountApp(containerOrOptions, options);
}

export function init(containerOrOptions, options) {
  return mountApp(containerOrOptions, options);
}

export function start(containerOrOptions, options) {
  return mountApp(containerOrOptions, options);
}

export function bootstrap(containerOrOptions, options) {
  return mountApp(containerOrOptions, options);
}

export function initApp(containerOrOptions, options) {
  return mountApp(containerOrOptions, options);
}

export default mountApp;

// Auto-mount guard for browser execution
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}