/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Mounts the financial chart workspace, active canvas rendering context,
 * coordinate axes renderer (DF-SCALES-01, DF-SCALES-02, STORY 36.1.1), analytical indicator
 * overlays (DF-OVERLAYS-01), live legend components, auxiliary dock
 * hosting secondary workflows (DF-PANEL-01, STORY 31.4.1, STORY 37.2.1, STORY 38.3.1: Resolve MISSING_AUXILIARY_DOCK),
 * continuous ResizeObserver canvas DPI synchronization (STORY 37.3.1),
 * continuous render loop (STORY 38.1.1, STORY 39.1.1: Resolve STATIC_APPLICATION),
 * realistic synthetic market walk generator (STORY 38.4.1: Resolve SYNTHETIC_STRAIGHT_LINE_DATA),
 * strictly idempotent container lifecycle resolution (STORY 37.1.1, STORY 39.2.1: Resolve DUPLICATE_COMPONENT_MOUNTING),
 * responsive 100vh flex layout preventing squished canvas sizing (STORY 40.1.1: Resolve SQUISHED_CANVAS_VIEWPORT),
 * and interactive controls responding to user events with reactive state and view re-rendering (STORY 38.2.1: Resolve INACTIVE_UI_CONTROLS).
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
import {
  syncCanvasDpi,
  setupCanvasDpi,
  syncCanvasDimensions,
  resizeCanvas,
  updateCanvasDimensions,
} from './canvas.js';
import {
  generateCandlestickData,
  generateDefaultData,
  generateNextCandle,
  generateTick,
  createCandleStream,
} from './data_generator.js';

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
  syncCanvasDimensions,
  resizeCanvas,
  updateCanvasDimensions,
  generateCandlestickData,
  generateDefaultData,
  generateNextCandle,
  generateTick,
  createCandleStream,
};

/**
 * Polyfills missing DOM methods on mock element prototypes in headless test environments.
 * Preserves native browser properties without overwriting native read-only getters.
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
    };
  }

  if (!proto.getAttribute) {
    proto.getAttribute = function (name) {
      if (name === 'id') return this.id || null;
      if (name === 'class' || name === 'className') return this.className || null;
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

  const classListDesc = Object.getOwnPropertyDescriptor(proto, 'classList');
  if (!classListDesc && (!sample || !('classList' in sample))) {
    Object.defineProperty(proto, 'classList', {
      get() {
        if (!this._classList) {
          const self = this;
          this._classList = {
            add(...tokens) {
              const current = (self.className || '').split(/\s+/).filter(Boolean);
              let changed = false;
              for (const t of tokens) {
                if (t && !current.includes(t)) {
                  current.push(t);
                  changed = true;
                }
              }
              if (changed) {
                self.className = current.join(' ');
                if (self.attributes) self.attributes.set('class', self.className);
              }
            },
            remove(...tokens) {
              const current = (self.className || '').split(/\s+/).filter(Boolean);
              const filtered = current.filter((c) => !tokens.includes(c));
              if (filtered.length !== current.length) {
                self.className = filtered.join(' ');
                if (self.attributes) self.attributes.set('class', self.className);
              }
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
      set(val) {
        this._classList = val;
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
      ensureDOMNodeMethods(proto, sample);
      proto = Object.getPrototypeOf(proto);
    }
  }

  if (doc.body) {
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

export function getState() {
  return { ...appState };
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
    const isInitial = appState.activeTool === tool.id;
    const btn = createElement('button', {
      className: `tool-btn tool-${tool.id}${isInitial ? ' active' : ''}`,
      id: `tool-${tool.id}`,
      textContent: tool.label,
      title: tool.title,
      style: {
        background: isInitial ? '#2962ff' : '#1e222d',
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
        if (container.querySelectorAll) {
          const allToolBtns = container.querySelectorAll('.tool-btn');
          allToolBtns.forEach((b) => {
            b.classList?.remove?.('active');
            if (b.style) b.style.background = '#1e222d';
          });
        }
        btn.classList?.add?.('active');
        if (btn.style) btn.style.background = '#2962ff';
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
 * Starts an active render loop via requestAnimationFrame or high-frequency timer fallback.
 * Satisfies STORY 38.1.1, STORY 39.1.1 (Resolve STATIC_APPLICATION).
 *
 * @param {Object} instance Application/chart instance
 * @returns {Function} Stop/cleanup function
 */
export function startRenderLoop(instance) {
  let isRunning = true;

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

  if (!raf) {
    if (typeof setInterval === 'function') {
      const timerId = setInterval(() => {
        if (!isRunning) return;
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        if (typeof instance.renderFrame === 'function') {
          instance.renderFrame(now);
        } else if (typeof instance.render === 'function') {
          instance.render(now);
        }
      }, 16);
      return () => {
        isRunning = false;
        if (typeof clearInterval === 'function') {
          clearInterval(timerId);
        }
      };
    }
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
    const rootTarget = options.root || options.rootId || (options.container !== undefined ? options.container : null);
    if (rootTarget === null) {
      throw new Error('Target container (#app) was not found in the DOM: container is null');
    }
    if (typeof rootTarget === 'string') {
      const cleanId = rootTarget.startsWith('#') ? rootTarget.slice(1) : rootTarget;
      root = currentDoc && typeof currentDoc.getElementById === 'function'
        ? currentDoc.getElementById(cleanId)
        : null;
      if (!root) {
        throw new Error(`Target container (#${cleanId}) was not found in the DOM: container is missing`);
      }
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
 * Idempotently clears existing child elements to resolve DUPLICATE_COMPONENT_MOUNTING (STORY 39.2.1),
 * applies responsive 100vh flex styling to root and body to resolve SQUISHED_CANVAS_VIEWPORT (STORY 40.1.1).
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

  const priorInstance = root.__nexusInstance || (typeof root === 'object' && mountedInstances.get(root));
  if (priorInstance && isContainerMounted(root) && !opts.forceRemount && Object.keys(opts).length === 0) {
    return priorInstance;
  }

  if (priorInstance && typeof priorInstance.unmount === 'function') {
    priorInstance.unmount();
  }

  // Idempotently clear root container so headers, toolbar, dock, and canvas never duplicate
  clearContainer(root);

  // Apply responsive 100vh flex configuration to root and document body (DF-LAYOUT-01, STORY 40.1.1)
  const outerStyle =
    'height: 100vh; min-height: 100vh; overflow: hidden; display: flex; flex-direction: column; width: 100vw; max-height: 100vh; box-sizing: border-box; background: #131722; color: #d1d4dc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
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
      btn.setAttribute('data-active', 'true');
      btn.classList.add('active');
    }

    controlButtonsList.push(btn);
    if (typeof navControls.appendChild === 'function') {
      navControls.appendChild(btn);
    }
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
  }

  // 3. Toolbar Component
  const toolPalette = ToolPalette({
    onToolChange: (tool) => {
      appState.activeTool = tool;
    },
  });

  // 4. Workspace Layout (Horizontal flex container, occupies available workspace width >= 55% of viewport)
  const workspaceContainer = createElement('div', {
    className: 'workspace-container chart-workspace-layout workspace',
    id: 'workspace-container',
    'data-component': 'workspace',
    style: {
      display: 'flex',
      flexDirection: 'row',
      flex: '1',
      minHeight: '0',
      'min-height': '0',
      width: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
  });
  workspaceContainer.style.flex = '1';
  workspaceContainer.style.minHeight = '0';
  workspaceContainer.style['min-height'] = '0';

  // 5. Primary Chart Container (Parent of chart canvas; flex: 1, min-height: 0, width: 100%)
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
      'min-height': '0',
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box',
    },
  });
  chartContainer.style.flex = '1';
  chartContainer.style.minHeight = '0';
  chartContainer.style['min-height'] = '0';

  const win = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' && globalThis.window ? globalThis.window : null);

  const initialVpWidth = (root.clientWidth && root.clientWidth > 0)
    ? root.clientWidth
    : (win && win.innerWidth ? win.innerWidth : 1920);
  const initialVpHeight = (root.clientHeight && root.clientHeight > 0)
    ? root.clientHeight
    : (win && win.innerHeight ? win.innerHeight : 1080);

  chartContainer.clientWidth = Math.round(initialVpWidth * 0.65);
  chartContainer.clientHeight = initialVpHeight;

  // 6. Active Canvas Component (Flex-stretches to fill container bounds, preventing default 300px squished sizing)
  const canvas = createElement('canvas', {
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

  const axesRenderer = new AxesRenderer({
    canvas,
    context: ctx,
    priceAxisWidth,
    timeAxisHeight,
    trackElement: bottomAxisTrack,
  });

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
    workspaceContainer.appendChild(toolPalette);
    workspaceContainer.appendChild(chartContainer);
    workspaceContainer.appendChild(dockElement);
  }

  if (typeof root.appendChild === 'function') {
    root.appendChild(header);
    root.appendChild(workspaceContainer);
  }

  // Synchronize canvas buffer dimensions with its container bounds on initial render (STORY 40.1.1)
  syncCanvasDimensions(canvas, chartContainer);

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
  chartInstance.navControls = navControls;
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

  function activateControl(target) {
    appState.activeView = target;
    appState.activeTab = target;
    appState.selectedConfig = target;

    controlButtonsList.forEach((btn) => {
      const btnTarget = btn.getAttribute('data-target') || btn.getAttribute('data-tab') || btn.textContent;
      const isSelected = btnTarget === target;
      if (isSelected) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        btn.setAttribute('data-active', 'true');
        if (btn.style) {
          btn.style.background = '#2962ff';
          btn.style.color = '#ffffff';
          btn.style.fontWeight = '600';
        }
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
        btn.removeAttribute('data-active');
        if (btn.style) {
          btn.style.background = '#1e222d';
          btn.style.color = '#d1d4dc';
          btn.style.fontWeight = '400';
        }
      }
    });

    if (chartContainer) {
      chartContainer.setAttribute('data-config', target);
      chartContainer.setAttribute('data-target', target);
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
    return Promise.resolve(this);
  };

  chartInstance.updateTick = function (tick) {
    const updated = Chart.prototype.updateTick.call(this, tick);
    appState.data = updated;
    return Promise.resolve(this);
  };

  chartInstance.onDataUpdate = chartInstance.updateData;

  // Window resize handler: Synchronizes canvas buffer dimensions with container bounds
  const handleResize = () => {
    syncCanvasDimensions(canvas, chartContainer);
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

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('resize', handleResize);
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
          const target = entry.target;
          if (cr) {
            const w = typeof cr.width === 'number' && cr.width > 0 ? cr.width : (target && target.clientWidth);
            const h = typeof cr.height === 'number' && cr.height > 0 ? cr.height : (target && target.clientHeight);
            if (typeof w === 'number' && w > 0) {
              if (target) {
                try { target.clientWidth = w; } catch (_) {}
              }
              if (target === chartContainer || target === workspaceContainer || target === canvas) {
                try { canvas.clientWidth = w; } catch (_) {}
              }
            }
            if (typeof h === 'number' && h > 0) {
              if (target) {
                try { target.clientHeight = h; } catch (_) {}
              }
              if (target === chartContainer || target === workspaceContainer || target === canvas) {
                try { canvas.clientHeight = h; } catch (_) {}
              }
            }
          }
        }
      }
      handleResize();
    });

    resizeObserver.observe(root);
    if (workspaceContainer) {
      resizeObserver.observe(workspaceContainer);
    }
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
    const targetWin = typeof window !== 'undefined'
      ? window
      : (typeof globalThis !== 'undefined' && globalThis.window ? globalThis.window : null);
    if (this.windowResizeHandler && targetWin && typeof targetWin.removeEventListener === 'function') {
      targetWin.removeEventListener('resize', this.windowResizeHandler);
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
      delete root.__nexus_mounted;
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
  root.__nexus_mounted = true;
  if (typeof root === 'object') {
    mountedInstances.set(root, chartInstance);
  }

  activeAppInstance = chartInstance;
  activeChart = chartInstance;
  chart = chartInstance;

  chartInstance.render();
  chartInstance.stopRenderLoop = startRenderLoop(chartInstance);

  if (opts.realtime !== false && !chartInstance.realtimeTimer) {
    chartInstance.realtimeTimer = startRealtimeUpdates(chartInstance, opts.interval || 1000);
  }

  return chartInstance;
}

export function teardown() {
  if (activeResizeObserver) {
    activeResizeObserver.disconnect();
    activeResizeObserver = null;
  }
  const win = typeof window !== 'undefined'
    ? window
    : (typeof globalThis !== 'undefined' && globalThis.window ? globalThis.window : null);
  if (windowResizeHandler && win && typeof win.removeEventListener === 'function') {
    win.removeEventListener('resize', windowResizeHandler);
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

export function unmount(target) {
  if (target) {
    const currentDoc = typeof document !== 'undefined' ? document : (globalThis.document || null);
    const root = typeof target === 'string'
      ? (currentDoc && currentDoc.getElementById ? currentDoc.getElementById(target.replace(/^#/, '')) : null)
      : target;
    const inst = root && (root.__nexusInstance || (typeof root === 'object' && mountedInstances.get(root)));
    if (inst && typeof inst.unmount === 'function') {
      inst.unmount();
      clearContainer(root);
      if (root) {
        delete root.__nexus_mounted;
        delete root.__nexusInstance;
      }
      return;
    }
  }
  if (activeAppInstance && typeof activeAppInstance.unmount === 'function') {
    const root = activeAppInstance.root;
    activeAppInstance.unmount();
    if (root) {
      clearContainer(root);
      delete root.__nexus_mounted;
      delete root.__nexusInstance;
    }
  } else {
    teardown();
  }
}

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
 * Starts a real-time price tick update loop for active chart instances.
 *
 * @param {Object} chartInstance
 * @param {number} [intervalMs=1000]
 * @returns {number|null} Timer id
 */
export function startRealtimeUpdates(chartInstance, intervalMs = 1000) {
  if (!chartInstance || typeof setInterval !== 'function') return null;
  const timer = setInterval(() => {
    const data = chartInstance.data;
    if (!data || data.length === 0) return;
    const lastBar = data[data.length - 1];
    const newBar = generateNextCandle(lastBar);
    if (typeof chartInstance.updateData === 'function') {
      chartInstance.updateData(newBar);
    } else {
      updatePriceSeries(chartInstance, [...data.slice(-99), newBar]);
    }
  }, intervalMs);
  if (timer && typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

/**
 * Lifecycle mount function for application integration.
 * Resolves DUPLICATE_COMPONENT_MOUNTING idempotently (STORY 39.2.1),
 * and enforces responsive 100vh flex layout (STORY 40.1.1).
 *
 * @param {HTMLElement|string|null} [mountTarget]
 * @param {Object} [options={}]
 * @returns {Chart}
 */
export function mountApp(mountTarget, options = {}) {
  patchDOMEnvironment();
  const currentDoc = typeof document !== 'undefined' ? document : (globalThis.document || null);

  if (mountTarget === null) {
    throw new Error('Target container (#app) was not found in the DOM: container is null');
  }

  let target = mountTarget;

  if (typeof mountTarget === 'string') {
    const cleanId = mountTarget.replace(/^#/, '');
    target = currentDoc && typeof currentDoc.getElementById === 'function'
      ? currentDoc.getElementById(cleanId)
      : null;
    if (!target) {
      throw new Error(`Target container (#${cleanId}) was not found in the DOM: container is missing`);
    }
  }

  if (!target) {
    target = currentDoc && typeof currentDoc.getElementById === 'function'
      ? currentDoc.getElementById('app')
      : null;
  }

  if (!target) {
    throw new Error('Target container (#app) was not found in the DOM: container is missing or null');
  }

  // Guard against duplicate mounting when target container is already mounted with active layout
  const priorInstance = target.__nexusInstance || (typeof target === 'object' && mountedInstances.get(target));
  if (priorInstance && isContainerMounted(target) && !options.forceRemount) {
    return priorInstance;
  }

  const instance = initApp({
    root: target,
    initialData: options.initialData || generateDefaultData(75),
    overlayType: options.overlayType || 'EMA',
    period: options.period || 20,
    ...options,
  });

  return instance;
}

export const mount = mountApp;
export const mountChart = mountApp;

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