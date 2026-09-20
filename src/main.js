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
    return (
      root.querySelector(`#${id}`) ||
      root.querySelector(`.${id}`) ||
      root.querySelector(`[data-testid="${id}"]`)
    );
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
    return (
      root.querySelector('canvas') ||
      root.querySelector('#chart-canvas') ||
      root.querySelector('#chart') ||
      root.querySelector('#candlestick-chart') ||
      root.querySelector('#canvas')
    );
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

  let mutationCount = 0;
  let lastMutationTimestamp = Date.now();

  const tickerEl = resolveElement(root, 'price-ticker');
  const orderBookEl = resolveElement(root, 'order-book');
  const clockEl = resolveElement(root, 'clock-tick');

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
  const canvasEl = resolveCanvas(root);

  if (!chart && canvasEl) {
    chart = new Chart(canvasEl, options.chartOptions || options);
    chart.start(options.fps || options.chartOptions?.fps || 60);
  } else if (chart && typeof chart.start === 'function') {
    chart.start(options.fps || options.chartOptions?.fps || 60);
  }

  const update = () => {
    mutationCount++;
    lastMutationTimestamp = Date.now();

    const currentTicker = resolveElement(root, 'price-ticker');
    const currentOrderBook = resolveElement(root, 'order-book');
    const currentClock = resolveElement(root, 'clock-tick');

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
  const timer = setInterval(update, updateIntervalMs);

  return {
    chart,
    container: root,
    getMutationCount: () => mutationCount,
    getLastMutationTimestamp: () => lastMutationTimestamp,
    destroy: () => {
      if (timer) {
        clearInterval(timer);
      }
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
      }
      if (chart && typeof chart.stop === 'function') {
        chart.stop();
      }
    },
  };
}