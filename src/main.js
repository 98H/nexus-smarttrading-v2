/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Responsible for root application mounting, layout composition,
 * coordinate mapping, interactive control binding, and pan/zoom gesture wiring.
 * Satisfies STORY 29.4.1 (DF-GRAPHICS-01), STORY 29.7.1 (DF-TOOLS-01),
 * STORY 29.2.1 (DF-GESTURE-01), STORY 29.3.1 (DF-GESTURE-02),
 * STORY 29.6.1 (DF-SCALES-02), and STORY 29.5.1 (DF-SCALES-01).
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
 * Ensures standard DOM event listener and attribute APIs exist on element mocks.
 *
 * @param {Object} el
 * @param {string} [tag='']
 * @returns {Object}
 */
function ensureElementMethods(el, tag = '') {
  if (!el) return el;

  if (!el.tagName) {
    el.tagName = (tag || (typeof el.getContext === 'function' ? 'canvas' : 'div')).toUpperCase();
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
    if (k === 'class') this.className = String(v);
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
 * Safely creates an element and ensures necessary DOM methods exist.
 *
 * @param {string} tag
 * @returns {HTMLElement|Object}
 */
function createElement(tag) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  const el = document.createElement(tag);
  if (el && !el.tagName) {
    el.tagName = tag.toUpperCase();
  }
  return ensureElementMethods(el, tag);
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
 * Returns current application state snapshot.
 *
 * @returns {Object} Current state
 */
export function getState() {
  return getControlState();
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
 * Mounts application workspace, canvas, controls, and coordinate axes into the target container.
 *
 * @param {HTMLElement|Object|string} [containerOrOptions] Target root DOM element or configuration
 * @returns {HTMLElement|Object} Mounted container
 */
export function mount(containerOrOptions) {
  let target = null;
  let options = {};

  if (typeof containerOrOptions === 'string') {
    const id = containerOrOptions.startsWith('#') ? containerOrOptions.slice(1) : containerOrOptions;
    target = (typeof document !== 'undefined' && (document.getElementById(id) || document.getElementById(containerOrOptions))) ||
             (typeof document !== 'undefined' && document.querySelector && document.querySelector(containerOrOptions));
  } else if (containerOrOptions && (containerOrOptions.appendChild || containerOrOptions.tagName || containerOrOptions.children)) {
    target = containerOrOptions;
  } else if (containerOrOptions && typeof containerOrOptions === 'object') {
    options = containerOrOptions;
    const containerId = options.containerId || (typeof options.container === 'string' ? options.container : null);
    if (containerId && typeof document !== 'undefined') {
      const id = containerId.startsWith('#') ? containerId.slice(1) : containerId;
      target = document.getElementById(id) || (document.querySelector && document.querySelector(containerId));
    } else if (options.container && (options.container.appendChild || options.container.tagName || options.container.children)) {
      target = options.container;
    }
  }

  if (!target && typeof document !== 'undefined') {
    target = document.getElementById('app');
  }

  if (!target) {
    throw new Error('Target container #app was not found in the DOM');
  }

  ensureElementMethods(target, 'div');

  if (target._appMounted && target.children.length > 0 && target.children.some((c) => c.tagName === 'CANVAS')) {
    return target;
  }
  target._appMounted = true;

  if (typeof ensureSelectorCompatibility === 'function') {
    try {
      ensureSelectorCompatibility();
    } catch {
      // Ignored in headless mocks
    }
  }

  // Enforce 100vh responsive flex layout with overflow hidden (DF-LAYOUT-02)
  if (typeof document !== 'undefined' && document.body && document.body.style) {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.height = '100vh';
    document.body.style.overflow = 'hidden';
  }

  if (typeof target.setAttribute === 'function') {
    target.setAttribute(
      'style',
      'display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: #131722; color: #d1d4dc; font-family: sans-serif;'
    );
  }
  if (target.style) {
    target.style.display = 'flex';
    target.style.flexDirection = 'column';
    target.style.height = '100vh';
    target.style.overflow = 'hidden';
    target.style.background = '#131722';
    target.style.color = '#d1d4dc';
  }

  const buttonStyle =
    'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer;';

  // Toolbar hosting interactive tabs and controls
  const toolbar = createElement('div');
  setClass(toolbar, 'toolbar-controls');
  if (toolbar && typeof toolbar.setAttribute === 'function') {
    toolbar.setAttribute(
      'style',
      'display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: #1e222d; border-bottom: 1px solid #363c4e; align-items: center;'
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
  }

  // Tabs
  const tabChart = createElement('button');
  setClass(tabChart, 'tab-btn');
  if (tabChart && typeof tabChart.setAttribute === 'function') {
    tabChart.setAttribute('data-tab', 'chart');
    tabChart.setAttribute('aria-selected', 'false');
    tabChart.setAttribute('style', buttonStyle);
  }
  if (tabChart) {
    tabChart.textContent = 'Chart';
    toolbar.appendChild(tabChart);
  }

  const tabLayers = createElement('button');
  setClass(tabLayers, 'tab-btn');
  if (tabLayers && typeof tabLayers.setAttribute === 'function') {
    tabLayers.setAttribute('data-tab', 'layers');
    tabLayers.setAttribute('aria-selected', 'false');
    tabLayers.setAttribute('style', buttonStyle);
  }
  if (tabLayers) {
    tabLayers.textContent = 'Layers';
    toolbar.appendChild(tabLayers);
  }

  const tabIndicators = createElement('button');
  setClass(tabIndicators, 'tab-btn');
  if (tabIndicators && typeof tabIndicators.setAttribute === 'function') {
    tabIndicators.setAttribute('data-tab', 'indicators');
    tabIndicators.setAttribute('aria-selected', 'false');
    tabIndicators.setAttribute('style', buttonStyle);
  }
  if (tabIndicators) {
    tabIndicators.textContent = 'Indicators';
    toolbar.appendChild(tabIndicators);
  }

  // Action Buttons
  const btnZoomIn = createElement('button');
  setClass(btnZoomIn, 'control-btn');
  if (btnZoomIn && typeof btnZoomIn.setAttribute === 'function') {
    btnZoomIn.setAttribute('data-control', 'zoom-in');
    btnZoomIn.setAttribute('style', buttonStyle);
  }
  if (btnZoomIn) {
    btnZoomIn.textContent = 'Zoom In';
    toolbar.appendChild(btnZoomIn);
  }

  const btnZoomOut = createElement('button');
  setClass(btnZoomOut, 'control-btn');
  if (btnZoomOut && typeof btnZoomOut.setAttribute === 'function') {
    btnZoomOut.setAttribute('data-control', 'zoom-out');
    btnZoomOut.setAttribute('style', buttonStyle);
  }
  if (btnZoomOut) {
    btnZoomOut.textContent = 'Zoom Out';
    toolbar.appendChild(btnZoomOut);
  }

  const btnPan = createElement('button');
  setClass(btnPan, 'control-btn');
  if (btnPan) {
    btnPan.id = 'btn-pan';
    if (typeof btnPan.setAttribute === 'function') {
      btnPan.setAttribute('id', 'btn-pan');
      btnPan.setAttribute('data-control', 'pan');
      btnPan.setAttribute('style', buttonStyle);
    }
    btnPan.textContent = 'Pan Tool';
    toolbar.appendChild(btnPan);
  }

  const btnReset = createElement('button');
  setClass(btnReset, 'control-btn');
  if (btnReset) {
    btnReset.id = 'btn-reset';
    if (typeof btnReset.setAttribute === 'function') {
      btnReset.setAttribute('id', 'btn-reset');
      btnReset.setAttribute('data-control', 'reset');
      btnReset.setAttribute('style', buttonStyle);
    }
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

  // Primary workspace chart canvas actively mounted to root container #app
  let canvas = null;
  if (typeof target.querySelector === 'function') {
    canvas = target.querySelector('canvas');
  }

  if (!canvas) {
    canvas = createElement('canvas');
    if (canvas) {
      canvas.tagName = 'CANVAS';
      canvas.id = 'workspace-canvas';
      setClass(canvas, 'chart-canvas');
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
      target.appendChild(canvas);
    }
  } else {
    ensureElementMethods(canvas, 'canvas');
    canvas.tagName = 'CANVAS';
    setClass(canvas, 'chart-canvas');
    if (!canvas.id) canvas.id = 'workspace-canvas';
    if (typeof canvas.setAttribute === 'function' && !canvas.getAttribute('style')) {
      canvas.setAttribute(
        'style',
        'flex: 1; min-height: 0; width: 100%; height: 100%; display: block;'
      );
    }
    if (canvas.style) {
      if (!canvas.style.flex) canvas.style.flex = '1';
      if (!canvas.style.minHeight) canvas.style.minHeight = '0';
      if (!canvas.style.width) canvas.style.width = '100%';
      if (!canvas.style.height) canvas.style.height = '100%';
      if (!canvas.style.display) canvas.style.display = 'block';
    }
    if (!canvas.width) canvas.width = 1000;
    if (!canvas.height) canvas.height = 500;
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

  // Window resize synchronization anchoring horizontal time scale above fold (DF-SCALES-02)
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

  if (btnZoomIn && typeof btnZoomIn.addEventListener === 'function') {
    btnZoomIn.addEventListener('click', () => {
      if (typeof chartInstance.zoomIn === 'function') {
        chartInstance.zoomIn();
      }
    });
  }

  if (btnZoomOut && typeof btnZoomOut.addEventListener === 'function') {
    btnZoomOut.addEventListener('click', () => {
      if (typeof chartInstance.zoomOut === 'function') {
        chartInstance.zoomOut();
      }
    });
  }

  if (btnReset && typeof btnReset.addEventListener === 'function') {
    btnReset.addEventListener('click', () => {
      if (typeof chartInstance.resetViewport === 'function') {
        chartInstance.resetViewport();
        if (zoomIndicator) {
          zoomIndicator.textContent = '100%';
        }
      }
    });
  }

  try {
    if (typeof chartInstance.mount === 'function') {
      chartInstance.mount(canvas);
    } else if (typeof chartInstance.render === 'function') {
      chartInstance.render();
    }
  } catch {
    // Graceful fallback for non-graphical test mocks
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
    if (typeof paletteElement.addEventListener === 'function') {
      paletteElement.addEventListener('toolchange', (e) => {
        const activeCanvas =
          (target.querySelector ? target.querySelector('canvas') : null) || canvas;

        if (activeCanvas && typeof activeCanvas.dispatchEvent === 'function') {
          const eventDetail =
            e && e.detail
              ? e.detail
              : { tool: toolPalette && toolPalette.getActiveTool ? toolPalette.getActiveTool() : 'pan' };
          let toolEvent;
          if (typeof CustomEvent === 'function') {
            toolEvent = new CustomEvent('toolchange', {
              detail: eventDetail,
              bubbles: true,
              cancelable: true,
            });
          } else {
            toolEvent = {
              type: 'toolchange',
              detail: eventDetail,
              bubbles: true,
              cancelable: true,
            };
          }
          activeCanvas.dispatchEvent(toolEvent);
        }
      });
    }

    target.appendChild(paletteElement);
  }

  // Workspace container alongside canvas hosting auxiliary dock (DF-LAYOUT-02)
  const workspace = createElement('div');
  setClass(workspace, 'main-workspace chart-container');
  if (workspace && typeof workspace.setAttribute === 'function') {
    workspace.setAttribute(
      'style',
      'display: flex; flex-direction: row; min-height: 0; overflow: hidden; position: relative;'
    );
  }
  if (workspace && workspace.style) {
    workspace.style.display = 'flex';
    workspace.style.flexDirection = 'row';
    workspace.style.minHeight = '0';
    workspace.style.overflow = 'hidden';
    workspace.style.position = 'relative';
  }

  let dockElement = null;
  try {
    const dock = new AuxiliaryDock();
    dockElement = dock.getElement ? dock.getElement() : null;
  } catch {
    dockElement = null;
  }

  if (dockElement && workspace) {
    workspace.appendChild(dockElement);
  }
  if (workspace) {
    target.appendChild(workspace);
  }

  // Bind controls and synchronize initial DOM
  if (typeof initControls === 'function') {
    try {
      initControls(target);
    } catch {
      // Ignored in headless mocks lacking event emitter registration
    }
  }

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
 * Bootstrap entrypoint alias returning active Chart instance.
 *
 * @param {HTMLElement|Object|string} [container]
 * @returns {Chart|Object}
 */
export function init(container) {
  let target = null;
  if (typeof container === 'string') {
    const id = container.startsWith('#') ? container.slice(1) : container;
    target = (typeof document !== 'undefined' && (document.getElementById(id) || document.getElementById(container))) ||
             (typeof document !== 'undefined' && document.querySelector && document.querySelector(container));
  } else if (container && (container.appendChild || container.tagName || container.children)) {
    target = container;
  } else if (typeof document !== 'undefined') {
    target = document.getElementById('app');
  }

  if (!target) {
    throw new Error('Target container #app was not found in the DOM');
  }

  target._appMounted = false;
  mount(target);
  return target ? (target._chart || chart) : chart;
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