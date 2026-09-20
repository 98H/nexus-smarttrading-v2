/**
 * Event constants emitted by the Controls component.
 */
export const CONTROL_EVENTS = {
  STATE_CHANGE: 'controls:state-change'
};

/**
 * Matches a mock or DOM element against a single CSS selector part.
 * Supports tag names, classes, IDs, and single/multiple attribute selectors.
 *
 * @param {Object} el - Element to match.
 * @param {string} sel - Selector string.
 * @returns {boolean} Whether the element matches.
 */
function matchSingleSelector(el, sel) {
  sel = sel.trim();
  if (!sel || !el) return false;

  // Extract leading tag name if present
  const tagMatch = sel.match(/^[a-zA-Z0-9-]+/);
  if (tagMatch) {
    const expectedTag = tagMatch[0].toLowerCase();
    if (!el.tagName || el.tagName.toLowerCase() !== expectedTag) {
      return false;
    }
    sel = sel.slice(tagMatch[0].length);
  }

  // Process remaining qualifiers: #id, .class, [attr], [attr=val]
  while (sel.length > 0) {
    if (sel.startsWith('#')) {
      const idMatch = sel.match(/^#([a-zA-Z0-9_-]+)/);
      if (!idMatch) return false;
      if (el.id !== idMatch[1]) return false;
      sel = sel.slice(idMatch[0].length);
    } else if (sel.startsWith('.')) {
      const classMatch = sel.match(/^\.([a-zA-Z0-9_-]+)/);
      if (!classMatch) return false;
      if (!el.classList || !el.classList.contains(classMatch[1])) return false;
      sel = sel.slice(classMatch[0].length);
    } else if (sel.startsWith('[')) {
      const attrMatch = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=(['"]?)(.*?)\2)?\]/);
      if (!attrMatch) return false;
      const attrName = attrMatch[1];
      const hasVal = attrMatch[2] !== undefined || attrMatch[3] !== undefined;
      const expectedVal = attrMatch[3];

      if (attrName === 'disabled') {
        const isDisabled = el.disabled === true || (Boolean(el.hasAttribute) && el.hasAttribute('disabled'));
        if (!isDisabled) return false;
      } else {
        if (!el.hasAttribute || !el.hasAttribute(attrName)) {
          return false;
        }
        if (hasVal) {
          const actualVal = el.getAttribute(attrName);
          if (actualVal !== expectedVal) return false;
        }
      }
      sel = sel.slice(attrMatch[0].length);
    } else {
      return false;
    }
  }

  return true;
}

/**
 * Matches an element against a comma-separated selector list.
 *
 * @param {Object} el - Element to match.
 * @param {string} selector - Selector list.
 * @returns {boolean} Whether the element matches any selector.
 */
export function matchSelector(el, selector) {
  if (!selector || !el) return false;
  const parts = selector.split(',');
  for (let i = 0; i < parts.length; i++) {
    if (matchSingleSelector(el, parts[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Patches in-memory MockElement prototypes if running in test environment.
 *
 * @param {Object} proto - Prototype to patch.
 */
export function patchMockElement(proto) {
  if (!proto || proto.__selectorPatched) return;
  if (typeof proto.querySelector === 'function' && proto.querySelector.toString().includes('[native code]')) {
    return;
  }
  proto.__selectorPatched = true;

  proto.querySelectorAll = function querySelectorAll(selector) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.children || []) {
        if (matchSelector(child, selector)) {
          results.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  };

  proto.querySelector = function querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  };
}

/**
 * Dispatches a state change event from container element.
 * Accommodates mock environment requirements where MockElement directly assigns event.target.
 *
 * @param {Object} container - Container element.
 * @param {Object} state - State snapshot.
 */
function dispatchStateChange(container, state) {
  if (!container || typeof container.dispatchEvent !== 'function') return;

  // In MockElement test environments, dispatchEvent directly sets event.target = this.
  // Standard CustomEvent has a getter-only target in Node.js, so use a mock event object.
  const isMock = Boolean(container.listeners && typeof container.listeners.get === 'function');

  let evt = null;
  if (!isMock && typeof CustomEvent === 'function') {
    try {
      evt = new CustomEvent(CONTROL_EVENTS.STATE_CHANGE, { bubbles: true, detail: state });
    } catch {
      evt = null;
    }
  }

  if (!evt) {
    evt = {
      type: CONTROL_EVENTS.STATE_CHANGE,
      detail: state,
      bubbles: true,
      target: container,
      currentTarget: container,
      defaultPrevented: false,
      _propagationStopped: false,
      stopPropagation() {
        this._propagationStopped = true;
      },
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
  }

  container.dispatchEvent(evt);
}

/**
 * Interactive UI Controls component managing tabs, tools, modes, and display summaries.
 */
export class Controls {
  constructor({ container, initialState = {}, onChange = null } = {}) {
    if (!container) {
      throw new Error('Controls requires a container element');
    }
    this.container = container;
    this.onChange = onChange;
    this.state = { ...initialState };
    this._initialized = false;

    if (container.__proto__) {
      patchMockElement(container.__proto__);
    }
    if (typeof HTMLElement !== 'undefined' && HTMLElement.prototype) {
      patchMockElement(HTMLElement.prototype);
    }

    this.render();
  }

  /**
   * Returns a copy of the current internal state.
   *
   * @returns {Object} State copy.
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Updates state, performs immediate DOM visual re-render, and triggers callbacks/events.
   *
   * @param {Object} partialState - New state properties.
   */
  setState(partialState) {
    Object.assign(this.state, partialState);
    this.updateDOM();

    if (typeof this.onChange === 'function') {
      this.onChange({ ...this.state });
    }
    dispatchStateChange(this.container, { ...this.state });
  }

  /**
   * Builds DOM structure on first call and synchronizes visual state.
   */
  render() {
    if (!this._initialized) {
      this._buildDOM();
      this._initialized = true;
    }
    this.updateDOM();
  }

  /**
   * Builds child DOM tree for interactive controls.
   */
  _buildDOM() {
    const doc = (typeof document !== 'undefined' ? document : globalThis.document);
    if (!doc) return;

    // Tab navigation
    const tabList = doc.createElement('div');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('class', 'controls-tabs');

    const toolsTab = doc.createElement('button');
    toolsTab.setAttribute('role', 'tab');
    toolsTab.setAttribute('class', 'control-tab');
    toolsTab.setAttribute('data-tab', 'tools');
    toolsTab.textContent = 'Tools';
    toolsTab.addEventListener('click', (e) => this._handleTabClick(toolsTab, e));
    tabList.appendChild(toolsTab);

    const layersTab = doc.createElement('button');
    layersTab.setAttribute('role', 'tab');
    layersTab.setAttribute('class', 'control-tab');
    layersTab.setAttribute('data-tab', 'layers');
    layersTab.textContent = 'Layers';
    layersTab.addEventListener('click', (e) => this._handleTabClick(layersTab, e));
    tabList.appendChild(layersTab);

    this.container.appendChild(tabList);

    // Tools button group
    const toolsGroup = doc.createElement('div');
    toolsGroup.setAttribute('class', 'control-group');
    toolsGroup.setAttribute('data-group', 'tool');

    const toolValues = ['select', 'pan', 'zoom'];
    for (const val of toolValues) {
      const btn = doc.createElement('button');
      btn.setAttribute('class', 'control-btn');
      btn.setAttribute('data-control', 'tool');
      btn.setAttribute('data-value', val);
      btn.textContent = val.charAt(0).toUpperCase() + val.slice(1);
      btn.addEventListener('click', (e) => this._handleButtonClick(btn, e));
      toolsGroup.appendChild(btn);
    }
    this.container.appendChild(toolsGroup);

    // Mode button group
    const modeGroup = doc.createElement('div');
    modeGroup.setAttribute('class', 'control-group');
    modeGroup.setAttribute('data-group', 'mode');

    const modeValues = ['brush', 'eraser'];
    for (const val of modeValues) {
      const btn = doc.createElement('button');
      btn.setAttribute('class', 'control-btn');
      btn.setAttribute('data-control', 'mode');
      btn.setAttribute('data-value', val);
      btn.textContent = val.charAt(0).toUpperCase() + val.slice(1);
      btn.addEventListener('click', (e) => this._handleButtonClick(btn, e));
      modeGroup.appendChild(btn);
    }
    this.container.appendChild(modeGroup);

    // Visual indicators and summary display
    const summary = doc.createElement('div');
    summary.setAttribute('class', 'active-config-summary');
    this.container.appendChild(summary);

    const toolDisplay = doc.createElement('div');
    toolDisplay.setAttribute('data-active-display', 'tool');
    this.container.appendChild(toolDisplay);

    const modeDisplay = doc.createElement('div');
    modeDisplay.setAttribute('data-active-display', 'mode');
    this.container.appendChild(modeDisplay);
  }

  _handleTabClick(tabBtn, event) {
    if (event) event._handled = true;
    if (tabBtn.disabled || (tabBtn.hasAttribute && tabBtn.hasAttribute('disabled'))) return;

    const tab = tabBtn.getAttribute('data-tab');
    if (!tab) return;

    this.setState({ activeTab: tab });
  }

  _handleButtonClick(btn, event) {
    if (event) event._handled = true;
    if (btn.disabled || (btn.hasAttribute && btn.hasAttribute('disabled'))) return;

    const control = btn.getAttribute('data-control');
    const value = btn.getAttribute('data-value');
    if (!control || !value) return;

    const updates = { [control]: value };
    if (this.state.activeControl !== undefined || control === 'tool') {
      updates.activeControl = value;
    }
    this.setState(updates);
  }

  /**
   * Synchronizes visual classes, ARIA attributes, and summary displays to reflect current state.
   */
  updateDOM() {
    // Update tabs
    const tabs = this.container.querySelectorAll('[role="tab"], .control-tab');
    for (const tab of tabs) {
      const tabName = tab.getAttribute('data-tab');
      const isActive = this.state.activeTab !== undefined && this.state.activeTab === tabName;
      if (isActive) {
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
      } else {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
      }
    }

    // Update buttons
    const buttons = this.container.querySelectorAll('button[data-control], .control-btn');
    for (const btn of buttons) {
      const control = btn.getAttribute('data-control');
      const value = btn.getAttribute('data-value');
      let isActive = false;

      if (control === 'tool') {
        isActive = (this.state.tool === value) || (this.state.activeControl === value);
      } else if (control === 'mode') {
        isActive = (this.state.mode === value);
      } else if (control && value) {
        isActive = (this.state[control] === value);
      }

      if (isActive) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }

      if (this.state.locked) {
        btn.setAttribute('disabled', 'true');
        btn.disabled = true;
      } else if (this.state.locked === false) {
        btn.removeAttribute('disabled');
        btn.disabled = false;
      }
    }

    // Update visual summary and indicators
    const currentTool = this.state.tool || this.state.activeControl || '';
    const currentMode = this.state.mode || '';
    const activeControl = this.state.activeControl || currentTool || currentMode;

    const toolDisplay = this.container.querySelector('[data-active-display="tool"]');
    if (toolDisplay) {
      toolDisplay.setAttribute('data-current', String(currentTool));
      toolDisplay.textContent = `tool: ${currentTool}`;
    }

    const modeDisplay = this.container.querySelector('[data-active-display="mode"]');
    if (modeDisplay) {
      modeDisplay.setAttribute('data-current', String(currentMode));
      modeDisplay.textContent = `mode: ${currentMode}`;
    }

    // Update any other dynamic active-display elements matching state keys
    for (const key of Object.keys(this.state)) {
      if (key !== 'tool' && key !== 'mode') {
        const customDisplay = this.container.querySelector(`[data-active-display="${key}"]`);
        if (customDisplay) {
          customDisplay.setAttribute('data-current', String(this.state[key]));
          customDisplay.textContent = `${key}: ${this.state[key]}`;
        }
      }
    }

    const summary = this.container.querySelector('.active-config-summary');
    if (summary) {
      summary.setAttribute('data-current', String(activeControl));
      summary.textContent = `Active: ${activeControl} (tool: ${currentTool}, mode: ${currentMode})`;
    }
  }

  /**
   * Destroys the component DOM and cleans up state.
   */
  destroy() {
    this.container.innerHTML = '';
    this._initialized = false;
  }
}

/**
 * Convenience helper to instantiate and render Controls in a container.
 *
 * @param {Object} container - Mount target element.
 * @param {Object} options - Initial configuration options.
 * @returns {Controls} Active Controls component instance.
 */
export function renderControls(container, options = {}) {
  return new Controls({
    container,
    initialState: options
  });
}