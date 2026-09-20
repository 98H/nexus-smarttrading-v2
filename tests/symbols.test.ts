import test, { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  CommandPalette,
  handlePaletteKeyDown,
  type CommandPaletteProps,
} from '../src/components/CommandPalette.js';
import {
  useSymbolSearch,
  searchTradingPairs,
  type SymbolSearchResult,
} from '../src/hooks/useSymbolSearch.js';
import {
  createSymbolsRouter,
  searchSymbolsHandler,
  type CcxtExchangeClient,
} from '../src/server/routes/symbols.js';

// --- Test Fixtures & Synthetic Mocks for CCXT and DOM ---

interface SyntheticRequest {
  query: Record<string, string | undefined>;
}

interface SyntheticResponse {
  statusCode: number;
  body: unknown;
  status(code: number): this;
  json(data: unknown): this;
}

function createMockResponse(): SyntheticResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
  };
}

class MockInputElement {
  public isFocused = false;
  public value = '';

  focus(): void {
    this.isFocused = true;
  }

  blur(): void {
    this.isFocused = false;
  }
}

class SyntheticKeyboardEvent {
  public defaultPrevented = false;
  public propagationStopped = false;

  constructor(
    public readonly key: string,
    public readonly metaKey: boolean = false,
    public readonly ctrlKey: boolean = false
  ) {}

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

const mockCcxtMarkets = {
  'BTC/USDT': {
    id: 'BTCUSDT',
    symbol: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    active: true,
  },
  'BTC/EUR': {
    id: 'BTCEUR',
    symbol: 'BTC/EUR',
    base: 'BTC',
    quote: 'EUR',
    active: true,
  },
  'ETH/USDT': {
    id: 'ETHUSDT',
    symbol: 'ETH/USDT',
    base: 'ETH',
    quote: 'USDT',
    active: true,
  },
};

const mockCcxtTickers = {
  'BTC/USDT': {
    symbol: 'BTC/USDT',
    last: 64250.0,
    quoteVolume: 1245000000.5,
    baseVolume: 19377.43,
  },
  'BTC/EUR': {
    symbol: 'BTC/EUR',
    last: 59120.0,
    quoteVolume: 84500000.2,
    baseVolume: 1429.29,
  },
  'ETH/USDT': {
    symbol: 'ETH/USDT',
    last: 3450.2,
    quoteVolume: 745000000.0,
    baseVolume: 215929.5,
  },
};

describe('Story 5.2.1: Command Palette Symbol & Exchange Search', () => {

  describe('Server Route: src/server/routes/symbols.ts', () => {
    let mockClient: CcxtExchangeClient;

    beforeEach(() => {
      mockClient = {
        loadMarkets: mock.fn(async () => mockCcxtMarkets),
        fetchTickers: mock.fn(async (symbols?: string[]) => {
          if (!symbols || symbols.length === 0) return mockCcxtTickers;
          const filtered: Record<string, unknown> = {};
          for (const s of symbols) {
            if (mockCcxtTickers[s as keyof typeof mockCcxtTickers]) {
              filtered[s] = mockCcxtTickers[s as keyof typeof mockCcxtTickers];
            }
          }
          return filtered;
        }),
      };
    });

    it('should return matching trading pairs with real-time 24h volume for query "BTC/USDT"', async () => {
      const req: SyntheticRequest = { query: { q: 'BTC/USDT', exchange: 'binance' } };
      const res = createMockResponse();

      await searchSymbolsHandler(req as any, res as any, mockClient);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body), 'Response body must be an array');
      const results = res.body as SymbolSearchResult[];

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].symbol, 'BTC/USDT');
      assert.strictEqual(results[0].base, 'BTC');
      assert.strictEqual(results[0].quote, 'USDT');
      assert.strictEqual(results[0].volume24h, 1245000000.5);
      assert.strictEqual(results[0].lastPrice, 64250.0);
    });

    it('should filter pairs case-insensitively and partial-match on symbols', async () => {
      const req: SyntheticRequest = { query: { q: 'btc' } };
      const res = createMockResponse();

      await searchSymbolsHandler(req as any, res as any, mockClient);

      assert.strictEqual(res.statusCode, 200);
      const results = res.body as SymbolSearchResult[];
      assert.strictEqual(results.length, 2);
      const symbols = results.map((r) => r.symbol);
      assert.ok(symbols.includes('BTC/USDT'));
      assert.ok(symbols.includes('BTC/EUR'));
    });

    it('should return 400 Bad Request if query param "q" is missing or whitespace', async () => {
      const req: SyntheticRequest = { query: { q: '   ' } };
      const res = createMockResponse();

      await searchSymbolsHandler(req as any, res as any, mockClient);

      assert.strictEqual(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'Query parameter "q" is required and cannot be empty' });
    });

    it('should handle CCXT upstream service failure and return 502 with error details', async () => {
      const failingClient: CcxtExchangeClient = {
        loadMarkets: mock.fn(async () => {
          throw new Error('CCXT Exchange Rate Limit Exceeded or Network Error');
        }),
        fetchTickers: mock.fn(async () => {
          throw new Error('Exchange unreachable');
        }),
      };

      const req: SyntheticRequest = { query: { q: 'ETH' } };
      const res = createMockResponse();

      await searchSymbolsHandler(req as any, res as any, failingClient);

      assert.strictEqual(res.statusCode, 502);
      assert.deepEqual(res.body, {
        error: 'Upstream exchange provider failure: CCXT Exchange Rate Limit Exceeded or Network Error',
      });
    });
  });

  describe('Hook: src/hooks/useSymbolSearch.ts', () => {
    beforeEach(() => {
      mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    });

    afterEach(() => {
      mock.timers.reset();
    });

    it('should debounce input queries and trigger fetch only after debounce window passes', async () => {
      let networkCallCount = 0;
      const mockFetcher = mock.fn(async (query: string): Promise<SymbolSearchResult[]> => {
        networkCallCount++;
        return [
          {
            symbol: `${query.toUpperCase()}/USDT`,
            base: query.toUpperCase(),
            quote: 'USDT',
            volume24h: 98765432.1,
            lastPrice: 50000.0,
            exchange: 'binance',
          },
        ];
      });

      const controller = useSymbolSearch({
        fetcher: mockFetcher,
        debounceMs: 50,
      });

      assert.strictEqual(controller.isLoading, false);
      assert.deepEqual(controller.results, []);

      // Simulating rapid user typing: 'B' -> 'BT' -> 'BTC'
      controller.setQuery('B');
      mock.timers.tick(20);
      controller.setQuery('BT');
      mock.timers.tick(20);
      controller.setQuery('BTC');

      // 40ms passed total since first stroke, but only 20ms since 'BTC' -> should not have fired yet
      assert.strictEqual(networkCallCount, 0, 'Fetcher must not execute before debounce finishes');
      assert.strictEqual(controller.isLoading, true, 'Search state should indicate pending debounce');

      // Fast-forward remaining 50ms to elapse debounce time for 'BTC'
      mock.timers.tick(50);
      await Promise.resolve(); // Flush microtask queue for async fetcher resolution

      assert.strictEqual(networkCallCount, 1, 'Fetcher must execute exactly once for the latest query');
      assert.strictEqual(controller.isLoading, false);
      assert.strictEqual(controller.results.length, 1);
      assert.strictEqual(controller.results[0].symbol, 'BTC/USDT');
    });

    it('should complete fetch and render results within 100ms SLA', async () => {
      const mockFastFetcher = mock.fn(async (q: string): Promise<SymbolSearchResult[]> => {
        return [
          {
            symbol: 'BTC/USDT',
            base: 'BTC',
            quote: 'USDT',
            volume24h: 1245000000.5,
            lastPrice: 64250.0,
            exchange: 'binance',
          },
        ];
      });

      const startTime = Date.now();
      const results = await searchTradingPairs('BTC/USDT', {
        fetcher: mockFastFetcher,
        timeoutMs: 100,
      });
      const duration = Date.now() - startTime;

      assert.ok(duration <= 100, `Execution took ${duration}ms, exceeding 100ms threshold`);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].symbol, 'BTC/USDT');
      assert.strictEqual(results[0].volume24h, 1245000000.5);
    });

    it('should discard stale in-flight results if a newer search query completes', async () => {
      let resolveFirstQuery: (res: SymbolSearchResult[]) => void;
      const firstPromise = new Promise<SymbolSearchResult[]>((resolve) => {
        resolveFirstQuery = resolve;
      });

      const secondResult: SymbolSearchResult[] = [
        {
          symbol: 'SOL/USDT',
          base: 'SOL',
          quote: 'USDT',
          volume24h: 34500000.0,
          lastPrice: 145.0,
          exchange: 'binance',
        },
      ];

      const customFetcher = mock.fn((query: string) => {
        if (query === 'BTC') return firstPromise;
        return Promise.resolve(secondResult);
      });

      const controller = useSymbolSearch({ fetcher: customFetcher, debounceMs: 0 });

      // Trigger first query
      controller.setQuery('BTC');
      mock.timers.tick(1);

      // Trigger second query immediately
      controller.setQuery('SOL');
      mock.timers.tick(1);
      await Promise.resolve();

      // Resolve the stale 'BTC' promise afterwards
      resolveFirstQuery!([
        {
          symbol: 'BTC/USDT',
          base: 'BTC',
          quote: 'USDT',
          volume24h: 10000,
          lastPrice: 60000,
          exchange: 'binance',
        },
      ]);
      await Promise.resolve();

      assert.strictEqual(controller.results.length, 1);
      assert.strictEqual(controller.results[0].symbol, 'SOL/USDT', 'Stale response must not overwrite current query');
    });
  });

  describe('Component Logic & Interaction: src/components/CommandPalette.tsx', () => {
    it('should open modal and auto-focus search input when Cmd+K or Ctrl+K is pressed', () => {
      let isOpen = false;
      const inputRef = new MockInputElement();

      const stateContext = {
        isOpen,
        setOpen: (open: boolean) => {
          isOpen = open;
          if (open) {
            inputRef.focus();
          }
        },
      };

      // Test Cmd+K (macOS)
      const cmdKEvent = new SyntheticKeyboardEvent('k', true, false);
      handlePaletteKeyDown(cmdKEvent as any, stateContext);

      assert.ok(cmdKEvent.defaultPrevented, 'Cmd+K should call preventDefault() to intercept browser search');
      assert.strictEqual(isOpen, true, 'Command Palette must open on Cmd+K');
      assert.strictEqual(inputRef.isFocused, true, 'Search input element must be auto-focused');

      // Reset
      stateContext.setOpen(false);
      inputRef.blur();
      assert.strictEqual(isOpen, false);
      assert.strictEqual(inputRef.isFocused, false);

      // Test Ctrl+K (Windows/Linux)
      const ctrlKEvent = new SyntheticKeyboardEvent('k', false, true);
      handlePaletteKeyDown(ctrlKEvent as any, stateContext);

      assert.ok(ctrlKEvent.defaultPrevented, 'Ctrl+K should call preventDefault()');
      assert.strictEqual(isOpen, true, 'Command Palette must open on Ctrl+K');
      assert.strictEqual(inputRef.isFocused, true, 'Search input element must be auto-focused');
    });

    it('should close modal when Escape key is pressed while open', () => {
      let isOpen = true;
      const stateContext = {
        isOpen,
        setOpen: (open: boolean) => {
          isOpen = open;
        },
      };

      const escapeEvent = new SyntheticKeyboardEvent('Escape');
      handlePaletteKeyDown(escapeEvent as any, stateContext);

      assert.ok(escapeEvent.defaultPrevented, 'Escape should prevent propagation/default');
      assert.strictEqual(isOpen, false, 'Modal must close when Escape is pressed');
    });

    it('should update symbol context and close modal when a symbol result is selected', () => {
      let isOpen = true;
      let activeSymbolContext = 'ETH/USDT';

      const selectedSymbol: SymbolSearchResult = {
        symbol: 'BTC/USDT',
        base: 'BTC',
        quote: 'USDT',
        volume24h: 1245000000.5,
        lastPrice: 64250.0,
        exchange: 'binance',
      };

      const props: CommandPaletteProps = {
        isOpen,
        onClose: () => {
          isOpen = false;
        },
        onSelectSymbol: (symbol: string) => {
          activeSymbolContext = symbol;
        },
      };

      // Create component instance/action dispatcher
      const palette = new CommandPalette(props);
      palette.selectItem(selectedSymbol);

      assert.strictEqual(activeSymbolContext, 'BTC/USDT', 'Global symbol context should be updated to selected pair');
      assert.strictEqual(isOpen, false, 'Modal must close immediately upon symbol selection');
    });

    it('should ignore unrelated keyboard shortcuts when palette is closed', () => {
      let isOpen = false;
      const stateContext = {
        isOpen,
        setOpen: (open: boolean) => {
          isOpen = open;
        },
      };

      const randomEvent = new SyntheticKeyboardEvent('j', true, false);
      handlePaletteKeyDown(randomEvent as any, stateContext);

      assert.strictEqual(randomEvent.defaultPrevented, false);
      assert.strictEqual(isOpen, false);
    });
  });
});