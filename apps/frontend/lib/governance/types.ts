// Common types across renderers, classify, thresholds.
// See contracts/governance.md.

import type { ValidatorSummary } from '@/lib/api';
import type { Variant } from './classify';

export type { Variant };

/** A single pending governance item — what we pass into renderers. */
export interface GovernanceItem {
  network: 'testnet' | 'mainnet';
  /** sha256(msgpack(action))-derived hex string (with 0x prefix). Stable id. */
  govId: string;
  /** Full `validatorL1Vote` action reconstructed from HF response.
   *  Inner shape (`{O: {...}}`, `{D: "..."}`) is unchanged byte-for-byte. */
  action: { type: 'validatorL1Vote'; [k: string]: unknown };
  variant: Variant;
  /** First non-"type" key in `action`, or `null` if action is malformed. */
  innerKey: string | null;
  expireTime: number;
  /** governance addresses */
  votes: `0x${string}`[];
  quorumReached: boolean;
}

/** Renderer-side context — anything a Detail/Card needs beyond the item itself. */
export interface RendererContext {
  /** Indexed validator metadata for the current network. */
  validators: ValidatorSummary[];
  /** Optional Phase H market data (perp price / volume). */
  marketData?: unknown;
}

export interface VariantRenderer {
  Card: React.FC<{ item: GovernanceItem; ctx: RendererContext }>;
  Detail: React.FC<{ item: GovernanceItem; ctx: RendererContext }>;
}
