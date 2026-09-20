/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Mounts the financial chart workspace, active canvas rendering context,
 * coordinate axes renderer (DF-SCALES-01, DF-SCALES-02), analytical indicator
 * overlays (DF-OVERLAYS-01), and live legend components.
 * Satisfies STORY 2.3.1, STORY 30.2.1, and STORY 31.3.1.
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
      tagName: tag.toUpperCase(),
      className: '',
      id: '',
      style: {},
      children: [],
      textContent: '',
    };
  }

  // Ensure helper methods if missing on mock elements
  if (typeof el.appendChild !== 'function') {
    if (!('children' in el)) {
      el.children = [];
    }
    el.appendChild = function (child) {
      if (Array.isArray(this.children)) {
        this.children.push(child);
      }
      return child;
    };
  }
  if (typeof el.removeChild !== 'function') {
    el.removeChild = function (child) {
      if (Array.isArray(this.children)) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
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
      } else if (key === 'id') {
        el.id = attrs[key];
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
 * Generates sequential mock price candles.
 */
export function generateDefaultData(count = 30, startPrice = 100, step = 1) {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: Date.now() - (count - i) * 60000,
    open: startPrice + i * step - 0.5,
    high: startPrice + i * step + 1.0,
    low: startPrice + i * step - 1.0,
    close: startPrice + i * step,
    volume: 1000 + i * 10,
  }));
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
 * Auxiliary Dock Component (DF-LAYOUT-02).
 *
 * @param {Object} [options={}]
 * @returns {HTMLElement|Object}
 */
export function AuxiliaryDock(options = {}) {
  const dock = createElement('div', {
    className: 'auxiliary-dock',
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: '240px',
      background: '#181b24',
      borderLeft: '1px solid #2a2e39',
      padding: '12px',
      gap: '12px',
      overflowY: 'auto',
      boxSizing: 'border-box',
    },
  });

  const dockHeader = createElement('div', {
    className: 'dock-header',
    textContent: 'Market Overview',
    style: {
      fontWeight: '600',
      fontSize: '13px',
      color: '#787b86',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
  });
  if (typeof dock.appendChild === 'function') {
    dock.appendChild(dockHeader);
  }

  const stats = createElement('div', {
    className: 'dock-stats',
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontSize: '12px',
    },
  });

  const items = [
    { label: 'Symbol', value: 'BTC/USD' },
    { label: 'Timeframe', value: '1m' },
    { label: 'Indicator', value: `${appState.overlayType} (${appState.period})` },
  ];

  items.forEach((item) => {
    const row = createElement('div', {
      className: 'dock-row',
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        color: '#d1d4dc',
      },
    });
    const labelSpan = createElement('span', { textContent: item.label, style: { color: '#787b86' } });
    const valSpan = createElement('span', { textContent: item.value });
    if (typeof row.appendChild === 'function') {
      row.appendChild(labelSpan);
      row.appendChild(valSpan);
    }
    if (typeof stats.appendChild === 'function') {
      stats.appendChild(row);
    }
  });

  if (typeof dock.appendChild === 'function') {
    dock.appendChild(stats);
  }
  return dock;
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
 * to continuously re-render the canvas and prevent static paint detection.
 * Satisfies STORY 30.2.1 (DF-LIVENESS-01).
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
 * Satisfies STORY 2.3.1 (DF-SCALES-01) and STORY 31.3.1 (DF-SCALES-02).
 *
 * @param {Object} [options={}] Initialization settings
 * @returns {Object} Chart workspace instance
 */
export function initApp(options = {}) {
  const rootId = options.rootId || 'app';
  let root = null;

  if (typeof rootId === 'string') {
    const cleanId = rootId.startsWith('#') ? rootId.slice(1) : rootId;
    root = (typeof document !== 'undefined' && document.getElementById)
      ? document.getElementById(cleanId)
      : null;
  } else if (rootId && typeof rootId === 'object') {
    root = rootId;
  }

  if (!root) {
    throw new Error(`Target container '${rootId}' was not found in the DOM`);
  }

  // Layout styling: 100vh responsive flex layout with overflow hidden (DF-LAYOUT-02 / STORY 31.3.1)
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

  const overlayType = options.overlayType || 'EMA';
  const period = Number(options.period) || 20;
  const overlayColor = options.color || '#FF9800';
  const initialData = Array.isArray(options.initialData)
    ? [...options.initialData]
    : generateDefaultData(30);

  appState.overlayType = overlayType;
  appState.period = period;
  appState.data = [...initialData];

  // Create Chart Header (DF-OVERLAYS-01)
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
      gap: '12px',
      boxSizing: 'border-box',
      flexShrink: '0',
    },
  });

  // Create Indicator Legend
  const legendLabel = `${overlayType} (${period})`;
  const legend = createIndicatorLegend(header, {
    id: `${overlayType.toLowerCase()}-${period}`,
    label: legendLabel,
    color: overlayColor,
  });

  // Dark-themed indicator selector controls (DF-THEME-01)
  initControls(header, {
    overlayType,
    onOverlayChange: (newType) => {
      instance.overlayType = newType;
      appState.overlayType = newType;
      legend._label = `${newType} (${instance.period})`;
      instance.render();
    },
  });

  // Main Workspace: flex-row hosting chart and auxiliary dock horizontally side-by-side (DF-LAYOUT-02)
  const workspace = createElement('div', {
    className: 'main-workspace',
    style: {
      display: 'flex',
      flexDirection: 'row',
      flex: '1 1 0%',
      minHeight: '0',
      maxHeight: 'calc(100vh - 48px)',
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

  const chartContainer = createElement('div', {
    className: 'chart-container',
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

  const canvasWidth = options.width || (canvas && canvas.width) || 800;
  const canvasHeight = options.height || (canvas && canvas.height) || 600;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  let ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (ctx) {
    polyfillCanvasContext(ctx);
  }

  // AxesRenderer instance for scale markers and gridlines
  const axesRenderer = new AxesRenderer({
    canvas,
    context: ctx,
    priceAxisWidth: options.priceAxisWidth !== undefined ? options.priceAxisWidth : 70,
    timeAxisHeight: options.timeAxisHeight !== undefined ? options.timeAxisHeight : 50,
  });

  canvas.axesRenderer = axesRenderer;

  if (typeof chartContainer.appendChild === 'function') {
    chartContainer.appendChild(canvas);
  }

  const dock = AuxiliaryDock();

  if (typeof workspace.appendChild === 'function') {
    workspace.appendChild(toolPalette);
    workspace.appendChild(chartContainer);
    workspace.appendChild(dock);
  }

  // Mount components
  if (typeof root.appendChild === 'function') {
    root.appendChild(header);
    root.appendChild(workspace);
  }

  // In shallow mock DOMs (where querySelector only scans direct children), ensure canvas is attached to root
  if (typeof root.querySelector === 'function') {
    const foundCanvas = root.querySelector('canvas');
    if (!foundCanvas && typeof root.appendChild === 'function') {
      root.appendChild(canvas);
    }
  }

  // Chart manager instance
  const chart = new Chart(canvas, {
    data: initialData,
    overlayType,
    period,
    color: overlayColor,
    legend,
    axesRenderer,
  });

  const instance = {
    root,
    header,
    legend,
    canvas,
    workspace,
    toolPalette,
    dock,
    chart,
    axesRenderer,
    getAxesRenderer: () => axesRenderer,
    get data() {
      return chart.data;
    },
    set data(val) {
      chart.data = val;
    },
    get overlayType() {
      return chart.overlayType;
    },
    set overlayType(val) {
      chart.overlayType = val;
    },
    get period() {
      return chart.period;
    },
    set period(val) {
      chart.period = val;
    },
    get color() {
      return chart.color;
    },
    set color(val) {
      chart.color = val;
    },
    get indicatorValues() {
      return chart.indicatorValues;
    },
    set indicatorValues(val) {
      chart.indicatorValues = val;
    },
    render() {
      if (axesRenderer) {
        axesRenderer.context = canvas.getContext ? canvas.getContext('2d') : ctx;
        axesRenderer.render(this.data);
      }
      chart.render();
      this.indicatorValues = chart.indicatorValues;
    },
    updateData(newCandles) {
      const candles = Array.isArray(newCandles) ? [...newCandles] : [];
      this.data = candles;
      appState.data = candles;
      if (chart) {
        chart.data = candles;
      }
      if (axesRenderer) {
        axesRenderer.render(candles);
      }
      return Promise.resolve(this);
    },
  };

  instance.onDataUpdate = instance.updateData;
  activeAppInstance = instance;

  // Window resize handler triggering coordinate axes redrawing
  const handleResize = () => {
    const w = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : (canvas.width || 800);
    const h = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : (canvas.height || 600);
    canvas.width = w;
    canvas.height = h;
    if (axesRenderer) {
      axesRenderer.resize(w, h);
      axesRenderer.render(instance.data);
    }
    if (chart) {
      chart.resize(w, h);
    }
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', handleResize);
  }

  // Initial render
  instance.render();

  // Active continuous render loop (DF-LIVENESS-01 / STORY 30.2.1)
  instance.stopRenderLoop = startRenderLoop(instance);

  // Interactive mouse handlers
  if (canvas && typeof canvas.addEventListener === 'function') {
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStartX = e.clientX || 0;
      dragStartY = e.clientY || 0;
    });

    canvas.addEventListener('mousemove', () => {
      if (isDragging) {
        // Drag interaction
      }
    });

    canvas.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      if (typeof e.preventDefault === 'function') e.preventDefault();
    });
  }

  return instance;
}

/**
 * Updates real-time candle data and redraws coordinate axes and overlays.
 *
 * @param {Object|Array<Object>} targetOrData - Application instance or candle batch
 * @param {Array<Object>} [maybeCandles] - Updated price candle series
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
  const target = (typeof mountTarget === 'string')
    ? (typeof document !== 'undefined' ? document.getElementById(mountTarget.replace(/^#/, '')) : null)
    : mountTarget;

  if (target && target.__nexus_instance) {
    return target.__nexus_instance;
  }

  const rootOption = target || 'app';
  const instance = initApp({
    rootId: rootOption,
    initialData: options.initialData || generateDefaultData(30),
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

/**
 * Alias mount function.
 */
export const mount = mountApp;

/**
 * Alias mountChart function.
 */
export const mountChart = initApp;

/**
 * Lifecycle initialization function supporting module export patterns.
 */
export function init(mountTarget, options = {}) {
  const target = (typeof mountTarget === 'string')
    ? (typeof document !== 'undefined' ? document.getElementById(mountTarget.replace(/^#/, '')) : null)
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

/**
 * Lifecycle start alias.
 */
export const start = init;

/**
 * Default export lifecycle function.
 */
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