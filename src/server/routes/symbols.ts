import type { SymbolSearchResult } from '../../hooks/useSymbolSearch.js';

export interface CcxtMarket {
  id?: string;
  symbol: string;
  base?: string;
  quote?: string;
  active?: boolean;
  [key: string]: any;
}

export interface CcxtTicker {
  symbol?: string;
  last?: number;
  quoteVolume?: number;
  baseVolume?: number;
  [key: string]: any;
}

export interface CcxtExchangeClient {
  loadMarkets: () => Promise<Record<string, CcxtMarket>>;
  fetchTickers: (symbols?: string[]) => Promise<Record<string, CcxtTicker>>;
  [key: string]: any;
}

export interface SymbolsRouterOptions {
  client?: CcxtExchangeClient;
}

export async function searchSymbolsHandler(
  req: { query: Record<string, string | undefined> },
  res: { status: (code: number) => any; json: (data: unknown) => any },
  client?: CcxtExchangeClient
): Promise<void> {
  const q = req.query?.q;
  if (!q || typeof q !== 'string' || !q.trim()) {
    res.status(400).json({ error: 'Query parameter "q" is required and cannot be empty' });
    return;
  }

  if (!client) {
    res.status(502).json({
      error: 'Upstream exchange provider failure: CCXT exchange client is required',
    });
    return;
  }

  try {
    const markets = await client.loadMarkets();
    const normalizedQuery = q.trim().toLowerCase();
    const cleanQuery = normalizedQuery.replace(/[^a-z0-9]/g, '');

    const matchingMarkets = Object.values(markets).filter((market) => {
      if (!market?.symbol) return false;
      const symbolLower = market.symbol.toLowerCase();
      const idLower = market.id?.toLowerCase() ?? '';
      const cleanSymbol = symbolLower.replace(/[^a-z0-9]/g, '');

      return (
        symbolLower.includes(normalizedQuery) ||
        idLower.includes(normalizedQuery) ||
        (cleanQuery.length > 0 && cleanSymbol.includes(cleanQuery))
      );
    });

    const matchingSymbols = matchingMarkets.map((m) => m.symbol);
    let tickers: Record<string, CcxtTicker> = {};

    if (matchingSymbols.length > 0) {
      tickers = await client.fetchTickers(matchingSymbols);
    }

    const exchange = req.query.exchange;

    const results: SymbolSearchResult[] = matchingMarkets.map((market) => {
      const ticker = tickers[market.symbol];
      const volume24h =
        ticker?.quoteVolume ??
        ticker?.baseVolume ??
        (ticker as any)?.volume ??
        0;

      const base = market.base || market.symbol.split('/')[0] || '';
      const quote = market.quote || market.symbol.split('/')[1] || '';

      return {
        symbol: market.symbol,
        base,
        quote,
        volume24h,
        lastPrice: ticker?.last,
        exchange: exchange ? String(exchange) : undefined,
      };
    });

    res.status(200).json(results);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      error: `Upstream exchange provider failure: ${message}`,
    });
  }
}

export function createSymbolsRouter(clientOrOptions?: CcxtExchangeClient | SymbolsRouterOptions) {
  const client =
    clientOrOptions && 'loadMarkets' in clientOrOptions
      ? (clientOrOptions as CcxtExchangeClient)
      : (clientOrOptions as SymbolsRouterOptions)?.client;

  const handler = (req: any, res: any) => searchSymbolsHandler(req, res, client);

  const router: any = (req: any, res: any) => handler(req, res);
  router.get = (path: string, ...handlers: any[]) => router;
  router.use = (...handlers: any[]) => router;

  return router;
}