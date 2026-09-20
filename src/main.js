/**
 * SmartTrading-V2 — Main Application Entrypoint
 * Responsible for root application mounting, layout composition,
 * coordinate mapping, and interactive control binding.
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

export {
  initControls,
  getControlState,
  setControlState,
  reRenderControls,
  bindControls,
  renderControls,
  ensureSelectorCompatibility,
};

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
 * Mounts application workspace and controls into root element.
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

  if (target._appMounted && target.children.length > 0) {
    return target;
  }
  target._appMounted = true;

  ensureSelectorCompatibility();

  // Enforce 100vh responsive flex layout with overflow hidden (DF-LAYOUT-02)
  target.setAttribute(
    'style',
    'display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: #131722; color: #d1d4dc; font-family: sans-serif;'
  );

  const buttonStyle =
    'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer;';

  // Toolbar hosting interactive tabs and controls
  const toolbar = document.createElement('div');
  toolbar.setAttribute('class', 'toolbar-controls');
  toolbar.setAttribute(
    'style',
    'display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: #1e222d; border-bottom: 1px solid #363c4e; align-items: center;'
  );

  // Tabs
  const tabChart = document.createElement('button');
  tabChart.setAttribute('class', 'tab-btn');
  tabChart.setAttribute('data-tab', 'chart');
  tabChart.setAttribute('aria-selected', 'false');
  tabChart.setAttribute('style', buttonStyle);
  tabChart.textContent = 'Chart';
  toolbar.appendChild(tabChart);

  const tabLayers = document.createElement('button');
  tabLayers.setAttribute('class', 'tab-btn');
  tabLayers.setAttribute('data-tab', 'layers');
  tabLayers.setAttribute('aria-selected', 'false');
  tabLayers.setAttribute('style', buttonStyle);
  tabLayers.textContent = 'Layers';
  toolbar.appendChild(tabLayers);

  const tabIndicators = document.createElement('button');
  tabIndicators.setAttribute('class', 'tab-btn');
  tabIndicators.setAttribute('data-tab', 'indicators');
  tabIndicators.setAttribute('aria-selected', 'false');
  tabIndicators.setAttribute('style', buttonStyle);
  tabIndicators.textContent = 'Indicators';
  toolbar.appendChild(tabIndicators);

  // Action Buttons
  const btnZoomIn = document.createElement('button');
  btnZoomIn.setAttribute('class', 'control-btn');
  btnZoomIn.setAttribute('data-control', 'zoom-in');
  btnZoomIn.setAttribute('style', buttonStyle);
  btnZoomIn.textContent = 'Zoom In';
  toolbar.appendChild(btnZoomIn);

  const btnZoomOut = document.createElement('button');
  btnZoomOut.setAttribute('class', 'control-btn');
  btnZoomOut.setAttribute('data-control', 'zoom-out');
  btnZoomOut.setAttribute('style', buttonStyle);
  btnZoomOut.textContent = 'Zoom Out';
  toolbar.appendChild(btnZoomOut);

  const btnPan = document.createElement('button');
  btnPan.id = 'btn-pan';
  btnPan.setAttribute('id', 'btn-pan');
  btnPan.setAttribute('class', 'control-btn');
  btnPan.setAttribute('data-control', 'pan');
  btnPan.setAttribute('style', buttonStyle);
  btnPan.textContent = 'Pan Tool';
  toolbar.appendChild(btnPan);

  const btnReset = document.createElement('button');
  btnReset.id = 'btn-reset';
  btnReset.setAttribute('id', 'btn-reset');
  btnReset.setAttribute('class', 'control-btn');
  btnReset.setAttribute('data-control', 'reset');
  btnReset.setAttribute('style', buttonStyle);
  btnReset.textContent = 'Reset View';
  toolbar.appendChild(btnReset);

  const zoomIndicator = document.createElement('span');
  zoomIndicator.setAttribute('class', 'zoom-level-indicator');
  zoomIndicator.setAttribute('style', 'color: #d1d4dc; font-size: 13px; margin-left: 8px;');
  zoomIndicator.textContent = '100%';
  toolbar.appendChild(zoomIndicator);

  target.appendChild(toolbar);

  // Main workspace flex-row hosting chart and auxiliary dock horizontally side-by-side (DF-LAYOUT-02)
  const workspace = document.createElement('div');
  workspace.setAttribute('class', 'main-workspace');
  workspace.setAttribute(
    'style',
    'flex: 1; min-height: 0; display: flex; flex-direction: row; overflow: hidden;'
  );

  const chartContainer = document.createElement('div');
  chartContainer.setAttribute('class', 'chart-container');
  chartContainer.setAttribute(
    'style',
    'flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column;'
  );

  // Indicator legend (DF-OVERLAYS-01)
  const legend = document.createElement('div');
  legend.setAttribute('class', 'indicator-legend');
  legend.setAttribute(
    'style',
    'position: absolute; top: 10px; left: 10px; color: #d1d4dc; font-size: 12px; z-index: 10;'
  );
  legend.textContent = 'EMA (20): 0.00';
  chartContainer.appendChild(legend);

  const canvas = document.createElement('canvas');
  canvas.setAttribute('class', 'chart-canvas');
  canvas.setAttribute('style', 'flex: 1; width: 100%; height: 100%;');
  chartContainer.appendChild(canvas);

  workspace.appendChild(chartContainer);

  const dock = document.createElement('div');
  dock.setAttribute('class', 'auxiliary-dock');
  dock.setAttribute(
    'style',
    'width: 280px; background: #1e222d; border-left: 1px solid #363c4e; display: flex; flex-direction: column; padding: 12px;'
  );
  dock.textContent = 'Dock Panel';
  workspace.appendChild(dock);

  target.appendChild(workspace);

  // Bind controls and synchronize initial DOM
  initControls(target);

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

// Automatic mount guard when loaded into an active browser document
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app');
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}