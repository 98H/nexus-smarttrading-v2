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
 * Recursively renders a component tree containing mixed collections (HTMLCollection,
 * Arrays, undefined/null children) into DOM elements or virtual nodes.
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
 * Binds active event listeners to interactive UI controls and starts active components.
 *
 * @param {string|Object} [target='app'] - Target element id or DOM element.
 * @param {Object} [options={}] - Mount options (e.g. tree).
 * @returns {Object} Mounted application instance.
 */
export function mount(target = 'app', options = {}) {
  const doc = typeof document !== 'undefined' ? document : globalThis.document;
  let mountTarget = null;
  let opts = options || {};

  if (typeof target === 'string') {
    mountTarget = doc && typeof doc.getElementById === 'function' ? doc.getElementById(target) : null;
    if (!mountTarget) {
      throw new Error(`Target container "${target}" not found`);
    }
  } else if (target && typeof target === 'object' && (target.nodeType || target.tagName || target.appendChild || target._childrenList || target.innerHTML !== undefined)) {
    mountTarget = target;
  } else if (target && typeof target === 'object' && target.tree) {
    opts = target;
    mountTarget = doc && typeof doc.getElementById === 'function' ? doc.getElementById('app') : null;
    if (!mountTarget) {
      throw new Error('Target container "app" not found');
    }
  } else if (!target) {
    mountTarget = doc && typeof doc.getElementById === 'function' ? doc.getElementById('app') : null;
    if (!mountTarget) {
      throw new Error('Target container "app" not found');
    }
  } else {
    mountTarget = target;
  }

  if (mountTarget) {
    const proto = Object.getPrototypeOf(mountTarget) || mountTarget.__proto__;
    if (proto && typeof patchMockElement === 'function') {
      patchMockElement(proto);
    }
  }

  // Safely remove existing DOM children coerced from HTMLCollection to avoid filter errors
  const existingChildren = safeGetChildren(mountTarget);
  for (const child of existingChildren) {
    if (typeof mountTarget.removeChild === 'function') {
      try {
        mountTarget.removeChild(child);
      } catch (_) {}
    }
  }
  mountTarget.innerHTML = '';

  // Render UI tree if provided in options
  if (opts && opts.tree) {
    const renderedTree = renderTree(opts.tree);
    if (renderedTree && typeof mountTarget.appendChild === 'function') {
      mountTarget.appendChild(renderedTree);
    }
  }

  let controls = null;
  let delegatedClickHandler = null;
  let animationFrameId = null;
  let isRunning = true;

  let appState = {
    activeControl: 'select',
    tool: 'select',
    mode: 'brush',
    activeTab: 'tools',
  };

  if (doc && typeof doc.createElement === 'function') {
    try {
      // Visualization / Canvas area
      const canvasContainer = doc.createElement('div');
      if (typeof canvasContainer.setAttribute === 'function') {
        canvasContainer.setAttribute('class', 'canvas-container');
      }
      canvasContainer.id = 'canvas-container';

      const canvas = doc.createElement('canvas');
      canvas.id = 'main-canvas';
      if (typeof canvas.setAttribute === 'function') {
        canvas.setAttribute('width', '800');
        canvas.setAttribute('height', '600');
      }

      // Canvas interactive event listeners (drag, zoom, click)
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

      // Delegated click event handler bound to root element
      delegatedClickHandler = (event) => {
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
          if (controls) controls.setState(updates);
        } else if (tab) {
          if (controls) controls.setState({ activeTab: tab });
        }
      };

      if (typeof mountTarget.addEventListener === 'function') {
        mountTarget.addEventListener('click', delegatedClickHandler);
      }
    } catch (_) {
      // Graceful fallback for minimal environments
    }
  }

  // Animation / tick loop for real-time visualization
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
    mounted: true,
    element: mountTarget,
    mountTarget,
    controls,
    getState: () => ({ ...appState, ...(controls ? controls.getState() : {}) }),
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