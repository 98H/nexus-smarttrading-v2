/**
 * SmartTrading-V2 — Main Application Entry Point
 * Orchestrates application mounting, real-time data ticker updates,
 * clock ticks, order book state, and candlestick chart rendering.
 */

import { Chart, ChartCanvas, DEFAULT_MIN_ZOOM, DEFAULT_MAX_ZOOM } from './chart.js';

export { Chart, ChartCanvas, DEFAULT_MIN_ZOOM, DEFAULT_MAX_ZOOM };

/**
 * Resolves element from root container by ID or selector.
 *
 * @param {HTMLElement|Object} root - Root container
 * @param {string} id - Element identifier
 * @returns {HTMLElement|Object|null}
 */
function resolveElement(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  if (typeof root.querySelector === 'function') {
    const found =
      root.querySelector(`#${id}`) ||
      root.querySelector(`.${id}`) ||
      root.querySelector(`[data-testid="${id}"]`);
    if (found) return found;
  }
  if (Array.isArray(root.children)) {
    const found = root.children.find((child) => child && child.id === id);
    if (found) return found;
  }
  return null;
}

/**
 * Finds canvas element in the container or validates container as canvas.
 *
 * @param {HTMLElement|Object} root - Root container
 * @returns {HTMLElement|Object|null}
 */
function resolveCanvas(root) {
  if (!root) return null;
  if (typeof root.getContext === 'function') return root;
  if (typeof root.querySelector === 'function') {
    const found =
      root.querySelector('canvas') ||
      root.querySelector('#chart-canvas') ||
      root.querySelector('#chart') ||
      root.querySelector('#candlestick-chart') ||
      root.querySelector('#canvas');
    if (found) return found;
  }
  if (Array.isArray(root.children)) {
    const found = root.children.find(
      (child) =>
        child &&
        (typeof child.getContext === 'function' ||
          child.tagName?.toLowerCase() === 'canvas' ||
          child.nodeName?.toLowerCase() === 'canvas' ||
          child.id === 'canvas' ||
          child.id === 'chart-canvas' ||
          child.id === 'candlestick-chart' ||
          child.id === 'chart')
    );
    if (found) return found;
  }
  return null;
}

/**
 * Mounts the trading application to a root container, establishing real-time
 * periodic state mutations (price tickers, order book, clock ticks) and animation loops.
 *
 * @param {HTMLElement|Object} container - DOM container element or mock element
 * @param {Object} [options={}] - Configuration options
 * @returns {Object} Application handle with lifecycle and state observation methods
 */
export function mountApp(container, options = {}) {
  const root =
    typeof container === 'string' && typeof document !== 'undefined'
      ? document.querySelector(container)
      : container;

  if (!root) {
    return {
      chart: null,
      container: null,
      getMutationCount: () => 0,
      getLastMutationTimestamp: () => 0,
      destroy: () => {},
      stop: () => {},
    };
  }

  let mutationCount = 0;
  let lastMutationTimestamp = Date.now();

  let tickerEl = resolveElement(root, 'price-ticker') || resolveElement(root, 'ticker');
  let orderBookEl = resolveElement(root, 'order-book') || resolveElement(root, 'orderbook');
  let clockEl =
    resolveElement(root, 'clock-tick') ||
    resolveElement(root, 'clock') ||
    resolveElement(root, 'timestamp');

  // In browser environment, construct elements if missing
  if (typeof document !== 'undefined' && typeof root.appendChild === 'function') {
    if (!tickerEl) {
      try {
        const el = document.createElement('div');
        el.id = 'price-ticker';
        root.appendChild(el);
        tickerEl = el;
      } catch {}
    }
    if (!orderBookEl) {
      try {
        const el = document.createElement('div');
        el.id = 'order-book';
        root.appendChild(el);
        orderBookEl = el;
      } catch {}
    }
    if (!clockEl) {
      try {
        const el = document.createElement('div');
        el.id = 'clock-tick';
        root.appendChild(el);
        clockEl = el;
      } catch {}
    }
  }

  // Baseline initial state
  if (tickerEl) {
    tickerEl.textContent = 'BTC/USD: $50000.00';
  }
  if (orderBookEl) {
    orderBookEl.textContent = 'Bids: 100 | Asks: 100';
  }
  if (clockEl) {
    clockEl.textContent = new Date().toISOString();
  }

  let chart = options.chart || null;
  let canvasEl = resolveCanvas(root);

  if (!chart && !canvasEl && typeof document !== 'undefined' && typeof root.appendChild === 'function') {
    try {
      const createdCanvas = document.createElement('canvas');
      createdCanvas.id = 'chart-canvas';
      createdCanvas.width = options.width || 800;
      createdCanvas.height = options.height || 600;
      root.appendChild(createdCanvas);
      canvasEl = createdCanvas;
    } catch {}
  }

  if (!chart && canvasEl) {
    chart = new Chart(canvasEl, options.chartOptions || options);
    chart.start(options.fps || options.chartOptions?.fps || 60);
  } else if (chart && typeof chart.start === 'function') {
    chart.start(options.fps || options.chartOptions?.fps || 60);
  }

  const update = () => {
    mutationCount++;
    lastMutationTimestamp = Date.now();

    const currentTicker =
      resolveElement(root, 'price-ticker') || resolveElement(root, 'ticker') || tickerEl;
    const currentOrderBook =
      resolveElement(root, 'order-book') || resolveElement(root, 'orderbook') || orderBookEl;
    const currentClock =
      resolveElement(root, 'clock-tick') ||
      resolveElement(root, 'clock') ||
      resolveElement(root, 'timestamp') ||
      clockEl;

    if (currentTicker) {
      const price = (50000 + mutationCount * 1.5).toFixed(2);
      currentTicker.textContent = `BTC/USD: $${price}`;
    }
    if (currentOrderBook) {
      const bids = 100 + (mutationCount % 10);
      const asks = 100 - (mutationCount % 10);
      currentOrderBook.textContent = `Bids: ${bids} | Asks: ${asks}`;
    }
    if (currentClock) {
      currentClock.textContent = new Date().toISOString();
    }

    if (chart) {
      const currentPrice = 50000 + mutationCount * 1.5;
      if (typeof chart.updateTick === 'function') {
        chart.updateTick(currentPrice);
      } else if (typeof chart.render === 'function') {
        chart.render();
      }
    }
  };

  const updateIntervalMs =
    typeof options.interval === 'number' && options.interval > 0 ? options.interval : 500;
  let timer = setInterval(update, updateIntervalMs);
  if (typeof timer?.unref === 'function') {
    timer.unref();
  }

  return {
    chart,
    container: root,
    getMutationCount: () => mutationCount,
    getLastMutationTimestamp: () => lastMutationTimestamp,
    destroy: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (chart && typeof chart.stop === 'function') {
        chart.stop();
      }
    },
  };
}

export const mount = mountApp;
export const init = mountApp;
export const initialize = mountApp;
export const initApp = mountApp;

// Browser Auto-Mount Bootstrap Guard
if (typeof document !== 'undefined') {
  const mountTarget =
    (typeof document.getElementById === 'function' ? document.getElementById('app') : null) ||
    document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}