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

export interface PositionSnapshot {
  side: PositionSide;
  /** Sum of |positionValue| across the market's matching assets. USD. */
  notional: number;
  lastFetchedAt: number;
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
    const snap: PositionSnapshot = { side: 'none', notional: 0, lastFetchedAt: Date.now() };
    cache.set(k, { snap, expiresAt: Date.now() + CACHE_TTL_MS });
    return snap;
  }

  const keys = new Set(assetKeysFor(outcomeIds));
  const yesKeys = new Set(outcomeIds.map((id) => `#${id * 10}`));
  // (`#${id*10+1}` = No side)

  let state: ClearinghouseState;
  try {
    state = await fetchClearinghouseState(network, address);
  } catch {
    // HF outage → no position (gate fails closed).
    const snap: PositionSnapshot = { side: 'none', notional: 0, lastFetchedAt: Date.now() };
    cache.set(k, { snap, expiresAt: Date.now() + CACHE_TTL_MS });
    return snap;
  }

  let yesLong = false;
  let noLong = false;
  let notional = 0;
  for (const p of state.assetPositions ?? []) {
    const coin = p.position?.coin;
    if (!coin || !keys.has(coin)) continue;
    const szi = Number(p.position.szi);
    const pv = Math.abs(Number(p.position.positionValue ?? '0'));
    notional += pv;
    if (Number.isFinite(szi) && szi > 0) {
      if (yesKeys.has(coin)) yesLong = true;
      else noLong = true;
    }
  }

  const side: PositionSide = yesLong ? 'yes-long' : noLong ? 'no-long' : 'none';
  const snap: PositionSnapshot = { side, notional, lastFetchedAt: Date.now() };
  cache.set(k, { snap, expiresAt: Date.now() + CACHE_TTL_MS });
  return snap;
}
