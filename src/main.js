/**
 * SmartTrading-V2 — Application Entrypoint
 * Mounts interactive candlestick chart with integrated coordinate axes,
 * dynamic gridlines, scale labels, and real-time data ticks to the DOM.
 */

import {
  Chart,
  renderChart,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  formatTimestamp,
  computeCandleRanges,
  AxesRenderer,
  computeRanges,
  generateDefaultCandles,
} from './chart.js';

export {
  Chart,
  renderChart,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  formatTimestamp,
  computeCandleRanges,
  AxesRenderer,
  computeRanges,
  generateDefaultCandles,
};

/**
 * Builds the top navigation header containing app branding, ticker selector, and timeframe controls.
 *
 * @param {Document} doc
 * @param {Object} [options={}]
 * @returns {HTMLElement}
 */
function createHeader(doc, options = {}) {
  const header = doc.createElement('header');
  header.className = 'app-header header top-nav';
  header.setAttribute('data-testid', 'app-header');

  const title = doc.createElement('h1');
  title.className = 'app-title title';
  title.setAttribute('data-testid', 'app-title');
  title.textContent = options.title || 'SmartTrading';
  header.appendChild(title);

  const tickerSelect = doc.createElement('select');
  tickerSelect.className = 'ticker-control ticker';
  tickerSelect.setAttribute('data-testid', 'ticker-select');
  tickerSelect.setAttribute('name', 'ticker');

  const tickers = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AAPL', 'MSFT'];
  tickers.forEach((t) => {
    const opt = doc.createElement('option');
    opt.setAttribute('value', t);
    opt.textContent = t;
    tickerSelect.appendChild(opt);
  });
  tickerSelect.value = options.ticker || 'BTC-USD';
  header.appendChild(tickerSelect);

  const timeframeControls = doc.createElement('div');
  timeframeControls.className = 'timeframe-controls';
  timeframeControls.setAttribute('data-testid', 'timeframe-controls');

  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
  timeframes.forEach((tf) => {
    const btn = doc.createElement('button');
    btn.className = 'timeframe-btn';
    btn.setAttribute('data-timeframe', tf);
    btn.textContent = tf;
    timeframeControls.appendChild(btn);
  });
  header.appendChild(timeframeControls);

  return header;
}

/**
 * Builds the workspace container hosting auxiliary tools panel, chart canvas, and orders panel.
 *
 * @param {Document} doc
 * @returns {{workspace: HTMLElement, toolsPanel: HTMLElement, canvas: HTMLElement, ordersPanel: HTMLElement}}
 */
function createWorkspace(doc) {
  const workspace = doc.createElement('main');
  workspace.className = 'workspace workspace-container';
  workspace.setAttribute('data-testid', 'workspace');

  const toolsPanel = doc.createElement('aside');
  toolsPanel.className = 'tools-panel side-panel side-panel-tools tools';
  toolsPanel.setAttribute('data-testid', 'tools-panel');
  workspace.appendChild(toolsPanel);

  const canvas = doc.createElement('canvas');
  canvas.className = 'chart-canvas';
  canvas.setAttribute('data-testid', 'chart-canvas');
  workspace.appendChild(canvas);

  const ordersPanel = doc.createElement('aside');
  ordersPanel.className = 'orders-panel side-panel side-panel-orders orders';
  ordersPanel.setAttribute('data-testid', 'orders-panel');
  workspace.appendChild(ordersPanel);

  return { workspace, toolsPanel, canvas, ordersPanel };
}

/**
 * Mounts the candlestick chart application to the specified DOM container.
 *
 * @param {HTMLElement|string} [container] - Mount container or selector (defaults to #app or body)
 * @param {Object} [options={}] - Custom configuration options for chart and axes
 * @returns {Chart|null}
 */
export function mountApp(container, options = {}) {
  let target = container;
  let opts = options || {};

  if (
    container &&
    typeof container === 'object' &&
    !container.tagName &&
    !container.nodeType &&
    typeof container.appendChild !== 'function'
  ) {
    opts = container;
    target = null;
  }

  if (typeof target === 'string' && typeof document !== 'undefined') {
    target = document.querySelector(target);
  }

  if (!target && typeof document !== 'undefined') {
    target = document.getElementById('app') || document.body;
  }

  if (!target) return null;

  // Preserve existing mounted chart instance if already attached to container
  if (target.__chart && target.querySelector && target.querySelector('canvas')) {
    if (opts && (opts.candles || opts.data)) {
      target.__chart.setData(opts.candles || opts.data);
    } else {
      target.__chart.render();
    }
    return target.__chart;
  }

  // Handle direct canvas mount target
  if (target.tagName === 'CANVAS') {
    const width = (opts && opts.width) || target.width || 800;
    const height = (opts && opts.height) || target.height || 600;
    if (target.width === undefined || target.width === 0) target.width = width;
    if (target.height === undefined || target.height === 0) target.height = height;

    const chart = new Chart(target, {
      width,
      height,
      priceScaleWidth: opts.priceScaleWidth !== undefined ? opts.priceScaleWidth : 60,
      timeScaleHeight: opts.timeScaleHeight !== undefined ? opts.timeScaleHeight : 30,
      candles: (opts && (opts.candles || opts.data)) || generateDefaultCandles(60),
      ticker: (opts && opts.ticker) || 'BTC-USD',
      timeframe: (opts && opts.timeframe) || '1h',
      ...opts,
    });

    target.__chart = chart;
    if (chart && typeof chart.start === 'function' && opts.autoTick !== false) {
      chart.start(opts.interval);
    }
    return chart;
  }

  const doc = target.ownerDocument || (typeof document !== 'undefined' ? document : null);

  // 1. Semantic top navigation header
  let header = target.querySelector ? target.querySelector('header') : null;
  if (!header && doc && typeof doc.createElement === 'function') {
    header = createHeader(doc, opts);
    if (typeof target.appendChild === 'function') {
      target.appendChild(header);
    }
  }

  // 2. Structured workspace container
  let workspace = target.querySelector
    ? (target.querySelector('[data-testid="workspace"]') ||
       target.querySelector('.workspace-container') ||
       target.querySelector('.workspace') ||
       target.querySelector('main'))
    : null;

  if (!workspace && doc && typeof doc.createElement === 'function') {
    const created = createWorkspace(doc);
    workspace = created.workspace;
    if (typeof target.appendChild === 'function') {
      target.appendChild(workspace);
    }
  }

  // 3. Ensure auxiliary panels and canvas exist inside workspace
  let toolsPanel = workspace && workspace.querySelector
    ? (workspace.querySelector('[data-testid="tools-panel"]') ||
       workspace.querySelector('.tools-panel') ||
       workspace.querySelector('aside.tools') ||
       workspace.querySelector('.side-panel-tools'))
    : null;

  if (!toolsPanel && workspace && doc && typeof doc.createElement === 'function') {
    toolsPanel = doc.createElement('aside');
    toolsPanel.className = 'tools-panel side-panel side-panel-tools tools';
    toolsPanel.setAttribute('data-testid', 'tools-panel');
    workspace.appendChild(toolsPanel);
  }

  let canvas = workspace && workspace.querySelector
    ? (workspace.querySelector('canvas') || workspace.querySelector('[data-testid="chart-canvas"]'))
    : null;

  // Reparent canvas if it was prematurely attached to target
  if (!canvas && target.querySelector && target.querySelector('canvas')) {
    canvas = target.querySelector('canvas');
    if (workspace && canvas.parentElement !== workspace) {
      workspace.appendChild(canvas);
    }
  }

  if (!canvas && workspace && doc && typeof doc.createElement === 'function') {
    canvas = doc.createElement('canvas');
    canvas.className = 'chart-canvas';
    canvas.setAttribute('data-testid', 'chart-canvas');
    workspace.appendChild(canvas);
  }

  let ordersPanel = workspace && workspace.querySelector
    ? (workspace.querySelector('[data-testid="orders-panel"]') ||
       workspace.querySelector('.orders-panel') ||
       workspace.querySelector('aside.orders') ||
       workspace.querySelector('.side-panel-orders'))
    : null;

  if (!ordersPanel && workspace && doc && typeof doc.createElement === 'function') {
    ordersPanel = doc.createElement('aside');
    ordersPanel.className = 'orders-panel side-panel side-panel-orders orders';
    ordersPanel.setAttribute('data-testid', 'orders-panel');
    workspace.appendChild(ordersPanel);
  }

  const width =
    (opts && opts.width) ||
    (canvas && canvas.width) ||
    (workspace && workspace.clientWidth) ||
    (target && target.clientWidth) ||
    800;
  const height =
    (opts && opts.height) ||
    (canvas && canvas.height) ||
    (workspace && workspace.clientHeight) ||
    (target && target.clientHeight) ||
    600;

  if (canvas) {
    if (canvas.width === undefined || canvas.width === 0) canvas.width = width;
    if (canvas.height === undefined || canvas.height === 0) canvas.height = height;
  }

  const chart = new Chart(canvas || workspace || target, {
    width,
    height,
    priceScaleWidth: (opts && opts.priceScaleWidth) !== undefined ? opts.priceScaleWidth : 60,
    timeScaleHeight: (opts && opts.timeScaleHeight) !== undefined ? opts.timeScaleHeight : 30,
    candles: (opts && (opts.candles || opts.data)) || generateDefaultCandles(60),
    ticker: (opts && opts.ticker) || 'BTC-USD',
    timeframe: (opts && opts.timeframe) || '1h',
    ...opts,
  });

  if (target) {
    target.__chart = chart;
  }
  if (workspace) {
    workspace.__chart = chart;
  }

  // Interactive controls event binding
  const tickerControl = header ? (header.querySelector('[data-testid="ticker-select"]') || header.querySelector('select')) : null;
  if (tickerControl && typeof tickerControl.addEventListener === 'function') {
    tickerControl.addEventListener('change', (e) => {
      const val = (e && e.target && e.target.value) || tickerControl.value;
      if (val && chart && typeof chart.setTicker === 'function') {
        chart.setTicker(val);
      }
    });
  }

  const timeframeControls = header ? (header.querySelector('[data-testid="timeframe-controls"]') || header.querySelector('.timeframe-controls')) : null;
  if (timeframeControls && typeof timeframeControls.addEventListener === 'function') {
    timeframeControls.addEventListener('click', (e) => {
      const btn =
        (e && e.target && (e.target.dataset?.timeframe ? e.target : (e.target.closest && e.target.closest('[data-timeframe]')))) ||
        null;
      const tf =
        (btn && btn.dataset && btn.dataset.timeframe) ||
        (btn && typeof btn.getAttribute === 'function' && btn.getAttribute('data-timeframe'));
      if (tf && chart && typeof chart.setTimeframe === 'function') {
        chart.setTimeframe(tf);
      }
    });
  }

  // Window resize handler ensuring structural hierarchy remains anchored
  if (!target.__resizeHandler && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    target.__resizeHandler = () => {
      if (chart && typeof chart.resize === 'function') {
        const w = (workspace && workspace.clientWidth) || (window && window.innerWidth) || (canvas && canvas.width) || 800;
        const h = (workspace && workspace.clientHeight) || (window && window.innerHeight ? Math.max(300, window.innerHeight - 80) : (canvas && canvas.height)) || 600;
        chart.resize((canvas && canvas.width) || w, (canvas && canvas.height) || h);
      }
    };
    window.addEventListener('resize', target.__resizeHandler);
  }

  if (chart && typeof chart.start === 'function' && (!opts || opts.autoTick !== false)) {
    chart.start(opts && opts.interval);
  }

  return chart;
}

/**
 * Initializes chart application entrypoint and mounts into target.
 *
 * @param {HTMLElement|string} [container]
 * @param {Object} [options={}]
 * @returns {Chart|null}
 */
export function initApp(container, options = {}) {
  return mountApp(container, options);
}

/**
 * Canonical mount alias.
 *
 * @param {HTMLElement|string} [container]
 * @param {Object} [options={}]
 * @returns {Chart|null}
 */
export function mount(container, options = {}) {
  return mountApp(container, options);
}

/**
 * Canonical init alias.
 *
 * @param {HTMLElement|string} [container]
 * @param {Object} [options={}]
 * @returns {Chart|null}
 */
export function init(container, options = {}) {
  return mountApp(container, options);
}

export default initApp;

// CRITICAL ENTRYPOINT AUTO-MOUNT INVARIANT
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}