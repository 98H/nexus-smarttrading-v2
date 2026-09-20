/**
 * SmartTrading-V2 Application Entrypoint
 * Orchestrates viewport layout, chart container attachment, analytical moving
 * average overlays, controls, and real-time tick synchronization.
 */

import {
  Chart,
  calculateSMA,
  calculateEMA,
  PERIOD_DEFAULT,
  generateDefaultCandles,
  formatTimestamp,
  computeCandleRanges,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  renderCandlesticksSeries,
  renderOverlay,
  renderChart,
  AxesRenderer,
  computeRanges,
} from './chart.js';

export {
  Chart,
  calculateSMA,
  calculateEMA,
  PERIOD_DEFAULT,
  generateDefaultCandles,
  formatTimestamp,
  computeCandleRanges,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  renderCandlesticksSeries,
  renderOverlay,
  renderChart,
  AxesRenderer,
  computeRanges,
};

let activeChartInstance = null;

/**
 * Returns active Chart instance mounted to the application.
 *
 * @returns {Chart|null}
 */
export function getActiveChart() {
  return activeChartInstance;
}

/**
 * Applies cohesive dark-theme styles to control elements (DF-THEME-01).
 *
 * @param {HTMLElement|Object} el
 */
function applyControlTheme(el) {
  if (!el || !el.style) return;
  el.style.background = '#1e222d';
  el.style.color = '#d1d4dc';
  el.style.border = '1px solid #363c4e';
  el.style.borderRadius = '4px';
  el.style.padding = '6px 10px';
  el.style.cursor = 'pointer';
  el.style.fontSize = '12px';
}

/**
 * Mounts chart and overlay workspace to target DOM element.
 *
 * @param {HTMLElement|Object} [container]
 * @returns {Chart|null}
 */
export function initApp(container) {
  const root =
    container ||
    (typeof document !== 'undefined'
      ? document.getElementById('app') || document.body
      : null);

  if (!root) return null;

  if (activeChartInstance) {
    activeChartInstance.destroy();
    activeChartInstance = null;
  }

  // Clear root container
  if (typeof root.replaceChildren === 'function') {
    root.replaceChildren();
  } else {
    root.children = [];
    root.innerHTML = '';
    root.textContent = '';
  }

  // Responsive 100vh flex layout with overflow hidden on viewport container (DF-LAYOUT-02)
  if (root.style) {
    root.style.display = 'flex';
    root.style.flexDirection = 'row';
    root.style.width = '100vw';
    root.style.height = '100vh';
    root.style.overflow = 'hidden';
    root.style.margin = '0';
    root.style.padding = '0';
    root.style.boxSizing = 'border-box';
    root.style.background = '#131722';
    root.style.color = '#d1d4dc';
    root.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }

  // Chart container hosting canvas and indicator overlay legend (direct child of #app)
  const chartContainer =
    typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('div')
      : { tagName: 'DIV', className: '', children: [] };

  chartContainer.className = 'chart-container';
  if (chartContainer.dataset) chartContainer.dataset.testid = 'chart-container';
  if (chartContainer.style) {
    chartContainer.style.flex = '1';
    chartContainer.style.minHeight = '0';
    chartContainer.style.display = 'flex';
    chartContainer.style.flexDirection = 'column';
    chartContainer.style.position = 'relative';
    chartContainer.style.overflow = 'hidden';
  }
  root.appendChild(chartContainer);

  // Auxiliary dock side-by-side inside visible screen (DF-LAYOUT-02)
  const dock =
    typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('div')
      : null;

  if (dock) {
    dock.className = 'auxiliary-dock';
    if (dock.dataset) dock.dataset.testid = 'auxiliary-dock';
    if (dock.style) {
      dock.style.width = '240px';
      dock.style.display = 'flex';
      dock.style.flexDirection = 'column';
      dock.style.gap = '10px';
      dock.style.padding = '12px';
      dock.style.background = '#1e222d';
      dock.style.borderLeft = '1px solid #2a2e39';
      dock.style.overflowY = 'auto';
      dock.style.boxSizing = 'border-box';
    }

    const dockTitle = document.createElement('div');
    dockTitle.className = 'dock-title';
    dockTitle.textContent = 'Analytical Overlays';
    if (dockTitle.style) {
      dockTitle.style.fontWeight = 'bold';
      dockTitle.style.marginBottom = '4px';
      dockTitle.style.color = '#f0f3fa';
    }
    dock.appendChild(dockTitle);

    const overlaySelect = document.createElement('select');
    overlaySelect.className = 'overlay-type-select';
    applyControlTheme(overlaySelect);

    const optSMA = document.createElement('option');
    optSMA.value = 'SMA';
    optSMA.textContent = '20 SMA Overlay';
    overlaySelect.appendChild(optSMA);

    const optEMA = document.createElement('option');
    optEMA.value = 'EMA';
    optEMA.textContent = '20 EMA Overlay';
    overlaySelect.appendChild(optEMA);

    overlaySelect.addEventListener('change', (e) => {
      if (activeChartInstance) {
        const val = (e && e.target && e.target.value) || overlaySelect.value || 'SMA';
        activeChartInstance.overlayType = val.toUpperCase();
        activeChartInstance.render();
      }
    });
    dock.appendChild(overlaySelect);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-reset-view';
    resetBtn.textContent = 'Reset Viewport';
    applyControlTheme(resetBtn);
    resetBtn.addEventListener('click', () => {
      if (activeChartInstance) {
        activeChartInstance.resetViewport();
      }
    });
    dock.appendChild(resetBtn);

    root.appendChild(dock);
  }

  // Instantiate Chart with 20-period moving average analytical overlay (DF-OVERLAYS-01)
  activeChartInstance = new Chart({
    container: chartContainer,
    overlayPeriod: PERIOD_DEFAULT,
    overlayType: 'SMA',
    showOverlay: true,
  });

  return activeChartInstance;
}

/**
 * Pushes incoming price ticks and triggers real-time analytical overlay recalculations.
 *
 * @param {Object|number} priceData
 */
export function updateRealtimePrice(priceData) {
  if (!activeChartInstance) return null;
  return activeChartInstance.updateRealtimePrice(priceData);
}

/**
 * Mount lifecycle function wrapper for external consumers and automated tests.
 *
 * @param {HTMLElement|Object} target
 */
export function mountApp(target) {
  return initApp(target);
}

/**
 * Mount alias per workspace lifecycle conventions.
 *
 * @param {HTMLElement|Object} target
 */
export function mount(target) {
  return initApp(target);
}

/**
 * Resets application state and unmounts active chart instance.
 */
export function resetApp() {
  if (activeChartInstance) {
    activeChartInstance.destroy();
    activeChartInstance = null;
  }
  if (typeof document !== 'undefined') {
    const root = document.getElementById('app');
    if (root) {
      delete root.__nexus_mounted;
      root.children = [];
      root.innerHTML = '';
      root.textContent = '';
    }
  }
}

// Browser auto-mount guard
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}

export default {
  initApp,
  updateRealtimePrice,
  getActiveChart,
  resetApp,
  mountApp,
  mount,
  Chart,
  calculateSMA,
  calculateEMA,
  PERIOD_DEFAULT,
};