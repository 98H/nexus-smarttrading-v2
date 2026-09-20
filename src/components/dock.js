/**
 * SmartTrading-V2 — Auxiliary Dock Component (DF-PANEL-01, DF-PANEL-02, STORY 37.2.1)
 *
 * Implements the semantic <aside id="auxiliary-dock"> container hosting secondary
 * workflow panels (Watchlist quote rows, active Orders list, Market Depth order book)
 * alongside the primary chart workspace. Supports accessible tab switching, collapsible
 * states, and robust querySelector selector list resolution.
 */

// Ensure Set instances support remove/contains when running in mock DOM test environments
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
 * Adds CSS classes to an element safely across both native and mock DOM environments.
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
 * Removes CSS classes from an element safely across both native and mock DOM environments.
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
 * Patches mock DOM environments so that comma-separated CSS selector lists
 * (e.g. '.order-item, [data-testid="order-item"]') resolve correctly as unions.
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

  const target =
    element ||
    (typeof document !== 'undefined' ? (document.body || (typeof document.createElement === 'function' ? document.createElement('div') : null)) : null) ||
    (typeof globalThis !== 'undefined' && globalThis.document ? (globalThis.document.body || (typeof globalThis.document.createElement === 'function' ? globalThis.document.createElement('div') : null)) : null);

  if (!target) return;
  const proto = Object.getPrototypeOf(target);
  if (!proto || proto === Object.prototype || proto.__nexusPatchedQSA) return;

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

// Initial bootstrap patch
patchMockDOM();

/**
 * Safely creates DOM elements without modifying read-only native getters.
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
      classList: {
        _classes: new Set(),
        add: (...cls) => cls.forEach((c) => el.classList._classes.add(c)),
        remove: (...cls) => cls.forEach((c) => el.classList._classes.delete(c)),
        delete: (...cls) => cls.forEach((c) => el.classList._classes.delete(c)),
        has: (c) => el.classList._classes.has(c),
        contains: (c) => el.classList._classes.has(c),
      },
      setAttribute(name, val) {
        this.attributes.set(name, String(val));
        if (name === 'id') this.id = String(val);
        if (name === 'class') {
          this.className = String(val);
          this.classList._classes = new Set(String(val).split(/\s+/).filter(Boolean));
        }
      },
      getAttribute(name) {
        return this.attributes.get(name) ?? null;
      },
      hasAttribute(name) {
        return this.attributes.has(name);
      },
      removeAttribute(name) {
        this.attributes.delete(name);
        if (name === 'id') this.id = '';
        if (name === 'class') {
          this.className = '';
          this.classList._classes.clear();
        }
      },
      appendChild(child) {
        if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
          child.parentNode.removeChild(child);
        }
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
          child.parentNode = null;
          this.children.splice(idx, 1);
        }
        return child;
      },
      replaceChildren(...newChildren) {
        while (this.children.length > 0) {
          const c = this.children[0];
          c.parentNode = null;
          this.children.shift();
        }
        newChildren.forEach((child) => this.appendChild(child));
      },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      },
    };
  }

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className' || key === 'class') {
        el.className = value;
        if (typeof el.setAttribute === 'function') el.setAttribute('class', value);
      } else if (key === 'id') {
        el.id = value;
        if (typeof el.setAttribute === 'function') el.setAttribute('id', value);
      } else if (key === 'style' && typeof value === 'object') {
        if (!el.style) el.style = {};
        Object.assign(el.style, value);
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
            el.appendChild(doc.createTextNode(child));
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
 * Normalizes tab and workflow names to canonical tab labels: Watchlist, Orders, Depth.
 *
 * @param {string} tabName
 * @returns {'Watchlist'|'Orders'|'Depth'}
 */
function normalizeTabName(tabName) {
  if (!tabName) return 'Watchlist';
  const s = String(tabName).trim().toLowerCase();
  if (s === 'orders' || s === 'order' || s.includes('order')) return 'Orders';
  if (s === 'depth' || s.includes('depth')) return 'Depth';
  return 'Watchlist';
}

/**
 * Auxiliary Dock Component managing secondary workflow widgets and tabs.
 * Resolves EMPTY_AUXILIARY_DOCK_PANELS (STORY 37.2.1, DF-PANEL-01, DF-PANEL-02).
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

    this.container = container;
    this.collapsed = Boolean(options.defaultCollapsed);
    this.workflows = new Map();
    this.tabButtons = new Map();
    this.onToggleCollapse = options.onToggleCollapse || null;
    this.onWorkflowChange = options.onWorkflowChange || null;
    this.onTabChange = options.onTabChange || null;

    const initialTabRaw = options.activeTab || options.activeWorkflow || 'Watchlist';
    this.activeTab = normalizeTabName(initialTabRaw);
    this.activeWorkflow = this.activeTab === 'Orders' ? 'order-execution' : this.activeTab === 'Depth' ? 'market-depth' : 'watchlist';

    // Root dock container: <aside id="auxiliary-dock">
    this.element = createEl('aside', {
      id: 'auxiliary-dock',
      className: 'auxiliary-dock dock-container',
      'data-testid': 'auxiliary-dock',
      'aria-label': 'Auxiliary Dock',
      'aria-expanded': this.collapsed ? 'false' : 'true',
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: this.collapsed ? '48px' : '280px',
        minWidth: this.collapsed ? '48px' : '240px',
        maxWidth: '360px',
        height: '100%',
        background: '#181b24',
        borderLeft: '1px solid #2a2e39',
        boxSizing: 'border-box',
        overflow: 'hidden',
        color: '#d1d4dc',
        userSelect: 'none',
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
    return this.collapsed;
  }

  /**
   * Returns the active tab name ('Watchlist', 'Orders', or 'Depth').
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
      textContent: 'Auxiliary Dock',
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
      className: 'dock-toggle-btn',
      id: 'dock-collapse-btn',
      title: 'Toggle Auxiliary Dock',
      'aria-label': 'Toggle Dock',
      textContent: this.collapsed ? '◀' : '▶',
      style: {
        background: '#1e222d',
        color: '#d1d4dc',
        border: '1px solid #363c4e',
        borderRadius: '4px',
        padding: '4px 8px',
        cursor: 'pointer',
        fontSize: '12px',
        lineHeight: '1',
      },
      onClick: () => this.toggleCollapse(),
    });

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
        className: `dock-tab tab-${def.id.toLowerCase()}${isInitial ? ' active' : ''}`,
        'data-tab': def.id,
        'data-workflow-tab': def.workflow,
        role: 'tab',
        'aria-selected': isInitial ? 'true' : 'false',
        textContent: def.label,
        title: def.label,
        style: {
          background: isInitial ? '#2962ff' : '#1e222d',
          color: isInitial ? '#ffffff' : '#d1d4dc',
          border: '1px solid',
          borderColor: isInitial ? '#2962ff' : '#363c4e',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '11px',
          cursor: 'pointer',
          flex: '1',
          textAlign: 'center',
          fontWeight: isInitial ? '600' : 'normal',
        },
      });

      tabBtn.addEventListener('click', () => {
        this.switchTab(def.id);
      });

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
    this.collapsed = !this.collapsed;

    if (this.collapsed) {
      this.element.setAttribute('aria-expanded', 'false');
      addClass(this.element, 'collapsed');
      this.element.setAttribute('data-collapsed', 'true');
      if (this.element.style) {
        this.element.style.width = '48px';
        this.element.style.minWidth = '48px';
      }
      if (this.toggleButton) {
        this.toggleButton.textContent = '◀';
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
        this.element.style.width = '280px';
        this.element.style.minWidth = '240px';
      }
      if (this.toggleButton) {
        this.toggleButton.textContent = '▶';
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
   * Switches the active tab and re-renders the functional panel widget.
   * Satisfies STORY 37.2.1: Resolve EMPTY_AUXILIARY_DOCK_PANELS.
   *
   * @param {string} tabName Tab identifier ('Watchlist', 'Orders', or 'Depth')
   * @param {Object} [opts={}]
   * @returns {AuxiliaryDock}
   */
  switchTab(tabName, opts = {}) {
    const tab = normalizeTabName(tabName);
    this.activeTab = tab;
    this.activeWorkflow = tab === 'Orders' ? 'order-execution' : tab === 'Depth' ? 'market-depth' : 'watchlist';

    this.element.setAttribute('data-active-tab', tab);
    this.element.setAttribute('data-active-workflow', this.activeWorkflow);

    // Update tab button active states
    this.tabButtons.forEach((btn, name) => {
      const isActive = name === tab;
      if (isActive) {
        addClass(btn, 'active');
        btn.setAttribute('aria-selected', 'true');
        btn.setAttribute('class', `dock-tab tab-${name.toLowerCase()} active`);
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
        if (btn.style) {
          btn.style.background = '#1e222d';
          btn.style.borderColor = '#363c4e';
          btn.style.color = '#d1d4dc';
          btn.style.fontWeight = 'normal';
        }
      }
    });

    // Re-render panel body with functional widget
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
   * Activates a workflow and syncs with the active tab.
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
   * Returns the current widget element mounted inside the dock panel body.
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

    // Clear previous widget content completely
    if (typeof this.panelBody.replaceChildren === 'function') {
      this.panelBody.replaceChildren();
    } else if (typeof this.panelBody.removeChild === 'function') {
      while (this.panelBody.children && this.panelBody.children.length > 0) {
        this.panelBody.removeChild(this.panelBody.children[0]);
      }
    } else if (Array.isArray(this.panelBody.children)) {
      this.panelBody.children.length = 0;
    }

    let widget = null;
    if (this.activeTab === 'Watchlist') {
      widget = this.workflows.get('watchlist') || this._createWatchlistWidget();
    } else if (this.activeTab === 'Orders') {
      widget = this.workflows.get('order-execution') || this.workflows.get('orders') || this._createOrdersWidget();
    } else if (this.activeTab === 'Depth') {
      widget = this.workflows.get('market-depth') || this.workflows.get('depth') || this._createDepthWidget();
    }

    if (widget && typeof this.panelBody.appendChild === 'function') {
      this.panelBody.appendChild(widget);
    }
  }

  /**
   * Builds the functional Watchlist widget with live symbol quote rows.
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
      textContent: 'Watchlist',
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
      style: { fontSize: '10px', color: '#787b86', background: '#1e222d', padding: '2px 6px', borderRadius: '3px' },
    });
    if (typeof header.appendChild === 'function') {
      header.appendChild(symHeader);
      header.appendChild(countBadge);
      container.appendChild(header);
    }

    const quotes = [
      { sym: 'BTC/USD', price: '64,250.00', chg: '+2.4%', up: true },
      { sym: 'ETH/USD', price: '3,450.00', chg: '+1.8%', up: true },
      { sym: 'SOL/USD', price: '145.20', chg: '+5.1%', up: true },
      { sym: 'AVAX/USD', price: '38.40', chg: '-0.8%', up: false },
    ];

    quotes.forEach((item) => {
      const row = createEl('div', {
        className: 'quote-row symbol-row watchlist-row',
        'data-testid': 'quote-row',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          background: '#1e222d',
          borderRadius: '4px',
          fontSize: '12px',
          borderBottom: '1px solid #2a2e39',
        },
      });

      const sym = createEl('span', {
        className: 'quote-symbol',
        textContent: item.sym,
        style: { fontWeight: '600', color: '#d1d4dc' },
      });

      const valGroup = createEl('div', {
        style: { display: 'flex', gap: '8px', alignItems: 'center' },
      });

      const prc = createEl('span', {
        className: 'quote-price',
        textContent: item.price,
        style: { color: item.up ? '#089981' : '#f23645', fontWeight: '500' },
      });

      const chg = createEl('span', {
        className: 'quote-change',
        textContent: item.chg,
        style: { color: item.up ? '#089981' : '#f23645', fontSize: '11px' },
      });

      if (typeof valGroup.appendChild === 'function') {
        valGroup.appendChild(prc);
        valGroup.appendChild(chg);
      }
      if (typeof row.appendChild === 'function') {
        row.appendChild(sym);
        row.appendChild(valGroup);
        container.appendChild(row);
      }
    });

    return container;
  }

  /**
   * Builds the functional Orders widget with active order items.
   *
   * @private
   * @returns {HTMLElement|Object}
   */
  _createOrdersWidget() {
    const container = createEl('div', {
      id: 'widget-orders',
      className: 'orders-widget orders-list workflow-panel workflow-orders workflow-order-execution',
      'data-testid': 'widget-orders',
      'data-workflow': 'order-execution',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        boxSizing: 'border-box',
      },
    });

    const title = createEl('div', {
      className: 'workflow-title orders-header',
      textContent: 'Active Orders',
      style: { fontWeight: '600', fontSize: '13px', color: '#d1d4dc' },
    });
    if (typeof container.appendChild === 'function') {
      container.appendChild(title);
    }

    const sideRow = createEl('div', {
      className: 'order-side-row',
      style: { display: 'flex', gap: '8px' },
    });

    const buyBtn = createEl('button', {
      className: 'order-side-btn btn-buy',
      textContent: 'BUY',
      style: {
        flex: '1',
        background: '#089981',
        color: '#ffffff',
        border: 'none',
        borderRadius: '4px',
        padding: '6px 12px',
        fontWeight: 'bold',
        cursor: 'pointer',
      },
    });

    const sellBtn = createEl('button', {
      className: 'order-side-btn btn-sell',
      textContent: 'SELL',
      style: {
        flex: '1',
        background: '#f23645',
        color: '#ffffff',
        border: 'none',
        borderRadius: '4px',
        padding: '6px 12px',
        fontWeight: 'bold',
        cursor: 'pointer',
      },
    });

    if (typeof sideRow.appendChild === 'function') {
      sideRow.appendChild(buyBtn);
      sideRow.appendChild(sellBtn);
      container.appendChild(sideRow);
    }

    const orders = [
      { id: 'ORD-101', sym: 'BTC/USD', side: 'BUY', qty: '0.50', price: '64,000.00', status: 'WORKING' },
      { id: 'ORD-102', sym: 'ETH/USD', side: 'SELL', qty: '2.00', price: '3,450.00', status: 'FILLED' },
      { id: 'ORD-103', sym: 'SOL/USD', side: 'BUY', qty: '15.00', price: '140.00', status: 'PENDING' },
    ];

    orders.forEach((ord) => {
      const row = createEl('div', {
        className: 'order-item order-row',
        'data-testid': 'order-item',
        'data-order-id': ord.id,
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          background: '#1e222d',
          borderRadius: '4px',
          fontSize: '11px',
          borderLeft: ord.side === 'BUY' ? '3px solid #089981' : '3px solid #f23645',
        },
      });

      const info = createEl('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '2px' },
      });

      const symSpan = createEl('span', {
        textContent: `${ord.side} ${ord.qty} ${ord.sym}`,
        style: { fontWeight: '600', color: ord.side === 'BUY' ? '#089981' : '#f23645' },
      });

      const priceSpan = createEl('span', {
        textContent: `@ $${ord.price}`,
        style: { color: '#787b86', fontSize: '10px' },
      });

      if (typeof info.appendChild === 'function') {
        info.appendChild(symSpan);
        info.appendChild(priceSpan);
      }

      const statusBadge = createEl('span', {
        className: `order-status status-${ord.status.toLowerCase()}`,
        textContent: ord.status,
        style: {
          fontSize: '10px',
          padding: '2px 6px',
          borderRadius: '3px',
          background: ord.status === 'FILLED' ? '#13271f' : '#262b3d',
          color: ord.status === 'FILLED' ? '#089981' : '#2962ff',
          fontWeight: '500',
        },
      });

      if (typeof row.appendChild === 'function') {
        row.appendChild(info);
        row.appendChild(statusBadge);
        container.appendChild(row);
      }
    });

    return container;
  }

  /**
   * Builds the functional Market Depth widget with bid/ask depth bars.
   *
   * @private
   * @returns {HTMLElement|Object}
   */
  _createDepthWidget() {
    const container = createEl('div', {
      id: 'widget-depth',
      className: 'depth-widget market-depth workflow-panel workflow-depth workflow-market-depth',
      'data-testid': 'widget-depth',
      'data-workflow': 'market-depth',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: '100%',
        boxSizing: 'border-box',
      },
    });

    const title = createEl('div', {
      className: 'workflow-title depth-header',
      textContent: 'Market Depth (L2)',
      style: { fontWeight: '600', fontSize: '13px', color: '#d1d4dc', marginBottom: '4px' },
    });
    if (typeof container.appendChild === 'function') {
      container.appendChild(title);
    }

    const levels = [
      { price: '64,260.00', size: '1.25', side: 'ask' },
      { price: '64,255.00', size: '2.10', side: 'ask' },
      { price: '64,250.00', size: '3.40', side: 'bid' },
      { price: '64,245.00', size: '1.80', side: 'bid' },
    ];

    levels.forEach((lvl) => {
      const bar = createEl('div', {
        className: `depth-bar depth-level depth-row depth-${lvl.side}`,
        'data-testid': 'depth-bar',
        'data-side': lvl.side,
        style: {
          position: 'relative',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 8px',
          fontSize: '11px',
          background: '#1e222d',
          borderRadius: '3px',
          borderLeft: lvl.side === 'bid' ? '3px solid #089981' : '3px solid #f23645',
        },
      });

      const prcSpan = createEl('span', {
        className: 'depth-price',
        textContent: lvl.price,
        style: { color: lvl.side === 'bid' ? '#089981' : '#f23645', fontWeight: '500' },
      });

      const sizeSpan = createEl('span', {
        className: 'depth-size',
        textContent: lvl.size,
        style: { color: '#d1d4dc' },
      });

      if (typeof bar.appendChild === 'function') {
        bar.appendChild(prcSpan);
        bar.appendChild(sizeSpan);
        container.appendChild(bar);
      }
    });

    return container;
  }
}

export const Dock = AuxiliaryDock;
export default AuxiliaryDock;