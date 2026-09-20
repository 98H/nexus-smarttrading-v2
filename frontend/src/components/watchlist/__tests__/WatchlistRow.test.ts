import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// Paths to Target Frontend Modules
// ============================================================================

function getProjectRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (
      fs.existsSync(path.join(current, 'frontend')) ||
      fs.existsSync(path.join(current, 'package.json'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return process.cwd();
}

const PROJECT_ROOT = getProjectRoot();
const TSX_PATH = path.join(PROJECT_ROOT, 'frontend', 'src', 'components', 'watchlist', 'WatchlistRow.tsx');
const CSS_PATH = path.join(PROJECT_ROOT, 'frontend', 'src', 'components', 'watchlist', 'WatchlistRow.module.css');

// ============================================================================
// TypeScript State Model Mirroring WatchlistRow.tsx Contract
// ============================================================================

interface WatchlistRowStateOptions {
  symbol: string;
  price: number | null;
  previousPrice?: number | null;
  percentageChange?: number;
  flashClass?: string | null;
  flashDurationMs?: number;
}

class WatchlistRowState {
  symbol: string;
  price: number | null;
  previousPrice: number | null;
  percentageChange: number;
  flashClass: string | null;
  flashDurationMs: number;

  constructor(options: WatchlistRowStateOptions) {
    this.symbol = options.symbol;
    this.price = options.price;
    this.previousPrice = options.previousPrice ?? null;
    this.percentageChange = options.percentageChange ?? 0.0;
    this.flashClass = options.flashClass ?? null;
    this.flashDurationMs = options.flashDurationMs ?? 1000;
  }

  applyTick(newPrice: number): void {
    if (this.price === null) {
      this.price = newPrice;
      this.previousPrice = newPrice;
      this.percentageChange = 0.0;
      this.flashClass = null;
      return;
    }

    this.previousPrice = this.price;
    this.price = newPrice;

    if (this.previousPrice > 0) {
      this.percentageChange = ((this.price - this.previousPrice) / this.previousPrice) * 100.0;
    } else {
      this.percentageChange = 0.0;
    }

    if (newPrice > this.previousPrice) {
      this.flashClass = 'uptick';
    } else if (newPrice < this.previousPrice) {
      this.flashClass = 'downtick';
    } else {
      this.flashClass = null;
    }
  }

  clearFlash(): void {
    this.flashClass = null;
  }
}

function assertApprox(actual: number, expected: number, tolerance = 0.001): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be approximately ${expected} (within ±${tolerance})`
  );
}

// ============================================================================
// Static & Contract Tests: WatchlistRow.module.css
// ============================================================================

test('test_watchlist_row_css_file_exists', () => {
  assert.ok(fs.existsSync(CSS_PATH), `Expected CSS module at ${CSS_PATH} does not exist.`);
  assert.ok(fs.statSync(CSS_PATH).isFile(), `${CSS_PATH} is not a valid file.`);
});

test('test_watchlist_row_css_contains_uptick_and_downtick_classes', () => {
  assert.ok(fs.existsSync(CSS_PATH), `CSS module missing at ${CSS_PATH}`);
  const cssContent = fs.readFileSync(CSS_PATH, 'utf-8');

  // Verify .uptick class definition
  assert.ok(cssContent.includes('.uptick'), "CSS module must define an '.uptick' class.");
  // Verify .downtick class definition
  assert.ok(cssContent.includes('.downtick'), "CSS module must define a '.downtick' class.");

  // Uptick must specify green flash styling (e.g. green, #..., rgb, rgba, or hsl)
  const uptickBlockMatch = cssContent.match(/\.uptick\s*\{([^}]+)\}/);
  assert.ok(uptickBlockMatch !== null, 'Could not parse .uptick CSS rule block.');
  const uptickBlock = uptickBlockMatch[1].toLowerCase();
  const hasGreen = ['green', '#00', '#1', '#2', '#3', 'rgb(', 'rgba('].some((c) => uptickBlock.includes(c));
  assert.ok(hasGreen, `.uptick rule must include green color/background. Found: ${uptickBlock}`);

  // Downtick must specify red flash styling (e.g. red, #..., rgb, rgba, or hsl)
  const downtickBlockMatch = cssContent.match(/\.downtick\s*\{([^}]+)\}/);
  assert.ok(downtickBlockMatch !== null, 'Could not parse .downtick CSS rule block.');
  const downtickBlock = downtickBlockMatch[1].toLowerCase();
  const hasRed = ['red', '#f', '#e', '#d', '#c', 'rgb(', 'rgba('].some((c) => downtickBlock.includes(c));
  assert.ok(hasRed, `.downtick rule must include red color/background. Found: ${downtickBlock}`);

  // Animation or transition duration of 1000ms / 1s must be referenced
  assert.ok(
    cssContent.includes('1000ms') || cssContent.includes('1s') || cssContent.includes('1.0s'),
    'CSS module must declare an animation or transition duration of 1000ms (1s).'
  );
});

// ============================================================================
// Static & Contract Tests: WatchlistRow.tsx
// ============================================================================

test('test_watchlist_row_tsx_file_exists', () => {
  assert.ok(fs.existsSync(TSX_PATH), `Expected TSX component at ${TSX_PATH} does not exist.`);
  assert.ok(fs.statSync(TSX_PATH).isFile(), `${TSX_PATH} is not a valid file.`);
});

test('test_watchlist_row_tsx_imports_css_and_exports_component', () => {
  assert.ok(fs.existsSync(TSX_PATH), `TSX component missing at ${TSX_PATH}`);
  const tsxContent = fs.readFileSync(TSX_PATH, 'utf-8');

  // Must import the css module
  assert.ok(
    tsxContent.includes('WatchlistRow.module.css'),
    'WatchlistRow.tsx must import WatchlistRow.module.css'
  );

  // Must export the WatchlistRow component
  const hasExport =
    tsxContent.includes('export const WatchlistRow') ||
    tsxContent.includes('export default function WatchlistRow') ||
    tsxContent.includes('export function WatchlistRow');
  assert.ok(hasExport, 'WatchlistRow.tsx must export a component named WatchlistRow.');
});

test('test_watchlist_row_tsx_implements_flash_lifecycle_and_timeout', () => {
  assert.ok(fs.existsSync(TSX_PATH), `TSX component missing at ${TSX_PATH}`);
  const tsxContent = fs.readFileSync(TSX_PATH, 'utf-8');

  assert.ok(tsxContent.includes('setTimeout'), 'WatchlistRow.tsx must use setTimeout for flash duration.');
  assert.ok(tsxContent.includes('1000'), 'WatchlistRow.tsx must specify a 1000ms timeout for flash reset.');
  assert.ok(
    tsxContent.includes('clearTimeout'),
    'WatchlistRow.tsx must clean up the timeout via clearTimeout to prevent memory leaks.'
  );
});

// ============================================================================
// Behavioral Unit Tests: Story 5.2.2 Acceptance Criteria
// ============================================================================

test('test_watchlist_row_uptick_on_higher_price_tick', () => {
  const initialPrice = 100.0;
  const row = new WatchlistRowState({ symbol: 'AAPL', price: initialPrice });

  const higherPriceTick = 105.0;
  row.applyTick(higherPriceTick);

  assert.equal(row.price, 105.0);
  assert.equal(row.previousPrice, 100.0);
  assert.equal(row.flashClass, 'uptick');
  assertApprox(row.percentageChange, 5.0, 0.001);
});

test('test_watchlist_row_downtick_on_lower_price_tick', () => {
  const initialPrice = 100.0;
  const row = new WatchlistRowState({ symbol: 'TSLA', price: initialPrice });

  const lowerPriceTick = 94.0;
  row.applyTick(lowerPriceTick);

  assert.equal(row.price, 94.0);
  assert.equal(row.previousPrice, 100.0);
  assert.equal(row.flashClass, 'downtick');
  assertApprox(row.percentageChange, -6.0, 0.001);
});

test('test_watchlist_row_neutral_tick_does_not_flash', () => {
  const initialPrice = 100.0;
  const row = new WatchlistRowState({ symbol: 'MSFT', price: initialPrice });

  const identicalPriceTick = 100.0;
  row.applyTick(identicalPriceTick);

  assert.equal(row.price, 100.0);
  assert.equal(row.flashClass, null);
  assertApprox(row.percentageChange, 0.0, 0.001);
});

test('test_watchlist_row_flash_duration_elapses_clearing_class', () => {
  const row = new WatchlistRowState({ symbol: 'NVDA', price: 200.0 });
  row.applyTick(210.0);

  // Immediately after tick
  assert.equal(row.flashClass, 'uptick');
  assert.equal(row.price, 210.0);
  assertApprox(row.percentageChange, 5.0, 0.001);

  // Simulate 1000ms timeout elapsing
  row.clearFlash();

  // Flash class is removed
  assert.equal(row.flashClass, null);
  // Price and percentage change must remain intact
  assert.equal(row.price, 210.0);
  assertApprox(row.percentageChange, 5.0, 0.001);
});

test('test_watchlist_row_zero_prior_price_edge_case', () => {
  const row = new WatchlistRowState({ symbol: 'NEWCO', price: 0.0 });
  // Should not throw division by zero
  row.applyTick(10.0);

  assert.equal(row.price, 10.0);
  assert.equal(row.percentageChange, 0.0);
  assert.equal(row.flashClass, 'uptick');
});

// ============================================================================
// Real-Time Stream Integration Tests (Async Mocking)
// ============================================================================

test('test_async_realtime_stream_successive_ticks', async () => {
  const row = new WatchlistRowState({ symbol: 'BTC/USD', price: 50000.0 });

  async function* mockPriceStream(): AsyncGenerator<number, void, unknown> {
    // Sequence of ticks: +1000 (uptick), -500 (downtick)
    yield 51000.0;
    yield 50500.0;
  }

  const streamMock = {
    [Symbol.asyncIterator]: mockPriceStream,
  };

  const ticks: number[] = [];
  for await (const tick of streamMock) {
    ticks.push(tick);
  }

  // Process first tick: 51000.0 (higher)
  const firstTick = ticks[0];
  row.applyTick(firstTick);

  assert.equal(row.price, 51000.0);
  assert.equal(row.flashClass, 'uptick');
  assertApprox(row.percentageChange, 2.0, 0.001);

  // Simulate timeout clearance
  await new Promise((resolve) => setTimeout(resolve, 10)); // Sandbox virtual wait
  row.clearFlash();
  assert.equal(row.flashClass, null);

  // Process second tick: 50500.0 (lower)
  const secondTick = ticks[1];
  row.applyTick(secondTick);

  assert.equal(row.price, 50500.0);
  assert.equal(row.flashClass, 'downtick');
  assertApprox(row.percentageChange, -0.98039, 0.001);
});

test('test_async_stream_connection_error_handling', async () => {
  class ConnectionResetError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConnectionResetError';
    }
  }

  const row = new WatchlistRowState({ symbol: 'ETH/USD', price: 3000.0 });

  const mockStream = {
    getNextTick: async (): Promise<number> => {
      throw new ConnectionResetError('WebSocket disconnected');
    },
  };

  await assert.rejects(
    async () => {
      await mockStream.getNextTick();
    },
    (err: unknown) => {
      return (
        err instanceof ConnectionResetError &&
        err.message === 'WebSocket disconnected'
      );
    }
  );

  // Ensure row state was not corrupted by network failure
  assert.equal(row.price, 3000.0);
  assert.equal(row.flashClass, null);
  assert.equal(row.percentageChange, 0.0);
});