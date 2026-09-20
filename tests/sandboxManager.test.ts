import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SandboxManager,
  SandboxTimeoutError,
  type SandboxExecutionResult,
  type SandboxConfig,
} from '../src/services/sandboxManager.js';

describe('Story 4.2.2: Isolated Web Worker Script Sandbox', () => {
  let sandboxManager: SandboxManager;

  const defaultWorkerPath = new URL(
    '../src/workers/scriptSandbox.worker.ts',
    import.meta.url
  ).pathname;

  beforeEach(() => {
    sandboxManager = new SandboxManager({
      workerPath: defaultWorkerPath,
      timeoutMs: 2000,
    });
  });

  afterEach(async () => {
    if (sandboxManager) {
      await sandboxManager.terminate();
    }
  });

  it('should execute valid Pine Script code inside a dedicated Web Worker and return valid results', async () => {
    const validPineScript = `
      //@version=5
      indicator("Simple Moving Average", overlay=true)
      length = 14
      price = close
      smaValue = ta.sma(price, length)
      plot(smaValue, color=color.blue)
    `;

    const inputData = {
      series: {
        close: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      },
    };

    const result: SandboxExecutionResult = await sandboxManager.execute(
      validPineScript,
      inputData
    );

    assert.ok(result, 'Execution result should be defined');
    assert.strictEqual(result.success, true, 'Execution should succeed');
    assert.ok(result.data, 'Result output data should be present');
    assert.ok(
      typeof result.executionTimeMs === 'number' && result.executionTimeMs >= 0,
      'Execution duration should be tracked'
    );
    assert.strictEqual(
      result.error,
      undefined,
      'There should be no error on successful execution'
    );
  });

  it('should run Pine Script asynchronously without blocking the main thread event loop', async () => {
    // Heavy computational script designed to run for several hundred milliseconds
    const heavyPineScript = `
      //@version=5
      indicator("Heavy Loop")
      var sum = 0.0
      for i = 0 to 3000000
          sum := sum + math.sqrt(i)
      plot(sum)
    `;

    let eventLoopTicks = 0;
    const intervalTimer = setInterval(() => {
      eventLoopTicks++;
    }, 25);

    try {
      const executionPromise = sandboxManager.execute(heavyPineScript, {
        series: { close: [1, 2, 3] },
      });

      // While the worker executes, the main thread's timer must continue to fire
      const result = await executionPromise;

      assert.strictEqual(result.success, true);
      assert.ok(
        eventLoopTicks > 2,
        `Main thread event loop was blocked! Heartbeat ticks detected: ${eventLoopTicks}`
      );
    } finally {
      clearInterval(intervalTimer);
    }
  });

  it('should automatically terminate execution and throw SandboxTimeoutError when duration exceeds 2000ms', async () => {
    // Script simulating an infinite execution loop in Pine Script
    const infiniteLoopPineScript = `
      //@version=5
      indicator("Infinite Execution Loop")
      var infiniteCounter = 0
      while true
          infiniteCounter := infiniteCounter + 1
      plot(infiniteCounter)
    `;

    const startTime = Date.now();

    await assert.rejects(
      async () => {
        await sandboxManager.execute(infiniteLoopPineScript, {
          series: { close: [100] },
        });
      },
      (error: unknown) => {
        const elapsedTime = Date.now() - startTime;

        assert.ok(
          error instanceof SandboxTimeoutError ||
            (error instanceof Error && error.name === 'SandboxTimeoutError'),
          `Expected SandboxTimeoutError but received: ${String(error)}`
        );

        // Verification of acceptance criteria: 2000ms boundary with reasonable scheduler tolerance
        assert.ok(
          elapsedTime >= 2000,
          `Execution terminated prematurely before 2000ms (${elapsedTime}ms)`
        );
        assert.ok(
          elapsedTime < 3000,
          `Execution took excessively long beyond the 2000ms threshold (${elapsedTime}ms)`
        );

        assert.match(
          (error as Error).message,
          /timeout|exceeded 2000ms/i,
          'Error message must indicate execution timeout termination'
        );

        return true;
      },
      'Sandbox execution should be rejected when exceeding 2000ms timeout'
    );
  });

  it('should safely recover and allow subsequent script executions after a worker timeout occurs', async () => {
    const timeoutScript = `
      //@version=5
      indicator("Hang Worker")
      while true
          var x = 1
    `;

    const safeScript = `
      //@version=5
      indicator("Safe Execution")
      plot(close)
    `;

    // 1. Trigger worker timeout and termination
    await assert.rejects(async () => {
      await sandboxManager.execute(timeoutScript, { series: { close: [1] } });
    });

    // 2. Execute normal script afterwards to confirm manager respawn/recovery
    const recoveredResult = await sandboxManager.execute(safeScript, {
      series: { close: [42] },
    });

    assert.strictEqual(
      recoveredResult.success,
      true,
      'SandboxManager should automatically recover after terminating a timed-out worker'
    );
  });

  it('should enforce strict memory and global isolation from the main Node.js process', async () => {
    const exploitScript = `
      //@version=5
      // Attempting to mutate globals or access process object
      try {
        globalThis.compromisedKey = "malicious_payload";
        if (typeof process !== "undefined" && process.env) {
          process.env.LEAKED = "true";
        }
      } catch (e) {
        // Suppress worker-side error
      }
    `;

    await sandboxManager.execute(exploitScript, {});

    assert.strictEqual(
      (globalThis as Record<string, unknown>).compromisedKey,
      undefined,
      'Worker execution must not be able to write to host globalThis'
    );
    assert.strictEqual(
      process.env.LEAKED,
      undefined,
      'Worker execution must not modify host process environment'
    );
  });
});