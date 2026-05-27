// Phase J.6 — L2 order book helper for Simple Mode market orders.
//
// HF info `l2Book` returns: { coin, time, levels: [bids[], asks[]] }
// each level: { px: string, sz: string, n: number }
//
// Simple mode uses top-of-book ask price + size to:
//   1. Cap the max purchasable USD ("Max" button).
//   2. Compute an IOC limit price (best_ask × 1.02) for ~2% slippage tolerance.

import { CURRENT_NETWORK } from '@/lib/network';

const HF_INFO = {
  mainnet: 'https://api.hyperliquid.xyz/info',
  testnet: 'https://api.hyperliquid-testnet.xyz/info',
} as const;

export interface BookLevel {
  px: number;
  sz: number;
}

export interface OrderBook {
  /** Highest bid (top of book) or null if empty. */
  bestBid: BookLevel | null;
  /** Lowest ask (top of book) or null if empty. */
  bestAsk: BookLevel | null;
  /** Server time when book was generated. */
  time: number;
}

interface RawLevel { px: string; sz: string; n?: number }
interface RawBook { coin: string; time: number; levels: [RawLevel[], RawLevel[]] }

/** Fetch and normalize the L2 book for an asset key like "#102180". */
export async function fetchOrderBook(assetKey: string): Promise<OrderBook> {
  const res = await fetch(HF_INFO[CURRENT_NETWORK], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'l2Book', coin: assetKey }),
  });
  if (!res.ok) {
    throw new Error(`l2Book HTTP ${res.status}`);
  }
  const raw = (await res.json()) as RawBook;
  const [bids, asks] = raw.levels;
  const topBid = bids[0];
  const topAsk = asks[0];
  return {
    bestBid: topBid ? { px: Number(topBid.px), sz: Number(topBid.sz) } : null,
    bestAsk: topAsk ? { px: Number(topAsk.px), sz: Number(topAsk.sz) } : null,
    time: raw.time,
  };
}

/** Convert a USD amount + best ask price → contract size to buy.
 *  Returns 0 if book is empty or price is invalid. */
export function usdToContracts(usd: number, askPx: number): number {
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(askPx) || askPx <= 0) {
    return 0;
  }
  return usd / askPx;
}

/** Max USD purchasable at top-of-book = ask.size × ask.price.
 *  This is the conservative "what's actually fillable right now". */
export function maxUsdAtTopOfBook(book: OrderBook): number {
  if (!book.bestAsk) return 0;
  return book.bestAsk.sz * book.bestAsk.px;
}

/** IOC limit price with slippage buffer.
 *  We bump the limit above the best ask so an IOC at this price fills the
 *  entire top-of-book level even if the price ticked up between fetch and
 *  submit. 2% is generous for outcome markets where prices live in [0, 1]. */
export function iocLimitPrice(bestAsk: number, slippagePct = 2): number {
  return bestAsk * (1 + slippagePct / 100);
}
