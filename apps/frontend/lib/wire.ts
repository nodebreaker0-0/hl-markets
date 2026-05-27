// Phase J.5b — HL wire-format normalization for price/size strings.
//
// HL Python SDK uses `float_to_wire(x: float) -> str` which:
//   1. round to 8 decimals
//   2. parse as Decimal
//   3. normalize (drop trailing zeros + use shortest representation)
//   4. format as fixed-point string
//
// Empirically (testnet 2026-05-27): if we sign with a non-normalized price
// like "0.400" the HF-side recovery returns a random wrong address — HF
// internally re-msgpacks with the normalized form before hashing, so the
// signature recovers to garbage. Sending "0.4" works.
//
// Therefore: every price / size string that ends up in an `order` action's
// `p` or `s` field MUST go through `toWire` first.

/**
 * Convert a numeric string (or number) to HL wire format.
 * Examples:
 *   "0.400"    -> "0.4"
 *   "0.43"     -> "0.43"
 *   "1.0"      -> "1"
 *   "1"        -> "1"
 *   "0.00001"  -> "0.00001"
 *   "1e-5"     -> "0.00001"   (scientific is rejected by HL — we normalize)
 *
 * Throws if the input is empty, not a finite number, or has > 8 decimals
 * AFTER normalization (HL rejects more precision than that).
 */
export function toWire(input: string | number): string {
  const s = String(input).trim();
  if (s === '') throw new Error('toWire: empty input');
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`toWire: not finite — "${s}"`);

  // Round to 8 decimals first (parity with float_to_wire), then normalize.
  // Using fixed-point string + manual trim avoids JS Number's "1e-7" exponent
  // serialization which HL rejects.
  let rounded = n.toFixed(8); // always non-exponent form, 8 decimals

  // Strip trailing zeros after the dot.
  if (rounded.includes('.')) {
    rounded = rounded.replace(/0+$/, '');
    if (rounded.endsWith('.')) rounded = rounded.slice(0, -1);
  }

  // Edge: "-0" → "0" (just in case JS rounding produced it).
  if (rounded === '-0') rounded = '0';

  // Sanity: <= 8 decimals (should always hold after the toFixed step, but be
  // defensive — HL hard-rejects over-precise values).
  const dotIdx = rounded.indexOf('.');
  if (dotIdx >= 0 && rounded.length - dotIdx - 1 > 8) {
    throw new Error(`toWire: >8 decimals after normalize — "${rounded}"`);
  }

  return rounded;
}
