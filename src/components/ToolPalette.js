/**
 * SmartTrading-V2 — Interactive Tool Palette Component
 * Provides selectable drawing and measurement tool modes
 * (crosshair, trendline, ray, measurement) with active state management
 * and event emission to workspace canvas.
 * Satisfies STORY 29.7.1 (Defect ID: DF-TOOLS-01).
 */

const DEFAULT_TOOLS = ['crosshair', 'trendline', 'ray', 'measurement'];

/**
 * Creates a CustomEvent or fallback event object.
 *
 * @param {string} type
 * @param {Object} detail
 * @param {Object} [options]
 * @returns {CustomEvent|Object}
 */
function createCustomEvent(type, detail, options = {}) {
  if (typeof CustomEvent === 'function') {
    return new CustomEvent(type, {
      detail,
      bubbles: options.bubbles ?? true,
      cancelable: options.cancelable ?? true,
    });
  }
  return {
    type,
    detail,
    bubbles: options.bubbles ?? true,
    cancelable: options.cancelable ?? true,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

export class ToolPalette {
  /**
   * @param {Object} [options={}]
   * @param {Array<string>} [options.tools]
   * @param {string} [options.defaultTool]
   * @param {Function} [options.onToolChange]
   */
  constructor(options = {}) {
    this.tools = Array.isArray(options.tools) && options.tools.length > 0
      ? [...options.tools]
      : [...DEFAULT_TOOLS];

    const initialTool = options.defaultTool || options.activeTool || 'crosshair';
    if (this.tools.includes(initialTool)) {
      this.activeTool = initialTool;
    } else {
      this.activeTool = this.tools[0] || 'crosshair';
    }

    this.onToolChange = typeof options.onToolChange === 'function' ? options.onToolChange : null;
    this.element = null;
    this.toolButtons = new Map();
  }

  /**
   * Returns current active tool mode.
   *
   * @returns {string}
   */
  getActiveTool() {
    return this.activeTool;
  }

  /**
   * Sets active tool, updating UI and emitting toolchange event.
   * Throws error if tool mode is invalid or unsupported.
   *
   * @param {string} tool
   */
  setActiveTool(tool) {
    if (!this.tools.includes(tool)) {
      throw new Error(`Invalid or unsupported tool mode: "${tool}"`);
    }

    this.activeTool = tool;
    this._updateClasses();
    this._emitChange(tool);

    if (this.onToolChange) {
      try {
        this.onToolChange(tool);
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Returns available tools array.
   *
   * @returns {Array<string>}
   */
  getTools() {
    return [...this.tools];
  }

  /**
   * Returns rendered palette DOM element.
   *
   * @returns {HTMLElement|Object}
   */
  getElement() {
    if (!this.element) {
      this.render();
    }
    return this.element;
  }

  /**
   * Renders the interactive tool palette element with buttons.
   *
   * @returns {HTMLElement|Object}
   */
  render() {
    const container = document.createElement('div');
    if (typeof container.setAttribute === 'function') {
      container.setAttribute('class', 'tool-palette');
      container.setAttribute('role', 'toolbar');
      container.setAttribute('aria-label', 'Interactive Tool Palette');
      container.setAttribute(
        'style',
        'display: flex; flex-direction: row; gap: 6px; padding: 6px 12px; background: #1e222d; border-bottom: 1px solid #363c4e; align-items: center;'
      );
    }
    container.classList.add('tool-palette');
    if (container.style) {
      container.style.display = 'flex';
      container.style.flexDirection = 'row';
      container.style.gap = '6px';
      container.style.padding = '6px 12px';
      container.style.background = '#1e222d';
      container.style.borderBottom = '1px solid #363c4e';
      container.style.alignItems = 'center';
    }

    this.element = container;
    this.toolButtons.clear();

    const buttonStyle =
      'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer;';
    const activeButtonStyle =
      'background: #2962ff; color: #ffffff; border: 1px solid #2962ff; border-radius: 4px; padding: 6px 10px; cursor: pointer;';

    for (const tool of this.tools) {
      const btn = document.createElement('button');
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('type', 'button');
        btn.setAttribute('data-tool', tool);
        btn.setAttribute('aria-label', tool);
        btn.setAttribute('class', 'tool-btn');
      }
      btn.dataset.tool = tool;

      const isActive = tool === this.activeTool;
      if (isActive) {
        btn.classList.add('active');
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-pressed', 'true');
          btn.setAttribute('style', activeButtonStyle);
        }
      } else {
        btn.classList.remove('active');
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-pressed', 'false');
          btn.setAttribute('style', buttonStyle);
        }
      }

      btn.textContent = tool.charAt(0).toUpperCase() + tool.slice(1);

      btn.addEventListener('click', (e) => {
        if (e && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        this.setActiveTool(tool);
      });

      this.toolButtons.set(tool, btn);
      container.appendChild(btn);
    }

    return container;
  }

  /**
   * Synchronizes active CSS classes and aria-pressed attributes.
   *
   * @private
   */
  _updateClasses() {
    if (!this.element) return;
    const buttonStyle =
      'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer;';
    const activeButtonStyle =
      'background: #2962ff; color: #ffffff; border: 1px solid #2962ff; border-radius: 4px; padding: 6px 10px; cursor: pointer;';

    for (const [toolName, btn] of this.toolButtons.entries()) {
      const isActive = toolName === this.activeTool;
      if (isActive) {
        btn.classList.add('active');
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-pressed', 'true');
          btn.setAttribute('style', activeButtonStyle);
        }
      } else {
        btn.classList.remove('active');
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('aria-pressed', 'false');
          btn.setAttribute('style', buttonStyle);
        }
      }
    }

    if (typeof this.element.querySelectorAll === 'function') {
      const domButtons = this.element.querySelectorAll('[data-tool]');
      for (const btn of domButtons) {
        const tool = (btn.getAttribute && btn.getAttribute('data-tool')) || btn.dataset?.tool;
        if (tool === this.activeTool) {
          btn.classList.add('active');
          if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('aria-pressed', 'true');
          }
        } else {
          btn.classList.remove('active');
          if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('aria-pressed', 'false');
          }
        }
      }
    }
  }

  /**
   * Emits 'toolchange' CustomEvent on palette element.
   *
   * @private
   * @param {string} tool
   */
  _emitChange(tool) {
    if (!this.element) return;
    const event = createCustomEvent('toolchange', { tool }, { bubbles: true, cancelable: true });
    if (typeof this.element.dispatchEvent === 'function') {
      this.element.dispatchEvent(event);
    }
  }

  /**
   * Destroys element and cleans up references.
   */
  destroy() {
    if (this.element && this.element.parentNode && typeof this.element.parentNode.removeChild === 'function') {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.toolButtons.clear();
  }
}

export default ToolPalette;