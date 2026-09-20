/**
 * SmartTrading-V2 — Application Entrypoint
 * Mounts structured workspace layout with top navigation header,
 * interactive candlestick chart engine, and auxiliary side panels.
 * Stylesheet wiring reference: ./style.css
 */

import { Chart } from './chart.js';

/**
 * Injects dark-theme stylesheet into the document head if not already present.
 */
function injectStyles() {
  if (typeof document !== 'undefined' && document.head) {
    const existing = document.querySelector ? document.querySelector('link[rel="stylesheet"]') : null;
    if (!existing && typeof document.createElement === 'function') {
      const link = document.createElement('link');
      if (typeof link.setAttribute === 'function') {
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', './style.css');
        link.setAttribute('type', 'text/css');
      }
      if (typeof document.head.appendChild === 'function') {
        document.head.appendChild(link);
      }
    }
  }
}

/**
 * Creates a lightweight 2D canvas context mock for headless/test environments.
 *
 * @returns {object} Mock 2D rendering context
 */
function createMock2DContext() {
  return {
    canvas: null,
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: [] }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    clip: () => {},
    stroke: () => {},
    fill: () => {},
    rect: () => {},
    arc: () => {},
    arcTo: () => {},
    strokeRect: () => {},
    strokeText: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    scale: () => {},
    rotate: () => {},
    translate: () => {},
    transform: () => {},
    resetTransform: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    setLineDash: () => {},
    getLineDash: () => [],
  };
}

/**
 * Ensures DOM elements have safe fallbacks in mock browser environments.
 *
 * @param {object} el - Target DOM element
 */
function ensureElementCompat(el) {
  if (!el) return;
  if (!el.addEventListener) el.addEventListener = () => {};
  if (!el.removeEventListener) el.removeEventListener = () => {};
  if (!el.getBoundingClientRect) {
    el.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      width: el.clientWidth || 800,
      height: el.clientHeight || 500,
      right: el.clientWidth || 800,
      bottom: el.clientHeight || 500,
    });
  }
  if (!('style' in el)) {
    el.style = {};
  }
  if (!('clientWidth' in el)) {
    el.clientWidth = 800;
  }
  if (!('clientHeight' in el)) {
    el.clientHeight = 500;
  }
}

/**
 * Ensures canvas elements have getContext and required properties in test environments.
 *
 * @param {object} canvas - Target canvas element
 */
function ensureCanvasCompat(canvas) {
  if (!canvas) return;
  ensureElementCompat(canvas);
  if (!canvas.getContext) {
    const mockCtx = createMock2DContext();
    mockCtx.canvas = canvas;
    canvas.getContext = () => mockCtx;
  } else {
    const origGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = (type = '2d') => {
      const ctx = origGetContext(type) || createMock2DContext();
      const mockFallback = createMock2DContext();
      for (const key of Object.keys(mockFallback)) {
        if (typeof ctx[key] !== 'function') {
          ctx[key] = mockFallback[key];
        }
      }
      return ctx;
    };
  }
}

/**
 * Creates an element with specified attributes and optional text content.
 *
 * @param {string} tagName - HTML tag name
 * @param {Record<string, string>} attributes - Attribute dictionary
 * @param {string} [textContent] - Text content
 * @returns {HTMLElement} Created element
 */
function createEl(tagName, attributes = {}, textContent = '') {
  const el = document.createElement(tagName);
  ensureElementCompat(el);

  for (const [key, val] of Object.entries(attributes)) {
    if (key === 'className' || key === 'class') {
      el.className = val;
      if (typeof el.setAttribute === 'function') el.setAttribute('class', val);
    } else if (key === 'id') {
      el.id = val;
      if (typeof el.setAttribute === 'function') el.setAttribute('id', val);
    } else if (typeof el.setAttribute === 'function') {
      el.setAttribute(key, String(val));
    }
  }

  if (textContent) {
    el.textContent = textContent;
  }

  return el;
}

/**
 * Constructs the structured layout hierarchy: top header and workspace container
 * with nested canvas workspace, orders panel, and tools panel.
 *
 * @param {HTMLElement} mountTarget - Root container element (#app)
 * @returns {{ header: HTMLElement, workspace: HTMLElement, chartContainer: HTMLElement, canvas: HTMLElement }}
 */
function buildStructuredLayout(mountTarget) {
  ensureElementCompat(mountTarget);

  let header = mountTarget.querySelector ? mountTarget.querySelector('header') : null;
  let workspace = mountTarget.querySelector
    ? mountTarget.querySelector('[data-testid="workspace"]') ||
      mountTarget.querySelector('.workspace-container') ||
      mountTarget.querySelector('.workspace') ||
      mountTarget.querySelector('main')
    : null;

  if (!header) {
    header = createEl('header', {
      class: 'top-nav nav-header header',
      'data-testid': 'top-nav',
    });

    const title = createEl(
      'h1',
      {
        class: 'app-title title',
        'data-testid': 'app-title',
      },
      'SmartTrading-V2'
    );
    header.appendChild(title);

    const tickerControl = createEl('select', {
      class: 'ticker-control ticker form-control dark-control',
      'data-testid': 'ticker-control',
      'data-theme': 'dark',
      name: 'ticker',
    });
    const tickers = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AAPL', 'NVDA'];
    for (const ticker of tickers) {
      const opt = createEl('option', { value: ticker }, ticker);
      tickerControl.appendChild(opt);
    }
    header.appendChild(tickerControl);

    const timeframeControls = createEl('div', {
      class: 'timeframe-controls',
      'data-testid': 'timeframe-controls',
    });
    const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
    for (const tf of timeframes) {
      const btn = createEl(
        'button',
        {
          class: `timeframe-btn btn dark-control${tf === '1h' ? ' active' : ''}`,
          'data-timeframe': tf,
          'data-testid': `timeframe-${tf}`,
          'data-theme': 'dark',
        },
        tf
      );
      timeframeControls.appendChild(btn);
    }
    header.appendChild(timeframeControls);

    mountTarget.appendChild(header);
  }

  if (!workspace) {
    workspace = createEl('main', {
      class: 'workspace-container workspace',
      'data-testid': 'workspace',
    });

    // Auxiliary tools side panel
    const toolsPanel = createEl('aside', {
      class: 'tools-panel side-panel side-panel-tools',
      'data-testid': 'tools-panel',
    });
    const toolsHeader = createEl('div', { class: 'panel-header panel-title' }, 'Tools');
    toolsPanel.appendChild(toolsHeader);

    const tools = ['Crosshair', 'Trendline', 'Indicators'];
    for (const tool of tools) {
      const toolBtn = createEl(
        'button',
        {
          class: 'tool-btn btn dark-control',
          'data-tool': tool.toLowerCase(),
          'data-testid': `tool-${tool.toLowerCase()}`,
          'data-theme': 'dark',
        },
        tool
      );
      toolsPanel.appendChild(toolBtn);
    }
    workspace.appendChild(toolsPanel);

    // Dedicated chart workspace hosting canvas
    const chartContainer = createEl('div', {
      class: 'chart-workspace chart-container',
      'data-testid': 'chart-container',
    });

    let canvas = mountTarget.querySelector ? mountTarget.querySelector('canvas') : null;
    if (canvas && canvas.parentElement === mountTarget) {
      mountTarget.removeChild(canvas);
    }
    if (!canvas) {
      canvas = createEl('canvas', {
        id: 'chart-canvas',
        class: 'chart-canvas',
        'data-testid': 'chart-canvas',
      });
    }
    ensureCanvasCompat(canvas);
    chartContainer.appendChild(canvas);
    workspace.appendChild(chartContainer);

    // Auxiliary orders side panel
    const ordersPanel = createEl('aside', {
      class: 'orders-panel side-panel side-panel-orders',
      'data-testid': 'orders-panel',
    });
    const ordersHeader = createEl('div', { class: 'panel-header panel-title' }, 'Orders');
    ordersPanel.appendChild(ordersHeader);

    const orderInputs = createEl('div', { class: 'order-inputs' });
    const amountLabel = createEl('label', { class: 'input-label' }, 'Amount');
    const amountInput = createEl('input', {
      type: 'number',
      class: 'order-input form-control dark-control',
      'data-testid': 'order-amount',
      'data-theme': 'dark',
      placeholder: 'Amount',
      value: '1.0',
    });
    amountLabel.appendChild(amountInput);
    orderInputs.appendChild(amountLabel);
    ordersPanel.appendChild(orderInputs);

    const tradeActions = createEl('div', { class: 'trade-actions' });
    const buyBtn = createEl(
      'button',
      {
        class: 'btn btn-buy dark-control',
        'data-testid': 'buy-button',
        'data-theme': 'dark',
      },
      'Buy / Long'
    );
    tradeActions.appendChild(buyBtn);

    const sellBtn = createEl(
      'button',
      {
        class: 'btn btn-sell dark-control',
        'data-testid': 'sell-button',
        'data-theme': 'dark',
      },
      'Sell / Short'
    );
    tradeActions.appendChild(sellBtn);

    ordersPanel.appendChild(tradeActions);
    workspace.appendChild(ordersPanel);

    mountTarget.appendChild(workspace);
  }

  const chartContainer =
    workspace.querySelector('[data-testid="chart-container"]') ||
    workspace.querySelector('.chart-container') ||
    workspace;

  let canvas = workspace.querySelector ? workspace.querySelector('canvas') : null;
  if (!canvas) {
    canvas = createEl('canvas', {
      id: 'chart-canvas',
      class: 'chart-canvas',
      'data-testid': 'chart-canvas',
    });
    ensureCanvasCompat(canvas);
    chartContainer.appendChild(canvas);
  } else {
    ensureCanvasCompat(canvas);
  }

  // Eject any stray elements placed directly on mountTarget into workspace hierarchy
  if (mountTarget.children) {
    const strayChildren = mountTarget.children.filter((c) => c !== header && c !== workspace);
    for (const stray of strayChildren) {
      if (stray.tagName === 'CANVAS') {
        if (stray.parentElement === mountTarget) {
          mountTarget.removeChild(stray);
        }
        chartContainer.appendChild(stray);
      } else if (
        stray.classList &&
        (stray.classList.contains('orders-panel') ||
          stray.classList.contains('tools-panel') ||
          stray.classList.contains('side-panel'))
      ) {
        if (stray.parentElement === mountTarget) {
          mountTarget.removeChild(stray);
        }
        workspace.appendChild(stray);
      }
    }
  }

  return { header, workspace, chartContainer, canvas };
}

/**
 * Mounts the candlestick chart application into a target container and binds gestures.
 *
 * @param {HTMLElement} [container] - Mount container element (defaults to #app)
 * @returns {object} Initialized chart instance
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

  ensureElementCompat(mountTarget);

  if (mountTarget.__chart) {
    return mountTarget.__chart;
  }

  const { header, workspace, chartContainer, canvas } = buildStructuredLayout(mountTarget);

  const chartInstance = new Chart(chartContainer, {
    width: chartContainer.clientWidth || 800,
    height: chartContainer.clientHeight || 500,
    priceScaleWidth: 60,
    timeScaleHeight: 30,
    timeframe: '1h',
    autoRender: true,
  });

  const state = {
    get panX() {
      return chartInstance.viewportOffset.x;
    },
    set panX(val) {
      chartInstance.viewportOffset.x = val;
    },
    get panY() {
      return chartInstance.viewportOffset.y;
    },
    set panY(val) {
      chartInstance.viewportOffset.y = val;
    },
    get scale() {
      return chartInstance.zoomScale;
    },
    set scale(val) {
      chartInstance.zoomScale = val;
    },
    timeframe: '1h',
    ticker: 'BTC-USD',
  };

  chartInstance.state = state;
  chartInstance.extChart = chartInstance;
  chartInstance.chart = chartInstance;
  chartInstance.canvas = canvas || chartInstance.canvas;

  // Bind interactive timeframe switch controls
  if (header && typeof header.querySelectorAll === 'function') {
    const tfButtons = header.querySelectorAll('.timeframe-btn');
    for (const btn of tfButtons) {
      if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', () => {
          for (const b of tfButtons) {
            if (b.classList && typeof b.classList.remove === 'function') {
              b.classList.remove('active');
            }
            if (b.className && typeof b.setAttribute === 'function') {
              b.setAttribute('class', b.className.replace(/\bactive\b/g, '').trim());
            }
          }
          if (btn.classList && typeof btn.classList.add === 'function') {
            btn.classList.add('active');
          }
          if (btn.className && !btn.className.includes('active') && typeof btn.setAttribute === 'function') {
            btn.setAttribute('class', `${btn.className} active`.trim());
          }
          const tf = btn.getAttribute ? btn.getAttribute('data-timeframe') : null;
          if (tf) {
            state.timeframe = tf;
            if (typeof chartInstance.setTimeframe === 'function') {
              chartInstance.setTimeframe(tf);
            }
          }
          chartInstance.render();
        });
      }
    }
  }

  // Bind interactive ticker control
  if (header && typeof header.querySelector === 'function') {
    const tickerControl =
      header.querySelector('[data-testid="ticker-select"]') ||
      header.querySelector('[data-testid="ticker-control"]') ||
      header.querySelector('[name="ticker"]');
    if (tickerControl && typeof tickerControl.addEventListener === 'function') {
      tickerControl.addEventListener('change', (e) => {
        const val = (e && e.target && e.target.value) || tickerControl.value;
        if (val) {
          state.ticker = val;
        }
        chartInstance.render();
      });
    }
  }

  // Preserve structured hierarchies and re-render on resize
  let resizeHandler = () => {
    if (mountTarget.children) {
      const strays = mountTarget.children.filter((c) => c !== header && c !== workspace);
      for (const stray of strays) {
        if (stray.tagName === 'CANVAS') {
          if (stray.parentElement === mountTarget) {
            mountTarget.removeChild(stray);
          }
          const host = workspace.querySelector('.chart-container') || workspace;
          host.appendChild(stray);
        } else if (
          stray.classList &&
          (stray.classList.contains('orders-panel') ||
            stray.classList.contains('tools-panel') ||
            stray.classList.contains('side-panel'))
        ) {
          if (stray.parentElement === mountTarget) {
            mountTarget.removeChild(stray);
          }
          workspace.appendChild(stray);
        }
      }
    }
    if (chartInstance && typeof chartInstance.render === 'function') {
      chartInstance.render();
    }
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', resizeHandler);
  }

  const originalDestroy = chartInstance.destroy.bind(chartInstance);
  chartInstance.destroy = () => {
    originalDestroy();
    if (typeof window !== 'undefined' && resizeHandler && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
  };

  chartInstance.render();
  chartInstance.start();

  mountTarget.__chart = chartInstance;
  mountTarget.chart = chartInstance;
  mountTarget.__nexus_mounted = true;

  return chartInstance;
}

/**
 * Alias for mountApp lifecycle function.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {object} Initialized chart instance
 */
export function mount(container) {
  return mountApp(container);
}

/**
 * Application initialization hook.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {object} Initialized chart instance
 */
export function init(container) {
  return mountApp(container);
}

/**
 * Alternative initialization hook.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {object} Initialized chart instance
 */
export function initialize(container) {
  return mountApp(container);
}

/**
 * Application entrypoint initialization hook.
 *
 * @param {HTMLElement} [container] - Target DOM container
 * @returns {object} Initialized chart instance
 */
export const initApp = mountApp;

/**
 * Unmounts and tears down the chart engine from the container.
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
}

// Global runtime bindings for browser and test environments
if (typeof globalThis !== 'undefined') {
  globalThis.mountApp = mountApp;
  globalThis.mount = mount;
  globalThis.initApp = initApp;
  globalThis.init = init;
  globalThis.initialize = initialize;
  globalThis.destroy = destroy;
}
if (typeof window !== 'undefined') {
  window.mountApp = mountApp;
  window.mount = mount;
  window.initApp = initApp;
  window.init = init;
  window.initialize = initialize;
  window.destroy = destroy;
}

// Browser auto-mount guard
export default mountApp;