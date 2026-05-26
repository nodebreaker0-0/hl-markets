// validatorSummaries → snapshot per minute. We don't bother dedup'ing
// snapshots; the table is small enough to keep timeseries.

import { db } from '@/db/client';
import { validatorSnapshot } from '@/db/schema';
import { fetchValidatorSummaries, type Network } from '@/hf';

export async function runValidators(network: Network, nowMs: number): Promise<number> {
  const summaries = await fetchValidatorSummaries(network);
  if (summaries.length === 0) return 0;

  // Bulk insert via individual upsert calls — small N (~100), trivial.
  for (const v of summaries) {
    await db
      .insert(validatorSnapshot)
      .values({
        network,
        validator: v.validator.toLowerCase(),
        signer: v.signer.toLowerCase(),
        name: v.name,
        description: v.description ?? null,
        stake: String(v.stake),
        isActive: v.isActive,
        isJailed: v.isJailed,
        commission: v.commission,
        snapshotTs: BigInt(nowMs),
      })
      .onConflictDoNothing();
  }
  return summaries.length;
}
