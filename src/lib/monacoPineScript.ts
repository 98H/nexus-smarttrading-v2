/**
 * Monaco Pine Script Language Definition, Configuration, and Diagnostics Provider
 */

export const PINE_SCRIPT_LANGUAGE_ID = 'pineScript';

export interface MonacoLanguageRegistry {
  register: (language: { id: string }) => void;
  setLanguageConfiguration: (languageId: string, configuration: unknown) => void;
  setMonarchTokensProvider: (languageId: string, languageDef: unknown) => void;
}

export interface MonacoTextModel {
  uri?: { toString: () => string };
  getValue?: () => string;
  [key: string]: unknown;
}

export interface MonacoMarkerData {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: number;
}

export interface MonacoEditorNamespace {
  setModelMarkers: (model: MonacoTextModel, owner: string, markers: MonacoMarkerData[]) => void;
}

export interface PineScriptDiagnostic {
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: 'error' | 'warning' | 'info';
}

export const pineLanguageConfiguration = {
  comments: {
    lineComment: '//',
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
};

export const pineMonarchTokensProvider = {
  defaultToken: '',
  tokenPostfix: '.pine',

  keywords: [
    'indicator',
    'strategy',
    'library',
    'plot',
    'plotshape',
    'plotchar',
    'plotcandle',
    'plotbar',
    'plotarrow',
    'hline',
    'fill',
    'bgcolor',
    'barcolor',
    'alert',
    'alertcondition',
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
    'na',
    'input',
    'import',
    'export',
    'type',
    'method',
    'switch',
    'case',
    'break',
    'continue',
    'and',
    'or',
    'not',
  ],

  types: [
    'int',
    'float',
    'bool',
    'color',
    'string',
    'line',
    'label',
    'box',
    'table',
    'array',
    'matrix',
    'map',
  ],

  builtins: [
    'close',
    'open',
    'high',
    'low',
    'volume',
    'time',
    'bar_index',
    'hl2',
    'hlc3',
    'ohlc4',
    'ta.sma',
    'ta.ema',
    'ta.rsi',
    'ta.macd',
    'ta.atr',
    'ta.stoch',
    'ta.highest',
    'ta.lowest',
    'ta.crossover',
    'ta.crossunder',
    'math.abs',
    'math.max',
    'math.min',
    'math.round',
  ],

  operators: [
    '=', ':=', '+=', '-=', '*=', '/=', '%=',
    '==', '!=', '<', '<=', '>', '>=',
    '+', '-', '*', '/', '%',
    '?', ':', '=>',
  ],

  tokenizer: {
    root: [
      // Single-line comments
      [/\/\/.*$/, 'comment'],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],

      // String literals
      [/"([^"\\]|\\.)*"/, 'string'],
      [/'([^'\\]|\\.)*'/, 'string'],

      // Bracket delimiter tokens
      [/[{}()\[\]]/, '@brackets'],

      // Namespaced builtins like ta.sma, math.abs
      [/[a-zA-Z_]\w*\.[a-zA-Z_]\w*/, {
        cases: {
          '@builtins': 'predefined',
          '@default': 'identifier',
        },
      }],

      // Identifiers, keywords, types, builtins
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword',
          '@types': 'type',
          '@builtins': 'predefined',
          '@default': 'identifier',
        },
      }],

      // Operators
      [/[=><!~?:&|+\-*\/\^%]+/, {
        cases: {
          '@operators': 'operator',
          '@default': '',
        },
      }],

      // Delimiters
      [/[,;]/, 'delimiter'],
    ],
  },
};

export function registerPineScriptLanguage(monacoLanguages: MonacoLanguageRegistry): void {
  monacoLanguages.register({ id: PINE_SCRIPT_LANGUAGE_ID });
  monacoLanguages.setLanguageConfiguration(PINE_SCRIPT_LANGUAGE_ID, pineLanguageConfiguration);
  monacoLanguages.setMonarchTokensProvider(PINE_SCRIPT_LANGUAGE_ID, pineMonarchTokensProvider);
}

export function createPineScriptMarkers(diagnostics: PineScriptDiagnostic[]): MonacoMarkerData[] {
  return diagnostics.map((diagnostic) => {
    let severityValue = 8;
    switch (diagnostic.severity) {
      case 'error':
        severityValue = 8;
        break;
      case 'warning':
        severityValue = 4;
        break;
      case 'info':
        severityValue = 2;
        break;
      default:
        severityValue = 8;
        break;
    }

    return {
      startLineNumber: diagnostic.line,
      startColumn: diagnostic.column,
      endLineNumber: diagnostic.endLine ?? diagnostic.line,
      endColumn: diagnostic.endColumn ?? (diagnostic.column + 1),
      message: diagnostic.message,
      severity: severityValue,
    };
  });
}

export function applyPineScriptDiagnostics(
  editorNamespace: MonacoEditorNamespace,
  model: MonacoTextModel,
  diagnostics: PineScriptDiagnostic[]
): void {
  const markers = createPineScriptMarkers(diagnostics);
  editorNamespace.setModelMarkers(model, PINE_SCRIPT_LANGUAGE_ID, markers);
}