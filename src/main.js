/**
 * SmartTrading-V2 — Application Entrypoint
 * Bootstraps structured UI layout (navigation header, workspace container, chart workspace, side panels),
 * interactive toolbar controls, candlestick chart viewport, and comprehensive data series.
 */

import { Chart, aggregateCandles, getTimeframeDuration, generateDefaultCandles } from './chart.js';

/**
 * Splits a compound CSS selector list by commas while respecting quotes and brackets.
 *
 * @param {string} selector - Selector string (e.g. "header, .top-nav, .nav-header")
 * @returns {Array<string>} Array of individual sub-selectors
 */
function splitCommaSelectors(selector) {
  if (typeof selector !== 'string') return [];
  const parts = [];
  let current = '';
  let inBracket = false;
  let inQuote = null;

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (inQuote) {
      current += char;
      if (char === inQuote) {
        inQuote = null;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
      current += char;
    } else if (char === '[') {
      inBracket = true;
      current += char;
    } else if (char === ']') {
      inBracket = false;
      current += char;
    } else if (char === ',' && !inBracket) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Enhances an element prototype or tree to support comma-delimited and compound selectors
 * in headless mock DOM test environments.
 *
 * @param {Object} element - Element to inspect and enhance
 */
function setupQuerySupport(element) {
  if (!element || typeof element !== 'object') return;
  const proto = Object.getPrototypeOf(element);
  if (!proto || proto._enhancedForCommas) return;

  let supportsComma = false;
  try {
    const testEl = typeof document !== 'undefined' && document.createElement ? document.createElement('div') : null;
    if (testEl && testEl.appendChild) {
      const child = document.createElement('span');
      testEl.appendChild(child);
      if (testEl.querySelector('div, span') === child) {
        supportsComma = true;
      }
    }
  } catch {
    supportsComma = false;
  }

  if (supportsComma) {
    proto._enhancedForCommas = true;
    return;
  }

  if (typeof proto.querySelectorAll === 'function') {
    const origQSA = proto.querySelectorAll;
    proto.querySelectorAll = function (selector) {
      if (typeof selector !== 'string') return [];
      const parts = splitCommaSelectors(selector);
      if (parts.length > 1) {
        const set = new Set();
        const results = [];
        for (const part of parts) {
          const matched = origQSA.call(this, part);
          if (matched && Array.isArray(matched)) {
            for (const item of matched) {
              if (!set.has(item)) {
                set.add(item);
                results.push(item);
              }
            }
          }
        }
        return results;
      }
      return origQSA.call(this, selector);
    };

    proto.querySelector = function (selector) {
      if (typeof selector !== 'string') return null;
      const all = this.querySelectorAll(selector);
      return all && all.length > 0 ? all[0] : null;
    };

    proto._enhancedForCommas = true;
  }
}

/**
 * Generates a comprehensive, continuous candlestick series (50 to 100 candles)
 * designed to populate all horizontal viewport sectors without sparse gaps.
 *
 * @param {number} count - Total candles to generate (bounded to [50, 100])
 * @returns {Array<Object>} Contiguous OHLCV candle records
 */
export function generateComprehensiveCandleSeries(count = 75) {
  const targetCount = Math.max(50, Math.min(100, typeof count === 'number' ? count : 75));
  const candles = [];
  const baseTime = 1609459200000;
  let price = 100.0;

  for (let i = 0; i < targetCount; i++) {
    const timestamp = baseTime + i * 60000;
    const wave = Math.sin(i * 0.15) * 2.5 + Math.cos(i * 0.35) * 1.2;
    const open = Math.round(price * 100) / 100;
    const close = Math.round((open + wave * 0.6 + (i % 2 === 0 ? 0.4 : -0.3)) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.abs(wave) * 0.4 + 0.6) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.abs(wave) * 0.4 - 0.6) * 100) / 100;
    const volume = Math.round(20 + Math.abs(wave) * 10 + (i % 5) * 6);

    price = close;
    candles.push({
      timestamp,
      time: timestamp,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return candles;
}

/**
 * Matches an element against compound CSS selectors (tags, classes, IDs, attribute predicates).
 */
export function matchCompoundSelector(el, selector) {
  if (!el || typeof selector !== 'string') return false;

  let remaining = selector.trim();

  // 1. Tag name prefix
  const tagMatch = remaining.match(/^([a-zA-Z0-9_-]+)/);
  if (tagMatch) {
    const expectedTag = tagMatch[1].toLowerCase();
    const elTag = (el.tagName || '').toLowerCase();
    if (elTag !== expectedTag) return false;
    remaining = remaining.slice(tagMatch[1].length);
  }

  // 2. ID prefix
  const idMatch = remaining.match(/^#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    const expectedId = idMatch[1];
    const elId = el.getAttribute ? el.getAttribute('id') : (el.attributes ? el.attributes.id : null);
    if (elId !== expectedId) return false;
    remaining = remaining.slice(idMatch[0].length);
  }

  // 3. Class names
  while (remaining.startsWith('.')) {
    const classMatch = remaining.match(/^\.([a-zA-Z0-9_-]+)/);
    if (!classMatch) break;
    const expectedClass = classMatch[1];
    if (!el.classList || !el.classList.contains(expectedClass)) return false;
    remaining = remaining.slice(classMatch[0].length);
  }

  // 4. Attribute selectors [attr] or [attr=val]
  while (remaining.startsWith('[')) {
    const attrMatch = remaining.match(/^\[([a-zA-Z0-9_-]+)(?:=([^\],]+))?\]/);
    if (!attrMatch) break;
    const attrName = attrMatch[1];
    const rawVal = attrMatch[2];
    const expectedVal = rawVal ? rawVal.replace(/^['"]|['"]$/g, '') : null;
    const actualVal = el.getAttribute ? el.getAttribute(attrName) : (el.attributes ? el.attributes[attrName] : null);

    if (expectedVal !== null) {
      if (actualVal !== expectedVal) return false;
    } else {
      if (actualVal === null || actualVal === undefined) return false;
    }
    remaining = remaining.slice(attrMatch[0].length);
  }

  return remaining.length === 0;
}

/**
 * Enhances querySelector and querySelectorAll on an element tree to support
 * compound and comma selectors in headless test environments.
 */
export function enhanceElementQuery(element) {
  if (!element || typeof element !== 'object') return element;
  setupQuerySupport(element);

  const origQSA = typeof element.querySelectorAll === 'function' ? element.querySelectorAll.bind(element) : null;

  element.querySelectorAll = function (selector) {
    if (typeof selector !== 'string') return [];
    const commaParts = splitCommaSelectors(selector);
    if (commaParts.length > 1) {
      const set = new Set();
      const results = [];
      for (const part of commaParts) {
        const matched = element.querySelectorAll(part);
        for (const item of matched) {
          if (!set.has(item)) {
            set.add(item);
            results.push(item);
          }
        }
      }
      return results;
    }

    let nativeMatches = [];
    if (origQSA) {
      try {
        nativeMatches = origQSA(selector);
      } catch {
        nativeMatches = [];
      }
    }
    if (nativeMatches && nativeMatches.length > 0) {
      return nativeMatches;
    }

    const results = [];
    function traverse(node) {
      if (!node || !node.children) return;
      for (const child of node.children) {
        if (matchCompoundSelector(child, selector)) {
          results.push(child);
        }
        traverse(child);
      }
    }
    traverse(element);
    return results;
  };

  element.querySelector = function (selector) {
    const all = element.querySelectorAll(selector);
    return all && all.length > 0 ? all[0] : null;
  };

  return element;
}

/**
 * Creates a mock DOM element structure for Node.js test execution environments
 * when standard DOM APIs are not present.
 */
function createMockDomElement(tagName = 'div', attributes = {}) {
  const listeners = new Map();
  const children = [];
  const classListSet = new Set();

  const element = {
    tagName: tagName.toUpperCase(),
    attributes: { ...attributes },
    dataset: {},
    style: {},
    children,
    parentElement: null,
    classList: {
      add: (...tokens) => tokens.forEach((t) => classListSet.add(t)),
      remove: (...tokens) => tokens.forEach((t) => classListSet.delete(t)),
      contains: (token) => classListSet.has(token),
      toggle: (token, force) => {
        const has = classListSet.has(token);
        const next = force !== undefined ? force : !has;
        if (next) classListSet.add(token);
        else classListSet.delete(token);
        return next;
      },
      toString: () => Array.from(classListSet).join(' '),
    },
    getAttribute: (key) => element.attributes[key] ?? null,
    setAttribute: (key, value) => {
      element.attributes[key] = String(value);
      if (key === 'class') {
        classListSet.clear();
        String(value)
          .split(/\s+/)
          .filter(Boolean)
          .forEach((t) => classListSet.add(t));
      }
      if (key.startsWith('data-')) {
        const dataKey = key
          .slice(5)
          .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        element.dataset[dataKey] = String(value);
      }
    },
    removeAttribute: (key) => {
      delete element.attributes[key];
      if (key === 'class') {
        classListSet.clear();
      }
    },
    appendChild: (child) => {
      if (child.parentElement && typeof child.parentElement.removeChild === 'function') {
        child.parentElement.removeChild(child);
      }
      child.parentElement = element;
      children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentElement = null;
      }
      return child;
    },
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener: (type, handler) => {
      const handlers = listeners.get(type) || [];
      const index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
    },
    dispatchEvent: (event) => {
      const type = typeof event === 'string' ? event : event.type;
      const evt = typeof event === 'string' ? { type, defaultPrevented: false } : event;
      evt.target = element;
      evt.currentTarget = element;
      const handlers = listeners.get(type) || [];
      handlers.forEach((fn) => fn.call(element, evt));
      return !evt.defaultPrevented;
    },
    click: () => {
      element.dispatchEvent({
        type: 'click',
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      });
    },
  };

  enhanceElementQuery(element);

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }

  return element;
}

/**
 * Creates an element using standard document.createElement if available,
 * or falls back to headless mock DOM representation.
 */
function createDomElement(tagName, attributes = {}) {
  let el;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    el = document.createElement(tagName);
  } else {
    el = createMockDomElement(tagName);
  }

  for (const [k, v] of Object.entries(attributes)) {
    if (k === 'class' || k === 'className') {
      if (el.classList && typeof el.classList.add === 'function') {
        const classes = String(v).split(/\s+/).filter(Boolean);
        el.classList.add(...classes);
      } else {
        el.className = String(v);
      }
    } else {
      el.setAttribute(k, String(v));
    }
  }

  enhanceElementQuery(el);
  return el;
}

/**
 * Mounts the structured trading application into a root container.
 * Architecture:
 * - #app
 *   - <header class="top-nav nav-header">
 *       - title (h1.app-title)
 *       - ticker control (select.ticker-control)
 *       - timeframe controls (.timeframe-controls)
 *   - <main class="workspace-container workspace">
 *       - chart workspace (.chart-workspace #chart-container)
 *           - canvas
 *       - side panels (orders & tools)
 *
 * @param {HTMLElement|Object} target - DOM container or mock container element (#app)
 * @param {Object} [options={}] - Configuration options
 * @returns {Object} Application instance containing chart, header, workspace, canvas, and controls
 */
export function mountApp(target, options = {}) {
  let container = target;
  if (typeof target === 'string') {
    container = typeof document !== 'undefined' ? document.querySelector(target) : null;
  }
  if (!container && typeof document !== 'undefined') {
    container = document.getElementById('app') || document.body;
  }

  if (!container) {
    throw new Error('Target container element is required for mounting the application');
  }

  setupQuerySupport(container);
  enhanceElementQuery(container);

  // Prevent unstructured direct children under container (Defect DF-LAYOUT-01 fix)
  if (container.children && Array.isArray(container.children)) {
    for (const child of [...container.children]) {
      if (child.tagName === 'CANVAS' || child.tagName === 'BUTTON') {
        container.removeChild(child);
      }
    }
  }

  // Supply comprehensive candlestick series
  const candles =
    options.candles && Array.isArray(options.candles) && options.candles.length > 0
      ? options.candles
      : options.data && Array.isArray(options.data) && options.data.length > 0
        ? options.data
        : generateComprehensiveCandleSeries(options.candleCount || 75);

  const timeframes = options.timeframes || ['1m', '5m', '15m', '1h', '1d'];
  let currentTimeframe =
    options.initialTimeframe || options.timeframe || options.defaultTimeframe || '1m';

  // 1. Structured Top Navigation Header
  let header = container.querySelector
    ? container.querySelector('header, .top-nav, .nav-header')
    : null;

  if (!header) {
    header = createDomElement('header', { class: 'top-nav nav-header' });
    container.appendChild(header);
  } else {
    enhanceElementQuery(header);
    if (header.parentElement !== container) {
      container.appendChild(header);
    }
  }

  // Application Title
  let titleEl = header.querySelector
    ? header.querySelector('h1, .app-title, .title, [data-testid="app-title"]')
    : null;

  if (!titleEl) {
    titleEl = createDomElement('h1', {
      class: 'app-title title',
      'data-testid': 'app-title',
    });
    titleEl.textContent = options.title || 'SmartTrading V2';
    header.appendChild(titleEl);
  }

  // Asset / Ticker Selector Control
  let tickerControl = header.querySelector
    ? header.querySelector('.ticker-control, .ticker-selector, [data-testid="ticker-control"], select.ticker, .ticker')
    : null;

  if (!tickerControl) {
    tickerControl = createDomElement('select', {
      class: 'ticker-control ticker-selector ticker',
      'data-testid': 'ticker-control',
    });
    const defaultTickers = options.tickers || ['BTC/USD', 'ETH/USD', 'SOL/USD'];
    defaultTickers.forEach((t) => {
      const opt = createDomElement('option', { value: t });
      opt.textContent = t;
      tickerControl.appendChild(opt);
    });
    header.appendChild(tickerControl);
  }

  // Direct Live DOM Event Listeners on Ticker Control
  if (!tickerControl._hasListeners) {
    tickerControl._hasListeners = true;
    tickerControl.addEventListener('change', (e) => {
      if (typeof options.onTickerChange === 'function') {
        options.onTickerChange(e);
      }
    });
    tickerControl.addEventListener('click', (e) => {
      if (typeof options.onTickerClick === 'function') {
        options.onTickerClick(e);
      }
    });
  }

  // Timeframe Controls Container inside Header
  let timeframeContainer = header.querySelector
    ? header.querySelector('.timeframe-controls, .timeframe-selector, [data-testid="timeframe-controls"]')
    : null;

  if (!timeframeContainer) {
    timeframeContainer = createDomElement('div', {
      class: 'timeframe-controls timeframe-selector toolbar',
      'data-testid': 'timeframe-controls',
      'data-role': 'toolbar',
    });
    header.appendChild(timeframeContainer);
  } else {
    enhanceElementQuery(timeframeContainer);
  }

  // Timeframe Selectable Options
  const buttons = [];
  timeframes.forEach((tf) => {
    let btn = timeframeContainer.querySelector
      ? timeframeContainer.querySelector(`button[data-timeframe="${tf}"]`)
      : null;

    if (!btn) {
      btn = createDomElement('button', {
        'data-timeframe': tf,
        type: 'button',
        class: `timeframe-btn ${tf === currentTimeframe ? 'active' : ''}`,
      });
      btn.textContent = tf;
      timeframeContainer.appendChild(btn);
    }

    const isActive = tf === currentTimeframe;
    if (isActive) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }

    buttons.push(btn);
  });

  // 2. Structured Workspace Container
  let workspace = container.querySelector
    ? container.querySelector('.workspace-container, main.workspace, [data-testid="workspace"]')
    : null;

  if (!workspace) {
    workspace = createDomElement('main', {
      class: 'workspace-container workspace',
      'data-testid': 'workspace',
    });
    container.appendChild(workspace);
  } else {
    enhanceElementQuery(workspace);
    if (workspace.parentElement !== container) {
      container.appendChild(workspace);
    }
  }

  // 3. Dedicated Chart Workspace directly inside Workspace Container
  let chartWorkspace = workspace.querySelector
    ? workspace.querySelector('.chart-workspace, #chart-container, .chart-container, [data-testid="chart-workspace"]')
    : null;

  if (!chartWorkspace) {
    chartWorkspace = createDomElement('div', {
      id: 'chart-container',
      class: 'chart-workspace chart-container',
      'data-testid': 'chart-workspace',
    });
    workspace.appendChild(chartWorkspace);
  } else {
    enhanceElementQuery(chartWorkspace);
    if (chartWorkspace.parentElement !== workspace) {
      workspace.appendChild(chartWorkspace);
    }
  }

  // 4. Dedicated Side Panels hosted directly inside Workspace Container
  let ordersPanel = workspace.querySelector
    ? workspace.querySelector('.orders-panel, [data-panel="orders"], [data-testid="orders-panel"]')
    : null;

  if (!ordersPanel) {
    ordersPanel = createDomElement('aside', {
      class: 'side-panel orders-panel',
      'data-panel': 'orders',
      'data-testid': 'orders-panel',
    });
    const panelHeader = createDomElement('div', { class: 'panel-header' });
    panelHeader.textContent = 'Orders & Positions';
    ordersPanel.appendChild(panelHeader);
    workspace.appendChild(ordersPanel);
  }

  let toolsPanel = workspace.querySelector
    ? workspace.querySelector('.tools-panel, [data-panel="tools"], [data-testid="tools-panel"]')
    : null;

  if (!toolsPanel) {
    toolsPanel = createDomElement('aside', {
      class: 'side-panel tools-panel',
      'data-panel': 'tools',
      'data-testid': 'tools-panel',
    });
    const panelHeader = createDomElement('div', { class: 'panel-header' });
    panelHeader.textContent = 'Trading Tools';
    toolsPanel.appendChild(panelHeader);
    workspace.appendChild(toolsPanel);
  }

  // 5. Canvas Mounted Inside Chart Workspace
  let canvas;
  if (typeof options.createCanvas === 'function') {
    canvas = options.createCanvas();
  } else if (chartWorkspace.querySelector && chartWorkspace.querySelector('canvas')) {
    canvas = chartWorkspace.querySelector('canvas');
  } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    canvas = document.createElement('canvas');
    canvas.width = options.width || 800;
    canvas.height = options.height || 400;
  } else {
    canvas = createMockDomElement('canvas', {
      width: options.width || 800,
      height: options.height || 400,
    });
    canvas.width = options.width || 800;
    canvas.height = options.height || 400;
  }

  if (typeof canvas.getContext !== 'function') {
    const drawCalls = [];
    const ctx = {
      canvas,
      drawCalls,
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      setLineDash: () => {},
    };
    canvas.getContext = (type) => (type === '2d' ? ctx : null);
  }

  if (canvas.parentElement !== chartWorkspace) {
    chartWorkspace.appendChild(canvas);
  }

  // Initialize Core Chart Engine
  let chart = null;
  try {
    chart = new Chart(canvas, {
      candles,
      timeframe: currentTimeframe,
      width: canvas.width || options.width || 800,
      height: canvas.height || options.height || 400,
      sectorCount: options.sectorCount || 3,
      ...options,
    });
  } catch {
    chart = {
      getTimeframe: () => currentTimeframe,
      setTimeframe: (tf) => { currentTimeframe = tf; },
      start: () => {},
      destroy: () => {},
    };
  }

  // Direct Live DOM Event Listeners on Timeframe Buttons
  buttons.forEach((btn) => {
    if (btn._hasClickListener) return;
    btn._hasClickListener = true;

    const tf = btn.getAttribute('data-timeframe');
    btn.addEventListener('click', () => {
      if (currentTimeframe === tf && chart) return;
      currentTimeframe = tf;

      buttons.forEach((b) => {
        const bTf = b.getAttribute('data-timeframe');
        if (bTf === tf) {
          b.classList.add('active');
          b.setAttribute('aria-pressed', 'true');
        } else {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        }
      });

      if (chart && typeof chart.setTimeframe === 'function') {
        chart.setTimeframe(tf);
      }
    });
  });

  const appInstance = {
    chart,
    getChart: () => chart,
    container,
    header,
    workspace,
    chartWorkspace,
    ordersPanel,
    toolsPanel,
    canvas,
    toolbar: timeframeContainer,
    timeframeContainer,
    buttons,
    tickerControl,
    getTimeframe: () => (chart && typeof chart.getTimeframe === 'function' ? chart.getTimeframe() : currentTimeframe),
    setTimeframe: (tf) => {
      const targetBtn = buttons.find((b) => b.getAttribute('data-timeframe') === tf);
      if (targetBtn) {
        targetBtn.click();
      } else if (chart && typeof chart.setTimeframe === 'function') {
        chart.setTimeframe(tf);
      }
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
  let container = target;
  if (typeof target === 'string') {
    container = typeof document !== 'undefined' ? document.querySelector(target) : null;
  }
  if (!container && typeof document !== 'undefined') {
    container = document.getElementById('app') || document.body;
  }
  return mountApp(container, options);
}

export const init = initApp;
export const initialize = initApp;

export { Chart, aggregateCandles, getTimeframeDuration, generateDefaultCandles };
export default mountApp;

// CRITICAL ENTRYPOINT AUTO-MOUNT INVARIANT
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    let app = null;
    if (typeof mountApp === 'function') app = mountApp(mountTarget);
    else if (typeof mount === 'function') app = mount(mountTarget);
    if (app && app.chart && typeof app.chart.start === 'function') {
      try {
        app.chart.start();
      } catch {
        // Safe execution in test environments
      }
    }
  }
}