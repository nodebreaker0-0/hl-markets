// Phase J.1 — EIP-712 sign-in.
//
//   GET  /auth/nonce       → { nonce, expiresAt }   (5 min TTL, single use)
//   POST /auth/sign-in     → { address, expiresAt } + Set-Cookie hlm_session=<jwt>
//   POST /auth/sign-out    → 204 + cleared cookie
//   GET  /auth/me          → { address, network, expiresAt }   (401 when unauth)
//
// The wire format is exactly what `contracts/api.md` §5.1 documents. EIP-712
// recovery uses viem; the JWT is HS256 issued by hono/jwt.

import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { recoverTypedDataAddress, type TypedDataDomain } from 'viem';
import { z } from 'zod';
import { ulid } from 'ulid';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db/client';
import { chatSession } from '@/db/schema';
import { env } from '@/env';

// We DO NOT use JWT here. The cookie holds the chat_session.id (a ULID)
// directly. Every authenticated request reads that id, looks up the row,
// and checks `expires_at > now() AND revoked_at IS NULL`. The DB is already
// the source of truth for revocation, so JWT's stateless win didn't apply.
// This also removes the secret-rotation footgun that broke us in dev.

export const authRoutes = new Hono();

// ---- nonce store (in-memory, 5 min TTL) ---------------------------------
// In-memory because (a) single-process backend, (b) nonces are tiny + cheap
// to regenerate. If we ever scale beyond one node, move this to Redis or to
// a `chat_nonce` Postgres table.

interface NonceEntry {
  expiresAt: number;
}

const NONCE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 24 * 60 * 60_000;
const COOKIE_NAME = 'hlm_session';

const nonces = new Map<string, NonceEntry>();

function gcNonces(): void {
  const now = Date.now();
  for (const [k, v] of nonces) {
    if (v.expiresAt <= now) nonces.delete(k);
  }
}

function newNonce(): { nonce: string; expiresAt: number } {
  gcNonces();
  const nonce = `${Date.now().toString(36)}-${ulid()}`;
  const expiresAt = Date.now() + NONCE_TTL_MS;
  nonces.set(nonce, { expiresAt });
  return { nonce, expiresAt };
}

/** Consume the nonce — returns true if it was a valid live one. */
function takeNonce(nonce: string): boolean {
  gcNonces();
  const entry = nonces.get(nonce);
  if (!entry || entry.expiresAt <= Date.now()) return false;
  nonces.delete(nonce);
  return true;
}

// ---- EIP-712 typed data ------------------------------------------------

const TYPES = {
  SignIn: [
    { name: 'address', type: 'address' },
    { name: 'network', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint64' },
  ],
} as const;

function domainFor(chainId: number): TypedDataDomain {
  return {
    name: 'hl-markets',
    version: '1',
    chainId,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };
}

/** Build the Set-Cookie header value explicitly. The cookie value is just
 *  the chat_session.id (ULID) — verification is a DB lookup, not a JWT. */
function buildSetCookie(sessionId: string): string {
  const parts = [
    `${COOKIE_NAME}=${sessionId}`,
    `Max-Age=${SESSION_TTL_MS / 1000}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (env.COOKIE_SECURE) parts.push('Secure');
  return parts.join('; ');
}

/** Look up a live session by cookie id. Returns null when missing/revoked/expired. */
async function lookupSession(
  sessionId: string,
): Promise<{ id: string; address: string; network: 'testnet' | 'mainnet' } | null> {
  const rows = await db
    .select()
    .from(chatSession)
    .where(and(eq(chatSession.id, sessionId), gt(chatSession.expiresAt, BigInt(Date.now()))))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt !== null) return null;
  if (row.network !== 'testnet' && row.network !== 'mainnet') return null;
  return { id: row.id, address: row.address, network: row.network };
}

// ---- Routes -------------------------------------------------------------

authRoutes.get('/nonce', (c) => {
  const { nonce, expiresAt } = newNonce();
  c.header('Cache-Control', 'no-store');
  return c.json({ nonce, expiresAt });
});

const SignInBody = z.object({
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'address must be 0x-prefixed 40 hex')
    .transform((s) => s.toLowerCase() as `0x${string}`),
  network: z.enum(['testnet', 'mainnet']),
  nonce: z.string().min(8).max(128),
  issuedAt: z.number().int().positive(),
  /** Wallet's active chain at sign time — included in the EIP-712 domain. */
  chainId: z.number().int().positive(),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, 'signature must be 0x + 130 hex'),
});

authRoutes.post('/sign-in', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad json' }, 400);
  }
  const parsed = SignInBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad body', details: parsed.error.flatten() }, 400);
  }
  const { address, network, nonce, issuedAt, chainId, signature } = parsed.data;

  // issuedAt sanity: 5 min skew allowed both ways.
  const drift = Math.abs(issuedAt - Date.now());
  if (drift > NONCE_TTL_MS) {
    return c.json({ error: 'issuedAt drift too large' }, 401);
  }

  // Consume nonce — single use.
  if (!takeNonce(nonce)) {
    return c.json({ error: 'nonce invalid or expired' }, 401);
  }

  // Recover signer.
  let recovered: string;
  try {
    recovered = await recoverTypedDataAddress({
      domain: domainFor(chainId),
      types: TYPES,
      primaryType: 'SignIn',
      message: { address, network, nonce, issuedAt: BigInt(issuedAt) },
      signature: signature as `0x${string}`,
    });
  } catch {
    return c.json({ error: 'signature verification failed' }, 401);
  }
  if (recovered.toLowerCase() !== address) {
    return c.json({ error: 'signer mismatch' }, 401);
  }

  // Persist session.
  const id = ulid();
  const now = BigInt(Date.now());
  const expiresAt = BigInt(Date.now() + SESSION_TTL_MS);
  await db.insert(chatSession).values({
    id,
    address,
    network,
    nonce,
    issuedAt: now,
    expiresAt,
    lastSeenAt: now,
  });

  // Cookie value = session id (ULID). Server-side DB lookup is the auth check.
  c.header('Set-Cookie', buildSetCookie(id));

  return c.json({ address, expiresAt: Number(expiresAt) });
});

authRoutes.post('/sign-out', async (c) => {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (sessionId) {
    await db
      .update(chatSession)
      .set({ revokedAt: BigInt(Date.now()) })
      .where(eq(chatSession.id, sessionId));
  }
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  return c.body(null, 204);
});

authRoutes.get('/me', async (c) => {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (!sessionId) {
    return c.json({ error: 'no session' }, 401);
  }
  const sess = await lookupSession(sessionId);
  if (!sess) {
    console.warn('[auth/me] session lookup failed for id prefix:', sessionId.slice(0, 10));
    deleteCookie(c, COOKIE_NAME, { path: '/' });
    return c.json({ error: 'session revoked' }, 401);
  }

  // Touch lastSeenAt — cheap, useful for cleanup cron.
  await db
    .update(chatSession)
    .set({ lastSeenAt: BigInt(Date.now()) })
    .where(eq(chatSession.id, sess.id));

  // Re-read expires for the response. (Could have piggy-backed on lookupSession;
  // small extra select is fine here.)
  const rows = await db
    .select({ expiresAt: chatSession.expiresAt })
    .from(chatSession)
    .where(eq(chatSession.id, sess.id))
    .limit(1);

  return c.json({
    address: sess.address,
    network: sess.network,
    expiresAt: Number(rows[0]?.expiresAt ?? 0),
  });
});

/** Shared helper for other routes that need the current session.
 *  Returns null when unauthenticated. */
export async function requireSession(
  cookieHeader: string | undefined,
): Promise<{ address: string; network: 'testnet' | 'mainnet'; id: string } | null> {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const sess = await lookupSession(m[1]!);
  return sess;
}
