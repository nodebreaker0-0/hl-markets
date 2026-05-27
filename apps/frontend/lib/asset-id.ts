// Phase J.5b — outcome asset id resolver.
//
// HL's asset-id docs (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids)
// don't document outcome markets explicitly, but the testnet app.hyperliquid
// /exchange POST for an outcome order ships `a` as a single integer with a
// clear pattern: `100_000_000 + (numeric part of "#NNNN" asset key)`.
//
// Verified sample (2026-05-27, captured via DevTools Network on
// app.hyperliquid-testnet.xyz):
//   Canned Tuna Yes (outcomeId=7004, side=0) → assetKey "#70040" → a=100070040
//
// The formula is therefore:
//   a = 100_000_000 + outcomeId * 10 + sideIdx
//
// We expose two surfaces:
//   - outcomeAssetId(outcomeId, sideIdx) — pure formula
//   - parseOutcomeAssetKey(key) → { outcomeId, sideIdx } | null — for the
//     other direction when callers only have the `#NNNN` string in hand.

export const OUTCOME_ASSET_ID_BASE = 100_000_000;

/** Asset id for a side of an outcome, suitable for an `order` action's `a`. */
export function outcomeAssetId(outcomeId: number, sideIdx: number): number {
  return OUTCOME_ASSET_ID_BASE + outcomeId * 10 + sideIdx;
}

/** Asset id for a "#NNNN" string asset key (allMids / outcomeMeta convention). */
export function assetIdFromKey(assetKey: string): number {
  const m = /^#(\d+)$/.exec(assetKey);
  if (!m) {
    throw new Error(`bad outcome asset key: ${assetKey}`);
  }
  return OUTCOME_ASSET_ID_BASE + Number(m[1]);
}

/** Reverse — split "#NNNN" back into (outcomeId, sideIdx). */
export function parseOutcomeAssetKey(
  assetKey: string,
): { outcomeId: number; sideIdx: number } | null {
  const m = /^#(\d+)$/.exec(assetKey);
  if (!m) return null;
  const n = Number(m[1]);
  return { outcomeId: Math.floor(n / 10), sideIdx: n % 10 };
}
