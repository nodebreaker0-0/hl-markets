// One indexer pass for governance lifecycle on one network.
// - Fetch validatorL1Votes
// - Upsert each into `governance` + append `vote_snapshot`
// - Detect rows that disappeared from HF response → mark settled/expired

import { db } from '@/db/client';
import { governance, voteSnapshot } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { fetchValidatorL1Votes, type Network } from '@/hf';
import { computeGovId } from './govId';

type Variant = 'outcome' | 'delisting' | 'unknown';
const KNOWN: Record<string, Variant> = { O: 'outcome', D: 'delisting' };

function classify(action: { type: string; [k: string]: unknown }) {
  const innerKey = Object.keys(action).find((k) => k !== 'type') ?? null;
  const known = innerKey ? KNOWN[innerKey] : undefined;
  const variant: Variant = known ?? 'unknown';
  return { variant, innerKey };
}

export async function runGovernance(network: Network, nowMs: number): Promise<{
  upserted: number;
  marked: number;
}> {
  const rows = await fetchValidatorL1Votes(network);

  const seen = new Set<string>();
  let upserted = 0;

  for (const r of rows) {
    const action = { type: 'validatorL1Vote' as const, ...r.action };
    const govId = computeGovId(action);
    const { variant, innerKey } = classify(action);

    seen.add(govId);

    // Upsert governance row
    await db
      .insert(governance)
      .values({
        network,
        govId,
        action,
        variant,
        innerKey,
        expireTime: BigInt(r.expireTime),
        status: 'pending',
        firstSeenAt: BigInt(nowMs),
        lastSeenAt: BigInt(nowMs),
      })
      .onConflictDoUpdate({
        target: [governance.network, governance.govId],
        set: {
          lastSeenAt: BigInt(nowMs),
          // expireTime can shift if HF re-emits; keep latest
          expireTime: BigInt(r.expireTime),
          // a row that re-appears as pending after being marked settled is rare;
          // we don't auto-revert status here. Set status=pending only on insert.
        },
      });

    // Append a vote snapshot for this minute
    await db
      .insert(voteSnapshot)
      .values({
        network,
        govId,
        snapshotTs: BigInt(nowMs),
        voters: r.votes,
        quorumReached: r.quorumReached,
      })
      .onConflictDoNothing();

    upserted++;
  }

  // Detect missing pending → mark settled vs expired
  // (a row that was pending in DB but missing from HF response this tick)
  const pendings = await db
    .select({
      govId: governance.govId,
      expireTime: governance.expireTime,
    })
    .from(governance)
    .where(and(eq(governance.network, network), eq(governance.status, 'pending')));

  let marked = 0;
  for (const p of pendings) {
    if (seen.has(p.govId)) continue;
    const expired = Number(p.expireTime) <= nowMs;
    await db
      .update(governance)
      .set({
        status: expired ? 'expired' : 'settled',
        settledAt: BigInt(nowMs),
      })
      .where(and(eq(governance.network, network), eq(governance.govId, p.govId)));
    marked++;
  }

  return { upserted, marked };
}
