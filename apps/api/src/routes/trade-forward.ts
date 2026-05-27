// Phase J.5 — POST /trade-forward
//
// Constitution XI (NON-NEGOTIABLE): the action JSON the user signed must be
// forwarded to HF /exchange byte-for-byte. We never mutate `coin`, `side`,
// `sz`, `px`, `tif`. We only sanity-check the builder field and the type.

import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@/env';
import { requireSession } from '@/routes/auth';
import type { Network } from '@/hf';

export const tradeRoutes = new Hono();

const HF_EXCHANGE = {
  mainnet: 'https://api.hyperliquid.xyz/exchange',
  testnet: 'https://api.hyperliquid-testnet.xyz/exchange',
} as const;

const SignatureRSV = z.object({
  r: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  s: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  v: z.number().int().min(0).max(28),
});

const BuilderField = z.object({
  b: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  f: z.number().int().min(0),
});

/** We accept two action types here:
 *  - `order` — the user is placing a real order (must include builder field).
 *  - `approveBuilderFee` — one-time max-fee approval; no builder field.
 *
 *  Anything else is rejected. We do NOT validate the shape of `orders[]`
 *  or `maxFeeRate` strings — those are HF's responsibility. */
const ActionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('order'),
      builder: BuilderField.optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('approveBuilderFee'),
      builder: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      maxFeeRate: z.string(),
    })
    .passthrough(),
]);

const Body = z.object({
  network: z.enum(['testnet', 'mainnet']),
  action: ActionSchema,
  nonce: z.number().int().positive(),
  signature: SignatureRSV,
  vaultAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional(),
});

function builderAddrFor(network: Network): string {
  return (
    network === 'mainnet' ? env.BUILDER_ADDR_MAINNET : env.BUILDER_ADDR_TESTNET
  ).toLowerCase();
}

tradeRoutes.post('/', async (c) => {
  const sess = await requireSession(c.req.header('cookie') ?? undefined);
  if (!sess) return c.json({ error: 'no session' }, 401);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: 'bad json' }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'bad body', details: parsed.error.flatten() }, 400);
  }
  const { network, action, nonce, signature, vaultAddress } = parsed.data;

  // The session network and the action network must agree.
  if (sess.network !== network) {
    return c.json({ error: 'network mismatch (session ↔ action)' }, 400);
  }

  const expectedBuilder = builderAddrFor(network);
  if (expectedBuilder === '0x0000000000000000000000000000000000000000') {
    return c.json(
      { error: 'builder not configured for this network — set BUILDER_ADDR_*' },
      503,
    );
  }

  // Builder-field policy per action type.
  if (action.type === 'order') {
    if (!action.builder) {
      return c.json({ error: 'order must include builder field' }, 400);
    }
    if (action.builder.b.toLowerCase() !== expectedBuilder) {
      return c.json({ error: 'builder address mismatch' }, 400);
    }
    if (action.builder.f > env.BUILDER_MAX_FEE_TENTHS_BPS) {
      return c.json(
        {
          error: `builder fee too high (max ${env.BUILDER_MAX_FEE_TENTHS_BPS} tenths-bps)`,
        },
        400,
      );
    }
  } else if (action.type === 'approveBuilderFee') {
    if (action.builder.toLowerCase() !== expectedBuilder) {
      return c.json({ error: 'approveBuilderFee builder mismatch' }, 400);
    }
  }

  // Forward to HF /exchange byte-for-byte. We pass `action` through without
  // touching any field; only the envelope keys (nonce, signature, vaultAddress)
  // are repacked the way HF expects.
  const body = JSON.stringify({
    action,
    nonce,
    signature,
    vaultAddress: vaultAddress ?? null,
  });

  let hfRes: Response;
  try {
    hfRes = await fetch(HF_EXCHANGE[network], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (e) {
    console.warn('[trade-forward] HF unreachable', (e as Error).message);
    return c.json({ error: 'HF unreachable' }, 502);
  }

  const responseText = await hfRes.text();

  // Audit log — minimal, file log (no separate BI in this personal project).
  console.info(
    '[trade-forward]',
    new Date().toISOString(),
    'addr=',
    sess.address.slice(0, 10),
    'type=',
    action.type,
    'fee=',
    action.type === 'order' ? action.builder?.f : 'n/a',
    'hfStatus=',
    hfRes.status,
  );

  // Mirror HF's content-type + status. We don't decode/re-encode the body,
  // so any HF schema change flows through without us silently dropping fields.
  c.header('Content-Type', hfRes.headers.get('content-type') ?? 'application/json');
  return c.body(responseText, hfRes.status as 200 | 400 | 401 | 422 | 500);
});
