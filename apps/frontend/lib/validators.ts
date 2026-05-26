// Lookup tables built from a `validatorSummaries` response.
//
// Two distinct address spaces:
//   - `validator` field = governance address. This is what appears in
//     `validatorL1Votes[*].votes[]`. We compare votes against this.
//   - `signer` field    = signing address (validator's signer key). When the
//     user connects a wallet that *is* a validator signer, we map it to the
//     governance address via `bySigner`.

import type { ValidatorSummary } from './api';

export interface ValidatorIndex {
  /** lowercased *validator* (governance) hex → entry. Use for vote matching. */
  byValidator: Map<string, ValidatorSummary>;
  /** lowercased *signer* hex → entry. Use to identify the connected wallet. */
  bySigner: Map<string, ValidatorSummary>;
  /** isActive && !isJailed */
  active: ValidatorSummary[];
  /** every row */
  all: ValidatorSummary[];
}

export function buildValidatorIndex(summaries: ValidatorSummary[]): ValidatorIndex {
  const byValidator = new Map<string, ValidatorSummary>();
  const bySigner = new Map<string, ValidatorSummary>();
  for (const v of summaries) {
    byValidator.set(v.validator.toLowerCase(), v);
    bySigner.set(v.signer.toLowerCase(), v);
  }
  const active = summaries.filter((v) => v.isActive && !v.isJailed);
  return { byValidator, bySigner, active, all: summaries };
}

export function lookupValidator(idx: ValidatorIndex, addr: string): ValidatorSummary | undefined {
  const a = addr.toLowerCase();
  return idx.byValidator.get(a) ?? idx.bySigner.get(a);
}

export function displayName(idx: ValidatorIndex, addr: string): string {
  const v = lookupValidator(idx, addr);
  return v ? v.name : addr.slice(0, 6) + '…' + addr.slice(-4);
}

/** Split the active set by whether their governance address is in voters[]. */
export function splitVoters(
  idx: ValidatorIndex,
  voterAddresses: string[],
): { voted: ValidatorSummary[]; notVoted: ValidatorSummary[]; unknownVoters: string[] } {
  const lowerVoters = new Set(voterAddresses.map((s) => s.toLowerCase()));
  const voted: ValidatorSummary[] = [];
  const notVoted: ValidatorSummary[] = [];
  for (const v of idx.active) {
    if (lowerVoters.has(v.validator.toLowerCase())) voted.push(v);
    else notVoted.push(v);
  }
  const activeValidatorsLower = new Set(idx.active.map((v) => v.validator.toLowerCase()));
  const unknownVoters = voterAddresses.filter(
    (a) => !activeValidatorsLower.has(a.toLowerCase()),
  );
  return { voted, notVoted, unknownVoters };
}

/** Wallet (signer) → corresponding validator's governance address. */
export function governanceForSignerAccount(
  idx: ValidatorIndex,
  signerAccount: string,
): `0x${string}` | null {
  const v = idx.bySigner.get(signerAccount.toLowerCase());
  return v ? (v.validator as `0x${string}`) : null;
}
