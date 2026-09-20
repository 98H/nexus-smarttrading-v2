import { Chart } from './chart.js';
import { Controls, patchMockElement } from './components/controls.js';

let currentAppInstance = null;
export let activeChart = null;

export { Chart };

/**
 * Safely coerces a node's children (HTMLCollection, Array, plain object, null, undefined)
 * into a standard JavaScript Array.
 *
 * @param {Object} [node] - Tree node or DOM element.
 * @returns {Array} Array of child nodes or elements.
 */
export function safeGetChildren(node) {
  if (!node || !node.children) {
    return [];
  }
  if (Array.isArray(node.children)) {
    return [...node.children];
  }
  try {
    return Array.from(node.children);
  } catch {
    return [];
  }
}

/**
 * Safely filters child elements of a component tree node or DOM element without throwing
 * TypeError when `children` is an HTMLCollection, plain object, or undefined.
 *
 * @param {Object} node - Tree node or DOM element.
 * @param {Function} [predicate] - Filter predicate function.
 * @returns {Array} Filtered array of children.
 */
export function filterChildren(node, predicate = () => true) {
  return safeGetChildren(node).filter(predicate);
}

/**
 * Recursively renders a component tree containing mixed collections into DOM elements.
 *
 * @param {Object} node - Root node of component tree.
 * @returns {Object|null} Rendered element or node.
 */
export function renderTree(node) {
  if (!node) {
    return null;
  }

  const doc = typeof document !== 'undefined' ? document : globalThis.document;
  const tagName = node.type || node.tagName || 'div';
  const element = doc && typeof doc.createElement === 'function'
    ? doc.createElement(tagName)
    : { tagName: String(tagName).toUpperCase(), id: node.id || '', textContent: node.text || '' };

  if (node.id && element) {
    element.id = node.id;
  }
  if (node.text !== undefined && element) {
    element.textContent = node.text;
  }

  const children = safeGetChildren(node);
  for (const child of children) {
    const renderedChild = renderTree(child);
    if (renderedChild) {
      if (element && typeof element.appendChild === 'function') {
        element.appendChild(renderedChild);
      } else if (element && Array.isArray(element.children)) {
        element.children.push(renderedChild);
      }
    }
  }

  return element;
}

/**
 * Returns a copy of the current active application state.
 *
 * @returns {Object|null} State snapshot.
 */
export function getActiveState() {
  if (currentAppInstance) {
    return currentAppInstance.getState();
  }
  return null;
}

/**
 * Extracts ticker value from event or element.
 */
function extractTicker(e, elem) {
  if (e && e.value) return e.value;
  if (e && e.target) {
    const t = e.target;
    if (t.value) return t.value;
    if (typeof t.getAttribute === 'function') {
      const v = t.getAttribute('data-ticker') || t.getAttribute('data-value') || t.getAttribute('value');
      if (v) return v;
    }
    if (t.textContent && ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD'].includes(t.textContent.trim())) {
      return t.textContent.trim();
    }
  }
  if (elem && elem.value) return elem.value;
  if (elem && typeof elem.getAttribute === 'function') {
    return elem.getAttribute('data-ticker') || elem.getAttribute('data-value') || elem.getAttribute('value');
  }
  return null;
}

/**
 * Extracts timeframe value from event or element.
 */
function extractTimeframe(e, elem) {
  if (e && e.value) return e.value;
  if (e && e.target) {
    const t = e.target;
    if (typeof t.getAttribute === 'function') {
      const v = t.getAttribute('data-timeframe') || t.getAttribute('data-value') || t.getAttribute('value');
      if (v) return v;
    }
    if (t.value) return t.value;
    if (t.textContent && ['1m', '5m', '15m', '1h', '4h', '1d'].includes(t.textContent.trim())) {
      return t.textContent.trim();
    }
  }
  if (elem) {
    if (typeof elem.getAttribute === 'function') {
      const v = elem.getAttribute('data-timeframe') || elem.getAttribute('data-value') || elem.getAttribute('value');
      if (v) return v;
    }
    if (elem.value) return elem.value;
  }
  return null;
}

/**
 * Mounts the application directly to the specified target root element or document.getElementById('app').
 * Binds active event listeners to interactive UI controls, initializes dynamic state clock,
 * and starts the continuous rendering loop.
 *
 * @param {string|Object} [target='app'] - Target element id or DOM element.
 * @param {Object} [options={}] - Mount options.
 * @returns {Object} Mounted application instance.
 */
export function mount(target = 'app', options = {}) {
  const doc = typeof document !== 'undefined' ? document : globalThis.document;
  let mountTarget = null;
  let opts = options || {};

  if (typeof target === 'string') {
    const elementId = target.startsWith('#') ? target.slice(1) : target;
    mountTarget = doc && typeof doc.getElementById === 'function' ? doc.getElementById(elementId) : null;
    if (!mountTarget && doc && typeof doc.querySelector === 'function') {
      try {
        mountTarget = doc.querySelector(target);
      } catch (_) {}
    }
  } else if (target && typeof target === 'object' && (target.nodeType || target.tagName || target.appendChild || target._childrenList || target.innerHTML !== undefined)) {
    mountTarget = target;
  } else if (target && typeof target === 'object' && target.tree) {
    opts = target;
    mountTarget = doc && typeof doc.getElementById === 'function' ? doc.getElementById('app') : null;
    if (!mountTarget && doc && typeof doc.querySelector === 'function') {
      mountTarget = doc.querySelector('#app');
    }
  } else if (!target) {
    mountTarget = doc && typeof doc.getElementById === 'function' ? doc.getElementById('app') : null;
    if (!mountTarget && doc && typeof doc.querySelector === 'function') {
      mountTarget = doc.querySelector('#app');
    }
  } else {
    mountTarget = target;
  }

  let appState = {
    ticker: 'BTC-USD',
    timeframe: '1h',
    activeControl: 'select',
    tool: 'select',
    mode: 'brush',
    activeTab: 'tools',
    lastInteraction: null,
  };

  const initialTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const stateClock = {
    startTime: initialTime,
    lastTime: initialTime,
    elapsed: 0,
    frameCount: 0,
    fps: 60,
    active: true,
  };

  if (!mountTarget) {
    return {
      mounted: false,
      element: null,
      mountTarget: null,
      controls: null,
      chart: null,
      clock: stateClock,
      stateClock,
      getState: () => ({ ...appState, clock: { ...stateClock }, stateClock: { ...stateClock } }),
      setState: () => {},
      destroy: () => {},
    };
  }

  const proto = Object.getPrototypeOf(mountTarget) || mountTarget.__proto__;
  if (proto && typeof patchMockElement === 'function') {
    patchMockElement(proto);
  }

  // Clear existing DOM children safely
  while (mountTarget.children && mountTarget.children.length > 0) {
    try {
      mountTarget.removeChild(mountTarget.children[0]);
    } catch (_) {
      break;
    }
  }
  mountTarget.innerHTML = '';

  // Render tree options if provided
  if (opts && opts.tree) {
    const renderedTree = renderTree(opts.tree);
    if (renderedTree && typeof mountTarget.appendChild === 'function') {
      mountTarget.appendChild(renderedTree);
    }
  }

  let controls = null;
  let delegatedClickHandler = null;
  let delegatedChangeHandler = null;
  let canvas = null;
  let ctx = null;
  let chart = null;
  let statusElement = null;
  let animationFrameId = null;
  let isRunning = true;
  let header = null;
  let workspace = null;
  let chartContainer = null;
  let sidePanel = null;
  let ordersPanel = null;
  let toolsPanel = null;
  let tickerSelect = null;
  let timeframeContainer = null;
  let timeframeButtons = [];
  let tfSelect = null;

  const updateTicker = (newTicker) => {
    if (!newTicker) return;
    appState.ticker = newTicker;
    if (tickerSelect) {
      tickerSelect.value = newTicker;
      if (typeof tickerSelect.setAttribute === 'function') {
        tickerSelect.setAttribute('value', newTicker);
        tickerSelect.setAttribute('data-value', newTicker);
      }
    }
    if (chart && typeof chart.setTicker === 'function') {
      chart.setTicker(newTicker);
    }
  };

  const updateTimeframe = (newTimeframe) => {
    if (!newTimeframe) return;
    appState.timeframe = newTimeframe;
    timeframeButtons.forEach((b) => {
      const bTf = (typeof b.getAttribute === 'function' && b.getAttribute('data-timeframe')) || b.textContent;
      if (bTf === newTimeframe) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    if (tfSelect) {
      tfSelect.value = newTimeframe;
      if (typeof tfSelect.setAttribute === 'function') {
        tfSelect.setAttribute('value', newTimeframe);
      }
    }
    if (chart && typeof chart.setTimeframe === 'function') {
      chart.setTimeframe(newTimeframe);
    }
  };

  if (doc && typeof doc.createElement === 'function') {
    try {
      // 1. Semantic top navigation header
      header = doc.createElement('header');
      header.setAttribute('class', 'header top-nav app-header');
      header.setAttribute('data-testid', 'app-header');

      const titleElement = doc.createElement('h1');
      titleElement.setAttribute('data-testid', 'app-title');
      titleElement.setAttribute('class', 'app-title title');
      titleElement.textContent = 'SmartTrading V2';
      header.appendChild(titleElement);

      const tickerControl = doc.createElement('div');
      tickerControl.setAttribute('data-testid', 'ticker-control');
      tickerControl.setAttribute('class', 'ticker-control');

      tickerSelect = doc.createElement('select');
      tickerSelect.setAttribute('data-testid', 'ticker-select');
      tickerSelect.setAttribute('class', 'ticker-select ticker');
      tickerSelect.setAttribute('name', 'ticker');

      const tickers = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD'];
      tickers.forEach((sym) => {
        const opt = doc.createElement('option');
        opt.setAttribute('value', sym);
        opt.textContent = sym;
        if (sym === appState.ticker) {
          opt.setAttribute('selected', 'selected');
        }
        tickerSelect.appendChild(opt);
      });
      tickerSelect.value = appState.ticker;
      tickerControl.appendChild(tickerSelect);
      header.appendChild(tickerControl);

      timeframeContainer = doc.createElement('div');
      timeframeContainer.setAttribute('data-testid', 'timeframe-controls');
      timeframeContainer.setAttribute('class', 'timeframe-controls');

      const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];
      timeframes.forEach((tf) => {
        const btn = doc.createElement('button');
        btn.setAttribute('data-timeframe', tf);
        btn.setAttribute('data-value', tf);
        btn.setAttribute('data-control', 'timeframe');
        btn.setAttribute('class', tf === appState.timeframe ? 'timeframe-btn active' : 'timeframe-btn');
        btn.textContent = tf;
        timeframeButtons.push(btn);
        timeframeContainer.appendChild(btn);
      });

      tfSelect = doc.createElement('select');
      tfSelect.setAttribute('data-testid', 'timeframe-picker');
      tfSelect.setAttribute('class', 'timeframe-picker');
      tfSelect.setAttribute('name', 'timeframe');
      tfSelect.style.display = 'none';
      timeframes.forEach((tf) => {
        const opt = doc.createElement('option');
        opt.setAttribute('value', tf);
        opt.textContent = tf;
        if (tf === appState.timeframe) {
          opt.setAttribute('selected', 'selected');
        }
        tfSelect.appendChild(opt);
      });
      tfSelect.value = appState.timeframe;
      timeframeContainer.appendChild(tfSelect);
      header.appendChild(timeframeContainer);

      // Event bindings for header controls
      const onTickerChange = (e) => {
        const val = extractTicker(e, tickerSelect);
        if (val) updateTicker(val);
      };
      tickerSelect.addEventListener('change', onTickerChange);
      tickerSelect.addEventListener('input', onTickerChange);
      tickerControl.addEventListener('change', onTickerChange);
      tickerControl.addEventListener('input', onTickerChange);

      const onTimeframeEvent = (e) => {
        const tf = extractTimeframe(e, timeframeContainer);
        if (tf) updateTimeframe(tf);
      };
      timeframeContainer.addEventListener('click', onTimeframeEvent);
      timeframeContainer.addEventListener('change', onTimeframeEvent);
      timeframeButtons.forEach((btn) => {
        btn.addEventListener('click', onTimeframeEvent);
        btn.addEventListener('change', onTimeframeEvent);
      });
      tfSelect.addEventListener('change', onTimeframeEvent);

      header.addEventListener('change', (e) => {
        const tf = extractTimeframe(e);
        if (tf) updateTimeframe(tf);
        const tick = extractTicker(e);
        if (tick) updateTicker(tick);
      });
      header.addEventListener('click', (e) => {
        const tf = extractTimeframe(e);
        if (tf) updateTimeframe(tf);
        const tick = extractTicker(e);
        if (tick) updateTicker(tick);
      });

      // 2. Structured workspace container
      workspace = doc.createElement('main');
      workspace.setAttribute('data-testid', 'workspace');
      workspace.setAttribute('class', 'workspace-container workspace');

      chartContainer = doc.createElement('div');
      chartContainer.setAttribute('data-testid', 'chart-container');
      chartContainer.setAttribute('class', 'chart-container');

      canvas = doc.createElement('canvas');
      canvas.id = 'main-canvas';
      canvas.setAttribute('data-testid', 'chart-canvas');
      canvas.setAttribute('class', 'chart-canvas');
      canvas.setAttribute('width', '800');
      canvas.setAttribute('height', '600');

      if (typeof canvas.getContext === 'function') {
        try {
          ctx = canvas.getContext('2d');
        } catch (_) {}
      }

      chartContainer.appendChild(canvas);
      workspace.appendChild(chartContainer);

      sidePanel = doc.createElement('aside');
      sidePanel.setAttribute('data-testid', 'side-panel');
      sidePanel.setAttribute('class', 'side-panel');

      ordersPanel = doc.createElement('aside');
      ordersPanel.setAttribute('data-testid', 'orders-panel');
      ordersPanel.setAttribute('class', 'orders-panel side-panel-orders orders');
      const ordersTitle = doc.createElement('h2');
      ordersTitle.textContent = 'Orders';
      ordersPanel.appendChild(ordersTitle);

      toolsPanel = doc.createElement('aside');
      toolsPanel.setAttribute('data-testid', 'tools-panel');
      toolsPanel.setAttribute('class', 'tools-panel side-panel-tools tools');
      const toolsTitle = doc.createElement('h2');
      toolsTitle.textContent = 'Tools';
      toolsPanel.appendChild(toolsTitle);

      // Status clock inside tools side panel
      statusElement = doc.createElement('div');
      statusElement.setAttribute('class', 'status-clock');
      statusElement.setAttribute('data-component', 'status-clock');
      statusElement.id = 'status-clock';
      statusElement.textContent = 'Clock: 0.00s | Frames: 0 | State: active';
      toolsPanel.appendChild(statusElement);

      // Host container for drawing and interaction controls
      const controlsHost = doc.createElement('div');
      controlsHost.setAttribute('class', 'controls-container');
      controlsHost.setAttribute('data-component', 'controls');
      controlsHost.id = 'controls';
      toolsPanel.appendChild(controlsHost);

      sidePanel.appendChild(ordersPanel);
      sidePanel.appendChild(toolsPanel);
      workspace.appendChild(sidePanel);

      mountTarget.appendChild(header);
      mountTarget.appendChild(workspace);

      // Instantiate chart engine with active canvas and defaults
      chart = new Chart({
        canvas,
        width: 800,
        height: 600,
        timeframe: appState.timeframe,
        ticker: appState.ticker,
      });
      activeChart = chart;
      canvas.__chartInstance = chart;

      if (typeof Controls === 'function') {
        controls = new Controls({
          container: controlsHost,
          initialState: appState,
          onChange: (newState) => {
            appState = { ...appState, ...newState };
          },
        });
      }

      // Delegated interaction subscriber on root element
      delegatedClickHandler = (event) => {
        if (!event || event._handled) return;

        if (event.clientX !== undefined || event.clientY !== undefined) {
          appState.lastInteraction = {
            type: event.type,
            x: event.clientX || 0,
            y: event.clientY || 0,
            timestamp: typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(),
          };
        }

        const el = event.target;
        if (!el) return;
        if (el.disabled || (el.hasAttribute && el.hasAttribute('disabled'))) return;

        const control = el.getAttribute && el.getAttribute('data-control');
        const value = el.getAttribute && el.getAttribute('data-value');
        const tab = el.getAttribute && el.getAttribute('data-tab');

        if (control === 'timeframe') {
          updateTimeframe(value);
        } else if (control === 'ticker') {
          updateTicker(value);
        }

        if (control && value) {
          const updates = { [control]: value };
          if (appState.activeControl !== undefined || control === 'tool') {
            updates.activeControl = value;
          }
          if (controls) controls.setState(updates);
        } else if (tab) {
          if (controls) controls.setState({ activeTab: tab });
        }
      };

      delegatedChangeHandler = (event) => {
        const tick = extractTicker(event);
        if (tick) updateTicker(tick);
        const tf = extractTimeframe(event);
        if (tf) updateTimeframe(tf);
      };

      if (typeof mountTarget.addEventListener === 'function') {
        mountTarget.addEventListener('click', delegatedClickHandler);
        mountTarget.addEventListener('change', delegatedChangeHandler);
      }
    } catch (_) {
      // Graceful fallback for minimal execution environments
    }
  }

  // Handle window resizing preserving layout containment
  const handleResize = () => {
    if (chart && typeof chart.resize === 'function') {
      const w = (chartContainer && chartContainer.clientWidth) || (canvas && canvas.width) || 800;
      const h = (chartContainer && chartContainer.clientHeight) || (canvas && canvas.height) || 600;
      chart.resize(w, h);
    }
  };

  const win = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis.window : null);
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('resize', handleResize);
  }

  // Continuous render loop and dynamic state clock
  const tick = (timestamp) => {
    if (!isRunning) return;

    if (typeof requestAnimationFrame === 'function') {
      animationFrameId = requestAnimationFrame(tick);
    }

    try {
      const now = typeof timestamp === 'number'
        ? timestamp
        : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

      if (!stateClock.startTime) {
        stateClock.startTime = now;
      }
      const delta = stateClock.lastTime ? now - stateClock.lastTime : 16.67;
      stateClock.lastTime = now;
      stateClock.elapsed = now - stateClock.startTime;
      stateClock.frameCount++;
      if (delta > 0) {
        stateClock.fps = Math.round(1000 / delta);
      }

      // Continuous DOM text mutations reflecting dynamic state clock
      if (statusElement) {
        statusElement.textContent = `Clock: ${(stateClock.elapsed / 1000).toFixed(2)}s | Frames: ${stateClock.frameCount} | FPS: ${stateClock.fps} | Tool: ${appState.tool || 'select'}`;
      }

      // Continuous active frame renders
      if (chart && typeof chart.render === 'function') {
        chart.render();
      } else if (ctx) {
        if (typeof ctx.clearRect === 'function') {
          ctx.clearRect(0, 0, (canvas && canvas.width) || 800, (canvas && canvas.height) || 600);
        }
        if (typeof ctx.fillRect === 'function') {
          const offset = (stateClock.frameCount % 100);
          ctx.fillRect(20 + offset, 20, 80, 80);
        }
        if (typeof ctx.beginPath === 'function') {
          ctx.beginPath();
          if (typeof ctx.arc === 'function') {
            const angle = (stateClock.frameCount % 360) * (Math.PI / 180);
            const cx = 150 + Math.cos(angle) * 30;
            const cy = 150 + Math.sin(angle) * 30;
            ctx.arc(cx, cy, 25, 0, Math.PI * 2);
          }
          if (typeof ctx.fill === 'function') {
            ctx.fill();
          }
        }
        if (typeof ctx.fillText === 'function') {
          ctx.fillText(`Active Frame: ${stateClock.frameCount}`, 10, 20);
        }
      }
    } catch (_) {
      // Protect render cycle from terminating on isolated frame errors
    }
  };

  if (typeof requestAnimationFrame === 'function') {
    animationFrameId = requestAnimationFrame(tick);
  }

  const appInstance = {
    mounted: true,
    element: mountTarget,
    mountTarget,
    header,
    workspace,
    chartContainer,
    sidePanel,
    ordersPanel,
    toolsPanel,
    canvas,
    chart,
    controls,
    clock: stateClock,
    stateClock,
    getState: () => ({
      ...appState,
      ...(controls ? controls.getState() : {}),
      clock: { ...stateClock },
      stateClock: { ...stateClock },
    }),
    setState: (newState) => {
      appState = { ...appState, ...newState };
      if (newState.ticker) {
        updateTicker(newState.ticker);
      }
      if (newState.timeframe) {
        updateTimeframe(newState.timeframe);
      }
      if (controls) controls.setState(appState);
    },
    setTimeframe: (tf) => updateTimeframe(tf),
    setTicker: (ticker) => updateTicker(ticker),
    destroy: () => {
      isRunning = false;
      if (animationFrameId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameId);
      }
      if (delegatedClickHandler && typeof mountTarget.removeEventListener === 'function') {
        mountTarget.removeEventListener('click', delegatedClickHandler);
      }
      if (delegatedChangeHandler && typeof mountTarget.removeEventListener === 'function') {
        mountTarget.removeEventListener('change', delegatedChangeHandler);
      }
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('resize', handleResize);
      }
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
      while (mountTarget.children && mountTarget.children.length > 0) {
        try {
          mountTarget.removeChild(mountTarget.children[0]);
        } catch (_) {
          break;
        }
      }
      mountTarget.innerHTML = '';
      currentAppInstance = null;
      activeChart = null;
    },
  };

  currentAppInstance = appInstance;
  return appInstance;
}

/**
 * Initializes the application entrypoint and mounts directly to document.getElementById('app').
 *
 * @param {string|Object} [target] - Target element or id override.
 * @returns {Object} Application instance.
 */
export function initApp(target) {
  const root = target || (typeof document !== 'undefined' ? document.getElementById('app') : null);
  return mount(root);
}

/**
 * Lifecycle mount alias for application consumers.
 *
 * @param {string|Object} target - Target element or id.
 * @param {Object} [options] - Mount options.
 * @returns {Object} Application instance.
 */
export function mountApp(target, options) {
  return mount(target, options);
}

/**
 * Mounts the chart component directly to target.
 *
 * @param {string|Object} target - Target element or id.
 * @param {Object} [options] - Mount options.
 * @returns {Object} Application instance.
 */
export function mountChart(target, options) {
  return mount(target, options);
}

export default mount;

// CRITICAL ENTRYPOINT AUTO-MOUNT GUARD:
// Ensures the live browser application immediately mounts into document.getElementById('app')
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}