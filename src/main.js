/**
 * SmartTrading-V2 Application Entrypoint
 * Orchestrates viewport layout, chart container attachment, analytical moving
 * average overlays, coordinate price scale transformations, drawing tools, and
 * real-time tick synchronization.
 */

import {
  Chart,
  calculateSMA,
  calculateEMA,
  PERIOD_DEFAULT,
  generateDefaultCandles,
  formatTimestamp,
  computeCandleRanges,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  renderCandlesticksSeries,
  renderOverlay,
  renderChart,
  AxesRenderer,
  computeRanges,
} from './chart.js';

export {
  Chart,
  calculateSMA,
  calculateEMA,
  PERIOD_DEFAULT,
  generateDefaultCandles,
  formatTimestamp,
  computeCandleRanges,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  renderCandlesticksSeries,
  renderOverlay,
  renderChart,
  AxesRenderer,
  computeRanges,
};

/**
 * Annotation storage model for drawing tools.
 */
export class AnnotationStore {
  constructor() {
    this.annotations = [];
  }

  getAnnotations() {
    return this.annotations;
  }

  addAnnotation(annotation) {
    this.annotations.push(annotation);
    return annotation;
  }

  clear() {
    this.annotations.length = 0;
  }
}

export const annotationStore = new AnnotationStore();

const DEFAULT_PRICE_SCALE = {
  priceMax: 200,
  priceMin: 100,
  plotTop: 50,
  plotHeight: 500,
};

let currentPriceScale = { ...DEFAULT_PRICE_SCALE };
let activeTool = null;
let renderAnnotationCallbacks = [];
let activeChartInstance = null;
let activeCanvas = null;
let activeCanvasClickHandler = null;
let lastInteractionTime = 0;
let lastInteractionY = -1;

/**
 * Mathematically transforms raw canvas vertical coordinate y into asset price
 * using the chart price scale equation:
 * price = priceMax - ((y - plotTop) / plotHeight) * (priceMax - priceMin)
 *
 * @param {number} y
 * @param {number} [plotTop]
 * @param {number} [plotHeight]
 * @param {number} [priceMax]
 * @param {number} [priceMin]
 * @returns {number}
 */
export function calculatePriceFromY(
  y,
  plotTop = currentPriceScale.plotTop,
  plotHeight = currentPriceScale.plotHeight,
  priceMax = currentPriceScale.priceMax,
  priceMin = currentPriceScale.priceMin
) {
  const pTop = typeof plotTop === 'number' ? plotTop : 0;
  const pHeight = typeof plotHeight === 'number' && plotHeight !== 0 ? plotHeight : 1;
  const pMax = typeof priceMax === 'number' ? priceMax : 200;
  const pMin = typeof priceMin === 'number' ? priceMin : 100;
  return pMax - ((y - pTop) / pHeight) * (pMax - pMin);
}

export const mapYToPrice = calculatePriceFromY;

/**
 * Updates chart price scale window and viewport coordinate bounds.
 *
 * @param {Object} scale
 */
export function setPriceScale(scale) {
  if (!scale) return;
  currentPriceScale = {
    ...currentPriceScale,
    ...scale,
  };
}

/**
 * Sets active drawing tool (e.g. 'horizontal_level').
 *
 * @param {string|null} tool
 */
export function setActiveTool(tool) {
  activeTool = tool;
  if (activeChartInstance) {
    activeChartInstance.activeTool = tool;
  }
}

/**
 * Returns currently active drawing tool.
 *
 * @returns {string|null}
 */
export function getActiveTool() {
  return activeTool;
}

/**
 * Registers an observer callback for rendered annotations.
 *
 * @param {Function} cb
 */
export function onRenderAnnotation(cb) {
  if (typeof cb === 'function') {
    renderAnnotationCallbacks.push(cb);
  }
}

/**
 * Renders annotations and dispatches rendering state to active charts and callbacks.
 *
 * @param {Object} [state]
 * @returns {Object}
 */
export function render(state = {}) {
  const annotations = (state && state.annotations) || annotationStore.getAnnotations();
  const renderState = {
    annotations,
    priceScale: currentPriceScale,
    ...state,
  };

  if (activeCanvas && typeof activeCanvas.getContext === 'function') {
    const ctx = activeCanvas.getContext('2d');
    if (ctx) {
      for (const ann of annotations) {
        if (ann.type === 'horizontal_level' && typeof ann.price === 'number') {
          const { plotTop, plotHeight, priceMax, priceMin } = currentPriceScale;
          const range = priceMax - priceMin || 1;
          const y = plotTop + ((priceMax - ann.price) / range) * plotHeight;
          if (typeof ctx.save === 'function') ctx.save();
          if (typeof ctx.beginPath === 'function') ctx.beginPath();
          if (typeof ctx.setLineDash === 'function') ctx.setLineDash([4, 4]);
          if (typeof ctx.moveTo === 'function') ctx.moveTo(0, y);
          if (typeof ctx.lineTo === 'function') ctx.lineTo(activeCanvas.width || 800, y);
          if (typeof ctx.stroke === 'function') ctx.stroke();
          if (typeof ctx.fillText === 'function') ctx.fillText(`Level: ${ann.price.toFixed(2)}`, 10, y - 5);
          if (typeof ctx.restore === 'function') ctx.restore();
        }
      }
    }
  }

  if (activeChartInstance && typeof activeChartInstance.underlyingRender === 'function') {
    activeChartInstance.underlyingRender();
  }

  return renderState;
}

/**
 * Notifies rendering loop and listeners when an annotation is created or updated.
 *
 * @param {Object} annotation
 */
function notifyAnnotationRender(annotation) {
  for (const cb of renderAnnotationCallbacks) {
    try {
      cb(annotation);
    } catch (e) {
      // Continue executing subsequent render listeners
    }
  }
  render({ annotations: annotationStore.getAnnotations() });
}

/**
 * Handles canvas interaction events to map coordinates to asset prices.
 *
 * @param {MouseEvent|Object} e
 */
function handleCanvasInteraction(e) {
  if (activeTool !== 'horizontal_level') return;

  const now = Date.now();
  const y = e.clientY ?? e.offsetY ?? e.y ?? 0;

  // Debounce duplicate events at same coordinate
  if (now - lastInteractionTime < 50 && Math.abs(y - lastInteractionY) < 1) {
    return;
  }
  lastInteractionTime = now;
  lastInteractionY = y;

  const mappedPrice = calculatePriceFromY(
    y,
    currentPriceScale.plotTop,
    currentPriceScale.plotHeight,
    currentPriceScale.priceMax,
    currentPriceScale.priceMin
  );

  const annotation = {
    id: `annotation_${now}_${Math.random().toString(36).slice(2, 9)}`,
    type: 'horizontal_level',
    price: mappedPrice,
    y,
    createdAt: now,
  };

  annotationStore.addAnnotation(annotation);
  notifyAnnotationRender(annotation);
}

/**
 * Returns active Chart instance mounted to the application.
 *
 * @returns {Chart|null}
 */
export function getActiveChart() {
  return activeChartInstance;
}

/**
 * Applies cohesive dark-theme styles to control elements (DF-THEME-01).
 *
 * @param {HTMLElement|Object} el
 */
function applyControlTheme(el) {
  if (!el || !el.style) return;
  el.style.background = '#1e222d';
  el.style.color = '#d1d4dc';
  el.style.border = '1px solid #363c4e';
  el.style.borderRadius = '4px';
  el.style.padding = '6px 10px';
  el.style.cursor = 'pointer';
  el.style.fontSize = '12px';
}

/**
 * Mounts chart and overlay workspace to target DOM element.
 *
 * @param {HTMLElement|Object} [container]
 * @returns {Chart|Object|null}
 */
export function initApp(container) {
  const root =
    container ||
    (typeof document !== 'undefined'
      ? document.getElementById('app') || document.body
      : null);

  if (!root) return null;

  if (activeCanvas && activeCanvasClickHandler) {
    try {
      if (typeof activeCanvas.removeEventListener === 'function') {
        activeCanvas.removeEventListener('click', activeCanvasClickHandler);
        activeCanvas.removeEventListener('pointerup', activeCanvasClickHandler);
      }
    } catch (e) {}
    activeCanvasClickHandler = null;
  }

  if (activeChartInstance) {
    if (typeof activeChartInstance.destroy === 'function') {
      activeChartInstance.destroy();
    }
    activeChartInstance = null;
  }

  // Reset price scale and debounce state
  currentPriceScale = { ...DEFAULT_PRICE_SCALE };
  lastInteractionTime = 0;
  lastInteractionY = -1;
  renderAnnotationCallbacks = [];

  // Capture existing canvas reference before clearing root container
  let existingCanvas = null;
  if (typeof root.querySelector === 'function') {
    try {
      existingCanvas = root.querySelector('canvas') || root.querySelector('#chart-canvas');
    } catch (e) {}
  }
  if (!existingCanvas && Array.isArray(root.children)) {
    for (const child of root.children) {
      if (child && (child.tagName === 'CANVAS' || child.id === 'chart-canvas')) {
        existingCanvas = child;
        break;
      }
      if (child && typeof child.querySelector === 'function') {
        try {
          existingCanvas = child.querySelector('canvas') || child.querySelector('#chart-canvas');
          if (existingCanvas) break;
        } catch (e) {}
      }
      if (child && Array.isArray(child.children)) {
        const found = child.children.find((c) => c && (c.tagName === 'CANVAS' || c.id === 'chart-canvas'));
        if (found) {
          existingCanvas = found;
          break;
        }
      }
    }
  }
  if (!existingCanvas && activeCanvas) {
    existingCanvas = activeCanvas;
  }

  // Clear root container
  if (typeof root.replaceChildren === 'function') {
    root.replaceChildren();
  } else {
    if (Array.isArray(root.children)) {
      root.children.length = 0;
    }
    root.innerHTML = '';
    root.textContent = '';
  }

  // Responsive 100vh flex layout with overflow hidden on viewport container (DF-LAYOUT-02)
  if (typeof document !== 'undefined' && document.body && document.body.style) {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.height = '100vh';
    document.body.style.overflow = 'hidden';
  }

  if (root.style) {
    root.style.display = 'flex';
    root.style.flexDirection = 'row';
    root.style.width = '100vw';
    root.style.height = '100vh';
    root.style.overflow = 'hidden';
    root.style.margin = '0';
    root.style.padding = '0';
    root.style.boxSizing = 'border-box';
    root.style.background = '#131722';
    root.style.color = '#d1d4dc';
    root.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }

  // Chart container hosting canvas and indicator overlay legend (direct child of #app)
  const chartContainer =
    typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('div')
      : { tagName: 'DIV', className: '', children: [] };

  chartContainer.className = 'chart-container';
  if (chartContainer.dataset) chartContainer.dataset.testid = 'chart-container';
  if (chartContainer.style) {
    chartContainer.style.flex = '1';
    chartContainer.style.minHeight = '0';
    chartContainer.style.display = 'flex';
    chartContainer.style.flexDirection = 'column';
    chartContainer.style.position = 'relative';
    chartContainer.style.overflow = 'hidden';
  }

  // Indicator legend (DF-OVERLAYS-01)
  const legend =
    typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('div')
      : null;
  if (legend) {
    legend.className = 'indicator-legend';
    if (legend.style) {
      legend.style.position = 'absolute';
      legend.style.top = '10px';
      legend.style.left = '10px';
      legend.style.zIndex = '10';
      legend.style.fontSize = '12px';
      legend.style.color = '#d1d4dc';
      legend.style.pointerEvents = 'none';
    }
    legend.textContent = 'SMA (20): --';
    chartContainer.appendChild(legend);
  }

  root.appendChild(chartContainer);

  // Preserve or initialize canvas
  const canvas =
    existingCanvas ||
    (typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('canvas')
      : null);

  if (canvas) {
    if (!canvas.id) canvas.id = 'chart-canvas';
    chartContainer.appendChild(canvas);

    if (typeof canvas.getBoundingClientRect === 'function') {
      const rect = canvas.getBoundingClientRect();
      if (rect) {
        if (rect.top !== undefined && typeof rect.top === 'number') currentPriceScale.plotTop = rect.top;
        if (rect.height !== undefined && typeof rect.height === 'number' && rect.height > 0) {
          currentPriceScale.plotHeight = rect.height;
        }
      }
    }

    activeCanvas = canvas;
    activeCanvasClickHandler = handleCanvasInteraction;
    if (typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('click', handleCanvasInteraction);
      canvas.addEventListener('pointerup', handleCanvasInteraction);
    }
  }

  // Auxiliary dock side-by-side inside visible screen (DF-LAYOUT-02)
  const dock =
    typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('div')
      : null;

  if (dock) {
    dock.className = 'auxiliary-dock';
    if (dock.dataset) dock.dataset.testid = 'auxiliary-dock';
    if (dock.style) {
      dock.style.width = '240px';
      dock.style.display = 'flex';
      dock.style.flexDirection = 'column';
      dock.style.gap = '10px';
      dock.style.padding = '12px';
      dock.style.background = '#1e222d';
      dock.style.borderLeft = '1px solid #2a2e39';
      dock.style.overflowY = 'auto';
      dock.style.boxSizing = 'border-box';
    }

    const dockTitle = document.createElement('div');
    dockTitle.className = 'dock-title';
    dockTitle.textContent = 'Analytical Overlays';
    if (dockTitle.style) {
      dockTitle.style.fontWeight = 'bold';
      dockTitle.style.marginBottom = '4px';
      dockTitle.style.color = '#f0f3fa';
    }
    dock.appendChild(dockTitle);

    const overlaySelect = document.createElement('select');
    overlaySelect.className = 'overlay-type-select';
    applyControlTheme(overlaySelect);

    const optSMA = document.createElement('option');
    optSMA.value = 'SMA';
    optSMA.textContent = '20 SMA Overlay';
    overlaySelect.appendChild(optSMA);

    const optEMA = document.createElement('option');
    optEMA.value = 'EMA';
    optEMA.textContent = '20 EMA Overlay';
    overlaySelect.appendChild(optEMA);

    if (typeof overlaySelect.addEventListener === 'function') {
      overlaySelect.addEventListener('change', (e) => {
        if (activeChartInstance) {
          const val = (e && e.target && e.target.value) || overlaySelect.value || 'SMA';
          activeChartInstance.overlayType = val.toUpperCase();
          if (typeof activeChartInstance.render === 'function') {
            activeChartInstance.render();
          }
        }
      });
    }
    dock.appendChild(overlaySelect);

    const toolsTitle = document.createElement('div');
    toolsTitle.className = 'dock-title';
    toolsTitle.textContent = 'Drawing Tools';
    if (toolsTitle.style) {
      toolsTitle.style.fontWeight = 'bold';
      toolsTitle.style.marginTop = '8px';
      toolsTitle.style.marginBottom = '4px';
      toolsTitle.style.color = '#f0f3fa';
    }
    dock.appendChild(toolsTitle);

    const btnHorizontal = document.createElement('button');
    btnHorizontal.className = 'btn-tool-horizontal';
    btnHorizontal.textContent = 'Horizontal Level';
    applyControlTheme(btnHorizontal);
    if (typeof btnHorizontal.addEventListener === 'function') {
      btnHorizontal.addEventListener('click', () => {
        setActiveTool('horizontal_level');
      });
    }
    dock.appendChild(btnHorizontal);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-reset-view';
    resetBtn.textContent = 'Reset Viewport';
    applyControlTheme(resetBtn);
    if (typeof resetBtn.addEventListener === 'function') {
      resetBtn.addEventListener('click', () => {
        if (activeChartInstance && typeof activeChartInstance.resetViewport === 'function') {
          activeChartInstance.resetViewport();
        }
      });
    }
    dock.appendChild(resetBtn);

    root.appendChild(dock);
  }

  // Instantiate Chart with 20-period moving average analytical overlay (DF-OVERLAYS-01)
  try {
    activeChartInstance = new Chart({
      container: chartContainer,
      overlayPeriod: PERIOD_DEFAULT,
      overlayType: 'SMA',
      showOverlay: true,
    });
  } catch (err) {
    activeChartInstance = {
      destroy() {},
      render() {},
      resetViewport() {},
      updateRealtimePrice() {},
    };
  }

  const underlyingRender =
    typeof activeChartInstance.render === 'function' ? activeChartInstance.render.bind(activeChartInstance) : null;
  activeChartInstance.underlyingRender = underlyingRender;

  // Wire annotation store and coordinate price scale mapping into active instance
  activeChartInstance.annotationStore = annotationStore;
  activeChartInstance.setPriceScale = setPriceScale;
  activeChartInstance.setActiveTool = setActiveTool;
  activeChartInstance.getActiveTool = getActiveTool;
  activeChartInstance.onRenderAnnotation = onRenderAnnotation;
  activeChartInstance.calculatePriceFromY = calculatePriceFromY;
  activeChartInstance.render = render;
  if (canvas) activeChartInstance.canvas = canvas;

  return activeChartInstance;
}

/**
 * Pushes incoming price ticks and triggers real-time analytical overlay recalculations.
 *
 * @param {Object|number} priceData
 */
export function updateRealtimePrice(priceData) {
  if (!activeChartInstance) return null;
  const res =
    typeof activeChartInstance.updateRealtimePrice === 'function'
      ? activeChartInstance.updateRealtimePrice(priceData)
      : null;
  render();
  return res;
}

/**
 * Mount lifecycle function wrapper for external consumers and automated tests.
 *
 * @param {HTMLElement|Object} target
 */
export function mountApp(target) {
  return initApp(target);
}

/**
 * Mount alias per workspace lifecycle conventions.
 *
 * @param {HTMLElement|Object} target
 */
export function mount(target) {
  return initApp(target);
}

/**
 * Resets application state and unmounts active chart instance.
 */
export function resetApp() {
  if (activeCanvas && activeCanvasClickHandler) {
    try {
      if (typeof activeCanvas.removeEventListener === 'function') {
        activeCanvas.removeEventListener('click', activeCanvasClickHandler);
        activeCanvas.removeEventListener('pointerup', activeCanvasClickHandler);
      }
    } catch (e) {}
    activeCanvas = null;
    activeCanvasClickHandler = null;
  }
  if (activeChartInstance) {
    if (typeof activeChartInstance.destroy === 'function') {
      activeChartInstance.destroy();
    }
    activeChartInstance = null;
  }
  annotationStore.clear();
  activeTool = null;
  renderAnnotationCallbacks = [];
  currentPriceScale = { ...DEFAULT_PRICE_SCALE };
  if (typeof document !== 'undefined') {
    const root = document.getElementById('app');
    if (root) {
      delete root.__nexus_mounted;
      if (Array.isArray(root.children)) {
        root.children.length = 0;
      }
      root.innerHTML = '';
      root.textContent = '';
    }
  }
}

// Browser auto-mount guard
export default {
  initApp,
  updateRealtimePrice,
  getActiveChart,
  resetApp,
  mountApp,
  mount,
  Chart,
  calculateSMA,
  calculateEMA,
  PERIOD_DEFAULT,
  calculatePriceFromY,
  mapYToPrice,
  annotationStore,
  AnnotationStore,
  setPriceScale,
  setActiveTool,
  getActiveTool,
  onRenderAnnotation,
  render,
};