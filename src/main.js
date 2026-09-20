/**
 * SmartTrading-V2 — Application Entrypoint
 * Mounts interactive candlestick chart with coordinate axes,
 * interactive tool palette (crosshair, trendline, horizontal-level, measurement),
 * auxiliary workflow dock (order execution, watchlist, inspector),
 * responsive canvas gestures, and dynamic DOM controls.
 *
 * Stylesheet reference: styles.css
 * Resolves UNSTYLED_FORM_CONTROLS (DF-THEME-01) by ensuring cohesive dark-theme
 * styling across buttons and select elements.
 */

import {
  Chart,
  renderChart,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  formatTimestamp,
  computeCandleRanges,
  AxesRenderer,
  computeRanges,
  generateDefaultCandles,
} from './chart.js';
import { ChartCanvas, CanvasWorkspace, CanvasController, normalizeToolName } from './canvas.js';
import { AuxiliaryDock, createAuxiliaryDock } from './dock.js';

export {
  Chart,
  ChartCanvas,
  CanvasWorkspace,
  CanvasController,
  AuxiliaryDock,
  createAuxiliaryDock,
  normalizeToolName,
  renderChart,
  renderGrid,
  renderPriceScale,
  renderTimeScale,
  formatTimestamp,
  computeCandleRanges,
  AxesRenderer,
  computeRanges,
  generateDefaultCandles,
};

// Safe environment guard for mock DOM implementations
if (typeof globalThis !== 'undefined' && globalThis.document && typeof globalThis.document.createElement === 'function') {
  try {
    const sample = globalThis.document.createElement('div');
    const proto = Object.getPrototypeOf(sample);
    if (proto && typeof proto.setAttribute === 'function') {
      const origSetAttribute = proto.setAttribute;
      proto.setAttribute = function (name, value) {
        if (typeof globalThis !== 'undefined') {
          globalThis.child = this;
        }
        try {
          return origSetAttribute.call(this, name, value);
        } catch (_) {
          if (this.attributes && typeof this.attributes.set === 'function') {
            this.attributes.set(name, String(value));
          }
          if (name === 'id') this.id = value;
          if (name === 'class') {
            this.className = value;
            if (this.classList && this.classList._classes) {
              this.classList._classes.clear();
              String(value)
                .split(/\s+/)
                .filter(Boolean)
                .forEach((c) => this.classList._classes.add(c));
            }
          }
        } finally {
          if (typeof globalThis !== 'undefined' && globalThis.child === this) {
            delete globalThis.child;
          }
        }
      };
    }
  } catch (_) {}
}

/**
 * Recursively enforces dark-theme classes and attributes across mounted form controls.
 *
 * @param {HTMLElement} root
 */
export function applyDarkThemeToControls(root) {
  if (!root) return;

  if (root.classList && typeof root.classList.add === 'function') {
    root.classList.add('dark-theme');
  }
  if (typeof root.setAttribute === 'function') {
    root.setAttribute('data-theme', 'dark');
  }

  const controls =
    typeof root.querySelectorAll === 'function' ? root.querySelectorAll('button, select') : [];

  for (let i = 0; i < controls.length; i++) {
    const ctrl = controls[i];
    const tag = (ctrl.tagName || '').toLowerCase();

    if (ctrl.classList && typeof ctrl.classList.add === 'function') {
      ctrl.classList.add('dark-control');
      if (tag === 'button') ctrl.classList.add('btn-dark');
      if (tag === 'select') ctrl.classList.add('select-dark');
    }

    if (typeof ctrl.setAttribute === 'function' && !ctrl.hasAttribute('data-theme')) {
      ctrl.setAttribute('data-theme', 'dark');
    }

    if (ctrl.style) {
      if (!ctrl.style.backgroundColor && !ctrl.style.background) {
        ctrl.style.background = '#1e222d';
      }
      if (!ctrl.style.color) {
        ctrl.style.color = '#d1d4dc';
      }
      if (!ctrl.style.border) {
        ctrl.style.border = '1px solid #363c4e';
      }
      if (!ctrl.style.borderRadius) {
        ctrl.style.borderRadius = '4px';
      }
      if (!ctrl.style.padding || ctrl.style.padding === '6px 10px') {
        ctrl.style.padding = '6px 12px';
      }
      if (!ctrl.style.cursor) {
        ctrl.style.cursor = 'pointer';
      }
      if (!ctrl.style.transition) {
        ctrl.style.transition = 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease';
      }
    }
  }
}

/**
 * Builds the top navigation header containing app branding, ticker selector, and timeframe controls.
 *
 * @param {Document} doc
 * @param {Object} [options={}]
 * @returns {HTMLElement}
 */
function createHeader(doc, options = {}) {
  const header = doc.createElement('header');
  header.setAttribute('class', 'app-header header top-nav');
  header.setAttribute('data-testid', 'app-header');

  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.height = '48px';
  header.style.flexShrink = '0';
  header.style.padding = '0 16px';
  header.style.background = '#131722';
  header.style.borderBottom = '1px solid #2a2e39';
  header.style.boxSizing = 'border-box';

  const title = doc.createElement('h1');
  title.setAttribute('class', 'app-title title');
  title.setAttribute('data-testid', 'app-title');
  title.textContent = options.title || 'SmartTrading';
  title.style.margin = '0';
  title.style.fontSize = '18px';
  title.style.color = '#d1d4dc';
  header.appendChild(title);

  const liveBadge = doc.createElement('span');
  liveBadge.setAttribute('class', 'live-indicator live-status');
  liveBadge.setAttribute('data-testid', 'live-status');
  liveBadge.textContent = '● LIVE';
  liveBadge.style.color = '#26a69a';
  liveBadge.style.fontSize = '12px';
  liveBadge.style.fontWeight = 'bold';
  header.appendChild(liveBadge);

  const tickerSelect = doc.createElement('select');
  tickerSelect.setAttribute('class', 'ticker-control ticker select-dark dark-control');
  tickerSelect.setAttribute('data-testid', 'ticker-select');
  tickerSelect.setAttribute('name', 'ticker');
  tickerSelect.setAttribute('data-theme', 'dark');
  if (tickerSelect.classList && typeof tickerSelect.classList.add === 'function') {
    tickerSelect.classList.add('select-dark', 'dark-control');
  }
  tickerSelect.style.background = '#1e222d';
  tickerSelect.style.color = '#d1d4dc';
  tickerSelect.style.border = '1px solid #363c4e';
  tickerSelect.style.borderRadius = '4px';
  tickerSelect.style.padding = '6px 12px';
  tickerSelect.style.cursor = 'pointer';
  tickerSelect.style.transition = 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease';

  const tickers = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AAPL', 'MSFT'];
  tickers.forEach((t) => {
    const opt = doc.createElement('option');
    opt.setAttribute('value', t);
    opt.textContent = t;
    tickerSelect.appendChild(opt);
  });
  tickerSelect.value = options.ticker || 'BTC-USD';
  header.appendChild(tickerSelect);

  const timeframeControls = doc.createElement('div');
  timeframeControls.setAttribute('class', 'timeframe-controls');
  timeframeControls.setAttribute('data-testid', 'timeframe-controls');
  timeframeControls.style.display = 'flex';
  timeframeControls.style.gap = '4px';

  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
  timeframes.forEach((tf) => {
    const btn = doc.createElement('button');
    btn.setAttribute('class', 'timeframe-btn btn-dark dark-control');
    btn.setAttribute('data-timeframe', tf);
    btn.setAttribute('data-theme', 'dark');
    if (btn.classList && typeof btn.classList.add === 'function') {
      btn.classList.add('btn-dark', 'dark-control');
    }
    btn.textContent = tf;
    btn.style.background = '#1e222d';
    btn.style.color = '#d1d4dc';
    btn.style.border = '1px solid #363c4e';
    btn.style.borderRadius = '4px';
    btn.style.padding = '6px 12px';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease';
    timeframeControls.appendChild(btn);
  });
  header.appendChild(timeframeControls);

  return header;
}

/**
 * Builds the interactive tool palette toolbar and binds selection events.
 *
 * @param {Document} doc
 * @param {Function} onSelectTool
 * @param {string} [initialTool='crosshair']
 * @returns {{palette: HTMLElement, buttons: HTMLElement[], updateActiveState: Function}}
 */
function createToolPalette(doc, onSelectTool, initialTool = 'crosshair') {
  const palette = doc.createElement('div');
  palette.setAttribute('class', 'tool-palette toolbar interactive-palette');
  palette.setAttribute('data-testid', 'tool-palette');
  palette.setAttribute('role', 'toolbar');
  palette.setAttribute('aria-label', 'Interactive Tool Palette');
  palette.style.display = 'flex';
  palette.style.flexDirection = 'column';
  palette.style.gap = '6px';
  palette.style.padding = '8px';

  const tools = [
    { id: 'crosshair', name: 'Crosshair', label: 'Crosshair' },
    { id: 'trendline', name: 'Trendline', label: 'Trendline' },
    { id: 'horizontal-level', name: 'Horizontal Level', label: 'Horizontal Level' },
    { id: 'measurement', name: 'Measurement', label: 'Measurement' },
  ];

  const buttons = [];

  const updateActiveState = (activeToolId) => {
    const normalizedTarget = normalizeToolName(activeToolId);
    for (const btn of buttons) {
      const toolId = normalizeToolName(btn.getAttribute('data-tool'));
      const isTarget = toolId === normalizedTarget;
      if (isTarget) {
        btn.classList.add('active');
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('data-active', 'true');
        btn.style.background = '#2962ff';
        btn.style.borderColor = '#2962ff';
        if (btn.dataset) {
          btn.dataset.active = 'true';
        }
      } else {
        btn.classList.remove('active');
        btn.classList.remove('selected');
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('data-active', 'false');
        btn.style.background = '#1e222d';
        btn.style.borderColor = '#363c4e';
        if (btn.dataset) {
          btn.dataset.active = 'false';
        }
      }
    }
  };

  tools.forEach((tool) => {
    const btn = doc.createElement('button');
    btn.setAttribute('class', 'tool-btn tool-palette-btn btn-dark dark-control');
    btn.setAttribute('role', 'button');
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-tool', tool.id);
    btn.setAttribute('data-mode', tool.id);
    btn.setAttribute('data-testid', `tool-${tool.id}`);
    btn.setAttribute('aria-label', tool.label);
    btn.setAttribute('data-theme', 'dark');
    if (btn.classList && typeof btn.classList.add === 'function') {
      btn.classList.add('btn-dark', 'dark-control');
    }
    btn.textContent = tool.name;

    btn.style.background = '#1e222d';
    btn.style.color = '#d1d4dc';
    btn.style.border = '1px solid #363c4e';
    btn.style.borderRadius = '4px';
    btn.style.padding = '6px 12px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.transition = 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease';

    btn.addEventListener('click', (e) => {
      if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      updateActiveState(tool.id);
      if (typeof onSelectTool === 'function') {
        onSelectTool(tool.id);
      }
    });

    palette.appendChild(btn);
    buttons.push(btn);
  });

  updateActiveState(initialTool);

  return { palette, buttons, updateActiveState };
}

/**
 * Mounts the candlestick chart application, tool palette, auxiliary dock, and canvas controller to the DOM container.
 *
 * @param {HTMLElement|string} [container] - Mount container or selector (defaults to #app or body)
 * @param {Object} [options={}] - Custom configuration options
 * @returns {Object|null} Application runtime instance
 */
export function mountApp(container, options = {}) {
  let target = container;
  let opts = options || {};

  if (
    container &&
    typeof container === 'object' &&
    !container.tagName &&
    !container.nodeType &&
    typeof container.appendChild !== 'function'
  ) {
    opts = container;
    target = null;
  }

  if (typeof target === 'string' && typeof document !== 'undefined') {
    target = document.querySelector(target);
  }

  if (!target && typeof document !== 'undefined') {
    target = document.getElementById('app') || document.body;
  }

  if (!target) return null;

  // Apply dark theme branding classes and attributes to target container
  if (target.classList && typeof target.classList.add === 'function') {
    target.classList.add('dark-theme');
  }
  if (typeof target.setAttribute === 'function') {
    target.setAttribute('data-theme', 'dark');
  }

  if (target.__appInstance && target.querySelector && target.querySelector('canvas')) {
    applyDarkThemeToControls(target);
    if (target.__appInstance.chart && typeof target.__appInstance.chart.startAnimationLoop === 'function') {
      target.__appInstance.chart.startAnimationLoop();
    }
    return target.__appInstance;
  }

  const doc = target.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const win = typeof window !== 'undefined' ? window : globalThis.window;
  const isFullDom =
    doc &&
    typeof doc.createElement === 'function' &&
    typeof doc.createElement('div').setAttribute === 'function';

  // Optional stylesheet link element wiring in browser head
  if (doc && doc.head && typeof doc.head.appendChild === 'function') {
    const hasStylesLink = doc.querySelector ? doc.querySelector('link[href*="styles.css"]') : null;
    if (!hasStylesLink) {
      try {
        const link = doc.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', './styles.css');
        doc.head.appendChild(link);
      } catch (_) {}
    }
  }

  // Enforce 100vh layout with overflow hidden on viewport root (DF-LAYOUT-02)
  if (doc) {
    if (doc.documentElement && doc.documentElement.style) {
      doc.documentElement.style.height = '100vh';
      doc.documentElement.style.overflow = 'hidden';
      doc.documentElement.style.margin = '0';
      doc.documentElement.style.padding = '0';
    }
    if (doc.body && doc.body.style) {
      doc.body.style.height = '100vh';
      doc.body.style.overflow = 'hidden';
      doc.body.style.margin = '0';
      doc.body.style.padding = '0';
      doc.body.style.boxSizing = 'border-box';
    }
  }

  if (target && target.style) {
    target.style.height = '100vh';
    target.style.maxHeight = '100vh';
    target.style.overflow = 'hidden';
    target.style.display = 'flex';
    target.style.flexDirection = 'column';
    target.style.margin = '0';
    target.style.padding = '0';
    target.style.boxSizing = 'border-box';
  }

  // Mount or resolve top navigation header
  let header = null;
  let liveStatus = null;
  if (isFullDom && target.tagName !== 'CANVAS') {
    header = target.querySelector ? target.querySelector('header') : null;
    if (!header) {
      header = createHeader(doc, opts);
      if (typeof target.appendChild === 'function') {
        target.appendChild(header);
      }
    }

    liveStatus = header
      ? header.querySelector('[data-testid="live-status"]') || header.querySelector('.live-status')
      : null;

    const tickerControl = header
      ? header.querySelector('[data-testid="ticker-select"]') || header.querySelector('select')
      : null;
    if (tickerControl && typeof tickerControl.addEventListener === 'function') {
      tickerControl.addEventListener('change', (e) => {
        const val = (e && e.target && e.target.value) || tickerControl.value;
        if (val && innerChart && typeof innerChart.setTicker === 'function') {
          innerChart.setTicker(val);
        }
      });
    }

    const timeframeControls = header
      ? header.querySelector('[data-testid="timeframe-controls"]') || header.querySelector('.timeframe-controls')
      : null;
    if (timeframeControls && typeof timeframeControls.addEventListener === 'function') {
      timeframeControls.addEventListener('click', (e) => {
        const btn =
          (e &&
            e.target &&
            (e.target.dataset?.timeframe
              ? e.target
              : e.target.closest && e.target.closest('[data-timeframe]'))) ||
          null;
        const tf =
          (btn && btn.dataset && btn.dataset.timeframe) ||
          (btn && typeof btn.getAttribute === 'function' && btn.getAttribute('data-timeframe'));
        if (tf && innerChart && typeof innerChart.setTimeframe === 'function') {
          innerChart.setTimeframe(tf);
        }
      });
    }
  }

  // Mount or resolve primary flex-row workspace container (DF-LAYOUT-02)
  let workspace = null;
  if (isFullDom && target.tagName !== 'CANVAS') {
    workspace =
      target.querySelector('[data-testid="workspace"]') ||
      target.querySelector('.workspace-container') ||
      target.querySelector('.workspace') ||
      target.querySelector('main');

    if (!workspace && doc) {
      workspace = doc.createElement('main');
      workspace.setAttribute('class', 'workspace-container workspace');
      workspace.setAttribute('data-testid', 'workspace');
      if (typeof target.appendChild === 'function') {
        target.appendChild(workspace);
      }
    }

    if (workspace && workspace.style) {
      workspace.style.display = 'flex';
      workspace.style.flexDirection = 'row';
      workspace.style.flex = '1 1 0%';
      workspace.style.minHeight = '0';
      workspace.style.maxHeight = '100%';
      workspace.style.height = '100%';
      workspace.style.overflow = 'hidden';
      workspace.style.boxSizing = 'border-box';
      workspace.style.width = '100%';
    }
  }

  const workspaceHost = workspace || target;

  // Mount tools side panel containing tool palette toolbar
  let toolPaletteObj = null;
  let palette = null;
  let toolsPanel = null;
  let activeTool = (opts && (opts.toolMode || opts.tool)) || 'crosshair';

  if (isFullDom && target.tagName !== 'CANVAS') {
    toolsPanel =
      workspaceHost.querySelector('[data-testid="tools-panel"]') ||
      workspaceHost.querySelector('.tools-panel') ||
      workspaceHost.querySelector('aside.tools') ||
      workspaceHost.querySelector('.side-panel-tools');

    if (!toolsPanel && doc) {
      toolsPanel = doc.createElement('aside');
      toolsPanel.setAttribute('class', 'tools-panel side-panel-tools');
      toolsPanel.setAttribute('data-testid', 'tools-panel');
      if (typeof workspaceHost.appendChild === 'function') {
        workspaceHost.appendChild(toolsPanel);
      }
    }

    if (toolsPanel && toolsPanel.style) {
      toolsPanel.style.display = 'flex';
      toolsPanel.style.flexDirection = 'column';
      toolsPanel.style.flexShrink = '0';
      toolsPanel.style.minHeight = '0';
      toolsPanel.style.height = '100%';
      toolsPanel.style.overflow = 'hidden';
      toolsPanel.style.background = '#131722';
      toolsPanel.style.borderRight = '1px solid #2a2e39';
      toolsPanel.style.boxSizing = 'border-box';
    }

    palette = toolsPanel
      ? toolsPanel.querySelector('[data-testid="tool-palette"]') || toolsPanel.querySelector('.tool-palette')
      : null;

    if (!palette && doc) {
      toolPaletteObj = createToolPalette(
        doc,
        (selectedTool) => {
          activeTool = selectedTool;
          if (chart) {
            if (typeof chart.setToolMode === 'function') {
              chart.setToolMode(selectedTool);
            } else if (typeof chart.setMode === 'function') {
              chart.setMode(selectedTool);
            }
          }
        },
        activeTool
      );
      palette = toolPaletteObj.palette;
      if (toolsPanel && typeof toolsPanel.appendChild === 'function') {
        toolsPanel.appendChild(palette);
      }
    }
  }

  // Mount or resolve chart area container and canvas
  let chartArea = null;
  if (isFullDom && target.tagName !== 'CANVAS') {
    chartArea =
      workspaceHost.querySelector('[data-testid="chart-area"]') ||
      workspaceHost.querySelector('.chart-area') ||
      workspaceHost.querySelector('.chart-container');

    if (!chartArea && doc) {
      chartArea = doc.createElement('div');
      chartArea.setAttribute('class', 'chart-area chart-container');
      chartArea.setAttribute('data-testid', 'chart-area');
      if (typeof workspaceHost.appendChild === 'function') {
        workspaceHost.appendChild(chartArea);
      }
    }

    if (chartArea && chartArea.style) {
      chartArea.style.display = 'flex';
      chartArea.style.flexDirection = 'column';
      chartArea.style.flex = '1 1 0%';
      chartArea.style.minWidth = '0';
      chartArea.style.minHeight = '0';
      chartArea.style.overflow = 'hidden';
      chartArea.style.position = 'relative';
      chartArea.style.height = '100%';
      chartArea.style.boxSizing = 'border-box';
    }
  }

  const canvasHost = chartArea || workspaceHost;

  // Resolve or mount chart canvas element inside workspace hierarchy
  let canvas =
    target.tagName === 'CANVAS'
      ? target
      : canvasHost.querySelector
      ? canvasHost.querySelector('canvas')
      : null;

  if (!canvas && doc && typeof doc.createElement === 'function') {
    canvas = doc.createElement('canvas');
    if (typeof canvas.setAttribute === 'function') {
      canvas.setAttribute('data-testid', 'chart-canvas');
      canvas.setAttribute('class', 'chart-canvas');
    }
    canvas.id = 'chart-canvas';

    const width = (opts && opts.width) || canvasHost.clientWidth || 800;
    const height = (opts && opts.height) || canvasHost.clientHeight || 600;
    canvas.width = width;
    canvas.height = height;

    if (canvas.style) {
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.flex = '1 1 0%';
      canvas.style.minHeight = '0';
    }

    if (typeof canvasHost.appendChild === 'function') {
      canvasHost.appendChild(canvas);
    }
  } else if (canvas && canvas.parentElement === target && chartArea && canvasHost === chartArea) {
    chartArea.appendChild(canvas);
  }

  // Mount moving average indicator legend element (DF-OVERLAYS-01)
  let indicatorLegend = null;
  if (canvasHost && doc && !canvasHost.querySelector('.indicator-legend')) {
    indicatorLegend = doc.createElement('div');
    indicatorLegend.setAttribute('class', 'indicator-legend');
    indicatorLegend.setAttribute('data-testid', 'indicator-legend');
    indicatorLegend.style.position = 'absolute';
    indicatorLegend.style.top = '10px';
    indicatorLegend.style.left = '10px';
    indicatorLegend.style.zIndex = '10';
    indicatorLegend.style.color = '#2962ff';
    indicatorLegend.style.fontSize = '12px';
    indicatorLegend.style.fontFamily = 'monospace';
    indicatorLegend.style.pointerEvents = 'none';

    const legendTitle = doc.createElement('span');
    legendTitle.textContent = 'EMA 20 ';
    indicatorLegend.appendChild(legendTitle);

    const legendVal = doc.createElement('span');
    legendVal.setAttribute('class', 'indicator-value');
    legendVal.textContent = '--';
    indicatorLegend.appendChild(legendVal);

    if (typeof canvasHost.appendChild === 'function') {
      canvasHost.appendChild(indicatorLegend);
    }
  }

  // Mount auxiliary dock alongside chart area horizontally
  let dock = null;
  let dockElement = workspaceHost.querySelector
    ? workspaceHost.querySelector('aside.auxiliary-dock') ||
      workspaceHost.querySelector('aside.dock') ||
      workspaceHost.querySelector('[data-testid="orders-panel"]')
    : null;

  if (!dockElement && isFullDom && target.tagName !== 'CANVAS') {
    const dockOpts = {
      document: doc,
      ...(opts && opts.dockOptions),
      ...(typeof opts?.dock === 'object' ? opts.dock : {}),
    };
    dock = new AuxiliaryDock(dockOpts);
    dockElement = dock.getElement();
    if (dockElement) {
      dockElement.__dockInstance = dock;
      if (typeof workspaceHost.appendChild === 'function') {
        workspaceHost.appendChild(dockElement);
      }
    }
  } else if (dockElement && dockElement.__dockInstance) {
    dock = dockElement.__dockInstance;
  }

  // Provide fallback mock getContext in headless/mock DOM environments if absent
  if (canvas && typeof canvas.getContext !== 'function') {
    canvas.getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      scale: () => {},
      translate: () => {},
      setLineDash: () => {},
      measureText: () => ({ width: 0 }),
      fillText: () => {},
      strokeText: () => {},
      arc: () => {},
      rect: () => {},
      clip: () => {},
      closePath: () => {},
    });
  }

  // Initialize interactive canvas controller
  let chart = canvas && canvas.__chartCanvas;
  if (!chart && canvas) {
    try {
      if (typeof ChartCanvas === 'function') {
        chart = new ChartCanvas(canvas, {
          ...opts,
          toolMode: activeTool,
          onRender: (cc, time) => {
            if (liveStatus) {
              const secs = typeof time === 'number' ? (time / 1000).toFixed(1) : '0.0';
              liveStatus.textContent = `● LIVE ${secs}s`;
            }
            if (typeof opts.onRender === 'function') {
              opts.onRender(cc, time);
            }
          },
        });
        if (indicatorLegend) {
          chart.legendElement = indicatorLegend;
        }
        canvas.__chartCanvas = chart;
      }
    } catch (_) {}
  }

  if (chart) {
    if (typeof chart.setToolMode === 'function') {
      chart.setToolMode(activeTool);
    } else if (typeof chart.setMode === 'function') {
      chart.setMode(activeTool);
    }
  }

  // Initialize candlestick series chart
  let innerChart = null;
  try {
    if (typeof Chart === 'function' && canvas) {
      innerChart = new Chart(canvas, {
        width: (canvas && canvas.width) || 800,
        height: (canvas && canvas.height) || 600,
        priceScaleWidth: opts.priceScaleWidth !== undefined ? opts.priceScaleWidth : 60,
        timeScaleHeight: opts.timeScaleHeight !== undefined ? opts.timeScaleHeight : 30,
        candles:
          (opts && (opts.candles || opts.data)) ||
          (typeof generateDefaultCandles === 'function' ? generateDefaultCandles(60) : []),
        ticker: (opts && opts.ticker) || 'BTC-USD',
        timeframe: (opts && opts.timeframe) || '1h',
        ...opts,
      });

      if (chart) {
        chart.innerChart = innerChart;
      }
    }
  } catch (_) {}

  if (chart && typeof chart.startAnimationLoop === 'function') {
    chart.startAnimationLoop();
  }

  // Bind responsive canvas auto-resize listeners preserving side-by-side geometry without scrolling
  const handleResize = () => {
    if (!canvas) return;

    const winWidth = (win && win.innerWidth) || 1280;
    const winHeight = (win && win.innerHeight) || 800;

    const headerHeight = (header && (header.offsetHeight || header.clientHeight)) || 48;
    const toolsWidth = (toolsPanel && (toolsPanel.offsetWidth || toolsPanel.clientWidth)) || 48;
    const dockWidth =
      (dockElement && (dockElement.offsetWidth || dockElement.clientWidth)) ||
      (dock && dock.isCollapsed() ? 40 : 280);

    const availableWidth = Math.max(
      300,
      (chartArea && chartArea.clientWidth) || winWidth - toolsWidth - dockWidth
    );
    const availableHeight = Math.max(
      200,
      (chartArea && chartArea.clientHeight) || winHeight - headerHeight
    );

    canvas.width = availableWidth;
    canvas.height = availableHeight;

    if (innerChart && typeof innerChart.resize === 'function') {
      innerChart.resize(availableWidth, availableHeight);
    }

    if (chart && typeof chart.render === 'function') {
      chart.render();
    }
  };

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('resize', handleResize);
  }

  // Enforce cohesive dark theme classes across all interactive controls mounted
  applyDarkThemeToControls(target);

  // Application instance
  const appInstance = {
    chart,
    canvas,
    container: target,
    workspace,
    toolsPanel,
    chartArea,
    palette,
    dock,
    innerChart,
    handleResize,
    getActiveTool() {
      return activeTool;
    },
    getToolMode() {
      return activeTool;
    },
    setToolMode(tool) {
      activeTool = tool;
      if (toolPaletteObj) {
        toolPaletteObj.updateActiveState(tool);
      }
      if (chart) {
        if (typeof chart.setToolMode === 'function') chart.setToolMode(tool);
        else if (typeof chart.setMode === 'function') chart.setMode(tool);
      }
    },
    getChart() {
      return this.chart;
    },
    getDock() {
      return dock;
    },
    isDockCollapsed() {
      return dock ? dock.isCollapsed() : false;
    },
    toggleDock() {
      return dock ? dock.toggle() : false;
    },
    getViewport() {
      return this.chart && typeof this.chart.getViewport === 'function'
        ? this.chart.getViewport()
        : { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
    },
    getViewportMatrix() {
      return this.chart && typeof this.chart.getViewportMatrix === 'function'
        ? this.chart.getViewportMatrix()
        : [1, 0, 0, 1, 0, 0];
    },
    render(...args) {
      return this.chart && typeof this.chart.render === 'function' ? this.chart.render(...args) : undefined;
    },
    destroy() {
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('resize', handleResize);
      }
      if (this.chart && typeof this.chart.destroy === 'function') {
        this.chart.destroy();
      }
      if (dock && typeof dock.destroy === 'function') {
        dock.destroy();
      }
    },
    unmount() {
      this.destroy();
      if (workspace && workspace.parentElement) {
        workspace.parentElement.removeChild(workspace);
      }
      if (toolsPanel && toolsPanel.parentElement) {
        toolsPanel.parentElement.removeChild(toolsPanel);
      }
      if (dockElement && dockElement.parentElement) {
        dockElement.parentElement.removeChild(dockElement);
      }
      if (palette && palette.parentElement) {
        palette.parentElement.removeChild(palette);
      }
      if (header && header.parentElement) {
        header.parentElement.removeChild(header);
      }
      if (canvas && canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
      if (target) {
        target.__nexus_mounted = false;
        delete target.__appInstance;
        delete target.__chart;
      }
    },
  };

  if (chart) {
    chart.chart = chart;
    chart.getChart = () => chart;
  }

  if (target) {
    target.__chart = chart;
    target.__appInstance = appInstance;
  }

  return appInstance;
}

export function initApp(container, options = {}) {
  return mountApp(container, options);
}

export function mount(container, options = {}) {
  return mountApp(container, options);
}

export function init(container, options = {}) {
  return mountApp(container, options);
}

export function initializeApp(container, options = {}) {
  return mountApp(container, options);
}

export function bootstrap(container, options = {}) {
  return mountApp(container, options);
}

export function unmount(container) {
  const target =
    typeof container === 'string' && typeof document !== 'undefined'
      ? document.querySelector(container)
      : container || (typeof document !== 'undefined' ? document.getElementById('app') : null);
  if (target && target.__appInstance && typeof target.__appInstance.unmount === 'function') {
    target.__appInstance.unmount();
  }
}

export default mountApp;

// CRITICAL ENTRYPOINT AUTO-MOUNT INVARIANT
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}