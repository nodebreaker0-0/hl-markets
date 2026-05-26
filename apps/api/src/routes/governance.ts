// GET /governance?network=...&status=...&variant=...&limit=...
// GET /governance/{network}/{govId}

import { Hono } from 'hono';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { governance, voteSnapshot } from '@/db/schema';

interface LatestSnap {
  voters: string[];
  quorumReached: boolean;
  snapshotTs: bigint;
}

/** Fetch the latest vote_snapshot per (network, govId) for a list of govIds.
 *  Done as a single inArray select + in-memory dedup so we don't need a
 *  distinct-on raw SQL escape hatch. List endpoints cap at limit=200, so the
 *  vote_snapshot count fetched here is bounded by 200 * (snapshots per gov). */
async function latestSnapshotsByGovId(
  network: 'testnet' | 'mainnet',
  govIds: string[],
): Promise<Map<string, LatestSnap>> {
  const out = new Map<string, LatestSnap>();
  if (govIds.length === 0) return out;
  const snaps = await db
    .select()
    .from(voteSnapshot)
    .where(and(eq(voteSnapshot.network, network), inArray(voteSnapshot.govId, govIds)));
  for (const s of snaps) {
    const prev = out.get(s.govId);
    if (!prev || s.snapshotTs > prev.snapshotTs) {
      out.set(s.govId, {
        voters: s.voters as string[],
        quorumReached: s.quorumReached,
        snapshotTs: s.snapshotTs,
      });
    }
  }
  return out;
}

export const governanceRoutes = new Hono();

const ListQuery = z.object({
  network: z.enum(['testnet', 'mainnet']),
  status: z.enum(['pending', 'historical', 'all']).optional().default('pending'),
  variant: z.enum(['outcome', 'delisting', 'unknown']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

governanceRoutes.get('/', async (c) => {
  const parsed = ListQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    return c.json({ error: 'bad query', details: parsed.error.flatten() }, 400);
  }
  const q = parsed.data;

  const statusFilter =
    q.status === 'pending'
      ? eq(governance.status, 'pending')
      : q.status === 'historical'
        ? inArray(governance.status, ['settled', 'expired'])
        : undefined;

  const variantFilter = q.variant ? eq(governance.variant, q.variant) : undefined;
  const networkFilter = eq(governance.network, q.network);

  // network is always present; status/variant are optional.
  const whereExpr = and(
    networkFilter,
    ...[statusFilter, variantFilter].filter((c): c is NonNullable<typeof c> => Boolean(c)),
  );

  const rows = await db
    .select()
    .from(governance)
    .where(whereExpr)
    .orderBy(desc(governance.firstSeenAt))
    .limit(q.limit);

  const latest = await latestSnapshotsByGovId(
    q.network,
    rows.map((r) => r.govId),
  );

  // Merge latest vote_snapshot.voters/quorumReached into each row so the
  // frontend list can render a card without a second round-trip.
  const merged = rows.map((r) => {
    const l = latest.get(r.govId);
    return {
      ...r,
      latestVotes: l?.voters ?? [],
      latestQuorumReached: l?.quorumReached ?? false,
      latestSnapshotTs: l?.snapshotTs ?? null,
    };
  });

  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  return c.json({
    rows: merged,
    snapshotTime: new Date().toISOString(),
  });
});

governanceRoutes.get('/:network/:govId', async (c) => {
  const network = c.req.param('network');
  const govId = c.req.param('govId');
  if (network !== 'testnet' && network !== 'mainnet') {
    return c.json({ error: 'bad network' }, 400);
  }

  const row = await db
    .select()
    .from(governance)
    .where(and(eq(governance.network, network), eq(governance.govId, govId)))
    .limit(1);

  if (row.length === 0) return c.json({ error: 'not found' }, 404);

  const timeline = await db
    .select()
    .from(voteSnapshot)
    .where(and(eq(voteSnapshot.network, network), eq(voteSnapshot.govId, govId)))
    .orderBy(voteSnapshot.snapshotTs);

  c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
  return c.json({
    ...row[0],
    timeline: timeline.map((t) => ({
      ts: Number(t.snapshotTs),
      voters: t.voters,
      quorumReached: t.quorumReached,
    })),
  });
});
