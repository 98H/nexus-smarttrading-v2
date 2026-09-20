/**
 * SmartTrading-V2 — UI Controls Module
 * Responsible for control state management, dynamic control rendering,
 * timeframe resolution switching, and binding interactive click handlers to UI controls.
 * Satisfies STORY 28.3.1 (DF-CONTROL-01) & STORY 51.2.1 (Resolve MISSING_TIMEFRAME_CONTROLS).
 */

export const SUPPORTED_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'];

export const TIMEFRAME_INTERVALS = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1d': 86400,
};

// Global control state
let currentControlState = {
  activeTab: null,
  activeTool: null,
  activeTimeframe: '1m',
  timeframe: '1m',
  resolution: '1m',
  zoomLevel: 1.0,
  lastAction: null,
};

/**
 * Polyfills / patches comma-delimited selector matching for mock DOM environments
 * where matches(selector) only natively supports single compound selectors.
 */
export function ensureSelectorCompatibility() {
  const doc = typeof document !== 'undefined' ? document : globalThis.document || null;
  if (doc && typeof doc.createElement === 'function') {
    try {
      const probe = doc.createElement('div');
      const proto = Object.getPrototypeOf(probe);
      if (proto && typeof proto.matches === 'function') {
        const origMatches = proto.__origMatches || proto.matches;
        proto.__origMatches = origMatches;
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
  ensureSelectorCompatibility();

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
    if (
      action &&
      !['zoom-in', 'zoom-out', 'reset', 'btn-reset'].includes(action) &&
      !action.startsWith('timeframe-')
    ) {
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

  // 3. Reflect active timeframe states (STORY 51.2.1)
  const timeframeButtons =
    typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll(
          '.timeframe-btn, button[data-timeframe], button[data-resolution]'
        )
      : [];
  for (const btn of timeframeButtons) {
    const tf =
      btn.getAttribute('data-timeframe') ||
      btn.getAttribute('data-resolution') ||
      btn.textContent.trim();
    const isActive = Boolean(
      tf &&
        (tf === currentControlState.timeframe ||
          tf === currentControlState.activeTimeframe ||
          tf === currentControlState.resolution)
    );
    if (isActive) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-selected', 'true');
      if (btn.style) {
        btn.style.background = '#2962ff';
        btn.style.color = '#ffffff';
        btn.style.borderColor = '#2962ff';
        btn.style.fontWeight = '600';
      }
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-selected', 'false');
      if (btn.style) {
        btn.style.background = '#1e222d';
        btn.style.color = '#d1d4dc';
        btn.style.borderColor = '#363c4e';
        btn.style.fontWeight = '400';
      }
    }
  }

  // 4. Reflect zoom indicators
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
  const timeframe =
    control.getAttribute('data-timeframe') ||
    control.getAttribute('data-resolution') ||
    (control.classList && control.classList.contains('timeframe-btn')
      ? control.textContent.trim()
      : null);
  const action =
    control.getAttribute('data-control') || control.getAttribute('data-action') || control.id;

  if (tab) {
    currentControlState.activeTab = currentControlState.activeTab === tab ? null : tab;
    currentControlState.lastAction = currentControlState.activeTab
      ? `tab-${tab}`
      : `deactivate-tab-${tab}`;
  } else if (
    timeframe &&
    (SUPPORTED_TIMEFRAMES.includes(timeframe) ||
      ['1m', '5m', '15m', '1h', '4h', '1D', '1d'].includes(timeframe))
  ) {
    currentControlState.timeframe = timeframe;
    currentControlState.activeTimeframe = timeframe;
    currentControlState.resolution = timeframe;
    currentControlState.lastAction = `timeframe-${timeframe}`;
  } else if (action) {
    if (action === 'zoom-in') {
      currentControlState.zoomLevel = +(currentControlState.zoomLevel * 1.2).toFixed(2);
      currentControlState.lastAction = 'zoom-in';
      if (control.classList) control.classList.toggle('active');
    } else if (action === 'zoom-out') {
      currentControlState.zoomLevel = Math.max(
        0.1,
        +(currentControlState.zoomLevel / 1.2).toFixed(2)
      );
      currentControlState.lastAction = 'zoom-out';
      if (control.classList) control.classList.toggle('active');
    } else if (action === 'reset' || action === 'btn-reset') {
      currentControlState.zoomLevel = 1.0;
      currentControlState.activeTool = null;
      currentControlState.lastAction = 'reset';
    } else if (action.startsWith('timeframe-')) {
      const tf = action.replace('timeframe-', '');
      currentControlState.timeframe = tf;
      currentControlState.activeTimeframe = tf;
      currentControlState.resolution = tf;
      currentControlState.lastAction = action;
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
    'button.control-btn, button.tab-btn, button.timeframe-btn, button[data-control], button[data-tab], button[data-timeframe], button[data-resolution]'
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
    activeTimeframe: '1m',
    timeframe: '1m',
    resolution: '1m',
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
      if (item.timeframe) {
        btn.setAttribute('data-timeframe', item.timeframe);
        btn.setAttribute('data-resolution', item.timeframe);
        btn.classList.add('timeframe-btn');
      }
      container.appendChild(btn);
    }
  }

  initControls(container);
}

/**
 * Renders interactive timeframe selection buttons (1m, 5m, 15m, 1h, 4h, 1D) into a toolbar.
 * Satisfies STORY 51.2.1.
 *
 * @param {HTMLElement|Object} container Target toolbar container
 * @param {Object} [options={}] Configuration options
 * @returns {HTMLElement|Object|null} Created toolbar or element
 */
export function renderTimeframeControls(container, options = {}) {
  if (!container) return null;
  ensureSelectorCompatibility();

  const timeframes = options.timeframes || SUPPORTED_TIMEFRAMES;
  const activeTimeframe =
    options.activeTimeframe ||
    options.timeframe ||
    options.resolution ||
    currentControlState.timeframe ||
    '1m';
  const onTimeframeChange = options.onTimeframeChange || options.onChange || null;

  const doc = typeof document !== 'undefined' ? document : globalThis.document;
  const toolbar =
    doc && typeof doc.createElement === 'function'
      ? doc.createElement('div')
      : { tagName: 'DIV', className: '', children: [], attributes: new Map(), style: {} };

  if (typeof toolbar.setAttribute === 'function') {
    toolbar.setAttribute('class', 'timeframe-controls timeframe-toolbar toolbar top-header-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Timeframe selection');
    toolbar.setAttribute('style', 'display: flex; align-items: center; gap: 4px;');
  }
  if (toolbar.style) {
    toolbar.style.display = 'flex';
    toolbar.style.alignItems = 'center';
    toolbar.style.gap = '4px';
  }

  for (const tf of timeframes) {
    const isActive = tf === activeTimeframe;
    const btn =
      doc && typeof doc.createElement === 'function'
        ? doc.createElement('button')
        : { tagName: 'BUTTON', className: '', children: [], attributes: new Map(), style: {} };

    const baseStyle =
      'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; font-family: inherit; line-height: 1.2; box-sizing: border-box;';
    const activeStyle =
      'background: #2962ff; color: #ffffff; border: 1px solid #2962ff; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit; line-height: 1.2; box-sizing: border-box;';

    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('type', 'button');
      btn.setAttribute('id', `timeframe-${tf.toLowerCase()}`);
      btn.setAttribute(
        'class',
        `control-btn timeframe-btn timeframe-${tf}${isActive ? ' active' : ''}`
      );
      btn.setAttribute('data-timeframe', tf);
      btn.setAttribute('data-resolution', tf);
      btn.setAttribute('data-control', `timeframe-${tf}`);
      btn.setAttribute('data-action', `timeframe-${tf}`);
      btn.setAttribute('data-testid', `timeframe-${tf}`);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.setAttribute('aria-label', `${tf} timeframe`);
      btn.setAttribute('style', isActive ? activeStyle : baseStyle);
    }
    btn.textContent = tf;

    btn.addEventListener('click', (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      currentControlState.timeframe = tf;
      currentControlState.activeTimeframe = tf;
      currentControlState.resolution = tf;
      currentControlState.lastAction = `timeframe-${tf}`;
      reRenderControls(container);
      if (typeof onTimeframeChange === 'function') {
        onTimeframeChange(tf);
      }
    });

    if (typeof toolbar.appendChild === 'function') {
      toolbar.appendChild(btn);
    }
  }

  if (typeof container.appendChild === 'function') {
    container.appendChild(toolbar);
  }

  return toolbar;
}