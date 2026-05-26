// Quorum computation — Jeff (tentative): stake ≥ 20% AND count ≥ 50% of active.

import type { ValidatorSummary } from '@/lib/api';

export const STAKE_THRESHOLD = 0.2;
export const COUNT_THRESHOLD = 0.5;

export interface QuorumStatus {
  totalActiveStake: bigint;
  totalActiveCount: number;
  votedStake: bigint;
  votedCount: number;
  stakeRatio: number;
  countRatio: number;
  stakeReached: boolean;
  countReached: boolean;
  quorumReached: boolean;
}

export function computeQuorum(
  active: ValidatorSummary[],
  votedAddresses: string[],
): QuorumStatus {
  const votedSet = new Set(votedAddresses.map((a) => a.toLowerCase()));
  const totalActiveStake = active.reduce((s, v) => s + BigInt(v.stake), 0n);
  const totalActiveCount = active.length;
  const votedActive = active.filter((v) => votedSet.has(v.validator.toLowerCase()));
  const votedStake = votedActive.reduce((s, v) => s + BigInt(v.stake), 0n);
  const votedCount = votedActive.length;
  const stakeRatio =
    totalActiveStake > 0n ? Number((votedStake * 10000n) / totalActiveStake) / 10000 : 0;
  const countRatio = totalActiveCount > 0 ? votedCount / totalActiveCount : 0;
  const stakeReached = stakeRatio >= STAKE_THRESHOLD;
  const countReached = countRatio >= COUNT_THRESHOLD;
  return {
    totalActiveStake,
    totalActiveCount,
    votedStake,
    votedCount,
    stakeRatio,
    countRatio,
    stakeReached,
    countReached,
    quorumReached: stakeReached && countReached,
  };
}
