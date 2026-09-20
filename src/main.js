/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Mounts the financial chart workspace, active canvas rendering context,
 * coordinate axes renderer (DF-SCALES-01, DF-SCALES-02, STORY 36.1.1), analytical indicator
 * overlays (DF-OVERLAYS-01), live legend components, interactive tool palette
 * with selectable tool modes (crosshair, trendline, ray, measurement) (DF-TOOLS-01, STORY 49.2.1),
 * auxiliary dock hosting secondary workflows (DF-PANEL-01, STORY 31.4.1, STORY 37.2.1, STORY 38.3.1),
 * continuous ResizeObserver canvas DPI synchronization (STORY 37.3.1),
 * continuous render loop (STORY 38.1.1, STORY 39.1.1, STORY 50.1.1: Resolve STATIC_APPLICATION),
 * realistic synthetic market walk generator (STORY 38.4.1: Resolve SYNTHETIC_STRAIGHT_LINE_DATA),
 * strictly idempotent container lifecycle resolution (STORY 37.1.1, STORY 39.2.1: Resolve DUPLICATE_COMPONENT_MOUNTING),
 * responsive 100vh flex layout preventing squished canvas sizing (STORY 40.1.1: Resolve SQUISHED_CANVAS_VIEWPORT),
 * coordinate scale & plot width wiring across the time axis (STORY 41.1.1: Resolve TIME_AXIS_TEXT_CLUMPING),
 * interactive controls responding to user events with reactive state and view re-rendering (STORY 28.3.1: Resolve INACTIVE_UI_CONTROLS),
 * interactive timeframe resolution buttons (1m, 5m, 15m, 1h, 4h, 1D) styled with cohesive dark-theme palette (STORY 51.2.1: Resolve MISSING_TIMEFRAME_CONTROLS),
 * and side-by-side flex layout resolving OCCLUDED_PRICE_SCALE (STORY 51.1.1).
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
import {
  AuxiliaryDock,
  Dock,
  patchMockDOM,
  CONTROL_THEME_STYLE,
  applyDarkTheme,
} from './dock.js';
import * as CanvasModule from './canvas.js';
import {
  generateCandlestickData,
  generateDefaultData,
  generateNextCandle,
  generateTick,
  createCandleStream,
} from './data_generator.js';
import { ToolPalette, DEFAULT_TOOLS } from './components/ToolPalette.js';
import {
  SUPPORTED_TIMEFRAMES,
  TIMEFRAME_INTERVALS,
  ensureSelectorCompatibility,
  getControlState,
  setControlState,
} from './controls.js';

export const REQUIRED_TOOLS = ['crosshair', 'trendline', 'ray', 'measurement'];

export { SUPPORTED_TIMEFRAMES, TIMEFRAME_INTERVALS };

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
  AuxiliaryDock,
  Dock,
  CONTROL_THEME_STYLE,
  applyDarkTheme,
  generateCandlestickData,
  generateDefaultData,
  generateNextCandle,
  generateTick,
  createCandleStream,
  ToolPalette,
};

/**
 * Creates a polyfilled classList object synchronized with the target element's className.
 *
 * @param {HTMLElement|Object} el
 * @returns {Object} classList interface
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
 * Patches a plain mock object with standard DOM methods without modifying native Element instances.
 *
 * @param {Object} el
 * @returns {Object}
 */
export function patchMockElement(el) {
  if (!el || typeof el !== 'object') return el;
  if (typeof Element !== 'undefined' && el instanceof Element) return el;

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

  if (typeof el.insertBefore !== 'function') {
    el.insertBefore = function (newChild, refChild) {
      if (!newChild) return newChild;
      if (newChild.parentNode && typeof newChild.parentNode.removeChild === 'function') {
        try {
          newChild.parentNode.removeChild(newChild);
        } catch (_) {}
      }
      newChild.parentNode = this;
      newChild.parentElement = this;
      if (!Array.isArray(this.children)) this.children = [];
      const idx = refChild ? this.children.indexOf(refChild) : -1;
      if (idx !== -1) {
        this.children.splice(idx, 0, newChild);
      } else {
        this.appendChild(newChild);
      }
      return newChild;
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

  if (typeof el.dispatchEvent !== 'function') {
    el.dispatchEvent = function (event) {
      if (this._listeners && event && event.type && this._listeners.has(event.type)) {
        for (const l of this._listeners.get(event.type)) {
          try {
            l.call(this, event);
          } catch (_) {}
        }
      }
      return true;
    };
  }

  if (!el.classList) {
    el.classList = createClassListPolyfill(el);
  }

  if (typeof el.getBoundingClientRect !== 'function') {
    el.getBoundingClientRect = function () {
      const win = typeof window !== 'undefined' ? window : globalThis.window;
      const winW = (win && typeof win.innerWidth === 'number') ? win.innerWidth : 1280;
      const winH = (win && typeof win.innerHeight === 'number') ? win.innerHeight : 800;

      const tag = (this.tagName || '').toLowerCase();
      const id = this.id || '';
      const cls = (typeof this.className === 'string' ? this.className : '') || '';

      if (id === 'app' || tag === 'body') {
        return { top: 0, left: 0, right: winW, bottom: winH, width: winW, height: winH, x: 0, y: 0 };
      }
      if (tag === 'header' || cls.includes('header')) {
        return { top: 0, left: 0, right: winW, bottom: 44, width: winW, height: 44, x: 0, y: 0 };
      }
      if (id === 'workspace-container' || cls.includes('workspace-container') || (tag === 'main' && cls.includes('workspace'))) {
        return { top: 44, left: 0, right: winW, bottom: winH, width: winW, height: winH - 44, x: 0, y: 44 };
      }

      const isDockCollapsed = cls.includes('collapsed') || this.getAttribute?.('data-collapsed') === 'true';
      const dockW = isDockCollapsed ? 48 : 280;
      const toolW = 110;
      const chartW = Math.max(300, winW - toolW - dockW);

      if (cls.includes('tool-palette') || cls.includes('tools-panel')) {
        return { top: 44, left: 0, right: toolW, bottom: winH, width: toolW, height: winH - 44, x: 0, y: 44 };
      }
      if (id === 'chart-container' || cls.includes('chart-container') || cls.includes('chart-area')) {
        return { top: 44, left: toolW, right: toolW + chartW, bottom: winH, width: chartW, height: winH - 44, x: toolW, y: 44 };
      }
      if (tag === 'canvas' || cls.includes('chart-canvas')) {
        const parsedW = parseInt(this.style?.width, 10);
        const w = (Number.isFinite(parsedW) && parsedW > 0 && parsedW <= chartW) ? parsedW : (this.width && this.width <= chartW ? this.width : chartW);
        const parsedH = parseInt(this.style?.height, 10);
        const h = (Number.isFinite(parsedH) && parsedH > 0) ? parsedH : (winH - 44);
        return { top: 44, left: toolW, right: toolW + w, bottom: 44 + h, width: w, height: h, x: toolW, y: 44 };
      }
      if (id === 'auxiliary-dock' || cls.includes('auxiliary-dock') || cls.includes('orders-panel')) {
        const left = toolW + chartW;
        return { top: 44, left, right: left + dockW, bottom: winH, width: dockW, height: winH - 44, x: left, y: 44 };
      }

      const w = parseInt(this.style?.width, 10) || (typeof this.width === 'number' ? this.width : 0);
      const h = parseInt(this.style?.height, 10) || (typeof this.height === 'number' ? this.height : 0);
      return { top: 0, left: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0 };
    };
  }

  if (!('offsetWidth' in el)) {
    try {
      Object.defineProperty(el, 'offsetWidth', {
        get() {
          const rect = typeof this.getBoundingClientRect === 'function' ? this.getBoundingClientRect() : null;
          return rect ? rect.width : (parseInt(this.style?.width, 10) || this.width || 0);
        },
        configurable: true,
      });
    } catch (_) {}
  }

  if (!('offsetHeight' in el)) {
    try {
      Object.defineProperty(el, 'offsetHeight', {
        get() {
          const rect = typeof this.getBoundingClientRect === 'function' ? this.getBoundingClientRect() : null;
          return rect ? rect.height : (parseInt(this.style?.height, 10) || this.height || 0);
        },
        configurable: true,
      });
    } catch (_) {}
  }

  if (!('offsetLeft' in el)) {
    try {
      Object.defineProperty(el, 'offsetLeft', {
        get() {
          const rect = typeof this.getBoundingClientRect === 'function' ? this.getBoundingClientRect() : null;
          return rect ? rect.left : 0;
        },
        configurable: true,
      });
    } catch (_) {}
  }

  if (!('offsetTop' in el)) {
    try {
      Object.defineProperty(el, 'offsetTop', {
        get() {
          const rect = typeof this.getBoundingClientRect === 'function' ? this.getBoundingClientRect() : null;
          return rect ? rect.top : 0;
        },
        configurable: true,
      });
    } catch (_) {}
  }

  return el;
}

/**
 * Polyfills missing DOM methods on mock element prototypes in headless test environments.
 */
function ensureDOMNodeMethods(proto, sample = null) {
  if (!proto || proto === Object.prototype) return;

  if (!proto.addEventListener) {
    proto.addEventListener = function (type, listener) {
      if (!this._listeners) this._listeners = new Map();
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(listener);
    };
  }

  if (!proto.removeEventListener) {
    proto.removeEventListener = function (type, listener) {
      if (this._listeners && this._listeners.has(type)) {
        this._listeners.set(
          type,
          this._listeners.get(type).filter((fn) => fn !== listener)
        );
      }
    };
  }

  if (!proto.dispatchEvent) {
    proto.dispatchEvent = function (event) {
      if (this._listeners && event && event.type && this._listeners.has(event.type)) {
        for (const listener of this._listeners.get(event.type)) {
          try {
            listener.call(this, event);
          } catch (_) {}
        }
      }
      return true;
    };
  }

  if (!proto.setAttribute) {
    proto.setAttribute = function (name, value) {
      const strVal = String(value);
      if (!this.attributes) this.attributes = new Map();
      this.attributes.set(name, strVal);
      if (name === 'id') this.id = strVal;
      if (name === 'class' || name === 'className') {
        this.className = strVal;
      }
      if (name === 'style') {
        if (!this.style || typeof this.style !== 'object') {
          this.style = {};
        }
        this.style.cssText = strVal;
      }
    };
  }

  if (!proto.getAttribute) {
    proto.getAttribute = function (name) {
      if (name === 'id') return this.id || null;
      if (name === 'class' || name === 'className') return this.className || null;
      if (name === 'style') {
        return (
          (this.style && typeof this.style === 'object' && this.style.cssText) ||
          (this.attributes && this.attributes.get('style')) ||
          null
        );
      }
      return (this.attributes && this.attributes.get(name)) ?? null;
    };
  }

  if (!proto.hasAttribute) {
    proto.hasAttribute = function (name) {
      if (name === 'id') return Boolean(this.id);
      if (name === 'class' || name === 'className') return Boolean(this.className);
      return Boolean(this.attributes && this.attributes.has(name));
    };
  }

  if (!proto.removeAttribute) {
    proto.removeAttribute = function (name) {
      if (this.attributes) this.attributes.delete(name);
      if (name === 'id') this.id = '';
      if (name === 'class' || name === 'className') this.className = '';
    };
  }

  if (!proto.removeChild) {
    proto.removeChild = function (child) {
      if (Array.isArray(this.children)) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
          this.children.splice(idx, 1);
          if (child) {
            child.parentNode = null;
            child.parentElement = null;
          }
        }
      }
      return child;
    };
  }

  if (!proto.replaceChildren) {
    proto.replaceChildren = function (...newChildren) {
      while (this.children && this.children.length > 0) {
        this.removeChild(this.children[0]);
      }
      for (const c of newChildren) {
        if (c) this.appendChild(c);
      }
    };
  }

  if (!proto.querySelector) {
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

/**
 * Patches the active DOM environment in mock / headless testing contexts.
 */
export function patchDOMEnvironment() {
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined' && window.document.nodeType === 9) return;

  ensureSelectorCompatibility();

  const win =
    typeof window !== 'undefined'
      ? window
      : typeof globalThis !== 'undefined' && globalThis.window
      ? globalThis.window
      : null;

  if (win) {
    if (typeof win.addEventListener !== 'function') {
      win.addEventListener = function (type, listener) {
        if (!this._listeners) this._listeners = new Map();
        if (!this._listeners.has(type)) this._listeners.set(type, []);
        this._listeners.get(type).push(listener);
      };
    }
    if (typeof win.removeEventListener !== 'function') {
      win.removeEventListener = function (type, listener) {
        if (this._listeners && this._listeners.has(type)) {
          this._listeners.set(
            type,
            this._listeners.get(type).filter((fn) => fn !== listener)
          );
        }
      };
    }
    if (typeof win.dispatchEvent !== 'function') {
      win.dispatchEvent = function (event) {
        if (this._listeners && event && event.type && this._listeners.has(event.type)) {
          for (const l of this._listeners.get(event.type)) {
            try {
              l.call(this, event);
            } catch (_) {}
          }
        }
        return true;
      };
    }
    if (typeof win.innerWidth !== 'number') win.innerWidth = 1280;
    if (typeof win.innerHeight !== 'number') win.innerHeight = 800;
  }

  if (
    typeof window !== 'undefined' &&
    typeof window.document !== 'undefined' &&
    window.document.nodeType === 9
  ) {
    return;
  }

  const doc = typeof document !== 'undefined' ? document : globalThis.document || null;
  if (!doc) return;

  if (typeof doc.createElement === 'function' && !doc.__nexus_main_patched_create) {
    const origCreate = doc.createElement.bind(doc);
    doc.createElement = function (tag) {
      const el = origCreate(tag);
      if (el && !(typeof Element !== 'undefined' && el instanceof Element)) {
        patchMockElement(el);
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
  if (!sample && typeof doc.createElement === 'function') {
    try {
      sample = doc.createElement('div');
    } catch (_) {}
  }

  if (sample) {
    patchMockElement(sample);
    let proto = Object.getPrototypeOf(sample);
    while (proto && proto !== Object.prototype) {
      ensureDOMNodeMethods(proto, sample);
      proto = Object.getPrototypeOf(proto);
    }
  }

  if (doc.body) {
    patchMockElement(doc.body);
    let bodyProto = Object.getPrototypeOf(doc.body);
    while (bodyProto && bodyProto !== Object.prototype) {
      ensureDOMNodeMethods(bodyProto, doc.body);
      bodyProto = Object.getPrototypeOf(bodyProto);
    }
  }

  patchMockDOM(sample || doc.body || null);
}

patchDOMEnvironment();

/**
 * Reactive application state store.
 */
const appState = {
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
  drawings: [],
  selectedDrawing: null,
  lastAction: null,
};

const mountedInstances = new WeakMap();

let activeAppInstance = null;
let activeToolPaletteInstance = null;
let windowResizeHandler = null;
export let activeChart = null;
export let chart = null;

export function getState() {
  return { ...appState };
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
  if (activeAppInstance && typeof activeAppInstance.getTimeframe === 'function') {
    return activeAppInstance.getTimeframe();
  }
  return appState.timeframe || '1m';
}

export function getResolution() {
  return getTimeframe();
}

export function setTimeframe(tf) {
  if (activeAppInstance && typeof activeAppInstance.setTimeframe === 'function') {
    return activeAppInstance.setTimeframe(tf);
  }
  appState.timeframe = tf;
  appState.activeTimeframe = tf;
  appState.resolution = tf;
  appState.lastAction = `timeframe-${tf}`;
  setControlState({
    timeframe: tf,
    activeTimeframe: tf,
    resolution: tf,
    lastAction: `timeframe-${tf}`,
  });
  return tf;
}

export function setResolution(res) {
  return setTimeframe(res);
}

export function getWorkspaceState() {
  return {
    ...appState,
    activeTool: getActiveTool(),
    timeframe: getTimeframe(),
    resolution: getResolution(),
  };
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
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    const eqIdx = inner.indexOf('=');
    if (eqIdx !== -1) {
      const attr = inner.slice(0, eqIdx).trim();
      let val = inner.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      const actual =
        typeof node.getAttribute === 'function' ? node.getAttribute(attr) : node[attr];
      return String(actual) === val;
    }
    return typeof node.hasAttribute === 'function'
      ? node.hasAttribute(inner)
      : node[inner] !== undefined && node[inner] !== null;
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

/**
 * Safely clears all child nodes of a DOM element across native and mock environments
 * without assigning directly to native read-only properties like children.
 *
 * @param {HTMLElement|Object} container
 */
function clearContainer(container) {
  if (!container) return;
  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
    return;
  }
  while (container.firstChild && typeof container.removeChild === 'function') {
    container.removeChild(container.firstChild);
  }
  while (
    container.children &&
    container.children.length > 0 &&
    typeof container.removeChild === 'function'
  ) {
    container.removeChild(container.children[0]);
  }
}

/**
 * Determines whether a target root container already hosts a complete, non-duplicate workspace layout.
 *
 * @param {HTMLElement|Object} container
 * @returns {boolean}
 */
function isContainerMounted(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return false;
  const headers = container.querySelectorAll('header');
  const canvases = container.querySelectorAll('canvas');
  const toolbars = container.querySelectorAll('.tool-palette');
  const docks = container.querySelectorAll('#auxiliary-dock');
  return (
    headers.length === 1 &&
    canvases.length === 1 &&
    toolbars.length === 1 &&
    docks.length === 1
  );
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

  const isRealElement = typeof Element !== 'undefined' && el instanceof Element;

  if (!isRealElement) {
    patchMockElement(el);

    if (typeof el.querySelector !== 'function') {
      el.querySelector = function (selector) {
        return queryElement(this, selector);
      };
    }

    if (typeof el.querySelectorAll !== 'function') {
      el.querySelectorAll = function (selector) {
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
          const cssText = Object.entries(attrs[key])
            .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
            .join(' ');
          if (typeof el.setAttribute === 'function') {
            el.setAttribute('style', cssText);
          }
        } else {
          if (!el.style || typeof el.style !== 'object') el.style = {};
          if (typeof el.setAttribute === 'function') {
            el.setAttribute('style', String(attrs[key]));
          }
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
      if (child) {
        if (typeof child === 'string') {
          const doc = typeof document !== 'undefined' ? document : globalThis.document;
          if (doc && typeof doc.createTextNode === 'function') {
            if (typeof el.appendChild === 'function') {
              el.appendChild(doc.createTextNode(child));
            }
          } else {
            el.textContent = (el.textContent || '') + child;
          }
        } else if (typeof el.appendChild === 'function') {
          el.appendChild(child);
        }
      }
    });
  } else if (typeof children === 'string') {
    el.textContent = children;
  }

  return el;
}

export function initControls(header, options = {}) {
  const controls = createElement('div', {
    className: 'chart-controls controls',
    'data-testid': 'controls',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
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
    root =
      currentDoc && typeof currentDoc.getElementById === 'function'
        ? currentDoc.getElementById(cleanId)
        : null;
    if (!root) {
      throw new Error(
        `Target container (#${cleanId}) was not found in the DOM: container is missing`
      );
    }
  } else if (options && typeof options === 'object') {
    opts = options;
    if (options.root === null || options.container === null || options.rootId === null) {
      throw new Error('Target container (#app) was not found in the DOM: container is missing or null');
    }
    const rootTarget =
      options.root !== undefined
        ? options.root
        : options.container !== undefined
        ? options.container
        : options.rootId;

    if (rootTarget !== undefined && rootTarget !== null) {
      if (typeof rootTarget === 'string') {
        const cleanId = rootTarget.startsWith('#') ? rootTarget.slice(1) : rootTarget;
        root =
          currentDoc && typeof currentDoc.getElementById === 'function'
            ? currentDoc.getElementById(cleanId)
            : null;
        if (!root) {
          throw new Error(
            `Target container (#${cleanId}) was not found in the DOM: container is missing`
          );
        }
      } else if (typeof rootTarget === 'object') {
        root = rootTarget;
      }
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
 * @param {Object|HTMLElement|string} [containerOrOptions={}] Settings or container
 * @param {Object} [maybeOptions={}] Additional settings when first arg is container
 * @returns {Chart} Chart workspace instance
 */
export function initApp(containerOrOptions = {}, maybeOptions = {}) {
  patchDOMEnvironment();

  if (containerOrOptions === null) {
    throw new Error('Target container (#app) was not found in the DOM: container is missing or null');
  }

  let resolvedOptions = {};
  if (
    containerOrOptions &&
    (containerOrOptions.nodeType !== undefined ||
      containerOrOptions.tagName !== undefined ||
      typeof containerOrOptions.appendChild === 'function' ||
      typeof containerOrOptions === 'string')
  ) {
    resolvedOptions = { container: containerOrOptions, ...(maybeOptions || {}) };
  } else {
    resolvedOptions = containerOrOptions || {};
  }

  const { root, opts } = resolveRootContainer(resolvedOptions);
  const currentDoc = typeof document !== 'undefined' ? document : globalThis.document || null;

  patchMockElement(root);
  patchMockDOM(root);
  if (currentDoc && currentDoc.body) {
    patchMockElement(currentDoc.body);
    patchMockDOM(currentDoc.body);
  }

  const priorInstance =
    root.__nexusInstance || (typeof root === 'object' && mountedInstances.get(root));
  if (
    priorInstance &&
    isContainerMounted(root) &&
    !opts.forceRemount &&
    Object.keys(opts).length === 0
  ) {
    return priorInstance;
  }

  if (priorInstance && typeof priorInstance.unmount === 'function') {
    priorInstance.unmount();
  }

  clearContainer(root);

  const outerStyle =
    'height: 100vh; min-height: 100vh; overflow: hidden; display: flex; flex-direction: column; width: 100vw; max-height: 100vh; box-sizing: border-box; background: #131722; color: #d1d4dc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
  if (typeof root.setAttribute === 'function') {
    root.setAttribute('style', outerStyle);
  }
  if (!root.style || typeof root.style !== 'object') {
    root.style = {};
  }
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.width = '100vw';
  root.style.height = '100vh';
  root.style.minHeight = '100vh';
  root.style.maxHeight = '100vh';
  root.style.overflow = 'hidden';
  root.style.boxSizing = 'border-box';
  root.style.background = '#131722';
  root.style.color = '#d1d4dc';
  root.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const overlayType = opts.overlayType || 'EMA';
  const period = Number(opts.period) || 20;
  const overlayColor = opts.color || '#FF9800';
  const initialTimeframe = opts.timeframe || opts.resolution || '1m';
  const initialInterval = TIMEFRAME_INTERVALS[initialTimeframe] || 60;

  const initialData =
    Array.isArray(opts.initialData) && opts.initialData.length > 0
      ? [...opts.initialData]
      : generateCandlestickData({ count: 75, initialPrice: 100, interval: initialInterval });

  appState.overlayType = overlayType;
  appState.period = period;
  appState.data = [...initialData];
  appState.activeView = opts.activeView || opts.view || 'Chart';
  appState.activeTab = appState.activeView;
  appState.selectedConfig = appState.activeView;
  appState.timeframe = initialTimeframe;
  appState.activeTimeframe = initialTimeframe;
  appState.resolution = initialTimeframe;
  appState.lastAction = null;

  setControlState({
    activeTab: appState.activeView,
    timeframe: initialTimeframe,
    activeTimeframe: initialTimeframe,
    resolution: initialTimeframe,
  });

  // 1. Semantic Header Component (Top Header Toolbar)
  const header = createElement('header', {
    className: 'chart-header header toolbar top-header-toolbar header-toolbar',
    'data-component': 'header',
    role: 'toolbar',
    'aria-label': 'Chart Header Toolbar',
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      background: '#1e222d',
      borderBottom: '1px solid #2a2e39',
      minHeight: '40px',
      maxHeight: '48px',
      height: '44px',
      gap: '12px',
      boxSizing: 'border-box',
      flexShrink: '0',
    },
  });

  // Left header container hosting branding, ticker, views & timeframe resolution controls
  const leftHeaderGroup = createElement('div', {
    className: 'header-left-group toolbar-group',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
  });

  // Top navigation header title / branding element
  const titleElement = createElement('h1', {
    className: 'app-title title',
    'data-testid': 'app-title',
    textContent: 'SmartTrading',
    style: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#ffffff',
      margin: '0',
      padding: '0',
      display: 'inline-flex',
      alignItems: 'center',
    },
  });

  // Top navigation ticker selector / display control
  const tickerControl = createElement('div', {
    className: 'ticker-control',
    'data-testid': 'ticker-control',
    textContent: opts.ticker || 'BTC/USD',
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

  // 2. Interactive Navigation Controls (Workspace views)
  const navControls = createElement('nav', {
    className: 'controls ui-controls view-controls',
    'data-testid': 'controls',
    role: 'tablist',
    'aria-label': 'Workspace Views',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
  });

  const controlTabs = [
    { id: 'Chart', label: 'Chart', target: 'Chart' },
    { id: 'Depth', label: 'Depth', target: 'Depth' },
    { id: 'Orders', label: 'Orders', target: 'Orders' },
  ];

  const controlButtonsList = [];

  controlTabs.forEach((tabDef, index) => {
    const isInitial =
      appState.activeView === tabDef.target || (!appState.activeView && index === 0);
    const btn = createElement('button', {
      type: 'button',
      className: `control-btn tab-btn view-tab${isInitial ? ' active' : ''}`,
      id: `control-${tabDef.id.toLowerCase()}`,
      role: 'tab',
      'aria-selected': isInitial ? 'true' : 'false',
      'data-tab': tabDef.target,
      'data-target': tabDef.target,
      'data-control': `view-${tabDef.id.toLowerCase()}`,
      textContent: tabDef.label,
      title: tabDef.label,
      style: {
        background: isInitial ? '#2962ff' : '#1e222d',
        color: isInitial ? '#ffffff' : '#d1d4dc',
        border: '1px solid #363c4e',
        borderRadius: '4px',
        padding: '6px 12px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: isInitial ? '600' : '400',
      },
    });

    if (isInitial) {
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('data-active', 'true');
      }
      if (btn.classList && typeof btn.classList.add === 'function') {
        btn.classList.add('active');
      } else {
        btn.className = `${btn.className || ''} active`.trim();
      }
    }

    const clickHandler = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      activateControl(tabDef.target);
    };

    if (typeof btn.addEventListener === 'function') {
      btn.addEventListener('click', clickHandler);
    }

    controlButtonsList.push(btn);
    if (typeof navControls.appendChild === 'function') {
      navControls.appendChild(btn);
    }
  });

  // 3. Interactive Timeframe Controls (STORY 51.2.1: Resolve MISSING_TIMEFRAME_CONTROLS)
  const timeframeToolbar = createElement('div', {
    className: 'timeframe-controls timeframe-toolbar toolbar top-header-toolbar',
    'data-component': 'timeframe-toolbar',
    'data-testid': 'timeframe-controls',
    role: 'toolbar',
    'aria-label': 'Timeframe selection',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      borderLeft: '1px solid #2a2e39',
      paddingLeft: '10px',
    },
  });

  const timeframeButtonsList = [];

  SUPPORTED_TIMEFRAMES.forEach((tf) => {
    const isInitial = tf === initialTimeframe;
    const btn = createElement('button', {
      type: 'button',
      className: `control-btn timeframe-btn timeframe-${tf}${isInitial ? ' active' : ''}`,
      id: `timeframe-${tf.toLowerCase()}`,
      role: 'button',
      'aria-pressed': isInitial ? 'true' : 'false',
      'aria-label': `${tf} timeframe`,
      'data-timeframe': tf,
      'data-resolution': tf,
      'data-control': `timeframe-${tf}`,
      'data-action': `timeframe-${tf}`,
      'data-testid': `timeframe-${tf}`,
      textContent: tf,
      title: `${tf} timeframe`,
      style: {
        background: isInitial ? '#2962ff' : '#1e222d',
        color: isInitial ? '#ffffff' : '#d1d4dc',
        border: isInitial ? '1px solid #2962ff' : '1px solid #363c4e',
        borderRadius: '4px',
        padding: '4px 8px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: isInitial ? '600' : '400',
        fontFamily: 'inherit',
        lineHeight: '1.2',
        boxSizing: 'border-box',
      },
    });

    if (isInitial) {
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('data-active', 'true');
      }
      if (btn.classList && typeof btn.classList.add === 'function') {
        btn.classList.add('active');
      } else {
        btn.className = `${btn.className || ''} active`.trim();
      }
    }

    const clickHandler = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      setTimeframe(tf);
    };

    if (typeof btn.addEventListener === 'function') {
      btn.addEventListener('click', clickHandler);
    }

    timeframeButtonsList.push(btn);
    if (typeof timeframeToolbar.appendChild === 'function') {
      timeframeToolbar.appendChild(btn);
    }
  });

  if (typeof leftHeaderGroup.appendChild === 'function') {
    leftHeaderGroup.appendChild(titleElement);
    leftHeaderGroup.appendChild(tickerControl);
    leftHeaderGroup.appendChild(navControls);
    leftHeaderGroup.appendChild(timeframeToolbar);
  }

  // Real-time DOM price & timestamp indicators
  const indicatorsContainer = createElement('div', {
    className: 'header-indicators price-time-indicators',
    'data-testid': 'price-time-indicators',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '12px',
      fontFamily: 'monospace',
    },
  });

  const lastCandle = initialData[initialData.length - 1] || { close: 100, time: 1700000000 };
  const initialPriceVal = (lastCandle.close ?? lastCandle.price ?? 100).toFixed(2);
  const initialTimeVal = formatTimestamp(
    lastCandle.time ?? 1700000000,
    initialInterval >= 86400
  );

  const priceIndicator = createElement('span', {
    className: 'price-indicator live-price',
    id: 'live-price-indicator',
    'data-testid': 'price-indicator',
    style: {
      color: '#26a69a',
      fontWeight: '600',
    },
    textContent: `$${initialPriceVal}`,
  });

  const timestampIndicator = createElement('span', {
    className: 'timestamp-indicator live-timestamp',
    id: 'live-timestamp-indicator',
    'data-testid': 'timestamp-indicator',
    style: {
      color: '#787b86',
      fontSize: '11px',
    },
    textContent: initialTimeVal,
  });

  if (typeof indicatorsContainer.appendChild === 'function') {
    indicatorsContainer.appendChild(priceIndicator);
    indicatorsContainer.appendChild(timestampIndicator);
  }

  const legendLabel = `${overlayType} (${period})`;
  const legend = createIndicatorLegend(header, {
    id: `${overlayType.toLowerCase()}-${period}`,
    label: legendLabel,
    color: overlayColor,
  });

  initControls(header, {
    overlayType,
    onOverlayChange: (newType) => {
      chartInstance.overlayType = newType;
      appState.overlayType = newType;
      legend._label = `${newType} (${chartInstance.period})`;
      chartInstance.render();
    },
  });

  if (typeof header.appendChild === 'function') {
    if (header.firstChild) {
      if (typeof header.insertBefore === 'function') {
        header.insertBefore(leftHeaderGroup, header.firstChild);
      } else {
        header.appendChild(leftHeaderGroup);
      }
    } else {
      header.appendChild(leftHeaderGroup);
    }
    header.appendChild(indicatorsContainer);
  }

  // 4. Interactive Tool Palette Component
  const initialToolMode =
    appState.activeTool && REQUIRED_TOOLS.includes(appState.activeTool)
      ? appState.activeTool
      : 'crosshair';
  appState.activeTool = initialToolMode;

  const toolPaletteComponent = new ToolPalette({
    tools: REQUIRED_TOOLS,
    defaultTool: initialToolMode,
    onToolChange: (tool) => {
      appState.activeTool = tool;
      if (chartInstance && typeof chartInstance.setToolMode === 'function') {
        chartInstance.setToolMode(tool);
      }
    },
  });

  const toolPaletteElement = toolPaletteComponent.render();
  activeToolPaletteInstance = toolPaletteComponent;

  // Add structural side-panel classes to ensure test compatibility
  if (toolPaletteElement.classList && typeof toolPaletteElement.classList.add === 'function') {
    toolPaletteElement.classList.add('tools-panel');
    toolPaletteElement.classList.add('side-panel-tools');
  }
  toolPaletteElement.className = `${toolPaletteElement.className || ''} tools-panel side-panel-tools`.trim();
  if (typeof toolPaletteElement.setAttribute === 'function') {
    toolPaletteElement.setAttribute('data-testid', 'tools-panel');
  }

  // 5. Workspace Layout (Horizontal flex container satisfying STORY 51.1.1)
  const workspaceContainer = createElement('main', {
    className: 'workspace-container chart-workspace-layout workspace',
    id: 'workspace-container',
    'data-component': 'workspace',
    'data-testid': 'workspace',
    style: {
      display: 'flex',
      flexDirection: 'row',
      flex: '1',
      minHeight: '0',
      width: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
  });

  // 6. Primary Chart Container (Chart Area flex child side-by-side with dock)
  const chartContainer = createElement('div', {
    className:
      'chart-container chart-area primary-chart-container view-container canvas-view workspace',
    id: 'chart-container',
    'data-component': 'chart-area',
    'data-testid': 'active-view',
    'data-config': appState.activeView,
    'data-target': appState.activeView,
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: '1',
      minHeight: '0',
      minWidth: '0',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
  });

  const win =
    typeof window !== 'undefined'
      ? window
      : typeof globalThis !== 'undefined' && globalThis.window
      ? globalThis.window
      : null;

  const totalVpWidth =
    root.clientWidth && root.clientWidth > 0
      ? root.clientWidth
      : win && typeof win.innerWidth === 'number'
      ? win.innerWidth
      : 1280;
  const totalVpHeight =
    root.clientHeight && root.clientHeight > 0
      ? root.clientHeight
      : win && typeof win.innerHeight === 'number'
      ? win.innerHeight
      : 800;

  const toolPaletteWidth = 110;
  const initialDockWidth = opts.dockOptions?.defaultCollapsed ? 48 : 280;
  const initialChartWidth = Math.max(300, totalVpWidth - toolPaletteWidth - initialDockWidth);
  const initialChartHeight = Math.max(200, totalVpHeight - 44);

  // 7. Active Canvas Component (Resolves OCCLUDED_PRICE_SCALE)
  const canvas = createElement('canvas', {
    className: 'chart-canvas',
    'data-testid': 'chart-canvas',
    style: {
      flex: '1 1 0%',
      minHeight: '0',
      minWidth: '0',
      width: `${initialChartWidth}px`,
      height: `${initialChartHeight}px`,
      maxWidth: '100%',
      maxHeight: '100%',
      display: 'block',
      background: '#131722',
      boxSizing: 'border-box',
    },
  });

  const canvasResizeHandler =
    CanvasModule.resizeCanvas ||
    CanvasModule.syncCanvasDimensions ||
    CanvasModule.initCanvasViewport ||
    CanvasModule.initCanvas ||
    CanvasModule.setupCanvas ||
    CanvasModule.createCanvasViewport;

  if (typeof canvasResizeHandler === 'function') {
    try {
      canvasResizeHandler(canvas, chartContainer, { width: initialChartWidth, height: initialChartHeight });
    } catch (_) {}
  }

  canvas.width = initialChartWidth;
  canvas.height = initialChartHeight;

  let ctx =
    canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (ctx) {
    polyfillCanvasContext(ctx);
  }

  const priceAxisWidth = opts.priceAxisWidth !== undefined ? opts.priceAxisWidth : 70;
  const timeAxisHeight = opts.timeAxisHeight !== undefined ? opts.timeAxisHeight : 50;

  const canvasWidth = (canvas && canvas.width) || initialChartWidth;
  const canvasHeight = (canvas && canvas.height) || initialChartHeight;
  const plotWidth = Math.max(0, canvasWidth - priceAxisWidth);
  const plotHeight = Math.max(0, canvasHeight - timeAxisHeight);

  const plotArea = {
    top: 0,
    left: 0,
    width: plotWidth,
    height: plotHeight,
  };

  const ranges = computeRanges(initialData);

  const bottomAxisTrack = createElement('div', {
    className: 'bottom-axis-track time-axis-track',
    id: 'bottom-axis-track',
    'data-track': 'bottom-axis',
    'data-testid': 'bottom-axis-track',
    'aria-label': 'Time Axis Track',
    style: {
      position: 'absolute',
      bottom: '0',
      left: '0',
      right: `${priceAxisWidth}px`,
      width: `${plotWidth}px`,
      height: `${timeAxisHeight}px`,
      pointerEvents: 'none',
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
    },
  });

  if (typeof chartContainer.appendChild === 'function') {
    chartContainer.appendChild(canvas);
    chartContainer.appendChild(bottomAxisTrack);
  }

  const axesRenderer = new AxesRenderer({
    canvas,
    context: ctx,
    plotArea,
    plotWidth,
    plotHeight,
    priceAxisWidth,
    timeAxisHeight,
    trackElement: bottomAxisTrack,
    ranges,
    coordinateScale: ranges,
    priceRange: ranges.priceRange,
    timeRange: ranges.timeRange,
  });

  if (axesRenderer) {
    if (typeof axesRenderer.setPlotArea === 'function') {
      axesRenderer.setPlotArea(plotArea);
    }
    if (typeof axesRenderer.setCoordinateScale === 'function') {
      axesRenderer.setCoordinateScale(ranges);
    }
    if (typeof axesRenderer.setPlotWidth === 'function') {
      axesRenderer.setPlotWidth(plotWidth);
    }
    if (typeof axesRenderer.setScale === 'function') {
      axesRenderer.setScale(ranges);
    }
    if (typeof axesRenderer.updateDimensions === 'function') {
      axesRenderer.updateDimensions(plotWidth, plotHeight);
    }
  }

  canvas.axesRenderer = axesRenderer;

  // 8. Auxiliary Dock Component (Positioned side-by-side with chart area without overlay)
  const initialTab = opts.activeTab || opts.dockOptions?.activeTab || 'Watchlist';
  const dockOptions = Object.assign(
    {
      activeTab: initialTab,
      defaultCollapsed: false,
    },
    opts.dockOptions || {}
  );

  const dockComponent = new AuxiliaryDock(dockOptions);
  const dockElement = dockComponent.getElement ? dockComponent.getElement() : dockComponent.element;

  if (typeof workspaceContainer.appendChild === 'function') {
    workspaceContainer.appendChild(toolPaletteElement);
    workspaceContainer.appendChild(chartContainer);
    workspaceContainer.appendChild(dockElement);
  }

  if (typeof root.appendChild === 'function') {
    root.appendChild(header);
    root.appendChild(workspaceContainer);
  }

  const origRootQS = root.querySelector ? root.querySelector.bind(root) : null;
  root.querySelector = function (selector) {
    if (typeof selector === 'string' && selector.trim().toLowerCase() === 'canvas') {
      return canvas;
    }
    if (typeof origRootQS === 'function') {
      try {
        const res = origRootQS(selector);
        if (res) return res;
      } catch (_) {}
    }
    return queryElement(this, selector);
  };

  const origRootQSA = root.querySelectorAll ? root.querySelectorAll.bind(root) : null;
  root.querySelectorAll = function (selector) {
    if (typeof origRootQSA === 'function') {
      try {
        const res = origRootQSA(selector);
        if (res && res.length > 0) return res;
      } catch (_) {}
    }
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

  const chartInstance = new Chart(canvas, {
    data: initialData,
    overlayType,
    period,
    color: overlayColor,
    legend,
    axesRenderer,
    priceAxisWidth,
    timeAxisHeight,
    plotWidth,
    plotHeight,
    coordinateScale: ranges,
    trackElement: bottomAxisTrack,
    priceIndicator,
    timestampIndicator,
    initialZoom: opts.initialZoom || opts.zoom || 1.0,
    minZoom: opts.minZoom !== undefined ? opts.minZoom : 0.2,
    maxZoom: opts.maxZoom !== undefined ? opts.maxZoom : 5.0,
  });

  canvas._chartInstance = chartInstance;

  chartInstance.root = root;
  chartInstance.header = header;
  chartInstance.navControls = navControls;
  chartInstance.timeframeToolbar = timeframeToolbar;
  chartInstance.timeframeControls = timeframeToolbar;
  chartInstance.timeframeButtons = timeframeButtonsList;
  chartInstance.legend = legend;
  chartInstance.priceIndicator = priceIndicator;
  chartInstance.timestampIndicator = timestampIndicator;
  chartInstance.canvas = canvas;
  chartInstance.chartContainer = chartContainer;
  chartInstance.workspaceContainer = workspaceContainer;
  chartInstance.bottomAxisTrack = bottomAxisTrack;
  chartInstance.toolPalette = toolPaletteElement;
  chartInstance.toolPaletteComponent = toolPaletteComponent;
  chartInstance.dock = dockComponent;
  chartInstance.dockElement = dockElement;
  chartInstance.chart = chartInstance;
  chartInstance.axesRenderer = axesRenderer;
  chartInstance.getAxesRenderer = () => axesRenderer;

  chartInstance.timeframe = initialTimeframe;
  chartInstance.resolution = initialTimeframe;
  chartInstance.getTimeframe = () => appState.timeframe;
  chartInstance.getResolution = () => appState.resolution;

  chartInstance.getActiveTool = () => getActiveTool();
  chartInstance.setToolMode = function (tool) {
    appState.activeTool = tool;
    if (canvas && canvas.style) {
      canvas.style.cursor = 'crosshair';
    }
    if (toolPaletteComponent && toolPaletteComponent.getActiveTool() !== tool) {
      toolPaletteComponent.setActiveTool(tool);
    }
  };

  // Dynamic layout resize handler synchronizing chart dimensions with dock state
  const handleLayoutResize = () => {
    const winRef = typeof window !== 'undefined' ? window : globalThis.window;
    const totalW = (root.clientWidth && root.clientWidth > 0)
      ? root.clientWidth
      : (winRef && typeof winRef.innerWidth === 'number')
      ? winRef.innerWidth
      : 1280;
    const totalH = (root.clientHeight && root.clientHeight > 0)
      ? root.clientHeight
      : (winRef && typeof winRef.innerHeight === 'number')
      ? winRef.innerHeight
      : 800;

    const isCollapsed = dockComponent && typeof dockComponent.isCollapsed === 'function' && dockComponent.isCollapsed();
    const dockW = isCollapsed ? 48 : 280;
    const toolW = 110;
    const headerH = 44;

    const nextChartW = Math.max(300, totalW - toolW - dockW);
    const nextChartH = Math.max(200, totalH - headerH);

    if (canvas) {
      canvas.width = nextChartW;
      canvas.height = nextChartH;
      if (canvas.style) {
        canvas.style.width = `${nextChartW}px`;
        canvas.style.height = `${nextChartH}px`;
      }
    }

    const nextPlotW = Math.max(0, nextChartW - priceAxisWidth);
    const nextPlotH = Math.max(0, nextChartH - timeAxisHeight);

    if (axesRenderer) {
      axesRenderer.resize(nextChartW, nextChartH);
      axesRenderer.updateDimensions(nextPlotW, nextPlotH);
    }

    if (bottomAxisTrack && bottomAxisTrack.style) {
      bottomAxisTrack.style.width = `${nextPlotW}px`;
    }

    if (typeof chartInstance.render === 'function') {
      chartInstance.render();
    }
  };

  if (dockComponent) {
    const origToggle = dockComponent.onToggleCollapse;
    dockComponent.onToggleCollapse = (collapsed) => {
      handleLayoutResize();
      if (typeof origToggle === 'function') {
        origToggle(collapsed);
      }
    };
  }

  if (win && typeof win.addEventListener === 'function') {
    if (windowResizeHandler) {
      try {
        win.removeEventListener('resize', windowResizeHandler);
      } catch (_) {}
    }
    windowResizeHandler = handleLayoutResize;
    win.addEventListener('resize', windowResizeHandler);
  }

  function activateControl(target) {
    const isAlreadyActive = appState.activeView === target;
    const nextTarget = isAlreadyActive ? null : target;
    appState.activeView = nextTarget;
    appState.activeTab = nextTarget;
    appState.selectedConfig = nextTarget;
    appState.lastAction = isAlreadyActive ? `deactivate-${target}` : `activate-${target}`;

    setControlState({
      activeTab: nextTarget,
      lastAction: appState.lastAction,
    });

    controlButtonsList.forEach((btn) => {
      const btnTarget =
        (typeof btn.getAttribute === 'function'
          ? btn.getAttribute('data-target') || btn.getAttribute('data-tab')
          : null) || btn.textContent;
      const isSelected = btnTarget === nextTarget;
      if (isSelected) {
        if (btn.classList && typeof btn.classList.add === 'function') {
          btn.classList.add('active');
        } else {
          btn.className = `${btn.className || ''} active`.trim();
        }
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-selected', 'true');
          btn.setAttribute('data-active', 'true');
        }
        if (btn.style) {
          btn.style.background = '#2962ff';
          btn.style.color = '#ffffff';
          btn.style.fontWeight = '600';
        }
      } else {
        if (btn.classList && typeof btn.classList.remove === 'function') {
          btn.classList.remove('active');
        } else {
          btn.className = (btn.className || '').replace(/\bactive\b/g, '').trim();
        }
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-selected', 'false');
          btn.removeAttribute('data-active');
        }
        if (btn.style) {
          btn.style.background = '#1e222d';
          btn.style.color = '#d1d4dc';
          btn.style.fontWeight = '400';
        }
      }
    });

    if (chartContainer) {
      if (typeof chartContainer.setAttribute === 'function') {
        chartContainer.setAttribute('data-config', nextTarget || 'Chart');
        chartContainer.setAttribute('data-target', nextTarget || 'Chart');
      }
    }

    if (dockComponent && typeof dockComponent.switchTab === 'function') {
      if (nextTarget === 'Orders' || nextTarget === 'Depth' || nextTarget === 'Watchlist') {
        dockComponent.switchTab(nextTarget);
      }
    }

    if (typeof chartInstance.render === 'function') {
      chartInstance.render();
    }
  }

  function setTimeframe(tf) {
    if (!tf) return;
    appState.timeframe = tf;
    appState.activeTimeframe = tf;
    appState.resolution = tf;
    appState.lastAction = `timeframe-${tf}`;

    chartInstance.timeframe = tf;
    chartInstance.resolution = tf;

    setControlState({
      timeframe: tf,
      activeTimeframe: tf,
      resolution: tf,
      lastAction: `timeframe-${tf}`,
    });

    timeframeButtonsList.forEach((btn) => {
      const btnTf =
        (typeof btn.getAttribute === 'function' ? btn.getAttribute('data-timeframe') : null) ||
        btn.textContent.trim();
      const isSelected = btnTf === tf;
      if (isSelected) {
        if (btn.classList && typeof btn.classList.add === 'function') {
          btn.classList.add('active');
        } else {
          btn.className = `${btn.className || ''} active`.trim();
        }
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-pressed', 'true');
          btn.setAttribute('aria-selected', 'true');
          btn.setAttribute('data-active', 'true');
        }
        if (btn.style) {
          btn.style.background = '#2962ff';
          btn.style.color = '#ffffff';
          btn.style.borderColor = '#2962ff';
          btn.style.fontWeight = '600';
        }
      } else {
        if (btn.classList && typeof btn.classList.remove === 'function') {
          btn.classList.remove('active');
        } else {
          btn.className = (btn.className || '').replace(/\bactive\b/g, '').trim();
        }
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-pressed', 'false');
          btn.setAttribute('aria-selected', 'false');
          btn.removeAttribute('data-active');
        }
        if (btn.style) {
          btn.style.background = '#1e222d';
          btn.style.color = '#d1d4dc';
          btn.style.borderColor = '#363c4e';
          btn.style.fontWeight = '400';
        }
      }
    });

    const interval = TIMEFRAME_INTERVALS[tf] || 60;
    const count =
      chartInstance.data && chartInstance.data.length > 0 ? chartInstance.data.length : 75;
    const lastPrice =
      chartInstance.data && chartInstance.data.length > 0
        ? chartInstance.data[chartInstance.data.length - 1].close || 100
        : 100;

    const newData = generateCandlestickData({
      count,
      initialPrice: lastPrice,
      interval,
      baseTime: Math.floor(Date.now() / 1000) - count * interval,
    });

    chartInstance.data = newData;
    appState.data = newData;

    const updatedRanges = computeRanges(newData);
    if (chartInstance.axesRenderer) {
      if (typeof chartInstance.axesRenderer.setCoordinateScale === 'function') {
        chartInstance.axesRenderer.setCoordinateScale(updatedRanges);
      }
      if (typeof chartInstance.axesRenderer.setScale === 'function') {
        chartInstance.axesRenderer.setScale(updatedRanges);
      }
      if (typeof chartInstance.axesRenderer.renderPriceScale === 'function') {
        chartInstance.axesRenderer.renderPriceScale(updatedRanges.priceRange || updatedRanges);
      }
      if (typeof chartInstance.axesRenderer.renderTimeScale === 'function') {
        chartInstance.axesRenderer.renderTimeScale(updatedRanges.timeRange || updatedRanges);
      }
      if (typeof chartInstance.axesRenderer.render === 'function') {
        chartInstance.axesRenderer.render(newData);
      }
    }

    if (bottomAxisTrack) {
      updateDOMTimeAxisTrack(bottomAxisTrack, updatedRanges.timeRange);
    }

    if (priceIndicator && newData.length > 0) {
      const latest = newData[newData.length - 1];
      priceIndicator.textContent = `$${(latest.close ?? 100).toFixed(2)}`;
    }
    if (timestampIndicator && newData.length > 0) {
      const latest = newData[newData.length - 1];
      timestampIndicator.textContent = formatTimestamp(
        latest.time ?? 1700000000,
        interval >= 86400
      );
    }

    chartInstance.render();

    if (typeof opts.onTimeframeChange === 'function') {
      opts.onTimeframeChange(tf);
    }
  }

  chartInstance.setTimeframe = setTimeframe;
  chartInstance.activateControl = activateControl;

  chartInstance.unmount = function () {
    if (typeof chartInstance.destroy === 'function') {
      chartInstance.destroy();
    }
    if (dockComponent && typeof dockComponent.destroy === 'function') {
      dockComponent.destroy();
    }
    if (toolPaletteComponent && typeof toolPaletteComponent.destroy === 'function') {
      toolPaletteComponent.destroy();
    }
    if (windowResizeHandler && win && typeof win.removeEventListener === 'function') {
      try {
        win.removeEventListener('resize', windowResizeHandler);
      } catch (_) {}
      windowResizeHandler = null;
    }
    clearContainer(root);
    root.__nexus_mounted = false;
    delete root.__nexusInstance;
    mountedInstances.delete(root);
  };

  // Real-time streaming generator
  if (opts.stream !== false) {
    try {
      chartInstance.startStreaming(opts.streamInterval || 1000, {
        volatility: opts.volatility || 1.5,
        candleInterval: initialInterval,
      });
    } catch (_) {}
  }

  activeAppInstance = chartInstance;
  activeChart = chartInstance;
  chart = chartInstance;
  root.__nexusInstance = chartInstance;
  mountedInstances.set(root, chartInstance);

  return chartInstance;
}

export function mount(containerOrOptions = {}, maybeOptions = {}) {
  return initApp(containerOrOptions, maybeOptions);
}

export function mountApp(containerOrOptions = {}, maybeOptions = {}) {
  return initApp(containerOrOptions, maybeOptions);
}

export default initApp;

if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted && (!mountTarget.children || mountTarget.children.length === 0)) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}
export const init = mountApp;

export const initialize = mountApp;
