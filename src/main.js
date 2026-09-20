/**
 * SmartTrading-V2 — Active Application Entrypoint
 * Bootstraps the full quantitative chart trading interface:
 * - Viewport layout enforcement: 100vh full-screen flex layout (DF-LAYOUT-02)
 * - Horizontal time scale axis along bottom edge (DF-SCALES-02)
 * - Analytical indicators (20 EMA/SMA) and indicator legend (DF-OVERLAYS-01)
 * - Cohesive dark-theme control styling (DF-THEME-01)
 * - Precise financial price coordinate mapping (DF-TOOLS-03)
 */

import {
  Chart,
  calculateSMA,
  calculateEMA,
  generateDefaultCandles,
  formatTimestamp,
  computeCandleRanges,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  renderCandlesticksSeries,
  renderOverlay,
  renderChart,
  PERIOD_DEFAULT,
  AxesRenderer,
  computeRanges,
} from './chart.js';

export {
  Chart,
  calculateSMA,
  calculateEMA,
  generateDefaultCandles,
  formatTimestamp,
  computeCandleRanges,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  renderCandlesticksSeries,
  renderOverlay,
  renderChart,
  PERIOD_DEFAULT,
  AxesRenderer,
  computeRanges,
};

/**
 * Cohesive dark-theme styling for application controls (DF-THEME-01).
 */
const DARK_CONTROL_CSS =
  'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer; outline: none; font-size: 12px;';

/**
 * Safely applies dark-theme control styles to a DOM element.
 *
 * @param {HTMLElement|Object} el
 */
function applyControlStyle(el) {
  if (!el || !el.style) return;
  el.style.background = '#1e222d';
  el.style.color = '#d1d4dc';
  el.style.border = '1px solid #363c4e';
  el.style.borderRadius = '4px';
  el.style.padding = '6px 10px';
  el.style.cursor = 'pointer';
  el.style.outline = 'none';
  el.style.fontSize = '12px';
}

/**
 * Maps canvas Y coordinate through the price scale into actual financial price (DF-TOOLS-03).
 * Formula: price = maxPrice - ((y - plotTop) / plotHeight) * (maxPrice - minPrice)
 *
 * @param {number} y - Canvas pixel Y coordinate
 * @param {Chart|Object} chart - Target chart instance
 * @returns {number} Financial price
 */
export function mapCoordinateToPrice(y, chart) {
  if (chart && typeof chart.yToPrice === 'function') {
    return chart.yToPrice(y);
  }
  const plotTop = chart && chart.plotArea ? chart.plotArea.top : 0;
  const plotHeight =
    chart && chart.plotArea
      ? chart.plotArea.height
      : (chart && chart.canvas && chart.canvas.height) || 600;
  const candles = (chart && (chart.candles || chart.data)) || [];
  const ranges = computeCandleRanges(candles);
  const minPrice = ranges.priceRange.min;
  const maxPrice = ranges.priceRange.max;
  return maxPrice - ((y - plotTop) / (plotHeight || 1)) * (maxPrice - minPrice);
}

/**
 * Mounts and bootstraps the SmartTrading application into a target DOM element or canvas.
 * Satisfies viewport invariants (DF-LAYOUT-02), scale axes (DF-SCALES-02), and indicators (DF-OVERLAYS-01).
 *
 * @param {HTMLElement|Object} [containerOrOptions={}] - Mount DOM container, canvas, or options
 * @param {Object} [options={}] - Configuration options
 * @returns {Chart} Active chart instance
 */
export function mountApp(containerOrOptions = {}, options = {}) {
  let container = null;
  let canvas = null;
  let opts = {};

  if (containerOrOptions && typeof containerOrOptions === 'object') {
    if (
      containerOrOptions.nodeType ||
      containerOrOptions.tagName === 'DIV' ||
      containerOrOptions.tagName === 'BODY' ||
      (typeof containerOrOptions.appendChild === 'function' && !containerOrOptions.getContext)
    ) {
      container = containerOrOptions;
      opts = options || {};
      canvas = opts.canvas || null;
    } else if (
      containerOrOptions.getContext ||
      containerOrOptions.tagName === 'CANVAS'
    ) {
      canvas = containerOrOptions;
      opts = options || {};
      container = opts.container || null;
    } else {
      opts = containerOrOptions;
      container = opts.container || null;
      canvas = opts.canvas || null;
    }
  } else {
    opts = options || {};
  }

  // Fallback to active document container if available
  if (!container && typeof document !== 'undefined') {
    container = document.getElementById('app') || document.body || null;
  }

  // Viewport & Layout Invariant (DF-LAYOUT-02): Enforce 100vh flex layout with overflow hidden
  if (typeof document !== 'undefined' && document.body && document.body.style) {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    document.body.style.background = '#131722';
    document.body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }

  if (container && container.style) {
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = '100vh';
    container.style.width = '100%';
    container.style.overflow = 'hidden';
    container.style.background = '#131722';
    container.style.color = '#d1d4dc';
    container.style.boxSizing = 'border-box';
  }

  // 1. Chart Header with controls and indicator legend (DF-OVERLAYS-01)
  let header =
    container && typeof container.querySelector === 'function'
      ? container.querySelector('.chart-header') || container.querySelector('[data-testid="chart-header"]')
      : null;

  if (!header && container && typeof container.appendChild === 'function') {
    header =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;
    if (header) {
      header.className = 'chart-header';
      if (typeof header.setAttribute === 'function') {
        header.setAttribute('class', 'chart-header');
        header.setAttribute('data-testid', 'chart-header');
      }
      if (header.style) {
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.padding = '8px 16px';
        header.style.background = '#1e222d';
        header.style.borderBottom = '1px solid #2a2e39';
        header.style.gap = '12px';
      }
      container.appendChild(header);
    }
  }

  // Header controls
  if (header && typeof header.appendChild === 'function' && !header._hasControls) {
    header._hasControls = true;

    // Controls wrapper (ticker / timeframe / overlay selectors)
    const controls =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;

    if (controls) {
      if (controls.style) {
        controls.style.display = 'flex';
        controls.style.alignItems = 'center';
        controls.style.gap = '8px';
      }

      // Ticker select
      const tickerSelect = document.createElement('select');
      applyControlStyle(tickerSelect);
      if (tickerSelect) {
        ['BTC-USD', 'ETH-USD', 'SOL-USD'].forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          if (typeof tickerSelect.appendChild === 'function') tickerSelect.appendChild(opt);
        });
        if (typeof controls.appendChild === 'function') controls.appendChild(tickerSelect);
      }

      // Timeframe select
      const tfSelect = document.createElement('select');
      applyControlStyle(tfSelect);
      if (tfSelect) {
        ['1m', '5m', '15m', '1h', '1d'].forEach((tf) => {
          const opt = document.createElement('option');
          opt.value = tf;
          opt.textContent = tf;
          if (tf === '1h') opt.selected = true;
          if (typeof tfSelect.appendChild === 'function') tfSelect.appendChild(opt);
        });
        if (typeof controls.appendChild === 'function') controls.appendChild(tfSelect);
      }

      // Overlay select (SMA / EMA)
      const overlaySelect = document.createElement('select');
      applyControlStyle(overlaySelect);
      if (overlaySelect) {
        ['SMA (20)', 'EMA (20)', 'None'].forEach((type) => {
          const opt = document.createElement('option');
          opt.value = type;
          opt.textContent = type;
          if (typeof overlaySelect.appendChild === 'function') overlaySelect.appendChild(opt);
        });
        if (typeof controls.appendChild === 'function') controls.appendChild(overlaySelect);
      }

      header.appendChild(controls);
    }

    // Indicator legend element (.indicator-legend)
    const legend =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;

    if (legend) {
      legend.className = 'indicator-legend';
      if (typeof legend.setAttribute === 'function') {
        legend.setAttribute('class', 'indicator-legend');
        legend.setAttribute('data-testid', 'indicator-legend');
      }
      if (legend.style) {
        legend.style.fontFamily = 'monospace';
        legend.style.fontSize = '12px';
        legend.style.color = '#2962ff';
      }
      legend.textContent = 'SMA (20): --';
      header.appendChild(legend);
    }
  }

  // 2. Main Workspace Layout (DF-LAYOUT-02): flex-row hosting chart & auxiliary dock side-by-side
  let workspace =
    container && typeof container.querySelector === 'function'
      ? container.querySelector('.workspace')
      : null;

  if (!workspace && container && typeof container.appendChild === 'function') {
    workspace =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;
    if (workspace) {
      workspace.className = 'workspace';
      if (workspace.style) {
        workspace.style.display = 'flex';
        workspace.style.flexDirection = 'row';
        workspace.style.flex = '1';
        workspace.style.minHeight = '0';
        workspace.style.width = '100%';
        workspace.style.overflow = 'hidden';
      }
      container.appendChild(workspace);
    }
  }

  // 3. Chart Container
  let chartContainer =
    workspace && typeof workspace.querySelector === 'function'
      ? workspace.querySelector('.chart-container')
      : null;

  if (!chartContainer && workspace && typeof workspace.appendChild === 'function') {
    chartContainer =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('div')
        : null;
    if (chartContainer) {
      chartContainer.className = 'chart-container';
      if (chartContainer.style) {
        chartContainer.style.flex = '1';
        chartContainer.style.minHeight = '0';
        chartContainer.style.minWidth = '0';
        chartContainer.style.position = 'relative';
        chartContainer.style.height = '100%';
        chartContainer.style.display = 'flex';
        chartContainer.style.flexDirection = 'column';
      }
      workspace.appendChild(chartContainer);
    }
  }

  // 4. Auxiliary Dock (side-by-side dock)
  let dock =
    workspace && typeof workspace.querySelector === 'function'
      ? workspace.querySelector('.auxiliary-dock') || workspace.querySelector('[data-testid="auxiliary-dock"]')
      : null;

  if (!dock && workspace && typeof workspace.appendChild === 'function') {
    dock =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement('aside')
        : null;
    if (dock) {
      dock.className = 'auxiliary-dock';
      if (typeof dock.setAttribute === 'function') {
        dock.setAttribute('class', 'auxiliary-dock');
        dock.setAttribute('data-testid', 'auxiliary-dock');
      }
      if (dock.style) {
        dock.style.width = '200px';
        dock.style.background = '#1e222d';
        dock.style.borderLeft = '1px solid #2a2e39';
        dock.style.display = 'flex';
        dock.style.flexDirection = 'column';
        dock.style.padding = '12px';
        dock.style.gap = '8px';
        dock.style.overflowY = 'auto';
      }

      // Dock buttons (Trendline, Horizontal Line, Measure, Clear)
      ['Trendline', 'Horizontal Line', 'Measure', 'Clear'].forEach((name) => {
        const btn = document.createElement('button');
        if (btn) {
          btn.textContent = name;
          applyControlStyle(btn);
          if (typeof dock.appendChild === 'function') dock.appendChild(btn);
        }
      });

      workspace.appendChild(dock);
    }
  }

  // 5. Canvas resolution
  if (!canvas) {
    if (chartContainer && typeof chartContainer.querySelector === 'function') {
      canvas = chartContainer.querySelector('canvas');
    }
    if (!canvas && typeof document !== 'undefined') {
      canvas = document.getElementById('chart-canvas') || document.getElementById('chart');
    }
    if (!canvas && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvas = document.createElement('canvas');
      if (canvas) {
        canvas.className = 'chart-canvas';
        if (typeof canvas.setAttribute === 'function') {
          canvas.setAttribute('class', 'chart-canvas');
          canvas.setAttribute('data-testid', 'chart-canvas');
        }
        if (chartContainer && typeof chartContainer.appendChild === 'function') {
          chartContainer.appendChild(canvas);
        } else if (container && typeof container.appendChild === 'function') {
          container.appendChild(canvas);
        }
      }
    }
  }

  // 6. Chart instantiation and configuration
  const chartInstance = new Chart(canvas, {
    container: chartContainer || container,
    data: opts.data || opts.candles,
    timeAxis: opts.timeAxis || { visible: true, height: 30 },
    ...opts,
  });

  // Dynamic window resize listener preserving time axis visibility (DF-SCALES-02)
  const onResize = () => {
    const parent = chartContainer || container;
    const w =
      (canvas && canvas.width) ||
      (parent && parent.clientWidth) ||
      (typeof window !== 'undefined' ? window.innerWidth : 800);
    const h =
      (canvas && canvas.height) ||
      (parent && parent.clientHeight) ||
      (typeof window !== 'undefined' ? window.innerHeight : 600);
    chartInstance.resize(w, h);
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', onResize);
  }

  // Ensure active rendering
  chartInstance.render();

  return chartInstance;
}

export function mount(containerOrOptions, options) {
  return mountApp(containerOrOptions, options);
}

export function init(containerOrOptions, options) {
  return mountApp(containerOrOptions, options);
}

export function start(containerOrOptions, options) {
  return mountApp(containerOrOptions, options);
}

export default mountApp;

// Auto-mount guard for browser execution
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}