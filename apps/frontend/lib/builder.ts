// Phase J.5 — Builder Code config (network-resolved at build time).
//
// Set the EOAs after the personal builder wallet has run approveBuilderFee
// on each network. Until then, builder is "disabled" and TradeWidget shows
// a setup banner instead of an order form.
//
// Env keys (NEXT_PUBLIC_ → baked into the static SPA at build time):
//   NEXT_PUBLIC_BUILDER_ADDR_TESTNET
//   NEXT_PUBLIC_BUILDER_ADDR_MAINNET
//   NEXT_PUBLIC_BUILDER_FEE_BPS         (human bps, e.g. 5 = 0.05%)
//
// The approveBuilderFee `maxFeeRate` string is derived from BUILDER_FEE_BPS
// instead of being a separate env — keeping them linked prevents the user
// from approving (say) "0.01%" while we ship orders with f=50 (= 0.05%) and
// getting silent HF rejections ("Builder fee has not been approved").

import { CURRENT_NETWORK } from './network';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

// IMPORTANT: NEXT_PUBLIC_* env access MUST use literal `process.env.NAME`
// — Next.js / webpack's DefinePlugin only inlines string-literal accesses.
// `process.env[someVar]` returns undefined at runtime in the browser bundle.

const ADDR_TESTNET = process.env.NEXT_PUBLIC_BUILDER_ADDR_TESTNET ?? '';
const ADDR_MAINNET = process.env.NEXT_PUBLIC_BUILDER_ADDR_MAINNET ?? '';
const FEE_BPS_RAW = process.env.NEXT_PUBLIC_BUILDER_FEE_BPS ?? '5';

/** Convert human bps → maxFeeRate string (e.g. 5 bps → "0.05%").
 *  HL accepts strings like "0.05%", "0.1%", normalized similarly to wire prices.
 */
function bpsToPctString(bps: number): string {
  // bps → percent value:  bps / 100  (5 bps = 0.05%)
  // Use a high-precision round-trip and strip trailing zeros for parity with
  // how Python SDK formats the value.
  let s = (bps / 100).toFixed(6);
  if (s.includes('.')) {
    s = s.replace(/0+$/, '');
    if (s.endsWith('.')) s = s.slice(0, -1);
  }
  return `${s}%`;
}

export interface BuilderConfig {
  /** Builder EOA, lowercased. ZERO_ADDR when env is not configured. */
  address: `0x${string}`;
  /** Tenths-of-bps to attach to each order (5 bps = 50). */
  feeTenthsBps: number;
  /** Human-readable fee, for confirm modal. */
  feeBpsHuman: number;
  /** approveBuilderFee maxFeeRate string ("0.01%"). */
  maxFeeRatePct: string;
  /** True when both address and fee are set — TradeWidget is allowed to mount. */
  configured: boolean;
}

export function getBuilderConfig(): BuilderConfig {
  const addrRaw = CURRENT_NETWORK === 'mainnet' ? ADDR_MAINNET : ADDR_TESTNET;
  const address = (addrRaw || ZERO_ADDR).toLowerCase() as `0x${string}`;

  const feeBpsHuman = Math.max(0, Math.floor(Number(FEE_BPS_RAW) || 0));
  const feeTenthsBps = feeBpsHuman * 10;

  return {
    address,
    feeTenthsBps,
    feeBpsHuman,
    // Tie maxFeeRate to feeBpsHuman so approve cap ≥ actual order fee always.
    maxFeeRatePct: bpsToPctString(feeBpsHuman),
    configured: address !== ZERO_ADDR && feeTenthsBps > 0,
  };
}
