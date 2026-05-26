// Server-side `/info` POST wrappers. Mirrors apps/frontend/lib/api.ts shape so
// the indexer and the API routes share a typed view of HF responses.

export type Network = 'testnet' | 'mainnet';

const MAINNET = 'https://api.hyperliquid.xyz/info';
const TESTNET = 'https://api.hyperliquid-testnet.xyz/info';

function url(n: Network): string {
  return n === 'mainnet' ? MAINNET : TESTNET;
}

async function post<T>(n: Network, body: object): Promise<T> {
  const res = await fetch(url(n), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HF ${n} /info ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ---- validatorL1Votes ---------------------------------------------------

export interface ValidatorL1VotePending {
  expireTime: number;
  action: Record<string, unknown>;
  votes: `0x${string}`[];
  quorumReached: boolean;
}

export const fetchValidatorL1Votes = (n: Network) =>
  post<ValidatorL1VotePending[]>(n, { type: 'validatorL1Votes' });

// ---- validatorSummaries -------------------------------------------------

export interface ValidatorSummary {
  validator: `0x${string}`;
  signer: `0x${string}`;
  name: string;
  description: string;
  nRecentBlocks: number;
  stake: number;
  isJailed: boolean;
  unjailableAfter: number | null;
  isActive: boolean;
  commission: string;
  stats: unknown;
}

export const fetchValidatorSummaries = (n: Network) =>
  post<ValidatorSummary[]>(n, { type: 'validatorSummaries' });

// ---- outcomeMeta --------------------------------------------------------

export interface OutcomeMetaEntry {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: { name: string }[];
  quoteToken: string;
}

/** Polymarket-style multi-option market grouping. namedOutcomes holds the
 *  option outcomeIds. fallbackOutcome is the "none of the above" twin. */
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

export const fetchOutcomeMeta = (n: Network) =>
  post<OutcomeMetaResponse>(n, { type: 'outcomeMeta' });

// ---- allMids ------------------------------------------------------------

export const fetchAllMids = (n: Network) =>
  post<Record<string, string>>(n, { type: 'allMids' });
