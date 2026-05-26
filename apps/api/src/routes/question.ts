// GET /question?network=...&status=...
// GET /question/{network}/{questionId}
//
// Phase H.3 — we mirror `outcomeMeta.questions` into `outcome_question` so
// questions that HF drops after resolution stay visible in the historical
// view. Trading questions are also served from here (the frontend can choose
// between HF live and indexer).

import { Hono } from 'hono';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { outcomeQuestion } from '@/db/schema';

export const questionRoutes = new Hono();

const ListQuery = z.object({
  network: z.enum(['testnet', 'mainnet']),
  status: z.enum(['trading', 'settled', 'all']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

questionRoutes.get('/', async (c) => {
  const parsed = ListQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    return c.json({ error: 'bad query', details: parsed.error.flatten() }, 400);
  }
  const q = parsed.data;

  const statusFilter =
    q.status === 'trading'
      ? eq(outcomeQuestion.status, 'trading')
      : q.status === 'settled'
        ? inArray(outcomeQuestion.status, ['settled', 'resolved'])
        : undefined;
  const whereExpr = and(
    eq(outcomeQuestion.network, q.network),
    ...(statusFilter ? [statusFilter] : []),
  );

  const rows = await db
    .select()
    .from(outcomeQuestion)
    .where(whereExpr)
    .orderBy(desc(outcomeQuestion.lastSeenAt))
    .limit(q.limit);

  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  return c.json({ rows, snapshotTime: new Date().toISOString() });
});

questionRoutes.get('/:network/:questionId', async (c) => {
  const network = c.req.param('network');
  const idStr = c.req.param('questionId');
  if (network !== 'testnet' && network !== 'mainnet') {
    return c.json({ error: 'bad network' }, 400);
  }
  const qid = Number(idStr);
  if (!Number.isFinite(qid)) return c.json({ error: 'bad questionId' }, 400);

  const row = await db
    .select()
    .from(outcomeQuestion)
    .where(and(eq(outcomeQuestion.network, network), eq(outcomeQuestion.questionId, qid)))
    .limit(1);
  if (row.length === 0) return c.json({ error: 'not found' }, 404);

  c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
  return c.json(row[0]);
});
