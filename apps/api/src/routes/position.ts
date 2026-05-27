// Phase J.4 — /position?network=&address=&marketKey=
// Public (HF data is public). Server-side 30s cache shared with the WS gate.

import { Hono } from 'hono';
import { z } from 'zod';
import { getPosition } from '@/chat/position';

export const positionRoutes = new Hono();

const Q = z.object({
  network: z.enum(['testnet', 'mainnet']),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  marketKey: z.string().regex(/^[oq]:\d+$/),
});

positionRoutes.get('/', async (c) => {
  const parsed = Q.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: 'bad query', details: parsed.error.flatten() }, 400);
  const { network, address, marketKey } = parsed.data;
  const snap = await getPosition(network, address.toLowerCase(), marketKey);
  c.header('Cache-Control', 'public, max-age=15');
  return c.json({
    side: snap.side,
    shares: snap.shares,
    notional: snap.notional,
    holdings: snap.holdings,
    lastFetchedAt: snap.lastFetchedAt,
  });
});
