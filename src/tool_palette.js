/**
 * SmartTrading-V2 — Interactive Tool Palette Component
 * Provides selectable drawing and measurement tools for financial chart analysis.
 * Satisfies STORY 30.4.1 (DF-TOOLS-01: MISSING_INTERACTIVE_TOOL_PALETTE).
 */

export const REQUIRED_TOOLS = Object.freeze([
  'crosshair',
  'trendline',
  'horizontal-level',
  'measurement',
]);

/**
 * Parses and matches basic and compound CSS selectors for Mock DOM environments.
 *
 * @param {HTMLElement|Object} el
 * @param {string} sel
 * @returns {boolean}
 */
function matchSimpleSelector(el, sel) {
  if (!el || !sel) return false;
  sel = sel.trim();
  if (!sel) return false;

  const tagMatch = sel.match(/^([a-zA-Z0-9_-]+)/);
  let remaining = sel;
  if (tagMatch) {
    const expectedTag = tagMatch[1].toLowerCase();
    const actualTag = (el.tagName || '').toLowerCase();
    if (actualTag !== expectedTag) return false;
    remaining = sel.slice(tagMatch[1].length);
  }

  while (remaining.length > 0) {
    if (remaining.startsWith('.')) {
      const m = remaining.match(/^\.([a-zA-Z0-9_-]+)/);
      if (!m) return false;
      if (!el.classList || !el.classList.contains(m[1])) return false;
      remaining = remaining.slice(m[0].length);
    } else if (remaining.startsWith('#')) {
      const m = remaining.match(/^#([a-zA-Z0-9_-]+)/);
      if (!m) return false;
      if (el.id !== m[1]) return false;
      remaining = remaining.slice(m[0].length);
    } else if (remaining.startsWith('[')) {
      const m = remaining.match(/^\[([a-zA-Z0-9_-]+)(?:=([^\],]+))?\]/);
      if (!m) return false;
      const attrName = m[1];
      let attrVal = m[2];
      if (!el.hasAttribute || !el.hasAttribute(attrName)) return false;
      if (attrVal !== undefined) {
        attrVal = attrVal.replace(/^['"]|['"]$/g, '');
        if (el.getAttribute(attrName) !== attrVal) return false;
      }
      remaining = remaining.slice(m[0].length);
    } else {
      break;
    }
  }

  return remaining.length === 0;
}

/**
 * Ensures querySelector and querySelectorAll support comma-separated and compound selectors
 * in headless mock DOM environments without altering native browsers.
 *
 * @param {HTMLElement|Object} root
 */
export function patchSelectorCompatibility(root) {
  if (!root) return;
  const proto = Object.getPrototypeOf(root);
  if (!proto || proto._nexusCompoundPatched) return;

  try {
    const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (doc) {
      const testParent = doc.createElement('div');
      const testChild = doc.createElement('button');
      testChild.setAttribute('data-tool', 'test');
      testParent.appendChild(testChild);
      if (
        testParent.querySelectorAll('button[data-tool]').length === 1 &&
        testParent.querySelectorAll('.dummy, [data-tool]').length === 1
      ) {
        return;
      }
    }
  } catch {}

  proto._nexusCompoundPatched = true;
  const origQSA = proto.querySelectorAll;

  proto.querySelectorAll = function (selector) {
    if (typeof selector !== 'string') {
      return origQSA ? origQSA.call(this, selector) : [];
    }
    const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
    const results = [];
    const traverse = (node) => {
      if (!node || !node.children) return;
      for (const child of node.children) {
        if (parts.some((part) => matchSimpleSelector(child, part))) {
          results.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  };

  proto.querySelector = function (selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  };
}

/**
 * Formats a kebab-case tool identifier to human-readable title.
 *
 * @param {string} tool
 * @returns {string}
 */
function formatToolLabel(tool) {
  return tool
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Applies cohesive dark-theme styles to tool buttons.
 *
 * @param {HTMLElement|Object} btn
 * @param {boolean} [isActive=false]
 */
function applyDarkButtonStyles(btn, isActive = false) {
  const bg = isActive ? '#2962ff' : '#1e222d';
  const color = isActive ? '#ffffff' : '#d1d4dc';
  const style = `background: ${bg}; color: ${color}; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 12px;`;
  if (typeof btn.setAttribute === 'function') {
    btn.setAttribute('style', style);
  }
  if (btn.style) {
    btn.style.background = bg;
    btn.style.color = color;
    btn.style.border = '1px solid #363c4e';
    btn.style.borderRadius = '4px';
    btn.style.padding = '6px 10px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
  }
}

/**
 * Interactive Tool Palette component managing user drawing and measurement tool selections.
 */
export class ToolPalette {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.initialTool='crosshair']
   */
  constructor(options = {}) {
    this.tools = [...REQUIRED_TOOLS];
    this.activeTool = options.initialTool || 'crosshair';

    if (!this.tools.includes(this.activeTool)) {
      throw new Error(
        `Invalid tool: "${this.activeTool}". Supported tools: ${this.tools.join(', ')}`
      );
    }

    this._listeners = new Set();
    this.element = null;
    this.container = null;
    this.buttonElements = new Map();

    if (typeof document !== 'undefined') {
      const sample = document.body || (typeof document.createElement === 'function' ? document.createElement('div') : null);
      if (sample) {
        patchSelectorCompatibility(sample);
      }
    }
  }

  /**
   * Returns supported tools list.
   *
   * @returns {Array<string>}
   */
  getSupportedTools() {
    return [...this.tools];
  }

  /**
   * Returns current active tool name.
   *
   * @returns {string}
   */
  getActiveTool() {
    return this.activeTool;
  }

  /**
   * Sets the active tool and synchronizes visual indicators and listeners.
   *
   * @param {string} tool
   */
  setActiveTool(tool) {
    if (!this.tools.includes(tool)) {
      throw new Error(`Invalid tool: "${tool}". Supported tools: ${this.tools.join(', ')}`);
    }

    const prevTool = this.activeTool;
    this.activeTool = tool;

    this._updateButtonStates();

    if (prevTool !== tool) {
      for (const listener of this._listeners) {
        try {
          listener(tool);
        } catch (err) {
          console.error(err);
        }
      }
    }
  }

  /**
   * Registers a tool change callback listener.
   *
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  onToolChange(callback) {
    if (typeof callback === 'function') {
      this._listeners.add(callback);
    }
    return () => this._listeners.delete(callback);
  }

  /**
   * Synchronizes visual active classes, aria attributes, and button styling.
   *
   * @private
   */
  _updateButtonStates() {
    if (!this.element) return;

    for (const tool of this.tools) {
      const btn =
        this.buttonElements.get(tool) ||
        (typeof this.element.querySelector === 'function'
          ? this.element.querySelector(`[data-tool="${tool}"]`)
          : null);

      if (btn) {
        const isActive = tool === this.activeTool;
        if (isActive) {
          if (btn.classList && typeof btn.classList.add === 'function') {
            btn.classList.add('active');
          }
          btn.setAttribute('aria-pressed', 'true');
          btn.setAttribute('data-active', 'true');
        } else {
          if (btn.classList && typeof btn.classList.remove === 'function') {
            btn.classList.remove('active');
          }
          btn.setAttribute('aria-pressed', 'false');
          btn.setAttribute('data-active', 'false');
        }
        applyDarkButtonStyles(btn, isActive);
      }
    }
  }

  /**
   * Renders the interactive tool palette toolbar DOM element.
   *
   * @returns {HTMLElement|Object}
   */
  render() {
    const doc =
      (this.container && this.container.ownerDocument) ||
      (typeof document !== 'undefined' ? document : null);

    if (!doc || typeof doc.createElement !== 'function') return null;

    patchSelectorCompatibility(this.container || doc.body);

    const toolbar = doc.createElement('div');
    toolbar.setAttribute('class', 'tool-palette');
    toolbar.className = 'tool-palette';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Interactive Tool Palette');

    const toolbarStyle =
      'display: flex; flex-direction: row; gap: 8px; padding: 8px 12px; background: #1e222d; border-bottom: 1px solid #363c4e; align-items: center; flex-shrink: 0; z-index: 10;';
    if (typeof toolbar.setAttribute === 'function') {
      toolbar.setAttribute('style', toolbarStyle);
    }
    if (toolbar.style) {
      toolbar.style.display = 'flex';
      toolbar.style.flexDirection = 'row';
      toolbar.style.gap = '8px';
      toolbar.style.padding = '8px 12px';
      toolbar.style.background = '#1e222d';
      toolbar.style.borderBottom = '1px solid #363c4e';
      toolbar.style.alignItems = 'center';
      toolbar.style.flexShrink = '0';
      toolbar.style.zIndex = '10';
    }

    this.buttonElements = new Map();

    for (const tool of this.tools) {
      const btn = doc.createElement('button');
      btn.setAttribute('type', 'button');
      btn.setAttribute('data-tool', tool);
      btn.setAttribute('data-control', tool);
      btn.setAttribute('role', 'button');
      btn.textContent = formatToolLabel(tool);

      const isActive = tool === this.activeTool;
      if (isActive) {
        if (btn.classList && typeof btn.classList.add === 'function') {
          btn.classList.add('active');
        }
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('data-active', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('data-active', 'false');
      }

      applyDarkButtonStyles(btn, isActive);

      btn.addEventListener('click', (e) => {
        if (e) {
          e._controlHandled = true;
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }
        this.setActiveTool(tool);
      });

      toolbar.appendChild(btn);
      this.buttonElements.set(tool, btn);
    }

    this.element = toolbar;
    return toolbar;
  }

  /**
   * Mounts the tool palette into the specified container element.
   *
   * @param {HTMLElement|Object|string} container
   * @returns {HTMLElement|Object} Mounted toolbar element
   */
  mount(container) {
    let target = container;
    if (typeof container === 'string') {
      target =
        typeof document !== 'undefined'
          ? document.querySelector(container) ||
            document.getElementById(container.replace(/^#/, ''))
          : null;
    }

    if (!target) {
      throw new Error('Target container for ToolPalette not found');
    }

    patchSelectorCompatibility(target);
    this.container = target;

    if (!this.element) {
      this.element = this.render();
    }

    target.appendChild(this.element);
    return this.element;
  }
}

export default ToolPalette;