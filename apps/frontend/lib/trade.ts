// Phase J.5 — build + sign HL L1 actions (`order`, `approveBuilderFee`),
// then POST them via the backend `/trade-forward` route (which forwards them
// to HF `/exchange` byte-for-byte — Constitution XI).
//
// Two action types here:
//   - approveBuilderFee — one-time per builder, per user, per network.
//   - order — actual trade with `builder` field attached.

import { actionHash, phantomAgent, l1Payload } from '@/lib/signing';
import {
  ensureHLPhantomChain,
  signTypedData,
} from '@/lib/wallet/metamask';
import { CURRENT_NETWORK, type Network } from '@/lib/network';
import { getBuilderConfig } from '@/lib/builder';

const API_BASE: string =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_API_BASE as string | undefined)) ||
  'http://localhost:3001';

// ---- Action shapes ------------------------------------------------------

export interface OrderLeg {
  /** HL asset id — integer. For outcome markets this needs to be resolved
   *  from the `#NNNN` asset key via HF `meta` / `spotMeta`. Phase J.5 R&D. */
  a: number;
  /** isBuy. */
  b: boolean;
  /** Price as a decimal string (HL convention). */
  p: string;
  /** Size as a decimal string. */
  s: string;
  /** Reduce-only. */
  r: boolean;
  /** Time-in-force / order type. */
  t: { limit: { tif: 'Ioc' | 'Gtc' | 'Alo' } };
}

export interface OrderAction {
  type: 'order';
  orders: OrderLeg[];
  grouping: 'na' | 'normalTpsl' | 'positionTpsl';
  builder: { b: `0x${string}`; f: number };
}

export interface ApproveBuilderFeeAction {
  type: 'approveBuilderFee';
  /** "0.01%" — percent string as HL expects. */
  maxFeeRate: string;
  builder: `0x${string}`;
}

// ---- Sign helper --------------------------------------------------------

interface SignatureRSV {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
}

function splitSignature(sig: string): SignatureRSV {
  if (!sig.startsWith('0x') || sig.length !== 132) {
    throw new Error(`bad signature hex length: ${sig.length}`);
  }
  const r = ('0x' + sig.slice(2, 66)) as `0x${string}`;
  const s = ('0x' + sig.slice(66, 130)) as `0x${string}`;
  const v = parseInt(sig.slice(130, 132), 16);
  return { r, s, v };
}

async function signL1Action(
  address: `0x${string}`,
  action: object,
  nonce: bigint,
  network: Network,
): Promise<SignatureRSV> {
  // 1. action hash (msgpack + nonce + vault + expires)
  const digest = actionHash(action, nonce, null, null);
  // 2. phantom agent ({source: 'a' mainnet | 'b' testnet, connectionId: digest})
  const pa = phantomAgent(digest, network === 'mainnet');
  // 3. typed data with chainId 1337
  const typed = l1Payload(pa);
  // 4. wallet must be on 1337 to sign this domain
  await ensureHLPhantomChain();
  // 5. sign
  const sigHex = await signTypedData(address, typed);
  return splitSignature(sigHex);
}

// ---- Public API ---------------------------------------------------------

export interface SignAndSendArgs {
  address: `0x${string}`;
}

/** Submit an HL L1 action via /trade-forward. Returns whatever HF returns
 *  (status passes through, body is JSON or error text). */
async function submitForward(args: {
  address: `0x${string}`;
  action: OrderAction | ApproveBuilderFeeAction;
}): Promise<unknown> {
  const nonce = BigInt(Date.now());
  const sig = await signL1Action(args.address, args.action, nonce, CURRENT_NETWORK);

  const res = await fetch(`${API_BASE}/trade-forward`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network: CURRENT_NETWORK,
      action: args.action,
      nonce: Number(nonce),
      signature: sig,
      vaultAddress: null,
    }),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    throw Object.assign(new Error(`trade-forward ${res.status}`), {
      status: res.status,
      body: parsed,
    });
  }
  return parsed;
}

// ---- Order --------------------------------------------------------------

export interface PlaceOrderArgs extends SignAndSendArgs {
  /** HL asset id — must already be resolved. */
  assetId: number;
  isBuy: boolean;
  price: string;
  size: string;
  tif: 'Ioc' | 'Gtc' | 'Alo';
}

export async function placeOrder(args: PlaceOrderArgs): Promise<unknown> {
  const builder = getBuilderConfig();
  if (!builder.configured) {
    throw new Error('Builder not configured for this network.');
  }
  const action: OrderAction = {
    type: 'order',
    orders: [
      {
        a: args.assetId,
        b: args.isBuy,
        p: args.price,
        s: args.size,
        r: false,
        t: { limit: { tif: args.tif } },
      },
    ],
    grouping: 'na',
    builder: { b: builder.address, f: builder.feeTenthsBps },
  };
  return submitForward({ address: args.address, action });
}

// ---- Approve builder fee ------------------------------------------------

export async function approveBuilderFee(args: SignAndSendArgs): Promise<unknown> {
  const builder = getBuilderConfig();
  if (!builder.configured) {
    throw new Error('Builder not configured for this network.');
  }
  const action: ApproveBuilderFeeAction = {
    type: 'approveBuilderFee',
    maxFeeRate: builder.maxFeeRatePct,
    builder: builder.address,
  };
  return submitForward({ address: args.address, action });
}

// ---- HF info: current max approval --------------------------------------

const HF_INFO = {
  mainnet: 'https://api.hyperliquid.xyz/info',
  testnet: 'https://api.hyperliquid-testnet.xyz/info',
} as const;

/** Returns the user's current approved maxFeeRate for our builder (as
 *  percent string), or "0%" / "" when nothing approved yet. */
export async function fetchMaxBuilderFee(
  user: `0x${string}`,
): Promise<string> {
  const builder = getBuilderConfig();
  if (!builder.configured) return '';
  const res = await fetch(HF_INFO[CURRENT_NETWORK], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'maxBuilderFee',
      user,
      builder: builder.address,
    }),
  });
  if (!res.ok) return '';
  const txt = await res.text();
  try {
    const parsed = JSON.parse(txt) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed === 'number') return `${parsed}%`;
    return '';
  } catch {
    return txt.trim();
  }
}

/** Parse "0.01%" or "0.001%" → tenths of bps (integer). 0 on failure.
 *  Used to compare the user's approved cap to our fee (config.feeTenthsBps). */
export function parsePctToTenthsBps(pct: string): number {
  const m = /^([0-9]+(?:\.[0-9]+)?)\s*%$/.exec(pct.trim());
  if (!m) return 0;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return 0;
  // 1% = 100 bps = 1000 tenths-of-bps
  return Math.floor(v * 1000);
}
