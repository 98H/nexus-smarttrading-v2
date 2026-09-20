import {
  PINE_SCRIPT_LANGUAGE_ID,
  registerPineScriptLanguage,
  applyPineScriptDiagnostics,
  type PineScriptDiagnostic,
  type MonacoEditorNamespace,
  type MonacoTextModel,
  type MonacoLanguageRegistry,
} from '../lib/monacoPineScript.ts';

export interface PineEditorOptions {
  language: string;
  matchBrackets: 'always';
  bracketPairColorization: {
    enabled: boolean;
  };
  renderValidationDecorations: 'on';
  automaticLayout: boolean;
  theme: string;
  fontSize: number;
  lineNumbers: 'on';
  minimap: {
    enabled: boolean;
  };
  scrollBeyondLastLine: boolean;
  wordWrap: 'on';
  tabSize: number;
  insertSpaces: boolean;
  [key: string]: unknown;
}

export function getPineEditorDefaultOptions(): PineEditorOptions {
  return {
    language: PINE_SCRIPT_LANGUAGE_ID,
    matchBrackets: 'always',
    bracketPairColorization: {
      enabled: true,
    },
    renderValidationDecorations: 'on',
    automaticLayout: true,
    theme: 'vs-dark',
    fontSize: 14,
    lineNumbers: 'on',
    minimap: {
      enabled: false,
    },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 4,
    insertSpaces: true,
  };
}

export function validatePineScript(code: string): PineScriptDiagnostic[] {
  const diagnostics: PineScriptDiagnostic[] = [];

  // Flag missing //@version compiler directive
  if (!/\/\/\s*@version=\d+/.test(code)) {
    diagnostics.push({
      message: 'Missing //@version compiler directive (e.g. //@version=5)',
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 2,
      severity: 'error',
    });
  }

  const lines = code.split(/\r?\n/);
  interface OpenBracket {
    char: string;
    line: number;
    col: number;
    endOfLineCol: number;
  }
  const bracketStack: OpenBracket[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;
    let inString: string | null = null;
    let escaped = false;

    for (let colIndex = 0; colIndex < line.length; colIndex++) {
      const char = line[colIndex];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === inString) {
          inString = null;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = char;
        continue;
      }

      if (char === '/' && line[colIndex + 1] === '/') {
        break; // Comment spans rest of line
      }

      if (char === '(' || char === '[' || char === '{') {
        bracketStack.push({
          char,
          line: lineNumber,
          col: colIndex + 1,
          endOfLineCol: line.length + 1,
        });
      } else if (char === ')' || char === ']' || char === '}') {
        const expectedOpen = char === ')' ? '(' : char === ']' ? '[' : '{';
        if (bracketStack.length === 0) {
          diagnostics.push({
            message: `Unexpected closing bracket '${char}'`,
            line: lineNumber,
            column: colIndex + 1,
            endLine: lineNumber,
            endColumn: colIndex + 2,
            severity: 'error',
          });
        } else {
          const top = bracketStack[bracketStack.length - 1];
          if (top.char !== expectedOpen) {
            diagnostics.push({
              message: `Mismatched closing bracket '${char}', expected '${top.char === '(' ? ')' : top.char === '[' ? ']' : '}'}'`,
              line: lineNumber,
              column: colIndex + 1,
              endLine: lineNumber,
              endColumn: colIndex + 2,
              severity: 'error',
            });
            bracketStack.pop();
          } else {
            bracketStack.pop();
          }
        }
      }
    }
  }

  for (const unclosed of bracketStack) {
    const expectedClosing = unclosed.char === '(' ? ')' : unclosed.char === '[' ? ']' : '}';
    diagnostics.push({
      message: unclosed.char === '('
        ? `Unclosed parenthesis '${unclosed.char}', expected '${expectedClosing}'`
        : `Unclosed bracket '${unclosed.char}', expected '${expectedClosing}'`,
      line: unclosed.line,
      column: unclosed.endOfLineCol,
      endLine: unclosed.line,
      endColumn: unclosed.endOfLineCol + 1,
      severity: 'error',
    });
  }

  return diagnostics;
}

export interface PineEditorProps {
  container?: HTMLElement | null;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onDiagnostics?: (diagnostics: PineScriptDiagnostic[]) => void;
  options?: Partial<PineEditorOptions>;
  theme?: string;
  readOnly?: boolean;
  height?: string | number;
  width?: string | number;
  className?: string;
  [key: string]: unknown;
}

export interface PineEditorInstance {
  getValue: () => string;
  setValue: (value: string) => void;
  getDiagnostics: () => PineScriptDiagnostic[];
  dispose: () => void;
}

interface MonacoGlobal {
  languages: MonacoLanguageRegistry;
  editor: MonacoEditorNamespace & {
    create: (
      element: HTMLElement,
      options: unknown
    ) => {
      getModel: () => MonacoTextModel | null;
      getValue: () => string;
      setValue: (val: string) => void;
      onDidChangeModelContent: (listener: () => void) => { dispose: () => void };
      dispose: () => void;
    };
  };
}

export function mountPineEditor(
  container: HTMLElement,
  props: PineEditorProps = {}
): PineEditorInstance {
  const win = typeof window !== 'undefined' ? (window as unknown as { monaco?: MonacoGlobal }) : null;
  let currentValue = props.value ?? props.defaultValue ?? '//@version=5\nindicator("My Script", overlay=true)\nplot(close)\n';
  let currentDiagnostics = validatePineScript(currentValue);

  if (win?.monaco) {
    registerPineScriptLanguage(win.monaco.languages);
    const editorOptions = {
      ...getPineEditorDefaultOptions(),
      ...props.options,
      value: currentValue,
      theme: props.theme ?? 'vs-dark',
      readOnly: props.readOnly ?? false,
    };
    const editor = win.monaco.editor.create(container, editorOptions);
    const model = editor.getModel();
    if (model) {
      applyPineScriptDiagnostics(win.monaco.editor, model, currentDiagnostics);
    }
    const sub = editor.onDidChangeModelContent(() => {
      currentValue = editor.getValue();
      currentDiagnostics = validatePineScript(currentValue);
      const m = editor.getModel();
      if (m && win.monaco) {
        applyPineScriptDiagnostics(win.monaco.editor, m, currentDiagnostics);
      }
      props.onChange?.(currentValue);
      props.onDiagnostics?.(currentDiagnostics);
    });

    return {
      getValue: () => editor.getValue(),
      setValue: (val: string) => editor.setValue(val),
      getDiagnostics: () => currentDiagnostics,
      dispose: () => {
        sub.dispose();
        editor.dispose();
      },
    };
  }

  // Fallback textarea
  const textarea = document.createElement('textarea');
  textarea.value = currentValue;
  textarea.readOnly = props.readOnly ?? false;
  textarea.className = `pine-editor-fallback ${props.className || ''}`.trim();
  textarea.style.width = typeof props.width === 'number' ? `${props.width}px` : (props.width ?? '100%');
  textarea.style.height = typeof props.height === 'number' ? `${props.height}px` : (props.height ?? '100%');
  textarea.style.background = '#1e1e1e';
  textarea.style.color = '#d4d4d4';
  textarea.style.fontFamily = 'monospace';
  container.appendChild(textarea);

  const onInput = () => {
    currentValue = textarea.value;
    currentDiagnostics = validatePineScript(currentValue);
    props.onChange?.(currentValue);
    props.onDiagnostics?.(currentDiagnostics);
  };
  textarea.addEventListener('input', onInput);

  return {
    getValue: () => textarea.value,
    setValue: (val: string) => {
      textarea.value = val;
      currentValue = val;
    },
    getDiagnostics: () => currentDiagnostics,
    dispose: () => {
      textarea.removeEventListener('input', onInput);
      textarea.remove();
    },
  };
}

export function PineEditor(props: PineEditorProps = {}): unknown {
  const globalObj = typeof window !== 'undefined' ? (window as Record<string, unknown>) : (globalThis as Record<string, unknown>);
  const React = (globalObj.React ?? null) as {
    useRef?: <T>(val: T) => { current: T };
    useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void;
    useState?: <T>(init: T) => [T, (next: T) => void];
    createElement?: (type: unknown, props?: unknown, ...children: unknown[]) => unknown;
  } | null;

  if (React?.useRef && React?.useEffect && React?.useState && React?.createElement) {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const initialVal = props.value ?? props.defaultValue ?? '//@version=5\nindicator("My Script", overlay=true)\nplot(close)\n';
    const [internalValue, setInternalValue] = React.useState<string>(initialVal);
    const [, setDiagnostics] = React.useState<PineScriptDiagnostic[]>([]);

    React.useEffect(() => {
      if (props.value !== undefined && props.value !== internalValue) {
        setInternalValue(props.value);
        const diags = validatePineScript(props.value);
        setDiagnostics(diags);
        props.onDiagnostics?.(diags);
      }
    }, [props.value]);

    React.useEffect(() => {
      const win = typeof window !== 'undefined' ? (window as unknown as { monaco?: MonacoGlobal }) : null;
      if (!win?.monaco || !containerRef.current) return;

      registerPineScriptLanguage(win.monaco.languages);

      const editorOptions = {
        ...getPineEditorDefaultOptions(),
        ...props.options,
        value: internalValue,
        theme: props.theme ?? 'vs-dark',
        readOnly: props.readOnly ?? false,
      };

      const editorInstance = win.monaco.editor.create(containerRef.current, editorOptions);
      const model = editorInstance.getModel();

      if (model) {
        const initialDiags = validatePineScript(internalValue);
        applyPineScriptDiagnostics(win.monaco.editor, model, initialDiags);
      }

      const subscription = editorInstance.onDidChangeModelContent(() => {
        const code = editorInstance.getValue();
        setInternalValue(code);
        const diags = validatePineScript(code);
        setDiagnostics(diags);
        const currentModel = editorInstance.getModel();
        if (win.monaco && currentModel) {
          applyPineScriptDiagnostics(win.monaco.editor, currentModel, diags);
        }
        props.onChange?.(code);
        props.onDiagnostics?.(diags);
      });

      return () => {
        subscription.dispose();
        editorInstance.dispose();
      };
    }, []);

    return React.createElement(
      'div',
      {
        className: `pine-editor-container ${props.className || ''}`.trim(),
        style: {
          display: 'flex',
          flexDirection: 'column',
          height: props.height ?? '100%',
          width: props.width ?? '100%',
          background: '#1e1e1e',
          color: '#d4d4d4',
          position: 'relative',
        },
      },
      React.createElement('div', {
        ref: containerRef,
        style: { flex: 1, width: '100%', minHeight: 0 },
      })
    );
  }

  if (props.container) {
    return mountPineEditor(props.container, props);
  }

  return null;
}

export default PineEditor;