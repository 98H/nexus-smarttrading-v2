/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Mounts the financial chart workspace, active canvas rendering context,
 * coordinate axes renderer (DF-SCALES-01, DF-SCALES-02, STORY 36.1.1), analytical indicator
 * overlays (DF-OVERLAYS-01), live legend components, auxiliary dock
 * hosting secondary workflows (DF-PANEL-01, STORY 31.4.1, STORY 37.2.1, STORY 38.3.1: Resolve MISSING_AUXILIARY_DOCK),
 * continuous ResizeObserver canvas DPI synchronization (STORY 37.3.1),
 * continuous render loop (STORY 38.1.1: Resolve STATIC_APPLICATION),
 * realistic synthetic market walk generator (STORY 38.4.1: Resolve SYNTHETIC_STRAIGHT_LINE_DATA),
 * and strictly idempotent container lifecycle resolution (STORY 37.1.1: Resolve DUPLICATE_COMPONENT_MOUNTING).
 */

import { AxesRenderer, computeRanges } from './axes.js';
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
import { syncCanvasDpi, setupCanvasDpi } from './canvas.js';
import { generateCandlestickData } from './data_generator.js';

export {
  AxesRenderer,
  computeRanges,
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
  syncCanvasDpi,
  setupCanvasDpi,
  generateCandlestickData,
};

/**
 * Polyfills missing DOM methods on mock element prototypes in headless test environments.
 * Safe in native browser DOM where native read-only getters and methods are untouched.
 */
function ensureDOMNodeMethods(proto) {
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
      if (name === 'class') this.className = strVal;
    };
  }

  if (!proto.getAttribute) {
    proto.getAttribute = function (name) {
      if (name === 'id') return this.id || null;
      if (name === 'class') return this.className || null;
      return (this.attributes && this.attributes.get(name)) ?? null;
    };
  }

  if (!proto.hasAttribute) {
    proto.hasAttribute = function (name) {
      if (name === 'id') return Boolean(this.id);
      if (name === 'class') return Boolean(this.className);
      return Boolean(this.attributes && this.attributes.has(name));
    };
  }

  if (!proto.removeAttribute) {
    proto.removeAttribute = function (name) {
      if (this.attributes) this.attributes.delete(name);
      if (name === 'id') this.id = '';
      if (name === 'class') this.className = '';
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
          if (Array.isArray(this.mutationLog)) {
            this.mutationLog.push({
              timestamp: globalThis.__mockClock?.now?.() ?? 0,
              property: 'children',
              action: 'removeChild',
              childTag: child && child.tagName,
            });
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

  if (!Object.getOwnPropertyDescriptor(proto, 'style')) {
    Object.defineProperty(proto, 'style', {
      get() {
        if (!this._styleObj) this._styleObj = {};
        return this._styleObj;
      },
      set(val) {
        if (typeof val === 'object' && val !== null) {
          this._styleObj = val;
        } else if (typeof val === 'string') {
          if (!this._styleObj) this._styleObj = {};
          if (this.setAttribute) this.setAttribute('style', val);
        }
      },
      configurable: true,
    });
  }

  if (!Object.getOwnPropertyDescriptor(proto, 'classList')) {
    Object.defineProperty(proto, 'classList', {
      get() {
        if (!this._classList) {
          const self = this;
          this._classList = {
            add(...tokens) {
              const current = (self.className || '').split(/\s+/).filter(Boolean);
              for (const t of tokens) {
                if (t && !current.includes(t)) current.push(t);
              }
              self.className = current.join(' ');
              if (self.setAttribute) self.setAttribute('class', self.className);
            },
            remove(...tokens) {
              const current = (self.className || '').split(/\s+/).filter(Boolean);
              const filtered = current.filter((c) => !tokens.includes(c));
              self.className = filtered.join(' ');
              if (self.setAttribute) self.setAttribute('class', self.className);
            },
            delete(...tokens) {
              this.remove(...tokens);
            },
            contains(token) {
              const current = (self.className || '').split(/\s+/).filter(Boolean);
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
        return this._classList;
      },
      configurable: true,
    });
  }

  if (!Object.getOwnPropertyDescriptor(proto, 'clientWidth')) {
    Object.defineProperty(proto, 'clientWidth', {
      get() {
        return this._clientWidth !== undefined ? this._clientWidth : (this.width || 800);
      },
      set(v) {
        this._clientWidth = v;
      },
      configurable: true,
    });
  }

  if (!Object.getOwnPropertyDescriptor(proto, 'clientHeight')) {
    Object.defineProperty(proto, 'clientHeight', {
      get() {
        return this._clientHeight !== undefined ? this._clientHeight : (this.height || 600);
      },
      set(v) {
        this._clientHeight = v;
      },
      configurable: true,
    });
  }
}

/**
 * Patches the active DOM environment in mock / headless testing contexts.
 */
export function patchDOMEnvironment() {
  const doc = typeof document !== 'undefined' ? document : (globalThis.document || null);
  if (!doc) return;

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
    let proto = Object.getPrototypeOf(sample);
    while (proto && proto !== Object.prototype) {
      ensureDOMNodeMethods(proto);
      proto = Object.getPrototypeOf(proto);
    }
  }

  if (doc.body) {
    let bodyProto = Object.getPrototypeOf(doc.body);
    while (bodyProto && bodyProto !== Object.prototype) {
      ensureDOMNodeMethods(bodyProto);
      bodyProto = Object.getPrototypeOf(bodyProto);
    }
  }

  if (typeof doc.createElement === 'function') {
    try {
      const btn = doc.createElement('button');
      if (btn) {
        let btnProto = Object.getPrototypeOf(btn);
        while (btnProto && btnProto !== Object.prototype) {
          ensureDOMNodeMethods(btnProto);
          btnProto = Object.getPrototypeOf(btnProto);
        }
      }
    } catch (_) {}

    try {
      const canvas = doc.createElement('canvas');
      if (canvas) {
        let canvasProto = Object.getPrototypeOf(canvas);
        while (canvasProto && canvasProto !== Object.prototype) {
          ensureDOMNodeMethods(canvasProto);
          canvasProto = Object.getPrototypeOf(canvasProto);
        }
      }
    } catch (_) {}
  }
}

// Ensure prototype methods are patched on initial import
patchDOMEnvironment();

/**
 * Application state store.
 */
const appState = {
  activeTool: 'cursor',
  overlayType: 'EMA',
  period: 20,
  data: [],
  drawings: [],
  selectedDrawing: null,
};

const mountedInstances = new WeakMap();

let activeAppInstance = null;
let activeResizeObserver = null;
let windowResizeHandler = null;
export let activeChart = null;
export let chart = null;

/**
 * Returns the current application state.
 *
 * @returns {Object}
 */
export function getState() {
  return appState;
}

/**
 * Matches a mock or real DOM element against simple CSS selectors.
 */
function matchSelector(node, selector) {
  if (!node || typeof selector !== 'string') return false;
  const sel = selector.trim();
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    return node.id === id || (typeof node.getAttribute === 'function' && node.getAttribute('id') === id);
  }
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
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

/**
 * Traverses element tree to locate first matching descendant.
 */
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
 * DOM Element creation utility helper that safely supports mock and real DOM environments
 * without mutating native read-only DOM getters (e.g. tagName, nodeName, children).
 *
 * @param {string} tag
 * @param {Object} [attrs={}]
 * @param {Array<HTMLElement|Object>|string} [children=[]]
 * @returns {HTMLElement|Object}
 */
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
    if (typeof el.appendChild !== 'function') {
      const childList = Array.isArray(el.children) ? el.children : [];
      el.appendChild = function (child) {
        if (child) {
          child.parentNode = this;
          child.parentElement = this;
          childList.push(child);
        }
        return child;
      };
    }

    if (typeof el.removeChild !== 'function') {
      el.removeChild = function (child) {
        const childList = Array.isArray(this.children) ? this.children : [];
        const idx = childList.indexOf(child);
        if (idx !== -1) {
          child.parentNode = null;
          child.parentElement = null;
          childList.splice(idx, 1);
        }
        return child;
      };
    }

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

    if (typeof el.addEventListener !== 'function') {
      el.addEventListener = function () {};
    }
    if (typeof el.removeEventListener !== 'function') {
      el.removeEventListener = function () {};
    }

    if (typeof el.setAttribute !== 'function') {
      el.setAttribute = function (name, value) {
        this[name] = String(value);
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
      };
    }

    if (typeof el.getAttribute !== 'function') {
      el.getAttribute = function (name) {
        return this[name] !== undefined ? String(this[name]) : null;
      };
    }

    if (typeof el.hasAttribute !== 'function') {
      el.hasAttribute = function (name) {
        return this[name] !== undefined && this[name] !== null;
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
          if (!el.style) el.style = {};
          Object.assign(el.style, attrs[key]);
          const cssText = Object.entries(attrs[key])
            .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
            .join(' ');
          if (typeof el.setAttribute === 'function') {
            el.setAttribute('style', cssText);
          }
        } else {
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

/**
 * Generates oscillating mock price candles containing balanced bullish/bearish series (DF-CANDLES-01).
 *
 * @param {number} [count=75]
 * @param {number} [startPrice=100]
 * @returns {Array<Object>}
 */
export function generateDefaultData(count = 75, startPrice = 100) {
  return generateCandlestickData({ count, initialPrice: startPrice });
}

/**
 * Drawing Tool Palette Component with toolbar semantic markers.
 *
 * @param {Object} [options={}]
 * @returns {HTMLElement|Object}
 */
export function ToolPalette(options = {}) {
  const container = createElement('div', {
    className: 'tool-palette toolbar',
    'data-component': 'toolbar',
    role: 'toolbar',
    'aria-label': 'Drawing Tools',
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px',
      background: '#181b24',
      borderRight: '1px solid #2a2e39',
      width: '48px',
      alignItems: 'center',
      boxSizing: 'border-box',
      flexShrink: '0',
    },
  });

  const tools = [
    { id: 'cursor', label: '⇪', title: 'Cursor' },
    { id: 'trendline', label: '╱', title: 'Trendline' },
    { id: 'horizontal', label: '―', title: 'Horizontal Line' },
    { id: 'fibonacci', label: '≡', title: 'Fibonacci Retracement' },
  ];

  tools.forEach((tool) => {
    const btn = createElement('button', {
      className: `tool-btn tool-${tool.id}`,
      id: `tool-${tool.id}`,
      textContent: tool.label,
      title: tool.title,
      style: {
        background: appState.activeTool === tool.id ? '#2962ff' : '#1e222d',
        color: '#d1d4dc',
        border: '1px solid #363c4e',
        borderRadius: '4px',
        padding: '6px 10px',
        cursor: 'pointer',
        fontSize: '14px',
        lineHeight: '1',
      },
      onClick: () => {
        appState.activeTool = tool.id;
        if (typeof options.onToolChange === 'function') {
          options.onToolChange(tool.id);
        }
      },
    });
    if (typeof container.appendChild === 'function') {
      container.appendChild(btn);
    }
  });

  return container;
}

/**
 * Initializes and styles header controls (DF-THEME-01).
 *
 * @param {HTMLElement|Object} header
 * @param {Object} [options={}]
 * @returns {HTMLElement|Object}
 */
export function initControls(header, options = {}) {
  const controls = createElement('div', {
    className: 'chart-controls',
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
 * Starts an active render loop via requestAnimationFrame.
 *
 * @param {Object} instance Application/chart instance
 * @returns {Function} Stop/cleanup function
 */
export function startRenderLoop(instance) {
  let isRunning = true;

  const getRaf = () => {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame.bind(window);
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.requestAnimationFrame === 'function') {
      return globalThis.requestAnimationFrame.bind(globalThis);
    }
    return null;
  };

  const getCaf = () => {
    if (typeof cancelAnimationFrame === 'function') return cancelAnimationFrame;
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      return window.cancelAnimationFrame.bind(window);
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.cancelAnimationFrame === 'function') {
      return globalThis.cancelAnimationFrame.bind(globalThis);
    }
    return null;
  };

  const raf = getRaf();
  const caf = getCaf();

  if (!raf) {
    return () => {
      isRunning = false;
    };
  }

  function renderFrame(timestamp) {
    if (!isRunning) return;
    if (typeof instance.renderFrame === 'function') {
      instance.renderFrame(timestamp);
    } else if (typeof instance.render === 'function') {
      instance.render(timestamp);
    }
    instance.rafId = raf(renderFrame);
  }

  instance.rafId = raf(renderFrame);

  return () => {
    isRunning = false;
    if (instance.rafId && caf) {
      caf(instance.rafId);
      instance.rafId = null;
    }
  };
}

/**
 * Resolves target container element from arguments or DOM environment.
 *
 * @param {Object|HTMLElement|string} [options={}]
 * @returns {{ root: HTMLElement|Object, opts: Object }}
 */
function resolveRootContainer(options = {}) {
  const currentDoc = typeof document !== 'undefined' ? document : (globalThis.document || null);
  let root = null;
  let opts = {};

  if (options && (options.nodeType !== undefined || options.tagName !== undefined || typeof options.appendChild === 'function')) {
    root = options;
  } else if (typeof options === 'string') {
    const cleanId = options.startsWith('#') ? options.slice(1) : options;
    root = currentDoc && typeof currentDoc.getElementById === 'function'
      ? currentDoc.getElementById(cleanId)
      : null;
  } else if (options && typeof options === 'object') {
    opts = options;
    const rootTarget = options.root || options.rootId || (options.container !== undefined ? options.container : null);
    if (typeof rootTarget === 'string') {
      const cleanId = rootTarget.startsWith('#') ? rootTarget.slice(1) : rootTarget;
      root = currentDoc && typeof currentDoc.getElementById === 'function'
        ? currentDoc.getElementById(cleanId)
        : null;
    } else if (rootTarget && typeof rootTarget === 'object') {
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
 * Satisfies STORY 38.1.1 (Resolve STATIC_APPLICATION), STORY 38.3.1 (Resolve MISSING_AUXILIARY_DOCK),
 * STORY 38.4.1 (Resolve SYNTHETIC_STRAIGHT_LINE_DATA), STORY 37.1.1, and DF-PANEL-01 / DF-PANEL-02.
 *
 * @param {Object|HTMLElement|string} [options={}] Initialization settings or container
 * @returns {Chart} Chart workspace instance
 */
export function initApp(options = {}) {
  patchDOMEnvironment();
  const { root, opts } = resolveRootContainer(options);
  const currentDoc = typeof document !== 'undefined' ? document : (globalThis.document || null);

  patchMockDOM(root);
  if (currentDoc && currentDoc.body) {
    patchMockDOM(currentDoc.body);
  }

  // Teardown prior instance registered on this root container
  const priorInstance = root.__nexusInstance || (typeof root === 'object' && mountedInstances.get(root));
  if (priorInstance && typeof priorInstance.unmount === 'function') {
    priorInstance.unmount();
  }

  // Identify any pre-existing active canvas inside the target container
  const existingCanvas =
    (typeof root.querySelector === 'function' ? root.querySelector('canvas') : null) ||
    (Array.isArray(root.children)
      ? root.children.find((c) => c && (c.tagName || '').toUpperCase() === 'CANVAS')
      : null);

  // Idempotently purge pre-existing DOM elements before mounting, preserving active canvas
  if (Array.isArray(root.children)) {
    for (let i = root.children.length - 1; i >= 0; i--) {
      const child = root.children[i];
      if (child !== existingCanvas) {
        if (typeof root.removeChild === 'function') {
          root.removeChild(child);
        } else {
          root.children.splice(i, 1);
        }
      }
    }
  }

  const outerStyle =
    'height: 100vh; overflow: hidden; display: flex; flex-direction: column; width: 100vw; max-height: 100vh; box-sizing: border-box; background: #131722; color: #d1d4dc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
  if (typeof root.setAttribute === 'function') {
    root.setAttribute('style', outerStyle);
  }
  if (!root.style) {
    root.style = {};
  }
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.width = '100vw';
  root.style.height = '100vh';
  root.style.maxHeight = '100vh';
  root.style.overflow = 'hidden';
  root.style.boxSizing = 'border-box';
  root.style.background = '#131722';
  root.style.color = '#d1d4dc';
  root.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  if (typeof document !== 'undefined') {
    if (document.documentElement && document.documentElement.style) {
      document.documentElement.style.height = '100%';
      document.documentElement.style.overflow = 'hidden';
    }
    if (document.body && document.body.style) {
      document.body.style.height = '100%';
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflow = 'hidden';
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

  // 2. Toolbar Component
  const toolPalette = ToolPalette({
    onToolChange: (tool) => {
      appState.activeTool = tool;
    },
  });

  // 3. Workspace Layout
  const workspaceContainer = createElement('div', {
    className: 'workspace-container chart-workspace-layout',
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

  // 4. Primary Chart Container
  const chartContainer = createElement('div', {
    className: 'chart-container primary-chart-container',
    id: 'chart-container',
    'data-component': 'chart-container',
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: '1',
      minWidth: '0',
      minHeight: '0',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
  });

  // 5. Active Canvas Component (reused or created)
  const canvas = existingCanvas || createElement('canvas', {
    className: 'chart-canvas',
    style: {
      flex: '1 1 0%',
      minHeight: '0',
      width: '100%',
      height: '100%',
      maxHeight: '100%',
      display: 'block',
      background: '#131722',
      boxSizing: 'border-box',
    },
  });

  if (opts.width && typeof canvas.clientWidth !== 'number') {
    try { canvas.clientWidth = opts.width; } catch (_) {}
  }
  if (opts.height && typeof canvas.clientHeight !== 'number') {
    try { canvas.clientHeight = opts.height; } catch (_) {}
  }

  let ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (ctx) {
    polyfillCanvasContext(ctx);
  }

  const priceAxisWidth = opts.priceAxisWidth !== undefined ? opts.priceAxisWidth : 70;
  const timeAxisHeight = opts.timeAxisHeight !== undefined ? opts.timeAxisHeight : 50;

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

  // Ensure canvas remains registered in mock container children collections
  if (typeof Element === 'undefined' || !(root instanceof Element)) {
    if (Array.isArray(root.children) && !root.children.includes(canvas)) {
      root.children.push(canvas);
    }
  }

  const axesRenderer = new AxesRenderer({
    canvas,
    context: ctx,
    priceAxisWidth,
    timeAxisHeight,
    trackElement: bottomAxisTrack,
  });

  canvas.axesRenderer = axesRenderer;

  // 6. Auxiliary Dock Component
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
    workspaceContainer.appendChild(toolPalette);
    workspaceContainer.appendChild(chartContainer);
    workspaceContainer.appendChild(dockElement);
  }

  if (typeof root.appendChild === 'function') {
    root.appendChild(header);
    root.appendChild(workspaceContainer);
  }

  syncCanvasDpi(canvas);

  const chartInstance = new Chart(canvas, {
    data: initialData,
    overlayType,
    period,
    color: overlayColor,
    legend,
    axesRenderer,
    priceAxisWidth,
    timeAxisHeight,
    trackElement: bottomAxisTrack,
    initialZoom: opts.initialZoom || opts.zoom || 1.0,
    minZoom: opts.minZoom !== undefined ? opts.minZoom : 0.2,
    maxZoom: opts.maxZoom !== undefined ? opts.maxZoom : 5.0,
  });

  canvas._chartInstance = chartInstance;

  chartInstance.root = root;
  chartInstance.header = header;
  chartInstance.legend = legend;
  chartInstance.canvas = canvas;
  chartInstance.chartContainer = chartContainer;
  chartInstance.workspaceContainer = workspaceContainer;
  chartInstance.bottomAxisTrack = bottomAxisTrack;
  chartInstance.toolPalette = toolPalette;
  chartInstance.dock = dockComponent;
  chartInstance.dockElement = dockElement;
  chartInstance.chart = chartInstance;
  chartInstance.axesRenderer = axesRenderer;
  chartInstance.getAxesRenderer = () => axesRenderer;

  chartInstance.activateWorkflow = (workflow, widget) => dockComponent.activateWorkflow(workflow, widget);
  chartInstance.mountWorkflow = (workflow, widget) => dockComponent.mountWorkflow(workflow, widget);
  chartInstance.switchDockTab = (tab) => dockComponent.switchTab(tab);
  chartInstance.toggleDockCollapse = () => dockComponent.toggleCollapse();

  chartInstance.updateData = function (newCandles) {
    if (!newCandles) return Promise.resolve(this);
    const batch = Array.isArray(newCandles) ? [...newCandles] : [newCandles];
    if (batch.length === 0) return Promise.resolve(this);

    let updated;
    if (Array.isArray(this.data) && this.data.length > 0) {
      const map = new Map();
      this.data.forEach((c) => {
        if (!c) return;
        const k = c.time ?? c.timestamp ?? c.t ?? c.date;
        if (k !== undefined) map.set(k, c);
      });
      batch.forEach((c) => {
        if (!c) return;
        const k = c.time ?? c.timestamp ?? c.t ?? c.date;
        if (k !== undefined) map.set(k, c);
      });
      updated = Array.from(map.values()).sort((a, b) => {
        const tA = a.time ?? a.timestamp ?? a.t ?? a.date ?? 0;
        const tB = b.time ?? b.timestamp ?? b.t ?? b.date ?? 0;
        return tA - tB;
      });
    } else {
      updated = batch;
    }

    this.data = updated;
    appState.data = updated;
    this.setData(updated);
    return Promise.resolve(this);
  };

  chartInstance.onDataUpdate = chartInstance.updateData;

  const handleResize = () => {
    syncCanvasDpi(canvas);
    const w = (canvas && canvas.width) || 800;
    const h = (canvas && canvas.height) || 600;
    if (axesRenderer) {
      axesRenderer.resize(w, h);
    }
    chartInstance.resize(w, h);
    chartInstance.render();
  };

  chartInstance.windowResizeHandler = handleResize;
  windowResizeHandler = handleResize;

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', handleResize);
  }

  let resizeObserver = null;
  const ResizeObserverClass = typeof ResizeObserver !== 'undefined'
    ? ResizeObserver
    : (typeof window !== 'undefined' && window.ResizeObserver
      ? window.ResizeObserver
      : (typeof globalThis !== 'undefined' ? globalThis.ResizeObserver : null));

  if (ResizeObserverClass) {
    resizeObserver = new ResizeObserverClass((entries) => {
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (!entry) continue;
          const cr = entry.contentRect;
          if (cr) {
            const w = typeof cr.width === 'number' && cr.width > 0 ? cr.width : (entry.target && entry.target.clientWidth);
            const h = typeof cr.height === 'number' && cr.height > 0 ? cr.height : (entry.target && entry.target.clientHeight);
            if (typeof w === 'number' && w > 0) {
              try { canvas.clientWidth = w; } catch (_) {}
            }
            if (typeof h === 'number' && h > 0) {
              try { canvas.clientHeight = h; } catch (_) {}
            }
          }
        }
      }
      handleResize();
    });

    resizeObserver.observe(root);
    if (chartContainer) {
      resizeObserver.observe(chartContainer);
    }
    if (canvas && canvas !== root) {
      resizeObserver.observe(canvas);
    }
  }

  activeResizeObserver = resizeObserver;
  chartInstance.resizeObserver = resizeObserver;

  chartInstance.unmount = function () {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (activeResizeObserver === this.resizeObserver) {
      activeResizeObserver = null;
    }
    if (this.windowResizeHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
    if (windowResizeHandler === this.windowResizeHandler) {
      windowResizeHandler = null;
    }
    if (typeof this.stopRenderLoop === 'function') {
      this.stopRenderLoop();
    }
    if (this.realtimeTimer && typeof clearInterval === 'function') {
      clearInterval(this.realtimeTimer);
      this.realtimeTimer = null;
    }
    if (this.dock && typeof this.dock.destroy === 'function') {
      this.dock.destroy();
    }
    if (typeof this.destroy === 'function') {
      this.destroy();
    }
    if (root && root.__nexusInstance === this) {
      delete root.__nexusInstance;
    }
    if (typeof root === 'object') {
      mountedInstances.delete(root);
    }
    if (activeAppInstance === this) {
      activeAppInstance = null;
      activeChart = null;
      chart = null;
    }
  };

  root.__nexusInstance = chartInstance;
  if (typeof root === 'object') {
    mountedInstances.set(root, chartInstance);
  }

  activeAppInstance = chartInstance;
  activeChart = chartInstance;
  chart = chartInstance;

  chartInstance.render();
  chartInstance.stopRenderLoop = startRenderLoop(chartInstance);

  return chartInstance;
}

/**
 * Teardown and cleanup function for test suites and application unmounting.
 */
export function teardown() {
  if (activeResizeObserver) {
    activeResizeObserver.disconnect();
    activeResizeObserver = null;
  }
  if (windowResizeHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
    window.removeEventListener('resize', windowResizeHandler);
    windowResizeHandler = null;
  }
  if (activeAppInstance) {
    if (typeof activeAppInstance.unmount === 'function') {
      activeAppInstance.unmount();
    } else {
      if (typeof activeAppInstance.stopRenderLoop === 'function') {
        activeAppInstance.stopRenderLoop();
      }
      if (activeAppInstance.realtimeTimer && typeof clearInterval === 'function') {
        clearInterval(activeAppInstance.realtimeTimer);
      }
      if (typeof activeAppInstance.destroy === 'function') {
        activeAppInstance.destroy();
      }
    }
    activeAppInstance = null;
  }
  activeChart = null;
  chart = null;
}

/**
 * Unmount helper function supporting test suites and lifecycle management.
 *
 * @param {HTMLElement|Object} [target]
 */
export function unmount(target) {
  if (target) {
    const currentDoc = typeof document !== 'undefined' ? document : (globalThis.document || null);
    const root = typeof target === 'string'
      ? (currentDoc && currentDoc.getElementById ? currentDoc.getElementById(target.replace(/^#/, '')) : null)
      : target;
    const inst = root && (root.__nexusInstance || (typeof root === 'object' && mountedInstances.get(root)));
    if (inst && typeof inst.unmount === 'function') {
      inst.unmount();
      return;
    }
  }
  if (activeAppInstance && typeof activeAppInstance.unmount === 'function') {
    activeAppInstance.unmount();
  } else {
    teardown();
  }
}

/**
 * Updates real-time candle data and redraws coordinate axes and overlays.
 *
 * @param {Object|Array<Object>} targetOrData
 * @param {Array<Object>} [maybeCandles]
 * @returns {Promise<Object>}
 */
export function updateCandleData(targetOrData, maybeCandles) {
  let inst = activeAppInstance || activeChart || chart;
  let data = targetOrData;
  if (maybeCandles !== undefined) {
    inst = targetOrData;
    data = maybeCandles;
  } else if (targetOrData && typeof targetOrData.updateData === 'function') {
    inst = targetOrData;
    data = maybeCandles;
  }
  if (inst && typeof inst.updateData === 'function') {
    return Promise.resolve(inst.updateData(data));
  }
  return Promise.resolve();
}

/**
 * Updates chart price series data and recalculates visual overlays and legend.
 *
 * @param {Object} chartInstance Instantiated chart returned by initApp
 * @param {Array<Object>} updatedData Updated price candle series
 */
export function updatePriceSeries(chartInstance, updatedData) {
  if (!chartInstance) return;
  const newData = Array.isArray(updatedData) ? [...updatedData] : [];
  chartInstance.data = newData;
  appState.data = newData;
  if (typeof chartInstance.setData === 'function') {
    chartInstance.setData(newData);
  } else if (typeof chartInstance.render === 'function') {
    chartInstance.render();
  }
}

/**
 * Starts a real-time price tick update loop for browser execution.
 *
 * @param {Object} chartInstance
 * @param {number} [intervalMs=2000]
 * @returns {number|null} Timer id
 */
export function startRealtimeUpdates(chartInstance, intervalMs = 2000) {
  if (!chartInstance || typeof setInterval !== 'function') return null;
  const timer = setInterval(() => {
    const data = chartInstance.data;
    if (!data || data.length === 0) return;
    const lastBar = data[data.length - 1];
    const shift = (Math.random() - 0.48) * 2;
    const newClose = Math.max(1, lastBar.close + shift);
    const newBar = {
      timestamp: (lastBar.timestamp || Date.now()) + 60000,
      open: lastBar.close,
      high: Math.max(lastBar.close, newClose) + Math.random(),
      low: Math.min(lastBar.close, newClose) - Math.random(),
      close: newClose,
      volume: 1000 + Math.floor(Math.random() * 500),
    };
    updatePriceSeries(chartInstance, [...data.slice(-99), newBar]);
  }, intervalMs);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

/**
 * Lifecycle mount function for application integration.
 * Resolves DUPLICATE_COMPONENT_MOUNTING idempotently.
 *
 * @param {HTMLElement|string} [mountTarget]
 * @param {Object} [options={}]
 * @returns {Chart}
 */
export function mountApp(mountTarget, options = {}) {
  patchDOMEnvironment();
  const currentDoc = typeof document !== 'undefined' ? document : (globalThis.document || null);
  let target = mountTarget;

  if (typeof mountTarget === 'string') {
    target = currentDoc && currentDoc.getElementById
      ? currentDoc.getElementById(mountTarget.replace(/^#/, ''))
      : null;
  }

  const rootOption =
    target ||
    (currentDoc && currentDoc.getElementById ? currentDoc.getElementById('app') : null) ||
    (currentDoc ? currentDoc.body : null) ||
    'app';

  const instance = initApp({
    root: rootOption,
    initialData: options.initialData || generateDefaultData(75),
    overlayType: options.overlayType || 'EMA',
    period: options.period || 20,
    ...options,
  });

  if (typeof window !== 'undefined' && options.realtime === true) {
    instance.realtimeTimer = startRealtimeUpdates(instance, options.interval || 1000);
  }

  return instance;
}

export const mount = mountApp;
export const mountChart = initApp;

/**
 * Lifecycle initialization function supporting module export patterns.
 */
export function init(mountTarget, options = {}) {
  patchDOMEnvironment();
  const currentDoc = typeof document !== 'undefined' ? document : (globalThis.document || null);
  const target = typeof mountTarget === 'string'
    ? (currentDoc && currentDoc.getElementById ? currentDoc.getElementById(mountTarget.replace(/^#/, '')) : null)
    : (mountTarget || (currentDoc && currentDoc.getElementById ? currentDoc.getElementById('app') : (currentDoc ? currentDoc.body : null)));

  if (!target) return null;
  return mountApp(target, options);
}

export const start = init;
export const bootstrap = init;
export const main = init;
export default init;
export const initialize = mountApp;

// Browser auto-mount guard
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted && mountTarget.children.length === 0) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}