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
};

/**
 * Mounts the candlestick chart application to the specified DOM container.
 *
 * @param {HTMLElement|string} [container] - Mount container or selector (defaults to #app or body)
 * @param {Object} [options={}] - Custom configuration options for chart and axes
 * @returns {Chart|null}
 */
export function mountApp(container, options = {}) {
  let target = container;

  if (typeof target === 'string' && typeof document !== 'undefined') {
    target = document.querySelector(target);
  }

  if (!target && typeof document !== 'undefined') {
    target = document.getElementById('app') || document.body;
  }

  if (!target) return null;

  let canvas = null;
  if (target.tagName === 'CANVAS') {
    canvas = target;
  } else {
    if (target.children) {
      for (let i = 0; i < target.children.length; i++) {
        const child = target.children[i];
        if (child && child.tagName === 'CANVAS') {
          canvas = child;
          break;
        }
      }
    }
    if (!canvas && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvas = document.createElement('canvas');
      if (typeof target.appendChild === 'function') {
        target.appendChild(canvas);
      }
    }
  }

  const width =
    (options && options.width) ||
    (canvas && canvas.width) ||
    (target && target.clientWidth) ||
    800;
  const height =
    (options && options.height) ||
    (canvas && canvas.height) ||
    (target && target.clientHeight) ||
    600;

  if (canvas) {
    if (canvas.width === undefined || canvas.width === 0) canvas.width = width;
    if (canvas.height === undefined || canvas.height === 0) canvas.height = height;
  }

  const chart = new Chart(canvas || target, {
    width,
    height,
    priceScaleWidth: (options && options.priceScaleWidth) !== undefined ? options.priceScaleWidth : 60,
    timeScaleHeight: (options && options.timeScaleHeight) !== undefined ? options.timeScaleHeight : 30,
    ...options,
  });

  if (target) {
    target.__chart = chart;
  }

  if (chart && typeof chart.start === 'function' && (!options || options.autoTick !== false)) {
    chart.start(options && options.interval);
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