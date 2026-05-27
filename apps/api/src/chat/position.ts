// HF `clearinghouseState` → "does this address hold a position in this
// market?" with a tiny 30s cache to keep the chat gate cheap.
//
// marketKey shapes:
//   - `o:<outcomeId>`  → one outcome, two side assets (#id*10, #id*10+1)
//   - `q:<questionId>` → question's namedOutcomes; we look across all of
//     them. We resolve the namedOutcomes list from outcome_question.

import { db } from '@/db/client';
import { outcomeQuestion } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Network } from '@/hf';

const HF_BASE = {
  mainnet: 'https://api.hyperliquid.xyz/info',
  testnet: 'https://api.hyperliquid-testnet.xyz/info',
} as const;

interface PositionRow {
  type: string;
  position: {
    coin: string;
    szi: string;
    positionValue?: string;
  };
}

interface ClearinghouseState {
  assetPositions?: PositionRow[];
}

interface SpotBalance {
  coin: string;
  total: string;
  hold: string;
  entryNtl: string;
}
interface SpotClearinghouseState {
  balances?: SpotBalance[];
}

async function fetchClearinghouseState(
  network: Network,
  address: string,
): Promise<ClearinghouseState> {
  const res = await fetch(HF_BASE[network], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'clearinghouseState', user: address }),
  });
  if (!res.ok) throw new Error(`clearinghouseState ${res.status}`);
  return (await res.json()) as ClearinghouseState;
}

async function fetchSpotState(
  network: Network,
  address: string,
): Promise<SpotClearinghouseState> {
  const res = await fetch(HF_BASE[network], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'spotClearinghouseState', user: address }),
  });
  if (!res.ok) throw new Error(`spotClearinghouseState ${res.status}`);
  return (await res.json()) as SpotClearinghouseState;
}

interface RawBookLevel { px: string }
interface RawBook { levels: [RawBookLevel[], RawBookLevel[]] }

async function fetchBestBid(network: Network, assetKey: string): Promise<number | null> {
  try {
    const res = await fetch(HF_BASE[network], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'l2Book', coin: assetKey }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as RawBook;
    const top = j.levels?.[0]?.[0];
    return top ? Number(top.px) : null;
  } catch {
    return null;
  }
}

/** Parse `o:<outcomeId>` or `q:<questionId>` → list of outcome ids covered. */
async function outcomeIdsForMarketKey(
  network: Network,
  marketKey: string,
): Promise<number[]> {
  const m = /^([oq]):(\d+)$/.exec(marketKey);
  if (!m) return [];
  const kind = m[1] as 'o' | 'q';
  const id = Number(m[2]);
  if (!Number.isFinite(id)) return [];
  if (kind === 'o') return [id];
  // question → look up namedOutcomes from outcome_question
  const rows = await db
    .select({ named: outcomeQuestion.namedOutcomes })
    .from(outcomeQuestion)
    .where(
      and(eq(outcomeQuestion.network, network), eq(outcomeQuestion.questionId, id)),
    )
    .limit(1);
  const named = rows[0]?.named;
  if (Array.isArray(named)) {
    return (named as unknown[])
      .map((x) => (typeof x === 'number' ? x : Number(x)))
      .filter((n) => Number.isFinite(n));
  }
  return [];
}

/** Build the set of asset keys for a market (both sides of every covered outcome). */
function assetKeysFor(outcomeIds: number[]): string[] {
  const keys: string[] = [];
  for (const id of outcomeIds) {
    keys.push(`#${id * 10}`);
    keys.push(`#${id * 10 + 1}`);
  }
  return keys;
}

export type PositionSide = 'yes-long' | 'no-long' | 'none';

export interface PositionHolding {
  outcomeId: number;
  outcomeName: string;
  sideIdx: number;
  sideName: string;
  shares: number;
  notional: number;
}

export interface PositionSnapshot {
  side: PositionSide;
  /** Sum of |positionValue| across the market's matching assets. USD. */
  notional: number;
  /** Total outcome shares held (sum across all matching assets). */
  shares: number;
  /** Per-outcome breakdown, ordered by notional desc. Empty when side=none. */
  holdings: PositionHolding[];
  lastFetchedAt: number;
}

// ---- outcomeMeta cache --------------------------------------------------

interface OutcomeSideSpec { name: string }
interface OutcomeMetaEntry {
  outcome: number;
  name: string;
  sideSpecs?: OutcomeSideSpec[];
}
interface OutcomeMetaResponse { outcomes: OutcomeMetaEntry[] }

let metaCache: { ts: number; entries: Map<number, OutcomeMetaEntry> } | null = null;
const META_TTL_MS = 5 * 60_000;

async function loadOutcomeMeta(network: Network): Promise<Map<number, OutcomeMetaEntry>> {
  if (metaCache && Date.now() - metaCache.ts < META_TTL_MS) {
    return metaCache.entries;
  }
  try {
    const res = await fetch(HF_BASE[network], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'outcomeMeta' }),
    });
    if (!res.ok) throw new Error(`outcomeMeta ${res.status}`);
    const j = (await res.json()) as OutcomeMetaResponse;
    const map = new Map<number, OutcomeMetaEntry>();
    for (const o of j.outcomes ?? []) map.set(o.outcome, o);
    metaCache = { ts: Date.now(), entries: map };
    return map;
  } catch {
    return metaCache?.entries ?? new Map();
  }
}

interface CacheEntry {
  snap: PositionSnapshot;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(network: Network, address: string, marketKey: string): string {
  return `${network}::${address.toLowerCase()}::${marketKey}`;
}

/** Public: side + total notional for an address in a market. */
export async function getPosition(
  network: Network,
  address: string,
  marketKey: string,
): Promise<PositionSnapshot> {
  const k = cacheKey(network, address, marketKey);
  const cached = cache.get(k);
  if (cached && cached.expiresAt > Date.now()) return cached.snap;

  const outcomeIds = await outcomeIdsForMarketKey(network, marketKey);
  if (outcomeIds.length === 0) {
    const snap: PositionSnapshot = {
      side: 'none',
      notional: 0,
      shares: 0,
      holdings: [],
      lastFetchedAt: Date.now(),
    };
    cache.set(k, { snap, expiresAt: Date.now() + CACHE_TTL_MS });
    return snap;
  }

  // outcome assets use `#NNN` (orders) / `+NNN` (spot holdings) — same id.
  const hashKeys = new Set(assetKeysFor(outcomeIds));
  const plusKeys = new Set(Array.from(hashKeys, (k) => k.replace('#', '+')));
  const yesPlusKeys = new Set(outcomeIds.map((id) => `+${id * 10}`));
  // Yes side has even suffix (0); No side suffix 1.

  const meta = await loadOutcomeMeta(network);
  /** Aggregate per (outcomeId, sideIdx). */
  const byKey = new Map<string, PositionHolding>();
  const bump = (coin: string, deltaShares: number, deltaNotional: number): void => {
    // coin is "+NNN" or "#NNN". Strip prefix, decode outcomeId/sideIdx.
    const m = /^[+#](\d+)$/.exec(coin);
    if (!m) return;
    const n = Number(m[1]);
    const outcomeId = Math.floor(n / 10);
    const sideIdx = n % 10;
    const key = `${outcomeId}:${sideIdx}`;
    const entry = meta.get(outcomeId);
    const outcomeName = entry?.name ?? `Outcome #${outcomeId}`;
    const sideName = entry?.sideSpecs?.[sideIdx]?.name ?? (sideIdx === 0 ? 'Yes' : 'No');
    const cur = byKey.get(key) ?? {
      outcomeId,
      outcomeName,
      sideIdx,
      sideName,
      shares: 0,
      notional: 0,
    };
    cur.shares += deltaShares;
    cur.notional += deltaNotional;
    byKey.set(key, cur);
  };

  // 1. Perp-style positions (assetPositions). Older outcomes might still
  //    surface here; we keep this leg for back-compat.
  try {
    const state = await fetchClearinghouseState(network, address);
    for (const p of state.assetPositions ?? []) {
      const coin = p.position?.coin;
      if (!coin || !hashKeys.has(coin)) continue;
      const szi = Number(p.position.szi);
      const pv = Math.abs(Number(p.position.positionValue ?? '0'));
      if (Number.isFinite(szi) && szi > 0) {
        bump(coin, Math.abs(szi), pv);
      }
    }
  } catch {
    /* fall through — spot leg may still produce a useful answer */
  }

  // 2. Spot-style outcome holdings (`+NNN`). This is where HIP-4 outcome
  //    shares actually live — mark-to-market with best bid for notional.
  try {
    const spot = await fetchSpotState(network, address);
    const matching = (spot.balances ?? []).filter(
      (b) => plusKeys.has(b.coin) && Number(b.total) > 0,
    );
    if (matching.length > 0) {
      // Fetch bid per held asset in parallel; mark = shares × bestBid.
      const marks = await Promise.all(
        matching.map(async (b) => {
          const bid = await fetchBestBid(network, b.coin.replace('+', '#'));
          return { coin: b.coin, total: Number(b.total), bid };
        }),
      );
      for (const m of marks) {
        bump(m.coin, m.total, m.bid !== null ? m.total * m.bid : 0);
      }
    }
  } catch {
    /* HF outage — best-effort, fall through */
  }

  // Sort holdings by notional desc.
  const holdings = Array.from(byKey.values())
    .filter((h) => h.shares > 0)
    .sort((a, b) => b.notional - a.notional);

  const shares = holdings.reduce((a, h) => a + h.shares, 0);
  const notional = holdings.reduce((a, h) => a + h.notional, 0);

  // Side: derived from the LARGEST holding (by notional). Mixed positions
  // are common; the badge surfaces the primary one.
  const primary = holdings[0];
  const side: PositionSide = primary
    ? primary.sideIdx === 0
      ? 'yes-long'
      : 'no-long'
    : 'none';

  const snap: PositionSnapshot = {
    side,
    notional,
    shares,
    holdings,
    lastFetchedAt: Date.now(),
  };
  cache.set(k, { snap, expiresAt: Date.now() + CACHE_TTL_MS });
  return snap;
}
