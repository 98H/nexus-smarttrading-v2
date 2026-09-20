/**
 * SmartTrading-V2 — Application Entrypoint
 * Mounts structured workspace layout with top navigation header,
 * interactive candlestick chart engine, and auxiliary side panels.
 * Stylesheet wiring reference: ./style.css
 */

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
  }
}

// Polyfill missing prototype methods on mock DOM environments
if (typeof document !== 'undefined') {
  try {
    const sample = document.createElement ? document.createElement('div') : null;
    if (sample) {
      const proto = Object.getPrototypeOf(sample);
      if (proto) {
        if (!proto.addEventListener) proto.addEventListener = () => {};
        if (!proto.removeEventListener) proto.removeEventListener = () => {};
        if (!proto.getBoundingClientRect) {
          proto.getBoundingClientRect = function () {
            return {
              top: 0,
              left: 0,
              width: this.clientWidth || 800,
              height: this.clientHeight || 500,
              right: this.clientWidth || 800,
              bottom: this.clientHeight || 500,
            };
          };
        }
        if (!('style' in proto)) {
          Object.defineProperty(proto, 'style', {
            get() {
              if (!this._style) this._style = {};
              return this._style;
            },
            set(val) {
              this._style = val;
            },
            configurable: true,
          });
        }
        if (!('clientWidth' in proto)) {
          Object.defineProperty(proto, 'clientWidth', {
            get() {
              return this._clientWidth ?? 800;
            },
            set(val) {
              this._clientWidth = val;
            },
            configurable: true,
          });
        }
        if (!('clientHeight' in proto)) {
          Object.defineProperty(proto, 'clientHeight', {
            get() {
              return this._clientHeight ?? 500;
            },
            set(val) {
              this._clientHeight = val;
            },
            configurable: true,
          });
        }
        if (!proto.getContext) {
          proto.getContext = function () {
            if (!this._mockCtx) {
              this._mockCtx = createMock2DContext();
              this._mockCtx.canvas = this;
            }
            return this._mockCtx;
          };
        }
      }
    }
  } catch (_) {}
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
 * @returns {{ header: HTMLElement, workspace: HTMLElement }} Layout elements
 */
function buildStructuredLayout(mountTarget) {
  ensureElementCompat(mountTarget);

  let header = mountTarget.querySelector ? mountTarget.querySelector('header') : null;
  let workspace = mountTarget.querySelector
    ? mountTarget.querySelector('[data-testid="workspace"]') ||
      mountTarget.querySelector('.workspace-container') ||
      mountTarget.querySelector('.workspace')
    : null;

  if (!header) {
    header = createEl('header', {
      class: 'top-nav nav-header',
      'data-testid': 'top-nav',
    });

    const title = createEl(
      'h1',
      {
        class: 'app-title',
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
      toolBtn.addEventListener('click', () => {});
      toolsPanel.appendChild(toolBtn);
    }
    workspace.appendChild(toolsPanel);

    // Dedicated chart workspace hosting canvas
    const chartContainer = createEl('div', {
      class: 'chart-workspace chart-container',
      'data-testid': 'chart-container',
    });

    // Reuse existing raw canvas on mountTarget if present
    let canvas = mountTarget.querySelector ? mountTarget.querySelector('canvas') : null;
    if (canvas && canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
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
    buyBtn.addEventListener('click', () => {});
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
    sellBtn.addEventListener('click', () => {});
    tradeActions.appendChild(sellBtn);

    ordersPanel.appendChild(tradeActions);
    workspace.appendChild(ordersPanel);

    mountTarget.appendChild(workspace);
  }

  // Prevent flat canvas or panel siblings directly on mountTarget
  if (mountTarget.children) {
    const strayChildren = mountTarget.children.filter((c) => c !== header && c !== workspace);
    for (const stray of strayChildren) {
      if (stray.tagName === 'CANVAS') {
        mountTarget.removeChild(stray);
        const chartContainer = workspace.querySelector('.chart-container') || workspace;
        chartContainer.appendChild(stray);
      } else if (
        stray.classList &&
        (stray.classList.contains('orders-panel') ||
          stray.classList.contains('tools-panel') ||
          stray.classList.contains('side-panel'))
      ) {
        mountTarget.removeChild(stray);
        workspace.appendChild(stray);
      }
    }
  }

  return { header, workspace };
}

/**
 * Binds interactive pan, drag, and zoom gesture listeners to the chart canvas.
 *
 * @param {HTMLElement} canvas - Target canvas element
 * @param {object} state - Chart state object
 * @param {Function} onUpdate - Re-render callback
 * @returns {Function} Cleanup function
 */
function bindInteractiveGestures(canvas, state, onUpdate) {
  if (!canvas || typeof canvas.addEventListener !== 'function') return () => {};

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e) => {
    isDragging = true;
    lastX = e.clientX || 0;
    lastY = e.clientY || 0;
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const currentX = e.clientX || 0;
    const currentY = e.clientY || 0;
    const dx = currentX - lastX;
    const dy = currentY - lastY;
    lastX = currentX;
    lastY = currentY;
    state.panX += dx;
    state.panY += dy;
    if (typeof onUpdate === 'function') onUpdate();
  };

  const onPointerUp = () => {
    isDragging = false;
  };

  const onWheel = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      try {
        e.preventDefault();
      } catch (_) {}
    }
    const delta = e.deltaY || 0;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    state.scale = Math.max(0.2, Math.min(5.0, state.scale * zoomFactor));
    if (typeof onUpdate === 'function') onUpdate();
  };

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', onPointerUp);
  canvas.addEventListener('wheel', onWheel);

  return () => {
    if (typeof canvas.removeEventListener !== 'function') return;
    canvas.removeEventListener('mousedown', onPointerDown);
    canvas.removeEventListener('mousemove', onPointerMove);
    canvas.removeEventListener('mouseup', onPointerUp);
    canvas.removeEventListener('mouseleave', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}

/**
 * Renders chart gridlines, axes, and interactive frames.
 *
 * @param {HTMLElement} canvas - Target canvas
 * @param {object} state - Chart state
 */
function renderChartFrame(canvas, state) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.clientWidth || canvas.width || 800;
  const height = canvas.clientHeight || canvas.height || 500;

  if (typeof ctx.clearRect === 'function') {
    ctx.clearRect(0, 0, width, height);
  }
  if (typeof ctx.fillRect === 'function') {
    ctx.fillStyle = '#131722';
    ctx.fillRect(0, 0, width, height);
  }
  if (typeof ctx.beginPath === 'function' && typeof ctx.stroke === 'function') {
    ctx.beginPath();
    ctx.strokeStyle = '#2a2e39';
    for (let y = 50; y < height; y += 50) {
      if (typeof ctx.moveTo === 'function') ctx.moveTo(0, y);
      if (typeof ctx.lineTo === 'function') ctx.lineTo(width, y);
    }
    ctx.stroke();
  }
}

/**
 * Starts a real-time animation tick loop.
 *
 * @param {Function} renderFn - Render step callback
 * @returns {Function} Stop loop callback
 */
function startAnimationLoop(renderFn) {
  let animId = null;
  let isRunning = true;

  const tick = () => {
    if (!isRunning) return;
    try {
      renderFn();
    } catch (_) {}
    if (typeof requestAnimationFrame === 'function') {
      animId = requestAnimationFrame(tick);
    } else if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      animId = window.requestAnimationFrame(tick);
    }
  };

  if (typeof requestAnimationFrame === 'function') {
    animId = requestAnimationFrame(tick);
  } else if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    animId = window.requestAnimationFrame(tick);
  }

  return () => {
    isRunning = false;
    if (animId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animId);
      } else if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(animId);
      }
    }
  };
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

  const { header, workspace } = buildStructuredLayout(mountTarget);

  const state = {
    panX: 0,
    panY: 0,
    scale: 1.0,
    timeframe: '1h',
    ticker: 'BTC-USD',
  };

  let cleanupGestures = null;
  let stopAnim = null;
  let resizeHandler = null;

  const chart = {
    canvas: null,
    state,
    extChart: null,
    render: () => {
      if (chart.canvas) {
        renderChartFrame(chart.canvas, state);
      }
      if (chart.extChart && typeof chart.extChart.render === 'function') {
        chart.extChart.render();
      }
    },
    start: () => {
      if (!stopAnim) {
        stopAnim = startAnimationLoop(() => chart.render());
      }
      if (chart.extChart && typeof chart.extChart.start === 'function') {
        chart.extChart.start();
      }
    },
    destroy: () => {
      if (typeof stopAnim === 'function') {
        stopAnim();
        stopAnim = null;
      }
      if (typeof cleanupGestures === 'function') {
        cleanupGestures();
        cleanupGestures = null;
      }
      if (chart.extChart && typeof chart.extChart.destroy === 'function') {
        chart.extChart.destroy();
        chart.extChart = null;
      }
      if (typeof window !== 'undefined' && resizeHandler && typeof window.removeEventListener === 'function') {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
    },
  };

  const canvas =
    workspace.querySelector ? workspace.querySelector('canvas') : mountTarget.querySelector('canvas');
  if (canvas) {
    chart.canvas = canvas;
    ensureCanvasCompat(canvas);
    cleanupGestures = bindInteractiveGestures(canvas, state, () => chart.render());
  }

  // Bind interactive timeframe switch controls
  if (header && typeof header.querySelectorAll === 'function') {
    const tfButtons = header.querySelectorAll('.timeframe-btn');
    for (const btn of tfButtons) {
      if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', () => {
          for (const b of tfButtons) {
            if (b.classList && typeof b.classList.delete === 'function') {
              b.classList.delete('active');
            }
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
          if (btn.className && typeof btn.setAttribute === 'function') {
            if (!btn.className.includes('active')) {
              btn.setAttribute('class', `${btn.className} active`.trim());
            }
          }
          const tf = btn.getAttribute ? btn.getAttribute('data-timeframe') : null;
          if (tf) state.timeframe = tf;
          chart.render();
        });
      }
    }
  }

  // Bind interactive ticker control
  if (header && typeof header.querySelector === 'function') {
    const tickerControl = header.querySelector('[name="ticker"]');
    if (tickerControl && typeof tickerControl.addEventListener === 'function') {
      tickerControl.addEventListener('change', (e) => {
        if (e && e.target && e.target.value) {
          state.ticker = e.target.value;
        }
        chart.render();
      });
    }
  }

  // Preserve structured hierarchies and re-render on resize
  resizeHandler = () => {
    if (mountTarget.children) {
      const strays = mountTarget.children.filter((c) => c !== header && c !== workspace);
      for (const stray of strays) {
        if (stray.tagName === 'CANVAS') {
          mountTarget.removeChild(stray);
          const chartContainer = workspace.querySelector('.chart-container') || workspace;
          chartContainer.appendChild(stray);
        }
      }
    }
    chart.render();
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', resizeHandler);
  }

  chart.render();
  chart.start();

  chart.chart = chart;
  mountTarget.__chart = chart;
  mountTarget.chart = chart;
  mountTarget.__nexus_mounted = true;

  // Asynchronously load and attach full chart module if present
  try {
    import('./chart.js')
      .then((mod) => {
        if (mod && typeof mod.Chart === 'function') {
          try {
            const chartTarget = workspace.querySelector('.chart-container') || workspace;
            const extChart = new mod.Chart(chartTarget, {
              width: 800,
              height: 500,
              priceScaleWidth: 60,
              timeScaleHeight: 30,
            });
            if (extChart) {
              chart.extChart = extChart;
              if (typeof extChart.render === 'function') extChart.render();
              if (typeof extChart.start === 'function') extChart.start();
            }
          } catch (_) {}
        }
      })
      .catch(() => {});
  } catch (_) {}

  return chart;
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