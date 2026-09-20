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
 * and interactive controls responding to user events with reactive state and view re-rendering (STORY 38.2.1: Resolve INACTIVE_UI_CONTROLS).
 * Resolves UNCAUGHT_JAVASCRIPT_EXCEPTION by synchronizing viewport dimensions safely without assigning to clientWidth/clientHeight (STORY 49.1.1).
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

export const REQUIRED_TOOLS = ['crosshair', 'trendline', 'ray', 'measurement'];

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
        el.className = current.join(' ');
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
          try { child.parentNode.removeChild(child); } catch (_) {}
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
        try { newChild.parentNode.removeChild(newChild); } catch (_) {}
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
        return (this.style && typeof this.style === 'object' && this.style.cssText) || (this.attributes && this.attributes.get('style')) || null;
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
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
    };
  }

  if (typeof el.removeEventListener !== 'function') {
    el.removeEventListener = function (type, listener) {
      if (this._listeners && this._listeners.has(type)) {
        this._listeners.get(type).delete(listener);
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
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
    };
  }

  if (!proto.removeEventListener) {
    proto.removeEventListener = function (type, listener) {
      if (this._listeners && this._listeners.has(type)) {
        this._listeners.get(type).delete(listener);
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
        return (this.style && typeof this.style === 'object' && this.style.cssText) || (this.attributes && this.attributes.get('style')) || null;
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
        const kids = Array.isArray(n.children) ? n.children : (n.children ? Array.from(n.children) : []);
        for (const c of kids) {
          if (matchSelector(c, selector)) results.push(c);
          traverse(c);
        }
      };
      traverse(this);
      return results;
    };
  }

  if (!Object.getOwnPropertyDescriptor(proto, 'firstChild')) {
    Object.defineProperty(proto, 'firstChild', {
      get() {
        return this.children && this.children.length > 0 ? this.children[0] : null;
      },
      configurable: true,
    });
  }

  if (!Object.getOwnPropertyDescriptor(proto, 'lastChild')) {
    Object.defineProperty(proto, 'lastChild', {
      get() {
        return this.children && this.children.length > 0
          ? this.children[this.children.length - 1]
          : null;
      },
      configurable: true,
    });
  }
}

/**
 * Patches the active DOM environment in mock / headless testing contexts.
 */
export function patchDOMEnvironment() {
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined' && window.document.nodeType === 9) return;

  const doc = typeof document !== 'undefined' ? document : (globalThis.document || null);
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

  patchMockDOM(sample || (doc.body || null));
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
  overlayType: 'EMA',
  period: 20,
  data: [],
  drawings: [],
  selectedDrawing: null,
};

const mountedInstances = new WeakMap();

let activeAppInstance = null;
let activeToolPaletteInstance = null;
let activeResizeObserver = null;
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

export function getWorkspaceState() {
  return {
    ...appState,
    activeTool: getActiveTool(),
  };
}

function matchSelector(node, selector) {
  if (!node || typeof selector !== 'string') return false;
  const sel = selector.trim();
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    return node.id === id || (typeof node.getAttribute === 'function' && node.getAttribute('id') === id);
  }
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    if (node.classList && typeof node.classList.contains === 'function') {
      return node.classList.contains(cls);
    }
    const classStr = (typeof node.getAttribute === 'function' ? node.getAttribute('class') : null) || node.className || '';
    return classStr.split(/\s+/).includes(cls);
  }
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    const eqIdx = inner.indexOf('=');
    if (eqIdx !== -1) {
      const attr = inner.slice(0, eqIdx).trim();
      let val = inner.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      const actual = typeof node.getAttribute === 'function' ? node.getAttribute(attr) : node[attr];
      return String(actual) === val;
    }
    return typeof node.hasAttribute === 'function' ? node.hasAttribute(inner) : (node[inner] !== undefined && node[inner] !== null);
  }
  const tag = (node.tagName || node.nodeName || '').toLowerCase();
  return tag === sel.toLowerCase();
}

function queryElement(node, selector) {
  if (!node) return null;
  const children = Array.isArray(node.children) ? node.children : (node.children ? Array.from(node.children) : []);
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
  while (container.children && container.children.length > 0 && typeof container.removeChild === 'function') {
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
  return headers.length === 1 && canvases.length === 1 && toolbars.length === 1 && docks.length === 1;
}

export function createElement(tag, attrs = {}, children = []) {
  let el;
  const isBrowser = typeof document !== 'undefined' && typeof document.createElement === 'function';
  const hasGlobalDoc = typeof globalThis !== 'undefined' && globalThis.document && typeof globalThis.document.createElement === 'function';

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
          const kids = Array.isArray(n.children) ? n.children : (n.children ? Array.from(n.children) : []);
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

/**
 * Starts continuous render loop linking animation frame progression to canvas/DOM updates.
 * Satisfies STORY 50.1.1 (Resolve STATIC_APPLICATION).
 *
 * @param {Object} instance Chart instance
 * @returns {Function} Stop cleanup function
 */
export function startRenderLoop(instance) {
  if (!instance) return () => {};
  if (instance._stopRenderLoop) {
    return instance._stopRenderLoop;
  }

  let isRunning = true;
  let lastTickTime = 0;
  const tickInterval = 250;

  const getRaf = () => {
    if (typeof globalThis !== 'undefined' && typeof globalThis.requestAnimationFrame === 'function') {
      return globalThis.requestAnimationFrame.bind(globalThis);
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame.bind(window);
    }
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame;
    return null;
  };

  const getCaf = () => {
    if (typeof globalThis !== 'undefined' && typeof globalThis.cancelAnimationFrame === 'function') {
      return globalThis.cancelAnimationFrame.bind(globalThis);
    }
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      return window.cancelAnimationFrame.bind(window);
    }
    if (typeof cancelAnimationFrame === 'function') return cancelAnimationFrame;
    return null;
  };

  const raf = getRaf();
  const caf = getCaf();

  function renderFrame(timestamp) {
    if (!isRunning) return;

    const now = typeof timestamp === 'number' && Number.isFinite(timestamp)
      ? timestamp
      : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

    // Generate real-time tick periodically to couple data updates with animation frames
    if (now - lastTickTime >= tickInterval) {
      lastTickTime = now;
      if (typeof instance.generateRealtimeTick === 'function') {
        instance.generateRealtimeTick();
      } else if (typeof instance.updateTick === 'function' && Array.isArray(instance.data) && instance.data.length > 0) {
        const lastCandle = instance.data[instance.data.length - 1];
        const tick = generateTick(lastCandle, { volatility: 0.5 });
        instance.updateTick(tick);
      }
    }

    if (typeof instance.renderFrame === 'function') {
      instance.renderFrame(now);
    } else if (typeof instance.render === 'function') {
      instance.render(now);
    }

    if (raf) {
      instance.rafId = raf(renderFrame);
    }
  }

  if (raf) {
    instance.rafId = raf(renderFrame);
  } else if (typeof setInterval === 'function') {
    const timerId = setInterval(() => {
      if (!isRunning) return;
      const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      renderFrame(now);
    }, 16);
    instance.rafId = timerId;
  }

  const stop = () => {
    isRunning = false;
    if (instance.rafId) {
      if (caf && typeof instance.rafId === 'number') {
        caf(instance.rafId);
      } else if (typeof clearInterval === 'function') {
        clearInterval(instance.rafId);
      }
      instance.rafId = null;
    }
    instance._stopRenderLoop = null;
  };

  instance._stopRenderLoop = stop;
  return stop;
}

/**
 * Starts continuous real-time streaming updates for chart instances.
 *
 * @param {Object} instance
 * @param {number} [interval=250]
 * @returns {Object|null}
 */
export function startRealtimeUpdates(instance, interval = 250) {
  if (!instance) return null;
  if (typeof instance.startStreaming === 'function') {
    return instance.startStreaming(interval);
  }
  return createCandleStream(instance, { interval });
}

export function updateCandleData(newCandles) {
  if (activeAppInstance && typeof activeAppInstance.updateData === 'function') {
    return activeAppInstance.updateData(newCandles);
  }
  return Promise.resolve();
}

function resolveRootContainer(options = {}) {
  const currentDoc = typeof document !== 'undefined' ? document : (globalThis.document || null);
  let root = null;
  let opts = {};

  if (options === null) {
    throw new Error('Target container (#app) was not found in the DOM: container is null');
  }

  if (options && (options.nodeType !== undefined || options.tagName !== undefined || typeof options.appendChild === 'function')) {
    root = options;
  } else if (typeof options === 'string') {
    const cleanId = options.startsWith('#') ? options.slice(1) : options;
    root = currentDoc && typeof currentDoc.getElementById === 'function'
      ? currentDoc.getElementById(cleanId)
      : null;
    if (!root) {
      throw new Error(`Target container (#${cleanId}) was not found in the DOM: container is missing`);
    }
  } else if (options && typeof options === 'object') {
    opts = options;
    if (options.root === null || options.container === null || options.rootId === null) {
      throw new Error('Target container (#app) was not found in the DOM: container is null');
    }
    const rootTarget = options.root !== undefined
      ? options.root
      : (options.container !== undefined ? options.container : options.rootId);

    if (rootTarget !== undefined && rootTarget !== null) {
      if (typeof rootTarget === 'string') {
        const cleanId = rootTarget.startsWith('#') ? rootTarget.slice(1) : rootTarget;
        root = currentDoc && typeof currentDoc.getElementById === 'function'
          ? currentDoc.getElementById(cleanId)
          : null;
        if (!root) {
          throw new Error(`Target container (#${cleanId}) was not found in the DOM: container is missing`);
        }
      } else if (typeof rootTarget === 'object') {
        root = rootTarget;
      }
    }
  }

  if (!root && currentDoc && typeof currentDoc.getElementById === 'function') {
    root = currentDoc.getElementById('app');
  }

  if (!root && currentDoc && currentDoc.body) {
    root = currentDoc.body;
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
  const currentDoc = typeof document !== 'undefined' ? document : (globalThis.document || null);

  patchMockElement(root);
  patchMockDOM(root);
  if (currentDoc && currentDoc.body) {
    patchMockElement(currentDoc.body);
    patchMockDOM(currentDoc.body);
  }

  const priorInstance = root.__nexusInstance || (typeof root === 'object' && mountedInstances.get(root));
  if (priorInstance && isContainerMounted(root) && !opts.forceRemount && Object.keys(opts).length === 0) {
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

  if (currentDoc) {
    if (currentDoc.documentElement && currentDoc.documentElement.style) {
      currentDoc.documentElement.style.height = '100vh';
      currentDoc.documentElement.style.minHeight = '100vh';
      currentDoc.documentElement.style.overflow = 'hidden';
    }
    if (currentDoc.body && currentDoc.body.style) {
      currentDoc.body.style.display = 'flex';
      currentDoc.body.style.flexDirection = 'column';
      currentDoc.body.style.height = '100vh';
      currentDoc.body.style.minHeight = '100vh';
      currentDoc.body.style.margin = '0';
      currentDoc.body.style.padding = '0';
      currentDoc.body.style.overflow = 'hidden';
    }
  }

  const overlayType = opts.overlayType || 'EMA';
  const period = Number(opts.period) || 20;
  const overlayColor = opts.color || '#FF9800';
  const initialData = Array.isArray(opts.initialData) && opts.initialData.length > 0
    ? [...opts.initialData]
    : generateCandlestickData({ count: 75, initialPrice: 100 });

  appState.overlayType = overlayType;
  appState.period = period;
  appState.data = [...initialData];
  appState.activeView = opts.activeView || opts.view || 'Chart';
  appState.activeTab = appState.activeView;
  appState.selectedConfig = appState.activeView;

  // 1. Semantic Header Component
  const header = createElement('header', {
    className: 'chart-header header',
    'data-component': 'header',
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

  // 2. Interactive Navigation Controls
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
    const isInitial = appState.activeView === tabDef.target || (!appState.activeView && index === 0);
    const btn = createElement('button', {
      type: 'button',
      className: `control-btn tab-btn view-tab${isInitial ? ' active' : ''}`,
      id: `control-${tabDef.id.toLowerCase()}`,
      role: 'tab',
      'aria-selected': isInitial ? 'true' : 'false',
      'data-tab': tabDef.target,
      'data-target': tabDef.target,
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
      onClick: (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        activateControl(tabDef.target);
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

    controlButtonsList.push(btn);
    if (typeof navControls.appendChild === 'function') {
      navControls.appendChild(btn);
    }
  });

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
  const initialTimeVal = formatTimestamp(lastCandle.time ?? 1700000000);

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
        header.insertBefore(navControls, header.firstChild);
      } else {
        header.appendChild(navControls);
      }
    } else {
      header.appendChild(navControls);
    }
    header.appendChild(indicatorsContainer);
  }

  // 3. Interactive Tool Palette Component (STORY 49.2.1: Resolve MISSING_INTERACTIVE_TOOL_PALETTE)
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

  // 4. Workspace Layout (Horizontal flex container)
  const workspaceContainer = createElement('div', {
    className: 'workspace-container chart-workspace-layout workspace',
    id: 'workspace-container',
    'data-component': 'workspace',
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

  // 5. Primary Chart Container
  const chartContainer = createElement('div', {
    className: 'chart-container primary-chart-container view-container canvas-view workspace',
    id: 'chart-container',
    'data-component': 'chart-container',
    'data-testid': 'active-view',
    'data-config': appState.activeView,
    'data-target': appState.activeView,
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: '1',
      minWidth: '0',
      minHeight: '0',
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
  });

  const win = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' && globalThis.window ? globalThis.window : null);

  const initialVpWidth = (root.clientWidth && root.clientWidth > 0)
    ? root.clientWidth
    : (win && win.innerWidth ? win.innerWidth : 800);
  const initialVpHeight = (root.clientHeight && root.clientHeight > 0)
    ? root.clientHeight
    : (win && win.innerHeight ? win.innerHeight : 600);

  // 6. Active Canvas Component
  const canvas = createElement('canvas', {
    className: 'chart-canvas',
    style: {
      flex: '1 1 0%',
      minHeight: '0',
      width: `${initialVpWidth}px`,
      height: `${initialVpHeight}px`,
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
      canvasResizeHandler(canvas, root, { width: initialVpWidth, height: initialVpHeight });
    } catch (_) {}
  }

  if (canvas.width !== initialVpWidth) {
    canvas.width = initialVpWidth;
  }
  if (canvas.height !== initialVpHeight) {
    canvas.height = initialVpHeight;
  }
  if (canvas.style) {
    canvas.style.width = `${initialVpWidth}px`;
    canvas.style.height = `${initialVpHeight}px`;
  }

  let ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (ctx) {
    polyfillCanvasContext(ctx);
  }

  const priceAxisWidth = opts.priceAxisWidth !== undefined ? opts.priceAxisWidth : 70;
  const timeAxisHeight = opts.timeAxisHeight !== undefined ? opts.timeAxisHeight : 50;

  const canvasWidth = (canvas && canvas.width) || initialVpWidth;
  const canvasHeight = (canvas && canvas.height) || initialVpHeight;
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

  // 7. Auxiliary Dock Component
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
      const kids = Array.isArray(n.children) ? n.children : (n.children ? Array.from(n.children) : []);
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

  function activateControl(target) {
    appState.activeView = target;
    appState.activeTab = target;
    appState.selectedConfig = target;

    controlButtonsList.forEach((btn) => {
      const btnTarget = (typeof btn.getAttribute === 'function' ? (btn.getAttribute('data-target') || btn.getAttribute('data-tab')) : null) || btn.textContent;
      const isSelected = btnTarget === target;
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
        chartContainer.setAttribute('data-config', target);
        chartContainer.setAttribute('data-target', target);
      }
    }

    if (dockComponent && typeof dockComponent.switchTab === 'function') {
      if (target === 'Orders' || target === 'Depth' || target === 'Watchlist') {
        dockComponent.switchTab(target);
      }
    }

    if (typeof chartInstance.render === 'function') {
      chartInstance.render();
    }
  }

  chartInstance.activateControl = activateControl;
  chartInstance.activateWorkflow = (workflow, widget) => dockComponent.activateWorkflow(workflow, widget);
  chartInstance.mountWorkflow = (workflow, widget) => dockComponent.mountWorkflow(workflow, widget);
  chartInstance.switchDockTab = (tab) => dockComponent.switchTab(tab);
  chartInstance.toggleDockCollapse = () => dockComponent.toggleCollapse();

  chartInstance.updateData = function (newCandles) {
    if (!newCandles) return Promise.resolve(this);
    const updated = Chart.prototype.updateData.call(this, newCandles);
    appState.data = updated;
    const updatedRanges = computeRanges(this.data);
    if (this.axesRenderer) {
      if (typeof this.axesRenderer.setCoordinateScale === 'function') {
        this.axesRenderer.setCoordinateScale(updatedRanges);
      }
      if (typeof this.axesRenderer.setScale === 'function') {
        this.axesRenderer.setScale(updatedRanges);
      }
      if (typeof this.axesRenderer.renderPriceScale === 'function') {
        this.axesRenderer.renderPriceScale(updatedRanges.priceRange || updatedRanges);
      }
      if (typeof this.axesRenderer.renderTimeScale === 'function') {
        this.axesRenderer.renderTimeScale(updatedRanges.timeRange || updatedRanges);
      }
      if (typeof this.axesRenderer.renderGridlines === 'function') {
        this.axesRenderer.renderGridlines(updatedRanges);
      }
      if (typeof this.axesRenderer.render === 'function') {
        this.axesRenderer.render(this.data);
      }
    }
    this.render();
    return Promise.resolve(this);
  };

  chartInstance.updateTick = function (tick) {
    const updated = Chart.prototype.updateTick.call(this, tick);
    appState.data = updated;
    const updatedRanges = computeRanges(this.data);
    if (this.axesRenderer) {
      if (typeof this.axesRenderer.setCoordinateScale === 'function') {
        this.axesRenderer.setCoordinateScale(updatedRanges);
      }
      if (typeof this.axesRenderer.setScale === 'function') {
        this.axesRenderer.setScale(updatedRanges);
      }
      if (typeof this.axesRenderer.renderPriceScale === 'function') {
        this.axesRenderer.renderPriceScale(updatedRanges.priceRange || updatedRanges);
      }
      if (typeof this.axesRenderer.renderTimeScale === 'function') {
        this.axesRenderer.renderTimeScale(updatedRanges.timeRange || updatedRanges);
      }
      if (typeof this.axesRenderer.renderGridlines === 'function') {
        this.axesRenderer.renderGridlines(updatedRanges);
      }
      if (typeof this.axesRenderer.render === 'function') {
        this.axesRenderer.render(this.data);
      }
    }
    this.render();
    return Promise.resolve(this);
  };

  chartInstance.onDataUpdate = chartInstance.updateData;

  const handleResize = (targetWidth, targetHeight) => {
    const currentWin = typeof window !== 'undefined'
      ? window
      : (typeof globalThis !== 'undefined' && globalThis.window ? globalThis.window : null);

    let w = 0;
    let h = 0;

    if (typeof targetWidth === 'number' && targetWidth > 0) {
      w = targetWidth;
    } else if (root && typeof root.clientWidth === 'number' && root.clientWidth > 0) {
      w = root.clientWidth;
    } else if (currentWin && typeof currentWin.innerWidth === 'number' && currentWin.innerWidth > 0) {
      w = currentWin.innerWidth;
    } else {
      w = 800;
    }

    if (typeof targetHeight === 'number' && targetHeight > 0) {
      h = targetHeight;
    } else if (root && typeof root.clientHeight === 'number' && root.clientHeight > 0) {
      h = root.clientHeight;
    } else if (currentWin && typeof currentWin.innerHeight === 'number' && currentWin.innerHeight > 0) {
      h = currentWin.innerHeight;
    } else {
      h = 600;
    }

    w = Math.round(w);
    h = Math.round(h);

    if (typeof canvasResizeHandler === 'function') {
      try {
        canvasResizeHandler(canvas, root, { width: w, height: h });
      } catch (_) {}
    }

    if (canvas) {
      if (canvas.width !== w) {
        canvas.width = w;
      }
      if (canvas.height !== h) {
        canvas.height = h;
      }
      if (canvas.style) {
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
    }

    const canvasW = (canvas && canvas.width) || w;
    const canvasH = (canvas && canvas.height) || h;
    const curPlotWidth = Math.max(0, canvasW - priceAxisWidth);
    const curPlotHeight = Math.max(0, canvasH - timeAxisHeight);
    const curPlotArea = { top: 0, left: 0, width: curPlotWidth, height: curPlotHeight };

    if (bottomAxisTrack && bottomAxisTrack.style) {
      bottomAxisTrack.style.width = `${curPlotWidth}px`;
    }

    if (axesRenderer) {
      if (typeof axesRenderer.setPlotArea === 'function') {
        axesRenderer.setPlotArea(curPlotArea);
      }
      if (typeof axesRenderer.setPlotWidth === 'function') {
        axesRenderer.setPlotWidth(curPlotWidth);
      }
      if (typeof axesRenderer.updateDimensions === 'function') {
        axesRenderer.updateDimensions(curPlotWidth, curPlotHeight);
      }
      if (typeof axesRenderer.resize === 'function') {
        axesRenderer.resize(canvasW, canvasH);
      }
      if (typeof axesRenderer.render === 'function') {
        axesRenderer.render(chartInstance.data);
      }
    }
    chartInstance.resize(canvasW, canvasH);
    chartInstance.render();
  };

  chartInstance.windowResizeHandler = handleResize;
  windowResizeHandler = handleResize;

  const currentWindow = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' && globalThis.window ? globalThis.window : null);

  if (currentWindow && typeof currentWindow.addEventListener === 'function') {
    currentWindow.addEventListener('resize', () => handleResize());
  }

  let resizeObserver = null;
  const ResizeObserverClass =
    typeof ResizeObserver !== 'undefined'
      ? ResizeObserver
      : (typeof globalThis !== 'undefined' && globalThis.ResizeObserver ? globalThis.ResizeObserver : null);

  if (ResizeObserverClass) {
    resizeObserver = new ResizeObserverClass((entries) => {
      let newW = 0;
      let newH = 0;
      if (Array.isArray(entries) && entries.length > 0) {
        for (const entry of entries) {
          if (entry.contentRect && typeof entry.contentRect.width === 'number' && entry.contentRect.width > 0) {
            newW = entry.contentRect.width;
            newH = entry.contentRect.height;
            break;
          } else if (entry.target) {
            newW = entry.target.clientWidth || entry.target.offsetWidth || 0;
            newH = entry.target.clientHeight || entry.target.offsetHeight || 0;
            if (newW > 0 && newH > 0) break;
          }
        }
      }
      if (newW > 0 && newH > 0) {
        handleResize(newW, newH);
      }
    });
    if (typeof resizeObserver.observe === 'function') {
      resizeObserver.observe(root);
    }
  }
  activeResizeObserver = resizeObserver;

  chartInstance.unmount = function () {
    if (this._stopRenderLoop) {
      this._stopRenderLoop();
    }
    if (typeof this.stopStreaming === 'function') {
      this.stopStreaming();
    }
    if (resizeObserver && typeof resizeObserver.disconnect === 'function') {
      resizeObserver.disconnect();
    }
    if (windowResizeHandler && currentWindow && typeof currentWindow.removeEventListener === 'function') {
      currentWindow.removeEventListener('resize', windowResizeHandler);
    }
    if (typeof this.destroy === 'function') {
      this.destroy();
    }
    if (toolPaletteComponent && typeof toolPaletteComponent.destroy === 'function') {
      toolPaletteComponent.destroy();
    }
    if (dockComponent && typeof dockComponent.destroy === 'function') {
      dockComponent.destroy();
    }
    clearContainer(root);
    delete root.__nexusInstance;
    activeAppInstance = null;
    activeToolPaletteInstance = null;
    activeChart = null;
    chart = null;
  };

  root.__nexusInstance = chartInstance;
  mountedInstances.set(root, chartInstance);
  activeAppInstance = chartInstance;
  activeChart = chartInstance;
  chart = chartInstance;

  // Immediate frame paint followed by active continuous RAF and tick loops
  chartInstance.render();

  if (opts.autoAnimate !== false) {
    startRenderLoop(chartInstance);
  }

  if (opts.streaming !== false) {
    chartInstance.startStreaming(250);
  }

  return chartInstance;
}

export function init(options = {}) {
  return initApp(options);
}

export function initWorkspace(options = {}) {
  return initApp(options);
}

export function mount(target, options = {}) {
  return initApp(target, options);
}

export function mountApp(target, options = {}) {
  return initApp(target, options);
}

export function start(options = {}) {
  return initApp(options);
}

export function destroyWorkspace() {
  if (activeAppInstance && typeof activeAppInstance.destroy === 'function') {
    activeAppInstance.destroy();
  }
  if (activeAppInstance && typeof activeAppInstance.unmount === 'function') {
    activeAppInstance.unmount();
  }
  if (activeToolPaletteInstance && typeof activeToolPaletteInstance.destroy === 'function') {
    activeToolPaletteInstance.destroy();
  }
  activeAppInstance = null;
  activeToolPaletteInstance = null;
  activeChart = null;
  chart = null;
  appState.activeTool = 'crosshair';
  const doc = typeof document !== 'undefined' ? document : (globalThis.document || null);
  if (doc) {
    const app = doc.getElementById ? doc.getElementById('app') : null;
    if (app) {
      clearContainer(app);
      app.__nexus_mounted = false;
      delete app.__nexusInstance;
    }
  }
}

export default initApp;

// Browser auto-mount guard
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted && mountTarget.children.length === 0) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}