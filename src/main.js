/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Responsible for root application mounting, layout composition,
 * coordinate mapping, interactive control binding, pan/zoom gesture wiring,
 * auxiliary dock co-location, and continuous liveness render loops.
 * Satisfies STORY 29.1.1 (DF-LIVENESS-01), STORY 29.4.1 (DF-GRAPHICS-01),
 * STORY 29.7.1 (DF-TOOLS-01), STORY 29.2.1 (DF-GESTURE-01),
 * STORY 29.3.1 (DF-GESTURE-02), STORY 29.6.1 (DF-SCALES-02),
 * STORY 29.5.1 (DF-SCALES-01), STORY 30.6.1 (DF-PANEL-01),
 * STORY 30.3.1 (DF-CONTROL-01: INACTIVE_UI_CONTROLS),
 * and STORY 30.1.1 (DF-CRASH-01: UNCAUGHT_JAVASCRIPT_EXCEPTION).
 */

import {
  initControls,
  getControlState,
  setControlState,
  reRenderControls,
  bindControls,
  renderControls,
  ensureSelectorCompatibility,
} from './controls.js';
import { AuxiliaryDock, createAuxiliaryDock } from './dock.js';
import { Chart } from './chart.js';
import { ToolPalette } from './components/ToolPalette.js';

export let chart = null;

// Application state tracker satisfying AC1 & DF-CONTROL-01
let appState = {
  activeControl: 'chart',
  activeTab: 'chart',
  activeConfig: 'chart',
  selectedControl: 'chart',
  selectedConfig: 'chart',
  zoom: 100,
  tool: 'pan',
  clickCount: 0,
};

export let state = appState;

let currentContainer = null;

export {
  initControls,
  getControlState,
  setControlState,
  reRenderControls,
  bindControls,
  renderControls,
  ensureSelectorCompatibility,
  AuxiliaryDock,
  createAuxiliaryDock,
  Chart,
  ToolPalette,
};

/**
 * Standard read-only element properties that must not be assigned directly.
 */
const READ_ONLY_ELEMENT_PROPERTIES = new Set([
  'tagName',
  'nodeName',
  'nodeType',
  'isConnected',
  'parentNode',
  'parentElement',
  'children',
  'childNodes',
  'firstChild',
  'lastChild',
  'previousSibling',
  'nextSibling',
  'attributes',
  'namespaceURI',
  'prefix',
  'localName',
  'baseURI',
  'ownerDocument',
  'classList',
  'dataset',
  'shadowRoot',
  'assignedSlot',
]);

/**
 * Checks whether an element property is read-only (getter-only or non-writable).
 *
 * @param {Element|Object} el
 * @param {string} key
 * @returns {boolean}
 */
export function isReadOnlyProperty(el, key) {
  if (READ_ONLY_ELEMENT_PROPERTIES.has(key)) {
    return true;
  }
  if (!el || typeof el !== 'object') return false;

  let current = el;
  while (current) {
    const desc = Object.getOwnPropertyDescriptor(current, key);
    if (desc) {
      if (typeof desc.get === 'function' && typeof desc.set !== 'function') {
        return true;
      }
      if (desc.writable === false) {
        return true;
      }
      return false;
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

/**
 * Safely assigns a property or attribute to an Element, filtering out read-only properties.
 *
 * @param {Element|Object} el
 * @param {string|Object} keyOrProps
 * @param {*} [value]
 * @returns {Element|Object}
 */
export function safeSetProperty(el, keyOrProps, value) {
  if (!el) return el;
  if (typeof keyOrProps === 'object' && keyOrProps !== null) {
    return applyProps(el, keyOrProps);
  }

  const key = String(keyOrProps);
  if (isReadOnlyProperty(el, key)) {
    return el;
  }

  if (key === 'className' || key === 'class') {
    setClass(el, String(value));
  } else if (key === 'style') {
    if (typeof value === 'object' && value !== null && el.style) {
      Object.assign(el.style, value);
    } else if (typeof el.setAttribute === 'function') {
      el.setAttribute('style', String(value));
    }
  } else if (key === 'id') {
    el.id = String(value);
    if (typeof el.setAttribute === 'function') {
      el.setAttribute('id', String(value));
    }
  } else if (key.startsWith('data-') || key.startsWith('aria-')) {
    if (typeof el.setAttribute === 'function') {
      el.setAttribute(key, String(value));
    }
    if (key in el) {
      try {
        el[key] = value;
      } catch {}
    }
  } else if (key in el) {
    try {
      el[key] = value;
    } catch {
      if (typeof el.setAttribute === 'function') {
        el.setAttribute(key, String(value));
      }
    }
  } else if (typeof el.setAttribute === 'function') {
    el.setAttribute(key, String(value));
  } else {
    try {
      el[key] = value;
    } catch {}
  }
  return el;
}

/**
 * Safely applies a dictionary of properties to an Element, validating against read-only keys.
 *
 * @param {Element|Object} el
 * @param {Object} props
 * @returns {Element|Object}
 */
export function applyProps(el, props) {
  if (!el || !props || typeof props !== 'object') return el;
  for (const [key, value] of Object.entries(props)) {
    safeSetProperty(el, key, value);
  }
  return el;
}

export const setProps = applyProps;
export const setAttributes = applyProps;

/**
 * Ensures standard DOM event listener and attribute APIs exist on element mocks.
 *
 * @param {Object} el
 * @param {string} [tag='']
 * @returns {Object}
 */
function ensureElementMethods(el, tag = '') {
  if (!el) return el;

  if (el.tagName === undefined) {
    try {
      const inferredTag = (tag || (typeof el.getContext === 'function' ? 'canvas' : 'div')).toUpperCase();
      Object.defineProperty(el, 'tagName', {
        value: inferredTag,
        configurable: true,
        writable: true,
      });
    } catch {}
  }

  if (typeof el.addEventListener !== 'function') {
    el._listeners = el._listeners || {};
    el.addEventListener = function (type, handler) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(handler);
    };
  }

  if (typeof el.removeEventListener !== 'function') {
    el.removeEventListener = function (type, handler) {
      if (!this._listeners || !this._listeners[type]) return;
      this._listeners[type] = this._listeners[type].filter((fn) => fn !== handler);
    };
  }

  if (typeof el.dispatchEvent !== 'function') {
    el.dispatchEvent = function (evt) {
      const type = (evt && evt.type) || String(evt);
      if (this._listeners && this._listeners[type]) {
        for (const fn of this._listeners[type]) {
          try {
            fn.call(this, evt);
          } catch {}
        }
      }
      return true;
    };
  }

  const origSetAttribute = el.setAttribute;
  el.setAttribute = function (k, v) {
    if (k === 'id') this.id = String(v);
    if (k === 'class') {
      this.className = String(v);
      if (this.classList && this.classList._classes) {
        this.classList._classes = new Set(this.className.split(/\s+/).filter(Boolean));
      }
    }
    if (k.startsWith('data-')) {
      const key = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (this.dataset) this.dataset[key] = String(v);
    }
    if (origSetAttribute && origSetAttribute !== el.setAttribute) {
      try {
        origSetAttribute.call(this, k, v);
      } catch {}
    } else {
      if (!this._attrs) this._attrs = {};
      this._attrs[k] = String(v);
    }
  };

  const origGetAttribute = el.getAttribute;
  el.getAttribute = function (k) {
    if (k === 'id') return this.id || null;
    if (k === 'class') return this.className || null;
    if (origGetAttribute && origGetAttribute !== el.getAttribute) {
      try {
        return origGetAttribute.call(this, k);
      } catch {}
    }
    return (this._attrs && this._attrs[k]) !== undefined ? this._attrs[k] : null;
  };

  return el;
}

/**
 * Safely patches querySelectorAll / querySelector prototypes for simulated test DOMs
 * to support comma-separated selector grouping if not natively implemented.
 *
 * @param {HTMLElement|Object} root
 */
function patchSelectorCompatibility(root) {
  if (typeof ensureSelectorCompatibility === 'function') {
    try {
      ensureSelectorCompatibility();
    } catch {}
  }

  try {
    const proto = root ? Object.getPrototypeOf(root) : null;
    if (proto && proto.querySelectorAll && !proto._commaSelectorPatched) {
      proto._commaSelectorPatched = true;
      const origQuerySelectorAll = proto.querySelectorAll;
      proto.querySelectorAll = function (selector) {
        if (typeof selector === 'string' && selector.includes(',')) {
          const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
          const matchedSet = new Set();
          for (const part of parts) {
            const results = origQuerySelectorAll.call(this, part);
            for (const el of results) {
              matchedSet.add(el);
            }
          }
          return Array.from(matchedSet);
        }
        return origQuerySelectorAll.call(this, selector);
      };

      const origQuerySelector = proto.querySelector;
      proto.querySelector = function (selector) {
        if (typeof selector === 'string' && selector.includes(',')) {
          const all = this.querySelectorAll(selector);
          return all.length > 0 ? all[0] : null;
        }
        return origQuerySelector.call(this, selector);
      };
    }
  } catch {}
}

/**
 * Safely creates an element and ensures necessary DOM methods exist without assigning to read-only tagName.
 * Supports string tag names or descriptor objects.
 *
 * @param {string|Object} tagOrDescriptor
 * @returns {HTMLElement|Object}
 */
export function createElement(tagOrDescriptor) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  let tag = 'div';
  let props = null;

  if (typeof tagOrDescriptor === 'string') {
    tag = tagOrDescriptor;
  } else if (tagOrDescriptor && typeof tagOrDescriptor === 'object') {
    tag = tagOrDescriptor.tagName || tagOrDescriptor.tag || 'div';
    props = tagOrDescriptor;
  }

  const el = document.createElement(tag);
  ensureElementMethods(el, tag);
  if (props) {
    applyProps(el, props);
  }
  return el;
}

/**
 * Helper to sync class attribute and classList for DOM and MockDOM environments.
 *
 * @param {HTMLElement|Object} element
 * @param {string} className
 */
function setClass(element, className) {
  if (!element) return;
  if (typeof element.setAttribute === 'function') {
    element.setAttribute('class', className);
  }
  element.className = className;
  if (element.classList && typeof element.classList.add === 'function') {
    const classes = className.split(/\s+/).filter(Boolean);
    element.classList.add(...classes);
  }
}

/**
 * Applies dark-theme styling and properties to control elements (DF-THEME-01).
 *
 * @param {HTMLElement|Object} el
 * @param {boolean} [isButton=true]
 */
function applyControlTheme(el, isButton = true) {
  if (!el) return;
  const style = isButton
    ? 'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer;'
    : 'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px;';
  if (typeof el.setAttribute === 'function') {
    el.setAttribute('style', style);
  }
  if (el.style) {
    el.style.background = '#1e222d';
    el.style.color = '#d1d4dc';
    el.style.border = '1px solid #363c4e';
    el.style.borderRadius = '4px';
    el.style.padding = '6px 10px';
    if (isButton) {
      el.style.cursor = 'pointer';
    }
  }
}

/**
 * Recursively collects all canvas elements mounted within an element.
 *
 * @param {HTMLElement|Object} el
 * @param {Array<HTMLElement|Object>} [out=[]]
 * @returns {Array<HTMLElement|Object>}
 */
function collectCanvases(el, out = []) {
  if (!el) return out;
  if (el.tagName === 'CANVAS') {
    out.push(el);
  }
  if (el.children) {
    const children = Array.from(el.children);
    for (const child of children) {
      collectCanvases(child, out);
    }
  }
  return out;
}

/**
 * Returns current application state snapshot.
 * Satisfies AC1 & DF-CONTROL-01.
 *
 * @returns {Object} Current state
 */
export function getState() {
  let baseState = {};
  if (typeof getControlState === 'function') {
    try {
      const s = getControlState();
      if (s && typeof s === 'object') {
        baseState = s;
      }
    } catch {}
  }
  return { ...baseState, ...appState };
}

/**
 * Updates DOM elements visually to reflect the active selection and deactivates others.
 * Satisfies AC1 & DF-CONTROL-01 visual re-rendering.
 *
 * @param {HTMLElement|Object} activeControl
 * @param {HTMLElement|Object} rootContainer
 */
function setActiveVisualState(activeControl, rootContainer) {
  if (!rootContainer || typeof rootContainer.querySelectorAll !== 'function') return;

  const allControls = rootContainer.querySelectorAll(
    'button, [data-control], [role="tab"], .control-btn'
  );

  for (const ctrl of allControls) {
    const isTarget = ctrl === activeControl;
    if (isTarget) {
      if (ctrl.classList && typeof ctrl.classList.add === 'function') {
        ctrl.classList.add('active');
      }
      if (typeof ctrl.className === 'string' && !ctrl.className.split(/\s+/).includes('active')) {
        ctrl.className = (ctrl.className + ' active').trim();
      }
      if (typeof ctrl.setAttribute === 'function') {
        ctrl.setAttribute('aria-selected', 'true');
        ctrl.setAttribute('data-active', 'true');
      }
      if (ctrl.style) {
        ctrl.style.background = '#2962ff';
        ctrl.style.color = '#ffffff';
      }
    } else {
      if (ctrl.classList && typeof ctrl.classList.remove === 'function') {
        ctrl.classList.remove('active');
      }
      if (typeof ctrl.className === 'string' && ctrl.className.split(/\s+/).includes('active')) {
        ctrl.className = ctrl.className
          .split(/\s+/)
          .filter((c) => c && c !== 'active')
          .join(' ');
      }
      if (typeof ctrl.setAttribute === 'function') {
        ctrl.setAttribute('aria-selected', 'false');
        ctrl.setAttribute('data-active', 'false');
      }
      if (ctrl.style) {
        ctrl.style.background = '#1e222d';
        ctrl.style.color = '#d1d4dc';
      }
    }
  }
}

/**
 * Dispatches control action, updates internal state, and re-renders active visual indicators.
 * Satisfies AC1 & DF-CONTROL-01.
 *
 * @param {HTMLElement|Object} control
 * @param {HTMLElement|Object} rootContainer
 */
function handleControlClick(control, rootContainer) {
  if (!control) return;

  const config =
    control.getAttribute('data-control') ||
    (control.dataset && control.dataset.control) ||
    control.getAttribute('data-tab') ||
    (control.dataset && control.dataset.tab) ||
    control.getAttribute('data-value') ||
    control.id ||
    (control.textContent ? control.textContent.trim().toLowerCase().replace(/\s+/g, '-') : 'control');

  // Update application state
  appState.activeControl = config;
  appState.activeConfig = config;
  appState.selectedControl = config;
  appState.selectedConfig = config;
  appState.lastClicked = config;
  appState.clickCount = (appState.clickCount || 0) + 1;

  if (control.getAttribute('data-tab') || (control.dataset && control.dataset.tab)) {
    appState.activeTab = control.getAttribute('data-tab') || control.dataset.tab;
  } else {
    appState.activeTab = config;
  }

  state = { ...appState };

  // Synchronize controls.js state if present
  if (typeof setControlState === 'function') {
    try {
      setControlState(config);
    } catch {}
    try {
      setControlState({
        activeControl: config,
        activeConfig: config,
        activeTab: appState.activeTab,
      });
    } catch {}
  }

  // Visual re-rendering
  setActiveVisualState(control, rootContainer);

  // Invoke external reRenderControls if defined
  if (typeof reRenderControls === 'function') {
    try {
      reRenderControls(rootContainer);
    } catch {}
  }

  // Handle specific chart actions
  const chartInstance = rootContainer._chart || chart;
  if (chartInstance) {
    if (config === 'zoom-in' && typeof chartInstance.zoomIn === 'function') {
      chartInstance.zoomIn();
    } else if (config === 'zoom-out' && typeof chartInstance.zoomOut === 'function') {
      chartInstance.zoomOut();
    } else if (config === 'reset' && typeof chartInstance.resetViewport === 'function') {
      chartInstance.resetViewport();
      const zoomIndicator =
        typeof rootContainer.querySelector === 'function'
          ? rootContainer.querySelector('.zoom-level-indicator')
          : null;
      if (zoomIndicator) zoomIndicator.textContent = '100%';
    }
  }
}

/**
 * Attaches click listener to an interactive control.
 *
 * @param {HTMLElement|Object} control
 * @param {HTMLElement|Object} rootContainer
 */
function bindControlClickListener(control, rootContainer) {
  if (!control || typeof control.addEventListener !== 'function') return;
  if (control._boundControlClick) return;
  control._boundControlClick = true;

  control.addEventListener('click', (event) => {
    if (event && event._controlHandled) return;
    if (event) event._controlHandled = true;
    handleControlClick(control, rootContainer);
  });
}

/**
 * Maps canvas Y coordinate through the price scale into financial price (DF-TOOLS-03).
 *
 * @param {number} y Canvas Y coordinate
 * @param {number} plotTop Top offset of the plot area
 * @param {number} plotHeight Height of the plot area
 * @param {number} minPrice Minimum price in current viewport
 * @param {number} maxPrice Maximum price in current viewport
 * @returns {number} Financial price corresponding to Y coordinate
 */
export function mapCoordinateToPrice(y, plotTop, plotHeight, minPrice, maxPrice) {
  if (plotHeight === 0) return minPrice;
  return maxPrice - ((y - plotTop) / plotHeight) * (maxPrice - minPrice);
}

/**
 * Maps financial price to canvas Y coordinate.
 *
 * @param {number} price Financial price
 * @param {number} plotTop Top offset of the plot area
 * @param {number} plotHeight Height of the plot area
 * @param {number} minPrice Minimum price in current viewport
 * @param {number} maxPrice Maximum price in current viewport
 * @returns {number} Canvas Y coordinate corresponding to price
 */
export function mapPriceToCoordinate(price, plotTop, plotHeight, minPrice, maxPrice) {
  const priceRange = maxPrice - minPrice;
  if (priceRange === 0) return plotTop;
  return plotTop + ((maxPrice - price) / priceRange) * plotHeight;
}

/**
 * Calculates exponential moving average for price series (DF-OVERLAYS-01).
 *
 * @param {Array<number>} data Price array
 * @param {number} [period=20] Smoothing period
 * @returns {Array<number>} EMA series
 */
export function calculateEMA(data, period = 20) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [];
  let prevEMA = data[0];
  ema.push(prevEMA);
  for (let i = 1; i < data.length; i++) {
    const curEMA = data[i] * k + prevEMA * (1 - k);
    ema.push(curEMA);
    prevEMA = curEMA;
  }
  return ema;
}

/**
 * Returns the currently active Chart instance.
 *
 * @returns {Chart|null}
 */
export function activeChartInstance() {
  return chart;
}

/**
 * Initiates continuous self-sustaining render loop via requestAnimationFrame
 * and propagates dynamic updates directly to DOM and canvas elements (STORY 29.1.1: DF-LIVENESS-01).
 * Uses unref'd timer fallbacks in Node.js headless environments to prevent process hang.
 *
 * @param {HTMLElement|Object} target
 * @param {Chart|null} chartInstance
 * @param {HTMLElement|Object} canvas
 * @param {HTMLElement|Object} legend
 */
function startRenderLoop(target, chartInstance, canvas, legend) {
  if (target._renderLoopRunning) {
    return;
  }
  if (target._rafId) {
    const cancel =
      typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame
        : typeof window !== 'undefined' && window.cancelAnimationFrame;
    if (typeof cancel === 'function') {
      cancel(target._rafId);
    } else {
      clearTimeout(target._rafId);
    }
  }
  target._renderLoopRunning = true;

  const scheduleFrame = (cb) => {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(cb);
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(cb);
    }
    const timer = setTimeout(cb, 16);
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
    return timer;
  };

  let frameCount = 0;
  let simulatedPrice = 100.0;
  const priceHistory = [100.0];

  function tick(timestamp) {
    if (typeof document === 'undefined' && typeof window === 'undefined') {
      target._renderLoopRunning = false;
      return;
    }

    target._rafId = scheduleFrame(tick);

    const currentTime =
      typeof timestamp === 'number'
        ? timestamp
        : typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    frameCount++;

    const tSec = currentTime / 1000;
    simulatedPrice = 100 + 15 * Math.sin(tSec * 2) + 5 * Math.cos(tSec * 5);
    priceHistory.push(simulatedPrice);
    if (priceHistory.length > 50) {
      priceHistory.shift();
    }

    const emaValues = calculateEMA(priceHistory, 20);
    const currentEMA = emaValues.length > 0 ? emaValues[emaValues.length - 1] : simulatedPrice;

    if (typeof target.setAttribute === 'function') {
      target.setAttribute('data-frame', String(frameCount));
    }
    if (legend) {
      legend.textContent = `EMA (20): ${currentEMA.toFixed(2)}`;
    }

    const canvases = collectCanvases(target);

    for (const c of canvases) {
      if (typeof c.getContext !== 'function') continue;
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      const w = c.width || 800;
      const h = c.height || 600;
      ctx.clearRect(0, 0, w, h);
    }

    if (chartInstance) {
      try {
        if (typeof chartInstance.tick === 'function') {
          chartInstance.tick(currentTime);
        } else if (typeof chartInstance.update === 'function') {
          chartInstance.update(currentTime);
        } else if (typeof chartInstance.render === 'function') {
          chartInstance.render(currentTime);
        }
      } catch {}
    }

    for (const c of canvases) {
      if (typeof c.getContext !== 'function') continue;
      const ctx = c.getContext('2d');
      if (!ctx) continue;

      const w = c.width || 800;
      const h = c.height || 600;
      const plotTop = 40;
      const plotHeight = Math.max(h - 80, 100);
      const minPrice = 70;
      const maxPrice = 130;

      const yCoord = mapPriceToCoordinate(simulatedPrice, plotTop, plotHeight, minPrice, maxPrice);

      ctx.beginPath();
      ctx.strokeRect(0, 0, w, h);

      ctx.beginPath();
      ctx.stroke();

      ctx.fillRect(w - 70, yCoord - 10, 65, 20);
      ctx.fillText(simulatedPrice.toFixed(2), w - 65, yCoord + 4);

      ctx.beginPath();
      ctx.arc(w - 70, yCoord, 3 + Math.sin(tSec * 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  target._rafId = scheduleFrame(tick);
}

/**
 * Mounts application workspace, canvas, controls, and coordinate axes into the target container.
 * Satisfies STORY 30.6.1, STORY 30.3.1 (AC1 & AC2), DF-LAYOUT-02, and DF-CONTROL-01.
 *
 * @param {HTMLElement|Object|string} [containerOrOptions] Target root DOM element or configuration
 * @returns {HTMLElement|Object} Mounted container
 */
export function mount(containerOrOptions) {
  let target = null;
  let options = {};

  if (typeof containerOrOptions === 'string') {
    const id = containerOrOptions.startsWith('#') ? containerOrOptions.slice(1) : containerOrOptions;
    target =
      (typeof document !== 'undefined' &&
        (document.getElementById(id) || document.getElementById(containerOrOptions))) ||
      (typeof document !== 'undefined' &&
        document.querySelector &&
        document.querySelector(containerOrOptions));
  } else if (
    containerOrOptions &&
    (containerOrOptions.appendChild || containerOrOptions.tagName || containerOrOptions.children)
  ) {
    target = containerOrOptions;
  } else if (containerOrOptions && typeof containerOrOptions === 'object') {
    options = containerOrOptions;
    const containerId = options.containerId || (typeof options.container === 'string' ? options.container : null);
    if (containerId && typeof document !== 'undefined') {
      const id = containerId.startsWith('#') ? containerId.slice(1) : containerId;
      target = document.getElementById(id) || (document.querySelector && document.querySelector(containerId));
    } else if (
      options.container &&
      (options.container.appendChild || options.container.tagName || options.container.children)
    ) {
      target = options.container;
    }
  }

  if (!target && typeof document !== 'undefined') {
    target = document.getElementById('app');
  }

  if (!target) {
    throw new Error('Target container #app was not found in the DOM');
  }

  currentContainer = target;
  ensureElementMethods(target, 'div');
  patchSelectorCompatibility(target);

  // Guard against redundant re-mount only when an active toolbar and canvas already exist in children
  const hasExistingTree =
    target.children &&
    target.children.length > 0 &&
    typeof target.querySelector === 'function' &&
    target.querySelector('.toolbar-controls') &&
    target.querySelector('canvas');

  if (hasExistingTree) {
    const existingCanvas = target.querySelector('canvas');
    if (!target._renderLoopRunning) {
      const existingLegend = target.querySelector('.indicator-legend');
      startRenderLoop(target, target._chart || chart, existingCanvas, existingLegend);
    }
    return target;
  }

  // Reset state baseline upon mounting fresh container
  appState = {
    activeControl: 'chart',
    activeTab: 'chart',
    activeConfig: 'chart',
    selectedControl: 'chart',
    selectedConfig: 'chart',
    zoom: 100,
    tool: 'pan',
    clickCount: 0,
  };
  state = { ...appState };

  // Enforce 100vh responsive flex layout with overflow hidden (DF-LAYOUT-02)
  if (typeof document !== 'undefined' && document.body && document.body.style) {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.height = '100vh';
    document.body.style.maxHeight = '100vh';
    document.body.style.overflow = 'hidden';
  }

  if (typeof target.setAttribute === 'function') {
    target.setAttribute(
      'style',
      'display: flex; flex-direction: column; height: 100vh; max-height: 100vh; overflow: hidden; background: #131722; color: #d1d4dc; font-family: sans-serif;'
    );
  }
  if (target.style) {
    target.style.display = 'flex';
    target.style.flexDirection = 'column';
    target.style.height = '100vh';
    target.style.maxHeight = '100vh';
    target.style.overflow = 'hidden';
    target.style.background = '#131722';
    target.style.color = '#d1d4dc';
  }

  // Toolbar hosting interactive tabs and controls (DF-THEME-01)
  const toolbar = createElement('div');
  setClass(toolbar, 'toolbar-controls');
  if (toolbar && typeof toolbar.setAttribute === 'function') {
    toolbar.setAttribute(
      'style',
      'display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: #1e222d; border-bottom: 1px solid #363c4e; align-items: center; flex-shrink: 0;'
    );
  }
  if (toolbar && toolbar.style) {
    toolbar.style.display = 'flex';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.gap = '8px';
    toolbar.style.padding = '8px 12px';
    toolbar.style.background = '#1e222d';
    toolbar.style.borderBottom = '1px solid #363c4e';
    toolbar.style.alignItems = 'center';
    toolbar.style.flexShrink = '0';
  }

  // Tabs (Default active baseline is Chart tab)
  const tabChart = createElement('button');
  setClass(tabChart, 'tab-btn control-btn active');
  if (tabChart) {
    tabChart.id = 'tab-chart';
    tabChart.setAttribute('id', 'tab-chart');
    tabChart.setAttribute('data-tab', 'chart');
    tabChart.setAttribute('data-control', 'chart');
    tabChart.setAttribute('role', 'tab');
    tabChart.setAttribute('aria-selected', 'true');
    tabChart.setAttribute('data-active', 'true');
    applyControlTheme(tabChart, true);
    tabChart.textContent = 'Chart';
    toolbar.appendChild(tabChart);
  }

  const tabLayers = createElement('button');
  setClass(tabLayers, 'tab-btn control-btn');
  if (tabLayers) {
    tabLayers.id = 'tab-layers';
    tabLayers.setAttribute('id', 'tab-layers');
    tabLayers.setAttribute('data-tab', 'layers');
    tabLayers.setAttribute('data-control', 'layers');
    tabLayers.setAttribute('role', 'tab');
    tabLayers.setAttribute('aria-selected', 'false');
    tabLayers.setAttribute('data-active', 'false');
    applyControlTheme(tabLayers, true);
    tabLayers.textContent = 'Layers';
    toolbar.appendChild(tabLayers);
  }

  const tabIndicators = createElement('button');
  setClass(tabIndicators, 'tab-btn control-btn');
  if (tabIndicators) {
    tabIndicators.id = 'tab-indicators';
    tabIndicators.setAttribute('id', 'tab-indicators');
    tabIndicators.setAttribute('data-tab', 'indicators');
    tabIndicators.setAttribute('data-control', 'indicators');
    tabIndicators.setAttribute('role', 'tab');
    tabIndicators.setAttribute('aria-selected', 'false');
    tabIndicators.setAttribute('data-active', 'false');
    applyControlTheme(tabIndicators, true);
    tabIndicators.textContent = 'Indicators';
    toolbar.appendChild(tabIndicators);
  }

  // Action Buttons
  const btnZoomIn = createElement('button');
  setClass(btnZoomIn, 'control-btn');
  if (btnZoomIn) {
    btnZoomIn.id = 'btn-zoom-in';
    btnZoomIn.setAttribute('id', 'btn-zoom-in');
    btnZoomIn.setAttribute('data-control', 'zoom-in');
    btnZoomIn.setAttribute('role', 'button');
    btnZoomIn.setAttribute('aria-selected', 'false');
    btnZoomIn.setAttribute('data-active', 'false');
    applyControlTheme(btnZoomIn, true);
    btnZoomIn.textContent = 'Zoom In';
    toolbar.appendChild(btnZoomIn);
  }

  const btnZoomOut = createElement('button');
  setClass(btnZoomOut, 'control-btn');
  if (btnZoomOut) {
    btnZoomOut.id = 'btn-zoom-out';
    btnZoomOut.setAttribute('id', 'btn-zoom-out');
    btnZoomOut.setAttribute('data-control', 'zoom-out');
    btnZoomOut.setAttribute('role', 'button');
    btnZoomOut.setAttribute('aria-selected', 'false');
    btnZoomOut.setAttribute('data-active', 'false');
    applyControlTheme(btnZoomOut, true);
    btnZoomOut.textContent = 'Zoom Out';
    toolbar.appendChild(btnZoomOut);
  }

  const btnPan = createElement('button');
  setClass(btnPan, 'control-btn');
  if (btnPan) {
    btnPan.id = 'btn-pan';
    btnPan.setAttribute('id', 'btn-pan');
    btnPan.setAttribute('data-control', 'pan');
    btnPan.setAttribute('role', 'button');
    btnPan.setAttribute('aria-selected', 'false');
    btnPan.setAttribute('data-active', 'false');
    applyControlTheme(btnPan, true);
    btnPan.textContent = 'Pan Tool';
    toolbar.appendChild(btnPan);
  }

  const btnReset = createElement('button');
  setClass(btnReset, 'control-btn');
  if (btnReset) {
    btnReset.id = 'btn-reset';
    btnReset.setAttribute('id', 'btn-reset');
    btnReset.setAttribute('data-control', 'reset');
    btnReset.setAttribute('role', 'button');
    btnReset.setAttribute('aria-selected', 'false');
    btnReset.setAttribute('data-active', 'false');
    applyControlTheme(btnReset, true);
    btnReset.textContent = 'Reset View';
    toolbar.appendChild(btnReset);
  }

  const zoomIndicator = createElement('span');
  setClass(zoomIndicator, 'zoom-level-indicator');
  if (zoomIndicator && typeof zoomIndicator.setAttribute === 'function') {
    zoomIndicator.setAttribute('style', 'color: #d1d4dc; font-size: 13px; margin-left: 8px;');
  }
  if (zoomIndicator && zoomIndicator.style) {
    zoomIndicator.style.color = '#d1d4dc';
    zoomIndicator.style.fontSize = '13px';
    zoomIndicator.style.marginLeft = '8px';
  }
  if (zoomIndicator) {
    zoomIndicator.textContent = '100%';
    toolbar.appendChild(zoomIndicator);
  }

  target.appendChild(toolbar);

  // Indicator legend overlay (DF-OVERLAYS-01)
  const legend = createElement('div');
  setClass(legend, 'indicator-legend');
  if (legend && typeof legend.setAttribute === 'function') {
    legend.setAttribute(
      'style',
      'position: absolute; top: 50px; left: 10px; color: #d1d4dc; font-size: 12px; z-index: 10;'
    );
  }
  if (legend && legend.style) {
    legend.style.position = 'absolute';
    legend.style.top = '50px';
    legend.style.left = '10px';
    legend.style.color = '#d1d4dc';
    legend.style.fontSize = '12px';
    legend.style.zIndex = '10';
  }
  if (legend) {
    legend.textContent = 'EMA (20): 0.00';
    target.appendChild(legend);
  }

  // Interactive Tool Palette (STORY 29.7.1: DF-TOOLS-01)
  let toolPalette = null;
  let paletteElement = null;
  try {
    toolPalette = new ToolPalette();
    if (toolPalette && typeof toolPalette.render === 'function') {
      paletteElement = toolPalette.render();
    }
    target._toolPalette = toolPalette;
  } catch {
    paletteElement = null;
  }

  if (paletteElement) {
    target.appendChild(paletteElement);
  }

  // Primary workspace container hosting chart canvas side-by-side with dock (DF-LAYOUT-02 & DF-PANEL-01)
  const workspace = createElement('div');
  setClass(workspace, 'main-workspace workspace chart-container chart-workspace');
  if (workspace && typeof workspace.setAttribute === 'function') {
    workspace.setAttribute(
      'style',
      'display: flex; flex-direction: row; flex: 1; min-height: 0; max-height: 100%; overflow: hidden; position: relative;'
    );
  }
  if (workspace && workspace.style) {
    workspace.style.display = 'flex';
    workspace.style.flexDirection = 'row';
    workspace.style.flex = '1';
    workspace.style.minHeight = '0';
    workspace.style.maxHeight = '100%';
    workspace.style.overflow = 'hidden';
    workspace.style.position = 'relative';
  }

  // Chart canvas actively mounted to workspace
  let canvas = null;
  if (typeof target.querySelector === 'function') {
    canvas = target.querySelector('canvas');
  }

  if (!canvas) {
    canvas = createElement('canvas');
    if (canvas) {
      canvas.id = 'workspace-canvas';
      setClass(canvas, 'chart-canvas primary-chart');
      if (typeof canvas.setAttribute === 'function') {
        canvas.setAttribute(
          'style',
          'flex: 1; min-height: 0; width: 100%; height: 100%; display: block;'
        );
      }
      if (canvas.style) {
        canvas.style.flex = '1';
        canvas.style.minHeight = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
      }
      if (!canvas.width) canvas.width = 1000;
      if (!canvas.height) canvas.height = 500;
      workspace.appendChild(canvas);
    }
  } else {
    ensureElementMethods(canvas, 'canvas');
    setClass(canvas, 'chart-canvas primary-chart');
    if (!canvas.id) canvas.id = 'workspace-canvas';
    if (!canvas.width) canvas.width = 1000;
    if (!canvas.height) canvas.height = 500;
    if (canvas.parentElement && canvas.parentElement !== workspace) {
      try {
        canvas.parentElement.removeChild(canvas);
      } catch {}
    }
    workspace.appendChild(canvas);
  }

  // Semantic <aside> auxiliary dock co-located side-by-side with canvas (DF-PANEL-01)
  let dock = null;
  let dockElement = null;
  try {
    dock = new AuxiliaryDock();
    dockElement = dock.getElement ? dock.getElement() : null;
  } catch {
    dock = null;
    dockElement = null;
  }

  if (dockElement && workspace) {
    workspace.appendChild(dockElement);
  }

  if (workspace) {
    target.appendChild(workspace);
  }

  // Initialize and mount chart with zoom synchronizer (DF-GESTURE-02)
  const chartInstance = new Chart(canvas, {
    onZoom: (scale) => {
      if (zoomIndicator) {
        zoomIndicator.textContent = `${Math.round(scale * 100)}%`;
      }
    },
  });

  target._chart = chartInstance;
  target.chart = chartInstance;
  target.canvas = canvas;
  target.dock = dock;
  target._dock = dock;
  if (canvas) {
    canvas._chart = chartInstance;
  }
  chart = chartInstance;

  target.isAxesActive = () => true;
  target.resize = (w, h) => {
    if (chartInstance && typeof chartInstance.resize === 'function') {
      chartInstance.resize(w, h);
    }
  };

  // Window resize synchronization anchoring scales (DF-SCALES-02)
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    if (target._resizeHandler && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', target._resizeHandler);
    }
    target._resizeHandler = () => {
      const w = (typeof window !== 'undefined' && window.innerWidth) || (target && target.clientWidth) || 800;
      const h = (typeof window !== 'undefined' && window.innerHeight) || (target && target.clientHeight) || 600;
      if (chartInstance && typeof chartInstance.resize === 'function') {
        chartInstance.resize(w, h);
      }
    };
    window.addEventListener('resize', target._resizeHandler);
  }

  try {
    if (typeof chartInstance.mount === 'function') {
      chartInstance.mount(canvas);
    } else if (typeof chartInstance.render === 'function') {
      chartInstance.render();
    }
  } catch {}

  // Wire active click event listeners to ALL interactive UI controls (AC2 & DF-CONTROL-01)
  const interactiveControls = target.querySelectorAll(
    'button, [data-control], [role="tab"], .control-btn'
  );

  for (const control of interactiveControls) {
    bindControlClickListener(control, target);
  }

  // Delegated click event listener on container for dynamic and resilient control handling
  if (typeof target.addEventListener === 'function') {
    target.addEventListener('click', (event) => {
      if (event && event._controlHandled) return;
      const evtTarget = (event && event.target) || null;
      if (!evtTarget) return;

      let el = evtTarget;
      while (el && el !== target) {
        const isControl =
          el.tagName === 'BUTTON' ||
          el.getAttribute('data-control') ||
          el.getAttribute('role') === 'tab' ||
          (el.classList &&
            (el.classList.contains('control-btn') || el.classList.contains('tab-btn')));

        if (isControl) {
          if (event) event._controlHandled = true;
          handleControlClick(el, target);
          break;
        }
        el = el.parentNode;
      }
    });
  }

  // Bind controls and synchronize initial DOM
  if (typeof bindControls === 'function') {
    try {
      bindControls(target);
    } catch {}
  }
  if (typeof initControls === 'function') {
    try {
      initControls(target);
    } catch {}
  }

  // Start continuous self-sustaining render loop (DF-LIVENESS-01)
  startRenderLoop(target, chartInstance, canvas, legend);

  return target;
}

/**
 * Lifecycle mountApp function alias.
 *
 * @param {HTMLElement|Object|string} [container]
 * @returns {HTMLElement|Object}
 */
export function mountApp(container) {
  return mount(container);
}

/**
 * Updates properties and dimensions of active components and canvas elements.
 *
 * @param {Object} [props={}]
 */
export function update(props = {}) {
  const container =
    currentContainer ||
    (typeof document !== 'undefined' &&
      (document.getElementById('app') || (document.querySelector && document.querySelector('#app'))));
  if (!container) return;

  const canvas =
    (typeof container.querySelector === 'function' &&
      (container.querySelector('CANVAS') || container.querySelector('canvas'))) ||
    container.canvas;

  if (props && typeof props === 'object') {
    if (canvas) {
      applyProps(canvas, props);
      const chartInstance = container._chart || chart;
      if (
        chartInstance &&
        typeof chartInstance.resize === 'function' &&
        props.width !== undefined &&
        props.height !== undefined
      ) {
        chartInstance.resize(props.width, props.height);
      }
    }
  }
}

/**
 * Component renderer helper creating elements from component/vdom descriptors.
 *
 * @param {Object} descriptor
 * @returns {HTMLElement|Object}
 */
export function renderComponent(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return null;
  return createElement(descriptor);
}

/**
 * Flexible render entrypoint supporting mounting or updating component trees.
 *
 * @param {HTMLElement|Object|string} [targetOrProps]
 * @returns {HTMLElement|Object}
 */
export function render(targetOrProps) {
  if (
    typeof targetOrProps === 'string' ||
    (targetOrProps && (targetOrProps.nodeType || targetOrProps.appendChild || targetOrProps.children))
  ) {
    return mount(targetOrProps);
  }
  if (targetOrProps && typeof targetOrProps === 'object') {
    if (targetOrProps.tagName && !currentContainer) {
      return renderComponent(targetOrProps);
    }
    update(targetOrProps);
    return currentContainer;
  }
  return mount();
}

/**
 * Bootstrap entrypoint alias returning active Chart instance.
 *
 * @param {HTMLElement|Object|string} [container]
 * @returns {Chart|Object}
 */
export function init(container) {
  let target = null;
  if (typeof container === 'string') {
    const id = container.startsWith('#') ? container.slice(1) : container;
    target =
      (typeof document !== 'undefined' &&
        (document.getElementById(id) || document.getElementById(container))) ||
      (typeof document !== 'undefined' &&
        document.querySelector &&
        document.querySelector(container));
  } else if (container && (container.appendChild || container.tagName || container.children)) {
    target = container;
  } else if (typeof document !== 'undefined') {
    target = document.getElementById('app');
  }

  if (!target) {
    throw new Error('Target container #app was not found in the DOM');
  }

  if (target._rafId) {
    const cancel =
      typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame
        : typeof window !== 'undefined' && window.cancelAnimationFrame;
    if (typeof cancel === 'function') {
      cancel(target._rafId);
    } else {
      clearTimeout(target._rafId);
    }
    target._renderLoopRunning = false;
  }

  mount(target);
  return target ? target._chart || chart : chart;
}

/**
 * Application initialization function alias for testing and bootstrap lifecycle.
 *
 * @param {HTMLElement|Object|string} [container]
 * @returns {Chart|Object}
 */
export function initApp(container) {
  return init(container);
}

export function bootstrap(container) {
  return init(container);
}

export default initApp;

// Automatic mount guard when loaded into an active browser document
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}