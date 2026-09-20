/**
 * SmartTrading-V2 — Application Entrypoint
 * Mounts interactive candlestick chart with integrated coordinate axes,
 * responsive canvas panning gestures, and dynamic DOM controls.
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
import { ChartCanvas } from './canvas.js';

export {
  Chart,
  ChartCanvas,
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

  const liveBadge = doc.createElement('span');
  liveBadge.className = 'live-indicator live-status';
  liveBadge.setAttribute('data-testid', 'live-status');
  liveBadge.textContent = '● LIVE';
  header.appendChild(liveBadge);

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
 * Builds workspace auxiliary panels when running in a full DOM environment.
 *
 * @param {Document} doc
 * @returns {{workspace: HTMLElement, toolsPanel: HTMLElement, ordersPanel: HTMLElement}}
 */
function createAuxiliaryWorkspace(doc) {
  const workspace = doc.createElement('main');
  workspace.className = 'workspace workspace-container';
  workspace.setAttribute('data-testid', 'workspace');

  const toolsPanel = doc.createElement('aside');
  toolsPanel.className = 'tools-panel side-panel side-panel-tools tools';
  toolsPanel.setAttribute('data-testid', 'tools-panel');
  workspace.appendChild(toolsPanel);

  const ordersPanel = doc.createElement('aside');
  ordersPanel.className = 'orders-panel side-panel side-panel-orders orders';
  ordersPanel.setAttribute('data-testid', 'orders-panel');
  workspace.appendChild(ordersPanel);

  return { workspace, toolsPanel, ordersPanel };
}

/**
 * Mounts the candlestick chart application and canvas pan controller to the DOM container.
 *
 * @param {HTMLElement|string} [container] - Mount container or selector (defaults to #app or body)
 * @param {Object} [options={}] - Custom configuration options
 * @returns {Object|null} Application runtime instance
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

  if (target.__appInstance && target.querySelector && target.querySelector('canvas')) {
    if (target.__appInstance.chart && typeof target.__appInstance.chart.startAnimationLoop === 'function') {
      target.__appInstance.chart.startAnimationLoop();
    }
    return target.__appInstance;
  }

  const doc = target.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const isFullDom =
    doc &&
    typeof doc.createElement === 'function' &&
    typeof doc.createElement('div').setAttribute === 'function';

  // Resolve or mount the target canvas element
  let canvas =
    target.tagName === 'CANVAS'
      ? target
      : target.querySelector
      ? target.querySelector('canvas')
      : null;

  if (!canvas && doc && typeof doc.createElement === 'function') {
    canvas = doc.createElement('canvas');
    if (typeof canvas.setAttribute === 'function') {
      canvas.setAttribute('data-testid', 'chart-canvas');
    }
    canvas.className = 'chart-canvas';
    canvas.id = 'chart-canvas';

    const width = (opts && opts.width) || (target.clientWidth) || 800;
    const height = (opts && opts.height) || (target.clientHeight) || 600;
    canvas.width = width;
    canvas.height = height;

    if (typeof target.appendChild === 'function') {
      target.appendChild(canvas);
    }
  }

  // Assemble full UI chrome only when running in full browser DOM environment
  let header = null;
  let liveStatus = null;
  if (isFullDom && target.tagName !== 'CANVAS') {
    header = target.querySelector ? target.querySelector('header') : null;
    if (!header) {
      header = createHeader(doc, opts);
      if (typeof target.insertBefore === 'function' && canvas && canvas.parentElement === target) {
        target.insertBefore(header, canvas);
      } else if (typeof target.appendChild === 'function') {
        target.appendChild(header);
      }
    }

    liveStatus = header ? (header.querySelector('[data-testid="live-status"]') || header.querySelector('.live-status')) : null;

    const tickerControl = header ? (header.querySelector('[data-testid="ticker-select"]') || header.querySelector('select')) : null;
    if (tickerControl && typeof tickerControl.addEventListener === 'function') {
      tickerControl.addEventListener('change', (e) => {
        const val = (e && e.target && e.target.value) || tickerControl.value;
        if (val && innerChart && typeof innerChart.setTicker === 'function') {
          innerChart.setTicker(val);
        }
      });
    }

    const timeframeControls = header ? (header.querySelector('[data-testid="timeframe-controls"]') || header.querySelector('.timeframe-controls')) : null;
    if (timeframeControls && typeof timeframeControls.addEventListener === 'function') {
      timeframeControls.addEventListener('click', (e) => {
        const btn = (e && e.target && (e.target.dataset?.timeframe ? e.target : (e.target.closest && e.target.closest('[data-timeframe]')))) || null;
        const tf = (btn && btn.dataset && btn.dataset.timeframe) || (btn && typeof btn.getAttribute === 'function' && btn.getAttribute('data-timeframe'));
        if (tf && innerChart && typeof innerChart.setTimeframe === 'function') {
          innerChart.setTimeframe(tf);
        }
      });
    }
  }

  // Initialize interactive pan gesture and animation controller on canvas
  let chart = canvas && canvas.__chartCanvas;
  if (!chart && canvas) {
    chart = new ChartCanvas(canvas, {
      ...opts,
      onRender: (cc, time) => {
        if (liveStatus) {
          const secs = typeof time === 'number' ? (time / 1000).toFixed(1) : '0.0';
          liveStatus.textContent = `● LIVE ${secs}s`;
        }
        if (typeof opts.onRender === 'function') {
          opts.onRender(cc, time);
        }
      },
    });
    canvas.__chartCanvas = chart;
  }

  // Initialize data series chart renderer if available
  let innerChart = null;
  try {
    if (typeof Chart === 'function' && canvas) {
      innerChart = new Chart(canvas, {
        width: (canvas && canvas.width) || 800,
        height: (canvas && canvas.height) || 600,
        priceScaleWidth: opts.priceScaleWidth !== undefined ? opts.priceScaleWidth : 60,
        timeScaleHeight: opts.timeScaleHeight !== undefined ? opts.timeScaleHeight : 30,
        candles: (opts && (opts.candles || opts.data)) || (typeof generateDefaultCandles === 'function' ? generateDefaultCandles(60) : []),
        ticker: (opts && opts.ticker) || 'BTC-USD',
        timeframe: (opts && opts.timeframe) || '1h',
        ...opts,
      });

      if (chart) {
        chart.innerChart = innerChart;
      }
    }
  } catch (_) {}

  // Ensure continuous animation loop is active
  if (chart && typeof chart.startAnimationLoop === 'function') {
    chart.startAnimationLoop();
  }

  // Application runtime instance
  const appInstance = {
    chart,
    canvas,
    container: target,
    innerChart,
    getChart() {
      return this.chart;
    },
    getViewport() {
      return this.chart ? this.chart.getViewport() : { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
    },
    getViewportMatrix() {
      return this.chart ? this.chart.getViewportMatrix() : [1, 0, 0, 1, 0, 0];
    },
    render(...args) {
      return this.chart?.render(...args);
    },
    destroy() {
      if (this.chart && typeof this.chart.destroy === 'function') {
        this.chart.destroy();
      }
    },
  };

  if (chart) {
    chart.chart = chart;
    chart.getChart = () => chart;
  }

  if (target) {
    target.__chart = chart;
    target.__appInstance = appInstance;
  }

  return appInstance;
}

/**
 * Canonical initialization and mounting aliases.
 */
export function initApp(container, options = {}) {
  return mountApp(container, options);
}

export function mount(container, options = {}) {
  return mountApp(container, options);
}

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