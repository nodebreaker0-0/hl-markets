// GET /outcome?network=...
// GET /outcome/{network}/{outcomeId}

import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { outcomeMarket } from '@/db/schema';

export const outcomeRoutes = new Hono();

outcomeRoutes.get('/', async (c) => {
  const network = c.req.query('network');
  if (network !== 'testnet' && network !== 'mainnet') {
    return c.json({ error: 'bad network' }, 400);
  }
  const rows = await db
    .select()
    .from(outcomeMarket)
    .where(eq(outcomeMarket.network, network))
    .orderBy(desc(outcomeMarket.lastSeenAt))
    .limit(200);

  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  return c.json({ rows, snapshotTime: new Date().toISOString() });
});

outcomeRoutes.get('/:network/:outcomeId', async (c) => {
  const network = c.req.param('network');
  const outcomeIdStr = c.req.param('outcomeId');
  if (network !== 'testnet' && network !== 'mainnet') {
    return c.json({ error: 'bad network' }, 400);
  }
  const outcomeId = Number(outcomeIdStr);
  if (!Number.isFinite(outcomeId)) return c.json({ error: 'bad outcomeId' }, 400);

  const row = await db
    .select()
    .from(outcomeMarket)
    .where(and(eq(outcomeMarket.network, network), eq(outcomeMarket.outcomeId, outcomeId)))
    .limit(1);

  if (row.length === 0) return c.json({ error: 'not found' }, 404);

  c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
  return c.json(row[0]);
});
