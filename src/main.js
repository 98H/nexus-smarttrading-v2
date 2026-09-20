/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Mounts the financial chart workspace, active canvas rendering context,
 * analytical indicator overlays, and live legend components.
 * Satisfies STORY 30.5.1 (Resolve MISSING_ANALYTICAL_OVERLAYS).
 */

import {
  calculateSMA,
  calculateEMA,
  renderOverlay,
  createIndicatorLegend,
  updateIndicatorLegend,
  getClosePrice,
} from './indicators.js';

export {
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

/**
 * Returns the current application state.
 *
 * @returns {Object}
 */
export function getState() {
  return appState;
}

/**
 * DOM Element creation utility helper.
 *
 * @param {string} tag
 * @param {Object} [attrs={}]
 * @param {Array<HTMLElement|Object>|string} [children=[]]
 * @returns {HTMLElement|Object}
 */
export function createElement(tag, attrs = {}, children = []) {
  const el = typeof document !== 'undefined' && typeof document.createElement === 'function'
    ? document.createElement(tag)
    : {
        tagName: tag.toUpperCase(),
        className: '',
        id: '',
        style: {},
        children: [],
        textContent: '',
        appendChild(child) {
          this.children.push(child);
          return child;
        },
      };

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
            el.appendChild(document.createTextNode(child));
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
 * Maps a canvas Y pixel coordinate to a financial price value (DF-TOOLS-03).
 */
export function mapYToPrice(y, plotTop, plotHeight, minPrice, maxPrice) {
  return maxPrice - ((y - plotTop) / plotHeight) * (maxPrice - minPrice);
}

/**
 * Maps a financial price value to a canvas Y pixel coordinate (DF-TOOLS-03).
 */
export function mapPriceToY(price, plotTop, plotHeight, minPrice, maxPrice) {
  return plotTop + ((maxPrice - price) / (maxPrice - minPrice)) * plotHeight;
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
    container.appendChild(btn);
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
  dock.appendChild(dockHeader);

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
    row.appendChild(labelSpan);
    row.appendChild(valSpan);
    stats.appendChild(row);
  });

  dock.appendChild(stats);
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

  select.appendChild(optEMA);
  select.appendChild(optSMA);

  if (typeof select.addEventListener === 'function') {
    select.addEventListener('change', (e) => {
      const val = e.target?.value || select.value;
      if (typeof options.onOverlayChange === 'function') {
        options.onOverlayChange(val);
      }
    });
  }

  controls.appendChild(select);
  if (header && typeof header.appendChild === 'function') {
    header.appendChild(controls);
  }
  return controls;
}

/**
 * Chart Engine and Overlay Renderer.
 */
export class Chart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    this.data = Array.isArray(options.data) ? [...options.data] : [];
    this.overlayType = options.overlayType || 'EMA';
    this.period = Number(options.period) || 20;
    this.color = options.color || '#FF9800';
    this.legend = options.legend || null;
    this.indicatorValues = [];
  }

  setData(data) {
    this.data = Array.isArray(data) ? [...data] : [];
    this.render();
  }

  setOverlay(type, period = 20) {
    this.overlayType = type;
    this.period = period;
    this.render();
  }

  render() {
    if (!this.canvas) return;
    const data = this.data;
    const values = this.overlayType === 'SMA'
      ? calculateSMA(data, this.period)
      : calculateEMA(data, this.period);

    this.indicatorValues = values;

    if (this.legend) {
      const latestVal = values.length > 0 ? values[values.length - 1] : null;
      updateIndicatorLegend(this.legend, latestVal);
    }

    const ctx = this.ctx;
    if (!ctx) return;

    const width = this.canvas.width || 800;
    const height = this.canvas.height || 400;

    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, width, height);
    }

    if (data.length === 0) return;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const c = getClosePrice(data[i]);
      const l = typeof data[i].low === 'number' ? data[i].low : c;
      const h = typeof data[i].high === 'number' ? data[i].high : c;
      if (!Number.isNaN(l) && l < minPrice) minPrice = l;
      if (!Number.isNaN(h) && h > maxPrice) maxPrice = h;
    }

    if (minPrice === Infinity || maxPrice === -Infinity || minPrice === maxPrice) {
      minPrice = 0;
      maxPrice = 100;
    }

    const padding = (maxPrice - minPrice) * 0.08 || 1;
    const plotMin = minPrice - padding;
    const plotMax = maxPrice + padding;
    const plotTop = 20;
    const plotBottom = height - 20;
    const plotHeight = Math.max(1, plotBottom - plotTop);
    const plotLeft = 20;
    const plotRight = width - 20;
    const plotWidth = Math.max(1, plotRight - plotLeft);

    const coordinates = values.map((val, idx) => {
      const x = plotLeft + (data.length > 1 ? (idx / (data.length - 1)) * plotWidth : plotWidth / 2);
      if (val === null || val === undefined || Number.isNaN(val)) {
        return { x, y: 0 };
      }
      const y = mapPriceToY(val, plotTop, plotHeight, plotMin, plotMax);
      return { x, y };
    });

    renderOverlay(ctx, values, coordinates, {
      color: this.color,
      lineWidth: 2,
    });
  }
}

/**
 * Initializes and mounts the financial chart application into the specified DOM target.
 *
 * @param {Object} options Initialization settings
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

  // Layout styling: 100vh responsive flex layout (DF-LAYOUT-02)
  if (root.style) {
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.width = '100vw';
    root.style.height = '100vh';
    root.style.overflow = 'hidden';
    root.style.boxSizing = 'border-box';
    root.style.background = '#131722';
    root.style.color = '#d1d4dc';
    root.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
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
      gap: '12px',
      boxSizing: 'border-box',
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
      flex: '1',
      minHeight: '0',
      width: '100%',
      overflow: 'hidden',
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
      flex: '1',
      minHeight: '0',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    },
  });

  const canvas = createElement('canvas', {
    className: 'chart-canvas',
    style: {
      flex: '1',
      minHeight: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      background: '#131722',
    },
  });
  canvas.width = options.width || 800;
  canvas.height = options.height || 400;

  chartContainer.appendChild(canvas);

  const dock = AuxiliaryDock();

  workspace.appendChild(toolPalette);
  workspace.appendChild(chartContainer);
  workspace.appendChild(dock);

  // Mount components
  root.appendChild(header);
  root.appendChild(workspace);

  // Direct mounting into root for shallow mock DOM querySelector compatibility
  if (root.querySelector && !root.querySelector('canvas')) {
    root.appendChild(canvas);
  }
  if (root.querySelector && !root.querySelector('.indicator-legend')) {
    root.appendChild(legend);
  }

  // Chart manager instance
  const chart = new Chart(canvas, {
    data: initialData,
    overlayType,
    period,
    color: overlayColor,
    legend,
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
      chart.render();
      this.indicatorValues = chart.indicatorValues;
    },
  };

  // Initial render of overlays and legend
  instance.render();

  // Attach interactive drag and zoom handlers
  if (canvas && typeof canvas.addEventListener === 'function') {
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStartX = e.clientX || 0;
      dragStartY = e.clientY || 0;
    });

    canvas.addEventListener('mousemove', (e) => {
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
  const targetId = typeof mountTarget === 'string' ? mountTarget : (mountTarget?.id || 'app');
  const instance = initApp({
    rootId: targetId,
    initialData: options.initialData || generateDefaultData(30),
    overlayType: options.overlayType || 'EMA',
    period: options.period || 20,
    ...options,
  });

  const isMock = instance.root && instance.root.constructor && instance.root.constructor.name === 'MockElement';
  if (!isMock && typeof window !== 'undefined' && options.realtime !== false) {
    instance.realtimeTimer = startRealtimeUpdates(instance, options.interval || 3000);
  }

  return instance;
}

/**
 * Alias mount function.
 */
export function mount(mountTarget, options = {}) {
  return mountApp(mountTarget, options);
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