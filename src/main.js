/**
 * SmartTrading-V2 — Main Application Entry Point
 * Orchestrates application mounting, toolbar controls, real-time data ticker updates,
 * clock ticks, order book state, and candlestick chart rendering.
 */

import {
  Chart,
  ChartCanvas,
  DEFAULT_MIN_ZOOM,
  DEFAULT_MAX_ZOOM,
  aggregateCandles,
  getTimeframeDuration,
} from './chart.js';

export { Chart, ChartCanvas, DEFAULT_MIN_ZOOM, DEFAULT_MAX_ZOOM, aggregateCandles, getTimeframeDuration };

/**
 * Matches a DOM element against basic and compound CSS selectors.
 * Supports tag names, classes, IDs, and attribute selectors.
 *
 * @param {Object|HTMLElement} element - Target element to evaluate
 * @param {string} selector - CSS selector string
 * @returns {boolean} True if element matches selector
 */
export function elementMatches(element, selector) {
  if (!element || !selector) return false;
  selector = selector.trim();

  if (selector.includes(',')) {
    return selector.split(',').some((sel) => elementMatches(element, sel.trim()));
  }

  let remaining = selector;

  // 1. Tag name (e.g. "button", "div", "canvas")
  const tagMatch = remaining.match(/^([a-zA-Z0-9_-]+)/);
  if (tagMatch) {
    const expectedTag = tagMatch[1].toLowerCase();
    const actualTag = (element.tagName || element.nodeName || '').toLowerCase();
    if (actualTag !== expectedTag) return false;
    remaining = remaining.slice(tagMatch[0].length);
  }

  // 2. ID (e.g. "#id")
  const idMatch = remaining.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    const expectedId = idMatch[1];
    const actualId =
      element.id ||
      (typeof element.getAttribute === 'function' ? element.getAttribute('id') : null) ||
      (element.attributes && element.attributes.id);
    if (actualId !== expectedId) return false;
    remaining = remaining.replace(idMatch[0], '');
  }

  // 3. Classes (e.g. ".toolbar", ".active")
  const classMatches = remaining.match(/\.([a-zA-Z0-9_-]+)/g);
  if (classMatches) {
    for (const cm of classMatches) {
      const className = cm.slice(1);
      if (element.classList && typeof element.classList.contains === 'function') {
        if (!element.classList.contains(className)) return false;
      } else {
        const classAttr =
          element.className ||
          (typeof element.getAttribute === 'function' ? element.getAttribute('class') : '') ||
          (element.attributes && element.attributes.class) ||
          '';
        const classes = String(classAttr).split(/\s+/).filter(Boolean);
        if (!classes.includes(className)) return false;
      }
      remaining = remaining.replace(cm, '');
    }
  }

  // 4. Attributes (e.g. "[data-timeframe]", "[data-timeframe='1m']")
  const attrMatches = remaining.match(/\[([a-zA-Z0-9_-]+)(?:=([^\]]+))?\]/g);
  if (attrMatches) {
    for (const am of attrMatches) {
      const match = am.match(/^\[([a-zA-Z0-9_-]+)(?:=(.*))?\]$/);
      if (!match) return false;
      const attrName = match[1];
      const attrVal = match[2];

      let actualVal = null;
      if (typeof element.getAttribute === 'function') {
        actualVal = element.getAttribute(attrName);
      } else if (element.attributes && attrName in element.attributes) {
        actualVal = element.attributes[attrName];
      }

      if (actualVal === null || actualVal === undefined) return false;

      if (attrVal !== undefined) {
        const cleanExpected = attrVal.replace(/^["']|["']$/g, '');
        if (String(actualVal) !== cleanExpected) return false;
      }
      remaining = remaining.replace(am, '');
    }
  }

  return remaining.trim().length === 0;
}

/**
 * Patches a container or mock element to support compound selectors and traversal.
 *
 * @param {Object|HTMLElement} element - Target container or mock element
 * @returns {Object|HTMLElement} Patched element
 */
export function patchMockElement(element) {
  if (!element || typeof element !== 'object') return element;
  if (element.__nexus_patched) return element;
  element.__nexus_patched = true;

  const originalQSA = element.querySelectorAll;

  element.querySelectorAll = function (selector) {
    const results = [];
    function traverse(node) {
      if (!node || !Array.isArray(node.children)) return;
      for (const child of node.children) {
        if (elementMatches(child, selector)) {
          results.push(child);
        }
        traverse(child);
      }
    }
    traverse(element);
    if (results.length === 0 && typeof originalQSA === 'function') {
      try {
        const origResults = originalQSA.call(element, selector);
        if (origResults && origResults.length > 0) {
          return origResults;
        }
      } catch {}
    }
    return results;
  };

  element.querySelector = function (selector) {
    const all = element.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  };

  const origAppend = element.appendChild;
  if (typeof origAppend === 'function') {
    element.appendChild = function (child) {
      patchMockElement(child);
      return origAppend.call(element, child);
    };
  }

  if (Array.isArray(element.children)) {
    for (const child of element.children) {
      patchMockElement(child);
    }
  }

  return element;
}

/**
 * Creates a standard DOM element in browser or a compliant mock element in headless/test environments.
 *
 * @param {string} tagName - HTML tag name
 * @param {Object} [attributes={}] - Initial attribute map
 * @returns {HTMLElement|Object} DOM or mock element
 */
function createDOMElement(tagName, attributes = {}) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const el = document.createElement(tagName);
    for (const [key, value] of Object.entries(attributes)) {
      el.setAttribute(key, String(value));
    }
    return el;
  }

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
    textContent: '',
    classList: {
      add: (...tokens) => {
        tokens.forEach((t) => classListSet.add(t));
        element.attributes['class'] = Array.from(classListSet).join(' ');
      },
      remove: (...tokens) => {
        tokens.forEach((t) => classListSet.delete(t));
        element.attributes['class'] = Array.from(classListSet).join(' ');
      },
      contains: (token) => classListSet.has(token),
      toggle: (token, force) => {
        const has = classListSet.has(token);
        const next = force !== undefined ? force : !has;
        if (next) classListSet.add(token);
        else classListSet.delete(token);
        element.attributes['class'] = Array.from(classListSet).join(' ');
        return next;
      },
      toString: () => Array.from(classListSet).join(' '),
    },
    getAttribute: (key) => element.attributes[key] ?? null,
    setAttribute: (key, value) => {
      element.attributes[key] = String(value);
      if (key === 'class') {
        classListSet.clear();
        value
          .split(/\s+/)
          .filter(Boolean)
          .forEach((c) => classListSet.add(c));
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
      if (key === 'class') classListSet.clear();
    },
    appendChild: (child) => {
      child.parentElement = element;
      children.push(child);
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
      event.target = element;
      event.currentTarget = element;
      const handlers = listeners.get(event.type) || [];
      handlers.forEach((fn) => fn(event));
      return !event.defaultPrevented;
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
    querySelector: (selector) => {
      const all = element.querySelectorAll(selector);
      return all.length > 0 ? all[0] : null;
    },
    querySelectorAll: (selector) => {
      const results = [];
      function traverse(node) {
        for (const child of node.children || []) {
          if (elementMatches(child, selector)) {
            results.push(child);
          }
          traverse(child);
        }
      }
      traverse(element);
      return results;
    },
  };

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }

  if (tagName.toLowerCase() === 'canvas') {
    element.width = Number(attributes.width) || 800;
    element.height = Number(attributes.height) || 400;
    const drawCalls = [];
    const ctx = {
      canvas: element,
      drawCalls,
      clearRect: (x, y, w, h) => drawCalls.push({ type: 'clearRect', x, y, w, h }),
      fillRect: (x, y, w, h) => drawCalls.push({ type: 'fillRect', x, y, w, h }),
      strokeRect: (x, y, w, h) => drawCalls.push({ type: 'strokeRect', x, y, w, h }),
      beginPath: () => drawCalls.push({ type: 'beginPath' }),
      moveTo: (x, y) => drawCalls.push({ type: 'moveTo', x, y }),
      lineTo: (x, y) => drawCalls.push({ type: 'lineTo', x, y }),
      stroke: () => drawCalls.push({ type: 'stroke' }),
      fill: () => drawCalls.push({ type: 'fill' }),
      save: () => drawCalls.push({ type: 'save' }),
      restore: () => drawCalls.push({ type: 'restore' }),
      setTransform: (a, b, c, d, e, f) => drawCalls.push({ type: 'setTransform', a, b, c, d, e, f }),
    };
    element.getContext = (contextId) => {
      if (contextId === '2d') return ctx;
      return null;
    };
  }

  patchMockElement(element);
  return element;
}

/**
 * Resolves element from root container by ID or selector.
 *
 * @param {HTMLElement|Object} root - Root container
 * @param {string} id - Element identifier
 * @returns {HTMLElement|Object|null}
 */
function resolveElement(root, id) {
  if (!root) return null;
  if (root.id === id || root.getAttribute?.('id') === id || root.attributes?.id === id) return root;
  if (typeof root.querySelector === 'function') {
    const found =
      root.querySelector(`#${id}`) ||
      root.querySelector(`.${id}`) ||
      root.querySelector(`[data-testid="${id}"]`) ||
      root.querySelector(`[id="${id}"]`);
    if (found) return found;
  }
  if (Array.isArray(root.children)) {
    const found = root.children.find(
      (child) =>
        child &&
        (child.id === id ||
          child.getAttribute?.('id') === id ||
          child.attributes?.id === id ||
          child.classList?.contains?.(id))
    );
    if (found) return found;
  }
  return null;
}

/**
 * Finds canvas element in the container or validates container as canvas.
 *
 * @param {HTMLElement|Object} root - Root container
 * @returns {HTMLElement|Object|null}
 */
function resolveCanvas(root) {
  if (!root) return null;
  if (typeof root.getContext === 'function') return root;
  if (typeof root.querySelector === 'function') {
    const found =
      root.querySelector('canvas') ||
      root.querySelector('#chart-canvas') ||
      root.querySelector('#chart') ||
      root.querySelector('#candlestick-chart') ||
      root.querySelector('#canvas');
    if (found) return found;
  }
  if (Array.isArray(root.children)) {
    const found = root.children.find(
      (child) =>
        child &&
        (typeof child.getContext === 'function' ||
          child.tagName?.toLowerCase() === 'canvas' ||
          child.nodeName?.toLowerCase() === 'canvas' ||
          child.id === 'canvas' ||
          child.id === 'chart-canvas' ||
          child.id === 'candlestick-chart' ||
          child.id === 'chart')
    );
    if (found) return found;
  }
  return null;
}

/**
 * Mounts the trading application into a DOM root container.
 *
 * @param {HTMLElement|Object} container - DOM container element or mock element
 * @param {Object} [options={}] - Configuration options
 * @returns {Object} Application handle with lifecycle and chart state observation methods
 */
export function mountApp(container, options = {}) {
  const root =
    typeof container === 'string' && typeof document !== 'undefined'
      ? document.querySelector(container)
      : container;

  if (!root) {
    return {
      chart: null,
      container: null,
      getMutationCount: () => 0,
      getLastMutationTimestamp: () => 0,
      destroy: () => {},
      stop: () => {},
    };
  }

  patchMockElement(root);

  let mutationCount = 0;
  let lastMutationTimestamp = Date.now();

  let tickerEl = resolveElement(root, 'price-ticker') || resolveElement(root, 'ticker');
  let orderBookEl = resolveElement(root, 'order-book') || resolveElement(root, 'orderbook');
  let clockEl =
    resolveElement(root, 'clock-tick') ||
    resolveElement(root, 'clock') ||
    resolveElement(root, 'timestamp');

  if (!tickerEl && typeof root.appendChild === 'function') {
    try {
      tickerEl = createDOMElement('div', { id: 'price-ticker' });
      tickerEl.textContent = 'BTC/USD: $50000.00';
      root.appendChild(tickerEl);
    } catch {}
  }
  if (!orderBookEl && typeof root.appendChild === 'function') {
    try {
      orderBookEl = createDOMElement('div', { id: 'order-book' });
      orderBookEl.textContent = 'Bids: 100 | Asks: 100';
      root.appendChild(orderBookEl);
    } catch {}
  }
  if (!clockEl && typeof root.appendChild === 'function') {
    try {
      clockEl = createDOMElement('div', { id: 'clock-tick' });
      clockEl.textContent = new Date().toISOString();
      root.appendChild(clockEl);
    } catch {}
  }

  const timeframes = options.timeframes || ['1m', '5m', '1h'];
  let activeTimeframe = options.initialTimeframe || options.timeframe || '1m';

  let toolbarEl =
    (typeof root.querySelector === 'function' &&
      (root.querySelector('.toolbar') || root.querySelector('[data-role="toolbar"]'))) ||
    resolveElement(root, 'toolbar');

  if (!toolbarEl && typeof root.appendChild === 'function') {
    try {
      toolbarEl = createDOMElement('div', { class: 'toolbar', 'data-role': 'toolbar' });
      toolbarEl.classList.add('toolbar');
      toolbarEl.setAttribute('data-role', 'toolbar');
      root.appendChild(toolbarEl);
    } catch {}
  }

  let buttons =
    toolbarEl && typeof toolbarEl.querySelectorAll === 'function'
      ? toolbarEl.querySelectorAll('button[data-timeframe]')
      : [];

  if ((!buttons || buttons.length === 0) && toolbarEl && typeof toolbarEl.appendChild === 'function') {
    buttons = [];
    for (const tf of timeframes) {
      const isActive = tf === activeTimeframe;
      const btn = createDOMElement('button', {
        'data-timeframe': tf,
        'aria-pressed': isActive ? 'true' : 'false',
        class: isActive ? 'timeframe-btn active' : 'timeframe-btn',
      });
      if (isActive) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      btn.textContent = tf;
      toolbarEl.appendChild(btn);
      buttons.push(btn);
    }
  }

  let chart = options.chart || null;
  let canvasEl = resolveCanvas(root);

  if (!canvasEl) {
    if (typeof options.createCanvas === 'function') {
      canvasEl = options.createCanvas();
    } else {
      canvasEl = createDOMElement('canvas', {
        id: 'chart-canvas',
        width: options.width || 800,
        height: options.height || 400,
      });
      canvasEl.width = options.width || 800;
      canvasEl.height = options.height || 400;
    }
    if (canvasEl && typeof root.appendChild === 'function') {
      root.appendChild(canvasEl);
    }
  }

  if (!chart && canvasEl) {
    const chartConfig = {
      ...(options.chartOptions || options),
      candles: options.candles || options.chartOptions?.candles || options.data || [],
      timeframe: activeTimeframe,
      width: options.width || canvasEl.width || 800,
      height: options.height || canvasEl.height || 400,
    };
    chart = new Chart(canvasEl, chartConfig);
  }

  if (canvasEl && chart) {
    canvasEl.chart = chart;
    canvasEl.__chart = chart;
  }

  if (buttons && buttons.length > 0) {
    buttons.forEach((btn) => {
      const tf = btn.getAttribute('data-timeframe');
      const isActive = tf === activeTimeframe;
      if (isActive) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }

      btn.addEventListener('click', () => {
        if (activeTimeframe === tf) return;
        activeTimeframe = tf;

        const currentButtons =
          (toolbarEl &&
            typeof toolbarEl.querySelectorAll === 'function' &&
            toolbarEl.querySelectorAll('button[data-timeframe]')) ||
          buttons;

        currentButtons.forEach((b) => {
          const isTarget = b.getAttribute('data-timeframe') === tf;
          if (isTarget) {
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
  }

  if (chart && typeof chart.render === 'function') {
    chart.render();
  }

  if (chart && typeof chart.start === 'function' && options.autoStart !== false) {
    chart.start(options.fps || options.chartOptions?.fps || 60);
  }

  const update = () => {
    mutationCount++;
    lastMutationTimestamp = Date.now();

    const currentTicker =
      resolveElement(root, 'price-ticker') || resolveElement(root, 'ticker') || tickerEl;
    const currentOrderBook =
      resolveElement(root, 'order-book') || resolveElement(root, 'orderbook') || orderBookEl;
    const currentClock =
      resolveElement(root, 'clock-tick') ||
      resolveElement(root, 'clock') ||
      resolveElement(root, 'timestamp') ||
      clockEl;

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

    if (chart) {
      const currentPrice = 50000 + mutationCount * 1.5;
      if (typeof chart.updateTick === 'function') {
        chart.updateTick(currentPrice);
      } else if (typeof chart.render === 'function') {
        chart.render();
      }
    }
  };

  const updateIntervalMs =
    typeof options.interval === 'number' && options.interval > 0 ? options.interval : 500;
  let timer = setInterval(update, updateIntervalMs);
  if (typeof timer?.unref === 'function') {
    timer.unref();
  }

  return {
    chart,
    canvas: canvasEl,
    getChart: () => chart,
    getCanvas: () => canvasEl,
    container: root,
    getMutationCount: () => mutationCount,
    getLastMutationTimestamp: () => lastMutationTimestamp,
    destroy: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (chart && typeof chart.stop === 'function') {
        chart.stop();
      }
    },
  };
}

export const mount = mountApp;

export function initApp(container, options = {}) {
  return mountApp(container, options);
}

export const init = initApp;
export const initialize = initApp;

// Browser Auto-Mount Bootstrap Guard
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}