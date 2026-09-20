/**
 * SmartTrading-V2 — Auxiliary Dock Component
 * Provides a semantic <aside id="auxiliary-dock"> dock hosting secondary workflow
 * panels (Watchlist, active Orders, Market Depth, and Tool Parameters) side-by-side
 * with the primary chart workspace. Supports collapse/expand drawer states, reactive
 * tab switching, and dark-theme styled controls conforming to DF-PANEL-01 / DF-PANEL-02.
 * Satisfies STORY 38.3.1 & STORY 49.4.1 (Resolve MISSING_AUXILIARY_DOCK).
 */

/**
 * Standard dark-theme control palette specification.
 */
export const CONTROL_THEME_STYLE =
  'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px;';

/**
 * Ensures Set instances in headless MockDOM environments support contains and remove.
 */
if (typeof Set !== 'undefined') {
  if (!Set.prototype.remove) {
    Set.prototype.remove = function (val) {
      return this.delete(val);
    };
  }
  if (!Set.prototype.contains) {
    Set.prototype.contains = function (val) {
      return this.has(val);
    };
  }
}

/**
 * Creates a polyfilled classList object synchronized with the target element's className.
 *
 * @param {HTMLElement|Object} el
 * @returns {Object} classList interface
 */
function createClassListPolyfill(el) {
  return {
    add(...tokens) {
      const current = (el.className || '').split(/\s+/).filter(Boolean);
      let changed = false;
      for (const t of tokens) {
        if (t && !current.includes(t)) {
          current.push(t);
          changed = true;
        }
      }
      if (changed) {
        el.className = current.join(' ');
        if (typeof el.setAttribute === 'function') el.setAttribute('class', el.className);
      }
    },
    remove(...tokens) {
      const current = (el.className || '').split(/\s+/).filter(Boolean);
      const filtered = current.filter((c) => !tokens.includes(c));
      if (filtered.length !== current.length) {
        el.className = filtered.join(' ');
        if (typeof el.setAttribute === 'function') el.setAttribute('class', el.className);
      }
    },
    delete(...tokens) {
      this.remove(...tokens);
    },
    contains(token) {
      const current = (el.className || '').split(/\s+/).filter(Boolean);
      return current.includes(token);
    },
    has(token) {
      return this.contains(token);
    },
    toggle(token, force) {
      if (force === true) {
        this.add(token);
        return true;
      } else if (force === false) {
        this.remove(token);
        return false;
      }
      if (this.contains(token)) {
        this.remove(token);
        return false;
      } else {
        this.add(token);
        return true;
      }
    },
  };
}

/**
 * Patches a plain mock object with standard DOM methods without modifying native Element instances.
 *
 * @param {Object} el
 * @returns {Object}
 */
export function patchMockElement(el) {
  if (!el || typeof el !== 'object') return el;
  if (typeof Element !== 'undefined' && el instanceof Element) return el;

  if (!Array.isArray(el.children)) {
    if (!el.nodeType) el.children = [];
  }

  if (!el.style || typeof el.style !== 'object') {
    el.style = {};
  }

  if (typeof el.appendChild !== 'function') {
    el.appendChild = function (child) {
      if (child) {
        if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
          try { child.parentNode.removeChild(child); } catch (_) {}
        }
        child.parentNode = this;
        child.parentElement = this;
        if (Array.isArray(this.children)) this.children.push(child);
      }
      return child;
    };
  }

  if (typeof el.removeChild !== 'function') {
    el.removeChild = function (child) {
      if (Array.isArray(this.children)) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
          child.parentNode = null;
          child.parentElement = null;
          this.children.splice(idx, 1);
        }
      }
      return child;
    };
  }

  if (typeof el.replaceChildren !== 'function') {
    el.replaceChildren = function (...newChildren) {
      while (this.children && this.children.length > 0) {
        this.removeChild(this.children[0]);
      }
      for (const c of newChildren) {
        if (c) this.appendChild(c);
      }
    };
  }

  if (typeof el.insertBefore !== 'function') {
    el.insertBefore = function (newChild, refChild) {
      if (!newChild) return newChild;
      if (newChild.parentNode && typeof newChild.parentNode.removeChild === 'function') {
        try { newChild.parentNode.removeChild(newChild); } catch (_) {}
      }
      newChild.parentNode = this;
      newChild.parentElement = this;
      if (!Array.isArray(this.children)) this.children = [];
      const idx = refChild ? this.children.indexOf(refChild) : -1;
      if (idx !== -1) {
        this.children.splice(idx, 0, newChild);
      } else {
        this.appendChild(newChild);
      }
      return newChild;
    };
  }

  if (typeof el.setAttribute !== 'function') {
    el.setAttribute = function (name, value) {
      if (name === 'style') {
        if (!this.style || typeof this.style !== 'object') {
          this.style = {};
        }
        if (typeof value === 'string') {
          this.style.cssText = value;
          const declarations = value.split(';');
          for (let i = 0; i < declarations.length; i++) {
            const rule = declarations[i];
            const colonIdx = rule.indexOf(':');
            if (colonIdx !== -1) {
              const prop = rule.slice(0, colonIdx).trim();
              const val = rule.slice(colonIdx + 1).trim();
              if (prop) {
                const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                this.style[camelProp] = val;
                this.style[prop] = val;
              }
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          Object.assign(this.style, value);
        }
      } else {
        this[name] = String(value);
      }
      if (name === 'id') this.id = String(value);
      if (name === 'class' || name === 'className') this.className = String(value);
      if (!this.attributes) this.attributes = new Map();
      this.attributes.set(name, String(value));
    };
  }

  if (typeof el.getAttribute !== 'function') {
    el.getAttribute = function (name) {
      if (name === 'id') return this.id || null;
      if (name === 'class' || name === 'className') return this.className || null;
      if (name === 'style') {
        return (this.style && typeof this.style === 'object' && this.style.cssText) || (this.attributes && this.attributes.get('style')) || null;
      }
      if (this.attributes && this.attributes.has(name)) return this.attributes.get(name);
      return this[name] !== undefined && this[name] !== null ? String(this[name]) : null;
    };
  }

  if (typeof el.hasAttribute !== 'function') {
    el.hasAttribute = function (name) {
      if (name === 'id') return Boolean(this.id);
      if (name === 'class' || name === 'className') return Boolean(this.className);
      if (this.attributes && this.attributes.has(name)) return true;
      return this[name] !== undefined && this[name] !== null;
    };
  }

  if (typeof el.removeAttribute !== 'function') {
    el.removeAttribute = function (name) {
      delete this[name];
      if (this.attributes) this.attributes.delete(name);
      if (name === 'id') this.id = '';
      if (name === 'class' || name === 'className') this.className = '';
    };
  }

  if (typeof el.addEventListener !== 'function') {
    el.addEventListener = function (type, listener) {
      if (!this._listeners) this._listeners = new Map();
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
    };
  }

  if (typeof el.removeEventListener !== 'function') {
    el.removeEventListener = function (type, listener) {
      if (this._listeners && this._listeners.has(type)) {
        this._listeners.get(type).delete(listener);
      }
    };
  }

  if (typeof el.dispatchEvent !== 'function') {
    el.dispatchEvent = function (event) {
      if (this._listeners && event && event.type && this._listeners.has(event.type)) {
        for (const l of this._listeners.get(event.type)) {
          try {
            l.call(this, event);
          } catch (_) {}
        }
      }
      return true;
    };
  }

  if (!el.classList) {
    el.classList = createClassListPolyfill(el);
  }

  return el;
}

/**
 * Adds CSS class safely across native and mock DOM environments.
 *
 * @param {HTMLElement|Object} el
 * @param {string} cls
 */
function addClass(el, cls) {
  if (!el || !cls) return;
  if (el.classList) {
    if (typeof el.classList.add === 'function') {
      el.classList.add(cls);
    }
  }
  if (typeof el.getAttribute === 'function' && typeof el.setAttribute === 'function') {
    const cur = el.getAttribute('class') || el.className || '';
    const set = new Set(cur.split(/\s+/).filter(Boolean));
    set.add(cls);
    el.setAttribute('class', Array.from(set).join(' '));
  }
}

/**
 * Removes CSS class safely across native and mock DOM environments.
 *
 * @param {HTMLElement|Object} el
 * @param {string} cls
 */
function removeClass(el, cls) {
  if (!el || !cls) return;
  if (el.classList) {
    if (typeof el.classList.remove === 'function') {
      el.classList.remove(cls);
    } else if (typeof el.classList.delete === 'function') {
      el.classList.delete(cls);
    }
  }
  if (typeof el.getAttribute === 'function' && typeof el.setAttribute === 'function') {
    const cur = el.getAttribute('class') || el.className || '';
    const filtered = cur.split(/\s+/).filter((c) => c && c !== cls).join(' ');
    el.setAttribute('class', filtered);
  }
}

/**
 * Applies dark-theme styling to interactive controls.
 *
 * @param {HTMLElement|Object} el
 * @param {boolean} [isButton=true]
 */
export function applyDarkTheme(el, isButton = true) {
  if (!el) return;
  patchMockElement(el);
  const base = isButton ? `${CONTROL_THEME_STYLE} cursor: pointer;` : CONTROL_THEME_STYLE;
  if (typeof el.setAttribute === 'function') {
    el.setAttribute('style', base);
  }
  if (!el.style) {
    el.style = {};
  }
  el.style.background = '#1e222d';
  el.style.color = '#d1d4dc';
  el.style.border = '1px solid #363c4e';
  el.style.borderRadius = '4px';
  el.style.padding = '6px 10px';
  if (isButton) {
    el.style.cursor = 'pointer';
  }
}

/**
 * Injects CSS rules for auxiliary dock controls and pseudo-selectors into document.
 *
 * @param {Document|Object} doc
 */
export function injectDockStyles(doc) {
  if (!doc || typeof doc.createElement !== 'function') return;
  const styleId = 'dock-theme-styles';
  if (doc.getElementById && doc.getElementById(styleId)) return;
  try {
    const style = doc.createElement('style');
    patchMockElement(style);
    style.id = styleId;
    style.textContent = `
      #auxiliary-dock button, #auxiliary-dock input, #auxiliary-dock select,
      .auxiliary-dock button, .auxiliary-dock input, .auxiliary-dock select {
        background: #1e222d;
        color: #d1d4dc;
        border: 1px solid #363c4e;
        border-radius: 4px;
        padding: 6px 10px;
        box-sizing: border-box;
      }
      #auxiliary-dock button:hover, #auxiliary-dock button:focus {
        background: #2a2e39;
        border-color: #4f5966;
        color: #ffffff;
      }
      #auxiliary-dock button:active, #auxiliary-dock button[aria-selected="true"], #auxiliary-dock button.active {
        background: #2962ff;
        border-color: #2962ff;
        color: #ffffff;
      }
    `;
    const target = doc.head || doc.body;
    if (target && typeof target.appendChild === 'function') {
      target.appendChild(style);
    }
  } catch {}
}

/**
 * Patches mock DOM environments so that comma-separated CSS selector lists
 * resolve as unions and classList contains/remove operate properly.
 *
 * @param {HTMLElement|Object} [element]
 */
export function patchMockDOM(element) {
  if (typeof Set !== 'undefined') {
    if (!Set.prototype.remove) {
      Set.prototype.remove = function (val) {
        return this.delete(val);
      };
    }
    if (!Set.prototype.contains) {
      Set.prototype.contains = function (val) {
        return this.has(val);
      };
    }
  }

  const doc = typeof document !== 'undefined' ? document : (globalThis.document || null);
  if (doc && typeof doc.createElement === 'function' && !doc.__nexus_dock_patched_create) {
    const origCreate = doc.createElement.bind(doc);
    doc.createElement = function (tag) {
      const el = origCreate(tag);
      if (el && !(typeof Element !== 'undefined' && el instanceof Element)) {
        patchMockElement(el);
      }
      return el;
    };
    doc.__nexus_dock_patched_create = true;
  }

  const target =
    element ||
    (typeof document !== 'undefined'
      ? document.body || (typeof document.createElement === 'function' ? document.createElement('div') : null)
      : null) ||
    (typeof globalThis !== 'undefined' && globalThis.document
      ? globalThis.document.body ||
        (typeof globalThis.document.createElement === 'function' ? globalThis.document.createElement('div') : null)
      : null);

  if (!target) return;
  patchMockElement(target);
  let proto = Object.getPrototypeOf(target);
  while (proto && proto !== Object.prototype) {
    if (!proto.__nexusPatchedQSA) {
      const origQSA = proto.querySelectorAll;
      const origQS = proto.querySelector;

      if (typeof origQSA === 'function') {
        proto.querySelectorAll = function (selector) {
          if (typeof selector !== 'string') return [];
          if (selector.includes(',')) {
            const parts = selector
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const seen = new Set();
            const results = [];
            for (const part of parts) {
              const matched = origQSA.call(this, part);
              if (matched) {
                for (let i = 0; i < matched.length; i++) {
                  const item = matched[i];
                  if (!seen.has(item)) {
                    seen.add(item);
                    results.push(item);
                  }
                }
              }
            }
            return results;
          }
          return origQSA.call(this, selector);
        };
      }

      if (typeof origQS === 'function') {
        proto.querySelector = function (selector) {
          if (typeof selector !== 'string') return null;
          if (selector.includes(',')) {
            const matches = this.querySelectorAll(selector);
            return matches.length > 0 ? matches[0] : null;
          }
          return origQS.call(this, selector);
        };
      }

      proto.__nexusPatchedQSA = true;
    }
    proto = Object.getPrototypeOf(proto);
  }
}

patchMockDOM();

/**
 * Safely creates mock or real DOM elements without mutating native read-only getters.
 *
 * @param {string} tag
 * @param {Object} [attrs={}]
 * @param {Array<HTMLElement|Object>|string} [children=[]]
 * @returns {HTMLElement|Object}
 */
function createEl(tag, attrs = {}, children = []) {
  let el;
  const hasBrowserDoc = typeof document !== 'undefined' && typeof document.createElement === 'function';
  const hasGlobalDoc = typeof globalThis !== 'undefined' && globalThis.document && typeof globalThis.document.createElement === 'function';

  if (hasBrowserDoc) {
    el = document.createElement(tag);
  } else if (hasGlobalDoc) {
    el = globalThis.document.createElement(tag);
  } else {
    el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      children: [],
      parentNode: null,
      attributes: new Map(),
      style: {},
    };
  }

  patchMockElement(el);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className' || key === 'class') {
        el.className = value;
        if (typeof el.setAttribute === 'function') el.setAttribute('class', value);
      } else if (key === 'id') {
        el.id = value;
        if (typeof el.setAttribute === 'function') el.setAttribute('id', value);
      } else if (key === 'style') {
        if (typeof value === 'object') {
          if (!el.style) el.style = {};
          Object.assign(el.style, value);
          const cssText = Object.entries(value)
            .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
            .join(' ');
          if (typeof el.setAttribute === 'function') {
            el.setAttribute('style', cssText);
          }
        } else {
          if (!el.style) el.style = {};
          if (typeof el.setAttribute === 'function') {
            el.setAttribute('style', String(value));
          }
        }
      } else if (key.startsWith('on') && typeof value === 'function') {
        const evt = key.slice(2).toLowerCase();
        if (typeof el.addEventListener === 'function') {
          el.addEventListener(evt, value);
        }
      } else if (key === 'textContent') {
        el.textContent = value;
      } else {
        if (typeof el.setAttribute === 'function') {
          el.setAttribute(key, value);
        } else {
          el[key] = value;
        }
      }
    }
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      if (child) {
        if (typeof child === 'string') {
          const doc = typeof document !== 'undefined' ? document : globalThis.document;
          if (doc && typeof doc.createTextNode === 'function') {
            if (typeof el.appendChild === 'function') {
              el.appendChild(doc.createTextNode(child));
            }
          } else {
            el.textContent = (el.textContent || '') + child;
          }
        } else if (typeof el.appendChild === 'function') {
          el.appendChild(child);
        }
      }
    }
  } else if (typeof children === 'string') {
    el.textContent = children;
  }

  return el;
}

/**
 * Normalizes tab identifier to canonical tab labels: Watchlist, Orders, Depth, Parameters.
 *
 * @param {string} tabName
 * @returns {'Watchlist'|'Orders'|'Depth'|'Parameters'}
 */
function normalizeTabName(tabName) {
  if (!tabName) return 'Watchlist';
  const s = String(tabName).trim().toLowerCase();
  if (s === 'orders' || s === 'order' || s.includes('order')) return 'Orders';
  if (s === 'depth' || s.includes('depth')) return 'Depth';
  if (s === 'parameters' || s === 'tools' || s.includes('param') || s.includes('tool')) return 'Parameters';
  return 'Watchlist';
}

/**
 * Auxiliary Dock Component managing secondary workflow panels alongside the primary chart.
 */
export class AuxiliaryDock {
  /**
   * @param {HTMLElement|Object} [containerOrOptions]
   * @param {Object} [maybeOptions]
   */
  constructor(containerOrOptions = {}, maybeOptions = {}) {
    let container = null;
    let options = {};

    if (
      containerOrOptions &&
      (containerOrOptions.nodeType !== undefined ||
        containerOrOptions.tagName !== undefined ||
        typeof containerOrOptions.appendChild === 'function')
    ) {
      container = containerOrOptions;
      options = maybeOptions || {};
    } else if (containerOrOptions && typeof containerOrOptions === 'object') {
      options = containerOrOptions;
      container = options.container || null;
    }

    this.options = options;
    this.container = container;
    this.doc = options.document || (typeof document !== 'undefined' ? document : globalThis.document);
    this.collapsed = Boolean(options.defaultCollapsed ?? options.collapsed);
    this.workflows = new Map();
    this.tabButtons = new Map();
    this.onToggleCollapse = options.onToggleCollapse || options.onToggle || null;
    this.onWorkflowChange = options.onWorkflowChange || null;
    this.onTabChange = options.onTabChange || null;

    const initialTabRaw = options.activeTab || options.activeWorkflow || 'Watchlist';
    this.activeTab = normalizeTabName(initialTabRaw);
    this.activeWorkflow =
      this.activeTab === 'Orders'
        ? 'order-execution'
        : this.activeTab === 'Depth'
        ? 'market-depth'
        : this.activeTab === 'Parameters'
        ? 'tool-parameters'
        : 'watchlist';

    injectDockStyles(this.doc);

    // Root dock container: <aside id="auxiliary-dock">
    const initialWidth = this.collapsed ? '48px' : (options.width || '280px');
    const minW = this.collapsed ? '48px' : '240px';
    this.element = createEl('aside', {
      id: 'auxiliary-dock',
      className: 'auxiliary-dock dock-container orders-panel',
      'data-testid': 'auxiliary-dock',
      role: 'complementary',
      'aria-label': options.ariaLabel || 'Auxiliary Dock',
      'aria-expanded': this.collapsed ? 'false' : 'true',
      'data-active-tab': this.activeTab,
      'data-active-workflow': this.activeWorkflow,
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: initialWidth,
        minWidth: minW,
        maxWidth: '360px',
        height: '100%',
        maxHeight: '100%',
        minHeight: '0',
        flexShrink: '0',
        background: '#181b24',
        borderLeft: '1px solid #2a2e39',
        boxSizing: 'border-box',
        overflow: 'hidden',
        color: '#d1d4dc',
        userSelect: 'none',
        transition: 'width 0.2s ease',
      },
    });

    if (this.collapsed) {
      addClass(this.element, 'collapsed');
      this.element.setAttribute('data-collapsed', 'true');
    }

    patchMockDOM(this.element);
    if (this.container) {
      patchMockDOM(this.container);
    }

    // Header bar with title and collapsible trigger
    this.header = this._createHeader();
    if (typeof this.element.appendChild === 'function') {
      this.element.appendChild(this.header);
    }

    // Tab navigation header
    this.navTabs = this._createNavTabs();
    if (typeof this.element.appendChild === 'function') {
      this.element.appendChild(this.navTabs);
    }

    // Functional dock panel body
    this.panelBody = createEl('div', {
      id: 'dock-panel-body',
      className: 'dock-panel-body dock-panel-host',
      'data-testid': 'dock-panel-body',
      style: {
        flex: '1 1 0%',
        display: this.collapsed ? 'none' : 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        padding: '12px',
        gap: '12px',
      },
    });
    this.panelContainer = this.panelBody;

    if (typeof this.element.appendChild === 'function') {
      this.element.appendChild(this.panelBody);
    }

    // Render active tab widget immediately so panel body is never empty dark space
    this.switchTab(this.activeTab, { initial: true });

    if (this.container) {
      this.mount(this.container);
    }
  }

  /**
   * Mounts the auxiliary dock element to a parent DOM container.
   *
   * @param {HTMLElement|Object} target
   * @returns {AuxiliaryDock}
   */
  mount(target) {
    const mountTarget = target || this.container;
    if (mountTarget) {
      this.container = mountTarget;
      patchMockDOM(mountTarget);
      if (typeof mountTarget.appendChild === 'function') {
        if (this.element.parentNode !== mountTarget) {
          mountTarget.appendChild(this.element);
        }
      }
    }
    return this;
  }

  /**
   * Returns the root dock DOM element.
   *
   * @returns {HTMLElement|Object}
   */
  getElement() {
    return this.element;
  }

  /**
   * Returns whether the dock is currently collapsed.
   *
   * @returns {boolean}
   */
  isCollapsed() {
    return Boolean(this.collapsed);
  }

  /**
   * Returns the active tab name ('Watchlist', 'Orders', 'Depth', or 'Parameters').
   *
   * @returns {string}
   */
  getActiveTab() {
    return this.activeTab;
  }

  /**
   * Returns the active workflow identifier.
   *
   * @returns {string}
   */
  getActiveWorkflow() {
    return this.activeWorkflow;
  }

  /**
   * Builds the dock header with title and collapsible button.
   *
   * @private
   * @returns {HTMLElement|Object}
   */
  _createHeader() {
    const header = createEl('div', {
      className: 'dock-header',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #2a2e39',
        background: '#1e222d',
        minHeight: '40px',
        boxSizing: 'border-box',
      },
    });

    this.titleElement = createEl('span', {
      className: 'dock-title',
      textContent: this.options.title || 'Auxiliary Dock',
      style: {
        fontWeight: '600',
        fontSize: '12px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        color: '#787b86',
        display: this.collapsed ? 'none' : 'inline',
      },
    });

    this.toggleButton = createEl('button', {
      className: 'dock-toggle-btn toggle-dock-btn',
      id: 'dock-collapse-btn',
      title: 'Toggle Auxiliary Dock',
      'aria-label': this.collapsed ? 'Expand auxiliary dock' : 'Collapse auxiliary dock',
      'aria-expanded': this.collapsed ? 'false' : 'true',
      textContent: this.collapsed ? '◀' : '▶',
    });
    applyDarkTheme(this.toggleButton, true);
    if (typeof this.toggleButton.addEventListener === 'function') {
      this.toggleButton.addEventListener('click', () => this.toggleCollapse());
    }

    if (typeof header.appendChild === 'function') {
      header.appendChild(this.titleElement);
      header.appendChild(this.toggleButton);
    }

    return header;
  }

  /**
   * Builds tab buttons for Watchlist, Orders, and Depth.
   *
   * @private
   * @returns {HTMLElement|Object}
   */
  _createNavTabs() {
    const tabsContainer = createEl('div', {
      className: 'dock-workflow-tabs dock-tabs',
      role: 'tablist',
      'aria-label': 'Workflow Tabs',
      style: {
        display: this.collapsed ? 'none' : 'flex',
        gap: '4px',
        padding: '6px 12px',
        background: '#131722',
        borderBottom: '1px solid #2a2e39',
        boxSizing: 'border-box',
      },
    });

    const tabDefs = [
      { id: 'Watchlist', workflow: 'watchlist', label: 'Watchlist' },
      { id: 'Orders', workflow: 'order-execution', label: 'Orders' },
      { id: 'Depth', workflow: 'market-depth', label: 'Depth' },
    ];

    tabDefs.forEach((def) => {
      const isInitial = def.id === this.activeTab;
      const tabBtn = createEl('button', {
        type: 'button',
        className: `dock-tab tab-${def.id.toLowerCase()}${isInitial ? ' active' : ''}`,
        'data-tab': def.id,
        'data-workflow-tab': def.workflow,
        role: 'tab',
        'aria-selected': isInitial ? 'true' : 'false',
        textContent: def.label,
        title: def.label,
      });

      applyDarkTheme(tabBtn, true);
      if (isInitial) {
        tabBtn.style.background = '#2962ff';
        tabBtn.style.borderColor = '#2962ff';
        tabBtn.style.color = '#ffffff';
        tabBtn.style.fontWeight = '600';
      }

      if (typeof tabBtn.addEventListener === 'function') {
        tabBtn.addEventListener('click', (e) => {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          this.switchTab(def.id);
        });
      }

      this.tabButtons.set(def.id, tabBtn);

      if (typeof tabsContainer.appendChild === 'function') {
        tabsContainer.appendChild(tabBtn);
      }
    });

    return tabsContainer;
  }

  /**
   * Toggles the collapsed dock drawer state.
   *
   * @returns {boolean} New collapsed state
   */
  toggleCollapse() {
    return this.setCollapsed(!this.collapsed);
  }

  /**
   * Alias for toggleCollapse.
   */
  toggle() {
    return this.toggleCollapse();
  }

  /**
   * Collapses the dock.
   */
  collapse() {
    return this.setCollapsed(true);
  }

  /**
   * Expands the dock.
   */
  expand() {
    return this.setCollapsed(false);
  }

  /**
   * Sets collapsed layout state.
   *
   * @param {boolean} collapsed
   * @returns {boolean}
   */
  setCollapsed(collapsed) {
    this.collapsed = Boolean(collapsed);
    const targetWidth = this.collapsed ? '48px' : (this.options.width || '280px');
    const minWidth = this.collapsed ? '48px' : '240px';

    if (this.collapsed) {
      this.element.setAttribute('aria-expanded', 'false');
      addClass(this.element, 'collapsed');
      this.element.setAttribute('data-collapsed', 'true');
      if (this.element.style) {
        this.element.style.width = targetWidth;
        this.element.style.minWidth = minWidth;
      }
      if (typeof this.element.setAttribute === 'function') {
        this.element.setAttribute(
          'style',
          `display: flex; flex-direction: column; width: ${targetWidth}; min-width: ${minWidth}; max-width: 360px; height: 100%; max-height: 100%; min-height: 0; flex-shrink: 0; background: #181b24; border-left: 1px solid #2a2e39; box-sizing: border-box; overflow: hidden; color: #d1d4dc; user-select: none; transition: width 0.2s ease;`
        );
      }
      if (this.toggleButton) {
        this.toggleButton.textContent = '◀';
        this.toggleButton.setAttribute('aria-expanded', 'false');
        this.toggleButton.setAttribute('aria-label', 'Expand auxiliary dock');
      }
      if (this.titleElement && this.titleElement.style) {
        this.titleElement.style.display = 'none';
      }
      if (this.navTabs && this.navTabs.style) {
        this.navTabs.style.display = 'none';
      }
      if (this.panelBody && this.panelBody.style) {
        this.panelBody.style.display = 'none';
      }
    } else {
      this.element.setAttribute('aria-expanded', 'true');
      removeClass(this.element, 'collapsed');
      this.element.removeAttribute('data-collapsed');
      if (this.element.style) {
        this.element.style.width = targetWidth;
        this.element.style.minWidth = minWidth;
      }
      if (typeof this.element.setAttribute === 'function') {
        this.element.setAttribute(
          'style',
          `display: flex; flex-direction: column; width: ${targetWidth}; min-width: ${minWidth}; max-width: 360px; height: 100%; max-height: 100%; min-height: 0; flex-shrink: 0; background: #181b24; border-left: 1px solid #2a2e39; box-sizing: border-box; overflow: hidden; color: #d1d4dc; user-select: none; transition: width 0.2s ease;`
        );
      }
      if (this.toggleButton) {
        this.toggleButton.textContent = '▶';
        this.toggleButton.setAttribute('aria-expanded', 'true');
        this.toggleButton.setAttribute('aria-label', 'Collapse auxiliary dock');
      }
      if (this.titleElement && this.titleElement.style) {
        this.titleElement.style.display = 'inline';
      }
      if (this.navTabs && this.navTabs.style) {
        this.navTabs.style.display = 'flex';
      }
      if (this.panelBody && this.panelBody.style) {
        this.panelBody.style.display = 'flex';
      }
    }

    if (typeof this.onToggleCollapse === 'function') {
      this.onToggleCollapse(this.collapsed);
    }
    return this.collapsed;
  }

  /**
   * Switches the active tab and dynamically re-renders the functional panel widget.
   *
   * @param {string} tabName Tab identifier ('Watchlist', 'Orders', 'Depth', or 'Parameters')
   * @param {Object} [opts={}]
   * @returns {AuxiliaryDock}
   */
  switchTab(tabName, opts = {}) {
    const tab = normalizeTabName(tabName);
    this.activeTab = tab;
    this.activeWorkflow =
      tab === 'Orders'
        ? 'order-execution'
        : tab === 'Depth'
        ? 'market-depth'
        : tab === 'Parameters'
        ? 'tool-parameters'
        : 'watchlist';

    if (this.collapsed) {
      this.setCollapsed(false);
    }

    this.element.setAttribute('data-active-tab', tab);
    this.element.setAttribute('data-active-workflow', this.activeWorkflow);

    this.tabButtons.forEach((btn, name) => {
      const isActive = name === tab;
      if (isActive) {
        addClass(btn, 'active');
        btn.setAttribute('aria-selected', 'true');
        btn.setAttribute('class', `dock-tab tab-${name.toLowerCase()} active`);
        if (typeof btn.setAttribute === 'function') {
          btn.setAttribute(
            'style',
            `${CONTROL_THEME_STYLE} background: #2962ff; border-color: #2962ff; color: #ffffff; font-weight: 600; cursor: pointer;`
          );
        }
        if (btn.style) {
          btn.style.background = '#2962ff';
          btn.style.borderColor = '#2962ff';
          btn.style.color = '#ffffff';
          btn.style.fontWeight = '600';
        }
      } else {
        removeClass(btn, 'active');
        btn.setAttribute('aria-selected', 'false');
        btn.setAttribute('class', `dock-tab tab-${name.toLowerCase()}`);
        applyDarkTheme(btn, true);
        if (btn.style) {
          btn.style.fontWeight = 'normal';
        }
      }
    });

    this._renderActiveWidget();

    if (!opts.initial) {
      if (typeof this.onTabChange === 'function') {
        this.onTabChange(tab);
      }
      if (typeof this.onWorkflowChange === 'function') {
        this.onWorkflowChange(this.activeWorkflow, this.getActiveWidget());
      }
    }

    return this;
  }

  /**
   * Alias for switchTab.
   *
   * @param {string} tabName
   */
  selectTab(tabName) {
    return this.switchTab(tabName);
  }

  /**
   * Mounts a custom workflow widget.
   *
   * @param {string} workflow
   * @param {HTMLElement|Object} widget
   */
  mountWorkflow(workflow, widget) {
    if (!workflow) return;
    if (widget) {
      this.workflows.set(workflow, widget);
    }
    this.activateWorkflow(workflow, widget);
  }

  /**
   * Activates a workflow and synchronizes with the active tab.
   *
   * @param {string} workflow
   * @param {HTMLElement|Object} [widget]
   * @returns {HTMLElement|Object}
   */
  activateWorkflow(workflow, widget) {
    if (widget) {
      this.workflows.set(workflow, widget);
    }
    const tab = normalizeTabName(workflow);
    this.switchTab(tab);
    return this.getActiveWidget();
  }

  /**
   * Returns the current active widget element mounted inside the dock panel body.
   *
   * @returns {HTMLElement|Object|null}
   */
  getActiveWidget() {
    if (!this.panelBody || !this.panelBody.children) return null;
    return this.panelBody.children[0] || null;
  }

  /**
   * Re-renders the active widget container in the panel body.
   *
   * @private
   */
  _renderActiveWidget() {
    if (!this.panelBody) return;

    if (typeof this.panelBody.replaceChildren === 'function') {
      this.panelBody.replaceChildren();
    } else {
      while (this.panelBody.firstChild && typeof this.panelBody.removeChild === 'function') {
        this.panelBody.removeChild(this.panelBody.firstChild);
      }
    }

    let widget = null;
    if (this.activeTab === 'Watchlist') {
      widget = this.workflows.get('watchlist') || this._createWatchlistWidget();
    } else if (this.activeTab === 'Orders') {
      widget =
        this.workflows.get('order-execution') ||
        this.workflows.get('orders') ||
        this._createOrdersWidget();
    } else if (this.activeTab === 'Depth') {
      widget =
        this.workflows.get('market-depth') ||
        this.workflows.get('depth') ||
        this._createDepthWidget();
    } else if (this.activeTab === 'Parameters') {
      widget =
        this.workflows.get('tool-parameters') ||
        this.workflows.get('parameters') ||
        this._createToolParametersWidget();
    }

    if (widget && typeof this.panelBody.appendChild === 'function') {
      this.panelBody.appendChild(widget);
    }
  }

  /**
   * Builds the Watchlist widget with functional symbol quote rows.
   *
   * @private
   * @returns {HTMLElement|Object}
   */
  _createWatchlistWidget() {
    const container = createEl('div', {
      id: 'widget-watchlist',
      className: 'watchlist-widget watchlist-table workflow-panel workflow-watchlist',
      'data-testid': 'widget-watchlist',
      'data-workflow': 'watchlist',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        boxSizing: 'border-box',
      },
    });

    const header = createEl('div', {
      className: 'workflow-title watchlist-header',
      style: {
        fontWeight: '600',
        fontSize: '13px',
        color: '#d1d4dc',
        marginBottom: '4px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
    });

    const symHeader = createEl('span', { textContent: 'Symbol / Price' });
    const countBadge = createEl('span', {
      textContent: '4 Pairs',
      style: {
        fontSize: '10px',
        color: '#787b86',
        background: '#1e222d',
        padding: '2px 6px',
        borderRadius: '3px',
      },
    });
    header.appendChild(symHeader);
    header.appendChild(countBadge);
    container.appendChild(header);

    const quotes = [
      { sym: 'BTC/USD', price: '64,250.00', chg: '+2.4%', up: true },
      { sym: 'ETH/USD', price: '3,450.00', chg: '+1.8%', up: true },
      { sym: 'SOL/USD', price: '148.20', chg: '-0.5%', up: false },
      { sym: 'AVAX/USD', price: '32.10', chg: '+3.1%', up: true },
    ];

    quotes.forEach((q) => {
      const row = createEl('div', {
        className: 'quote-row symbol-row',
        'data-testid': 'quote-row',
        'data-symbol': q.sym,
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          background: '#1e222d',
          border: '1px solid #363c4e',
          borderRadius: '4px',
          fontSize: '12px',
          boxSizing: 'border-box',
        },
      });

      const symSpan = createEl('span', {
        textContent: q.sym,
        style: { fontWeight: '600', color: '#d1d4dc' },
      });

      const rightBox = createEl('div', {
        style: { display: 'flex', gap: '8px', alignItems: 'center' },
      });

      const priceSpan = createEl('span', {
        textContent: `$${q.price}`,
        style: { color: '#d1d4dc' },
      });

      const chgSpan = createEl('span', {
        textContent: q.chg,
        style: { color: q.up ? '#26a69a' : '#ef5350', fontSize: '11px', fontWeight: '500' },
      });

      rightBox.appendChild(priceSpan);
      rightBox.appendChild(chgSpan);
      row.appendChild(symSpan);
      row.appendChild(rightBox);
      container.appendChild(row);
    });

    const addBtn = createEl('button', {
      type: 'button',
      className: 'btn-add-symbol',
      'data-action': 'add-symbol',
      textContent: '+ Add Symbol',
    });
    applyDarkTheme(addBtn, true);
    addBtn.style.marginTop = '6px';
    addBtn.style.width = '100%';
    container.appendChild(addBtn);

    return container;
  }

  /**
   * Builds the Orders widget with active order items and execution controls.
   *
   * @private
   * @returns {HTMLElement|Object}
   */
  _createOrdersWidget() {
    const container = createEl('div', {
      id: 'widget-orders',
      className: 'orders-widget orders-list workflow-panel workflow-orders',
      'data-testid': 'widget-orders',
      'data-workflow': 'orders',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        boxSizing: 'border-box',
      },
    });

    const header = createEl('div', {
      className: 'workflow-title orders-header',
      textContent: 'Order Execution & Active Orders',
      style: {
        fontWeight: '600',
        fontSize: '13px',
        color: '#d1d4dc',
        marginBottom: '4px',
      },
    });
    container.appendChild(header);

    const form = createEl('div', {
      className: 'order-form',
      style: { display: 'flex', flexDirection: 'column', gap: '6px' },
    });

    const sideBox = createEl('div', {
      style: { display: 'flex', gap: '6px' },
    });

    const buyBtn = createEl('button', {
      type: 'button',
      className: 'btn-buy',
      'data-side': 'buy',
      textContent: 'Buy / Long',
    });
    applyDarkTheme(buyBtn, true);
    buyBtn.style.flex = '1';

    const sellBtn = createEl('button', {
      type: 'button',
      className: 'btn-sell',
      'data-side': 'sell',
      textContent: 'Sell / Short',
    });
    applyDarkTheme(sellBtn, true);
    sellBtn.style.flex = '1';

    sideBox.appendChild(buyBtn);
    sideBox.appendChild(sellBtn);
    form.appendChild(sideBox);

    const qtyInput = createEl('input', {
      type: 'number',
      className: 'order-qty-input',
      placeholder: 'Quantity (e.g. 1.0)',
      'aria-label': 'Order Quantity',
      value: '1.0',
    });
    applyDarkTheme(qtyInput, false);
    form.appendChild(qtyInput);

    const submitBtn = createEl('button', {
      type: 'button',
      className: 'btn-submit-order',
      'data-action': 'submit-order',
      textContent: 'Place Order',
    });
    applyDarkTheme(submitBtn, true);
    form.appendChild(submitBtn);
    container.appendChild(form);

    const activeOrders = [
      { id: 'ord-1', sym: 'BTC/USD', side: 'Buy', type: 'Limit', price: '63,800.00', qty: '0.5' },
      { id: 'ord-2', sym: 'ETH/USD', side: 'Sell', type: 'Limit', price: '3,500.00', qty: '2.0' },
    ];

    activeOrders.forEach((o) => {
      const item = createEl('div', {
        className: 'order-item order-row',
        'data-testid': 'order-item',
        'data-order-id': o.id,
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          background: '#1e222d',
          border: '1px solid #363c4e',
          borderRadius: '4px',
          fontSize: '11px',
          boxSizing: 'border-box',
        },
      });

      const left = createEl('div', {
        textContent: `${o.side} ${o.qty} ${o.sym} @ $${o.price}`,
        style: { color: o.side === 'Buy' ? '#26a69a' : '#ef5350', fontWeight: '500' },
      });

      const cancelBtn = createEl('button', {
        type: 'button',
        className: 'btn-cancel-order',
        'data-action': 'cancel-order',
        textContent: 'Cancel',
      });
      applyDarkTheme(cancelBtn, true);

      item.appendChild(left);
      item.appendChild(cancelBtn);
      container.appendChild(item);
    });

    return container;
  }

  /**
   * Builds the Depth widget with market depth bars and order book levels.
   *
   * @private
   * @returns {HTMLElement|Object}
   */
  _createDepthWidget() {
    const container = createEl('div', {
      id: 'widget-depth',
      className: 'depth-widget market-depth workflow-panel workflow-depth',
      'data-testid': 'widget-depth',
      'data-workflow': 'depth',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: '100%',
        boxSizing: 'border-box',
      },
    });

    const header = createEl('div', {
      className: 'workflow-title depth-header',
      textContent: 'Market Depth (Order Book)',
      style: {
        fontWeight: '600',
        fontSize: '13px',
        color: '#d1d4dc',
        marginBottom: '4px',
      },
    });
    container.appendChild(header);

    const levels = [
      { side: 'ask', price: '64,300.00', size: '1.250', total: '1.250', pct: 80 },
      { side: 'ask', price: '64,280.00', size: '0.820', total: '2.070', pct: 55 },
      { side: 'bid', price: '64,240.00', size: '1.450', total: '1.450', pct: 90 },
      { side: 'bid', price: '64,220.00', size: '2.100', total: '3.550', pct: 60 },
    ];

    levels.forEach((l) => {
      const bar = createEl('div', {
        className: `depth-bar depth-level depth-${l.side}`,
        'data-testid': 'depth-bar',
        'data-side': l.side,
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 8px',
          background: l.side === 'bid' ? 'rgba(38, 166, 154, 0.15)' : 'rgba(239, 83, 80, 0.15)',
          borderLeft: `3px solid ${l.side === 'bid' ? '#26a69a' : '#ef5350'}`,
          borderRadius: '2px',
          fontSize: '11px',
          boxSizing: 'border-box',
        },
      });

      const priceSpan = createEl('span', {
        textContent: `$${l.price}`,
        style: { color: l.side === 'bid' ? '#26a69a' : '#ef5350', fontWeight: '500' },
      });

      const sizeSpan = createEl('span', {
        textContent: `${l.size} (${l.total})`,
        style: { color: '#787b86' },
      });

      bar.appendChild(priceSpan);
      bar.appendChild(sizeSpan);
      container.appendChild(bar);
    });

    const precisionBtn = createEl('button', {
      type: 'button',
      className: 'btn-depth-precision',
      'data-action': 'precision',
      textContent: 'Precision: 0.01',
    });
    applyDarkTheme(precisionBtn, true);
    precisionBtn.style.marginTop = '6px';
    precisionBtn.style.width = '100%';
    container.appendChild(precisionBtn);

    return container;
  }

  /**
   * Builds the Tool Parameters secondary workflow widget.
   *
   * @private
   * @returns {HTMLElement|Object}
   */
  _createToolParametersWidget() {
    const container = createEl('div', {
      id: 'widget-tool-parameters',
      className: 'parameters-widget tool-parameters workflow-panel workflow-parameters',
      'data-testid': 'widget-tool-parameters',
      'data-workflow': 'tool-parameters',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        boxSizing: 'border-box',
      },
    });

    const header = createEl('div', {
      className: 'workflow-title parameters-header',
      textContent: 'Drawing Tool Parameters',
      style: {
        fontWeight: '600',
        fontSize: '13px',
        color: '#d1d4dc',
        marginBottom: '4px',
      },
    });
    container.appendChild(header);

    const toolSelect = createEl('select', {
      className: 'param-tool-select',
      'aria-label': 'Select Active Tool',
    });
    applyDarkTheme(toolSelect, false);

    ['trendline', 'horizontal', 'fibonacci'].forEach((t) => {
      const opt = createEl('option', { value: t, textContent: t.toUpperCase() });
      toolSelect.appendChild(opt);
    });
    container.appendChild(toolSelect);

    const lineWidthInput = createEl('input', {
      type: 'number',
      className: 'param-line-width',
      placeholder: 'Line Width (px)',
      'aria-label': 'Line Width',
      value: '2',
    });
    applyDarkTheme(lineWidthInput, false);
    container.appendChild(lineWidthInput);

    const applyBtn = createEl('button', {
      type: 'button',
      className: 'btn-apply-parameters',
      'data-action': 'apply-parameters',
      textContent: 'Apply Parameters',
    });
    applyDarkTheme(applyBtn, true);
    container.appendChild(applyBtn);

    return container;
  }

  /**
   * Disposes event listeners and unmounts the dock element.
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.tabButtons.clear();
    this.workflows.clear();
  }
}

export const Dock = AuxiliaryDock;

/**
 * Factory helper creating an AuxiliaryDock instance.
 *
 * @param {Object} [options={}]
 * @returns {AuxiliaryDock}
 */
export function createAuxiliaryDock(options = {}) {
  return new AuxiliaryDock(options);
}

export default AuxiliaryDock;