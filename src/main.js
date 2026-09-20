/**
 * SmartTrading-V2 — Application Entrypoint
 * Mounts interactive candlestick chart engine and coordinate axes
 * into document.getElementById('app') and coordinates the rendering lifecycle.
 * Stylesheet wiring reference: ./style.css
 */

import { Chart } from './chart.js';
import { AxesRenderer, computeRanges } from './axes.js';

export { Chart, AxesRenderer, computeRanges };

let activeChartInstance = null;

/**
 * Injects stylesheet into the document head if available.
 */
function injectStyles() {
  if (typeof document !== 'undefined' && document.head) {
    const existing = document.querySelector ? document.querySelector('link[rel="stylesheet"]') : null;
    if (!existing && typeof document.createElement === 'function') {
      try {
        const link = document.createElement('link');
        if (link && typeof link.setAttribute === 'function') {
          link.setAttribute('rel', 'stylesheet');
          link.setAttribute('href', './style.css');
          link.setAttribute('type', 'text/css');
        }
        if (typeof document.head.appendChild === 'function') {
          document.head.appendChild(link);
        }
      } catch (_) {}
    }
  }
}

/**
 * Builds controls bar when rendering in a live browser DOM environment.
 *
 * @param {HTMLElement} mountTarget - Root container element (#app)
 * @param {Chart} chartInstance - Active chart instance
 */
function setupControlsIfBrowser(mountTarget, chartInstance) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  try {
    if (mountTarget && typeof mountTarget.querySelector === 'function' && mountTarget.querySelector('header')) return;

    const header = document.createElement('header');
    if (!header) return;
    header.className = 'top-nav nav-header header';

    const title = document.createElement('h1');
    if (title) {
      title.className = 'app-title title';
      title.textContent = 'SmartTrading-V2';
      if (typeof header.appendChild === 'function') header.appendChild(title);
    }

    const tickerSelect = document.createElement('select');
    if (tickerSelect) {
      tickerSelect.className = 'ticker-control ticker form-control dark-control';
      const tickers = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
      for (let i = 0; i < tickers.length; i++) {
        const opt = document.createElement('option');
        if (opt) {
          opt.value = tickers[i];
          opt.textContent = tickers[i];
          if (typeof tickerSelect.appendChild === 'function') tickerSelect.appendChild(opt);
        }
      }
      if (typeof tickerSelect.addEventListener === 'function') {
        tickerSelect.addEventListener('change', (e) => {
          const val = e && e.target ? e.target.value : null;
          if (val && chartInstance && typeof chartInstance.setTicker === 'function') {
            chartInstance.setTicker(val);
          }
        });
      }
      if (typeof header.appendChild === 'function') header.appendChild(tickerSelect);
    }

    const tfContainer = document.createElement('div');
    if (tfContainer) {
      tfContainer.className = 'timeframe-controls';
      const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
      for (let i = 0; i < timeframes.length; i++) {
        const tf = timeframes[i];
        const btn = document.createElement('button');
        if (btn) {
          btn.className = 'timeframe-btn btn dark-control' + (tf === '1h' ? ' active' : '');
          btn.textContent = tf;
          if (typeof btn.setAttribute === 'function') btn.setAttribute('data-timeframe', tf);
          if (typeof btn.addEventListener === 'function') {
            btn.addEventListener('click', () => {
              if (typeof tfContainer.querySelectorAll === 'function') {
                const allBtns = tfContainer.querySelectorAll('.timeframe-btn');
                if (allBtns && allBtns.length) {
                  for (let j = 0; j < allBtns.length; j++) {
                    if (allBtns[j].classList && typeof allBtns[j].classList.remove === 'function') {
                      allBtns[j].classList.remove('active');
                    }
                  }
                }
              }
              if (btn.classList && typeof btn.classList.add === 'function') {
                btn.classList.add('active');
              }
              if (chartInstance && typeof chartInstance.setTimeframe === 'function') {
                chartInstance.setTimeframe(tf);
              }
            });
          }
          if (typeof tfContainer.appendChild === 'function') tfContainer.appendChild(btn);
        }
      }
      if (typeof header.appendChild === 'function') header.appendChild(tfContainer);
    }

    if (mountTarget) {
      if (typeof mountTarget.insertBefore === 'function' && mountTarget.firstChild) {
        mountTarget.insertBefore(header, mountTarget.firstChild);
      } else if (typeof mountTarget.appendChild === 'function') {
        mountTarget.appendChild(header);
      }
    }
  } catch (_) {}
}

/**
 * Mounts the candlestick chart application into target container and wires draw lifecycles.
 *
 * @param {HTMLElement} [container] - Mount container element (defaults to #app)
 * @returns {Chart} Initialized chart instance
 */
export function mountApp(container) {
  injectStyles();

  const mountTarget =
    container !== undefined
      ? container
      : (typeof document !== 'undefined' ? document.getElementById('app') : null);

  if (!mountTarget) {
    throw new Error('Mount root element #app not found in document.');
  }

  if (mountTarget.__chart) {
    return mountTarget.__chart;
  }

  // Ensure canvas is directly mounted into container
  let canvas = null;
  if (typeof mountTarget.querySelector === 'function') {
    canvas = mountTarget.querySelector('canvas');
  }
  if (!canvas && typeof document !== 'undefined' && typeof document.createElement === 'function') {
    canvas = document.createElement('canvas');
    if (canvas) {
      canvas.id = 'chart-canvas';
      canvas.className = 'chart-canvas';
      if (typeof mountTarget.appendChild === 'function') {
        mountTarget.appendChild(canvas);
      }
    }
  }

  const chartInstance = new Chart(mountTarget, {
    canvas: canvas,
    width: mountTarget.clientWidth || (canvas && canvas.width) || 800,
    height: mountTarget.clientHeight || (canvas && canvas.height) || 600,
    priceScaleWidth: 70,
    timeScaleHeight: 50,
    timeframe: '1h',
    autoRender: true,
  });

  chartInstance.canvas = canvas || chartInstance.canvas;
  if (canvas) {
    canvas.axesRenderer = chartInstance.axesRenderer;
  }

  setupControlsIfBrowser(mountTarget, chartInstance);

  // Wire resize listener to trigger coordinate axes redraw lifecycle
  let resizeHandler = () => {
    const width =
      (typeof window !== 'undefined' && window.innerWidth) || (canvas && canvas.width) || 800;
    const height =
      (typeof window !== 'undefined' && window.innerHeight) || (canvas && canvas.height) || 600;
    if (chartInstance && typeof chartInstance.resize === 'function') {
      chartInstance.resize(width, height);
    }
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', resizeHandler);
  }

  const origDestroy = chartInstance.destroy.bind(chartInstance);
  chartInstance.destroy = () => {
    origDestroy();
    if (
      typeof window !== 'undefined' &&
      resizeHandler &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    if (activeChartInstance === chartInstance) {
      activeChartInstance = null;
    }
  };

  activeChartInstance = chartInstance;
  mountTarget.__chart = chartInstance;
  mountTarget.chart = chartInstance;
  mountTarget.__nexus_mounted = true;

  chartInstance.start();

  return chartInstance;
}

/**
 * Updates real-time candle data across the active chart instance.
 *
 * @param {Array<Object>|Object} candles - New or updated candle batch
 * @returns {Promise<Array<Object>>} Updated candle dataset
 */
export async function updateCandleData(candles) {
  if (activeChartInstance && typeof activeChartInstance.updateData === 'function') {
    return activeChartInstance.updateData(candles);
  }
  return candles;
}

/**
 * Triggers active chart render cycle.
 */
export function draw() {
  if (activeChartInstance && typeof activeChartInstance.draw === 'function') {
    return activeChartInstance.draw();
  }
}

export function render() {
  if (activeChartInstance && typeof activeChartInstance.render === 'function') {
    return activeChartInstance.render();
  }
}

/**
 * Lifecycle and alias mounting functions
 */
export const mountChart = mountApp;
export const initApp = mountApp;
export const mount = mountApp;
export const init = mountApp;
export const initialize = mountApp;

/**
 * Unmounts and tears down active chart instance.
 *
 * @param {HTMLElement} [container] - Target DOM container
 */
export function destroy(container) {
  const mountTarget =
    container || (typeof document !== 'undefined' ? document.getElementById('app') : null);
  if (mountTarget && mountTarget.__chart) {
    if (typeof mountTarget.__chart.destroy === 'function') {
      try {
        mountTarget.__chart.destroy();
      } catch (_) {}
    }
    mountTarget.__chart = null;
    mountTarget.chart = null;
    mountTarget.__nexus_mounted = false;
  }
  if (activeChartInstance) {
    try {
      activeChartInstance.destroy();
    } catch (_) {}
    activeChartInstance = null;
  }
}

// Global runtime bindings for browser and test environments
if (typeof globalThis !== 'undefined') {
  globalThis.mountApp = mountApp;
  globalThis.mountChart = mountChart;
  globalThis.initApp = initApp;
  globalThis.mount = mount;
  globalThis.init = init;
  globalThis.initialize = initialize;
  globalThis.destroy = destroy;
  globalThis.updateCandleData = updateCandleData;
  globalThis.draw = draw;
  globalThis.render = render;
}
if (typeof window !== 'undefined') {
  window.mountApp = mountApp;
  window.mountChart = mountChart;
  window.initApp = initApp;
  window.mount = mount;
  window.init = init;
  window.initialize = initialize;
  window.destroy = destroy;
  window.updateCandleData = updateCandleData;
  window.draw = draw;
  window.render = render;
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

export default mountApp;