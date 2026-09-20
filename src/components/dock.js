/**
 * SmartTrading-V2 — Auxiliary Dock Component (DF-PANEL-01, STORY 31.4.1)
 *
 * Implements the semantic <aside id="auxiliary-dock"> container hosting secondary
 * workflow panels (order execution, watchlist, market depth) alongside the primary
 * chart canvas workspace. Supports collapsible state toggling and accessible ARIA attributes.
 */

/**
 * Traverses an element tree to match attribute selectors like [attr="val"] or [attr].
 *
 * @param {Object|HTMLElement} node
 * @param {string} selector
 * @returns {Object|HTMLElement|null}
 */
function findByAttribute(node, selector) {
  if (!node || !node.children) return null;
  const match = selector.match(/^\[([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/);
  if (!match) return null;

  const key = match[1];
  const expected = match[2] ?? match[3] ?? match[4];

  for (const child of node.children) {
    const val = typeof child.getAttribute === 'function' ? child.getAttribute(key) : child[key];
    const hasAttr = typeof child.hasAttribute === 'function'
      ? child.hasAttribute(key)
      : val !== undefined && val !== null;

    if (expected !== undefined ? String(val) === String(expected) : hasAttr) {
      return child;
    }
    const found = findByAttribute(child, selector);
    if (found) return found;
  }
  return null;
}

/**
 * Creates DOM elements safely across browser and test mock environments.
 *
 * @param {string} tag
 * @param {Object} [attrs={}]
 * @param {Array<HTMLElement|Object>|string} [children=[]]
 * @returns {HTMLElement|Object}
 */
function createEl(tag, attrs = {}, children = []) {
  let el;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    el = document.createElement(tag);
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
        toggle: (c) => {
          if (el.classList._classes.has(c)) {
            el.classList._classes.delete(c);
            return false;
          }
          el.classList._classes.add(c);
          return true;
        },
        contains: (c) => el.classList._classes.has(c),
      },
      setAttribute(name, val) {
        this.attributes.set(name, String(val));
        if (name === 'id') this.id = String(val);
        if (name === 'class') {
          this.className = String(val);
          this.classList._classes = new Set(String(val).split(' ').filter(Boolean));
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
      addEventListener() {},
      dispatchEvent() { return true; },
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
          if (typeof document !== 'undefined' && typeof document.createTextNode === 'function') {
            el.appendChild(document.createTextNode(child));
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
 * Auxiliary Dock Component managing secondary workflow hosting and collapsing states.
 */
export class AuxiliaryDock {
  /**
   * @param {Object} [options={}]
   * @param {boolean} [options.defaultCollapsed=false]
   * @param {string} [options.activeWorkflow]
   * @param {Function} [options.onToggleCollapse]
   * @param {Function} [options.onWorkflowChange]
   */
  constructor(options = {}) {
    this.collapsed = Boolean(options.defaultCollapsed);
    this.workflows = new Map();
    this.activeWorkflow = null;
    this.onToggleCollapse = options.onToggleCollapse || null;
    this.onWorkflowChange = options.onWorkflowChange || null;

    // Create semantic <aside id="auxiliary-dock">
    this.element = createEl('aside', {
      id: 'auxiliary-dock',
      className: 'auxiliary-dock',
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
      this.element.classList.add('collapsed');
      this.element.setAttribute('data-collapsed', 'true');
    }

    this._patchMockDOM(this.element);

    // Header bar with title and toggle collapse button
    this.header = this._createHeader();
    if (typeof this.element.appendChild === 'function') {
      this.element.appendChild(this.header);
    }

    // Workflow navigation tabs
    this.navTabs = this._createNavTabs();
    if (typeof this.element.appendChild === 'function') {
      this.element.appendChild(this.navTabs);
    }

    // Panel container hosting active secondary workflow widget
    this.panelContainer = createEl('div', {
      className: 'dock-panel-host',
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
    if (typeof this.element.appendChild === 'function') {
      this.element.appendChild(this.panelContainer);
    }

    if (options.activeWorkflow) {
      this.activateWorkflow(options.activeWorkflow);
    }
  }

  /**
   * Ensures mock DOM instances seamlessly support attribute selectors in querySelector.
   *
   * @param {HTMLElement|Object} element
   * @private
   */
  _patchMockDOM(element) {
    if (!element) return;

    const proto = Object.getPrototypeOf(element);
    if (proto && typeof proto._matches === 'function' && !proto.__nexusPatched) {
      const origMatches = proto._matches;
      proto._matches = function (el, selector) {
        if (typeof selector === 'string' && selector.startsWith('[') && selector.endsWith(']')) {
          const content = selector.slice(1, -1);
          const eq = content.indexOf('=');
          if (eq !== -1) {
            const key = content.slice(0, eq).trim();
            let expected = content.slice(eq + 1).trim();
            if ((expected.startsWith('"') && expected.endsWith('"')) || (expected.startsWith("'") && expected.endsWith("'"))) {
              expected = expected.slice(1, -1);
            }
            return typeof el.getAttribute === 'function' ? el.getAttribute(key) === expected : el[key] === expected;
          }
          return typeof el.hasAttribute === 'function' ? el.hasAttribute(content.trim()) : el[content.trim()] !== undefined;
        }
        return origMatches.call(this, el, selector);
      };
      proto.__nexusPatched = true;
    }

    if (typeof element.querySelector === 'function') {
      const origQS = element.querySelector.bind(element);
      element.querySelector = function (selector) {
        if (typeof selector === 'string' && selector.startsWith('[')) {
          const found = findByAttribute(this, selector);
          if (found) return found;
        }
        try {
          return origQS(selector);
        } catch {
          return null;
        }
      };
    }
  }

  /**
   * Builds the dock header with title and collapsible trigger.
   *
   * @returns {HTMLElement|Object}
   * @private
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
   * Builds secondary workflow switcher buttons.
   *
   * @returns {HTMLElement|Object}
   * @private
   */
  _createNavTabs() {
    const tabsContainer = createEl('div', {
      className: 'dock-workflow-tabs',
      style: {
        display: this.collapsed ? 'none' : 'flex',
        gap: '4px',
        padding: '6px 12px',
        background: '#131722',
        borderBottom: '1px solid #2a2e39',
        boxSizing: 'border-box',
      },
    });

    const workflowDefs = [
      { id: 'order-execution', label: 'Orders' },
      { id: 'watchlist', label: 'Watchlist' },
      { id: 'market-depth', label: 'Depth' },
    ];

    this.tabButtons = new Map();

    workflowDefs.forEach((def) => {
      const tabBtn = createEl('button', {
        className: `dock-tab-btn tab-${def.id}`,
        'data-workflow-tab': def.id,
        textContent: def.label,
        title: def.label,
        style: {
          background: '#1e222d',
          color: '#d1d4dc',
          border: '1px solid #363c4e',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '11px',
          cursor: 'pointer',
          flex: '1',
          textAlign: 'center',
        },
        onClick: () => this.activateWorkflow(def.id),
      });
      this.tabButtons.set(def.id, tabBtn);
      if (typeof tabsContainer.appendChild === 'function') {
        tabsContainer.appendChild(tabBtn);
      }
    });

    return tabsContainer;
  }

  /**
   * Returns the underlying DOM element representing the auxiliary dock.
   *
   * @returns {HTMLElement|Object}
   */
  getElement() {
    return this.element;
  }

  /**
   * Checks whether the dock is currently in collapsed state.
   *
   * @returns {boolean}
   */
  isCollapsed() {
    return this.collapsed;
  }

  /**
   * Toggles the collapsible state and updates accessibility attributes.
   *
   * @returns {boolean} New collapsed state
   */
  toggleCollapse() {
    this.collapsed = !this.collapsed;

    if (this.collapsed) {
      this.element.setAttribute('aria-expanded', 'false');
      this.element.classList.add('collapsed');
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
      if (this.panelContainer && this.panelContainer.style) {
        this.panelContainer.style.display = 'none';
      }
    } else {
      this.element.setAttribute('aria-expanded', 'true');
      this.element.classList.remove('collapsed');
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
      if (this.panelContainer && this.panelContainer.style) {
        this.panelContainer.style.display = 'flex';
      }
    }

    if (typeof this.onToggleCollapse === 'function') {
      this.onToggleCollapse(this.collapsed);
    }
    return this.collapsed;
  }

  /**
   * Returns the identifier of the currently active secondary workflow.
   *
   * @returns {string|null}
   */
  getActiveWorkflow() {
    return this.activeWorkflow;
  }

  /**
   * Mounts and hosts a secondary workflow widget panel.
   *
   * @param {string} workflow Workflow identifier (order-execution, watchlist, market-depth)
   * @param {HTMLElement|Object} widget DOM element representation of the widget panel
   */
  mountWorkflow(workflow, widget) {
    if (!workflow) return;
    if (widget) {
      if (typeof widget.setAttribute === 'function') {
        if (!widget.hasAttribute?.('data-workflow')) {
          widget.setAttribute('data-workflow', workflow);
        }
      }
      this.workflows.set(workflow, widget);
    }
    this.activateWorkflow(workflow);
  }

  /**
   * Activates a secondary workflow, rendering its panel and updating active state.
   *
   * @param {string} workflow Workflow identifier
   * @returns {HTMLElement|Object} Mounted widget panel
   */
  activateWorkflow(workflow) {
    if (!workflow) return null;
    this.activeWorkflow = workflow;
    this.element.setAttribute('data-active-workflow', workflow);

    if (this.tabButtons) {
      this.tabButtons.forEach((btn, id) => {
        if (btn.style) {
          if (id === workflow) {
            btn.style.background = '#2962ff';
            btn.style.borderColor = '#2962ff';
            btn.style.color = '#ffffff';
          } else {
            btn.style.background = '#1e222d';
            btn.style.borderColor = '#363c4e';
            btn.style.color = '#d1d4dc';
          }
        }
      });
    }

    let widget = this.workflows.get(workflow);
    if (!widget) {
      widget = this._createDefaultWidget(workflow);
      this.workflows.set(workflow, widget);
    }

    if (this.panelContainer && typeof this.panelContainer.removeChild === 'function') {
      while (this.panelContainer.children && this.panelContainer.children.length > 0) {
        this.panelContainer.removeChild(this.panelContainer.children[0]);
      }
      if (typeof this.panelContainer.appendChild === 'function') {
        this.panelContainer.appendChild(widget);
      }
    }

    if (typeof this.onWorkflowChange === 'function') {
      this.onWorkflowChange(workflow, widget);
    }

    return widget;
  }

  /**
   * Creates a default secondary workflow panel when none is pre-mounted.
   *
   * @param {string} workflow
   * @returns {HTMLElement|Object}
   * @private
   */
  _createDefaultWidget(workflow) {
    const container = createEl('div', {
      id: `widget-${workflow}`,
      className: `workflow-panel workflow-${workflow}`,
      'data-workflow': workflow,
      'data-testid': `secondary-panel-${workflow}`,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        boxSizing: 'border-box',
      },
    });

    if (workflow === 'order-execution') {
      this._buildOrderExecutionPanel(container);
    } else if (workflow === 'watchlist') {
      this._buildWatchlistPanel(container);
    } else if (workflow === 'market-depth') {
      this._buildMarketDepthPanel(container);
    } else {
      const header = createEl('div', {
        className: 'workflow-title',
        textContent: workflow.replace(/-/g, ' ').toUpperCase(),
        style: { fontWeight: '600', fontSize: '13px', color: '#d1d4dc' },
      });
      if (typeof container.appendChild === 'function') {
        container.appendChild(header);
      }
    }

    return container;
  }

  /**
   * Constructs the order execution secondary panel (DF-THEME-01).
   *
   * @param {HTMLElement|Object} container
   * @private
   */
  _buildOrderExecutionPanel(container) {
    const title = createEl('div', {
      className: 'workflow-title',
      textContent: 'Order Execution',
      style: { fontWeight: '600', fontSize: '13px', color: '#d1d4dc' },
    });

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
        padding: '8px 12px',
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
        padding: '8px 12px',
        fontWeight: 'bold',
        cursor: 'pointer',
      },
    });

    if (typeof sideRow.appendChild === 'function') {
      sideRow.appendChild(buyBtn);
      sideRow.appendChild(sellBtn);
    }

    const typeSelect = createEl('select', {
      className: 'order-type-select',
      style: {
        background: '#1e222d',
        color: '#d1d4dc',
        border: '1px solid #363c4e',
        borderRadius: '4px',
        padding: '6px 10px',
        cursor: 'pointer',
      },
    });

    const optLimit = createEl('option', { value: 'limit', textContent: 'Limit Order' });
    const optMarket = createEl('option', { value: 'market', textContent: 'Market Order' });
    if (typeof typeSelect.appendChild === 'function') {
      typeSelect.appendChild(optLimit);
      typeSelect.appendChild(optMarket);
    }

    if (typeof container.appendChild === 'function') {
      container.appendChild(title);
      container.appendChild(sideRow);
      container.appendChild(typeSelect);
    }
  }

  /**
   * Constructs the watchlist secondary panel.
   *
   * @param {HTMLElement|Object} container
   * @private
   */
  _buildWatchlistPanel(container) {
    const title = createEl('div', {
      className: 'workflow-title',
      textContent: 'Watchlist',
      style: { fontWeight: '600', fontSize: '13px', color: '#d1d4dc' },
    });

    const list = createEl('div', {
      className: 'watchlist-items',
      style: { display: 'flex', flexDirection: 'column', gap: '8px' },
    });

    const symbols = [
      { sym: 'BTC/USD', price: '64,250.00', chg: '+2.4%' },
      { sym: 'ETH/USD', price: '3,450.00', chg: '+1.8%' },
      { sym: 'SOL/USD', price: '145.20', chg: '+5.1%' },
    ];

    symbols.forEach((item) => {
      const row = createEl('div', {
        className: 'watchlist-row',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          padding: '4px 0',
          borderBottom: '1px solid #2a2e39',
        },
      });
      const symSpan = createEl('span', { textContent: item.sym, style: { fontWeight: '500' } });
      const prcSpan = createEl('span', { textContent: item.price, style: { color: '#089981' } });
      if (typeof row.appendChild === 'function') {
        row.appendChild(symSpan);
        row.appendChild(prcSpan);
      }
      if (typeof list.appendChild === 'function') {
        list.appendChild(row);
      }
    });

    if (typeof container.appendChild === 'function') {
      container.appendChild(title);
      container.appendChild(list);
    }
  }

  /**
   * Constructs the market depth order book secondary panel.
   *
   * @param {HTMLElement|Object} container
   * @private
   */
  _buildMarketDepthPanel(container) {
    const title = createEl('div', {
      className: 'workflow-title',
      textContent: 'Market Depth',
      style: { fontWeight: '600', fontSize: '13px', color: '#d1d4dc' },
    });

    const depthTable = createEl('div', {
      className: 'market-depth-book',
      style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' },
    });

    const levels = [
      { price: '64,260.00', size: '1.25', side: 'ask' },
      { price: '64,255.00', size: '2.10', side: 'ask' },
      { price: '64,250.00', size: '3.40', side: 'bid' },
      { price: '64,245.00', size: '1.80', side: 'bid' },
    ];

    levels.forEach((lvl) => {
      const row = createEl('div', {
        className: `depth-row depth-${lvl.side}`,
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          color: lvl.side === 'bid' ? '#089981' : '#f23645',
        },
      });
      const prc = createEl('span', { textContent: lvl.price });
      const qty = createEl('span', { textContent: lvl.size });
      if (typeof row.appendChild === 'function') {
        row.appendChild(prc);
        row.appendChild(qty);
      }
      if (typeof depthTable.appendChild === 'function') {
        depthTable.appendChild(row);
      }
    });

    if (typeof container.appendChild === 'function') {
      container.appendChild(title);
      container.appendChild(depthTable);
    }
  }
}