/**
 * SmartTrading-V2 — Auxiliary Workflow Dock
 * Provides a semantic <aside> dock hosting secondary workflow panels
 * (order execution, watchlist, inspector/tool parameters) with accessible
 * collapse/expand toggles and dynamic layout management.
 */

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
    aside.setAttribute('class', 'auxiliary-dock dock complementary-dock');
    aside.setAttribute('role', 'complementary');
    aside.setAttribute(
      'aria-label',
      this.options.ariaLabel || 'Auxiliary Workflow Dock'
    );
    aside.setAttribute('data-collapsed', this.collapsed ? 'true' : 'false');
    if (this.collapsed) {
      aside.classList.add('collapsed');
    }
    this.element = aside;

    // Dock toolbar / header
    const header = doc.createElement('div');
    header.setAttribute('class', 'dock-header');

    const title = doc.createElement('h2');
    title.setAttribute('class', 'dock-title');
    title.textContent = this.options.title || 'Workflow Dock';
    header.appendChild(title);

    // Collapse / Expand toggle control
    const toggleBtn = doc.createElement('button');
    toggleBtn.setAttribute('type', 'button');
    toggleBtn.setAttribute('class', 'dock-toggle-btn toggle-dock-btn');
    toggleBtn.setAttribute('data-action', 'toggle-dock');
    toggleBtn.setAttribute('aria-expanded', this.collapsed ? 'false' : 'true');
    toggleBtn.setAttribute(
      'aria-label',
      this.collapsed ? 'Expand auxiliary dock' : 'Collapse auxiliary dock'
    );
    toggleBtn.textContent = this.collapsed ? '◀' : '▶';

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

    // Panel container hosting secondary workflows
    const panelContainer = doc.createElement('div');
    panelContainer.setAttribute('data-panel-container', 'true');
    panelContainer.setAttribute('class', 'dock-panel-container dock-panels');
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
    panel.setAttribute('class', `dock-panel dock-panel-${panelId}`);
    panel.setAttribute('role', 'region');

    const titleText =
      (typeof panelConfig === 'object' && panelConfig.title) ||
      formatPanelTitle(panelId);
    panel.setAttribute('aria-label', titleText);

    const header = doc.createElement('div');
    header.setAttribute('class', 'panel-header');

    const title = doc.createElement('h3');
    title.setAttribute('class', 'panel-title');
    title.textContent = titleText;
    header.appendChild(title);
    panel.appendChild(header);

    const content = doc.createElement('div');
    content.setAttribute('class', 'panel-content');

    if (panelId === 'order-execution') {
      const form = doc.createElement('div');
      form.setAttribute('class', 'order-form');

      const sideButtons = doc.createElement('div');
      sideButtons.setAttribute('class', 'order-side-controls');

      const buyBtn = doc.createElement('button');
      buyBtn.setAttribute('type', 'button');
      buyBtn.setAttribute('class', 'btn-buy');
      buyBtn.setAttribute('data-side', 'buy');
      buyBtn.textContent = 'Buy / Long';

      const sellBtn = doc.createElement('button');
      sellBtn.setAttribute('type', 'button');
      sellBtn.setAttribute('class', 'btn-sell');
      sellBtn.setAttribute('data-side', 'sell');
      sellBtn.textContent = 'Sell / Short';

      sideButtons.appendChild(buyBtn);
      sideButtons.appendChild(sellBtn);
      form.appendChild(sideButtons);

      const qtyInput = doc.createElement('input');
      qtyInput.setAttribute('type', 'number');
      qtyInput.setAttribute('class', 'order-qty-input');
      qtyInput.setAttribute('placeholder', 'Quantity');
      qtyInput.setAttribute('aria-label', 'Order Quantity');
      form.appendChild(qtyInput);

      content.appendChild(form);
    } else if (panelId === 'watchlist') {
      const list = doc.createElement('ul');
      list.setAttribute('class', 'watchlist-list');
      const symbols = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
      symbols.forEach((sym) => {
        const item = doc.createElement('li');
        item.setAttribute('class', 'watchlist-item');
        item.setAttribute('data-symbol', sym);
        item.textContent = sym;
        list.appendChild(item);
      });
      content.appendChild(list);
    } else if (panelId === 'inspector') {
      const inspectorView = doc.createElement('div');
      inspectorView.setAttribute('class', 'inspector-view');

      const inspectorStatus = doc.createElement('p');
      inspectorStatus.setAttribute('class', 'inspector-status');
      inspectorStatus.textContent = 'No drawing or tool selected';
      inspectorView.appendChild(inspectorStatus);

      content.appendChild(inspectorView);
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
        this.element.classList.add('collapsed');
      } else {
        this.element.classList.remove('collapsed');
      }
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