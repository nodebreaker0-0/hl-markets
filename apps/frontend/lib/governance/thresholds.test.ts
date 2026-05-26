import { describe, it, expect } from 'vitest';
import { computeQuorum, STAKE_THRESHOLD, COUNT_THRESHOLD } from './thresholds';
import type { ValidatorSummary } from '@/lib/api';

function mkV(addr: string, stake: number, isActive = true, isJailed = false): ValidatorSummary {
  return {
    validator: addr as `0x${string}`,
    signer: addr as `0x${string}`,
    name: addr,
    description: '',
    nRecentBlocks: 0,
    stake,
    isJailed,
    unjailableAfter: null,
    isActive,
    commission: '0.05',
    stats: [],
  };
}

describe('computeQuorum', () => {
  it('zero active set → all ratios 0, not reached', () => {
    const q = computeQuorum([], []);
    expect(q.totalActiveCount).toBe(0);
    expect(q.totalActiveStake).toBe(0n);
    expect(q.stakeRatio).toBe(0);
    expect(q.countRatio).toBe(0);
    expect(q.stakeReached).toBe(false);
    expect(q.countReached).toBe(false);
    expect(q.quorumReached).toBe(false);
  });

  it('no voters → ratios 0', () => {
    const active = [mkV('0x1', 100), mkV('0x2', 200)];
    const q = computeQuorum(active, []);
    expect(q.votedCount).toBe(0);
    expect(q.votedStake).toBe(0n);
    expect(q.stakeRatio).toBe(0);
    expect(q.countRatio).toBe(0);
  });

  it('100% voted → ratios 1, both reached', () => {
    const active = [mkV('0x1', 100), mkV('0x2', 200)];
    const q = computeQuorum(active, ['0x1', '0x2']);
    expect(q.stakeRatio).toBe(1);
    expect(q.countRatio).toBe(1);
    expect(q.quorumReached).toBe(true);
  });

  it('boundary: exactly 20% stake AND 50% count → reached', () => {
    // 2 of 4 → 50% count. stake [20, 20, 30, 30] = 100. voters [20, 0] → 20%
    const active = [mkV('0xa', 20), mkV('0xb', 20), mkV('0xc', 30), mkV('0xd', 30)];
    const q = computeQuorum(active, ['0xa', '0xb']); // 40% stake, 50% count
    expect(q.countRatio).toBeCloseTo(0.5, 4);
    expect(q.countReached).toBe(true);
    expect(q.stakeReached).toBe(true);
    expect(q.quorumReached).toBe(true);
  });

  it('count reached but stake not → not reached', () => {
    // 50/50 by count but tiny stake on voters
    const active = [mkV('0xa', 1), mkV('0xb', 1), mkV('0xc', 100), mkV('0xd', 100)];
    const q = computeQuorum(active, ['0xa', '0xb']); // 2/4 count = 50%, 2/202 stake ≈ 1%
    expect(q.countReached).toBe(true);
    expect(q.stakeReached).toBe(false);
    expect(q.quorumReached).toBe(false);
  });

  it('case-insensitive vote address match', () => {
    const active = [mkV('0xab', 100)];
    const q = computeQuorum(active, ['0xAB']);
    expect(q.votedCount).toBe(1);
  });

  it('thresholds are documented constants', () => {
    expect(STAKE_THRESHOLD).toBe(0.2);
    expect(COUNT_THRESHOLD).toBe(0.5);
  });
});
