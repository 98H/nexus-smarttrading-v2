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
  getTimeframeDuration,
} from './chart.js';

export { Chart, ChartCanvas, DEFAULT_MIN_ZOOM, DEFAULT_MAX_ZOOM, getTimeframeDuration };

const SUPPORTED_TIMEFRAMES = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w']);

/**
 * Parses a timeframe duration string into milliseconds.
 *
 * @param {string} timeframe - Duration identifier (e.g. '1m', '5m', '1h', '1d')
 * @returns {number|null} Duration in milliseconds or null if unsupported
 */
function parseTimeframeMs(timeframe) {
  if (typeof timeframe !== 'string') return null;
  const match = timeframe.trim().toLowerCase().match(/^(\d+)([smhdw])$/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (val <= 0) return null;
    const unit = match[2];
    switch (unit) {
      case 's': return val * 1000;
      case 'm': return val * 60 * 1000;
      case 'h': return val * 3600 * 1000;
      case 'd': return val * 86400 * 1000;
      case 'w': return val * 7 * 86400 * 1000;
      default: return null;
    }
  }
  if (typeof getTimeframeDuration === 'function') {
    try {
      const dur = getTimeframeDuration(timeframe);
      if (typeof dur === 'number' && dur > 0) return dur;
    } catch {}
  }
  return null;
}

/**
 * Aggregates sequential candlestick records into higher-timeframe buckets.
 *
 * @param {Array<Object>} candles - Input candlestick data
 * @param {string} timeframe - Target timeframe duration
 * @returns {Array<Object>} Aggregated candlestick array
 */
export function aggregateCandles(candles, timeframe) {
  const bucketMs = parseTimeframeMs(timeframe);
  if (!bucketMs) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  if (!candles || !Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const startTime = sorted[0].timestamp;
  const buckets = new Map();

  for (const c of sorted) {
    const bucketIndex = Math.floor((c.timestamp - startTime) / bucketMs);
    if (!buckets.has(bucketIndex)) {
      buckets.set(bucketIndex, []);
    }
    buckets.get(bucketIndex).push(c);
  }

  const result = [];
  for (const bucketCandles of buckets.values()) {
    if (bucketCandles.length === 0) continue;
    const open = bucketCandles[0].open;
    const close = bucketCandles[bucketCandles.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const c of bucketCandles) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += (c.volume || 0);
    }

    result.push({
      timestamp: bucketCandles[0].timestamp,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return result;
}

/**
 * Ensures an element has a functioning classList abstraction in headless/mock runtimes.
 *
 * @param {Object|HTMLElement} element - Target element
 * @returns {Object|HTMLElement}
 */
export function ensureClassList(element) {
  if (!element || typeof element !== 'object') return element;
  if (element.classList && typeof element.classList.add === 'function') {
    return element;
  }

  const getClassList = () => {
    let raw = '';
    if (typeof element.getAttribute === 'function') {
      raw = element.getAttribute('class') || '';
    } else if (element.attributes instanceof Map) {
      raw = element.attributes.get('class') || '';
    } else if (element.attributes && typeof element.attributes === 'object') {
      raw = element.attributes.class || '';
    } else if (typeof element.className === 'string') {
      raw = element.className;
    }
    return new Set(String(raw).trim().split(/\s+/).filter(Boolean));
  };

  const setClassList = (set) => {
    const val = Array.from(set).join(' ');
    if (typeof element.setAttribute === 'function') {
      element.setAttribute('class', val);
    } else if (element.attributes instanceof Map) {
      element.attributes.set('class', val);
    } else if (element.attributes && typeof element.attributes === 'object') {
      element.attributes.class = val;
    }
    try {
      element.className = val;
    } catch {}
  };

  element.classList = {
    add(...tokens) {
      const set = getClassList();
      for (const t of tokens) {
        if (t) set.add(String(t));
      }
      setClassList(set);
    },
    remove(...tokens) {
      const set = getClassList();
      for (const t of tokens) {
        if (t) set.delete(String(t));
      }
      setClassList(set);
    },
    contains(token) {
      return getClassList().has(String(token));
    },
    toggle(token, force) {
      const set = getClassList();
      const strToken = String(token);
      const has = set.has(strToken);
      const shouldAdd = force !== undefined ? Boolean(force) : !has;
      if (shouldAdd) {
        set.add(strToken);
      } else {
        set.delete(strToken);
      }
      setClassList(set);
      return shouldAdd;
    },
    toString() {
      return Array.from(getClassList()).join(' ');
    },
  };

  return element;
}

/**
 * Initializes toolbar timeframe controls and links them to the chart instance.
 *
 * @param {Object} options - Configuration object
 * @param {HTMLElement|Object} options.toolbarElement - Toolbar container DOM or mock element
 * @param {Chart} options.chartInstance - Target Chart instance to update
 * @param {Array<Object>} [options.rawCandles=[]] - Underlying candlestick dataset
 * @returns {Object} Toolbar controller handle
 */
export function initToolbar({ toolbarElement, chartInstance, rawCandles = [] } = {}) {
  if (!toolbarElement) return null;

  let buttons = [];
  if (typeof toolbarElement.querySelectorAll === 'function') {
    buttons = Array.from(toolbarElement.querySelectorAll('[data-timeframe]'));
    if (buttons.length === 0) {
      buttons = Array.from(toolbarElement.querySelectorAll('button'));
    }
  }
  if (buttons.length === 0 && Array.isArray(toolbarElement.children)) {
    buttons = Array.from(toolbarElement.children).filter(
      (c) => c && (c.tagName === 'BUTTON' || Boolean(c.dataset?.timeframe))
    );
  }

  const getTf = (btn) => {
    if (!btn) return null;
    return (
      btn.dataset?.timeframe ||
      (typeof btn.getAttribute === 'function' ? btn.getAttribute('data-timeframe') : null) ||
      (btn.attributes instanceof Map ? btn.attributes.get('data-timeframe') : null) ||
      (btn.attributes && btn.attributes['data-timeframe']) ||
      btn.textContent?.trim() ||
      null
    );
  };

  const sourceCandles =
    (rawCandles && rawCandles.length > 0 && rawCandles) ||
    (chartInstance && typeof chartInstance.getCandles === 'function' ? chartInstance.getCandles() : []);

  buttons.forEach((btn) => {
    ensureClassList(btn);
    btn.addEventListener('click', () => {
      const targetTf = getTf(btn);
      if (!targetTf) return;

      const currentTf =
        chartInstance && typeof chartInstance.getTimeframe === 'function'
          ? chartInstance.getTimeframe()
          : null;

      if (currentTf === targetTf) {
        return;
      }

      buttons.forEach((b) => {
        ensureClassList(b);
        const bTf = getTf(b);
        if (bTf === targetTf) {
          if (b.classList && typeof b.classList.add === 'function') {
            b.classList.add('active');
          }
          if (typeof b.setAttribute === 'function') {
            b.setAttribute('aria-pressed', 'true');
          }
        } else {
          if (b.classList && typeof b.classList.remove === 'function') {
            b.classList.remove('active');
          }
          if (typeof b.setAttribute === 'function') {
            b.setAttribute('aria-pressed', 'false');
          }
        }
      });

      if (chartInstance && typeof chartInstance.setTimeframe === 'function') {
        chartInstance.setTimeframe(targetTf);
      } else if (chartInstance && typeof chartInstance.render === 'function') {
        const inputCandles =
          (rawCandles && rawCandles.length > 0 && rawCandles) ||
          sourceCandles ||
          (chartInstance && typeof chartInstance.getCandles === 'function' ? chartInstance.getCandles() : []);

        const aggregated = targetTf === '1m' ? inputCandles : aggregateCandles(inputCandles, targetTf);
        chartInstance.render(aggregated, targetTf);
      }
    });
  });

  return {
    buttons,
  };
}

/**
 * Matches a DOM element against basic and compound CSS selectors.
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
      (element.attributes instanceof Map ? element.attributes.get('id') : null) ||
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
          (element.attributes instanceof Map ? element.attributes.get('class') : '') ||
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
      } else if (element.attributes instanceof Map) {
        actualVal = element.attributes.get(attrName);
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
  ensureClassList(element);
  if (element.__nexus_patched) return element;
  element.__nexus_patched = true;

  const originalQSA = element.querySelectorAll;

  element.querySelectorAll = function (selector) {
    if (typeof selector === 'string' && selector.toLowerCase() === 'canvas') {
      const canvases = (element.children || []).filter(
        (c) => c && (c.tagName === 'CANVAS' || c.nodeName?.toUpperCase() === 'CANVAS')
      );
      if (canvases.length > 0) return canvases;
    }

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
    if (typeof selector === 'string' && selector.toLowerCase() === 'canvas') {
      const foundCanvas = (element.children || []).find(
        (c) => c && (c.tagName === 'CANVAS' || c.nodeName?.toUpperCase() === 'CANVAS')
      );
      if (foundCanvas) return foundCanvas;
    }
    const all = element.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  };

  const origAppend = element.appendChild;
  if (typeof origAppend === 'function' && !element.__nexus_append_patched) {
    element.__nexus_append_patched = true;
    element.appendChild = function (child) {
      if (child) {
        ensureClassList(child);
        patchMockElement(child);
      }
      return origAppend.call(element, child);
    };
  }

  if (Array.isArray(element.children)) {
    for (const child of element.children) {
      ensureClassList(child);
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
  let el;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      el = document.createElement(tagName);
    } catch {
      el = null;
    }
  }

  if (!el) {
    const listeners = new Map();
    const children = [];
    const attrMap = new Map();

    el = {
      tagName: tagName.toUpperCase(),
      id: attributes.id || '',
      children,
      attributes: attrMap,
      eventListeners: listeners,
      _innerHTML: '',
      get innerHTML() {
        return this._innerHTML;
      },
      set innerHTML(html) {
        this._innerHTML = html;
        this.children = [];
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
        return child;
      },
      querySelector(selector) {
        if (selector.toLowerCase() === 'canvas') {
          return this.children.find((c) => c.tagName === 'CANVAS') || null;
        }
        return null;
      },
      querySelectorAll(selector) {
        if (selector.toLowerCase() === 'canvas') {
          return this.children.filter((c) => c.tagName === 'CANVAS');
        }
        return [];
      },
      setAttribute(k, v) {
        this.attributes.set(k, String(v));
      },
      getAttribute(k) {
        return this.attributes.get(k) || null;
      },
      addEventListener(type, handler) {
        if (!this.eventListeners.has(type)) this.eventListeners.set(type, []);
        this.eventListeners.get(type).push(handler);
      },
      dispatchEvent(event) {
        const handlers = this.eventListeners.get(event.type) || [];
        for (const h of handlers) h(event);
      },
    };
  }

  ensureClassList(el);
  patchMockElement(el);

  for (const [key, value] of Object.entries(attributes)) {
    if (typeof el.setAttribute === 'function') {
      el.setAttribute(key, String(value));
    } else if (el.attributes instanceof Map) {
      el.attributes.set(key, String(value));
    }
    if (key === 'id') {
      el.id = String(value);
    }
    if (key === 'class') {
      try {
        el.className = String(value);
      } catch {}
      if (el.classList && typeof el.classList.add === 'function') {
        const classes = String(value).trim().split(/\s+/).filter(Boolean);
        for (const c of classes) {
          el.classList.add(c);
        }
      }
    }
  }

  if (tagName.toLowerCase() === 'canvas') {
    el.width = Number(attributes.width) || 800;
    el.height = Number(attributes.height) || 400;
    if (typeof el.getContext !== 'function') {
      const drawCalls = [];
      const ctx = {
        canvas: el,
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
      el.getContext = (contextId) => {
        if (contextId === '2d') return ctx;
        return null;
      };
    }
  }

  return el;
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
  if (root.id === id || root.getAttribute?.('id') === id || (root.attributes instanceof Map && root.attributes.get('id') === id) || root.attributes?.id === id) {
    return root;
  }
  if (Array.isArray(root.children)) {
    const found = root.children.find(
      (child) =>
        child &&
        (child.id === id ||
          child.getAttribute?.('id') === id ||
          (child.attributes instanceof Map && child.attributes.get('id') === id) ||
          child.attributes?.id === id ||
          child.classList?.contains?.(id))
    );
    if (found) return found;
  }
  if (typeof root.querySelector === 'function') {
    const found =
      root.querySelector(`#${id}`) ||
      root.querySelector(`.${id}`) ||
      root.querySelector(`[data-testid="${id}"]`) ||
      root.querySelector(`[id="${id}"]`);
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
  if (typeof root.querySelector === 'function') {
    const found =
      root.querySelector('canvas') ||
      root.querySelector('#chart-canvas') ||
      root.querySelector('#chart') ||
      root.querySelector('#candlestick-chart') ||
      root.querySelector('#canvas');
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
  let root = container;
  if (!root && typeof document !== 'undefined') {
    root =
      (typeof document.getElementById === 'function' ? document.getElementById('app') : null) ||
      document.body;
  } else if (typeof root === 'string' && typeof document !== 'undefined') {
    root = document.querySelector(root);
  }

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

  ensureClassList(root);
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
  const initialTimeframe = options.initialTimeframe || options.timeframe || '1m';

  let toolbarEl =
    resolveElement(root, 'toolbar') ||
    (typeof root.querySelector === 'function' &&
      (root.querySelector('.toolbar') || root.querySelector('[data-role="toolbar"]')));

  if (!toolbarEl && typeof root.appendChild === 'function') {
    try {
      toolbarEl = createDOMElement('div', { id: 'toolbar', class: 'toolbar', 'data-role': 'toolbar' });
      ensureClassList(toolbarEl);
      if (toolbarEl.classList && typeof toolbarEl.classList.add === 'function') {
        toolbarEl.classList.add('toolbar');
      }
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
      const isActive = tf === initialTimeframe;
      const btn = createDOMElement('button', {
        'data-timeframe': tf,
        'aria-pressed': isActive ? 'true' : 'false',
        class: isActive ? 'timeframe-btn active' : 'timeframe-btn',
      });
      ensureClassList(btn);
      if (btn.classList && typeof btn.classList.add === 'function') {
        if (isActive) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
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
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvasEl = document.createElement('canvas');
      canvasEl.width = options.width || 800;
      canvasEl.height = options.height || 400;
      if (typeof canvasEl.setAttribute === 'function') {
        canvasEl.setAttribute('id', 'chart-canvas');
        canvasEl.setAttribute('width', String(canvasEl.width));
        canvasEl.setAttribute('height', String(canvasEl.height));
      }
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

  const rawCandles = options.candles || options.chartOptions?.candles || options.data || [];

  if (!chart && canvasEl) {
    if (canvasEl.__nexus_chart) {
      chart = canvasEl.__nexus_chart;
    } else {
      const chartConfig = {
        ...(options.chartOptions || options),
        candles: rawCandles,
        timeframe: initialTimeframe,
        width: options.width || canvasEl.width || 800,
        height: options.height || canvasEl.height || 400,
      };
      chart = new Chart(canvasEl, chartConfig);
      canvasEl.__nexus_chart = chart;
    }
  }

  if (canvasEl && chart) {
    canvasEl.chart = chart;
    canvasEl.__chart = chart;
  }

  if (toolbarEl && chart) {
    initToolbar({
      toolbarElement: toolbarEl,
      chartInstance: chart,
      rawCandles,
    });
  }

  if (chart && typeof chart.render === 'function') {
    const initialCandles =
      initialTimeframe === '1m' || rawCandles.length === 0
        ? rawCandles
        : aggregateCandles(rawCandles, initialTimeframe);
    chart.render(initialCandles, initialTimeframe);
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

  if (root.__nexus_timer) {
    clearInterval(root.__nexus_timer);
    root.__nexus_timer = null;
  }

  let timer = setInterval(update, updateIntervalMs);
  if (typeof timer?.unref === 'function') {
    timer.unref();
  }
  root.__nexus_timer = timer;

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
      if (root.__nexus_timer === timer) {
        root.__nexus_timer = null;
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
      if (root.__nexus_timer === timer) {
        root.__nexus_timer = null;
      }
      if (chart && typeof chart.stop === 'function') {
        chart.stop();
      }
    },
  };
}

export const mount = mountApp;

export function initApp(container, options = {}) {
  const target =
    container ||
    (typeof document !== 'undefined'
      ? (typeof document.getElementById === 'function' ? document.getElementById('app') : null) ||
        document.body
      : null);
  return mountApp(target, options);
}

export const init = initApp;
export const initialize = initApp;

// Browser Auto-Mount Bootstrap Guard
if (typeof document !== 'undefined') {
  const mountTarget =
    (typeof document.getElementById === 'function' ? document.getElementById('app') : null) ||
    document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}