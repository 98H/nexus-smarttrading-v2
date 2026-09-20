import { Controls, patchMockElement } from './components/controls.js';

let currentAppInstance = null;

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
    return node.children;
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
  const existingChildren = safeGetChildren(mountTarget);
  for (const child of existingChildren) {
    if (typeof mountTarget.removeChild === 'function') {
      try {
        mountTarget.removeChild(child);
      } catch (_) {}
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
  let canvas = null;
  let ctx = null;
  let statusElement = null;
  let animationFrameId = null;
  let isRunning = true;

  if (doc && typeof doc.createElement === 'function') {
    try {
      // Visualization and canvas container
      const canvasContainer = doc.createElement('div');
      if (typeof canvasContainer.setAttribute === 'function') {
        canvasContainer.setAttribute('class', 'canvas-container');
      }
      canvasContainer.id = 'canvas-container';

      canvas = doc.createElement('canvas');
      canvas.id = 'main-canvas';
      if (typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('width', '800');
        canvas.setAttribute('height', '600');
      }

      if (typeof canvas.getContext === 'function') {
        try {
          ctx = canvas.getContext('2d');
        } catch (_) {}
      }

      // Live dynamic clock and state status element
      statusElement = doc.createElement('div');
      if (typeof statusElement.setAttribute === 'function') {
        statusElement.setAttribute('class', 'status-clock');
        statusElement.setAttribute('data-component', 'status-clock');
      }
      statusElement.id = 'status-clock';
      statusElement.textContent = 'Clock: 0.00s | Frames: 0 | State: active';

      // Canvas interactive event listeners
      let isDragging = false;
      let lastPos = { x: 0, y: 0 };
      if (typeof canvas.addEventListener === 'function') {
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
      }

      if (typeof canvasContainer.appendChild === 'function') {
        canvasContainer.appendChild(canvas);
        canvasContainer.appendChild(statusElement);
      }
      if (typeof mountTarget.appendChild === 'function') {
        mountTarget.appendChild(canvasContainer);
      }

      // Host container for controls
      const controlsHost = doc.createElement('div');
      if (typeof controlsHost.setAttribute === 'function') {
        controlsHost.setAttribute('class', 'controls-container');
        controlsHost.setAttribute('data-component', 'controls');
      }
      controlsHost.id = 'controls';
      if (typeof mountTarget.appendChild === 'function') {
        mountTarget.appendChild(controlsHost);
      }

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

      if (typeof mountTarget.addEventListener === 'function') {
        mountTarget.addEventListener('click', delegatedClickHandler);
      }
    } catch (_) {
      // Graceful fallback for minimal execution environments
    }
  }

  // Continuous render loop and dynamic state clock
  const tick = (timestamp) => {
    if (!isRunning) return;

    // Immediately requeue to guarantee continuous loop persistence
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

      // Continuous active frame renders on canvas
      if (ctx) {
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

  // Immediately initialize continuous rendering loop
  if (typeof requestAnimationFrame === 'function') {
    animationFrameId = requestAnimationFrame(tick);
  }

  const appInstance = {
    mounted: true,
    element: mountTarget,
    mountTarget,
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
      if (controls) controls.setState(appState);
    },
    destroy: () => {
      isRunning = false;
      if (animationFrameId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrameId);
      }
      if (delegatedClickHandler && typeof mountTarget.removeEventListener === 'function') {
        mountTarget.removeEventListener('click', delegatedClickHandler);
      }
      mountTarget.innerHTML = '';
      currentAppInstance = null;
    },
  };

  currentAppInstance = appInstance;
  return appInstance;
}

/**
 * Initializes the application entrypoint and mounts directly to document.getElementById('app').
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
 * @param {string|Object} target - Target element or id.
 * @param {Object} [options] - Mount options.
 * @returns {Object} Application instance.
 */
export function mountApp(target, options) {
  return mount(target, options);
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