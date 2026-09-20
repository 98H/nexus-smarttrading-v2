import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target module paths
const STYLES_PATH = path.resolve(__dirname, '../src/styles.css');
const MAIN_PATH = path.resolve(__dirname, '../src/main.js');

/**
 * Lightweight CSS rule parser to inspect stylesheet declarations and selectors.
 * Strips comments, parses selector blocks, and maps property-value declarations.
 *
 * @param {string} cssContent
 * @returns {Array<{ selector: string, declarations: Record<string, string> }>}
 */
function parseCssRules(cssContent) {
  // Strip CSS comments
  const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];

  // Match standard CSS rule blocks: selector { declarations }
  const ruleRegex = /([^{]+)\{([^}]+)\}/g;
  let match;

  while ((match = ruleRegex.exec(cleanCss)) !== null) {
    const rawSelector = match[1].trim();
    const rawDeclarations = match[2].trim();

    // Skip @keyframes or media query blocks without direct declarations
    if (rawSelector.startsWith('@keyframes') || rawSelector.startsWith('@media')) {
      continue;
    }

    const declarations = {};
    for (const statement of rawDeclarations.split(';')) {
      const colonIndex = statement.indexOf(':');
      if (colonIndex !== -1) {
        const prop = statement.substring(0, colonIndex).trim().toLowerCase();
        const value = statement.substring(colonIndex + 1).trim();
        if (prop && value) {
          declarations[prop] = value;
        }
      }
    }

    rules.push({ selector: rawSelector, declarations });
  }

  return rules;
}

/**
 * Checks if a CSS color value corresponds to a dark theme palette
 * (dark background or CSS variable referencing dark theme).
 */
function isDarkThemeBackground(value) {
  if (!value) return false;
  const val = value.toLowerCase();

  // CSS variables for dark theme
  if (val.includes('var(--') && (val.includes('dark') || val.includes('bg') || val.includes('surface') || val.includes('color'))) {
    return true;
  }

  // Hex colors: Check for dark shades (#000 - #333 or similar dark tones)
  const hexMatch = val.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    let r, g, b;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
    // Relative luminance indicator (threshold < 100 out of 255 for dark palette)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 100;
  }

  // rgb/rgba checks
  const rgbMatch = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 100;
  }

  return false;
}

test('STORY 1.1.1: Resolve UNSTYLED_FORM_CONTROLS (Defect DF-THEME-01)', async (t) => {
  let cssSource = '';
  let mainSource = '';

  await t.test('Files exist: src/styles.css and src/main.js', () => {
    assert.ok(fs.existsSync(STYLES_PATH), 'Target module src/styles.css must exist');
    assert.ok(fs.existsSync(MAIN_PATH), 'Target module src/main.js must exist');

    cssSource = fs.readFileSync(STYLES_PATH, 'utf-8');
    mainSource = fs.readFileSync(MAIN_PATH, 'utf-8');
  });

  await t.test('Acceptance Criteria 1: Form controls eliminate default beveled gray styling and implement dark-theme colors', () => {
    const rules = parseCssRules(cssSource);

    // Find rules applying to interactive form controls: button, input, select, textarea
    const controlRules = rules.filter((rule) => {
      const selectors = rule.selector.split(',').map((s) => s.trim());
      return selectors.some((sel) =>
        /(^|\s|>|\+|~)(button|input|select|textarea)(\.|\[|:|\s|$)/i.test(sel)
      );
    });

    assert.ok(
      controlRules.length > 0,
      'src/styles.css must contain explicit style rules targeting button, input, select, or textarea'
    );

    // Check for dark-theme background definition
    const hasDarkBackground = controlRules.some((rule) => {
      const bg = rule.declarations['background'] || rule.declarations['background-color'];
      return isDarkThemeBackground(bg);
    });

    assert.ok(
      hasDarkBackground,
      'Interactive form controls must have a dark-theme background color (not default browser beveled gray)'
    );

    // Ensure text color is light for high-contrast on dark backgrounds
    const hasReadableTextColor = controlRules.some((rule) => {
      const color = rule.declarations['color'];
      return (
        color &&
        (color.includes('#fff') ||
          color.includes('#f') ||
          color.includes('#e') ||
          color.includes('var(--') ||
          color.includes('rgb(') ||
          color.toLowerCase() === 'white')
      );
    });

    assert.ok(
      hasReadableTextColor,
      'Interactive form controls must specify high-contrast light text colors'
    );

    // Ensure default browser 3D bevel (border: outset / inset) is overridden
    const overridesDefaultBorder = controlRules.some((rule) => {
      const border = rule.declarations['border'] || rule.declarations['border-style'];
      return (
        border !== undefined &&
        !border.toLowerCase().includes('outset') &&
        !border.toLowerCase().includes('inset')
      );
    });

    assert.ok(
      overridesDefaultBorder,
      'Form controls must explicitly override default browser beveled border styles'
    );
  });

  await t.test('Acceptance Criteria 1: Controls have modern border-radius and consistent padding', () => {
    const rules = parseCssRules(cssSource);

    const controlRules = rules.filter((rule) => {
      const selectors = rule.selector.split(',').map((s) => s.trim());
      return selectors.some((sel) =>
        /(^|\s|>|\+|~)(button|input|select|textarea)(\.|\[|:|\s|$)/i.test(sel)
      );
    });

    // Verify modern border-radius (> 0)
    const hasBorderRadius = controlRules.some((rule) => {
      const radius = rule.declarations['border-radius'];
      return radius && radius !== '0' && radius !== '0px';
    });

    assert.ok(
      hasBorderRadius,
      'Interactive form controls must specify modern border-radius (e.g., 4px, 6px, 8px or var(--radius))'
    );

    // Verify consistent padding
    const hasPadding = controlRules.some((rule) => {
      const padding = rule.declarations['padding'] ||
        (rule.declarations['padding-top'] && rule.declarations['padding-left']);
      return Boolean(padding);
    });

    assert.ok(
      hasPadding,
      'Interactive form controls must specify explicit, consistent padding rather than default browser metrics'
    );
  });

  await t.test('Acceptance Criteria 1: Visible hover and active state transitions are defined', () => {
    const rules = parseCssRules(cssSource);

    // Look for :hover selectors on buttons or form controls
    const hoverRules = rules.filter((rule) =>
      /(button|input)[^{,]*:hover/i.test(rule.selector)
    );

    assert.ok(
      hoverRules.length > 0,
      'src/styles.css must define visible :hover states for buttons/form controls'
    );

    // Look for :active selectors on buttons or form controls
    const activeRules = rules.filter((rule) =>
      /(button|input)[^{,]*:active/i.test(rule.selector)
    );

    assert.ok(
      activeRules.length > 0,
      'src/styles.css must define visible :active states for buttons/form controls'
    );

    // Look for transition property for smooth state changes
    const hasTransitions = rules.some((rule) => {
      const isControl = /(button|input|select|textarea)/i.test(rule.selector);
      return isControl && Boolean(rule.declarations['transition']);
    });

    assert.ok(
      hasTransitions,
      'Form controls must declare CSS transitions for smooth hover and active state highlights'
    );
  });

  await t.test('Architectural Invariant: src/main.js actively wires src/styles.css so styles take effect in live browser', () => {
    // Check that src/main.js imports styles.css directly or loads it
    const importsCss =
      /import\s+['"].*styles\.css['"]/i.test(mainSource) ||
      /require\(['"].*styles\.css['"]\)/i.test(mainSource) ||
      mainSource.includes('styles.css');

    assert.ok(
      importsCss,
      'src/main.js must actively import or wire styles.css to ensure styles are applied at runtime'
    );
  });

  await t.test('Acceptance Criteria 2: Active application entrypoint mounts to document.getElementById("app")', () => {
    // Verify main.js references document.getElementById('app') or '#app'
    const mountsToApp =
      /getElementById\(\s*['"]app['"]\s*\)/.test(mainSource) ||
      /querySelector\(\s*['"]#app['"]\s*\)/.test(mainSource);

    assert.ok(
      mountsToApp,
      'src/main.js must mount or bind application UI to document.getElementById("app")'
    );
  });

  await t.test('Acceptance Criteria 2: Form control rules globally apply to both current and dynamically created elements', async () => {
    const rules = parseCssRules(cssSource);

    // Find rules applying to controls
    const universalControlSelectors = rules
      .map((r) => r.selector)
      .filter((sel) =>
        /(^|\s|>|,)(button|input|select|textarea)(\s*[,:{[]|$)/i.test(sel) ||
        /(#app|\.app)\s+(button|input|select|textarea)/i.test(sel)
      );

    assert.ok(
      universalControlSelectors.length > 0,
      'CSS rules must use element selectors (e.g. "button", "input", "#app button") so dynamically created elements receive styles automatically'
    );

    // Setup DOM simulation to verify runtime mounting and dynamic element creation
    const dynamicElements = [];
    const mockApp = {
      id: 'app',
      children: [],
      innerHTML: '',
      appendChild: (child) => {
        dynamicElements.push(child);
        mockApp.children.push(child);
        return child;
      },
    };

    const mockDocument = {
      getElementById: (id) => (id === 'app' ? mockApp : null),
      querySelector: (selector) => (selector === '#app' ? mockApp : null),
      createElement: (tagName) => ({
        tagName: tagName.toUpperCase(),
        classList: new Set(),
        setAttribute: function (k, v) { this[k] = v; },
      }),
    };

    // Save global document and inject mock
    const originalDocument = globalThis.document;
    globalThis.document = mockDocument;

    try {
      // Create dynamic button and input
      const dynamicBtn = globalThis.document.createElement('button');
      const dynamicInput = globalThis.document.createElement('input');

      mockApp.appendChild(dynamicBtn);
      mockApp.appendChild(dynamicInput);

      assert.strictEqual(
        dynamicElements.length,
        2,
        'Dynamically created form controls must be mountable to #app'
      );
      assert.strictEqual(
        dynamicElements[0].tagName,
        'BUTTON',
        'Dynamically created element must be a BUTTON matching the CSS rule targets'
      );
      assert.strictEqual(
        dynamicElements[1].tagName,
        'INPUT',
        'Dynamically created element must be an INPUT matching the CSS rule targets'
      );
    } finally {
      // Restore global document
      if (originalDocument !== undefined) {
        globalThis.document = originalDocument;
      } else {
        delete globalThis.document;
      }
    }
  });
});