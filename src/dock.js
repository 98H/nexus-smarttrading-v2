/**
 * SmartTrading-V2 — Auxiliary Workflow Dock
 * Provides a semantic <aside> dock hosting secondary workflow panels
 * (order execution, watchlist, inspector/tool parameters) with accessible
 * collapse/expand toggles, workflow tabs, and dark-theme styled controls.
 * Satisfies STORY 30.6.1 (DF-PANEL-01).
 */

/**
 * Standard dark-theme control palette specification.
 */
const CONTROL_THEME_STYLE =
  'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px;';

/**
 * Helper to sync class attribute and classList for DOM and MockDOM environments.
 *
 * @param {HTMLElement|Object} element
 * @param {string} className
 */
function setClass(element, className) {
  if (!element) return;
  element.setAttribute('class', className);
  if (element.classList && typeof element.classList.add === 'function') {
    const classes = className.split(/\s+/).filter(Boolean);
    element.classList.add(...classes);
  }
}

/**
 * Applies dark-theme styling and hover/active states to buttons and inputs.
 *
 * @param {HTMLElement|Object} el
 * @param {boolean} [isButton=true]
 */
function applyDarkTheme(el, isButton = true) {
  if (!el) return;
  const baseStyle = isButton
    ? `${CONTROL_THEME_STYLE} cursor: pointer;`
    : CONTROL_THEME_STYLE;

  el.setAttribute('style', baseStyle);
  if (el.style) {
    el.style.background = '#1e222d';
    el.style.color = '#d1d4dc';
    el.style.border = '1px solid #363c4e';
    el.style.borderRadius = '4px';
    el.style.padding = '6px 10px';
    if (isButton) {
      el.style.cursor = 'pointer';
    }
  }

  if (typeof el.addEventListener === 'function') {
    const handleHoverEnter = () => {
      if (el.style) {
        el.style.background = '#2a2e39';
        el.style.borderColor = '#4f5966';
        el.style.color = '#ffffff';
      }
    };

    const handleHoverLeave = () => {
      const isSelected =
        el.getAttribute('aria-selected') === 'true' ||
        (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('active'));
      if (el.style) {
        el.style.background = isSelected ? '#2a2e39' : '#1e222d';
        el.style.borderColor = isSelected ? '#2962ff' : '#363c4e';
        el.style.color = isSelected ? '#ffffff' : '#d1d4dc';
      }
    };

    const handleActiveDown = () => {
      if (el.style) {
        el.style.background = '#2962ff';
        el.style.borderColor = '#2962ff';
        el.style.color = '#ffffff';
      }
    };

    const handleActiveUp = () => {
      if (el.style) {
        el.style.background = '#2a2e39';
      }
    };

    el.addEventListener('mouseenter', handleHoverEnter);
    el.addEventListener('mouseover', handleHoverEnter);
    el.addEventListener('mouseleave', handleHoverLeave);
    el.addEventListener('mouseout', handleHoverLeave);
    el.addEventListener('mousedown', handleActiveDown);
    el.addEventListener('mouseup', handleActiveUp);

    el.addEventListener('focus', () => {
      if (el.style) {
        el.style.borderColor = '#2962ff';
        el.style.background = '#2a2e39';
        el.style.outline = 'none';
      }
    });

    el.addEventListener('blur', () => {
      const isSelected =
        el.getAttribute('aria-selected') === 'true' ||
        (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('active'));
      if (el.style) {
        el.style.borderColor = isSelected ? '#2962ff' : '#363c4e';
        el.style.background = isSelected ? '#2a2e39' : '#1e222d';
      }
    });
  }
}

/**
 * Injects CSS rules into document for pro theme hover/focus/active selectors.
 *
 * @param {Document|Object} doc
 */
function injectDockStyles(doc) {
  if (!doc || typeof doc.createElement !== 'function') return;
  const styleId = 'dock-theme-styles';
  if (doc.getElementById && doc.getElementById(styleId)) return;
  try {
    const style = doc.createElement('style');
    style.id = styleId;
    style.textContent = `
      .auxiliary-dock button, .auxiliary-dock input, .auxiliary-dock select {
        background: #1e222d;
        color: #d1d4dc;
        border: 1px solid #363c4e;
        border-radius: 4px;
        padding: 6px 10px;
        box-sizing: border-box;
      }
      .auxiliary-dock button:hover, .auxiliary-dock button:focus {
        background: #2a2e39;
        border-color: #4f5966;
        color: #ffffff;
      }
      .auxiliary-dock button:active, .auxiliary-dock button[aria-selected="true"] {
        background: #2a2e39;
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
 * Formats a panel identifier into an accessible title.
 *
 * @param {string} id - Panel identifier
 * @returns {string} Human-readable panel title
 */
function formatPanelTitle(id) {
  if (!id) return '';
  const titles = {
    'order-execution': 'Order Execution',
    watchlist: 'Watchlist',
    inspector: 'Inspector / Tool Parameters',
  };
  if (titles[id]) return titles[id];
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Formats a panel identifier into a short tab label.
 *
 * @param {string} id
 * @returns {string}
 */
function formatTabLabel(id) {
  const labels = {
    'order-execution': 'Orders',
    watchlist: 'Watchlist',
    inspector: 'Inspector',
  };
  return labels[id] || formatPanelTitle(id);
}

/**
 * Default secondary workflow panels rendered by the dock.
 */
const DEFAULT_PANELS = ['order-execution', 'watchlist', 'inspector'];

/**
 * Component representing the collapsible auxiliary workspace dock.
 */
export class AuxiliaryDock {
  /**
   * @param {Object} [options={}]
   * @param {Document} [options.document] - Document context
   * @param {string[]} [options.panels] - List of panel identifiers
   * @param {boolean} [options.collapsed=false] - Initial collapsed state
   * @param {string} [options.activeTab] - Initially selected workflow tab
   * @param {string} [options.title] - Dock title heading
   * @param {string} [options.ariaLabel] - Accessible landmark label
   * @param {Function} [options.onToggle] - Callback invoked when dock is collapsed/expanded
   * @param {Function} [options.onTabChange] - Callback invoked when tab is changed
   */
  constructor(options = {}) {
    this.options = options || {};
    this.doc =
      this.options.document ||
      (typeof document !== 'undefined' ? document : globalThis.document);
    this.collapsed = Boolean(this.options.collapsed);
    this.panels = Array.isArray(this.options.panels)
      ? this.options.panels
      : DEFAULT_PANELS;

    const firstPanel = this.panels[0];
    const initialTab =
      this.options.activeTab ||
      (typeof firstPanel === 'string' ? firstPanel : firstPanel?.id) ||
      'order-execution';
    this.activeTab = initialTab;

    this.panelElements = new Map();
    this.tabButtons = new Map();
    this.element = null;
    this.toggleButton = null;
    this.panelContainer = null;
    this.tabBar = null;
    this.titleElement = null;

    injectDockStyles(this.doc);
    this._build();
  }

  /**
   * Internal builder assembling semantic markup, landmark roles, and controls.
   * @private
   */
  _build() {
    const doc = this.doc;
    if (!doc || typeof doc.createElement !== 'function') return;

    // Root semantic <aside> dock landmark
    const aside = doc.createElement('aside');
    aside.tagName = 'ASIDE';
    setClass(
      aside,
      'auxiliary-dock dock complementary-dock orders orders-panel side-panel-orders'
    );
    aside.setAttribute('data-testid', 'orders-panel');
    aside.setAttribute('role', 'complementary');
    aside.setAttribute(
      'aria-label',
      this.options.ariaLabel || 'Auxiliary Workflow Dock'
    );
    aside.setAttribute('data-collapsed', this.collapsed ? 'true' : 'false');
    aside.setAttribute('data-active-panel', this.activeTab);
    aside.setAttribute('data-active-tab', this.activeTab);

    if (this.collapsed && aside.classList && typeof aside.classList.add === 'function') {
      aside.classList.add('collapsed');
    }

    const initialWidth = this.collapsed ? '40px' : (this.options.width || '280px');
    aside.style.display = 'flex';
    aside.style.flexDirection = 'column';
    aside.style.height = '100%';
    aside.style.maxHeight = '100%';
    aside.style.minHeight = '0';
    aside.style.flexShrink = '0';
    aside.style.boxSizing = 'border-box';
    aside.style.overflow = 'hidden';
    aside.style.background = '#131722';
    aside.style.borderLeft = '1px solid #2a2e39';
    aside.style.width = initialWidth;
    aside.style.transition = 'width 0.2s ease';
    aside.setAttribute(
      'style',
      `display: flex; flex-direction: column; height: 100%; max-height: 100%; min-height: 0; flex-shrink: 0; box-sizing: border-box; overflow: hidden; background: #131722; border-left: 1px solid #2a2e39; width: ${initialWidth}; transition: width 0.2s ease;`
    );
    this.element = aside;

    // Dock toolbar / header
    const header = doc.createElement('div');
    setClass(header, 'dock-header');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '8px 12px';
    header.style.borderBottom = '1px solid #2a2e39';
    header.style.flexShrink = '0';

    const title = doc.createElement('h2');
    setClass(title, 'dock-title');
    title.textContent = this.options.title || 'Workflow Dock';
    title.style.margin = '0';
    title.style.fontSize = '14px';
    title.style.color = '#d1d4dc';
    title.style.display = this.collapsed ? 'none' : 'block';
    this.titleElement = title;
    header.appendChild(title);

    // Collapse / Expand toggle control
    const toggleBtn = doc.createElement('button');
    toggleBtn.setAttribute('type', 'button');
    setClass(toggleBtn, 'dock-toggle-btn toggle-dock-btn');
    toggleBtn.setAttribute('data-action', 'toggle-dock');
    toggleBtn.setAttribute('aria-expanded', this.collapsed ? 'false' : 'true');
    toggleBtn.setAttribute(
      'aria-label',
      this.collapsed ? 'Expand auxiliary dock' : 'Collapse auxiliary dock'
    );
    toggleBtn.textContent = this.collapsed ? '◀' : '▶';
    applyDarkTheme(toggleBtn, true);

    this._handleToggleClick = (e) => {
      if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      this.toggle();
    };
    toggleBtn.addEventListener('click', this._handleToggleClick);
    this.toggleButton = toggleBtn;
    header.appendChild(toggleBtn);
    aside.appendChild(header);

    // Workflow tabs navigation bar
    const tabBar = doc.createElement('nav');
    setClass(tabBar, 'dock-tabs dock-tab-bar');
    tabBar.setAttribute('role', 'tablist');
    tabBar.setAttribute('aria-label', 'Workflow Tabs');
    tabBar.style.display = this.collapsed ? 'none' : 'flex';
    tabBar.style.gap = '4px';
    tabBar.style.padding = '6px 8px';
    tabBar.style.borderBottom = '1px solid #2a2e39';
    tabBar.style.background = '#181b24';
    tabBar.style.flexShrink = '0';
    tabBar.style.overflowX = 'auto';
    this.tabBar = tabBar;

    this.panels.forEach((p) => {
      const panelId = typeof p === 'string' ? p : p.id;
      const tabBtn = doc.createElement('button');
      tabBtn.setAttribute('type', 'button');
      tabBtn.setAttribute('role', 'tab');
      tabBtn.setAttribute('data-tab', panelId);
      tabBtn.setAttribute('data-panel-tab', panelId);
      tabBtn.setAttribute('data-action', 'select-tab');
      tabBtn.setAttribute('aria-controls', `panel-${panelId}`);
      tabBtn.setAttribute(
        'aria-selected',
        panelId === this.activeTab ? 'true' : 'false'
      );
      tabBtn.textContent = formatTabLabel(panelId);
      applyDarkTheme(tabBtn, true);

      if (panelId === this.activeTab) {
        tabBtn.style.background = '#2a2e39';
        tabBtn.style.borderColor = '#2962ff';
        tabBtn.style.color = '#ffffff';
      }

      tabBtn.addEventListener('click', (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        this.selectTab(panelId);
      });

      this.tabButtons.set(panelId, tabBtn);
      tabBar.appendChild(tabBtn);
    });
    aside.appendChild(tabBar);

    // Panel container hosting secondary workflows within viewport bounds
    const panelContainer = doc.createElement('div');
    panelContainer.setAttribute('data-panel-container', 'true');
    setClass(panelContainer, 'dock-panel-container dock-panels');
    panelContainer.style.flex = '1 1 0%';
    panelContainer.style.minHeight = '0';
    panelContainer.style.overflowY = 'auto';
    panelContainer.style.overflowX = 'hidden';
    panelContainer.style.display = this.collapsed ? 'none' : 'flex';
    panelContainer.style.flexDirection = 'column';
    panelContainer.style.gap = '8px';
    panelContainer.style.padding = '8px';
    this.panelContainer = panelContainer;

    this.panels.forEach((p) => {
      const panelId = typeof p === 'string' ? p : p.id;
      const panelElement = this._createPanelElement(panelId, p);
      const isActive = panelId === this.activeTab;
      panelElement.style.display = isActive ? 'block' : 'none';
      panelElement.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      panelElement.setAttribute('data-active', isActive ? 'true' : 'false');
      this.panelElements.set(panelId, panelElement);
      panelContainer.appendChild(panelElement);
    });

    aside.appendChild(panelContainer);
  }

  /**
   * Constructs an individual workflow panel section.
   *
   * @private
   * @param {string} panelId - Panel key
   * @param {Object|string} panelConfig - Panel definition
   * @returns {HTMLElement}
   */
  _createPanelElement(panelId, panelConfig = {}) {
    const doc = this.doc;
    const panel = doc.createElement('section');
    panel.setAttribute('data-panel', panelId);
    panel.id = `panel-${panelId}`;
    setClass(panel, `dock-panel dock-panel-${panelId} side-panel-${panelId}`);
    panel.setAttribute('role', 'region');
    panel.style.background = '#1e222d';
    panel.style.border = '1px solid #2a2e39';
    panel.style.borderRadius = '4px';
    panel.style.padding = '8px';
    panel.style.boxSizing = 'border-box';

    const titleText =
      (typeof panelConfig === 'object' && panelConfig.title) ||
      formatPanelTitle(panelId);
    panel.setAttribute('aria-label', titleText);

    const header = doc.createElement('div');
    setClass(header, 'panel-header');
    header.style.marginBottom = '6px';

    const title = doc.createElement('h3');
    setClass(title, 'panel-title');
    title.textContent = titleText;
    title.style.margin = '0';
    title.style.fontSize = '12px';
    title.style.color = '#848e9c';
    header.appendChild(title);
    panel.appendChild(header);

    const content = doc.createElement('div');
    setClass(content, 'panel-content');

    if (panelId === 'order-execution') {
      panel.setAttribute('data-testid', 'order-execution-panel');
      const form = doc.createElement('div');
      setClass(form, 'order-form');
      form.style.display = 'flex';
      form.style.flexDirection = 'column';
      form.style.gap = '6px';

      const sideButtons = doc.createElement('div');
      setClass(sideButtons, 'order-side-controls');
      sideButtons.style.display = 'flex';
      sideButtons.style.gap = '6px';

      const buyBtn = doc.createElement('button');
      buyBtn.setAttribute('type', 'button');
      setClass(buyBtn, 'btn-buy');
      buyBtn.setAttribute('data-side', 'buy');
      buyBtn.textContent = 'Buy / Long';
      applyDarkTheme(buyBtn, true);
      buyBtn.style.flex = '1';

      const sellBtn = doc.createElement('button');
      sellBtn.setAttribute('type', 'button');
      setClass(sellBtn, 'btn-sell');
      sellBtn.setAttribute('data-side', 'sell');
      sellBtn.textContent = 'Sell / Short';
      applyDarkTheme(sellBtn, true);
      sellBtn.style.flex = '1';

      sideButtons.appendChild(buyBtn);
      sideButtons.appendChild(sellBtn);
      form.appendChild(sideButtons);

      const qtyInput = doc.createElement('input');
      qtyInput.setAttribute('type', 'number');
      setClass(qtyInput, 'order-qty-input');
      qtyInput.setAttribute('placeholder', 'Quantity');
      qtyInput.setAttribute('aria-label', 'Order Quantity');
      applyDarkTheme(qtyInput, false);
      form.appendChild(qtyInput);

      const submitBtn = doc.createElement('button');
      submitBtn.setAttribute('type', 'button');
      submitBtn.setAttribute('data-action', 'submit-order');
      setClass(submitBtn, 'btn-submit-order');
      submitBtn.textContent = 'Place Order';
      applyDarkTheme(submitBtn, true);
      form.appendChild(submitBtn);

      content.appendChild(form);
    } else if (panelId === 'watchlist') {
      const list = doc.createElement('ul');
      setClass(list, 'watchlist-list');
      list.style.listStyle = 'none';
      list.style.margin = '0';
      list.style.padding = '0';

      const symbols = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
      symbols.forEach((sym) => {
        const item = doc.createElement('li');
        setClass(item, 'watchlist-item');
        item.setAttribute('data-symbol', sym);
        item.textContent = sym;
        item.style.padding = '4px 0';
        item.style.color = '#d1d4dc';
        item.style.fontSize = '12px';
        list.appendChild(item);
      });
      content.appendChild(list);

      const addBtn = doc.createElement('button');
      addBtn.setAttribute('type', 'button');
      addBtn.setAttribute('data-action', 'add-symbol');
      setClass(addBtn, 'btn-add-symbol');
      addBtn.textContent = '+ Add Symbol';
      addBtn.style.marginTop = '8px';
      addBtn.style.width = '100%';
      applyDarkTheme(addBtn, true);
      content.appendChild(addBtn);
    } else if (panelId === 'inspector') {
      const inspectorView = doc.createElement('div');
      setClass(inspectorView, 'inspector-view');

      const inspectorStatus = doc.createElement('p');
      setClass(inspectorStatus, 'inspector-status');
      inspectorStatus.textContent = 'No drawing or tool selected';
      inspectorStatus.style.margin = '0 0 8px 0';
      inspectorStatus.style.color = '#848e9c';
      inspectorStatus.style.fontSize = '12px';
      inspectorView.appendChild(inspectorStatus);

      const resetBtn = doc.createElement('button');
      resetBtn.setAttribute('type', 'button');
      resetBtn.setAttribute('data-action', 'reset-tools');
      setClass(resetBtn, 'btn-reset-tools');
      resetBtn.textContent = 'Reset Tool Settings';
      resetBtn.style.width = '100%';
      applyDarkTheme(resetBtn, true);
      inspectorView.appendChild(resetBtn);

      content.appendChild(inspectorView);
    } else {
      const defaultContent = doc.createElement('div');
      setClass(defaultContent, 'panel-default-content');
      defaultContent.textContent = `${titleText} Content`;
      defaultContent.style.color = '#848e9c';
      defaultContent.style.fontSize = '12px';
      content.appendChild(defaultContent);
    }

    panel.appendChild(content);
    return panel;
  }

  /**
   * Switches the actively displayed workflow tab.
   *
   * @param {string} panelId - Target panel identifier
   * @returns {string} Active panel identifier
   */
  selectTab(panelId) {
    if (!panelId) return this.activeTab;

    if (this.collapsed) {
      this.setCollapsed(false);
    }

    this.activeTab = panelId;

    if (this.element) {
      this.element.setAttribute('data-active-panel', panelId);
      this.element.setAttribute('data-active-tab', panelId);
    }

    if (this.tabButtons) {
      this.tabButtons.forEach((btn, id) => {
        const isSelected = id === panelId;
        btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        if (btn.classList) {
          if (typeof btn.classList.toggle === 'function') {
            btn.classList.toggle('active', isSelected);
          } else if (isSelected && typeof btn.classList.add === 'function') {
            btn.classList.add('active');
          } else if (!isSelected && typeof btn.classList.remove === 'function') {
            btn.classList.remove('active');
          }
        }
        if (btn.style) {
          btn.style.background = isSelected ? '#2a2e39' : '#1e222d';
          btn.style.borderColor = isSelected ? '#2962ff' : '#363c4e';
          btn.style.color = isSelected ? '#ffffff' : '#d1d4dc';
        }
      });
    }

    if (this.panelElements) {
      this.panelElements.forEach((panelEl, id) => {
        const isActive = id === panelId;
        panelEl.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        panelEl.setAttribute('data-active', isActive ? 'true' : 'false');
        if (panelEl.classList) {
          if (typeof panelEl.classList.toggle === 'function') {
            panelEl.classList.toggle('active', isActive);
          } else if (isActive && typeof panelEl.classList.add === 'function') {
            panelEl.classList.add('active');
          } else if (!isActive && typeof panelEl.classList.remove === 'function') {
            panelEl.classList.remove('active');
          }
        }
        if (panelEl.style) {
          panelEl.style.display = isActive ? 'block' : 'none';
        }
      });
    }

    if (this.titleElement) {
      this.titleElement.textContent = formatPanelTitle(panelId);
    }

    if (typeof this.options.onTabChange === 'function') {
      this.options.onTabChange(panelId);
    }

    return this.activeTab;
  }

  /**
   * Alias for selectTab.
   *
   * @param {string} panelId
   * @returns {string}
   */
  selectPanel(panelId) {
    return this.selectTab(panelId);
  }

  /**
   * Returns current active tab identifier.
   * @returns {string}
   */
  getActiveTab() {
    return this.activeTab;
  }

  /**
   * Returns current collapsed state.
   * @returns {boolean}
   */
  isCollapsed() {
    return Boolean(this.collapsed);
  }

  /**
   * Toggles dock collapsed/expanded layout state.
   * @returns {boolean} New collapsed state
   */
  toggle() {
    return this.setCollapsed(!this.collapsed);
  }

  /**
   * Collapses the dock.
   * @returns {boolean}
   */
  collapse() {
    return this.setCollapsed(true);
  }

  /**
   * Expands the dock.
   * @returns {boolean}
   */
  expand() {
    return this.setCollapsed(false);
  }

  /**
   * Sets collapsed layout state and syncs accessibility attributes.
   *
   * @param {boolean} collapsed
   * @returns {boolean}
   */
  setCollapsed(collapsed) {
    this.collapsed = Boolean(collapsed);
    const targetWidth = this.collapsed ? '40px' : (this.options.width || '280px');

    if (this.element) {
      this.element.setAttribute('data-collapsed', this.collapsed ? 'true' : 'false');
      if (this.collapsed) {
        if (this.element.classList && typeof this.element.classList.add === 'function') {
          this.element.classList.add('collapsed');
        }
      } else {
        if (this.element.classList && typeof this.element.classList.remove === 'function') {
          this.element.classList.remove('collapsed');
        }
      }
      this.element.style.width = targetWidth;
      const currentStyle = this.element.getAttribute('style') || '';
      if (currentStyle) {
        this.element.setAttribute(
          'style',
          currentStyle.replace(/width:\s*[^;]+;?/, `width: ${targetWidth};`)
        );
      }
    }

    if (this.titleElement) {
      this.titleElement.style.display = this.collapsed ? 'none' : 'block';
    }

    if (this.tabBar) {
      this.tabBar.style.display = this.collapsed ? 'none' : 'flex';
    }

    if (this.panelContainer) {
      this.panelContainer.style.display = this.collapsed ? 'none' : 'flex';
    }

    if (this.toggleButton) {
      this.toggleButton.setAttribute('aria-expanded', this.collapsed ? 'false' : 'true');
      this.toggleButton.setAttribute(
        'aria-label',
        this.collapsed ? 'Expand auxiliary dock' : 'Collapse auxiliary dock'
      );
      this.toggleButton.textContent = this.collapsed ? '◀' : '▶';
    }

    if (typeof this.options.onToggle === 'function') {
      this.options.onToggle(this.collapsed);
    }

    return this.collapsed;
  }

  /**
   * Returns the root semantic <aside> element.
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.element;
  }

  /**
   * Returns a workflow panel element by key.
   *
   * @param {string} id - Panel identifier
   * @returns {HTMLElement|null}
   */
  getPanel(id) {
    return this.panelElements.get(id) || null;
  }

  /**
   * Disposes event listeners and unmounts the dock element.
   */
  destroy() {
    if (this.toggleButton && this._handleToggleClick) {
      if (typeof this.toggleButton.removeEventListener === 'function') {
        this.toggleButton.removeEventListener('click', this._handleToggleClick);
      }
    }
    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
    this.panelElements.clear();
    this.tabButtons.clear();
  }
}

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