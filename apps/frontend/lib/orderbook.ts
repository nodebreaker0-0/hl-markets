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
  /** Full ask side (multi-level walks need this). */
  asks: BookLevel[];
  /** Full bid side. */
  bids: BookLevel[];
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
  const [rawBids, rawAsks] = raw.levels;
  const bids: BookLevel[] = (rawBids ?? []).map((l) => ({ px: Number(l.px), sz: Number(l.sz) }));
  const asks: BookLevel[] = (rawAsks ?? []).map((l) => ({ px: Number(l.px), sz: Number(l.sz) }));
  return {
    bestBid: bids[0] ?? null,
    bestAsk: asks[0] ?? null,
    asks,
    bids,
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

/** Walk the ask side until either `targetUsd` USD or the limit price is met.
 *  Returns the integer-rounded total contracts to request and the
 *  worst-fill price that should be the IOC limit (= last touched level ×
 *  (1+slippage)).
 *
 *  The slippagePct lets the order chase up to `lastLevel × (1+slip)` so a
 *  small book tick during submission doesn't strand the tail. */
export interface WalkResult {
  /** Integer contracts to submit. */
  contracts: number;
  /** Spend in USDC at the walked levels (estimate, pre-fill). */
  spendUsd: number;
  /** Weighted average price across the levels we will touch. */
  avgPx: number;
  /** Last level price we'd consume. Drives the IOC limit. */
  worstPx: number;
  /** How many levels we'd touch (informational). */
  levelsTouched: number;
}

export function walkAsks(
  asks: BookLevel[],
  targetUsd: number,
  slippagePct = 2,
): WalkResult | null {
  if (asks.length === 0 || targetUsd <= 0) return null;
  let remainingUsd = targetUsd;
  let contracts = 0;
  let spend = 0;
  let lastPx = asks[0]!.px;
  let levelsTouched = 0;

  for (const lvl of asks) {
    const lvlMaxUsd = lvl.px * lvl.sz;
    const takeUsd = Math.min(remainingUsd, lvlMaxUsd);
    const takeContracts = takeUsd / lvl.px;
    contracts += takeContracts;
    spend += takeContracts * lvl.px;
    lastPx = lvl.px;
    levelsTouched += 1;
    remainingUsd -= takeUsd;
    if (remainingUsd <= 0.0001) break;
  }

  if (contracts <= 0) return null;

  // Outcome markets require integer size (szDecimals=0). Round UP so the
  // notional we ask HL to fill is ≥ what the user wanted. The IOC limit
  // gets slippage bumped from the last touched level so the rounded-up
  // share also fits comfortably under the cap.
  const intContracts = Math.ceil(contracts);
  const avgPx = spend / contracts;

  return {
    contracts: intContracts,
    spendUsd: intContracts * avgPx,
    avgPx,
    worstPx: lastPx,
    levelsTouched,
  };
}
