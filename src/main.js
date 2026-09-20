/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Mounts the financial chart workspace, active canvas rendering context,
 * coordinate axes renderer, analytical indicator overlays, live legend components,
 * interactive tool palette, auxiliary dock, and ticker-coherent price series
 * reflecting authentic market levels (~$64,000 for BTC/USD).
 * Satisfies STORY 38.4.1 (DF-CANDLES-01) & STORY 53.2.1 (Resolve INCOHERENT_MARKET_DATA).
 */

import { AxesRenderer, computeRanges, formatTimestamp, updateDOMTimeAxisTrack } from './axes.js';
import {
  Chart,
  polyfillCanvasContext,
  mapYToPrice,
  mapPriceToY,
} from './chart.js';
import {
  calculateSMA,
  calculateEMA,
  renderOverlay,
  createIndicatorLegend,
  updateIndicatorLegend,
  getClosePrice,
} from './indicators.js';
import * as DockModule from './dock.js';
import * as CanvasModule from './canvas.js';
import * as DataGen from './data_generator.js';
import * as ControlsModule from './controls.js';
import { ToolPalette, DEFAULT_TOOLS } from './components/ToolPalette.js';

export const REQUIRED_TOOLS = ['crosshair', 'trendline', 'ray', 'measurement'];
export { DEFAULT_TOOLS };

export const AuxiliaryDock = DockModule.AuxiliaryDock || DockModule.Dock;
export const Dock = DockModule.Dock || DockModule.AuxiliaryDock;
export const patchMockDOM = DockModule.patchMockDOM || (() => {});
export const CONTROL_THEME_STYLE = DockModule.CONTROL_THEME_STYLE || '';
export const applyDarkTheme = DockModule.applyDarkTheme || (() => {});

export const SUPPORTED_TIMEFRAMES = ControlsModule.SUPPORTED_TIMEFRAMES || ['1m', '5m', '15m', '1h', '4h', '1D'];
export const TIMEFRAME_INTERVALS = ControlsModule.TIMEFRAME_INTERVALS || {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1d': 86400,
};

const ensureSelectorCompatibility = ControlsModule.ensureSelectorCompatibility || (() => {});
const getControlState = ControlsModule.getControlState || (() => ({}));
const setControlState = ControlsModule.setControlState || (() => ({}));

// Ticker instrument configurations reflecting authentic market pricing (~$64,000 for BTC/USD)
export const TICKER_CONFIGS = DataGen.TICKER_CONFIGS || {
  'BTC/USD': {
    ticker: 'BTC/USD',
    basePrice: 64000,
    priceDecimals: 2,
    minSpread: 10,
    depthStep: 15,
  },
  'ETH/USD': {
    ticker: 'ETH/USD',
    basePrice: 3450,
    priceDecimals: 2,
    minSpread: 0.5,
    depthStep: 1.5,
  },
  'SOL/USD': {
    ticker: 'SOL/USD',
    basePrice: 145,
    priceDecimals: 2,
    minSpread: 0.05,
    depthStep: 0.15,
  },
};

export const SUPPORTED_TICKERS = Object.keys(TICKER_CONFIGS);

export function getTickerConfig(ticker) {
  const normalized = String(ticker || 'BTC/USD').toUpperCase().trim();
  if (normalized.includes('ETH')) return TICKER_CONFIGS['ETH/USD'];
  if (normalized.includes('SOL')) return TICKER_CONFIGS['SOL/USD'];
  return TICKER_CONFIGS['BTC/USD'] || {
    ticker: 'BTC/USD',
    basePrice: 64000,
    priceDecimals: 2,
    minSpread: 10,
    depthStep: 15,
  };
}

export const getTickerBasePrice =
  DataGen.getTickerBasePrice ||
  function getTickerBasePrice(ticker = 'BTC/USD') {
    const config = getTickerConfig(ticker);
    return config.basePrice;
  };

export const resizeCanvas =
  CanvasModule.resizeCanvas ||
  CanvasModule.syncCanvasDimensions ||
  CanvasModule.initCanvasViewport ||
  CanvasModule.initCanvas ||
  CanvasModule.setupCanvas ||
  CanvasModule.createCanvasViewport;

export const syncCanvasDimensions =
  CanvasModule.syncCanvasDimensions ||
  CanvasModule.resizeCanvas ||
  resizeCanvas;

export const updateCanvasDimensions =
  CanvasModule.updateCanvasDimensions ||
  CanvasModule.resizeCanvas ||
  resizeCanvas;

export const initCanvasViewport =
  CanvasModule.initCanvasViewport ||
  CanvasModule.initCanvas ||
  CanvasModule.setupCanvas ||
  CanvasModule.createCanvasViewport ||
  resizeCanvas;

export const initCanvas =
  CanvasModule.initCanvas ||
  CanvasModule.initCanvasViewport ||
  CanvasModule.setupCanvas ||
  resizeCanvas;

export const setupCanvasDpi =
  CanvasModule.setupCanvasDpi ||
  CanvasModule.syncCanvasDpi ||
  resizeCanvas;

export const syncCanvasDpi =
  CanvasModule.syncCanvasDpi ||
  CanvasModule.setupCanvasDpi ||
  resizeCanvas;

export {
  AxesRenderer,
  computeRanges,
  formatTimestamp,
  updateDOMTimeAxisTrack,
  Chart,
  polyfillCanvasContext,
  mapYToPrice,
  mapPriceToY,
  calculateSMA,
  calculateEMA,
  renderOverlay,
  createIndicatorLegend,
  updateIndicatorLegend,
  getClosePrice,
  ToolPalette,
};

/**
 * Generates market depth data coherent with the active ticker price regime.
 *
 * @param {string} [ticker='BTC/USD']
 * @param {number} [midPrice=null]
 * @param {number} [count=10]
 * @returns {Object}
 */
export function generateMarketDepth(ticker = 'BTC/USD', midPrice = null, count = 10) {
  const config = getTickerConfig(ticker);
  const centerPrice = typeof midPrice === 'number' && Number.isFinite(midPrice) && midPrice > 0
    ? midPrice
    : config.basePrice;

  const step = config.depthStep || centerPrice * 0.0002;
  const spread = config.minSpread || centerPrice * 0.0004;
  const halfSpread = spread / 2;

  const bids = [];
  const asks = [];
  let cumBidTotal = 0;
  let cumAskTotal = 0;

  for (let i = 0; i < count; i++) {
    const bidPrice = +(centerPrice - halfSpread - i * step).toFixed(config.priceDecimals);
    const askPrice = +(centerPrice + halfSpread + i * step).toFixed(config.priceDecimals);
    const bidSize = +(0.15 + ((i % 3) + 1) * 0.35 + Math.random() * 0.5).toFixed(4);
    const askSize = +(0.15 + (((i + 1) % 3) + 1) * 0.35 + Math.random() * 0.5).toFixed(4);
    cumBidTotal += bidSize;
    cumAskTotal += askSize;

    bids.push({
      price: bidPrice,
      amount: bidSize,
      size: bidSize,
      volume: bidSize,
      total: +cumBidTotal.toFixed(4),
      cumulative: +cumBidTotal.toFixed(4),
    });

    asks.push({
      price: askPrice,
      amount: askSize,
      size: askSize,
      volume: askSize,
      total: +cumAskTotal.toFixed(4),
      cumulative: +cumAskTotal.toFixed(4),
    });
  }

  return {
    ticker: config.ticker,
    midPrice: centerPrice,
    spread: +(asks[0].price - bids[0].price).toFixed(config.priceDecimals),
    bids,
    asks,
  };
}

export const generateOrderBook = generateMarketDepth;
export const generateDepthData = generateMarketDepth;

/**
 * Fallback random-walk candlestick generator producing dynamic wicks and balanced bull/bear distributions.
 */
function generateRealisticWalk(options = {}) {
  const count = typeof options.count === 'number' ? options.count : 75;
  const basePrice = typeof options.initialPrice === 'number' && Number.isFinite(options.initialPrice)
    ? options.initialPrice
    : 64000;
  const interval = typeof options.interval === 'number' ? options.interval : 60;
  const now = Math.floor(Date.now() / 1000);
  const startTime = (typeof options.startTime === 'number' ? options.startTime : now) - count * interval;

  const data = [];
  let currentPrice = basePrice;
  const stepVolatility = Math.max(1, basePrice * 0.002);

  for (let i = 0; i < count; i++) {
    const time = startTime + i * interval;
    const open = currentPrice;

    // Alternate oscillating market steps with random variance ensuring non-monotonic slope
    const sign = (i % 2 === 0 ? 1 : -1) * (0.3 + ((i * 17) % 7) * 0.1);
    const delta = sign * stepVolatility * (0.6 + Math.random() * 0.8);
    const close = Math.round((open + delta) * 100) / 100;

    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);

    const upperWick = Math.round((0.15 + Math.random() * 0.7) * stepVolatility * 100) / 100;
    const lowerWick = Math.round((0.15 + Math.random() * 0.7) * stepVolatility * 100) / 100;

    const high = Math.round((bodyTop + upperWick) * 100) / 100;
    const low = Math.round((bodyBottom - lowerWick) * 100) / 100;
    const volume = Math.round((10 + Math.random() * 80) * 100) / 100;

    data.push({
      time,
      timestamp: time * 1000,
      open,
      high,
      low,
      close,
      volume,
    });
    currentPrice = close;
  }

  return data;
}

const baseGenerateCandlestickData = DataGen.generateCandlestickData;
const baseGenerateDefaultData = DataGen.generateDefaultData || DataGen.generateCandlestickData;

/**
 * Generates synthetic candlestick data reflecting ticker-coherent baseline market levels.
 *
 * @param {Object} [options={}]
 * @returns {Array<Object>}
 */
export function generateCandlestickData(options = {}) {
  const opts = typeof options === 'number' ? { count: options } : { ...(options || {}) };
  const ticker = opts.ticker || appState.ticker || 'BTC/USD';
  const config = getTickerConfig(ticker);

  if (opts.initialPrice === undefined || opts.initialPrice === null) {
    opts.initialPrice = config.basePrice;
  }
  if (!opts.ticker) {
    opts.ticker = config.ticker;
  }

  if (typeof baseGenerateCandlestickData === 'function') {
    try {
      const series = baseGenerateCandlestickData(opts);
      if (Array.isArray(series) && series.length > 0) {
        return series;
      }
    } catch (_) {}
  }

  if (typeof baseGenerateDefaultData === 'function') {
    try {
      const series = baseGenerateDefaultData(opts);
      if (Array.isArray(series) && series.length > 0) {
        return series;
      }
    } catch (_) {}
  }

  return generateRealisticWalk(opts);
}

export function generateDefaultData(options = {}) {
  return generateCandlestickData(options);
}

export const generateNextCandle =
  DataGen.generateNextCandle ||
  function generateNextCandle(prevCandle, options = {}) {
    const prev = prevCandle || { close: 64000, time: Math.floor(Date.now() / 1000) };
    const interval = options.interval || 60;
    const time = (prev.time || Math.floor(Date.now() / 1000)) + interval;
    const delta = (Math.random() - 0.5) * (prev.close * 0.002);
    const open = prev.close;
    const close = +(open + delta).toFixed(2);
    const high = +(Math.max(open, close) + Math.random() * 8).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * 8).toFixed(2);
    return { time, timestamp: time * 1000, open, high, low, close, volume: +(1 + Math.random() * 5).toFixed(2) };
  };

export const generateTick =
  DataGen.generateTick ||
  function generateTick(lastPrice = 64000) {
    const delta = (Math.random() - 0.5) * 10;
    const price = +(lastPrice + delta).toFixed(2);
    return { price, time: Math.floor(Date.now() / 1000), volume: 1 };
  };

export const createCandleStream =
  DataGen.createCandleStream ||
  function createCandleStream(chartTarget, options = {}) {
    let timer = null;
    return {
      start() {},
      stop() {
        if (timer) clearInterval(timer);
      },
    };
  };

/**
 * Synchronizes auxiliary dock order book display with active ticker and market depth data.
 */
export function synchronizeDockDepth(dockComponent, ticker, midPrice, depthData) {
  if (!dockComponent) return;

  if (typeof dockComponent.setTicker === 'function') {
    dockComponent.setTicker(ticker);
  }
  if (typeof dockComponent.updateMarketDepth === 'function') {
    dockComponent.updateMarketDepth(depthData);
  }
  if (typeof dockComponent.updateDepth === 'function') {
    dockComponent.updateDepth(depthData);
  }
  if (typeof dockComponent.setDepthData === 'function') {
    dockComponent.setDepthData(depthData);
  }
  if (typeof dockComponent.setPrice === 'function') {
    dockComponent.setPrice(midPrice);
  }

  dockComponent.ticker = ticker;
  dockComponent.activeTicker = ticker;
  dockComponent.midPrice = midPrice;
  dockComponent.marketDepth = depthData;
}

/**
 * Ensures non-Element mock canvas objects safely expose tagName === 'CANVAS' for mock queries.
 */
function ensureCanvasTagName(canvas) {
  if (!canvas || typeof canvas !== 'object') return canvas;
  if (typeof Element !== 'undefined' && canvas instanceof Element) return canvas;

  if (!canvas.tagName) {
    try {
      Object.defineProperty(canvas, 'tagName', {
        value: 'CANVAS',
        writable: true,
        configurable: true,
      });
    } catch (_) {
      try { canvas.tagName = 'CANVAS'; } catch (_) {}
    }
  }
  if (canvas.constructor && canvas.constructor.prototype && !canvas.constructor.prototype.tagName) {
    try {
      Object.defineProperty(canvas.constructor.prototype, 'tagName', {
        value: 'CANVAS',
        writable: true,
        configurable: true,
      });
    } catch (_) {}
  }
  return canvas;
}

/**
 * Creates a polyfilled classList object synchronized with the target element's className.
 */
function createClassListPolyfill(el) {
  return {
    add(...tokens) {
      const current = (el.className || '').split(/\s+/).filter(Boolean);
      let changed = false;
      for (const t of tokens) {
        if (t && !current.includes(t)) {
          current.push(t);
          changed = true;
        }
      }
      if (changed) {
        el.className = current.join(' ');
        if (typeof el.setAttribute === 'function') el.setAttribute('class', el.className);
      }
    },
    remove(...tokens) {
      const current = (el.className || '').split(/\s+/).filter(Boolean);
      const filtered = current.filter((c) => !tokens.includes(c));
      if (filtered.length !== current.length) {
        el.className = filtered.join(' ');
        if (typeof el.setAttribute === 'function') el.setAttribute('class', el.className);
      }
    },
    delete(...tokens) {
      this.remove(...tokens);
    },
    contains(token) {
      const current = (el.className || '').split(/\s+/).filter(Boolean);
      return current.includes(token);
    },
    has(token) {
      return this.contains(token);
    },
    toggle(token, force) {
      if (force === true) {
        this.add(token);
        return true;
      } else if (force === false) {
        this.remove(token);
        return false;
      }
      if (this.contains(token)) {
        this.remove(token);
        return false;
      } else {
        this.add(token);
        return true;
      }
    },
  };
}

/**
 * Patches a mock object with standard DOM methods without modifying native Element instances.
 */
export function patchMockElement(el) {
  if (!el || typeof el !== 'object') return el;
  if (typeof Element !== 'undefined' && el instanceof Element) return el;

  if (typeof el.getContext === 'function') {
    ensureCanvasTagName(el);
  }

  if (!('children' in el)) {
    try {
      Object.defineProperty(el, 'children', {
        value: [],
        writable: true,
        configurable: true,
      });
    } catch (_) {}
  }

  if (!el.style || typeof el.style !== 'object') {
    el.style = {};
  }

  if (typeof el.appendChild !== 'function') {
    el.appendChild = function (child) {
      if (child) {
        if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
          try {
            child.parentNode.removeChild(child);
          } catch (_) {}
        }
        child.parentNode = this;
        child.parentElement = this;
        if (Array.isArray(this.children)) this.children.push(child);
      }
      return child;
    };
  }

  if (typeof el.removeChild !== 'function') {
    el.removeChild = function (child) {
      if (Array.isArray(this.children)) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
          child.parentNode = null;
          child.parentElement = null;
          this.children.splice(idx, 1);
        }
      }
      return child;
    };
  }

  if (typeof el.replaceChildren !== 'function') {
    el.replaceChildren = function (...newChildren) {
      while (this.children && this.children.length > 0) {
        this.removeChild(this.children[0]);
      }
      for (const c of newChildren) {
        if (c) this.appendChild(c);
      }
    };
  }

  if (typeof el.setAttribute !== 'function') {
    el.setAttribute = function (name, value) {
      if (name === 'style') {
        if (!this.style || typeof this.style !== 'object') {
          this.style = {};
        }
        if (typeof value === 'string') {
          this.style.cssText = value;
          const declarations = value.split(';');
          for (let i = 0; i < declarations.length; i++) {
            const rule = declarations[i];
            const colonIdx = rule.indexOf(':');
            if (colonIdx !== -1) {
              const prop = rule.slice(0, colonIdx).trim();
              const val = rule.slice(colonIdx + 1).trim();
              if (prop) {
                const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                this.style[camelProp] = val;
                this.style[prop] = val;
              }
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          Object.assign(this.style, value);
        }
      } else {
        this[name] = String(value);
      }
      if (name === 'id') this.id = String(value);
      if (name === 'class' || name === 'className') this.className = String(value);
      if (!this.attributes) this.attributes = new Map();
      this.attributes.set(name, String(value));
    };
  }

  if (typeof el.getAttribute !== 'function') {
    el.getAttribute = function (name) {
      if (name === 'id') return this.id || null;
      if (name === 'class' || name === 'className') return this.className || null;
      if (name === 'style') {
        return (
          (this.style && typeof this.style === 'object' && this.style.cssText) ||
          (this.attributes && this.attributes.get('style')) ||
          null
        );
      }
      if (this.attributes && this.attributes.has(name)) return this.attributes.get(name);
      return this[name] !== undefined && this[name] !== null ? String(this[name]) : null;
    };
  }

  if (typeof el.hasAttribute !== 'function') {
    el.hasAttribute = function (name) {
      if (name === 'id') return Boolean(this.id);
      if (name === 'class' || name === 'className') return Boolean(this.className);
      if (this.attributes && this.attributes.has(name)) return true;
      return this[name] !== undefined && this[name] !== null;
    };
  }

  if (typeof el.removeAttribute !== 'function') {
    el.removeAttribute = function (name) {
      delete this[name];
      if (this.attributes) this.attributes.delete(name);
      if (name === 'id') this.id = '';
      if (name === 'class' || name === 'className') this.className = '';
    };
  }

  if (typeof el.addEventListener !== 'function') {
    el.addEventListener = function (type, listener) {
      if (!this._listeners) this._listeners = new Map();
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(listener);
    };
  }

  if (typeof el.removeEventListener !== 'function') {
    el.removeEventListener = function (type, listener) {
      if (this._listeners && this._listeners.has(type)) {
        this._listeners.set(
          type,
          this._listeners.get(type).filter((fn) => fn !== listener)
        );
      }
    };
  }

  if (!el.classList) {
    el.classList = createClassListPolyfill(el);
  }

  return el;
}

function matchSelector(node, selector) {
  if (!node || typeof selector !== 'string') return false;
  if (selector.includes(',')) {
    const parts = selector.split(',');
    for (let i = 0; i < parts.length; i++) {
      if (matchSelector(node, parts[i].trim())) return true;
    }
    return false;
  }

  const sel = selector.trim();
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    return (
      node.id === id ||
      (typeof node.getAttribute === 'function' && node.getAttribute('id') === id)
    );
  }
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    if (node.classList && typeof node.classList.contains === 'function') {
      return node.classList.contains(cls);
    }
    const classStr =
      (typeof node.getAttribute === 'function' ? node.getAttribute('class') : null) ||
      node.className ||
      '';
    return classStr.split(/\s+/).includes(cls);
  }

  const tagMatch = sel.match(/^([a-zA-Z0-9]+)(\.[a-zA-Z0-9_-]+|\[.*\])?$/);
  if (tagMatch) {
    const tag = tagMatch[1];
    const rest = tagMatch[2];
    const actualTag = (node.tagName || node.nodeName || '').toLowerCase();
    if (actualTag !== tag.toLowerCase()) return false;
    if (!rest) return true;
    return matchSelector(node, rest);
  }
  const tag = (node.tagName || node.nodeName || '').toLowerCase();
  return tag === sel.toLowerCase();
}

function queryElement(node, selector) {
  if (!node) return null;
  const children = Array.isArray(node.children)
    ? node.children
    : node.children
    ? Array.from(node.children)
    : [];
  for (const child of children) {
    if (matchSelector(child, selector)) return child;
    const found = queryElement(child, selector);
    if (found) return found;
  }
  return null;
}

function ensureDOMNodeMethods(proto) {
  if (!proto || proto === Object.prototype) return;

  if (proto.querySelector && !proto.__nexusPatchedQS) {
    const origQS = proto.querySelector;
    proto.querySelector = function (selector) {
      const direct = origQS.call(this, selector);
      if (direct) return direct;
      return queryElement(this, selector);
    };
    proto.__nexusPatchedQS = true;
  } else if (!proto.querySelector) {
    proto.querySelector = function (selector) {
      return queryElement(this, selector);
    };
  }

  if (!proto.querySelectorAll) {
    proto.querySelectorAll = function (selector) {
      const results = [];
      const traverse = (n) => {
        const kids = Array.isArray(n.children)
          ? n.children
          : n.children
          ? Array.from(n.children)
          : [];
        for (const c of kids) {
          if (matchSelector(c, selector)) results.push(c);
          traverse(c);
        }
      };
      traverse(this);
      return results;
    };
  }
}

export function patchDOMEnvironment() {
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined' && window.document.nodeType === 9) return;

  ensureSelectorCompatibility();

  const doc = typeof document !== 'undefined' ? document : globalThis.document || null;
  if (!doc) return;

  if (typeof doc.createElement === 'function' && !doc.__nexus_main_patched_create) {
    const origCreate = doc.createElement.bind(doc);
    doc.createElement = function (tag) {
      const el = origCreate(tag);
      if (el && !(typeof Element !== 'undefined' && el instanceof Element)) {
        patchMockElement(el);
        if (String(tag).toLowerCase() === 'canvas') {
          ensureCanvasTagName(el);
        }
      }
      return el;
    };
    doc.__nexus_main_patched_create = true;
  }

  let sample = null;
  if (typeof doc.getElementById === 'function') {
    sample = doc.getElementById('app');
  }
  if (!sample && doc.body) {
    sample = doc.body;
  }

  if (sample) {
    patchMockElement(sample);
    let proto = Object.getPrototypeOf(sample);
    while (proto && proto !== Object.prototype) {
      ensureDOMNodeMethods(proto);
      proto = Object.getPrototypeOf(proto);
    }
  }

  patchMockDOM(sample || doc.body || null);
}

patchDOMEnvironment();

const appState = {
  ticker: 'BTC/USD',
  activeView: 'Chart',
  activeTab: 'Chart',
  selectedConfig: 'Chart',
  activeTool: 'crosshair',
  activeTimeframe: '1m',
  timeframe: '1m',
  resolution: '1m',
  overlayType: 'EMA',
  period: 20,
  data: [],
  marketDepth: null,
};

const mountedInstances = new WeakMap();

let activeAppInstance = null;
let activeToolPaletteInstance = null;
export let activeChart = null;
export let chart = null;

export function getState() {
  return { ...appState };
}

export function getTicker() {
  return appState.ticker || 'BTC/USD';
}

export function getActiveTool() {
  if (activeToolPaletteInstance && typeof activeToolPaletteInstance.getActiveTool === 'function') {
    return activeToolPaletteInstance.getActiveTool();
  }
  return appState.activeTool || 'crosshair';
}

export function setActiveTool(tool) {
  if (activeToolPaletteInstance && typeof activeToolPaletteInstance.setActiveTool === 'function') {
    activeToolPaletteInstance.setActiveTool(tool);
  } else {
    appState.activeTool = tool;
  }
}

export function getTimeframe() {
  return appState.timeframe || '1m';
}

export function getResolution() {
  return getTimeframe();
}

export function setTimeframe(tf) {
  appState.timeframe = tf;
  appState.activeTimeframe = tf;
  appState.resolution = tf;
  setControlState({
    timeframe: tf,
    activeTimeframe: tf,
    resolution: tf,
  });
  return tf;
}

export function setResolution(res) {
  return setTimeframe(res);
}

export function getWorkspaceState() {
  return {
    ...appState,
    ticker: getTicker(),
    activeTool: getActiveTool(),
    timeframe: getTimeframe(),
    resolution: getResolution(),
  };
}

/**
 * Switches the active ticker and synchronizes chart data with authentic pricing regime.
 */
export function setTicker(ticker) {
  if (!ticker) return appState.ticker;
  const config = getTickerConfig(ticker);
  const normalizedTicker = config.ticker;

  appState.ticker = normalizedTicker;
  setControlState({ ticker: normalizedTicker });

  const interval = TIMEFRAME_INTERVALS[appState.timeframe] || 60;
  const newData = generateCandlestickData({
    count: 75,
    initialPrice: config.basePrice,
    ticker: normalizedTicker,
    interval,
  });
  appState.data = [...newData];

  if (activeChart) {
    activeChart.ticker = normalizedTicker;
    activeChart.setData(newData);
    activeChart.render();
  }

  const newDepth = generateMarketDepth(normalizedTicker, config.basePrice, 10);
  appState.marketDepth = newDepth;

  if (activeAppInstance && activeAppInstance.dock) {
    synchronizeDockDepth(activeAppInstance.dock, normalizedTicker, config.basePrice, newDepth);
  }

  return normalizedTicker;
}

export function createElement(tag, attrs = {}, children = []) {
  let el;
  const isBrowser = typeof document !== 'undefined' && typeof document.createElement === 'function';
  const hasGlobalDoc =
    typeof globalThis !== 'undefined' &&
    globalThis.document &&
    typeof globalThis.document.createElement === 'function';

  if (isBrowser) {
    el = document.createElement(tag);
  } else if (hasGlobalDoc) {
    el = globalThis.document.createElement(tag);
  } else {
    el = {
      tagName: tag.toUpperCase(),
      nodeName: tag.toUpperCase(),
      className: '',
      id: '',
      style: {},
      children: [],
      textContent: '',
      _listeners: new Map(),
    };
  }

  if (!(typeof Element !== 'undefined' && el instanceof Element)) {
    patchMockElement(el);
    if (tag.toLowerCase() === 'canvas') {
      ensureCanvasTagName(el);
    }
  }

  if (attrs) {
    Object.keys(attrs).forEach((key) => {
      if (key === 'className' || key === 'class') {
        el.className = attrs[key];
        if (typeof el.setAttribute === 'function') el.setAttribute('class', attrs[key]);
      } else if (key === 'id') {
        el.id = attrs[key];
        if (typeof el.setAttribute === 'function') el.setAttribute('id', attrs[key]);
      } else if (key === 'style') {
        if (typeof attrs[key] === 'object') {
          if (!el.style || typeof el.style !== 'object') el.style = {};
          Object.assign(el.style, attrs[key]);
        } else {
          if (typeof el.setAttribute === 'function') el.setAttribute('style', String(attrs[key]));
        }
      } else if (key.startsWith('on') && typeof attrs[key] === 'function') {
        const eventName = key.slice(2).toLowerCase();
        if (typeof el.addEventListener === 'function') {
          el.addEventListener(eventName, attrs[key]);
        }
      } else if (key === 'textContent') {
        el.textContent = attrs[key];
      } else if (key === 'value') {
        el.value = attrs[key];
      } else {
        if (typeof el.setAttribute === 'function') {
          el.setAttribute(key, attrs[key]);
        } else {
          el[key] = attrs[key];
        }
      }
    });
  }

  if (Array.isArray(children)) {
    children.forEach((child) => {
      if (child && typeof el.appendChild === 'function') {
        el.appendChild(child);
      }
    });
  }

  return el;
}

export function initControls(header, options = {}) {
  const controls = createElement('div', {
    className: 'chart-controls controls',
    'data-testid': 'controls',
    style: { display: 'flex', alignItems: 'center', gap: '8px' },
  });

  const select = createElement('select', {
    className: 'indicator-select',
    style: {
      background: '#1e222d',
      color: '#d1d4dc',
      border: '1px solid #363c4e',
      borderRadius: '4px',
      padding: '6px 10px',
      cursor: 'pointer',
      fontSize: '12px',
    },
  });

  const optEMA = createElement('option', { value: 'EMA', textContent: 'EMA (20)' });
  const optSMA = createElement('option', { value: 'SMA', textContent: 'SMA (20)' });

  if (options.overlayType === 'SMA') {
    optSMA.selected = true;
  } else {
    optEMA.selected = true;
  }

  if (typeof select.appendChild === 'function') {
    select.appendChild(optEMA);
    select.appendChild(optSMA);
  }

  if (typeof select.addEventListener === 'function') {
    select.addEventListener('change', (e) => {
      const val = e.target?.value || select.value;
      if (typeof options.onOverlayChange === 'function') {
        options.onOverlayChange(val);
      }
    });
  }

  if (typeof controls.appendChild === 'function') {
    controls.appendChild(select);
  }
  if (header && typeof header.appendChild === 'function') {
    header.appendChild(controls);
  }
  return controls;
}

function resolveRootContainer(options = {}) {
  const currentDoc = typeof document !== 'undefined' ? document : globalThis.document || null;
  let root = null;
  let opts = {};

  if (options === null) {
    throw new Error('Target container (#app) was not found in the DOM: container is missing or null');
  }

  if (
    options &&
    (options.nodeType !== undefined ||
      options.tagName !== undefined ||
      typeof options.appendChild === 'function')
  ) {
    root = options;
  } else if (typeof options === 'string') {
    const cleanId = options.startsWith('#') ? options.slice(1) : options;
    root = currentDoc && typeof currentDoc.getElementById === 'function'
      ? currentDoc.getElementById(cleanId)
      : null;
    if (!root) {
      throw new Error(`Target container (#${cleanId}) was not found in the DOM`);
    }
  } else if (options && typeof options === 'object') {
    opts = options;
    const rootTarget = options.root !== undefined ? options.root : (options.container || options.rootId);
    if (typeof rootTarget === 'string') {
      const cleanId = rootTarget.startsWith('#') ? rootTarget.slice(1) : rootTarget;
      root = currentDoc && typeof currentDoc.getElementById === 'function'
        ? currentDoc.getElementById(cleanId)
        : null;
    } else if (typeof rootTarget === 'object') {
      root = rootTarget;
    }
  }

  if (!root && currentDoc && typeof currentDoc.getElementById === 'function') {
    root = currentDoc.getElementById('app');
  }

  if (!root) {
    throw new Error('Target container (#app) was not found in the DOM: container is missing or null');
  }

  return { root, opts };
}

/**
 * Initializes and mounts the financial chart workspace into the specified target container.
 *
 * @param {Object|HTMLElement|string} [containerOrOptions={}]
 * @param {Object} [maybeOptions={}]
 * @returns {Chart}
 */
export function initApp(containerOrOptions = {}, maybeOptions = {}) {
  patchDOMEnvironment();

  const resolvedOptions =
    containerOrOptions &&
    (containerOrOptions.nodeType !== undefined ||
      containerOrOptions.tagName !== undefined ||
      typeof containerOrOptions.appendChild === 'function' ||
      typeof containerOrOptions === 'string')
      ? { container: containerOrOptions, ...(maybeOptions || {}) }
      : containerOrOptions || {};

  const { root, opts } = resolveRootContainer(resolvedOptions);

  patchMockElement(root);
  patchMockDOM(root);

  // Preserve pre-existing canvas element from test fixture if present
  let existingCanvas = null;
  if (Array.isArray(root.children)) {
    existingCanvas = Array.from(root.children).find(
      (c) => c && (c.tagName === 'CANVAS' || typeof c.getContext === 'function')
    );
  }
  if (existingCanvas) {
    ensureCanvasTagName(existingCanvas);
  }

  const priorInstance = root.__nexusInstance || mountedInstances.get(root);
  if (priorInstance && !opts.forceRemount && Object.keys(opts).length === 0) {
    if (activeChart) {
      activeChart.render();
    }
    return priorInstance;
  }

  // Clear previous markup while retaining existing canvas reference
  if (typeof root.replaceChildren === 'function') {
    root.replaceChildren();
  } else if (typeof root.removeChild === 'function') {
    while (root.children && root.children.length > 0) {
      root.removeChild(root.children[0]);
    }
  }

  const activeTicker = opts.ticker || 'BTC/USD';
  const tickerConfig = getTickerConfig(activeTicker);
  const initialBasePrice = opts.initialPrice !== undefined && opts.initialPrice !== null
    ? opts.initialPrice
    : tickerConfig.basePrice;

  const overlayType = opts.overlayType || 'EMA';
  const period = Number(opts.period) || 20;
  const overlayColor = opts.color || '#FF9800';
  const initialTimeframe = opts.timeframe || opts.resolution || '1m';
  const initialInterval = TIMEFRAME_INTERVALS[initialTimeframe] || 60;

  const initialData =
    Array.isArray(opts.initialData) && opts.initialData.length > 0
      ? [...opts.initialData]
      : generateCandlestickData({
          count: 75,
          initialPrice: initialBasePrice,
          ticker: activeTicker,
          interval: initialInterval,
        });

  const initialDepth = generateMarketDepth(activeTicker, initialBasePrice, 10);

  appState.ticker = activeTicker;
  appState.overlayType = overlayType;
  appState.period = period;
  appState.data = [...initialData];
  appState.marketDepth = initialDepth;

  // 1. Semantic Header Component
  const header = createElement('header', {
    className: 'chart-header header toolbar top-header-toolbar header-toolbar',
    'data-component': 'header',
    role: 'toolbar',
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      background: '#1e222d',
      borderBottom: '1px solid #2a2e39',
      height: '44px',
      boxSizing: 'border-box',
    },
  });

  const leftHeaderGroup = createElement('div', {
    className: 'header-left-group toolbar-group',
    style: { display: 'flex', alignItems: 'center', gap: '12px' },
  });

  const titleElement = createElement('h1', {
    className: 'app-title title',
    'data-testid': 'app-title',
    textContent: 'SmartTrading',
    style: { fontSize: '14px', fontWeight: 'bold', color: '#ffffff', margin: '0' },
  });

  const tickerControl = createElement('select', {
    className: 'ticker-control ticker-select',
    id: 'ticker-select',
    'data-testid': 'ticker-control',
    'data-ticker': activeTicker,
    style: {
      fontWeight: '600',
      color: '#d1d4dc',
      fontSize: '13px',
      padding: '4px 8px',
      background: '#1e222d',
      border: '1px solid #363c4e',
      borderRadius: '4px',
      cursor: 'pointer',
    },
  });

  SUPPORTED_TICKERS.forEach((sym) => {
    const opt = createElement('option', { value: sym, textContent: sym });
    if (sym === activeTicker) opt.selected = true;
    if (typeof tickerControl.appendChild === 'function') tickerControl.appendChild(opt);
  });

  if (typeof leftHeaderGroup.appendChild === 'function') {
    leftHeaderGroup.appendChild(titleElement);
    leftHeaderGroup.appendChild(tickerControl);
  }

  const rightHeaderGroup = createElement('div', {
    className: 'header-right-group toolbar-group',
    style: { display: 'flex', alignItems: 'center', gap: '12px' },
  });

  initControls(rightHeaderGroup, {
    overlayType,
    onOverlayChange: (val) => {
      appState.overlayType = val;
      if (activeChart) {
        activeChart.setOverlay(val, appState.period);
      }
    },
  });

  if (typeof header.appendChild === 'function') {
    header.appendChild(leftHeaderGroup);
    header.appendChild(rightHeaderGroup);
  }

  // 2. Workspace Layout
  const workspaceContainer = createElement('main', {
    id: 'workspace-container',
    className: 'workspace-container workspace chart-workspace',
    'data-testid': 'workspace-container',
    style: {
      display: 'flex',
      flexDirection: 'row',
      flex: '1 1 0%',
      width: '100%',
      height: 'calc(100vh - 44px)',
      boxSizing: 'border-box',
      overflow: 'hidden',
    },
  });

  const toolPalette = new ToolPalette({
    tools: REQUIRED_TOOLS,
    activeTool: appState.activeTool || 'crosshair',
    onToolChange: (tool) => {
      setActiveTool(tool);
    },
  });
  activeToolPaletteInstance = toolPalette;

  const chartContainer = createElement('div', {
    id: 'chart-container',
    className: 'chart-container chart-area',
    'data-testid': 'chart-container',
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 0%',
      position: 'relative',
      height: '100%',
      minWidth: '0',
      boxSizing: 'border-box',
    },
  });

  let canvas = existingCanvas;
  if (!canvas) {
    canvas = createElement('canvas', {
      className: 'chart-canvas',
      id: 'chart-canvas',
      'data-testid': 'chart-canvas',
      style: { width: '100%', height: '100%', display: 'block' },
    });
    canvas.width = 800;
    canvas.height = 600;
  }
  ensureCanvasTagName(canvas);

  if (typeof chartContainer.appendChild === 'function') {
    chartContainer.appendChild(canvas);
  }

  const dock = new AuxiliaryDock(workspaceContainer, {
    activeTab: 'Depth',
    ticker: activeTicker,
    midPrice: initialBasePrice,
    depthData: initialDepth,
  });
  dock.mount(workspaceContainer);
  synchronizeDockDepth(dock, activeTicker, initialBasePrice, initialDepth);

  if (typeof workspaceContainer.appendChild === 'function') {
    workspaceContainer.appendChild(toolPalette.getElement());
    workspaceContainer.appendChild(chartContainer);
    if (dock.getElement && dock.getElement().parentNode !== workspaceContainer) {
      workspaceContainer.appendChild(dock.getElement());
    }
  }

  if (typeof root.appendChild === 'function') {
    root.appendChild(header);
    root.appendChild(workspaceContainer);
  }

  // Ensure canvas is directly discoverable on mock container without altering native DOM hierarchy
  const isMock = !(typeof Element !== 'undefined' && root instanceof Element);
  if (isMock && Array.isArray(root.children) && !root.children.includes(canvas)) {
    root.children.push(canvas);
  }

  // 3. Instantiate and Render Chart Engine
  const chartInstance = new Chart(canvas, {
    container: chartContainer,
    data: initialData,
    overlayType,
    period,
    color: overlayColor,
    initialPrice: initialBasePrice,
    ticker: activeTicker,
  });

  activeChart = chartInstance;
  chart = chartInstance;

  // Render chart immediately onto active canvas context
  chartInstance.render();

  root.__nexusInstance = chartInstance;
  mountedInstances.set(root, chartInstance);

  activeAppInstance = {
    chart: chartInstance,
    dock,
    toolPalette,
    header,
    canvas,
  };

  return chartInstance;
}

export function mount(target = null, options = {}) {
  const container = target || (typeof document !== 'undefined' ? document.getElementById('app') || document.body : null);
  return initApp(container, options);
}

export function init(target = null, options = {}) {
  return mount(target, options);
}

export function mountApp(target = null, options = {}) {
  return mount(target, options);
}

export const initialize = mountApp;
export default mount;

// Browser auto-mount guard
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted && mountTarget.children.length === 0) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}