// Phase U — deep agent output schema.
//
// Every domain analyst (crypto / sports / macro / politics / weather)
// returns the same shape so the discovery orchestrator can stitch results
// from heterogeneous analysts into one ranked list.
//
// The schema is enforced at parse time (Zod) so even if the LLM ignores
// instructions, downstream code never sees a malformed object.

import { z } from 'zod';

export const ConfidenceSchema = z.union([
  z.literal('low'),
  z.literal('med'),
  z.literal('high'),
]);

export const SourceSchema = z.object({
  label: z.string().max(64),
  url: z.string().url().max(256).optional(),
});

export const AnalystOutputSchema = z.object({
  fairPct: z.number().min(0).max(100),
  confidence: ConfidenceSchema,
  /** 3-6 bullets, each ≤ 160 chars. Whitespace-trimmed by parse. */
  reasoning: z.array(z.string().max(160)).min(1).max(6),
  /** Optional one-line caveat or data limitation note. */
  caveat: z.string().max(200).optional(),
  /** Each cited source (live data, news, model). LLM should cite ≥ 1
   *  when its reasoning depends on a non-trivial signal. */
  sources: z.array(SourceSchema).max(8).default([]),
  /** Raw numeric/string signals the fetchers produced; useful for
   *  client-side display and future backtests. Never echoed back to UI
   *  verbatim — UI uses `reasoning`. */
  rawSignals: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Source = z.infer<typeof SourceSchema>;

// Helper: confidence → numeric rank (so callers can sort / threshold).
export function confidenceRank(c: Confidence): number {
  return c === 'high' ? 3 : c === 'med' ? 2 : 1;
}
