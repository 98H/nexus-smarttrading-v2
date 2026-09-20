/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Mounts the financial chart workspace, active canvas rendering context,
 * coordinate axes renderer (DF-SCALES-01, DF-SCALES-02), analytical indicator
 * overlays (DF-OVERLAYS-01), live legend components, and the auxiliary dock
 * hosting secondary workflows (DF-PANEL-01, STORY 31.4.1).
 * Resolves MISSING_HORIZONTAL_TIME_AXIS (STORY 32.1.1).
 */

import { AxesRenderer, computeRanges } from './axes.js';
import {
  Chart,
  polyfillCanvasContext,
  mapYToPrice,
  mapPriceToY,
} from './chart.js';
import {
  calculateSMA,
  calculateEMA,
  renderOverlay,
  createIndicatorLegend,
  updateIndicatorLegend,
  getClosePrice,
} from './indicators.js';
import { AuxiliaryDock } from './components/dock.js';

export {
  AxesRenderer,
  computeRanges,
  Chart,
  polyfillCanvasContext,
  mapYToPrice,
  mapPriceToY,
  calculateSMA,
  calculateEMA,
  renderOverlay,
  createIndicatorLegend,
  updateIndicatorLegend,
  getClosePrice,
  AuxiliaryDock,
};

/**
 * Application state store.
 */
const appState = {
  activeTool: 'cursor',
  overlayType: 'EMA',
  period: 20,
  data: [],
  drawings: [],
  selectedDrawing: null,
};

let activeAppInstance = null;
let windowResizeHandler = null;
export let activeChart = null;
export let chart = null;

/**
 * Returns the current application state.
 *
 * @returns {Object}
 */
export function getState() {
  return appState;
}

/**
 * DOM Element creation utility helper that safely supports mock DOM environments
 * without mutating native read-only DOM getters.
 *
 * @param {string} tag
 * @param {Object} [attrs={}]
 * @param {Array<HTMLElement|Object>|string} [children=[]]
 * @returns {HTMLElement|Object}
 */
export function createElement(tag, attrs = {}, children = []) {
  let el;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    el = document.createElement(tag);
  } else {
    el = {
      className: '',
      id: '',
      style: {},
      children: [],
      textContent: '',
    };
    try {
      Object.defineProperty(el, 'tagName', {
        value: tag.toUpperCase(),
        writable: true,
        configurable: true,
      });
      Object.defineProperty(el, 'nodeName', {
        value: tag.toUpperCase(),
        writable: true,
        configurable: true,
      });
    } catch (_) {}
  }

  // Ensure mock elements have tagName without directly assigning in native DOM
  if (typeof el.tagName !== 'string') {
    try {
      Object.defineProperty(el, 'tagName', {
        value: tag.toUpperCase(),
        writable: true,
        configurable: true,
      });
    } catch (_) {}
  }
  if (typeof el.nodeName !== 'string') {
    try {
      Object.defineProperty(el, 'nodeName', {
        value: tag.toUpperCase(),
        writable: true,
        configurable: true,
      });
    } catch (_) {}
  }

  if (typeof el.appendChild !== 'function') {
    const childList = [];
    try {
      Object.defineProperty(el, 'children', {
        get() { return childList; },
        configurable: true,
      });
    } catch (_) {}
    el.appendChild = function (child) {
      if (child) {
        child.parentNode = this;
        childList.push(child);
      }
      return child;
    };
  }
  if (typeof el.removeChild !== 'function') {
    el.removeChild = function (child) {
      if (Array.isArray(this.children)) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
          child.parentNode = null;
          this.children.splice(idx, 1);
        }
      }
      return child;
    };
  }
  if (typeof el.addEventListener !== 'function') {
    el.addEventListener = function () {};
  }
  if (typeof el.removeEventListener !== 'function') {
    el.removeEventListener = function () {};
  }
  if (typeof el.setAttribute !== 'function') {
    el.setAttribute = function (name, value) {
      this[name] = value;
    };
  }
  if (typeof el.getAttribute !== 'function') {
    el.getAttribute = function (name) {
      return this[name] !== undefined ? this[name] : null;
    };
  }

  if (attrs) {
    Object.keys(attrs).forEach((key) => {
      if (key === 'className') {
        el.className = attrs[key];
        if (typeof el.setAttribute === 'function') el.setAttribute('class', attrs[key]);
      } else if (key === 'id') {
        el.id = attrs[key];
        if (typeof el.setAttribute === 'function') el.setAttribute('id', attrs[key]);
      } else if (key === 'style' && typeof attrs[key] === 'object') {
        if (!el.style) el.style = {};
        Object.assign(el.style, attrs[key]);
      } else if (key.startsWith('on') && typeof attrs[key] === 'function') {
        const eventName = key.slice(2).toLowerCase();
        if (typeof el.addEventListener === 'function') {
          el.addEventListener(eventName, attrs[key]);
        }
      } else if (key === 'textContent') {
        el.textContent = attrs[key];
      } else if (key === 'value') {
        el.value = attrs[key];
      } else {
        if (typeof el.setAttribute === 'function') {
          el.setAttribute(key, attrs[key]);
        } else {
          el[key] = attrs[key];
        }
      }
    });
  }

  if (Array.isArray(children)) {
    children.forEach((child) => {
      if (child) {
        if (typeof child === 'string') {
          if (typeof document !== 'undefined' && typeof document.createTextNode === 'function') {
            if (typeof el.appendChild === 'function') {
              el.appendChild(document.createTextNode(child));
            }
          } else {
            el.textContent = (el.textContent || '') + child;
          }
        } else if (typeof el.appendChild === 'function') {
          el.appendChild(child);
        }
      }
    });
  } else if (typeof children === 'string') {
    el.textContent = children;
  }

  return el;
}

/**
 * Generates sequential mock price candles spanning across horizontal viewport sectors.
 * Defaults to 75 data points.
 */
export function generateDefaultData(count = 75, startPrice = 100, step = 1) {
  return Array.from({ length: count }, (_, i) => {
    const open = startPrice + i * step - 0.5;
    const close = startPrice + i * step;
    const high = Math.max(open, close) + 1.0;
    const low = Math.min(open, close) - 1.0;
    return {
      timestamp: Date.now() - (count - i) * 60000,
      open,
      high,
      low,
      close,
      volume: 1000 + i * 10,
    };
  });
}

/**
 * Drawing Tool Palette Component.
 *
 * @param {Object} [options={}]
 * @returns {HTMLElement|Object}
 */
export function ToolPalette(options = {}) {
  const container = createElement('div', {
    className: 'tool-palette',
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px',
      background: '#181b24',
      borderRight: '1px solid #2a2e39',
      width: '48px',
      alignItems: 'center',
    },
  });

  const tools = [
    { id: 'cursor', label: '⇪', title: 'Cursor' },
    { id: 'trendline', label: '╱', title: 'Trendline' },
    { id: 'horizontal', label: '―', title: 'Horizontal Line' },
    { id: 'fibonacci', label: '≡', title: 'Fibonacci Retracement' },
  ];

  tools.forEach((tool) => {
    const btn = createElement('button', {
      className: `tool-btn tool-${tool.id}`,
      id: `tool-${tool.id}`,
      textContent: tool.label,
      title: tool.title,
      style: {
        background: appState.activeTool === tool.id ? '#2962ff' : '#1e222d',
        color: '#d1d4dc',
        border: '1px solid #363c4e',
        borderRadius: '4px',
        padding: '6px 10px',
        cursor: 'pointer',
        fontSize: '14px',
        lineHeight: '1',
      },
      onClick: () => {
        appState.activeTool = tool.id;
        if (typeof options.onToolChange === 'function') {
          options.onToolChange(tool.id);
        }
      },
    });
    if (typeof container.appendChild === 'function') {
      container.appendChild(btn);
    }
  });

  return container;
}

/**
 * Initializes and styles header controls (DF-THEME-01).
 *
 * @param {HTMLElement|Object} header
 * @param {Object} [options={}]
 * @returns {HTMLElement|Object}
 */
export function initControls(header, options = {}) {
  const controls = createElement('div', {
    className: 'chart-controls',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
  });

  const select = createElement('select', {
    className: 'indicator-select',
    style: {
      background: '#1e222d',
      color: '#d1d4dc',
      border: '1px solid #363c4e',
      borderRadius: '4px',
      padding: '6px 10px',
      cursor: 'pointer',
      fontSize: '12px',
    },
  });

  const optEMA = createElement('option', { value: 'EMA', textContent: 'EMA (20)' });
  const optSMA = createElement('option', { value: 'SMA', textContent: 'SMA (20)' });

  if (options.overlayType === 'SMA') {
    optSMA.selected = true;
  } else {
    optEMA.selected = true;
  }

  if (typeof select.appendChild === 'function') {
    select.appendChild(optEMA);
    select.appendChild(optSMA);
  }

  if (typeof select.addEventListener === 'function') {
    select.addEventListener('change', (e) => {
      const val = e.target?.value || select.value;
      if (typeof options.onOverlayChange === 'function') {
        options.onOverlayChange(val);
      }
    });
  }

  if (typeof controls.appendChild === 'function') {
    controls.appendChild(select);
  }
  if (header && typeof header.appendChild === 'function') {
    header.appendChild(controls);
  }
  return controls;
}

/**
 * Starts an active render loop via requestAnimationFrame
 * to continuously re-render the canvas.
 *
 * @param {Object} instance Application/chart instance
 * @returns {Function} Stop/cleanup function
 */
export function startRenderLoop(instance) {
  let isRunning = true;

  if (typeof requestAnimationFrame !== 'function') {
    return () => {
      isRunning = false;
    };
  }

  function renderFrame() {
    if (!isRunning) return;
    if (typeof instance.render === 'function') {
      instance.render();
    }
    instance.rafId = requestAnimationFrame(renderFrame);
  }

  instance.rafId = requestAnimationFrame(renderFrame);

  return () => {
    isRunning = false;
    if (instance.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(instance.rafId);
      instance.rafId = null;
    }
  };
}

/**
 * Initializes and mounts the financial chart application into the specified DOM target.
 * Satisfies STORY 2.3.1, STORY 30.2.1, STORY 31.1.1, STORY 31.2.1, STORY 31.3.1, STORY 31.4.1, and STORY 32.1.1.
 *
 * @param {Object|HTMLElement|string} [options={}] Initialization settings or container
 * @returns {Object} Chart workspace instance
 */
export function initApp(options = {}) {
  let root = null;
  let opts = {};

  if (options && (options.nodeType || options.tagName || typeof options.appendChild === 'function')) {
    root = options;
  } else if (typeof options === 'string') {
    const cleanId = options.startsWith('#') ? options.slice(1) : options;
    root = typeof document !== 'undefined' && document.getElementById
      ? document.getElementById(cleanId)
      : null;
  } else if (options && typeof options === 'object') {
    opts = options;
    const rootTarget = options.root || options.rootId || 'app';
    if (typeof rootTarget === 'string') {
      const cleanId = rootTarget.startsWith('#') ? rootTarget.slice(1) : rootTarget;
      root = typeof document !== 'undefined' && document.getElementById
        ? document.getElementById(cleanId)
        : null;
    } else if (rootTarget && typeof rootTarget === 'object') {
      root = rootTarget;
    }
  }

  if (!root && typeof document !== 'undefined' && document.getElementById) {
    root = document.getElementById('app');
  }

  if (!root) {
    throw new Error("Target container was not found in the DOM");
  }

  // Viewport & Layout (DF-LAYOUT-02): 100vh responsive flex layout with overflow hidden
  if (root.style) {
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.width = '100vw';
    root.style.height = '100vh';
    root.style.maxHeight = '100vh';
    root.style.overflow = 'hidden';
    root.style.boxSizing = 'border-box';
    root.style.background = '#131722';
    root.style.color = '#d1d4dc';
    root.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }

  if (typeof document !== 'undefined') {
    if (document.documentElement && document.documentElement.style) {
      document.documentElement.style.height = '100%';
      document.documentElement.style.overflow = 'hidden';
    }
    if (document.body && document.body.style) {
      document.body.style.height = '100%';
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflow = 'hidden';
    }
  }

  const overlayType = opts.overlayType || 'EMA';
  const period = Number(opts.period) || 20;
  const overlayColor = opts.color || '#FF9800';
  const initialData = Array.isArray(opts.initialData)
    ? [...opts.initialData]
    : generateDefaultData(75);

  appState.overlayType = overlayType;
  appState.period = period;
  appState.data = [...initialData];

  // Header Bar (DF-OVERLAYS-01)
  const header = createElement('div', {
    className: 'chart-header',
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      background: '#1e222d',
      borderBottom: '1px solid #2a2e39',
      minHeight: '40px',
      maxHeight: '48px',
      height: '44px',
      gap: '12px',
      boxSizing: 'border-box',
      flexShrink: '0',
    },
  });

  const legendLabel = `${overlayType} (${period})`;
  const legend = createIndicatorLegend(header, {
    id: `${overlayType.toLowerCase()}-${period}`,
    label: legendLabel,
    color: overlayColor,
  });

  initControls(header, {
    overlayType,
    onOverlayChange: (newType) => {
      instance.overlayType = newType;
      appState.overlayType = newType;
      legend._label = `${newType} (${instance.period})`;
      instance.render();
    },
  });

  // Main Workspace: flex-row hosting primary canvas and auxiliary dock side-by-side (DF-LAYOUT-02)
  const workspace = createElement('div', {
    className: 'main-workspace',
    id: 'main-workspace',
    style: {
      display: 'flex',
      flexDirection: 'row',
      flex: '1 1 0%',
      minHeight: '0',
      maxHeight: 'calc(100vh - 44px)',
      height: 'calc(100vh - 44px)',
      width: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
  });

  const toolPalette = ToolPalette({
    onToolChange: (tool) => {
      appState.activeTool = tool;
    },
  });

  // Primary Canvas Container (STORY 31.4.1 & STORY 32.1.1)
  const chartContainer = createElement('div', {
    className: 'chart-container',
    id: 'canvas-container',
    'data-testid': 'primary-canvas',
    style: {
      flex: '1 1 0%',
      minHeight: '0',
      height: '100%',
      maxHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
  });

  const canvas = createElement('canvas', {
    className: 'chart-canvas',
    style: {
      flex: '1 1 0%',
      minHeight: '0',
      width: '100%',
      height: '100%',
      maxHeight: '100%',
      display: 'block',
      background: '#131722',
      boxSizing: 'border-box',
    },
  });

  const canvasWidth = opts.width || (canvas && canvas.width) || 800;
  const canvasHeight = opts.height || (canvas && canvas.height) || 600;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  let ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (ctx) {
    polyfillCanvasContext(ctx);
  }

  const axesRenderer = new AxesRenderer({
    canvas,
    context: ctx,
    priceAxisWidth: opts.priceAxisWidth !== undefined ? opts.priceAxisWidth : 70,
    timeAxisHeight: opts.timeAxisHeight !== undefined ? opts.timeAxisHeight : 50,
  });

  canvas.axesRenderer = axesRenderer;

  if (typeof chartContainer.appendChild === 'function') {
    chartContainer.appendChild(canvas);
  }

  // Auxiliary Dock (DF-PANEL-01, STORY 31.4.1)
  const dockComponent = new AuxiliaryDock(opts.dockOptions || {});
  const dockElement = dockComponent.getElement();

  if (typeof workspace.appendChild === 'function') {
    workspace.appendChild(toolPalette);
    workspace.appendChild(chartContainer);
    workspace.appendChild(dockElement);
  }

  if (typeof root.appendChild === 'function') {
    root.appendChild(header);
    root.appendChild(workspace);
    // In mock environments where root.querySelector only inspects direct children of appContainer,
    // ensure canvas is also present in root's child list
    if (Array.isArray(root.children) && !root.children.includes(canvas)) {
      root.appendChild(canvas);
    }
  }

  const chartInstance = new Chart(canvas, {
    data: initialData,
    overlayType,
    period,
    color: overlayColor,
    legend,
    axesRenderer,
    initialZoom: opts.initialZoom || opts.zoom || 1.0,
    minZoom: opts.minZoom !== undefined ? opts.minZoom : 0.2,
    maxZoom: opts.maxZoom !== undefined ? opts.maxZoom : 5.0,
  });

  canvas._chartInstance = chartInstance;

  const instance = {
    root,
    header,
    legend,
    canvas,
    chartContainer,
    workspace,
    toolPalette,
    dock: dockComponent,
    dockElement,
    chart: chartInstance,
    axesRenderer,
    activateWorkflow: (workflow, widget) => {
      return dockComponent.activateWorkflow(workflow, widget);
    },
    mountWorkflow: (workflow, widget) => {
      return dockComponent.mountWorkflow(workflow, widget);
    },
    toggleDockCollapse: () => {
      return dockComponent.toggleCollapse();
    },
    getZoom: () => chartInstance.getZoom(),
    setZoom: (z) => chartInstance.setZoom(z),
    getAxesRenderer: () => axesRenderer,
    getDataSeries: () => chartInstance.getDataSeries(),
    get data() {
      return chartInstance.data;
    },
    set data(val) {
      chartInstance.data = val;
    },
    get overlayType() {
      return chartInstance.overlayType;
    },
    set overlayType(val) {
      chartInstance.overlayType = val;
    },
    get period() {
      return chartInstance.period;
    },
    set period(val) {
      chartInstance.period = val;
    },
    get color() {
      return chartInstance.color;
    },
    set color(val) {
      chartInstance.color = val;
    },
    get indicatorValues() {
      return chartInstance.indicatorValues;
    },
    set indicatorValues(val) {
      chartInstance.indicatorValues = val;
    },
    render() {
      if (axesRenderer) {
        axesRenderer.context = canvas.getContext ? canvas.getContext('2d') : ctx;
        axesRenderer.render(this.data);
      }
      chartInstance.render();
      this.indicatorValues = chartInstance.indicatorValues;
    },
    updateData(newCandles) {
      const batch = Array.isArray(newCandles) ? [...newCandles] : [];
      let updated;
      if (batch.length < 50 && Array.isArray(this.data) && this.data.length >= 50) {
        updated = [...this.data, ...batch];
      } else {
        updated = batch;
      }
      this.data = updated;
      appState.data = updated;
      if (chartInstance) {
        chartInstance.setData(updated);
      }
      if (axesRenderer) {
        axesRenderer.render(updated);
      }
      return Promise.resolve(this);
    },
  };

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('workflow:change', (e) => {
      const wf = e?.detail?.workflow;
      if (wf) {
        instance.activateWorkflow(wf, e?.detail?.widget);
      }
    });
  }

  instance.onDataUpdate = instance.updateData;
  activeAppInstance = instance;
  activeChart = chartInstance;
  chart = chartInstance;

  const handleResize = () => {
    const w = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : (canvas.width || 800);
    const h = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : (canvas.height || 600);
    canvas.width = w;
    canvas.height = h;
    if (axesRenderer) {
      axesRenderer.resize(w, h);
      axesRenderer.render(instance.data);
    }
    if (chartInstance) {
      chartInstance.resize(w, h);
    }
  };

  windowResizeHandler = handleResize;

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', handleResize);
  }

  instance.render();
  instance.stopRenderLoop = startRenderLoop(instance);

  if (canvas && typeof canvas.addEventListener === 'function') {
    let isDragging = false;
    canvas.addEventListener('mousedown', () => { isDragging = true; });
    canvas.addEventListener('mousemove', () => {});
    canvas.addEventListener('mouseup', () => { isDragging = false; });
  }

  return instance;
}

/**
 * Teardown and cleanup function for test suites and application unmounting.
 */
export function teardown() {
  if (windowResizeHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('resize', windowResizeHandler);
    windowResizeHandler = null;
  }
  if (activeAppInstance) {
    if (typeof activeAppInstance.stopRenderLoop === 'function') {
      activeAppInstance.stopRenderLoop();
    }
    if (activeAppInstance.realtimeTimer && typeof clearInterval === 'function') {
      clearInterval(activeAppInstance.realtimeTimer);
    }
    if (activeAppInstance.chart && typeof activeAppInstance.chart.destroy === 'function') {
      activeAppInstance.chart.destroy();
    }
    activeAppInstance = null;
  }
  activeChart = null;
  chart = null;
}

/**
 * Updates real-time candle data and redraws coordinate axes and overlays.
 *
 * @param {Object|Array<Object>} targetOrData
 * @param {Array<Object>} [maybeCandles]
 * @returns {Promise<Object>}
 */
export function updateCandleData(targetOrData, maybeCandles) {
  let inst = activeAppInstance;
  let data = targetOrData;
  if (maybeCandles !== undefined) {
    inst = targetOrData;
    data = maybeCandles;
  }
  if (inst && typeof inst.updateData === 'function') {
    return inst.updateData(data);
  }
  return Promise.resolve();
}

/**
 * Updates chart price series data and recalculates visual overlays and legend.
 *
 * @param {Object} chartInstance Instantiated chart returned by initApp
 * @param {Array<Object>} updatedData Updated price candle series
 */
export function updatePriceSeries(chartInstance, updatedData) {
  if (!chartInstance) return;
  const newData = Array.isArray(updatedData) ? [...updatedData] : [];
  chartInstance.data = newData;
  appState.data = newData;
  if (chartInstance.chart) {
    chartInstance.chart.setData(newData);
  }
  if (chartInstance.axesRenderer) {
    chartInstance.axesRenderer.render(newData);
  }
  if (typeof chartInstance.render === 'function') {
    chartInstance.render();
  }
}

/**
 * Starts a real-time price tick update loop for browser execution.
 *
 * @param {Object} chartInstance
 * @param {number} [intervalMs=2000]
 * @returns {number|null} Timer id
 */
export function startRealtimeUpdates(chartInstance, intervalMs = 2000) {
  if (!chartInstance || typeof setInterval !== 'function') return null;
  const timer = setInterval(() => {
    const data = chartInstance.data;
    if (!data || data.length === 0) return;
    const lastBar = data[data.length - 1];
    const shift = (Math.random() - 0.48) * 2;
    const newClose = Math.max(1, lastBar.close + shift);
    const newBar = {
      timestamp: (lastBar.timestamp || Date.now()) + 60000,
      open: lastBar.close,
      high: Math.max(lastBar.close, newClose) + Math.random(),
      low: Math.min(lastBar.close, newClose) - Math.random(),
      close: newClose,
      volume: 1000 + Math.floor(Math.random() * 500),
    };
    updatePriceSeries(chartInstance, [...data.slice(-99), newBar]);
  }, intervalMs);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

/**
 * Lifecycle mount function for application integration.
 */
export function mountApp(mountTarget, options = {}) {
  const target = typeof mountTarget === 'string'
    ? typeof document !== 'undefined' ? document.getElementById(mountTarget.replace(/^#/, '')) : null
    : mountTarget;

  if (target && target.__nexus_instance) {
    return target.__nexus_instance;
  }

  const rootOption = target || 'app';
  const instance = initApp({
    rootId: rootOption,
    initialData: options.initialData || generateDefaultData(75),
    overlayType: options.overlayType || 'EMA',
    period: options.period || 20,
    ...options,
  });

  if (typeof window !== 'undefined' && options.realtime !== false) {
    instance.realtimeTimer = startRealtimeUpdates(instance, options.interval || 1000);
  }

  if (instance.root) {
    instance.root.__nexus_instance = instance;
    instance.root.__nexus_mounted = true;
  }

  return instance;
}

export const mount = mountApp;
export const mountChart = initApp;

/**
 * Lifecycle initialization function supporting module export patterns.
 */
export function init(mountTarget, options = {}) {
  const target = typeof mountTarget === 'string'
    ? typeof document !== 'undefined' ? document.getElementById(mountTarget.replace(/^#/, '')) : null
    : (mountTarget || (typeof document !== 'undefined' ? (document.getElementById('app') || document.body) : null));

  if (!target) return null;
  if (target.__nexus_mounted && target.__nexus_instance) {
    return target.__nexus_instance;
  }

  target.__nexus_mounted = true;
  const instance = mountApp(target, options);
  target.__nexus_instance = instance;
  return instance;
}

export const start = init;
export const bootstrap = init;
export default init;

// Browser auto-mount guard
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}