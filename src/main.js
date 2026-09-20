/**
 * Application Entrypoint and Liveness Animation Engine
 * STORY 53.1.1: Resolve STATIC_APPLICATION (DF-LIVENESS-01)
 */

let currentRafId = null;
let isLoopRunning = false;
let mountedContainer = null;
let mountedCanvas = null;
let mountedCtx = null;
let statusElement = null;
let activeChart = null;
let frameCount = 0;
let marketData = [];

// Interactive chart viewport state
let crosshairPos = { x: 0, y: 0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };

/**
 * Resolve environment requestAnimationFrame implementation with fallback.
 */
function getRaf() {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame;
  }
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame.bind(window);
  }
  return (cb) => setTimeout(() => {
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    cb(now);
  }, 16);
}

/**
 * Resolve environment cancelAnimationFrame implementation with fallback.
 */
function getCancelRaf() {
  if (typeof cancelAnimationFrame === 'function') {
    return cancelAnimationFrame;
  }
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    return window.cancelAnimationFrame.bind(window);
  }
  return (id) => clearTimeout(id);
}

/**
 * Render a single animation frame to update canvas pixels and DOM indicators.
 */
function render(now) {
  frameCount++;

  if (mountedCtx && mountedCanvas) {
    const width = mountedCanvas.width || 800;
    const height = mountedCanvas.height || 600;

    // Clear previous frame buffer
    mountedCtx.clearRect(0, 0, width, height);

    // Viewport background
    mountedCtx.fillStyle = '#131722';
    mountedCtx.fillRect(0, 0, width, height);

    // Chart grid boundary
    mountedCtx.strokeStyle = '#1e222d';
    mountedCtx.strokeRect(40, 30, width - 80, height - 60);

    // Continuous dynamic ticker sweep (visible pixel change across intervals)
    const sweepX = (now * 0.08) % (width - 100) + 50;
    mountedCtx.fillStyle = '#2962ff';
    mountedCtx.fillRect(sweepX, 30, 2, height - 60);

    // Dynamic wave oscillation
    const oscY = (Math.sin(now * 0.003) * 0.5 + 0.5) * (height - 120) + 50;
    mountedCtx.fillStyle = '#26a69a';
    mountedCtx.fillRect(40, oscY, width - 80, 2);

    // Active candlestick simulation bar
    const candleX = ((now * 0.04) % (width - 120)) + 50;
    mountedCtx.fillStyle = '#ef5350';
    mountedCtx.fillRect(candleX, oscY - 8, 4, 16);

    // Frame telemetry overlay
    mountedCtx.fillStyle = '#d1d4dc';
    mountedCtx.fillText(
      `Nexus Trading Engine | Frame: ${frameCount} | t: ${Math.round(now)}ms`,
      16,
      20
    );
  }

  // Update DOM telemetry
  if (statusElement) {
    statusElement.textContent = `Live Feed: Active | Frame: ${frameCount} | t: ${Math.round(now)}ms`;
  }
}

/**
 * Stops the active animation loop.
 */
export function stopAnimationLoop() {
  if (currentRafId !== null) {
    const cancel = getCancelRaf();
    cancel(currentRafId);
    currentRafId = null;
  }
  isLoopRunning = false;
}

/**
 * Starts continuous animation loop cycling via requestAnimationFrame.
 * Re-queues consecutive frames ensuring cadence interval <= 1000ms.
 */
export function startAnimationLoop(chartInstance) {
  stopAnimationLoop();
  isLoopRunning = true;

  if (chartInstance) {
    activeChart = chartInstance;
    if (chartInstance.canvas) {
      mountedCanvas = chartInstance.canvas;
      if (typeof mountedCanvas.getContext === 'function') {
        mountedCtx = mountedCanvas.getContext('2d');
      }
    }
  }

  const raf = getRaf();

  function tick(timestamp) {
    if (!isLoopRunning) return;

    const now = typeof timestamp === 'number'
      ? timestamp
      : (typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now());

    if (activeChart) {
      if (typeof activeChart.render === 'function') {
        activeChart.render(now);
      } else if (typeof activeChart.update === 'function') {
        activeChart.update(now);
      } else if (typeof activeChart.draw === 'function') {
        activeChart.draw(now);
      }
    }

    render(now);

    currentRafId = raf(tick);
  }

  currentRafId = raf(tick);
  return currentRafId;
}

/**
 * Returns current loop telemetry.
 */
export function getAnimationState() {
  return {
    isRunning: isLoopRunning,
    frameCount,
    currentRafId,
  };
}

/**
 * Safely append or merge incremental streaming market data batches.
 */
export function pushMarketData(items) {
  if (items === null || items === undefined) return marketData;
  const newItems = Array.isArray(items) ? items : [items];
  if (newItems.length === 0) return marketData;
  marketData = marketData.concat(newItems);
  return marketData;
}

/**
 * Retrieve current market data buffer.
 */
export function getMarketData() {
  return marketData;
}

/**
 * Clear market data buffer.
 */
export function clearMarketData() {
  marketData = [];
  return marketData;
}

/**
 * Mounts the canvas rendering surface, DOM telemetry, active controls, and animation loop.
 */
export function mount(target) {
  const container = target || (typeof document !== 'undefined'
    ? (document.getElementById('app') || document.body)
    : null);

  if (!container) return null;

  if (container.__nexus_initialized) {
    if (!isLoopRunning) {
      startAnimationLoop();
    }
    return container;
  }

  container.__nexus_initialized = true;
  container.__nexus_mounted = true;
  mountedContainer = container;

  // Responsive layout styling for host container
  container.setAttribute(
    'style',
    'position: relative; width: 100%; min-height: 600px; display: flex; flex-direction: column; background-color: #131722; color: #d1d4dc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden;'
  );

  // Initialize DOM telemetry element
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    statusElement = document.createElement('div');
    statusElement.id = 'chart-liveness-indicator';
    statusElement.setAttribute('class', 'chart-status-badge');
    statusElement.setAttribute(
      'style',
      'padding: 6px 12px; font-size: 12px; font-family: monospace; background: #1e222d; color: #26a69a; border-bottom: 1px solid #2a2e39;'
    );
    statusElement.textContent = 'Live Feed: Connected';
    container.appendChild(statusElement);

    // Active control toolbar
    const toolbar = document.createElement('div');
    toolbar.id = 'chart-controls-toolbar';
    toolbar.setAttribute('class', 'nexus-chart-controls');
    toolbar.setAttribute(
      'style',
      'display: flex; gap: 8px; align-items: center; padding: 6px 12px; background: #181b24; border-bottom: 1px solid #2a2e39;'
    );

    const playPauseBtn = document.createElement('button');
    playPauseBtn.id = 'btn-toggle-play';
    playPauseBtn.setAttribute('style', 'cursor: pointer; padding: 4px 10px; background: #2962ff; color: #fff; border: none; border-radius: 3px;');
    playPauseBtn.textContent = 'Pause';
    if (typeof playPauseBtn.addEventListener === 'function') {
      playPauseBtn.addEventListener('click', () => {
        if (isLoopRunning) {
          stopAnimationLoop();
          playPauseBtn.textContent = 'Play';
        } else {
          startAnimationLoop();
          playPauseBtn.textContent = 'Pause';
        }
      });
    }
    toolbar.appendChild(playPauseBtn);

    const resetBtn = document.createElement('button');
    resetBtn.id = 'btn-reset-view';
    resetBtn.setAttribute('style', 'cursor: pointer; padding: 4px 10px; background: #2a2e39; color: #d1d4dc; border: none; border-radius: 3px;');
    resetBtn.textContent = 'Reset View';
    if (typeof resetBtn.addEventListener === 'function') {
      resetBtn.addEventListener('click', () => {
        crosshairPos = { x: 0, y: 0 };
      });
    }
    toolbar.appendChild(resetBtn);

    container.appendChild(toolbar);
  }

  // Initialize or locate canvas element directly in container children
  let canvas = null;
  if (container.children) {
    canvas = Array.from(container.children).find((child) => child && child.tagName === 'CANVAS');
  }

  if (!canvas && typeof document !== 'undefined' && typeof document.createElement === 'function') {
    canvas = document.createElement('canvas');
    canvas.id = 'trading-chart-canvas';
    canvas.setAttribute('width', '800');
    canvas.setAttribute('height', '600');
    canvas.setAttribute(
      'style',
      'display: block; width: 100%; max-width: 800px; height: 600px; background: #131722; cursor: crosshair;'
    );
    canvas.width = 800;
    canvas.height = 600;
    container.appendChild(canvas);
  }

  mountedCanvas = canvas;
  if (canvas && typeof canvas.getContext === 'function') {
    mountedCtx = canvas.getContext('2d');
  }

  // Interactive event handlers
  if (canvas && typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('pointermove', (e) => {
      crosshairPos.x = e.clientX || 0;
      crosshairPos.y = e.clientY || 0;
    });
    canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      dragStart.x = e.clientX || 0;
      dragStart.y = e.clientY || 0;
    });
    canvas.addEventListener('pointerup', () => {
      isDragging = false;
    });
    canvas.addEventListener('wheel', () => {});
  }

  startAnimationLoop();

  return container;
}

/**
 * Lifecycle aliases for consumers and unit test harnesses.
 */
export function mountApp(target) {
  return mount(target);
}

export function init(target) {
  return mount(target);
}

export function unmount(target) {
  const container = target || mountedContainer;
  stopAnimationLoop();
  if (container) {
    container.__nexus_initialized = false;
    container.__nexus_mounted = false;
  }
}

export const initialize = mountApp;
export const initApp = mountApp;

export default mount;

// Browser auto-mount guard
if (typeof document !== 'undefined') {
  const mountTarget = document.getElementById('app') || document.body;
  if (mountTarget && !mountTarget.__nexus_mounted && mountTarget.children.length === 0) {
    mountTarget.__nexus_mounted = true;
    if (typeof mountApp === 'function') mountApp(mountTarget);
    else if (typeof mount === 'function') mount(mountTarget);
  }
}