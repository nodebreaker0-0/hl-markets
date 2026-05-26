// App entry — Hono HTTP server + in-process node-cron indexer.

import '@/bigint-json'; // BigInt.prototype.toJSON polyfill — must be first import
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import cron from 'node-cron';
import { env } from '@/env';
import { health } from '@/routes/health';
import { governanceRoutes } from '@/routes/governance';
import { outcomeRoutes } from '@/routes/outcome';
import { questionRoutes } from '@/routes/question';
import { runIndexerOnce } from '@/indexer/run';
import { closeDb } from '@/db/client';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: env.ALLOWED_ORIGINS,
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['Content-Type'],
    maxAge: 600,
  }),
);

app.route('/health', health);
app.route('/governance', governanceRoutes);
app.route('/outcome', outcomeRoutes);
app.route('/question', questionRoutes);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error('[unhandled]', err);
  return c.json({ error: 'internal' }, 500);
});

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.info(`[hl-markets-api] listening on http://0.0.0.0:${info.port}`);
  },
);

// Indexer cron — runs in same Node process. INDEXER_ENABLED=false in test envs.
if (env.INDEXER_ENABLED) {
  // Kick off one immediate run so a fresh DB has data within seconds.
  runIndexerOnce().catch((e) => console.error('[indexer initial] error:', e));

  cron.schedule(env.INDEXER_INTERVAL_CRON, () => {
    runIndexerOnce().catch((e) => console.error('[indexer cron] error:', e));
  });
  console.info(`[indexer] cron scheduled: ${env.INDEXER_INTERVAL_CRON}`);
} else {
  console.info('[indexer] disabled (INDEXER_ENABLED=false)');
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.info(`[shutdown] ${signal}`);
  server.close();
  await closeDb();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
