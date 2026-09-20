/**
 * SmartTrading-V2 — Application Entrypoint
 * Mounts interactive candlestick chart engine with coordinate axes,
 * gridlines, pan gestures, zoom controls, and real-time updates.
 */

import {
  Chart,
  getTimeframeDuration,
  formatAxisTime,
  generateCandleSeries,
  generateDefaultCandles,
  aggregateCandles,
} from './chart.js';

/**
 * Mounts the candlestick chart application into a target container and binds gestures.
 *
 * @param {HTMLElement} [container] - Mount container element (defaults to #app)
 * @returns {Chart|null} Initialized chart instance
 */
export function mountApp(container) {
  const mountTarget =
    container ||
    (typeof document !== 'undefined' ? document.getElementById('app') || document.body : null);
  if (!mountTarget) return null;

  if (mountTarget.__chart) {
    return mountTarget.__chart;
  }

  const chart = new Chart(mountTarget, {
    width: 800,
    height: 500,
    priceScaleWidth: 60,
    timeScaleHeight: 30,
  });

  const canvas =
    chart.canvas || (mountTarget.querySelector ? mountTarget.querySelector('canvas') : null);
  if (canvas && typeof chart.bindPanGestures === 'function') {
    chart.bindPanGestures(canvas);
  }

  chart.render();
  chart.start();

  chart.chart = chart;
  mountTarget.__chart = chart;
  mountTarget.chart = chart;
  mountTarget.__nexus_mounted = true;
  return chart;
}

/**
 * Alias for mountApp lifecycle function.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {Chart|null} Initialized chart instance
 */
export function mount(container) {
  return mountApp(container);
}

/**
 * Application initialization hook.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {Chart|null} Initialized chart instance
 */
export function init(container) {
  return mountApp(container);
}

/**
 * Alternative initialization hook.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {Chart|null} Initialized chart instance
 */
export function initialize(container) {
  return mountApp(container);
}

/**
 * Unmounts and tears down the chart engine from the container.
 *
 * @param {HTMLElement} [container] - Target DOM container
 */
export function destroy(container) {
  const mountTarget =
    container || (typeof document !== 'undefined' ? document.getElementById('app') : null);
  if (mountTarget && mountTarget.__chart) {
    mountTarget.__chart.destroy();
    mountTarget.__chart = null;
    mountTarget.chart = null;
    mountTarget.__nexus_mounted = false;
  }
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

export {
  Chart,
  getTimeframeDuration,
  formatAxisTime,
  generateCandleSeries,
  generateDefaultCandles,
  aggregateCandles,
};

export default init;