// HF `/info` POST wrappers. Direct browser calls (CORS allow-listed).
// `/exchange` is NOT used here — hl-markets never submits, only reads.
//
// Backend (hl-markets-api) wrappers live at the bottom of this file. The frontend
// uses HF directly for live `pending` data (lowest latency, no indexer lag)
// and falls back to the backend for `historical` and detail-by-govId lookups.

import type { Network } from '@/lib/network';
export type { Network };

const MAINNET_INFO = 'https://api.hyperliquid.xyz/info';
const TESTNET_INFO = 'https://api.hyperliquid-testnet.xyz/info';

function infoUrl(n: Network): string {
  return n === 'mainnet' ? MAINNET_INFO : TESTNET_INFO;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function postInfo<T = any>(n: Network, body: object): Promise<T> {
  const res = await fetch(infoUrl(n), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HF /info ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ---- validatorL1Votes (pending governance) ------------------------------

export interface ValidatorL1VotePending {
  expireTime: number;
  /** Bare action *without* the `{type:"validatorL1Vote"}` wrapper.
   *  i.e. `{O: {...}}` or `{D: "BTC"}`. */
  action: Record<string, unknown>;
  /** Signer governance addresses that already voted on this pending action. */
  votes: `0x${string}`[];
  quorumReached: boolean;
}

export async function fetchValidatorL1Votes(n: Network): Promise<ValidatorL1VotePending[]> {
  return postInfo<ValidatorL1VotePending[]>(n, { type: 'validatorL1Votes' });
}

// ---- validatorSummaries (validator metadata) ----------------------------

export interface ValidatorSummary {
  validator: `0x${string}`;
  signer: `0x${string}`;
  name: string;
  description: string;
  nRecentBlocks: number;
  /** Raw HYPE units (1e8). Keep as string in transport, parse to BigInt for math. */
  stake: number;
  isJailed: boolean;
  unjailableAfter: number | null;
  isActive: boolean;
  commission: string;
  // stats: [["day"|"week"|"month", {uptimeFraction, predictedApr, nSamples}]]
  stats: unknown;
}

export async function fetchValidatorSummaries(n: Network): Promise<ValidatorSummary[]> {
  return postInfo<ValidatorSummary[]>(n, { type: 'validatorSummaries' });
}

// ---- meta (perp universe — for delisting cross-ref) ---------------------

export interface PerpAssetMeta {
  szDecimals: number;
  name: string;
  maxLeverage: number;
  marginTableId: number;
  isDelisted?: boolean;
}

export interface PerpMeta {
  universe: PerpAssetMeta[];
  // other fields (marginTables, etc.) — ignored for now
}

export async function fetchPerpMeta(n: Network): Promise<PerpMeta> {
  return postInfo<PerpMeta>(n, { type: 'meta' });
}

// ---- spotMeta (spot universe) -------------------------------------------

export interface SpotPair {
  tokens: number[];
  name: string;
  index: number;
  isCanonical: boolean;
}

export interface SpotMeta {
  universe: SpotPair[];
  tokens?: unknown;
}

export async function fetchSpotMeta(n: Network): Promise<SpotMeta> {
  return postInfo<SpotMeta>(n, { type: 'spotMeta' });
}

// ---- delegations (user-specific, Phase D) -------------------------------

export interface Delegation {
  validator: `0x${string}`;
  /** Raw HYPE units. */
  amount: string;
  lockedUntilTimestamp?: number | null;
}

export async function fetchDelegations(
  n: Network,
  user: `0x${string}`,
): Promise<Delegation[]> {
  return postInfo<Delegation[]>(n, { type: 'delegations', user });
}

export interface DelegatorSummary {
  delegated: string;
  undelegated: string;
  totalPendingWithdrawal: string;
  nPendingWithdrawals: number;
}

export async function fetchDelegatorSummary(
  n: Network,
  user: `0x${string}`,
): Promise<DelegatorSummary> {
  return postInfo<DelegatorSummary>(n, { type: 'delegatorSummary', user });
}

// ---- outcomeMeta (HIP-4 deployed outcome markets) -----------------------
// See contracts/outcome-market.md.

export interface OutcomeSideSpec {
  name: string;
}

export interface OutcomeMetaEntry {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: OutcomeSideSpec[];
  quoteToken: string;
}

/** A Polymarket-style multi-option market. `namedOutcomes` lists the option
 *  outcomeIds; each option's `Yes` side mid (in allMids) is the % chance for
 *  that option. `fallbackOutcome` resolves to Yes only if every namedOutcome
 *  resolved to No (i.e. "none of the above"). */
export interface OutcomeQuestion {
  question: number;
  name: string;
  description: string;
  fallbackOutcome: number;
  namedOutcomes: number[];
  settledNamedOutcomes: number[];
}

export interface OutcomeMetaResponse {
  outcomes: OutcomeMetaEntry[];
  questions: OutcomeQuestion[];
}

export async function fetchOutcomeMeta(n: Network): Promise<OutcomeMetaResponse> {
  return postInfo<OutcomeMetaResponse>(n, { type: 'outcomeMeta' });
}

/** Hypothesized mapping (mainnet 100-104 verified): outcome_id*10 + sideIdx → "#NNNN".
 *  Phase E indexer will cross-verify against allMids' `#NNNN` keys; if the
 *  formula breaks for 5-digit testnet outcome IDs, the indexer falls back to
 *  a lookup table it builds from runtime snapshots. */
export function outcomeAssetKey(outcomeId: number, sideIdx: number): `#${string}` {
  return `#${outcomeId * 10 + sideIdx}`;
}

// ---- allMids (all market mid prices) ------------------------------------

export type AllMidsResponse = Record<string, string>;

export async function fetchAllMids(n: Network): Promise<AllMidsResponse> {
  return postInfo<AllMidsResponse>(n, { type: 'allMids' });
}

// ---- l2Book (orderbook) -------------------------------------------------

export interface L2Level {
  px: string;
  sz: string;
  n: number;
}

export interface L2BookResponse {
  coin: string;
  time: number;
  /** [bids, asks] */
  levels: [L2Level[], L2Level[]];
}

export async function fetchL2Book(n: Network, coin: string): Promise<L2BookResponse> {
  return postInfo<L2BookResponse>(n, { type: 'l2Book', coin });
}

// ---- candleSnapshot (chart) ---------------------------------------------

export interface Candle {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

export async function fetchCandleSnapshot(
  n: Network,
  coin: string,
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
  startTime: number,
  endTime?: number,
): Promise<Candle[]> {
  return postInfo<Candle[]>(n, {
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime: endTime ?? Date.now() },
  });
}

// =========================================================================
// Backend (hl-markets-api) wrappers
// =========================================================================
// Set via env at build time: NEXT_PUBLIC_API_BASE=https://api.hl-markets.bharvest.io
// Default: localhost dev. The frontend is a static SPA so all backend reads
// happen client-side.

const API_BASE: string =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_API_BASE as string | undefined)) ||
  'http://localhost:3001';

/** Strings encoded by BigInt.prototype.toJSON polyfill on the API side.
 *  All ms-timestamp columns come back as numeric strings. */
type Stringified = string;

export interface BackendGovernanceRow {
  network: Network;
  govId: string;
  /** Inner action WITHOUT the `{type:"validatorL1Vote"}` wrapper — indexer stores
   *  the bare inner. We re-add the wrapper before passing into renderers. */
  action: Record<string, unknown>;
  variant: 'outcome' | 'delisting' | 'unknown';
  innerKey: string | null;
  expireTime: Stringified;
  status: 'pending' | 'settled' | 'expired';
  firstSeenAt: Stringified;
  lastSeenAt: Stringified;
  settledAt: Stringified | null;
  /** Latest vote_snapshot.voters[] for this gov (joined by /governance route). */
  latestVotes: `0x${string}`[];
  latestQuorumReached: boolean;
  latestSnapshotTs: Stringified | null;
}

export interface BackendGovernanceListResponse {
  rows: BackendGovernanceRow[];
  snapshotTime: string;
}

export interface BackendVoteSnapshot {
  ts: number;
  voters: `0x${string}`[];
  quorumReached: boolean;
}

/** Detail response: row + full vote timeline. */
export interface BackendGovernanceDetail extends BackendGovernanceRow {
  timeline: BackendVoteSnapshot[];
}

export interface BackendOutcomeRow {
  network: Network;
  outcomeId: number;
  name: string;
  description: string | null;
  sideSpecs: OutcomeSideSpec[];
  quoteToken: string;
  deployGovId: string | null;
  settleGovId: string | null;
  assetKeys: string[];
  status: 'trading' | 'settled';
  winnerSide: number | null;
  firstSeenAt: Stringified;
  lastSeenAt: Stringified;
  settledAt: Stringified | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`hl-markets-api ${path} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface BackendGovernanceListQuery {
  network: Network;
  status?: 'pending' | 'historical' | 'all';
  variant?: 'outcome' | 'delisting' | 'unknown';
  limit?: number;
}

export async function fetchBackendGovernanceList(
  q: BackendGovernanceListQuery,
): Promise<BackendGovernanceListResponse> {
  const usp = new URLSearchParams({ network: q.network });
  if (q.status) usp.set('status', q.status);
  if (q.variant) usp.set('variant', q.variant);
  if (q.limit) usp.set('limit', String(q.limit));
  return getJson<BackendGovernanceListResponse>(`/governance?${usp.toString()}`);
}

export async function fetchBackendGovernanceDetail(
  network: Network,
  govId: string,
): Promise<BackendGovernanceDetail> {
  return getJson<BackendGovernanceDetail>(
    `/governance/${network}/${encodeURIComponent(govId)}`,
  );
}

export interface BackendOutcomeListResponse {
  rows: BackendOutcomeRow[];
  snapshotTime: string;
}

export async function fetchBackendOutcomeList(
  network: Network,
): Promise<BackendOutcomeListResponse> {
  return getJson<BackendOutcomeListResponse>(`/outcome?network=${network}`);
}

export async function fetchBackendOutcomeDetail(
  network: Network,
  outcomeId: number,
): Promise<BackendOutcomeRow> {
  return getJson<BackendOutcomeRow>(`/outcome/${network}/${outcomeId}`);
}

// ---- backend outcome questions (Phase H.3) ------------------------------

export interface BackendOutcomeQuestionRow {
  network: Network;
  questionId: number;
  name: string;
  description: string | null;
  /** OutcomeIds, in declared order. */
  namedOutcomes: number[];
  fallbackOutcome: number;
  settledNamedOutcomes: number[];
  status: 'trading' | 'settled' | 'resolved';
  firstSeenAt: Stringified;
  lastSeenAt: Stringified;
  settledAt: Stringified | null;
}

export interface BackendOutcomeQuestionListResponse {
  rows: BackendOutcomeQuestionRow[];
  snapshotTime: string;
}

export async function fetchBackendQuestionList(
  network: Network,
  status: 'trading' | 'settled' | 'all' = 'all',
): Promise<BackendOutcomeQuestionListResponse> {
  const usp = new URLSearchParams({ network, status });
  return getJson<BackendOutcomeQuestionListResponse>(`/question?${usp.toString()}`);
}

export async function fetchBackendQuestionDetail(
  network: Network,
  questionId: number,
): Promise<BackendOutcomeQuestionRow> {
  return getJson<BackendOutcomeQuestionRow>(`/question/${network}/${questionId}`);
}
