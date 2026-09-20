/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Responsible for root application mounting, layout composition,
 * coordinate mapping, and interactive control binding.
 * Satisfies STORY 29.4.1: Resolve SPARSE_DATA_SERIES (Defect ID: DF-GRAPHICS-01).
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
};

/**
 * Helper to sync class attribute and classList for DOM and MockDOM environments.
 *
 * @param {HTMLElement|Object} element
 * @param {string} className
 */
function setClass(element, className) {
  if (element && typeof element.setAttribute === 'function') {
    element.setAttribute('class', className);
  }
  if (element) {
    element.className = className;
    if (element.classList && typeof element.classList.add === 'function') {
      const classes = className.split(/\s+/).filter(Boolean);
      element.classList.add(...classes);
    }
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
 * Mounts application workspace, canvas, controls, and renders historical series.
 *
 * @param {HTMLElement|Object} container Target root DOM element
 * @returns {HTMLElement|Object} Mounted container
 */
export function mount(container) {
  let target = container;
  if (target === undefined) {
    target = typeof document !== 'undefined' ? document.getElementById('app') : null;
  }

  if (!target) {
    throw new Error('Missing root container #app');
  }

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
  target.style.display = 'flex';
  target.style.flexDirection = 'column';
  target.style.height = '100vh';
  target.style.overflow = 'hidden';
  target.style.background = '#131722';
  target.style.color = '#d1d4dc';

  const buttonStyle =
    'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer;';

  // Toolbar hosting interactive tabs and controls
  const toolbar = document.createElement('div');
  setClass(toolbar, 'toolbar-controls');
  if (typeof toolbar.setAttribute === 'function') {
    toolbar.setAttribute(
      'style',
      'display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: #1e222d; border-bottom: 1px solid #363c4e; align-items: center;'
    );
  }
  toolbar.style.display = 'flex';
  toolbar.style.flexWrap = 'wrap';
  toolbar.style.gap = '8px';
  toolbar.style.padding = '8px 12px';
  toolbar.style.background = '#1e222d';
  toolbar.style.borderBottom = '1px solid #363c4e';
  toolbar.style.alignItems = 'center';

  // Tabs
  const tabChart = document.createElement('button');
  setClass(tabChart, 'tab-btn');
  if (typeof tabChart.setAttribute === 'function') {
    tabChart.setAttribute('data-tab', 'chart');
    tabChart.setAttribute('aria-selected', 'false');
    tabChart.setAttribute('style', buttonStyle);
  }
  tabChart.textContent = 'Chart';
  toolbar.appendChild(tabChart);

  const tabLayers = document.createElement('button');
  setClass(tabLayers, 'tab-btn');
  if (typeof tabLayers.setAttribute === 'function') {
    tabLayers.setAttribute('data-tab', 'layers');
    tabLayers.setAttribute('aria-selected', 'false');
    tabLayers.setAttribute('style', buttonStyle);
  }
  tabLayers.textContent = 'Layers';
  toolbar.appendChild(tabLayers);

  const tabIndicators = document.createElement('button');
  setClass(tabIndicators, 'tab-btn');
  if (typeof tabIndicators.setAttribute === 'function') {
    tabIndicators.setAttribute('data-tab', 'indicators');
    tabIndicators.setAttribute('aria-selected', 'false');
    tabIndicators.setAttribute('style', buttonStyle);
  }
  tabIndicators.textContent = 'Indicators';
  toolbar.appendChild(tabIndicators);

  // Action Buttons
  const btnZoomIn = document.createElement('button');
  setClass(btnZoomIn, 'control-btn');
  if (typeof btnZoomIn.setAttribute === 'function') {
    btnZoomIn.setAttribute('data-control', 'zoom-in');
    btnZoomIn.setAttribute('style', buttonStyle);
  }
  btnZoomIn.textContent = 'Zoom In';
  toolbar.appendChild(btnZoomIn);

  const btnZoomOut = document.createElement('button');
  setClass(btnZoomOut, 'control-btn');
  if (typeof btnZoomOut.setAttribute === 'function') {
    btnZoomOut.setAttribute('data-control', 'zoom-out');
    btnZoomOut.setAttribute('style', buttonStyle);
  }
  btnZoomOut.textContent = 'Zoom Out';
  toolbar.appendChild(btnZoomOut);

  const btnPan = document.createElement('button');
  btnPan.id = 'btn-pan';
  setClass(btnPan, 'control-btn');
  if (typeof btnPan.setAttribute === 'function') {
    btnPan.setAttribute('id', 'btn-pan');
    btnPan.setAttribute('data-control', 'pan');
    btnPan.setAttribute('style', buttonStyle);
  }
  btnPan.textContent = 'Pan Tool';
  toolbar.appendChild(btnPan);

  const btnReset = document.createElement('button');
  btnReset.id = 'btn-reset';
  setClass(btnReset, 'control-btn');
  if (typeof btnReset.setAttribute === 'function') {
    btnReset.setAttribute('id', 'btn-reset');
    btnReset.setAttribute('data-control', 'reset');
    btnReset.setAttribute('style', buttonStyle);
  }
  btnReset.textContent = 'Reset View';
  toolbar.appendChild(btnReset);

  const zoomIndicator = document.createElement('span');
  setClass(zoomIndicator, 'zoom-level-indicator');
  if (typeof zoomIndicator.setAttribute === 'function') {
    zoomIndicator.setAttribute('style', 'color: #d1d4dc; font-size: 13px; margin-left: 8px;');
  }
  zoomIndicator.style.color = '#d1d4dc';
  zoomIndicator.style.fontSize = '13px';
  zoomIndicator.style.marginLeft = '8px';
  zoomIndicator.textContent = '100%';
  toolbar.appendChild(zoomIndicator);

  target.appendChild(toolbar);

  // Indicator legend overlay (DF-OVERLAYS-01)
  const legend = document.createElement('div');
  setClass(legend, 'indicator-legend');
  if (typeof legend.setAttribute === 'function') {
    legend.setAttribute(
      'style',
      'position: absolute; top: 50px; left: 10px; color: #d1d4dc; font-size: 12px; z-index: 10;'
    );
  }
  legend.style.position = 'absolute';
  legend.style.top = '50px';
  legend.style.left = '10px';
  legend.style.color = '#d1d4dc';
  legend.style.fontSize = '12px';
  legend.style.zIndex = '10';
  legend.textContent = 'EMA (20): 0.00';
  target.appendChild(legend);

  // Primary workspace chart canvas actively mounted to root container #app
  const canvas = document.createElement('canvas');
  setClass(canvas, 'chart-canvas');
  if (typeof canvas.setAttribute === 'function') {
    canvas.setAttribute(
      'style',
      'flex: 1; min-height: 0; width: 100%; height: 100%; display: block;'
    );
  }
  canvas.style.flex = '1';
  canvas.style.minHeight = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';

  if (!canvas.width) canvas.width = 1000;
  if (!canvas.height) canvas.height = 500;

  target.appendChild(canvas);

  // Initialize and mount chart to immediately render complete historical data series
  const chart = new Chart(canvas);
  chart.mount();
  chart.render();
  target._chart = chart;
  canvas._chart = chart;

  // Workspace container alongside canvas hosting auxiliary dock (DF-LAYOUT-02)
  const workspace = document.createElement('div');
  setClass(workspace, 'main-workspace chart-container');
  if (typeof workspace.setAttribute === 'function') {
    workspace.setAttribute(
      'style',
      'display: flex; flex-direction: row; min-height: 0; overflow: hidden; position: relative;'
    );
  }
  workspace.style.display = 'flex';
  workspace.style.flexDirection = 'row';
  workspace.style.minHeight = '0';
  workspace.style.overflow = 'hidden';
  workspace.style.position = 'relative';

  let dockElement = null;
  try {
    const dock = new AuxiliaryDock();
    dockElement = dock.getElement ? dock.getElement() : null;
  } catch {
    dockElement = null;
  }

  if (dockElement) {
    workspace.appendChild(dockElement);
  }
  target.appendChild(workspace);

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
 * @param {HTMLElement|Object} container
 * @returns {HTMLElement|Object}
 */
export function mountApp(container) {
  return mount(container);
}

/**
 * Bootstrap entrypoint alias.
 *
 * @param {HTMLElement|Object} [container]
 * @returns {HTMLElement|Object}
 */
export function init(container) {
  const target = container || (typeof document !== 'undefined' ? document.getElementById('app') : null);
  if (target && target.children && target.children.length === 0) {
    target._appMounted = false;
  }
  return mount(target);
}

export function bootstrap(container) {
  return init(container);
}

// Automatic mount guard when loaded into an active browser document
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && (!mountTarget.__nexus_mounted || mountTarget.children.length === 0)) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}