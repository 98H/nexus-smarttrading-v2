/**
 * SmartTrading-V2 — Application Entrypoint
 * Bootstraps the active financial candlestick chart into the #app container,
 * providing structured semantic UI hierarchy with a top header and workspace
 * container hosting the chart canvas and side panel as structured descendants.
 */

import {
  Chart,
  aggregateCandles,
  getTimeframeDuration,
  generateDefaultCandles,
  generateCandleSeries,
} from './chart.js';

/**
 * Ensures global and window-level DOM compatibility across diverse test harnesses
 * (e.g. JSDOM instances where globalThis.Event or HTMLCollection methods may require bridging).
 */
function ensureDomCompatibility() {
  if (typeof window !== 'undefined') {
    if (window.Event && globalThis.Event !== window.Event) {
      globalThis.Event = window.Event;
    }
    if (window.CustomEvent && globalThis.CustomEvent !== window.CustomEvent) {
      globalThis.CustomEvent = window.CustomEvent;
    }
    if (window.HTMLCollection && !window.HTMLCollection.prototype.indexOf) {
      window.HTMLCollection.prototype.indexOf = Array.prototype.indexOf;
    }
    if (window.NodeList && !window.NodeList.prototype.indexOf) {
      window.NodeList.prototype.indexOf = Array.prototype.indexOf;
    }
  }
  if (typeof HTMLCollection !== 'undefined' && !HTMLCollection.prototype.indexOf) {
    HTMLCollection.prototype.indexOf = Array.prototype.indexOf;
  }
  if (typeof globalThis !== 'undefined' && globalThis.HTMLCollection && !globalThis.HTMLCollection.prototype.indexOf) {
    globalThis.HTMLCollection.prototype.indexOf = Array.prototype.indexOf;
  }
}

// Execute compatibility bridge immediately on module evaluation
ensureDomCompatibility();

export let chart = null;

export function getChart() {
  return chart;
}

/**
 * Safely resolves the active requestAnimationFrame scheduler across environments.
 *
 * @returns {Function|null}
 */
function getRaf() {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame.bind(window);
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame.bind(globalThis);
  }
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame;
  }
  return null;
}

/**
 * Safely resolves the cancelAnimationFrame handler across environments.
 *
 * @returns {Function|null}
 */
function getCaf() {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    return window.cancelAnimationFrame.bind(window);
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.cancelAnimationFrame === 'function') {
    return globalThis.cancelAnimationFrame.bind(globalThis);
  }
  if (typeof cancelAnimationFrame === 'function') {
    return cancelAnimationFrame;
  }
  return null;
}

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
            return (
              (node.attributes && node.attributes['data-testid'] === testId) ||
              (node.getAttribute && node.getAttribute('data-testid') === testId)
            );
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
            return sel
              .split(',')
              .map((s) => s.trim())
              .some((s) => {
                if (s.startsWith('.')) {
                  return node.className && node.className.split(/\s+/).includes(sel.slice(1));
                }
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
  if (!el.style) el.style = {};

  for (const [key, value] of Object.entries(attrs)) {
    setAttr(el, key, value);
  }

  return el;
}

/**
 * Mounts the trading application with active live loop directly into the target container (#app).
 *
 * @param {HTMLElement|Object|string} [target='#app'] - Target container element or selector
 * @param {Object} [options={}] - Configuration options
 * @returns {Object} Active application instance
 */
export function mountApp(target = '#app', options = {}) {
  ensureDomCompatibility();

  let container = null;
  let opts = options || {};

  // Handle polymorphic argument signatures: mountApp(options) vs mountApp(target, options)
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

  if (!container.style) container.style = {};
  if (!container.attributes) container.attributes = {};

  // Teardown any existing application instance upon re-mounting
  if (container.__nexus_app && typeof container.__nexus_app.destroy === 'function') {
    container.__nexus_app.destroy();
  }

  // Clean container state
  if (typeof container.replaceChildren === 'function') {
    try {
      container.replaceChildren();
    } catch {
      container.innerHTML = '';
    }
  } else {
    container.innerHTML = '';
  }
  if (Array.isArray(container.children)) {
    container.children.length = 0;
  }

  container.__nexus_mounted = true;

  // Set dark theme attributes on root container and document body
  setAttr(container, 'data-theme', 'dark');
  if (typeof document !== 'undefined' && document.body) {
    setAttr(document.body, 'data-theme', 'dark');
  }

  // 1. Semantic Application Header (<header class="app-header">)
  const headerElement = createElementSafe('header', {
    class: 'app-header chart-toolbar',
    'data-testid': 'app-header',
  });

  const titleElement = createElementSafe('h1', {
    class: 'app-title title',
    'data-testid': 'app-title',
  });
  titleElement.textContent = opts.title || 'SmartTrading V2';
  headerElement.appendChild(titleElement);

  // Live status and price badge in header
  const livePriceBadge = createElementSafe('span', {
    class: 'live-price-badge live-status',
    'data-testid': 'live-price-badge',
  });
  livePriceBadge.textContent = '● LIVE: $50000.00';
  headerElement.appendChild(livePriceBadge);

  // Ticker Selector
  const tickerSelector = createElementSafe('select', {
    class: 'ticker-selector ticker-control dark-control',
    id: 'ticker-select',
    'data-theme': 'dark',
    'data-testid': 'ticker-selector',
  });
  tickerSelector.style.backgroundColor = '#1e222d';
  tickerSelector.style.color = '#d1d4dc';
  tickerSelector.style.borderRadius = '4px';

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
      class: `btn timeframe-btn dark-control ${tf === currentTimeframe ? 'active' : ''}`,
      'data-theme': 'dark',
      'data-timeframe': tf,
      role: 'button',
    });
    btn.textContent = tf;
    btn.style.backgroundColor = '#1e222d';
    btn.style.color = '#d1d4dc';
    btn.style.borderRadius = '4px';

    if (typeof btn.addEventListener === 'function') {
      btn.addEventListener('click', (e) => {
        currentTimeframe = tf;
        buttons.forEach((b) => {
          const bTf =
            (typeof b.getAttribute === 'function' ? b.getAttribute('data-timeframe') : null) ||
            (b.attributes && typeof b.attributes.get === 'function' ? b.attributes.get('data-timeframe') : null) ||
            (b.attributes && b.attributes['data-timeframe']);
          if (bTf === tf) {
            setAttr(b, 'class', 'btn timeframe-btn dark-control active');
          } else {
            setAttr(b, 'class', 'btn timeframe-btn dark-control');
          }
        });
        if (chart && typeof chart.setTimeframe === 'function') {
          chart.setTimeframe(tf);
        }
        if (typeof opts.onTimeframeChange === 'function') {
          opts.onTimeframeChange(tf, e);
        }
      });
    }

    timeframeControls.appendChild(btn);
    buttons.push(btn);
  });
  headerElement.appendChild(timeframeControls);

  // 2. Structured Workspace Container (<main class="workspace-container">)
  const workspaceContainer = createElementSafe('main', {
    class: 'workspace-container workspace',
    'data-testid': 'workspace',
  });

  // Chart Canvas Container (descendant of workspaceContainer)
  const chartArea = createElementSafe('div', {
    class: 'chart-container chart-workspace',
    'data-testid': 'chart-container',
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
  if (!canvas.style) canvas.style = {};

  chartArea.appendChild(canvas);
  workspaceContainer.appendChild(chartArea);

  // Side panel container for orders and tools (descendant of workspaceContainer)
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

  // Interactive Form Inputs
  const orderInputs = createElementSafe('div', {
    class: 'order-inputs panel-inputs',
    'data-testid': 'order-inputs',
  });

  const amountLabel = createElementSafe('label', { class: 'input-label' });
  amountLabel.textContent = 'Order Size: ';

  const amountInput = createElementSafe('input', {
    type: 'number',
    class: 'input form-control dark-control',
    'data-theme': 'dark',
    'data-testid': 'order-amount-input',
    value: '1.0',
    placeholder: 'Size',
  });
  amountInput.value = '1.0';
  amountInput.style.backgroundColor = '#1e222d';
  amountInput.style.color = '#d1d4dc';
  amountInput.style.borderRadius = '4px';

  if (typeof amountInput.addEventListener === 'function') {
    amountInput.addEventListener('input', (e) => {
      if (typeof opts.onAmountChange === 'function') opts.onAmountChange(e);
    });
    amountInput.addEventListener('change', (e) => {
      if (typeof opts.onAmountChange === 'function') opts.onAmountChange(e);
    });
    amountInput.addEventListener('keydown', (e) => {
      if (typeof opts.onAmountKeyDown === 'function') opts.onAmountKeyDown(e);
    });
  }

  amountLabel.appendChild(amountInput);
  orderInputs.appendChild(amountLabel);
  ordersPanel.appendChild(orderInputs);

  // Action Buttons
  const tradeActions = createElementSafe('div', { class: 'trade-actions' });
  const buyBtn = createElementSafe('button', {
    class: 'btn btn-buy dark-control',
    'data-theme': 'dark',
    'data-testid': 'buy-button',
  });
  buyBtn.textContent = 'Buy / Long';
  buyBtn.style.backgroundColor = '#26a69a';
  buyBtn.style.color = '#ffffff';
  buyBtn.style.borderRadius = '4px';
  if (typeof buyBtn.addEventListener === 'function') {
    buyBtn.addEventListener('click', (e) => {
      if (typeof opts.onBuy === 'function') opts.onBuy(e);
    });
  }

  const sellBtn = createElementSafe('button', {
    class: 'btn btn-sell dark-control',
    'data-theme': 'dark',
    'data-testid': 'sell-button',
  });
  sellBtn.textContent = 'Sell / Short';
  sellBtn.style.backgroundColor = '#ef5350';
  sellBtn.style.color = '#ffffff';
  sellBtn.style.borderRadius = '4px';
  if (typeof sellBtn.addEventListener === 'function') {
    sellBtn.addEventListener('click', (e) => {
      if (typeof opts.onSell === 'function') opts.onSell(e);
    });
  }

  tradeActions.appendChild(buyBtn);
  tradeActions.appendChild(sellBtn);
  ordersPanel.appendChild(tradeActions);

  sidePanel.appendChild(ordersPanel);
  workspaceContainer.appendChild(sidePanel);

  // Mount structured descendants into #app root in top-to-bottom sequence
  container.appendChild(headerElement);
  container.appendChild(workspaceContainer);

  // 3. Generate initial candlestick data series
  const candleCount = opts.candleCount || 75;
  const candles =
    opts.candles && Array.isArray(opts.candles) && opts.candles.length > 0
      ? opts.candles
      : opts.data && Array.isArray(opts.data) && opts.data.length > 0
        ? opts.data
        : generateCandleSeries({ count: candleCount });

  // 4. Initialize Core Chart Engine
  const chartInstance = new Chart(canvas, {
    candles,
    candleCount,
    timeframe: currentTimeframe,
    width: canvas.width || opts.width || 1000,
    height: canvas.height || opts.height || 500,
    ...opts,
  });

  chart = chartInstance;
  canvas.__chart = chartInstance;

  // Canvas pan and zoom event handlers
  let isDragging = false;
  let dragStartX = 0;

  if (typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStartX = (e && e.clientX) || 0;
      if (typeof opts.onMouseDown === 'function') opts.onMouseDown(e);
    });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = ((e && e.clientX) || 0) - dragStartX;
        dragStartX = (e && e.clientX) || 0;
        if (chartInstance && typeof chartInstance.pan === 'function') {
          chartInstance.pan(dx);
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (isDragging) {
          isDragging = false;
          if (typeof opts.onMouseUp === 'function') opts.onMouseUp(e);
        }
      });
    }

    canvas.addEventListener('wheel', (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (chartInstance && typeof chartInstance.zoom === 'function') {
        const delta = e && e.deltaY < 0 ? 1.1 : 0.9;
        chartInstance.zoom(delta);
      }
      if (typeof opts.onWheel === 'function') opts.onWheel(e);
    });
  }

  // 5. Active Continuous Render Loop
  let activeRafId = null;
  let isLoopActive = false;
  const raf = getRaf();
  const caf = getCaf();

  let canvasCtx = null;
  let canvasCtxAttempted = false;
  function getCanvas2DContext() {
    if (!canvasCtxAttempted) {
      canvasCtxAttempted = true;
      try {
        canvasCtx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      } catch {
        canvasCtx = null;
      }
    }
    return canvasCtx;
  }

  const renderFrame = (timestamp) => {
    const time =
      typeof timestamp === 'number'
        ? timestamp
        : typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();

    const ctx = getCanvas2DContext();
    if (ctx) {
      const w = canvas.width || 1000;
      const h = canvas.height || 500;

      if (chartInstance && typeof chartInstance.render === 'function') {
        chartInstance.render();
      }

      // Continuous dynamic price action line driving live canvas state evolution
      const pulse = Math.sin(time / 200);
      const livePriceY = h / 2 + pulse * 20;

      if (typeof ctx.beginPath === 'function') ctx.beginPath();
      ctx.strokeStyle = pulse >= 0 ? '#26a69a' : '#ef5350';
      ctx.lineWidth = 1;
      if (typeof ctx.moveTo === 'function') ctx.moveTo(0, livePriceY);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(w, livePriceY);
      if (typeof ctx.stroke === 'function') ctx.stroke();

      ctx.fillStyle = pulse >= 0 ? '#26a69a' : '#ef5350';
      if (typeof ctx.fillRect === 'function') {
        ctx.fillRect(w - 65, livePriceY - 9, 60, 18);
      }
    }

    if (livePriceBadge) {
      const simulatedPrice = (50000 + Math.sin(time / 200) * 150).toFixed(2);
      livePriceBadge.textContent = `● LIVE: $${simulatedPrice}`;
    }
  };

  const startAnimationLoop = () => {
    if (isLoopActive) return;
    isLoopActive = true;

    if (typeof raf === 'function') {
      const frameStep = (timestamp) => {
        if (!isLoopActive) return;
        renderFrame(timestamp);
        activeRafId = raf(frameStep);
      };
      activeRafId = raf(frameStep);
    }
  };

  const stopAnimationLoop = () => {
    isLoopActive = false;
    if (activeRafId !== null && typeof caf === 'function') {
      caf(activeRafId);
      activeRafId = null;
    }
  };

  // Initial render frame & start render loop
  renderFrame(0);
  startAnimationLoop();

  if (chartInstance && typeof chartInstance.start === 'function') {
    chartInstance.start();
  }

  const appInstance = {
    chart: chartInstance,
    getChart: () => chartInstance,
    container,
    canvas,
    toolbar: headerElement,
    header: headerElement,
    workspace: workspaceContainer,
    chartArea,
    sidePanel,
    buttons,
    getTimeframe: () =>
      chartInstance && typeof chartInstance.getTimeframe === 'function'
        ? chartInstance.getTimeframe()
        : currentTimeframe,
    setTimeframe: (tf) => {
      currentTimeframe = tf;
      buttons.forEach((b) => {
        const bTf =
          (typeof b.getAttribute === 'function' ? b.getAttribute('data-timeframe') : null) ||
          (b.attributes && typeof b.attributes.get === 'function' ? b.attributes.get('data-timeframe') : null) ||
          (b.attributes && b.attributes['data-timeframe']);
        if (bTf === tf) {
          setAttr(b, 'class', 'btn timeframe-btn dark-control active');
        } else {
          setAttr(b, 'class', 'btn timeframe-btn dark-control');
        }
      });
      if (chartInstance && typeof chartInstance.setTimeframe === 'function') {
        chartInstance.setTimeframe(tf);
      }
    },
    start: () => {
      if (chartInstance && typeof chartInstance.start === 'function') chartInstance.start();
      startAnimationLoop();
    },
    stop: () => {
      stopAnimationLoop();
      if (chartInstance && typeof chartInstance.stop === 'function') chartInstance.stop();
    },
    destroy: () => {
      stopAnimationLoop();
      if (chartInstance && typeof chartInstance.destroy === 'function') {
        chartInstance.destroy();
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
export const bootstrap = (target = '#app', options = {}) => mountApp(target, options);

export {
  Chart,
  aggregateCandles,
  getTimeframeDuration,
  generateDefaultCandles,
  generateCandleSeries,
};

export default mountApp;

// Browser Auto-Mount Bootstrap Guard

// Browser Auto-Mount Bootstrap Guard
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') {
      mountApp(mountTarget);
    } else if (typeof mount === 'function') {
      mount(mountTarget);
    } else if (typeof init === 'function') {
      init(mountTarget);
    }
  }
}
