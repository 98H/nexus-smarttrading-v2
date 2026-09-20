/**
 * SmartTrading-V2 — Application Entrypoint
 * Bootstraps the active financial candlestick chart directly into the #app container,
 * providing structured UI hierarchy with a dedicated header and workspace.
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
      textContent: '',
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
        return child;
      },
      contains(target) {
        if (!target) return false;
        if (this === target) return true;
        for (const child of this.children) {
          if (child === target || (child.contains && child.contains(target))) {
            return true;
          }
        }
        return false;
      },
      querySelector(sel) {
        const match = (node) => {
          if (!node || !node.tagName) return false;
          if (sel.startsWith('.')) {
            return node.className && node.className.split(/\s+/).includes(sel.slice(1));
          }
          if (sel.startsWith('#')) {
            return node.id === sel.slice(1);
          }
          if (sel.startsWith('[data-testid="') && sel.endsWith('"]')) {
            const testId = sel.slice(14, -2);
            return (node.attributes && node.attributes['data-testid'] === testId) ||
                   (node.getAttribute && node.getAttribute('data-testid') === testId);
          }
          return node.tagName.toLowerCase() === sel.toLowerCase();
        };

        const queue = [...this.children];
        while (queue.length > 0) {
          const item = queue.shift();
          if (match(item)) return item;
          if (item.children) queue.push(...item.children);
        }
        return null;
      },
      querySelectorAll(sel) {
        const results = [];
        const match = (node) => {
          if (!node || !node.tagName) return false;
          if (sel.includes(',')) {
            return sel.split(',').map((s) => s.trim()).some((s) => {
              if (s.startsWith('.')) return node.className && node.className.split(/\s+/).includes(s.slice(1));
              return node.tagName.toLowerCase() === s.toLowerCase();
            });
          }
          if (sel.startsWith('.')) {
            return node.className && node.className.split(/\s+/).includes(sel.slice(1));
          }
          return node.tagName.toLowerCase() === sel.toLowerCase();
        };

        const queue = [...this.children];
        while (queue.length > 0) {
          const item = queue.shift();
          if (match(item)) results.push(item);
          if (item.children) queue.push(...item.children);
        }
        return results;
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
 * Mounts the trading application with a semantic layout (header, workspace housing chart and side panel)
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

  // Destroy any existing chart instance on re-mounting
  if (container.__nexus_app && typeof container.__nexus_app.destroy === 'function') {
    container.__nexus_app.destroy();
  }

  // Clear container to ensure clean structural hierarchy without duplicate/uncontained siblings
  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
  } else if (typeof container.innerHTML !== 'undefined') {
    container.innerHTML = '';
  } else if (Array.isArray(container.children)) {
    container.children = [];
  }

  // 1. Structured Application Header (<header>, [data-testid="app-header"])
  const headerElement = createElementSafe('header', {
    class: 'app-header chart-toolbar',
    'data-testid': 'app-header',
  });

  // Application Title
  const titleElement = createElementSafe('h1', {
    class: 'app-title title',
    'data-testid': 'app-title',
  });
  titleElement.textContent = opts.title || 'SmartTrading V2';
  headerElement.appendChild(titleElement);

  // Ticker Selector
  const tickerSelector = createElementSafe('select', {
    class: 'ticker-selector ticker-control',
    'data-testid': 'ticker-selector',
  });
  const tickers = opts.tickers || ['BTC/USD', 'ETH/USD', 'SOL/USD'];
  tickers.forEach((t) => {
    const opt = createElementSafe('option', { value: t });
    opt.textContent = t;
    tickerSelector.appendChild(opt);
  });
  if (typeof tickerSelector.addEventListener === 'function') {
    tickerSelector.addEventListener('change', (e) => {
      if (typeof opts.onTickerChange === 'function') opts.onTickerChange(e);
    });
  }
  headerElement.appendChild(tickerSelector);

  // Timeframe Controls
  const timeframes = opts.timeframes || ['1m', '5m', '15m', '1h', '1d'];
  let currentTimeframe = opts.initialTimeframe || opts.timeframe || opts.defaultTimeframe || '1m';

  const timeframeControls = createElementSafe('div', {
    class: 'timeframe-controls timeframes',
    'data-testid': 'timeframe-controls',
  });

  const buttons = [];
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

    timeframeControls.appendChild(btn);
    buttons.push(btn);
  });
  headerElement.appendChild(timeframeControls);

  // 2. Structured Workspace Container (<main>, [data-testid="workspace"])
  const workspaceContainer = createElementSafe('main', {
    class: 'workspace-container workspace',
    'data-testid': 'workspace',
  });

  // Chart area container housing the canvas
  const chartArea = createElementSafe('div', {
    class: 'chart-container chart-workspace',
    'data-testid': 'chart-area',
  });

  let canvas = null;
  if (typeof opts.createCanvas === 'function') {
    canvas = opts.createCanvas();
  } else if (opts.canvas) {
    canvas = opts.canvas;
  } else {
    canvas = createElementSafe('canvas', {
      width: opts.width || 1000,
      height: opts.height || 500,
      class: 'chart-canvas active-chart',
      'data-testid': 'chart-canvas',
    });
  }

  canvas.width = canvas.width || opts.width || 1000;
  canvas.height = canvas.height || opts.height || 500;
  chartArea.appendChild(canvas);
  workspaceContainer.appendChild(chartArea);

  // Fallback 2D context for headless test environments
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

  // Side panel container (<aside>, [data-testid="side-panel"])
  const sidePanel = createElementSafe('aside', {
    class: 'side-panel tools-panel',
    'data-testid': 'side-panel',
  });

  const ordersPanel = createElementSafe('div', {
    class: 'orders-panel panel-section',
    'data-testid': 'orders-panel',
  });

  const ordersTitle = createElementSafe('h2', { class: 'panel-title' });
  ordersTitle.textContent = 'Orders & Tools';
  ordersPanel.appendChild(ordersTitle);

  const tradeActions = createElementSafe('div', { class: 'trade-actions' });
  const buyBtn = createElementSafe('button', { class: 'btn btn-buy', 'data-testid': 'buy-button' });
  buyBtn.textContent = 'Buy / Long';
  const sellBtn = createElementSafe('button', { class: 'btn btn-sell', 'data-testid': 'sell-button' });
  sellBtn.textContent = 'Sell / Short';
  tradeActions.appendChild(buyBtn);
  tradeActions.appendChild(sellBtn);
  ordersPanel.appendChild(tradeActions);

  sidePanel.appendChild(ordersPanel);
  workspaceContainer.appendChild(sidePanel);

  // Mount only semantic structural children into root container
  container.appendChild(headerElement);
  container.appendChild(workspaceContainer);

  // 3. Generate comprehensive candlestick data series (STORY 1.2.1: 50 to 100 points)
  const candleCount = opts.candleCount || 75;
  const candles =
    opts.candles && Array.isArray(opts.candles) && opts.candles.length > 0
      ? opts.candles
      : opts.data && Array.isArray(opts.data) && opts.data.length > 0
        ? opts.data
        : generateCandleSeries({ count: candleCount });

  // 4. Initialize Core Chart Engine
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
    toolbar: headerElement,
    header: headerElement,
    workspace: workspaceContainer,
    chartArea,
    sidePanel,
    buttons,
    getTimeframe: () => (chart && typeof chart.getTimeframe === 'function' ? chart.getTimeframe() : currentTimeframe),
    setTimeframe: (tf) => {
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

  container.__nexus_app = appInstance;
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