import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  PINE_SCRIPT_LANGUAGE_ID,
  pineLanguageConfiguration,
  pineMonarchTokensProvider,
  registerPineScriptLanguage,
  createPineScriptMarkers,
  applyPineScriptDiagnostics,
  type PineScriptDiagnostic,
  type MonacoMarkerData,
  type MonacoLanguageRegistry,
  type MonacoEditorNamespace,
  type MonacoTextModel,
} from '../src/lib/monacoPineScript.ts';

import {
  getPineEditorDefaultOptions,
  validatePineScript,
} from '../src/components/PineEditor.tsx';

// ============================================================================
// Test Suite: Story 4.3.1 - Monaco Code Editor with Pine Script Syntax & Diagnostics
// ============================================================================

describe('Story 4.3.1: Monaco Code Editor with Pine Script Syntax & Diagnostics', () => {

  describe('AC1: Pine Script Syntax Highlighting and Bracket Matching', () => {
    let mockLanguages: MonacoLanguageRegistry;
    let mockRegisteredLanguages: Array<{ id: string }>;
    let mockLanguageConfigs: Map<string, unknown>;
    let mockTokenProviders: Map<string, unknown>;

    beforeEach(() => {
      mockRegisteredLanguages = [];
      mockLanguageConfigs = new Map();
      mockTokenProviders = new Map();

      mockLanguages = {
        register: (language: { id: string }) => {
          mockRegisteredLanguages.push(language);
        },
        setLanguageConfiguration: (languageId: string, configuration: unknown) => {
          mockLanguageConfigs.set(languageId, configuration);
        },
        setMonarchTokensProvider: (languageId: string, languageDef: unknown) => {
          mockTokenProviders.set(languageId, languageDef);
        },
      };
    });

    it('should register custom Pine Script language with expected language ID', () => {
      assert.equal(
        PINE_SCRIPT_LANGUAGE_ID,
        'pineScript',
        'Pine Script language ID constant must be "pineScript"'
      );

      registerPineScriptLanguage(mockLanguages);

      const registered = mockRegisteredLanguages.find(
        (lang) => lang.id === PINE_SCRIPT_LANGUAGE_ID
      );
      assert.ok(registered, 'Pine Script language ID must be registered with Monaco');
      assert.equal(registered.id, 'pineScript');
    });

    it('should configure bracket matching, auto-closing pairs, and surrounding pairs', () => {
      registerPineScriptLanguage(mockLanguages);

      const config = mockLanguageConfigs.get(PINE_SCRIPT_LANGUAGE_ID) as typeof pineLanguageConfiguration;
      assert.ok(config, 'Language configuration must be registered for Pine Script');

      // Verify bracket pairs
      const expectedBrackets = [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ];
      assert.deepEqual(
        config.brackets,
        expectedBrackets,
        'Brackets must support {}, [], and () matching'
      );

      // Verify auto-closing pairs
      const autoClosePairs = config.autoClosingPairs?.map((pair) => [pair.open, pair.close]);
      assert.ok(autoClosePairs, 'Auto-closing pairs must be defined');
      assert.ok(
        autoClosePairs.some(([open, close]) => open === '(' && close === ')'),
        'Must auto-close parentheses'
      );
      assert.ok(
        autoClosePairs.some(([open, close]) => open === '[' && close === ']'),
        'Must auto-close square brackets'
      );
      assert.ok(
        autoClosePairs.some(([open, close]) => open === '{' && close === '}'),
        'Must auto-close curly braces'
      );
      assert.ok(
        autoClosePairs.some(([open, close]) => open === '"' && close === '"'),
        'Must auto-close double quotes'
      );
      assert.ok(
        autoClosePairs.some(([open, close]) => open === "'" && close === "'"),
        'Must auto-close single quotes'
      );

      // Verify surrounding pairs
      const surroundingPairs = config.surroundingPairs?.map((pair) => [pair.open, pair.close]);
      assert.ok(surroundingPairs, 'Surrounding pairs must be defined');
      assert.ok(
        surroundingPairs.some(([open, close]) => open === '(' && close === ')'),
        'Must support surrounding selection with parentheses'
      );
      assert.ok(
        surroundingPairs.some(([open, close]) => open === '[' && close === ']'),
        'Must support surrounding selection with square brackets'
      );
      assert.ok(
        surroundingPairs.some(([open, close]) => open === '{' && close === '}'),
        'Must support surrounding selection with curly braces'
      );
    });

    it('should define Monarch syntax highlighting tokens for Pine Script keywords and built-ins', () => {
      registerPineScriptLanguage(mockLanguages);

      const tokenizerDef = mockTokenProviders.get(PINE_SCRIPT_LANGUAGE_ID) as typeof pineMonarchTokensProvider;
      assert.ok(tokenizerDef, 'Monarch tokens provider must be registered');

      const keywords = tokenizerDef.keywords;
      assert.ok(Array.isArray(keywords), 'Keywords list must be defined');
      const expectedKeywords = [
        'indicator',
        'strategy',
        'library',
        'plot',
        'var',
        'varip',
        'if',
        'else',
        'for',
        'to',
        'by',
        'while',
        'return',
        'true',
        'false',
      ];
      for (const kw of expectedKeywords) {
        assert.ok(
          keywords.includes(kw),
          `Keywords must include Pine Script construct: "${kw}"`
        );
      }

      const types = tokenizerDef.types;
      assert.ok(Array.isArray(types), 'Types list must be defined');
      const expectedTypes = [
        'int',
        'float',
        'bool',
        'color',
        'string',
        'line',
        'label',
        'box',
        'table',
      ];
      for (const t of expectedTypes) {
        assert.ok(types.includes(t), `Types must include Pine Script type: "${t}"`);
      }

      const builtins = tokenizerDef.builtins;
      assert.ok(Array.isArray(builtins), 'Built-ins list must be defined');
      const expectedBuiltins = [
        'close',
        'open',
        'high',
        'low',
        'volume',
        'time',
        'bar_index',
        'ta.sma',
        'ta.ema',
        'ta.rsi',
        'ta.macd',
      ];
      for (const b of expectedBuiltins) {
        assert.ok(builtins.includes(b), `Built-ins must include: "${b}"`);
      }
    });

    it('should configure root tokenizer rules for comments, strings, and bracket delimiters', () => {
      const tokenizer = pineMonarchTokensProvider.tokenizer;
      assert.ok(tokenizer.root, 'Monarch tokenizer root state must exist');

      // Rule for single-line comments: //
      const commentRule = tokenizer.root.find((rule) => {
        if (Array.isArray(rule) && rule[0] instanceof RegExp) {
          return rule[0].test('// this is a pine comment') && rule[1] === 'comment';
        }
        return false;
      });
      assert.ok(commentRule, 'Must define token rule identifying "// ..." as comment');

      // Rule for string literals (double and single quotes)
      const doubleQuoteRule = tokenizer.root.find((rule) => {
        if (Array.isArray(rule) && rule[0] instanceof RegExp) {
          return rule[0].test('"pine string"') && rule[1] === 'string';
        }
        return false;
      });
      assert.ok(doubleQuoteRule, 'Must define token rule identifying double-quoted strings');

      // Rule for bracket delimiter tokens
      const bracketRule = tokenizer.root.find((rule) => {
        if (Array.isArray(rule) && rule[0] instanceof RegExp) {
          return (
            rule[0].test('(') &&
            rule[0].test(')') &&
            rule[0].test('[') &&
            rule[0].test(']') &&
            rule[0].test('{') &&
            rule[0].test('}') &&
            rule[1] === '@brackets'
          );
        }
        return false;
      });
      assert.ok(bracketRule, 'Must define token rule matching bracket characters as @brackets');
    });

    it('should provide default editor options with bracket matching and colorization enabled', () => {
      const options = getPineEditorDefaultOptions();

      assert.equal(options.language, PINE_SCRIPT_LANGUAGE_ID);
      assert.equal(options.matchBrackets, 'always', 'Editor must always match brackets');
      assert.deepEqual(
        options.bracketPairColorization,
        { enabled: true },
        'Bracket pair colorization must be explicitly enabled'
      );
      assert.equal(
        options.renderValidationDecorations,
        'on',
        'Validation squiggles decoration must be turned on'
      );
    });
  });

  describe('AC2: Diagnostics & Inline Error Squiggles', () => {
    let mockEditorNamespace: MonacoEditorNamespace;
    let mockModel: MonacoTextModel;
    let capturedMarkers: {
      model: MonacoTextModel;
      owner: string;
      markers: MonacoMarkerData[];
    } | null;

    beforeEach(() => {
      capturedMarkers = null;
      mockModel = {
        uri: { toString: () => 'inmemory://model/1' },
        getValue: () => '//@version=5\nindicator("Test")\nplot(close)',
      };
      mockEditorNamespace = {
        setModelMarkers: (model: MonacoTextModel, owner: string, markers: MonacoMarkerData[]) => {
          capturedMarkers = { model, owner, markers };
        },
      };
    });

    it('should transform Pine Script diagnostics into Monaco marker format with exact line and column coordinates', () => {
      const diagnostics: PineScriptDiagnostic[] = [
        {
          message: "Undeclared identifier 'ta.invalid_func'",
          line: 3,
          column: 6,
          endLine: 3,
          endColumn: 20,
          severity: 'error',
        },
      ];

      const markers = createPineScriptMarkers(diagnostics);

      assert.equal(markers.length, 1);
      const [marker] = markers;
      assert.equal(marker.startLineNumber, 3, 'startLineNumber must match diagnostic line');
      assert.equal(marker.startColumn, 6, 'startColumn must match diagnostic column');
      assert.equal(marker.endLineNumber, 3, 'endLineNumber must match diagnostic endLine');
      assert.equal(marker.endColumn, 20, 'endColumn must match diagnostic endColumn');
      assert.equal(marker.message, "Undeclared identifier 'ta.invalid_func'");
      assert.equal(marker.severity, 8, 'Monaco MarkerSeverity.Error numeric value is 8');
    });

    it('should map diagnostic severities accurately (error = 8, warning = 4, info = 2)', () => {
      const diagnostics: PineScriptDiagnostic[] = [
        {
          message: 'Syntax error: unexpected token',
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 5,
          severity: 'error',
        },
        {
          message: 'Deprecated function used: study()',
          line: 2,
          column: 1,
          endLine: 2,
          endColumn: 8,
          severity: 'warning',
        },
        {
          message: 'Unused variable "myVar"',
          line: 3,
          column: 5,
          endLine: 3,
          endColumn: 10,
          severity: 'info',
        },
      ];

      const markers = createPineScriptMarkers(diagnostics);

      assert.equal(markers.length, 3);
      assert.equal(markers[0].severity, 8, 'Error severity must map to Monaco MarkerSeverity.Error (8)');
      assert.equal(markers[1].severity, 4, 'Warning severity must map to Monaco MarkerSeverity.Warning (4)');
      assert.equal(markers[2].severity, 2, 'Info severity must map to Monaco MarkerSeverity.Info (2)');
    });

    it('should default endLine to startLine and endColumn to startColumn + 1 when omitted', () => {
      const diagnostics: PineScriptDiagnostic[] = [
        {
          message: 'Mismatched closing bracket ")"',
          line: 5,
          column: 12,
          severity: 'error',
        },
      ];

      const markers = createPineScriptMarkers(diagnostics);

      assert.equal(markers.length, 1);
      assert.equal(markers[0].startLineNumber, 5);
      assert.equal(markers[0].startColumn, 12);
      assert.equal(markers[0].endLineNumber, 5, 'endLineNumber must default to startLineNumber');
      assert.equal(markers[0].endColumn, 13, 'endColumn must default to startColumn + 1');
    });

    it('should apply markers to Monaco editor model using setModelMarkers with "pineScript" owner', () => {
      const diagnostics: PineScriptDiagnostic[] = [
        {
          message: 'Cannot call plot inside local scope',
          line: 7,
          column: 4,
          endLine: 7,
          endColumn: 15,
          severity: 'error',
        },
      ];

      applyPineScriptDiagnostics(mockEditorNamespace, mockModel, diagnostics);

      assert.ok(capturedMarkers, 'setModelMarkers must be invoked');
      assert.equal(capturedMarkers.owner, PINE_SCRIPT_LANGUAGE_ID);
      assert.equal(capturedMarkers.model, mockModel);
      assert.equal(capturedMarkers.markers.length, 1);
      assert.equal(capturedMarkers.markers[0].message, 'Cannot call plot inside local scope');
      assert.equal(capturedMarkers.markers[0].startLineNumber, 7);
      assert.equal(capturedMarkers.markers[0].startColumn, 4);
    });

    it('should clear markers when empty diagnostics array is provided', () => {
      applyPineScriptDiagnostics(mockEditorNamespace, mockModel, []);

      assert.ok(capturedMarkers, 'setModelMarkers must be invoked to clear squiggles');
      assert.equal(capturedMarkers.owner, PINE_SCRIPT_LANGUAGE_ID);
      assert.deepEqual(capturedMarkers.markers, [], 'Markers list must be empty');
    });

    it('should validate Pine Script code and generate diagnostic squiggles for unclosed brackets', () => {
      const invalidCode = `//@version=5
indicator("Broken Script"
plot(close)
`;

      const diagnostics = validatePineScript(invalidCode);

      assert.ok(diagnostics.length > 0, 'Validation must produce diagnostics for unclosed bracket');
      const unclosedBracketError = diagnostics.find(
        (d) => d.message.toLowerCase().includes('bracket') || d.message.toLowerCase().includes('parenthesis')
      );
      assert.ok(unclosedBracketError, 'Must detect unclosed "(" parenthesis');
      assert.equal(unclosedBracketError.line, 2, 'Error must target line 2 where parenthesis was opened');
      assert.equal(unclosedBracketError.column, 26, 'Error column must point to missing closing delimiter');
      assert.equal(unclosedBracketError.severity, 'error');
    });

    it('should validate Pine Script code and produce zero diagnostics for valid code', () => {
      const validCode = `//@version=5
indicator("Clean Script", overlay=true)
smaVal = ta.sma(close, 14)
plot(smaVal, color=color.blue)
`;

      const diagnostics = validatePineScript(validCode);
      assert.deepEqual(diagnostics, [], 'Valid Pine Script code must produce 0 diagnostic errors');
    });

    it('should flag missing //@version compiler directive as an error diagnostic at line 1, column 1', () => {
      const scriptWithoutVersion = `indicator("No Version")
plot(close)
`;

      const diagnostics = validatePineScript(scriptWithoutVersion);

      const versionError = diagnostics.find((d) =>
        d.message.toLowerCase().includes('@version')
      );
      assert.ok(versionError, 'Must report missing //@version directive');
      assert.equal(versionError.line, 1);
      assert.equal(versionError.column, 1);
      assert.equal(versionError.severity, 'error');
    });
  });
});