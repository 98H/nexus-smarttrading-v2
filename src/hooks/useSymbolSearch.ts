export interface SymbolSearchResult {
  symbol: string;
  base: string;
  quote: string;
  volume24h: number;
  lastPrice?: number;
  exchange?: string;
}

export interface UseSymbolSearchOptions {
  fetcher?: (query: string) => Promise<SymbolSearchResult[]>;
  debounceMs?: number;
  initialQuery?: string;
}

export interface SearchTradingPairsOptions {
  fetcher?: (query: string) => Promise<SymbolSearchResult[]>;
  timeoutMs?: number;
}

async function defaultFetcher(query: string): Promise<SymbolSearchResult[]> {
  if (typeof fetch === 'function') {
    const res = await fetch(`/api/symbols?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch symbols: ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
  return [];
}

export async function searchTradingPairs(
  query: string,
  options?: SearchTradingPairsOptions
): Promise<SymbolSearchResult[]> {
  const fetcher = options?.fetcher || defaultFetcher;
  const timeoutMs = options?.timeoutMs ?? 100;

  if (timeoutMs > 0) {
    let timeoutId: NodeJS.Timeout | any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Symbol search timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([fetcher(query), timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  return fetcher(query);
}

export class SymbolSearchController {
  public query = '';
  public results: SymbolSearchResult[] = [];
  public isLoading = false;
  public error: Error | null = null;

  private _debounceTimer: NodeJS.Timeout | any = null;
  private _latestRequestId = 0;
  private readonly fetcher: (query: string) => Promise<SymbolSearchResult[]>;
  private readonly debounceMs: number;

  constructor(options?: UseSymbolSearchOptions) {
    this.fetcher = options?.fetcher || defaultFetcher;
    this.debounceMs = options?.debounceMs ?? 50;
    if (options?.initialQuery) {
      this.setQuery(options.initialQuery);
    }
  }

  public setQuery = (newQuery: string): void => {
    this.query = newQuery;
    const requestId = ++this._latestRequestId;

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    if (!newQuery.trim()) {
      this.isLoading = false;
      this.results = [];
      return;
    }

    this.isLoading = true;

    this._debounceTimer = setTimeout(() => {
      this.fetcher(newQuery)
        .then((results) => {
          if (this._latestRequestId === requestId) {
            this.results = results;
            this.isLoading = false;
          }
        })
        .catch((err) => {
          if (this._latestRequestId === requestId) {
            this.error = err instanceof Error ? err : new Error(String(err));
            this.isLoading = false;
          }
        });
    }, this.debounceMs);
  };

  public clear = (): void => {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._latestRequestId++;
    this.query = '';
    this.results = [];
    this.isLoading = false;
    this.error = null;
  };
}

export function useSymbolSearch(options?: UseSymbolSearchOptions): SymbolSearchController {
  return new SymbolSearchController(options);
}