// Phase J.2 — chat REST.
//   GET    /chat?network=&marketKey=&before=&limit=
//   DELETE /chat/:id    (author OR chat_admin)
//
// WebSocket /chat/ws lives in routes/chat-ws.ts; the two share `roomKey` /
// gate logic via `lib/chat/gates.ts`.

import { Hono } from 'hono';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { chatMessage, chatAdmin } from '@/db/schema';
import { requireSession } from '@/routes/auth';

export const chatRoutes = new Hono();

const ListQuery = z.object({
  network: z.enum(['testnet', 'mainnet']),
  marketKey: z.string().regex(/^[oq]:\d+$/),
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

interface MessageView {
  id: string;
  address: string;
  body: string;
  signedAt: number;
  deleted: boolean;
}

function toView(row: typeof chatMessage.$inferSelect): MessageView {
  if (row.deletedAt !== null) {
    return { id: row.id, address: '', body: '', signedAt: Number(row.signedAt), deleted: true };
  }
  return {
    id: row.id,
    address: row.address,
    body: row.body,
    signedAt: Number(row.signedAt),
    deleted: false,
  };
}

chatRoutes.get('/', async (c) => {
  const parsed = ListQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) return c.json({ error: 'bad query', details: parsed.error.flatten() }, 400);
  const q = parsed.data;

  const where = q.before
    ? and(
        eq(chatMessage.network, q.network),
        eq(chatMessage.marketKey, q.marketKey),
        lt(chatMessage.id, q.before),
      )
    : and(eq(chatMessage.network, q.network), eq(chatMessage.marketKey, q.marketKey));

  const rows = await db
    .select()
    .from(chatMessage)
    .where(where)
    .orderBy(desc(chatMessage.id))
    .limit(q.limit);

  // newest at bottom for the client — reverse here so caller can append directly.
  const messages = rows.slice().reverse().map(toView);
  const nextBefore = rows.length === q.limit ? rows[rows.length - 1]?.id ?? null : null;

  c.header('Cache-Control', 'public, max-age=2, stale-while-revalidate=10');
  return c.json({ messages, nextBefore });
});

chatRoutes.delete('/:id', async (c) => {
  const sess = await requireSession(c.req.header('cookie') ?? undefined);
  if (!sess) return c.json({ error: 'no session' }, 401);

  const id = c.req.param('id');
  const rows = await db.select().from(chatMessage).where(eq(chatMessage.id, id)).limit(1);
  const row = rows[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  if (row.deletedAt !== null) return c.body(null, 204);

  const isAuthor = row.address === sess.address;
  let isAdmin = false;
  if (!isAuthor) {
    const a = await db
      .select()
      .from(chatAdmin)
      .where(eq(chatAdmin.address, sess.address))
      .limit(1);
    isAdmin = a.length > 0;
  }
  if (!isAuthor && !isAdmin) return c.json({ error: 'forbidden' }, 403);

  await db
    .update(chatMessage)
    .set({ deletedAt: BigInt(Date.now()) })
    .where(and(eq(chatMessage.id, id), isNull(chatMessage.deletedAt)));

  return c.body(null, 204);
});
