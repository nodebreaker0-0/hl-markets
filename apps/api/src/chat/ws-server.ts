// Phase J.2 — WebSocket server attached to the same http.Server as Hono.
// Wire format: see specs/001-hl-markets/contracts/chat-protocol.md.
//
// One `WebSocketServer` instance with `noServer: true` — we manually call
// `wss.handleUpgrade` from the http server's `upgrade` event so Hono and WS
// share a port.
//
// Rooms: `Map<roomKey, Set<WebSocket>>` where roomKey = `${network}:${marketKey}`.

import { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { ulid } from 'ulid';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { chatMessage, chatAdmin } from '@/db/schema';
import { requireSession } from '@/routes/auth';
import { moderate, MAX_LEN } from '@/chat/automod';
import { takeRateLimit } from '@/chat/rate-limit';
import { getPosition } from '@/chat/position';
import type { Network } from '@/hf';

const MIN_POSITION_NOTIONAL_USD = 1;
const MAX_SOCKETS_PER_ADDR_PER_ROOM = 5;
const PROTOCOL_VERSION = 1;
const HEARTBEAT_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 10_000;

type RoomKey = string; // `${network}:${marketKey}`

interface ConnMeta {
  session: { address: string; network: Network; id: string } | null;
  roomKey: RoomKey;
  network: Network;
  marketKey: string;
  pingedAt: number | null;
  alive: boolean;
}

const rooms = new Map<RoomKey, Set<WebSocket>>();
const metas = new WeakMap<WebSocket, ConnMeta>();

function roomKeyFor(network: Network, marketKey: string): RoomKey {
  return `${network}:${marketKey}`;
}

function addToRoom(ws: WebSocket, key: RoomKey): void {
  let room = rooms.get(key);
  if (!room) {
    room = new Set();
    rooms.set(key, room);
  }
  room.add(ws);
}

function removeFromRoom(ws: WebSocket, key: RoomKey): void {
  const room = rooms.get(key);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) rooms.delete(key);
}

function broadcast(key: RoomKey, frame: unknown): void {
  const room = rooms.get(key);
  if (!room) return;
  const txt = JSON.stringify(frame);
  for (const sock of room) {
    if (sock.readyState === WebSocket.OPEN) sock.send(txt);
  }
}

function send(ws: WebSocket, frame: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
}

// ---- Bouncer for the upgrade --------------------------------------------

function parseUpgradeUrl(rawUrl: string): { network: Network; marketKey: string } | null {
  const url = new URL(rawUrl, 'http://x'); // dummy base
  if (url.pathname !== '/chat/ws') return null;
  const net = url.searchParams.get('network');
  const mk = url.searchParams.get('marketKey');
  if (net !== 'testnet' && net !== 'mainnet') return null;
  if (!mk || !/^[oq]:\d+$/.test(mk)) return null;
  return { network: net, marketKey: mk };
}

async function loadHistoryForHello(network: Network, marketKey: string): Promise<unknown[]> {
  const rows = await db
    .select()
    .from(chatMessage)
    .where(and(eq(chatMessage.network, network), eq(chatMessage.marketKey, marketKey)))
    .orderBy(desc(chatMessage.id))
    .limit(50);
  return rows
    .slice()
    .reverse()
    .map((r) =>
      r.deletedAt !== null
        ? { id: r.id, address: '', body: '', signedAt: Number(r.signedAt), deleted: true }
        : {
            id: r.id,
            address: r.address,
            body: r.body,
            signedAt: Number(r.signedAt),
            deleted: false,
          },
    );
}

async function isAdmin(address: string): Promise<boolean> {
  const rows = await db.select().from(chatAdmin).where(eq(chatAdmin.address, address)).limit(1);
  return rows.length > 0;
}

// ---- Per-socket lifecycle ------------------------------------------------

async function handleOpen(ws: WebSocket, meta: ConnMeta): Promise<void> {
  // Enforce socket cap per (address, room).
  if (meta.session) {
    const room = rooms.get(meta.roomKey);
    if (room) {
      let mine = 0;
      for (const s of room) {
        const m = metas.get(s);
        if (m?.session?.address === meta.session.address) mine++;
      }
      if (mine >= MAX_SOCKETS_PER_ADDR_PER_ROOM) {
        send(ws, { type: 'ERROR', code: 'too_many_sockets' });
        ws.close(4002, 'too many sockets');
        return;
      }
    }
  }

  addToRoom(ws, meta.roomKey);

  let history: unknown[] = [];
  try {
    history = await loadHistoryForHello(meta.network, meta.marketKey);
  } catch (e) {
    console.warn('[chat/ws] history load failed', (e as Error).message);
  }

  send(ws, {
    type: 'SERVER_HELLO',
    v: PROTOCOL_VERSION,
    roomKey: meta.roomKey,
    you: meta.session ? { address: meta.session.address } : null,
    history,
    rateLimit: { windowSec: 60, max: 10 },
  });
}

async function handleSend(ws: WebSocket, meta: ConnMeta, frame: SendFrame): Promise<void> {
  const clientNonce = typeof frame.clientNonce === 'string' ? frame.clientNonce : '';
  const sess = meta.session;
  if (!sess) {
    send(ws, { type: 'ERROR', code: 'no_auth', clientNonce });
    return;
  }

  // Length / automod first (cheap, no IO).
  const mod = moderate(frame.body ?? '');
  if (!mod.ok) {
    send(ws, { type: 'ERROR', code: mod.code, message: mod.message, clientNonce });
    return;
  }

  // Rate limit.
  const rl = takeRateLimit(sess.address, meta.marketKey);
  if (!rl.ok) {
    send(ws, {
      type: 'ERROR',
      code: 'rate_limited',
      message: `slow down (~${Math.ceil(rl.retryAfterMs / 1000)}s)`,
      clientNonce,
    });
    return;
  }

  // Position gate — chat_admin members bypass (they need to moderate any
  // market regardless of whether they have a position).
  const admin = await isAdmin(sess.address);
  if (!admin) {
    try {
      const snap = await getPosition(meta.network, sess.address, meta.marketKey);
      if (snap.notional < MIN_POSITION_NOTIONAL_USD) {
        send(ws, {
          type: 'ERROR',
          code: 'no_position',
          message: 'Minimum $1 position required to chat in this market',
          clientNonce,
        });
        return;
      }
    } catch (e) {
      console.warn('[chat/ws] position check failed', (e as Error).message);
      send(ws, { type: 'ERROR', code: 'no_position', clientNonce });
      return;
    }
  }

  // Persist + broadcast.
  const id = ulid();
  const signedAt = BigInt(Date.now());
  const body = (frame.body ?? '').trim();
  try {
    await db.insert(chatMessage).values({
      id,
      network: meta.network,
      marketKey: meta.marketKey,
      address: sess.address,
      body,
      signedAt,
    });
  } catch (e) {
    console.warn('[chat/ws] insert failed', (e as Error).message);
    send(ws, { type: 'ERROR', code: 'server', clientNonce });
    return;
  }

  send(ws, { type: 'ACK', clientNonce, id, signedAt: Number(signedAt) });
  broadcast(meta.roomKey, {
    type: 'BROADCAST',
    message: {
      id,
      address: sess.address,
      body,
      signedAt: Number(signedAt),
    },
  });
}

async function handleDelete(ws: WebSocket, meta: ConnMeta, frame: DeleteFrame): Promise<void> {
  const sess = meta.session;
  if (!sess) {
    send(ws, { type: 'ERROR', code: 'no_auth' });
    return;
  }
  const id = typeof frame.id === 'string' ? frame.id : '';
  if (!id) {
    send(ws, { type: 'ERROR', code: 'bad_frame' });
    return;
  }
  const rows = await db.select().from(chatMessage).where(eq(chatMessage.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.deletedAt !== null) return;

  let allowed = row.address === sess.address;
  if (!allowed) allowed = await isAdmin(sess.address);
  if (!allowed) {
    send(ws, { type: 'ERROR', code: 'forbidden' });
    return;
  }
  await db
    .update(chatMessage)
    .set({ deletedAt: BigInt(Date.now()) })
    .where(eq(chatMessage.id, id));

  broadcast(meta.roomKey, { type: 'BROADCAST_DELETED', id, by: sess.address });
}

// ---- Frame types --------------------------------------------------------

interface SendFrame {
  type: 'SEND';
  body?: string;
  clientNonce?: string;
}
interface DeleteFrame {
  type: 'DELETE';
  id?: string;
}
interface PingFrame {
  type: 'PING';
}
interface HelloFrame {
  type: 'CLIENT_HELLO';
  v?: number;
}

type InFrame = SendFrame | DeleteFrame | PingFrame | HelloFrame | { type: string };

// ---- Public start fn ----------------------------------------------------

export function startChatWs(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req: IncomingMessage, socket, head) => {
    if (!req.url) return socket.destroy();
    const parsed = parseUpgradeUrl(req.url);
    if (!parsed) return socket.destroy();

    const sess = await requireSession(req.headers.cookie);

    wss.handleUpgrade(req, socket, head, (ws) => {
      const meta: ConnMeta = {
        session: sess,
        roomKey: roomKeyFor(parsed.network, parsed.marketKey),
        network: parsed.network,
        marketKey: parsed.marketKey,
        pingedAt: null,
        alive: true,
      };
      metas.set(ws, meta);
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    const meta = metas.get(ws);
    if (!meta) {
      ws.close(4400, 'bad upgrade');
      return;
    }
    void handleOpen(ws, meta);

    ws.on('message', async (raw: RawData) => {
      // RawData is Buffer | ArrayBuffer | Buffer[]; stringify once and bound on string size.
      const text = raw.toString();
      if (text.length > MAX_LEN + 1024) {
        send(ws, { type: 'ERROR', code: 'bad_frame', message: 'frame too large' });
        return;
      }
      let frame: InFrame;
      try {
        frame = JSON.parse(text) as InFrame;
      } catch {
        send(ws, { type: 'ERROR', code: 'bad_frame' });
        return;
      }
      switch (frame.type) {
        case 'CLIENT_HELLO':
          // already sent SERVER_HELLO on open; ignore.
          return;
        case 'PING':
          send(ws, { type: 'PONG' });
          return;
        case 'SEND':
          await handleSend(ws, meta, frame as SendFrame);
          return;
        case 'DELETE':
          await handleDelete(ws, meta, frame as DeleteFrame);
          return;
        default:
          send(ws, { type: 'ERROR', code: 'bad_frame' });
      }
    });

    ws.on('pong', () => {
      const m = metas.get(ws);
      if (m) m.alive = true;
    });

    ws.on('close', () => {
      const m = metas.get(ws);
      if (m) removeFromRoom(ws, m.roomKey);
    });
  });

  // Heartbeat — terminate sockets that don't pong.
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const m = metas.get(ws);
      if (!m) return ws.terminate();
      if (!m.alive) return ws.terminate();
      m.alive = false;
      ws.ping();
      m.pingedAt = Date.now();
    });
  }, HEARTBEAT_INTERVAL_MS);
  interval.unref?.();

  wss.on('close', () => clearInterval(interval));

  console.info('[chat/ws] websocket server attached at /chat/ws');
  void PING_TIMEOUT_MS; // currently unused literal, kept for tuning
}
