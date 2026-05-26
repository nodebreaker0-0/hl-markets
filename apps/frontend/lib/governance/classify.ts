// Variant classification — Constitution V.
// Adding a new variant = one line in `KNOWN` + one renderer file + one
// `renderers/index.ts` entry. Everything else routes through `classify`.

export type Variant = 'outcome' | 'delisting' | 'unknown';

const KNOWN: Record<string, Variant> = {
  O: 'outcome',
  D: 'delisting',
  // Future: e.g. G: 'governance', X: 'extension' — one line addition.
};

export function classify(action: { type: string; [k: string]: unknown }): {
  variant: Variant;
  innerKey: string | null;
} {
  const innerKey = Object.keys(action).find((k) => k !== 'type') ?? null;
  const fromMap = innerKey ? KNOWN[innerKey] : undefined;
  const variant: Variant = fromMap ?? 'unknown';
  return { variant, innerKey };
}
