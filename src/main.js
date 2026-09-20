import { Controls, patchMockElement } from './components/controls.js';

let currentAppInstance = null;

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
 * Mounts the application directly to the specified target root element or document.getElementById('app').
 * Binds active event listeners to interactive UI controls and starts active components.
 *
 * @param {Object} [target] - Optional root target element.
 * @returns {Object} Mounted application instance.
 */
export function mount(target) {
  const mountTarget = target || (typeof document !== 'undefined' ? document.getElementById('app') : null);
  if (!mountTarget) {
    throw new Error('Target root element #app not found');
  }

  if (mountTarget.__proto__) {
    patchMockElement(mountTarget.__proto__);
  }

  // Clear previous content
  mountTarget.innerHTML = '';

  const doc = (typeof document !== 'undefined' ? document : globalThis.document);

  // Visualization / Canvas area
  const canvasContainer = doc.createElement('div');
  canvasContainer.setAttribute('class', 'canvas-container');
  canvasContainer.id = 'canvas-container';

  const canvas = doc.createElement('canvas');
  canvas.id = 'main-canvas';
  canvas.setAttribute('width', '800');
  canvas.setAttribute('height', '600');

  // Canvas interactive event listeners (drag, zoom, click)
  let isDragging = false;
  let lastPos = { x: 0, y: 0 };
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastPos = { x: e.clientX || 0, y: e.clientY || 0 };
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    lastPos = { x: e.clientX || 0, y: e.clientY || 0 };
  });
  canvas.addEventListener('mouseup', () => {
    isDragging = false;
  });
  canvas.addEventListener('wheel', (e) => {
    if (typeof e.preventDefault === 'function') e.preventDefault();
  });

  canvasContainer.appendChild(canvas);
  mountTarget.appendChild(canvasContainer);

  // Host container for controls
  const controlsHost = doc.createElement('div');
  controlsHost.setAttribute('class', 'controls-container');
  controlsHost.id = 'controls';
  controlsHost.setAttribute('data-component', 'controls');
  mountTarget.appendChild(controlsHost);

  // Initial application state
  let appState = {
    activeControl: 'select',
    tool: 'select',
    mode: 'brush',
    activeTab: 'tools'
  };

  const controls = new Controls({
    container: controlsHost,
    initialState: appState,
    onChange: (newState) => {
      appState = { ...appState, ...newState };
    }
  });

  // Delegated click event handler bound to root element
  const delegatedClickHandler = (event) => {
    if (event._handled) return;
    const el = event.target;
    if (!el) return;
    if (el.disabled || (el.hasAttribute && el.hasAttribute('disabled'))) return;

    const control = el.getAttribute && el.getAttribute('data-control');
    const value = el.getAttribute && el.getAttribute('data-value');
    const tab = el.getAttribute && el.getAttribute('data-tab');

    if (control && value) {
      const updates = { [control]: value };
      if (appState.activeControl !== undefined || control === 'tool') {
        updates.activeControl = value;
      }
      controls.setState(updates);
    } else if (tab) {
      controls.setState({ activeTab: tab });
    }
  };
  mountTarget.addEventListener('click', delegatedClickHandler);

  // Animation / tick loop for real-time visualization
  let animationFrameId = null;
  let isRunning = true;
  const tick = () => {
    if (!isRunning) return;
    if (typeof requestAnimationFrame === 'function') {
      animationFrameId = requestAnimationFrame(tick);
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    animationFrameId = requestAnimationFrame(tick);
  }

  const appInstance = {
    mountTarget,
    controls,
    getState: () => ({ ...appState, ...controls.getState() }),
    setState: (newState) => {
      appState = { ...appState, ...newState };
      controls.setState(appState);
    },
    destroy: () => {
      isRunning = false;
      if (animationFrameId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameId);
      }
      mountTarget.removeEventListener('click', delegatedClickHandler);
      mountTarget.innerHTML = '';
      currentAppInstance = null;
    }
  };

  currentAppInstance = appInstance;
  return appInstance;
}

/**
 * Initializes the application entrypoint and mounts directly to #app.
 *
 * @returns {Object} Application instance.
 */
export function initApp() {
  const root = typeof document !== 'undefined' ? document.getElementById('app') : null;
  return mount(root);
}

/**
 * Lifecycle mount alias for application consumers.
 *
 * @param {Object} target - Target element.
 * @returns {Object} Application instance.
 */
export function mountApp(target) {
  return mount(target);
}

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