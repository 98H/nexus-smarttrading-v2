/**
 * SmartTrading-V2 — Interactive Tool Palette Component
 * Provides selectable drawing and measurement tool modes
 * (crosshair, trendline, ray, measurement) with active state management,
 * accessible ARIA attributes, visual indicators, and event emission.
 * Satisfies STORY 49.2.1 (Defect ID: DF-TOOLS-01).
 */

export const DEFAULT_TOOLS = ['crosshair', 'trendline', 'ray', 'measurement'];

/**
 * Creates an event object safely across native browser and mock DOM environments
 * ensuring target and currentTarget properties are writable for mock dispatchers.
 *
 * @param {string} type
 * @param {Object} detail
 * @param {Object} [options]
 * @returns {Object}
 */
function createCustomEvent(type, detail, options = {}) {
  const isRealBrowser =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    document.nodeType === 9 &&
    typeof Element !== 'undefined' &&
    typeof document.createElement === 'function' &&
    !document.constructor?.name?.includes('Mock');

  if (isRealBrowser && typeof CustomEvent === 'function') {
    try {
      return new CustomEvent(type, {
        detail,
        bubbles: options.bubbles ?? true,
        cancelable: options.cancelable ?? true,
      });
    } catch (_) {}
  }

  return {
    type,
    detail,
    target: null,
    currentTarget: null,
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
   * @param {string} [options.activeTool]
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
   * Returns list of supported tool mode identifiers.
   *
   * @returns {Array<string>}
   */
  getSupportedTools() {
    return [...this.tools];
  }

  /**
   * Alias for getSupportedTools().
   *
   * @returns {Array<string>}
   */
  getTools() {
    return this.getSupportedTools();
  }

  /**
   * Sets active tool, updating UI indicators and emitting toolchange event.
   * Throws error if tool mode is invalid or unsupported.
   *
   * @param {string} tool
   */
  setActiveTool(tool) {
    if (!this.tools.includes(tool)) {
      throw new Error(`Unsupported tool mode: "${tool}"`);
    }

    if (this.activeTool === tool) {
      return;
    }

    this.activeTool = tool;
    this._updateClasses();
    this._emitChange(tool);

    if (this.onToolChange) {
      try {
        this.onToolChange(tool);
      } catch (_) {
        // Callback errors should not disrupt palette state
      }
    }
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
   * Renders the interactive tool palette element with buttons for all supported tools.
   *
   * @returns {HTMLElement|Object}
   */
  render() {
    const doc = typeof document !== 'undefined' ? document : globalThis.document;
    const container = doc.createElement('div');

    if (typeof container.setAttribute === 'function') {
      container.setAttribute('class', 'tool-palette toolbar');
      container.setAttribute('role', 'toolbar');
      container.setAttribute('aria-label', 'Interactive Tool Palette');
      container.setAttribute(
        'style',
        'display: flex; flex-direction: column; gap: 6px; padding: 8px 6px; background: #181b24; border-right: 1px solid #2a2e39; align-items: stretch; box-sizing: border-box; flex-shrink: 0; width: 110px;'
      );
    }
    if (container.classList && typeof container.classList.add === 'function') {
      container.classList.add('tool-palette');
      container.classList.add('toolbar');
    }
    if (container.style) {
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '6px';
      container.style.padding = '8px 6px';
      container.style.background = '#181b24';
      container.style.borderRight = '1px solid #2a2e39';
      container.style.alignItems = 'stretch';
      container.style.boxSizing = 'border-box';
      container.style.flexShrink = '0';
      container.style.width = '110px';
    }

    this.element = container;
    this.toolButtons.clear();

    const buttonStyle =
      'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-family: inherit; text-align: left;';
    const activeButtonStyle =
      'background: #2962ff; color: #ffffff; border: 1px solid #2962ff; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit; text-align: left;';

    for (const tool of this.tools) {
      const btn = doc.createElement('button');
      const isActive = tool === this.activeTool;

      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('type', 'button');
        btn.setAttribute('data-tool', tool);
        btn.setAttribute('aria-label', tool);
        btn.setAttribute('class', isActive ? 'tool-btn active' : 'tool-btn');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        btn.setAttribute('style', isActive ? activeButtonStyle : buttonStyle);
      }

      if (!btn.dataset) {
        btn.dataset = {};
      }
      btn.dataset.tool = tool;

      if (btn.classList) {
        if (isActive) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
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
   * Synchronizes active CSS classes and ARIA pressed states.
   *
   * @private
   */
  _updateClasses() {
    if (!this.element) return;

    const buttonStyle =
      'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-family: inherit; text-align: left;';
    const activeButtonStyle =
      'background: #2962ff; color: #ffffff; border: 1px solid #2962ff; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit; text-align: left;';

    for (const [toolName, btn] of this.toolButtons.entries()) {
      const isActive = toolName === this.activeTool;
      if (isActive) {
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('class', 'tool-btn active');
          btn.setAttribute('aria-pressed', 'true');
          btn.setAttribute('style', activeButtonStyle);
        }
        if (btn.classList && typeof btn.classList.add === 'function') {
          btn.classList.add('active');
        }
      } else {
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute('class', 'tool-btn');
          btn.setAttribute('aria-pressed', 'false');
          btn.setAttribute('style', buttonStyle);
        }
        if (btn.classList && typeof btn.classList.remove === 'function') {
          btn.classList.remove('active');
        }
      }
    }

    if (typeof this.element.querySelectorAll === 'function') {
      const domButtons = this.element.querySelectorAll('[data-tool]');
      for (const btn of domButtons) {
        const tool =
          (typeof btn.getAttribute === 'function' ? btn.getAttribute('data-tool') : null) ||
          (btn.dataset && btn.dataset.tool);
        const isActive = tool === this.activeTool;
        if (isActive) {
          if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('class', 'tool-btn active');
            btn.setAttribute('aria-pressed', 'true');
            btn.setAttribute('style', activeButtonStyle);
          }
          if (btn.classList && typeof btn.classList.add === 'function') {
            btn.classList.add('active');
          }
        } else {
          if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('class', 'tool-btn');
            btn.setAttribute('aria-pressed', 'false');
            btn.setAttribute('style', buttonStyle);
          }
          if (btn.classList && typeof btn.classList.remove === 'function') {
            btn.classList.remove('active');
          }
        }
      }
    }
  }

  /**
   * Emits 'toolchange' event on palette element safely.
   *
   * @private
   * @param {string} tool
   */
  _emitChange(tool) {
    if (!this.element) return;
    try {
      const event = createCustomEvent('toolchange', { tool }, { bubbles: true, cancelable: true });
      if (typeof this.element.dispatchEvent === 'function') {
        this.element.dispatchEvent(event);
      }
    } catch (_) {
      try {
        if (typeof this.element.dispatchEvent === 'function') {
          this.element.dispatchEvent({
            type: 'toolchange',
            detail: { tool },
            target: this.element,
            currentTarget: this.element,
            bubbles: true,
            cancelable: true,
            defaultPrevented: false,
            preventDefault() {
              this.defaultPrevented = true;
            },
          });
        }
      } catch (_) {}
    }
  }

  /**
   * Destroys element and cleans up references.
   */
  destroy() {
    const parent = (this.element && (this.element.parentNode || this.element.parentElement)) || null;
    if (parent && typeof parent.removeChild === 'function') {
      parent.removeChild(this.element);
    }
    this.element = null;
    this.toolButtons.clear();
  }
}

export default ToolPalette;