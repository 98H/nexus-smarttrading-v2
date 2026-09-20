import { Worker as NodeWorker } from 'node:worker_threads';
import crypto from 'node:crypto';

export interface SandboxConfig {
  workerPath?: string;
  timeoutMs?: number;
}

export interface SandboxExecutionResult {
  success: boolean;
  data?: any;
  executionTimeMs: number;
  error?: string;
}

export class SandboxTimeoutError extends Error {
  constructor(message: string = 'Script execution exceeded 2000ms timeout') {
    super(message);
    this.name = 'SandboxTimeoutError';
    Object.setPrototypeOf(this, SandboxTimeoutError.prototype);
  }
}

interface PendingExecution {
  resolve: (res: SandboxExecutionResult) => void;
  reject: (err: any) => void;
  timeoutId: NodeJS.Timeout;
  startTime: number;
}

function getWorkerExecArgv(): string[] {
  const allowedExactOrEqual = [
    '--import',
    '--loader',
    '--experimental-loader',
    '--require',
    '-r',
    '--enable-source-maps',
    '--no-warnings',
    '--trace-warnings',
    '--conditions',
    '-C',
    '--es-module-specifier-resolution',
  ];

  const optionsWithArg = new Set([
    '--import',
    '--loader',
    '--experimental-loader',
    '--require',
    '-r',
    '--conditions',
    '-C',
    '--es-module-specifier-resolution',
  ]);

  const filtered: string[] = [];
  const execArgv = process.execArgv;

  for (let i = 0; i < execArgv.length; i++) {
    const arg = execArgv[i];

    const isMatch =
      arg.startsWith('--experimental-') ||
      allowedExactOrEqual.some(
        (prefix) => arg === prefix || arg.startsWith(`${prefix}=`)
      );

    if (isMatch) {
      filtered.push(arg);
      if (
        optionsWithArg.has(arg) &&
        i + 1 < execArgv.length &&
        !execArgv[i + 1].startsWith('-')
      ) {
        filtered.push(execArgv[++i]);
      }
    }
  }

  return filtered;
}

export class SandboxManager {
  private workerPath: string;
  private timeoutMs: number;
  private worker: NodeWorker | null = null;
  private pendingExecutions = new Map<string, PendingExecution>();

  constructor(config?: SandboxConfig) {
    this.workerPath = config?.workerPath ?? '';
    this.timeoutMs = config?.timeoutMs ?? 2000;
  }

  private getResolvedWorkerPath(): string {
    let resolvedPath = this.workerPath;
    if (!resolvedPath) {
      resolvedPath = new URL('../workers/scriptSandbox.worker.js', import.meta.url).pathname;
    }
    if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(resolvedPath)) {
      resolvedPath = resolvedPath.slice(1);
    }
    return resolvedPath;
  }

  private async getWorker(): Promise<NodeWorker> {
    if (!this.worker) {
      const resolvedPath = this.getResolvedWorkerPath();
      this.worker = new NodeWorker(resolvedPath, {
        execArgv: getWorkerExecArgv(),
      });

      this.worker.on('message', (message: any) => {
        const pending = this.pendingExecutions.get(message.id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingExecutions.delete(message.id);

          if (message.success) {
            pending.resolve({
              success: true,
              data: message.data,
              executionTimeMs: message.executionTimeMs ?? (Date.now() - pending.startTime),
            });
          } else {
            pending.resolve({
              success: false,
              error: message.error,
              executionTimeMs: message.executionTimeMs ?? (Date.now() - pending.startTime),
            });
          }
        }
      });

      this.worker.on('error', (err: any) => {
        const pendingList = Array.from(this.pendingExecutions.values());
        this.pendingExecutions.clear();
        this.worker = null;
        for (const pending of pendingList) {
          clearTimeout(pending.timeoutId);
          pending.reject(err);
        }
      });

      this.worker.on('exit', (code: number) => {
        this.worker = null;
        const pendingList = Array.from(this.pendingExecutions.values());
        this.pendingExecutions.clear();
        for (const pending of pendingList) {
          clearTimeout(pending.timeoutId);
          if (code !== 0) {
            pending.reject(new Error(`Worker stopped with exit code ${code}`));
          }
        }
      });
    }

    return this.worker;
  }

  async execute(script: string, inputData?: any): Promise<SandboxExecutionResult> {
    const worker = await this.getWorker();
    const id = crypto.randomUUID();
    const startTime = Date.now();

    return new Promise<SandboxExecutionResult>((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        const elapsed = Date.now() - startTime;
        if (elapsed < this.timeoutMs) {
          await new Promise((r) => setTimeout(r, this.timeoutMs - elapsed + 1));
        }

        const pending = this.pendingExecutions.get(id);
        if (!pending) return;

        this.pendingExecutions.delete(id);

        const currentWorker = this.worker;
        this.worker = null;

        if (currentWorker) {
          try {
            await currentWorker.terminate();
          } catch {
            // Suppress termination error
          }
        }

        pending.reject(
          new SandboxTimeoutError(`Script execution exceeded ${this.timeoutMs}ms timeout`)
        );
      }, this.timeoutMs);

      this.pendingExecutions.set(id, {
        resolve,
        reject,
        timeoutId,
        startTime,
      });

      try {
        worker.postMessage({
          id,
          script,
          inputData: inputData ?? {},
        });
      } catch (err) {
        clearTimeout(timeoutId);
        this.pendingExecutions.delete(id);
        reject(err);
      }
    });
  }

  async terminate(): Promise<void> {
    const pendingList = Array.from(this.pendingExecutions.values());
    this.pendingExecutions.clear();
    for (const pending of pendingList) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Sandbox terminated'));
    }

    if (this.worker) {
      const worker = this.worker;
      this.worker = null;
      try {
        await worker.terminate();
      } catch {
        // Suppress termination error
      }
    }
  }
}