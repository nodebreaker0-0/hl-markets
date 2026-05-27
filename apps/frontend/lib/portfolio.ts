// Phase J.8 — portfolio aggregator.
//
// Fetches and joins:
//   - spotClearinghouseState  → outcome share balances + entry notional
//   - openOrders              → resting orders
//   - userFills               → recent fill history
//   - outcomeMeta             → outcome id → "France" name mapping
//   - l2Book (per holding)    → current best bid for mark / cash-out price
//
// Designed to be polling-friendly (10s refresh): each fetchPortfolio() runs
// 1 HF request per holding for the bid, in parallel.

import { CURRENT_NETWORK, type Network } from '@/lib/network';

const HF_INFO = {
  mainnet: 'https://api.hyperliquid.xyz/info',
  testnet: 'https://api.hyperliquid-testnet.xyz/info',
} as const;

async function info<T>(body: unknown, network: Network = CURRENT_NETWORK): Promise<T> {
  const res = await fetch(HF_INFO[network], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HF info ${res.status}`);
  return (await res.json()) as T;
}

// ---- Types --------------------------------------------------------------

export interface OutcomeSideSpec { name: string }
export interface OutcomeMetaEntry {
  outcome: number;
  name: string;
  description?: string;
  sideSpecs?: OutcomeSideSpec[];
  quoteToken?: string;
}

export interface Holding {
  /** Coin id, e.g. "+102490". */
  coin: string;
  /** Decoded outcome id (e.g. 10249) and side index (0 = Yes, 1 = No, ...). */
  outcomeId: number;
  sideIdx: number;
  /** Display name resolved via outcomeMeta. */
  outcomeName: string;
  sideName: string;
  /** Number of shares held. */
  shares: number;
  /** Cumulative USDC spent on this position. */
  entryNtl: number;
  /** Current best bid (used for mark + cash-out). null = no liquidity. */
  bestBid: number | null;
  /** Current mark value in USDC = shares × bestBid. null if no bid. */
  markValue: number | null;
  /** Unrealized P&L = markValue - entryNtl. null if no bid. */
  unrealizedPnl: number | null;
  /** P&L %: pnl / entry (or null if entry = 0). */
  unrealizedPnlPct: number | null;
}

export interface OpenOrder {
  oid: number;
  coin: string;
  side: 'B' | 'A';
  limitPx: number;
  sz: number;
  origSz: number;
  timestamp: number;
  /** Resolved if it's an outcome coin (#NNNNNN). */
  outcomeName?: string;
  sideName?: string;
}

export interface FillRow {
  oid: number;
  tid: number;
  coin: string;
  px: number;
  sz: number;
  side: 'B' | 'A';
  dir: 'Buy' | 'Sell';
  time: number;
  closedPnl: number;
  fee: number;
  feeToken: string;
  outcomeName?: string;
  sideName?: string;
}

export interface PortfolioSnapshot {
  holdings: Holding[];
  openOrders: OpenOrder[];
  fills: FillRow[];
  totals: {
    cost: number;
    mark: number;
    unrealized: number;
    realized: number;
  };
}

// ---- Internals ----------------------------------------------------------

interface RawBalance {
  coin: string;
  total: string;
  hold: string;
  entryNtl: string;
}
interface RawSpotState { balances: RawBalance[] }
interface RawOpenOrder {
  oid: number;
  coin: string;
  side: 'B' | 'A';
  limitPx: string;
  sz: string;
  origSz: string;
  timestamp: number;
}
interface RawFill {
  oid: number;
  tid: number;
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  dir: 'Buy' | 'Sell';
  time: number;
  closedPnl: string;
  fee: string;
  feeToken: string;
}
interface RawBookLevel { px: string; sz: string }
interface RawBook { coin: string; levels: [RawBookLevel[], RawBookLevel[]] }
interface RawOutcomeMeta { outcomes: OutcomeMetaEntry[] }

let metaCache: { ts: number; entries: Map<number, OutcomeMetaEntry> } | null = null;
const META_TTL_MS = 5 * 60 * 1000;

async function loadOutcomeMeta(): Promise<Map<number, OutcomeMetaEntry>> {
  if (metaCache && Date.now() - metaCache.ts < META_TTL_MS) {
    return metaCache.entries;
  }
  const j = await info<RawOutcomeMeta>({ type: 'outcomeMeta' });
  const map = new Map<number, OutcomeMetaEntry>();
  for (const o of j.outcomes) map.set(o.outcome, o);
  metaCache = { ts: Date.now(), entries: map };
  return map;
}

function parseOutcomeCoin(coin: string): { outcomeId: number; sideIdx: number } | null {
  // "+102490" or "#102490" → outcomeId=10249, sideIdx=0
  const m = /^[+#](\d+)$/.exec(coin);
  if (!m) return null;
  const n = Number(m[1]);
  return { outcomeId: Math.floor(n / 10), sideIdx: n % 10 };
}

function decorateMeta(
  coin: string,
  meta: Map<number, OutcomeMetaEntry>,
): { outcomeName: string; sideName: string; outcomeId: number; sideIdx: number } | null {
  const parsed = parseOutcomeCoin(coin);
  if (!parsed) return null;
  const entry = meta.get(parsed.outcomeId);
  return {
    outcomeId: parsed.outcomeId,
    sideIdx: parsed.sideIdx,
    outcomeName: entry?.name ?? `Outcome #${parsed.outcomeId}`,
    sideName: entry?.sideSpecs?.[parsed.sideIdx]?.name ?? (parsed.sideIdx === 0 ? 'Yes' : 'No'),
  };
}

/** Fast lookup: shares + entry for a single outcome asset key like "#102490".
 *  Used by TradeWidget to show "You hold N shares ($X)" inline. */
export async function fetchHolding(
  user: `0x${string}`,
  assetKey: string,
  network: Network = CURRENT_NETWORK,
): Promise<{ shares: number; entryNtl: number } | null> {
  // Asset key uses "#" prefix; holdings use "+" prefix for the same numeric id.
  const plus = assetKey.replace(/^#/, '+');
  const spot = await info<RawSpotState>(
    { type: 'spotClearinghouseState', user },
    network,
  );
  const row = (spot.balances ?? []).find((b) => b.coin === plus);
  if (!row || Number(row.total) <= 0) return null;
  return { shares: Number(row.total), entryNtl: Number(row.entryNtl) };
}

async function fetchBestBid(coin: string): Promise<number | null> {
  try {
    // L2 book endpoint accepts the asset key with "#" prefix.
    const key = coin.replace(/^[+]/, '#');
    const j = await info<RawBook>({ type: 'l2Book', coin: key });
    const bid = j.levels?.[0]?.[0];
    return bid ? Number(bid.px) : null;
  } catch {
    return null;
  }
}

// ---- Public API ---------------------------------------------------------

export async function fetchPortfolio(
  user: `0x${string}`,
  network: Network = CURRENT_NETWORK,
): Promise<PortfolioSnapshot> {
  const [spot, openOrdersRaw, fillsRaw, meta] = await Promise.all([
    info<RawSpotState>({ type: 'spotClearinghouseState', user }, network),
    info<RawOpenOrder[]>({ type: 'openOrders', user }, network),
    info<RawFill[]>({ type: 'userFills', user, aggregateByTime: false }, network),
    loadOutcomeMeta(),
  ]);

  // Filter to outcome shares (coin starts with "+") AND non-zero balance.
  const outcomeBalances = (spot.balances ?? []).filter(
    (b) => b.coin.startsWith('+') && Number(b.total) > 0,
  );

  // Fetch best bid for each holding in parallel.
  const bids = await Promise.all(outcomeBalances.map((b) => fetchBestBid(b.coin)));

  const holdings: Holding[] = outcomeBalances.map((b, i) => {
    const dec = decorateMeta(b.coin, meta);
    const shares = Number(b.total);
    const entryNtl = Number(b.entryNtl);
    const bestBid = bids[i] ?? null;
    const markValue = bestBid !== null ? shares * bestBid : null;
    const unrealizedPnl = markValue !== null ? markValue - entryNtl : null;
    const unrealizedPnlPct =
      unrealizedPnl !== null && entryNtl > 0 ? (unrealizedPnl / entryNtl) * 100 : null;
    return {
      coin: b.coin,
      outcomeId: dec?.outcomeId ?? 0,
      sideIdx: dec?.sideIdx ?? 0,
      outcomeName: dec?.outcomeName ?? b.coin,
      sideName: dec?.sideName ?? '',
      shares,
      entryNtl,
      bestBid,
      markValue,
      unrealizedPnl,
      unrealizedPnlPct,
    };
  });

  const openOrders: OpenOrder[] = openOrdersRaw.map((o) => {
    const dec = decorateMeta(o.coin, meta);
    return {
      oid: o.oid,
      coin: o.coin,
      side: o.side,
      limitPx: Number(o.limitPx),
      sz: Number(o.sz),
      origSz: Number(o.origSz),
      timestamp: o.timestamp,
      outcomeName: dec?.outcomeName,
      sideName: dec?.sideName,
    };
  });

  // Outcome-only filter: portfolio is for hl-markets activity, not the
  // user's broader HL perp/spot trading. Perp/spot coins look like "BTC",
  // "SOL", "@1035" etc. Outcome coins are always `+NNNN` (holdings) or
  // `#NNNN` (orders/fills).
  const isOutcome = (coin: string): boolean => /^[+#]\d+$/.test(coin);
  const outcomeFills = fillsRaw.filter((f) => isOutcome(f.coin));

  const fills: FillRow[] = outcomeFills.slice(0, 20).map((f) => {
    const dec = decorateMeta(f.coin, meta);
    return {
      oid: f.oid,
      tid: f.tid,
      coin: f.coin,
      px: Number(f.px),
      sz: Number(f.sz),
      side: f.side,
      dir: f.dir,
      time: f.time,
      closedPnl: Number(f.closedPnl),
      fee: Number(f.fee),
      feeToken: f.feeToken,
      outcomeName: dec?.outcomeName,
      sideName: dec?.sideName,
    };
  });

  const cost = holdings.reduce((a, h) => a + h.entryNtl, 0);
  const mark = holdings.reduce((a, h) => a + (h.markValue ?? 0), 0);
  const unrealized = holdings.reduce((a, h) => a + (h.unrealizedPnl ?? 0), 0);
  // Realized P&L over OUTCOME trades only (perp/spot trades belong to the
  // user's broader HL portfolio, not hl-markets).
  const realized = outcomeFills.reduce(
    (a, f) => a + (f.dir === 'Sell' ? Number(f.closedPnl) : 0),
    0,
  );

  return { holdings, openOrders, fills, totals: { cost, mark, unrealized, realized } };
}
