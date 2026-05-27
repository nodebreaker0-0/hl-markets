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
import { signApproveBuilderFee } from '@/lib/signing/user-signed';
import { toWire } from '@/lib/wire';
import { loadAgent, deleteAgent } from '@/lib/agent';
import { signL1ActionWithAgent } from '@/lib/signing/agent-sign';
import { walkAsks } from '@/lib/orderbook';

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
 *  (status passes through, body is JSON or error text).
 *
 *  Phase J.7: If an agent EOA exists in IndexedDB for (address, network),
 *  the action is signed locally by the agent privkey — no MetaMask popup.
 *  Otherwise we fall back to the main-wallet path (which prompts the user).
 *  The caller (TradeWidget / SimpleTradeWidget) is responsible for running
 *  the onboarding flow that creates an agent before reaching this fn for
 *  the popup-free experience.
 */
async function submitForward(args: {
  address: `0x${string}`;
  action: OrderAction | ApproveBuilderFeeAction | CancelAction;
}): Promise<unknown> {
  const nonce = BigInt(Date.now());
  const agent = await loadAgent(args.address, CURRENT_NETWORK);
  const sig = agent
    ? await signL1ActionWithAgent(agent.privKey, args.action, nonce, CURRENT_NETWORK)
    : await signL1Action(args.address, args.action, nonce, CURRENT_NETWORK);

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
  // J.7: If HF rejected with an agent-related error, the local agent record
  // is stale (user revoked from another browser, or registered a different
  // agent). Clear it so the next attempt re-onboards through the modal.
  if (agent && looksLikeAgentRejection(parsed)) {
    try {
      await deleteAgent(args.address, CURRENT_NETWORK);
    } catch (_) {
      /* best effort */
    }
  }
  return parsed;
}

/** Heuristic: HF returns 200 with `{"status":"ok","response":{...,"error":"Agent does not exist..."}}`
 *  for revoked agents. Look for explicit "agent" wording to avoid wiping on
 *  unrelated errors. */
function looksLikeAgentRejection(parsed: unknown): boolean {
  try {
    const s = JSON.stringify(parsed).toLowerCase();
    return s.includes('agent does not exist') || s.includes('agent not found') || s.includes('invalid agent');
  } catch {
    return false;
  }
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

/** Phase J.6 — Simple Mode market buy.
 *
 *  Inputs:
 *   - usdAmount: dollars the user is willing to bet.
 *   - bestAskPx / bestAskSz: top-of-book from a fresh L2 fetch.
 *   - slippagePct (default 2): bumps the IOC limit above best ask so the
 *     order still fills if the book ticked up between fetch and submit.
 *
 *  Logic:
 *   1. cap usdAmount at maxUsdAtTopOfBook = bestAskPx × bestAskSz
 *   2. contracts = cappedUsd / bestAskPx
 *   3. limit = bestAskPx × (1 + slippage/100), clamped to [bestAskPx, 1]
 *   4. IOC limit at that price, with builder field attached
 *
 *  Returns HF response — caller handles fill vs partial vs reject.
 */
export interface PlaceMarketBuyArgs extends SignAndSendArgs {
  assetId: number;
  usdAmount: number;
  bestAskPx: number;
  bestAskSz: number;
  /** Optional — when provided, placeMarketBuy walks across multiple ask
   *  levels (Phase J.10 polish). When omitted, falls back to the top-of-book
   *  only behavior. */
  asks?: { px: number; sz: number }[];
  /** Phase J.6 hotfix #2 — HF's per-order minimum-notional check uses the
   *  best BID, not the ask. In wide-spread outcome markets we MUST bump up
   *  the contract size so `contracts × bestBidPx ≥ MIN_USD`, otherwise HF
   *  returns "Order must have minimum value of 10 USDC" even when the user
   *  is paying $20+ at the ask. */
  bestBidPx: number;
  /** Percent (e.g. 2 = +2%). Default 2. */
  slippagePct?: number;
}

/** HF minimum-notional threshold (also mirrored in SimpleTradeWidget). */
const HL_MIN_NOTIONAL_USD = 10;
/** Tiny safety buffer above the HL threshold to absorb book ticks. */
const NOTIONAL_BUFFER = 1.05;

export async function placeMarketBuy(args: PlaceMarketBuyArgs): Promise<unknown> {
  const builder = getBuilderConfig();
  if (!builder.configured) {
    throw new Error('Builder not configured for this network.');
  }
  if (args.bestAskPx <= 0 || args.bestAskSz <= 0) {
    throw new Error('No sellers right now — try again in a moment.');
  }
  if (args.bestBidPx <= 0) {
    // Pathological: no bid at all. HF would reject for the same reason; surface
    // it client-side so we don't waste a signature.
    throw new Error('No buyers in this market yet — HL min order ($10) cannot be met.');
  }

  const slip = args.slippagePct ?? 2;

  // Required contracts to clear HF's bid-based notional check.
  const minContractsForNotional = Math.ceil(
    (HL_MIN_NOTIONAL_USD * NOTIONAL_BUFFER) / args.bestBidPx,
  );

  let contracts: number;
  let limit: number;

  if (args.asks && args.asks.length > 0) {
    // Phase J.10 — walk multiple ask levels so a single bet can spend
    // deeper than the top-of-book on its own.
    const walk = walkAsks(args.asks, args.usdAmount, slip);
    if (!walk) throw new Error('No ask liquidity available.');
    contracts = Math.max(walk.contracts, minContractsForNotional);
    // The IOC limit is the WORST price we'd touch, bumped by slippage. This
    // lets the tail of a large basket fill at level-2/3 prices.
    limit = Math.min(walk.worstPx * (1 + slip / 100), 0.999);
  } else {
    // Single-level fallback (callers that don't pass `asks`).
    const askMaxContracts = Math.floor(args.bestAskSz);
    const contractsFromUsd = Math.ceil(args.usdAmount / args.bestAskPx);
    contracts = Math.max(contractsFromUsd, minContractsForNotional);
    if (contracts > askMaxContracts) contracts = askMaxContracts;
    if (contracts <= 0) {
      throw new Error('Not enough liquidity for an integer contract.');
    }
    if (contracts * args.bestBidPx < HL_MIN_NOTIONAL_USD) {
      throw new Error(
        `Liquidity too thin: even buying the entire ask (${askMaxContracts} contracts ≈ ` +
          `$${(askMaxContracts * args.bestAskPx).toFixed(2)}) is below HL's $${HL_MIN_NOTIONAL_USD} ` +
          `bid-notional floor (bid $${args.bestBidPx}).`,
      );
    }
    limit = Math.min(args.bestAskPx * (1 + slip / 100), 0.999);
  }

  const action: OrderAction = {
    type: 'order',
    orders: [
      {
        a: args.assetId,
        b: true,
        p: toWire(limit),
        s: toWire(contracts),
        r: false,
        t: { limit: { tif: 'Ioc' } },
      },
    ],
    grouping: 'na',
    builder: {
      b: builder.address.toLowerCase() as `0x${string}`,
      f: builder.feeTenthsBps,
    },
  };
  return submitForward({ address: args.address, action });
}

/** Phase J.8 — Cash out (market sell at top of book).
 *
 *  Inputs:
 *   - shares: integer share count to sell.
 *   - bestBidPx: best bid (price the IOC sell will hit).
 *   - bestBidSz: bid size cap so we don't request more than fillable.
 *   - slippagePct: lower bound of acceptable sell price (= bestBid × (1 - slip/100)).
 *
 *  Logic:
 *   1. capped = min(shares, floor(bestBidSz))
 *   2. limit = bestBid × (1 - slip/100), clamped ≥ 0.001
 *   3. IOC sell at that limit, builder field attached for parity.
 */
export interface PlaceMarketSellArgs extends SignAndSendArgs {
  assetId: number;
  shares: number;
  bestBidPx: number;
  bestBidSz: number;
  slippagePct?: number;
}

export async function placeMarketSell(args: PlaceMarketSellArgs): Promise<unknown> {
  const builder = getBuilderConfig();
  if (!builder.configured) {
    throw new Error('Builder not configured for this network.');
  }
  if (args.bestBidPx <= 0 || args.bestBidSz <= 0) {
    throw new Error('No buyers right now — try again in a moment.');
  }

  const maxShares = Math.floor(args.bestBidSz);
  let contracts = Math.min(Math.floor(args.shares), maxShares);
  if (contracts <= 0) {
    throw new Error('Not enough liquidity to cash out (book too thin).');
  }

  // Bid-notional check (mirrors HF $10 floor).
  if (contracts * args.bestBidPx < 10) {
    throw new Error(
      `Sell would be below HL's $10 minimum notional (${contracts} × $${args.bestBidPx} = $${(contracts * args.bestBidPx).toFixed(2)}).`,
    );
  }

  const slip = args.slippagePct ?? 2;
  const limit = Math.max(args.bestBidPx * (1 - slip / 100), 0.001);

  const action: OrderAction = {
    type: 'order',
    orders: [
      {
        a: args.assetId,
        b: false, // sell
        p: toWire(limit),
        s: toWire(contracts),
        r: false,
        t: { limit: { tif: 'Ioc' } },
      },
    ],
    grouping: 'na',
    builder: {
      b: builder.address.toLowerCase() as `0x${string}`,
      f: builder.feeTenthsBps,
    },
  };
  return submitForward({ address: args.address, action });
}

// ---- Cancel order ------------------------------------------------------

export interface CancelAction {
  type: 'cancel';
  cancels: { a: number; o: number }[];
}

/** Phase J.8 — cancel a resting order. Agent-signed when possible. */
export async function cancelOrder(args: {
  address: `0x${string}`;
  assetId: number;
  oid: number;
}): Promise<unknown> {
  const action: CancelAction = {
    type: 'cancel',
    cancels: [{ a: args.assetId, o: args.oid }],
  };
  return submitForward({ address: args.address, action });
}

export async function placeOrder(args: PlaceOrderArgs): Promise<unknown> {
  const builder = getBuilderConfig();
  if (!builder.configured) {
    throw new Error('Builder not configured for this network.');
  }
  // CRITICAL (Phase J.5b): `p` and `s` MUST be in wire format. HF re-normalizes
  // unnormalized strings before computing the recovery hash, so signing
  // "0.400" produces a signature that recovers to a random address. See
  // lib/wire.ts.
  const action: OrderAction = {
    type: 'order',
    orders: [
      {
        a: args.assetId,
        b: args.isBuy,
        p: toWire(args.price),
        s: toWire(args.size),
        r: false,
        t: { limit: { tif: args.tif } },
      },
    ],
    grouping: 'na',
    // Builder address MUST be lowercased — HF normalizes it before recovery,
    // and Python SDK does `builder.lower()` for the same reason.
    builder: {
      b: builder.address.toLowerCase() as `0x${string}`,
      f: builder.feeTenthsBps,
    },
  };
  return submitForward({ address: args.address, action });
}

// ---- Approve builder fee (user-signed action — NOT L1) ------------------
//
// approveBuilderFee uses HL's user-signed spec (HyperliquidTransaction:
// ApproveBuilderFee typed data + action body with hyperliquidChain +
// signatureChainId). signApproveBuilderFee handles the EIP-712 sign; we
// then POST through /trade-forward with the fully-built action body. */

export async function approveBuilderFee(args: SignAndSendArgs): Promise<unknown> {
  const builder = getBuilderConfig();
  if (!builder.configured) {
    throw new Error('Builder not configured for this network.');
  }
  const { action, signature, nonce } = await signApproveBuilderFee({
    address: args.address,
    network: CURRENT_NETWORK,
    maxFeeRate: builder.maxFeeRatePct,
    builder: builder.address,
  });

  const res = await fetch(`${API_BASE}/trade-forward`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network: CURRENT_NETWORK,
      action,
      nonce: Number(nonce),
      signature,
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
