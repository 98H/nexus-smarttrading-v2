/**
 * SmartTrading-V2 — Application Entrypoint
 * Bootstraps toolbar controls, candlestick chart viewport, dynamic sector scaling,
 * and comprehensive data series spanning all horizontal sectors without sparse gaps.
 */

import { Chart, aggregateCandles, getTimeframeDuration, generateDefaultCandles } from './chart.js';

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
  const baseTime = 1609459200000; // Fixed deterministic baseline timestamp
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
 * compound selectors in headless test environments where mock DOM lacks full CSS support.
 */
export function enhanceElementQuery(element) {
  if (!element || typeof element !== 'object') return element;

  const origQSA = typeof element.querySelectorAll === 'function' ? element.querySelectorAll.bind(element) : null;

  element.querySelectorAll = function (selector) {
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
 * when standard DOM APIs (document.createElement) are not present.
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
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const el = document.createElement(tagName);
    for (const [k, v] of Object.entries(attributes)) {
      if (k === 'class' || k === 'className') {
        el.className = v;
      } else {
        el.setAttribute(k, v);
      }
    }
    return el;
  }
  return createMockDomElement(tagName, attributes);
}

/**
 * Mounts the candlestick chart application, interactive toolbar, and canvas into a container.
 *
 * @param {HTMLElement|Object} target - DOM container or mock container element
 * @param {Object} [options={}] - Configuration options for timeframe, series, canvas, etc.
 * @returns {Object} Application instance containing chart, toolbar, canvas, and controls
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

  enhanceElementQuery(container);

  // Supply a comprehensive data series of 50 to 100 candles if not explicitly provided
  const candles =
    options.candles && Array.isArray(options.candles) && options.candles.length > 0
      ? options.candles
      : options.data && Array.isArray(options.data) && options.data.length > 0
        ? options.data
        : generateComprehensiveCandleSeries(options.candleCount || 75);

  const timeframes = options.timeframes || ['1m', '5m', '1h'];
  let currentTimeframe =
    options.initialTimeframe || options.timeframe || options.defaultTimeframe || '1m';

  // Mount toolbar container
  let toolbar = container.querySelector
    ? container.querySelector('.toolbar') || container.querySelector('[data-role="toolbar"]')
    : null;

  if (!toolbar) {
    toolbar = createDomElement('div', { class: 'toolbar', 'data-role': 'toolbar' });
    enhanceElementQuery(toolbar);
    container.appendChild(toolbar);
  } else {
    enhanceElementQuery(toolbar);
  }

  // Mount timeframe buttons
  const buttons = [];
  timeframes.forEach((tf) => {
    let btn = toolbar.querySelector
      ? toolbar.querySelector(`button[data-timeframe="${tf}"]`)
      : null;

    if (!btn) {
      btn = createDomElement('button', {
        'data-timeframe': tf,
        type: 'button',
      });
      btn.textContent = tf;
      enhanceElementQuery(btn);
      toolbar.appendChild(btn);
    } else {
      enhanceElementQuery(btn);
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

  // Mount canvas element
  let canvas;
  if (typeof options.createCanvas === 'function') {
    canvas = options.createCanvas();
  } else if (container.querySelector && container.querySelector('canvas')) {
    canvas = container.querySelector('canvas');
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
    const drawCalls = [];
    const ctx = {
      canvas,
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
    };
    canvas.getContext = (contextId) => (contextId === '2d' ? ctx : null);
  }

  if (canvas.parentElement !== container) {
    container.appendChild(canvas);
  }

  // Initialize core Chart engine with comprehensive data series
  const chart = new Chart(canvas, {
    candles,
    timeframe: currentTimeframe,
    width: canvas.width || options.width || 800,
    height: canvas.height || options.height || 400,
    sectorCount: options.sectorCount || 3,
    ...options,
  });

  // Attach interactive click event handlers for timeframe buttons
  buttons.forEach((btn) => {
    const tf = btn.getAttribute('data-timeframe');
    btn.addEventListener('click', () => {
      if (currentTimeframe === tf) return;
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

      chart.setTimeframe(tf);
    });
  });

  const appInstance = {
    chart,
    getChart: () => chart,
    container,
    canvas,
    toolbar,
    buttons,
    getTimeframe: () => chart.getTimeframe(),
    setTimeframe: (tf) => {
      const targetBtn = buttons.find((b) => b.getAttribute('data-timeframe') === tf);
      if (targetBtn) {
        targetBtn.click();
      } else {
        chart.setTimeframe(tf);
      }
    },
    destroy: () => {
      chart.destroy();
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
      app.chart.start();
    }
  }
}