/**
 * SmartTrading-V2 — Auxiliary Workflow Dock
 * Provides a semantic <aside> dock hosting secondary workflow panels
 * (order execution, watchlist, inspector/tool parameters) with accessible
 * collapse/expand toggles and dynamic layout management.
 */

/**
 * Helper to sync class attribute and classList for DOM and MockDOM environments.
 *
 * @param {HTMLElement|Object} element
 * @param {string} className
 */
function setClass(element, className) {
  element.setAttribute('class', className);
  if (element.classList && typeof element.classList.add === 'function') {
    const classes = className.split(/\s+/).filter(Boolean);
    element.classList.add(...classes);
  }
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
   * @param {string} [options.title] - Dock title heading
   * @param {string} [options.ariaLabel] - Accessible complementary landmark label
   * @param {Function} [options.onToggle] - Callback invoked when dock is collapsed/expanded
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
    this.panelElements = new Map();
    this.element = null;
    this.toggleButton = null;
    this.panelContainer = null;
    this.titleElement = null;

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
    if (this.collapsed && aside.classList && typeof aside.classList.add === 'function') {
      aside.classList.add('collapsed');
    }

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
    aside.style.width = this.collapsed ? '40px' : (this.options.width || '280px');
    aside.style.transition = 'width 0.2s ease';
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

    // Collapse / Expand toggle control (DF-THEME-01)
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

    const controlStyle =
      'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer;';
    toggleBtn.setAttribute('style', controlStyle);
    toggleBtn.style.background = '#1e222d';
    toggleBtn.style.color = '#d1d4dc';
    toggleBtn.style.border = '1px solid #363c4e';
    toggleBtn.style.borderRadius = '4px';
    toggleBtn.style.padding = '6px 10px';
    toggleBtn.style.cursor = 'pointer';

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
    setClass(panel, `dock-panel dock-panel-${panelId} side-panel-${panelId}`);
    panel.setAttribute('role', 'region');
    panel.style.background = '#1e222d';
    panel.style.border = '1px solid #2a2e39';
    panel.style.borderRadius = '4px';
    panel.style.padding = '8px';

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

    const buttonStyle =
      'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px; cursor: pointer; flex: 1;';
    const inputStyle =
      'background: #1e222d; color: #d1d4dc; border: 1px solid #363c4e; border-radius: 4px; padding: 6px 10px;';

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
      buyBtn.setAttribute('style', buttonStyle);
      buyBtn.style.background = '#1e222d';
      buyBtn.style.color = '#d1d4dc';
      buyBtn.style.border = '1px solid #363c4e';
      buyBtn.style.borderRadius = '4px';
      buyBtn.style.padding = '6px 10px';
      buyBtn.style.cursor = 'pointer';
      buyBtn.style.flex = '1';

      const sellBtn = doc.createElement('button');
      sellBtn.setAttribute('type', 'button');
      setClass(sellBtn, 'btn-sell');
      sellBtn.setAttribute('data-side', 'sell');
      sellBtn.textContent = 'Sell / Short';
      sellBtn.setAttribute('style', buttonStyle);
      sellBtn.style.background = '#1e222d';
      sellBtn.style.color = '#d1d4dc';
      sellBtn.style.border = '1px solid #363c4e';
      sellBtn.style.borderRadius = '4px';
      sellBtn.style.padding = '6px 10px';
      sellBtn.style.cursor = 'pointer';
      sellBtn.style.flex = '1';

      sideButtons.appendChild(buyBtn);
      sideButtons.appendChild(sellBtn);
      form.appendChild(sideButtons);

      const qtyInput = doc.createElement('input');
      qtyInput.setAttribute('type', 'number');
      setClass(qtyInput, 'order-qty-input');
      qtyInput.setAttribute('placeholder', 'Quantity');
      qtyInput.setAttribute('aria-label', 'Order Quantity');
      qtyInput.setAttribute('style', inputStyle);
      qtyInput.style.background = '#1e222d';
      qtyInput.style.color = '#d1d4dc';
      qtyInput.style.border = '1px solid #363c4e';
      qtyInput.style.borderRadius = '4px';
      qtyInput.style.padding = '6px 10px';
      form.appendChild(qtyInput);

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
    } else if (panelId === 'inspector') {
      const inspectorView = doc.createElement('div');
      setClass(inspectorView, 'inspector-view');

      const inspectorStatus = doc.createElement('p');
      setClass(inspectorStatus, 'inspector-status');
      inspectorStatus.textContent = 'No drawing or tool selected';
      inspectorStatus.style.margin = '0';
      inspectorStatus.style.color = '#848e9c';
      inspectorStatus.style.fontSize = '12px';
      inspectorView.appendChild(inspectorStatus);

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

    if (this.element) {
      this.element.setAttribute('data-collapsed', this.collapsed ? 'true' : 'false');
      if (this.collapsed) {
        if (this.element.classList && typeof this.element.classList.add === 'function') {
          this.element.classList.add('collapsed');
        }
        this.element.style.width = '40px';
      } else {
        if (this.element.classList && typeof this.element.classList.remove === 'function') {
          this.element.classList.remove('collapsed');
        }
        this.element.style.width = this.options.width || '280px';
      }
    }

    if (this.titleElement) {
      this.titleElement.style.display = this.collapsed ? 'none' : 'block';
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