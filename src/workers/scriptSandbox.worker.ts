import { parentPort } from 'node:worker_threads';

function transpilePineScript(script: string): string {
  const lines = script.split('\n');
  const outputLines: string[] = [];
  const indentStack: number[] = [];

  const reservedKeywords = new Set([
    'var', 'let', 'const', 'return', 'if', 'while', 'for',
    'function', 'class', 'import', 'export', 'case', 'default',
    'try', 'catch', 'finally', 'throw', 'switch', 'else', 'do',
  ]);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('//')) {
      outputLines.push(rawLine);
      continue;
    }

    const currentIndent = rawLine.search(/\S/);

    while (indentStack.length > 0 && currentIndent <= indentStack[indentStack.length - 1]) {
      indentStack.pop();
      outputLines.push(' '.repeat(Math.max(0, currentIndent)) + '}');
    }

    let line = rawLine;

    // Replace Pine Script reassignment := with =
    line = line.replace(/([a-zA-Z0-9_]+)\s*:=\s*/g, '$1 = ');

    // Normalize named arguments in function calls
    let prev = '';
    while (prev !== line) {
      prev = line;
      line = line.replace(/([,(]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?!=)([^,)]+)/g, '$1$3');
    }

    // For loop: for i = start to end
    const forMatch = line.match(/^(\s*)for\s+([a-zA-Z0-9_]+)\s*=\s*(.+?)\s+to\s+(.+)$/);
    if (forMatch) {
      const [, indent, varName, startVal, endVal] = forMatch;
      outputLines.push(`${indent}for (let ${varName} = ${startVal}; ${varName} <= ${endVal}; ${varName}++) {`);
      indentStack.push(currentIndent);
      continue;
    }

    // While loop: while condition
    const whileMatch = line.match(/^(\s*)while\s+(.+)$/);
    if (whileMatch) {
      const [, indent, cond] = whileMatch;
      const condition = cond.trim().startsWith('(') && cond.trim().endsWith(')')
        ? cond.trim()
        : `(${cond.trim()})`;
      outputLines.push(`${indent}while ${condition} {`);
      indentStack.push(currentIndent);
      continue;
    }

    // Variable declaration assignment: identifier = expr
    const varAssignMatch = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?!=)(.+)$/);
    if (varAssignMatch && !reservedKeywords.has(varAssignMatch[2])) {
      const [, indent, varName, expr] = varAssignMatch;
      outputLines.push(`${indent}var ${varName} = ${expr}`);
      continue;
    }

    outputLines.push(line);
  }

  while (indentStack.length > 0) {
    indentStack.pop();
    outputLines.push('}');
  }

  return outputLines.join('\n');
}

function executeScript(script: string, inputData: any) {
  const plots: any[] = [];
  let indicatorInfo: any = null;

  const indicator = (title: string, options?: any) => {
    indicatorInfo = { title, options };
  };

  const plot = (series: any, options?: any) => {
    plots.push(series);
    return series;
  };

  const math = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    max: Math.max,
    min: Math.min,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    pow: Math.pow,
    log: Math.log,
    exp: Math.exp,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    random: Math.random,
    pi: Math.PI,
    e: Math.E,
  };

  const ta = {
    sma: (source: any, length: number) => {
      if (Array.isArray(source)) {
        const result: number[] = [];
        for (let i = 0; i < source.length; i++) {
          if (i < length - 1) {
            result.push(NaN);
          } else {
            let sum = 0;
            for (let j = i - length + 1; j <= i; j++) {
              sum += source[j];
            }
            result.push(sum / length);
          }
        }
        return result;
      }
      return source;
    },
    ema: (source: any, length: number) => {
      if (Array.isArray(source)) {
        const k = 2 / (length + 1);
        const result: number[] = [];
        let prevEma = source[0] ?? 0;
        for (let i = 0; i < source.length; i++) {
          if (i === 0) {
            result.push(prevEma);
          } else {
            const currentEma = source[i] * k + prevEma * (1 - k);
            result.push(currentEma);
            prevEma = currentEma;
          }
        }
        return result;
      }
      return source;
    },
  };

  const color = {
    blue: 'blue',
    red: 'red',
    green: 'green',
    yellow: 'yellow',
    black: 'black',
    white: 'white',
    gray: 'gray',
    orange: 'orange',
    purple: 'purple',
  };

  const close = inputData?.series?.close ?? [];
  const open = inputData?.series?.open ?? [];
  const high = inputData?.series?.high ?? [];
  const low = inputData?.series?.low ?? [];
  const volume = inputData?.series?.volume ?? [];

  const transpiledCode = transpilePineScript(script);

  const fn = new Function(
    'indicator',
    'plot',
    'math',
    'ta',
    'color',
    'close',
    'open',
    'high',
    'low',
    'volume',
    'inputData',
    transpiledCode
  );

  fn(
    indicator,
    plot,
    math,
    ta,
    color,
    close,
    open,
    high,
    low,
    volume,
    inputData
  );

  return {
    plots,
    indicator: indicatorInfo,
    output: plots.length === 1 ? plots[0] : plots,
  };
}

function handleMessage(message: { id: string; script: string; inputData?: any }) {
  const { id, script, inputData } = message;
  const startTime = Date.now();

  try {
    const data = executeScript(script, inputData);
    const executionTimeMs = Date.now() - startTime;

    if (parentPort) {
      parentPort.postMessage({
        id,
        success: true,
        data,
        executionTimeMs,
      });
    } else if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
      (self as any).postMessage({
        id,
        success: true,
        data,
        executionTimeMs,
      });
    }
  } catch (err: any) {
    const executionTimeMs = Date.now() - startTime;
    const response = {
      id,
      success: false,
      error: err?.message || String(err),
      executionTimeMs,
    };
    if (parentPort) {
      parentPort.postMessage(response);
    } else if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
      (self as any).postMessage(response);
    }
  }
}

if (parentPort) {
  parentPort.on('message', handleMessage);
} else if (typeof self !== 'undefined' && typeof (self as any).addEventListener === 'function') {
  (self as any).addEventListener('message', (event: MessageEvent) => {
    handleMessage(event.data);
  });
}