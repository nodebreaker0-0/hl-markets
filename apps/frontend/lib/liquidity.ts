// Liquidity / profit helpers for outcome markets.
//
// HL outcome assets settle to 1.0 (Yes wins) or 0.0 (No wins). For a buyer of
// the Yes side at avg price `p`, the per-share max profit is `1 - p`. Walking
// the ask book gives us "how much can I actually buy right now, and what's the
// max profit if Yes settles".

import type { L2BookResponse } from '@/lib/api';

export interface AskWalk {
  /** Total Yes/No share size we could buy by clearing the listed ask levels. */
  size: number;
  /** USDC cost to buy that size. */
  cost: number;
  /** Average price per share = cost / size. NaN when size === 0. */
  avgPrice: number;
  /** Max profit if the asset settles to 1.0 = size - cost. */
  maxProfit: number;
  /** Top of book — the price at which the next single share would fill. */
  topAsk: number | null;
}

const EMPTY: AskWalk = {
  size: 0,
  cost: 0,
  avgPrice: NaN,
  maxProfit: 0,
  topAsk: null,
};

/** Walk the ask side (offered for sale) and sum up the depth.
 *  Pass `levels: N` to cap at the top-N levels (defaults to ALL listed). */
export function walkAsks(book: L2BookResponse | null | undefined, levels?: number): AskWalk {
  if (!book) return EMPTY;
  const asks = book.levels[1];
  if (!asks || asks.length === 0) return EMPTY;
  const take = levels && levels > 0 ? asks.slice(0, levels) : asks;
  let size = 0;
  let cost = 0;
  for (const a of take) {
    const sz = Number(a.sz);
    const px = Number(a.px);
    if (!Number.isFinite(sz) || !Number.isFinite(px)) continue;
    size += sz;
    cost += sz * px;
  }
  if (size === 0) return EMPTY;
  return {
    size,
    cost,
    avgPrice: cost / size,
    maxProfit: size - cost,
    topAsk: Number(take[0]?.px ?? NaN),
  };
}

export function fmtUsd(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
  });
}

export function fmtSize(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}
