/**
 * SmartTrading-V2 — Application Entrypoint
 * Bootstraps the active financial candlestick chart directly into the #app container,
 * providing comprehensive data series, interactive controls, and viewport rendering.
 */

import {
  Chart,
  aggregateCandles,
  getTimeframeDuration,
  generateDefaultCandles,
  generateCandleSeries,
} from './chart.js';

/**
 * Safely assigns an attribute or DOM property across real DOM and mock test environments.
 *
 * @param {Object} el - Target element
 * @param {string} key - Attribute name
 * @param {string} val - Attribute value
 */
function setAttr(el, key, val) {
  if (!el) return;
  if (typeof el.setAttribute === 'function') {
    el.setAttribute(key, String(val));
  } else if (el.attributes && typeof el.attributes === 'object') {
    el.attributes[key] = String(val);
  }

  if (key === 'id') {
    el.id = String(val);
  } else if (key === 'class' || key === 'className') {
    el.className = String(val);
    if (el.classList && typeof el.classList.add === 'function') {
      const classes = String(val).split(/\s+/).filter(Boolean);
      el.classList.add(...classes);
    }
  }
}

/**
 * Safely creates an element structure compatible with both real DOM and mock test environments.
 *
 * @param {string} tag - HTML tag name
 * @param {Object} [attrs={}] - Attribute key-value pairs
 * @returns {Object} Element node
 */
function createElementSafe(tag, attrs = {}) {
  let el;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    el = document.createElement(tag);
  } else {
    el = {
      tagName: tag.toUpperCase(),
      children: [],
      attributes: {},
      style: {},
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
        return child;
      },
      querySelector(sel) {
        if (sel === 'canvas') {
          return this.children.find((c) => c.tagName === 'CANVAS') || null;
        }
        return null;
      },
    };
  }

  if (!el.attributes) el.attributes = {};
  if (!el.children) el.children = [];

  for (const [key, value] of Object.entries(attrs)) {
    setAttr(el, key, value);
  }

  return el;
}

/**
 * Mounts the trading application and renders the full-width candlestick series
 * directly into the target container (#app).
 *
 * @param {HTMLElement|Object|string} [target] - Target container element or selector
 * @param {Object} [options={}] - Configuration options
 * @returns {Object} Active application instance
 */
export function mountApp(target, options = {}) {
  let container = null;
  let opts = options || {};

  // Handle polymorphic argument signature: mountApp(options) vs mountApp(target, options)
  if (target && typeof target === 'object') {
    if (target.tagName || typeof target.appendChild === 'function' || target.nodeType) {
      container = target;
    } else {
      opts = target;
    }
  } else if (typeof target === 'string') {
    if (typeof document !== 'undefined') {
      if (typeof document.querySelector === 'function') {
        try {
          container = document.querySelector(target);
        } catch {
          // ignore selector syntax errors
        }
      }
      if (!container && target.startsWith('#') && typeof document.getElementById === 'function') {
        container = document.getElementById(target.slice(1));
      }
      if (!container && typeof document.getElementById === 'function') {
        container = document.getElementById(target);
      }
    }
  }

  if (!container && typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    container = document.getElementById('app');
  }

  if (!container) {
    throw new Error('Target container #app not found (app container missing)');
  }

  // 1. Locate or create the active canvas element directly in the #app container
  let canvas = null;
  if (typeof container.querySelector === 'function') {
    canvas = container.querySelector('canvas');
  }
  if (!canvas && Array.isArray(container.children)) {
    canvas = container.children.find((c) => c.tagName === 'CANVAS');
  }

  if (!canvas) {
    if (typeof opts.createCanvas === 'function') {
      canvas = opts.createCanvas();
    } else {
      canvas = createElementSafe('canvas', {
        width: opts.width || 1000,
        height: opts.height || 500,
        class: 'chart-canvas active-chart',
      });
    }

    canvas.width = canvas.width || opts.width || 1000;
    canvas.height = canvas.height || opts.height || 500;
    container.appendChild(canvas);
  }

  // Provide fallback 2D context for headless environments if missing
  if (typeof canvas.getContext !== 'function') {
    const drawCalls = [];
    const ctx = {
      canvas,
      drawCalls,
      clearRect: (x, y, w, h) => drawCalls.push({ method: 'clearRect', args: { x, y, w, h } }),
      fillRect: (x, y, w, h) => drawCalls.push({ method: 'fillRect', args: { x, y, w, h } }),
      strokeRect: (x, y, w, h) => drawCalls.push({ method: 'strokeRect', args: { x, y, w, h } }),
      beginPath: () => drawCalls.push({ method: 'beginPath', args: {} }),
      moveTo: (x, y) => drawCalls.push({ method: 'moveTo', args: { x, y } }),
      lineTo: (x, y) => drawCalls.push({ method: 'lineTo', args: { x, y } }),
      stroke: () => drawCalls.push({ method: 'stroke', args: {} }),
    };
    canvas.getContext = (type) => (type === '2d' ? ctx : null);
  }

  // 2. Toolbar & Controls Setup (Timeframe selection, ticker control)
  const timeframes = opts.timeframes || ['1m', '5m', '15m', '1h', '1d'];
  let currentTimeframe =
    opts.initialTimeframe || opts.timeframe || opts.defaultTimeframe || '1m';

  let toolbar = null;
  if (container.children && Array.isArray(container.children)) {
    toolbar = container.children.find(
      (c) => c.tagName === 'NAV' || c.tagName === 'HEADER' || (c.attributes && c.attributes.class === 'chart-toolbar')
    );
  }

  const buttons = [];
  if (!toolbar && typeof document !== 'undefined' && typeof document.createElement === 'function') {
    toolbar = createElementSafe('header', { class: 'top-nav chart-toolbar timeframe-controls' });

    const titleEl = createElementSafe('h1', { class: 'app-title' });
    titleEl.textContent = opts.title || 'SmartTrading V2';
    toolbar.appendChild(titleEl);

    const tickerSelect = createElementSafe('select', { class: 'ticker-control' });
    const tickers = opts.tickers || ['BTC/USD', 'ETH/USD', 'SOL/USD'];
    tickers.forEach((t) => {
      const opt = createElementSafe('option', { value: t });
      opt.textContent = t;
      tickerSelect.appendChild(opt);
    });

    if (typeof tickerSelect.addEventListener === 'function') {
      tickerSelect.addEventListener('change', (e) => {
        if (typeof opts.onTickerChange === 'function') opts.onTickerChange(e);
      });
    }
    toolbar.appendChild(tickerSelect);

    timeframes.forEach((tf) => {
      const btn = createElementSafe('button', {
        class: `timeframe-btn ${tf === currentTimeframe ? 'active' : ''}`,
        'data-timeframe': tf,
      });
      btn.textContent = tf;

      if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', () => {
          currentTimeframe = tf;
          buttons.forEach((b) => {
            const bTf = (b.attributes && b.attributes['data-timeframe']) || (b.getAttribute && b.getAttribute('data-timeframe'));
            if (bTf === tf) {
              setAttr(b, 'class', 'timeframe-btn active');
            } else {
              setAttr(b, 'class', 'timeframe-btn');
            }
          });
          if (chart && typeof chart.setTimeframe === 'function') {
            chart.setTimeframe(tf);
          }
        });
      }

      toolbar.appendChild(btn);
      buttons.push(btn);
    });

    container.appendChild(toolbar);
  }

  // 3. Generate comprehensive candlestick data series (STORY 1.2.1: 50 to 100 points)
  const candleCount = opts.candleCount || 75;
  const candles =
    opts.candles && Array.isArray(opts.candles) && opts.candles.length > 0
      ? opts.candles
      : opts.data && Array.isArray(opts.data) && opts.data.length > 0
        ? opts.data
        : generateCandleSeries({ count: candleCount });

  // 4. Initialize Core Chart Engine and trigger full-width series rendering
  const chart = new Chart(canvas, {
    candles,
    candleCount,
    timeframe: currentTimeframe,
    width: canvas.width || opts.width || 1000,
    height: canvas.height || opts.height || 500,
    ...opts,
  });

  if (typeof chart.render === 'function') {
    chart.render();
  }

  // Start real-time updates when running in active browser window or requested
  if (opts.autoStart || (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')) {
    chart.start();
  }

  const appInstance = {
    chart,
    getChart: () => chart,
    container,
    canvas,
    toolbar,
    buttons,
    getTimeframe: () => (chart && typeof chart.getTimeframe === 'function' ? chart.getTimeframe() : currentTimeframe),
    setTimeframe: (tf) => {
      currentTimeframe = tf;
      if (chart && typeof chart.setTimeframe === 'function') {
        chart.setTimeframe(tf);
      }
    },
    start: () => {
      if (chart && typeof chart.start === 'function') chart.start();
    },
    stop: () => {
      if (chart && typeof chart.stop === 'function') chart.stop();
    },
    destroy: () => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    },
  };

  return appInstance;
}

export const mount = mountApp;

export function initApp(target = '#app', options = {}) {
  return mountApp(target, options);
}

export const init = initApp;
export const initialize = initApp;

export {
  Chart,
  aggregateCandles,
  getTimeframeDuration,
  generateDefaultCandles,
  generateCandleSeries,
};

export default mountApp;

// CRITICAL ENTRYPOINT AUTO-MOUNT INVARIANT
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}