/**
 * SmartTrading-V2 — UI Controls Module
 * Responsible for control state management, dynamic control rendering,
 * and binding interactive click handlers to UI controls.
 */

// Global control state
let currentControlState = {
  activeTab: null,
  activeTool: null,
  zoomLevel: 1.0,
  lastAction: null,
};

/**
 * Polyfills / patches comma-delimited selector matching for mock DOM environments
 * where matches(selector) only supports single compound selectors.
 */
export function ensureSelectorCompatibility() {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const probe = document.createElement('div');
      const proto = Object.getPrototypeOf(probe);
      if (proto && typeof proto.matches === 'function' && !proto._comma_patched) {
        proto._comma_patched = true;
        const origMatches = proto.matches;
        proto.matches = function (selector) {
          if (typeof selector === 'string' && selector.includes(',')) {
            const parts = selector.split(',');
            for (let i = 0; i < parts.length; i++) {
              if (this.matches(parts[i].trim())) return true;
            }
            return false;
          }
          return origMatches.call(this, selector);
        };
      }
    } catch (_) {}
  }
}

// Ensure compatibility as soon as module is imported
ensureSelectorCompatibility();

/**
 * Returns a detached snapshot of current control state.
 *
 * @returns {Object} Control state copy
 */
export function getControlState() {
  return { ...currentControlState };
}

/**
 * Updates internal control state.
 *
 * @param {Object} partialState
 * @returns {Object} Updated control state copy
 */
export function setControlState(partialState = {}) {
  currentControlState = {
    ...currentControlState,
    ...partialState,
  };
  return getControlState();
}

/**
 * Re-renders visual states in the container DOM based on current control state.
 *
 * @param {HTMLElement|Object} container
 */
export function reRenderControls(container) {
  if (!container) return;

  // 1. Reflect active tab states
  const tabs =
    typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.tab-btn, button[data-tab]')
      : [];
  for (const tab of tabs) {
    const tabName = tab.getAttribute('data-tab');
    const isActive = Boolean(tabName && tabName === currentControlState.activeTab);
    if (isActive) {
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
    } else {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    }
  }

  // 2. Reflect active tool states
  const tools =
    typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.control-btn, button[data-control], button[data-action]')
      : [];
  for (const tool of tools) {
    const action = tool.getAttribute('data-control') || tool.getAttribute('data-action') || tool.id;
    if (action && !['zoom-in', 'zoom-out', 'reset', 'btn-reset'].includes(action)) {
      const toolName = action === 'btn-pan' ? 'pan' : action;
      const isActive = Boolean(toolName && toolName === currentControlState.activeTool);
      if (isActive) {
        tool.classList.add('active');
        tool.setAttribute('aria-pressed', 'true');
      } else {
        tool.classList.remove('active');
        tool.setAttribute('aria-pressed', 'false');
      }
    }
  }

  // 3. Reflect zoom indicators
  const indicators =
    typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.zoom-level-indicator')
      : [];
  for (const ind of indicators) {
    ind.textContent = `${Math.round(currentControlState.zoomLevel * 100)}%`;
  }
}

/**
 * Dispatches control click interactions and performs state mutation & re-render.
 *
 * @param {HTMLElement|Object} control
 * @param {HTMLElement|Object} container
 */
function handleControlClick(control, container) {
  const tab = control.getAttribute('data-tab');
  const action =
    control.getAttribute('data-control') || control.getAttribute('data-action') || control.id;

  if (tab) {
    currentControlState.activeTab = tab;
  }

  if (action) {
    if (action === 'zoom-in') {
      currentControlState.zoomLevel = +(currentControlState.zoomLevel * 1.2).toFixed(2);
      currentControlState.lastAction = 'zoom-in';
      control.classList.toggle('active');
    } else if (action === 'zoom-out') {
      currentControlState.zoomLevel = Math.max(0.1, +(currentControlState.zoomLevel / 1.2).toFixed(2));
      currentControlState.lastAction = 'zoom-out';
      control.classList.toggle('active');
    } else if (action === 'reset' || action === 'btn-reset') {
      currentControlState.zoomLevel = 1.0;
      currentControlState.activeTool = null;
      currentControlState.lastAction = 'reset';
    } else {
      const tool = action === 'btn-pan' ? 'pan' : action;
      currentControlState.activeTool = currentControlState.activeTool === tool ? null : tool;
      currentControlState.lastAction = tool;
    }
  }

  reRenderControls(container);
}

/**
 * Binds click event listeners to all interactive buttons and tabs inside a container.
 *
 * @param {HTMLElement|Object} container
 */
export function bindControls(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return;

  ensureSelectorCompatibility();

  const interactiveElements = container.querySelectorAll(
    'button.control-btn, button.tab-btn, button[data-control], button[data-tab]'
  );

  for (const el of interactiveElements) {
    if (el._controlHandlerBound) continue;
    el._controlHandlerBound = true;

    el.addEventListener('click', () => {
      handleControlClick(el, container);
    });
  }
}

/**
 * Initializes control state, binds event handlers, and synchronizes the DOM.
 *
 * @param {HTMLElement|Object} container
 * @param {Object} [initialState={}]
 * @returns {Object} Initialized control state
 */
export function initControls(container, initialState = {}) {
  ensureSelectorCompatibility();

  currentControlState = {
    activeTab: null,
    activeTool: null,
    zoomLevel: 1.0,
    lastAction: null,
    ...initialState,
  };

  if (container) {
    bindControls(container);
    reRenderControls(container);
  }

  return getControlState();
}

/**
 * Dynamically creates interactive control buttons into a container and binds handlers.
 *
 * @param {HTMLElement|Object} container
 * @param {Array<Object>} items
 */
export function renderControls(container, items = []) {
  if (!container) return;
  ensureSelectorCompatibility();

  for (const item of items) {
    const btn =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? document.createElement(item.type || 'button')
        : null;

    if (btn) {
      if (item.id) {
        btn.id = item.id;
        btn.setAttribute('id', item.id);
      }
      btn.setAttribute('class', 'control-btn' + (item.className ? ' ' + item.className : ''));
      if (item.label) {
        btn.textContent = item.label;
      }
      if (item.action) {
        btn.setAttribute('data-control', item.action);
        btn.setAttribute('data-action', item.action);
      }
      if (item.tab) {
        btn.setAttribute('data-tab', item.tab);
        btn.classList.add('tab-btn');
      }
      container.appendChild(btn);
    }
  }

  initControls(container);
}