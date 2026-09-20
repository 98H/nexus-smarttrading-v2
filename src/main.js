/**
 * SmartTrading-V2 — Main Application Entry Point
 * Orchestrates application mounting, real-time data ticker updates,
 * clock ticks, order book state, and candlestick chart rendering.
 */

import { Chart, ChartCanvas, DEFAULT_MIN_ZOOM, DEFAULT_MAX_ZOOM } from './chart.js';

export { Chart, ChartCanvas, DEFAULT_MIN_ZOOM, DEFAULT_MAX_ZOOM };

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

  const getElement = (id) => {
    if (!root) return null;
    if (typeof root.querySelector === 'function') {
      return root.querySelector(`#${id}`);
    }
    return null;
  };

  const tickerEl = getElement('price-ticker');
  const orderBookEl = getElement('order-book');
  const clockEl = getElement('clock-tick');

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

  let chart = null;
  const canvasEl =
    root && typeof root.querySelector === 'function'
      ? root.querySelector('canvas')
      : root && root.getContext
        ? root
        : null;

  if (canvasEl) {
    chart = new Chart(canvasEl, options.chartOptions || options);
    chart.start();
  }

  const update = () => {
    mutationCount++;
    lastMutationTimestamp = Date.now();

    const currentTicker = getElement('price-ticker');
    const currentOrderBook = getElement('order-book');
    const currentClock = getElement('clock-tick');

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
  };

  const updateIntervalMs = options.interval || 500;
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
      if (chart) {
        chart.destroy();
      }
    },
  };
}