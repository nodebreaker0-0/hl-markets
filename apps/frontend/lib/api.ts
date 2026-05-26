// HF `/info` POST wrappers. Direct browser calls (CORS allow-listed).
// `/exchange` is NOT used here — hl-gov never submits, only reads.

import type { Network } from '@/components/NetworkTabs';

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
