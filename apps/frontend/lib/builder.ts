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
//   NEXT_PUBLIC_BUILDER_MAX_FEE_PCT_STR (approveBuilderFee maxFeeRate, default "0.01%")

import { CURRENT_NETWORK } from './network';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

function readEnv(key: string, fallback = ''): string {
  if (typeof process === 'undefined') return fallback;
  return (process.env[key] as string | undefined) ?? fallback;
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
  const addrRaw =
    CURRENT_NETWORK === 'mainnet'
      ? readEnv('NEXT_PUBLIC_BUILDER_ADDR_MAINNET')
      : readEnv('NEXT_PUBLIC_BUILDER_ADDR_TESTNET');
  const address = (addrRaw || ZERO_ADDR).toLowerCase() as `0x${string}`;

  const bpsRaw = readEnv('NEXT_PUBLIC_BUILDER_FEE_BPS', '5');
  const feeBpsHuman = Math.max(0, Math.floor(Number(bpsRaw) || 0));
  const feeTenthsBps = feeBpsHuman * 10;

  const maxFeeRatePct = readEnv('NEXT_PUBLIC_BUILDER_MAX_FEE_PCT_STR', '0.01%');

  return {
    address,
    feeTenthsBps,
    feeBpsHuman,
    maxFeeRatePct,
    configured: address !== ZERO_ADDR && feeTenthsBps > 0,
  };
}
