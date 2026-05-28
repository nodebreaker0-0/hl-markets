// Phase S — AI Basket Discovery.
//
// User types a free-text query ("World Cup top 5 ROI", "ending soon
// mispriced", "70%+ confidence under 50¢") → we ship the full list of
// active outcomes to the LLM as a compact CSV-ish blob and ask it to
// return its top K candidates as a JSON list. The user picks which to
// add to the basket.
//
// Token math: a typical testnet snapshot is ~200 outcomes × ~70 tokens
// (name + price + 1-line description trim) = ~14k tokens. gpt-4o-mini's
// 128k context window absorbs that easily. Real cost ~ $0.003/call.

import {
  fetchAllMids,
  fetchOutcomeMeta,
  outcomeAssetKey,
  type OutcomeQuestion,
  type OutcomeMetaResponse,
} from '@/lib/api';
import { CURRENT_NETWORK } from '@/lib/network';
import { analyzeOpenAiRaw, analyzeAnthropicRaw, type LlmProvider } from '@/lib/llm-raw';
import { categorize, type Category } from '@/lib/categorize';
import { specialistFor, type SpecialistBlob, type SpecialistKeys } from '@/lib/specialists';
import { analyzeOutcomeDeep, type DeepAgentKeys } from '@/lib/agents/orchestrator';
import type { AnalystOutput } from '@/lib/agents/types';

export interface CompactCandidate {
  outcomeId: number;
  sideIdx: 0; // we only ask the LLM to rank YES sides for now
  outcomeName: string;
  questionTitle: string;
  description: string;
  marketPct: number;
  /** Sum of all yes prices in the parent question (sanity flag). */
  questionSumPct: number;
  /** When applicable. */
  expiresHint?: string;
  /** Category (Phase T) — routes specialist data lookup. */
  category?: Category;
  /** Specialist-fetched external data (live price, recent stats, etc.). */
  specialistBlob?: SpecialistBlob | null;
  /** Phase U — deep analyst output (single-call domain LLM with skill). */
  deep?: AnalystOutput | null;
}

export interface DiscoveryRecommendation {
  outcomeId: number;
  outcomeName: string;
  questionTitle: string;
  marketPct: number;
  fairPct: number;
  edgePp: number;
  /** LLM-supplied confidence 1-5. */
  confidence: number;
  reasoning: string;
  suggestedUsd: number;
}

/** Fetch a compact list of "active" YES-side outcomes for LLM scoring. */
export async function fetchActiveCandidates(): Promise<{
  meta: OutcomeMetaResponse;
  candidates: CompactCandidate[];
}> {
  const [meta, mids] = await Promise.all([
    fetchOutcomeMeta(CURRENT_NETWORK),
    fetchAllMids(CURRENT_NETWORK),
  ]);

  const candidates: CompactCandidate[] = [];

  for (const q of meta.questions) {
    if (q.settledNamedOutcomes.length > 0) continue;
    // Sum question's prices for context.
    let sum = 0;
    for (const oid of q.namedOutcomes) {
      const m = mids[outcomeAssetKey(oid, 0)];
      if (m !== undefined) sum += Number(m);
    }

    for (const oid of q.namedOutcomes) {
      const o = meta.outcomes.find((x) => x.outcome === oid);
      if (!o) continue;
      const m = mids[outcomeAssetKey(oid, 0)];
      if (m === undefined) continue;
      const pct = Number(m) * 100;
      // Skip degenerate extreme prices — LLM can't find edge there.
      if (pct < 1 || pct > 99) continue;
      const cat = categorize(o.name, o.description ?? '', q.name);
      candidates.push({
        outcomeId: oid,
        sideIdx: 0,
        outcomeName: o.name,
        questionTitle: q.name,
        description: (o.description ?? '').slice(0, 240),
        marketPct: pct,
        questionSumPct: sum * 100,
        category: cat,
      });
    }
  }
  return { meta, candidates };
}

/** Phase T — enrich candidates with domain-specialist data (live crypto
 *  prices, sports stats, economic indicators, weather). Best-effort: any
 *  failure just leaves that candidate without an extra blob. Runs all
 *  lookups in parallel. */
export async function enrichWithSpecialists(
  candidates: CompactCandidate[],
  keys: SpecialistKeys,
): Promise<CompactCandidate[]> {
  return Promise.all(
    candidates.map(async (c) => {
      try {
        const blob = await specialistFor(c.category ?? 'general', c.outcomeName, c.description, keys);
        return { ...c, specialistBlob: blob };
      } catch {
        return c;
      }
    }),
  );
}

/** Phase U — for each candidate, run the full deep analyst chain (skill +
 *  domain fetchers + LLM call). This is heavier than enrichWithSpecialists
 *  (1 LLM call per candidate) so the caller picks the top-N to deep-analyze
 *  before the final ranking call.
 *
 *  Parallelism: bounded to 6 in-flight requests so we don't hammer the
 *  user's LLM provider with a 50-candidate stampede. */
export async function enrichWithDeepAnalysts(
  candidates: CompactCandidate[],
  keys: DeepAgentKeys,
  maxConcurrent = 6,
): Promise<CompactCandidate[]> {
  const out = candidates.slice();
  const queue = out.map((_, i) => i);
  let inflight = 0;
  let cursor = 0;
  return new Promise((resolve) => {
    const tryNext = (): void => {
      if (cursor >= queue.length && inflight === 0) {
        resolve(out);
        return;
      }
      while (inflight < maxConcurrent && cursor < queue.length) {
        const idx = queue[cursor++]!;
        const c = out[idx]!;
        inflight++;
        analyzeOutcomeDeep(
          {
            outcomeId: c.outcomeId,
            outcomeName: c.outcomeName,
            description: c.description,
            questionTitle: c.questionTitle,
            marketPct: c.marketPct,
          },
          keys,
        )
          .then((deep) => {
            out[idx] = { ...c, deep };
          })
          .catch(() => {
            /* keep candidate without deep — fallback in orchestrator */
          })
          .finally(() => {
            inflight--;
            tryNext();
          });
      }
    };
    tryNext();
  });
}

/** Build the system + user prompt for discovery. We deliberately tell the
 *  LLM to return a JSON array, never advice on size, and to ground its
 *  recommendations in the candidate list (no hallucinating outcomes).
 *
 *  Each candidate line carries its specialist blob (live crypto price /
 *  sports stat / FRED data) when one is available — these are the Tier 3
 *  signals that meaningfully sharpen the LLM's edge estimate.
 */
function buildDiscoveryPrompt(args: {
  query: string;
  candidates: CompactCandidate[];
  topK: number;
}): { system: string; user: string } {
  const system = `You are a prediction-market analyst helping a user discover the highest-expected-value basket of bets across MANY OPEN MARKETS of many kinds (sports, crypto, economics, politics, weather, etc.).

You will receive:
- a user instruction (natural language).
- a list of candidate outcomes drawn from every active market. Each candidate may carry external "live data" (recent crypto prices, sports stats, economic series, weather, etc.) when available — use it as factual signal, not as the only input.

Rules:
- Output ONLY a JSON object: {"picks": [{"outcomeId": int, "fairPct": number, "edgePp": number, "confidence": int 1-5, "reasoning": string}]}
- DO NOT group by domain. Pick the strongest single list of up to ${args.topK} bets across all topics by expected value.
- "outcomeId" MUST be one from the input list. Never invent outcomes.
- "fairPct" is your point estimate (0-100) for that outcome resolving YES.
- "edgePp" = fairPct - marketPct.
- "confidence": 5 = strong evidence (live data plus high prior), 1 = pure guess.
- "reasoning" is one short sentence — cite the live-data signal when it drove your call.
- If no candidates have meaningful edge, return {"picks": []}.
- Never recommend a bet size.
`;

  const lines = args.candidates.map((c) => {
    const base = `${c.outcomeId}\t${c.questionTitle}\t${c.outcomeName}\t${c.marketPct.toFixed(1)}%\t${c.questionSumPct.toFixed(0)}%\t${c.description.replace(/\s+/g, ' ').slice(0, 180)}`;
    // Prefer deep analyst output (Phase U) — already a structured fair %
    // and reasoning. Fall back to the lighter Phase T specialist blob.
    if (c.deep) {
      const r = c.deep.reasoning.slice(0, 3).join(' / ');
      const src = c.deep.sources.slice(0, 3).map((s) => s.label).join(', ');
      return `${base}\t[deep ${c.category ?? 'general'} · fair ${c.deep.fairPct.toFixed(1)}% · ${c.deep.confidence} conf] ${r}${src ? ` (cite: ${src})` : ''}`.slice(0, 700);
    }
    if (c.specialistBlob) {
      return `${base}\t[live ${c.specialistBlob.source}] ${c.specialistBlob.text.replace(/\s+/g, ' ').slice(0, 200)}`;
    }
    return base;
  });
  const user = `User instruction:\n${args.query}\n\nCandidates (${args.candidates.length}):\n${lines.join('\n')}`;

  return { system, user };
}

/** Call the LLM (provider abstraction) to score candidates. */
export async function askLlmDiscover(args: {
  provider: LlmProvider;
  key: string;
  query: string;
  candidates: CompactCandidate[];
  topK?: number;
}): Promise<DiscoveryRecommendation[]> {
  const topK = args.topK ?? 6;
  const { system, user } = buildDiscoveryPrompt({
    query: args.query,
    candidates: args.candidates,
    topK,
  });

  const raw =
    args.provider === 'openai'
      ? await analyzeOpenAiRaw(args.key, system, user, true)
      : await analyzeAnthropicRaw(args.key, system, user);

  // Parse the JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = /\{[\s\S]*\}/.exec(raw);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error('LLM returned non-JSON discovery response');
  }
  const obj = parsed as { picks?: Array<Partial<DiscoveryRecommendation>> };
  const picks = Array.isArray(obj.picks) ? obj.picks : [];

  // Sanitize: only keep picks whose outcomeId is in the candidate list.
  const validIds = new Set(args.candidates.map((c) => c.outcomeId));
  const byId = new Map(args.candidates.map((c) => [c.outcomeId, c] as const));

  const out: DiscoveryRecommendation[] = [];
  for (const p of picks) {
    const oid = Number(p.outcomeId);
    if (!validIds.has(oid)) continue;
    const cand = byId.get(oid)!;
    const fair = clamp(Number(p.fairPct ?? cand.marketPct), 0, 100);
    const edge = fair - cand.marketPct;
    const conf = clamp(Number(p.confidence ?? 3), 1, 5);
    const reason =
      typeof p.reasoning === 'string'
        ? p.reasoning.slice(0, 220)
        : 'no reasoning provided';
    out.push({
      outcomeId: oid,
      outcomeName: cand.outcomeName,
      questionTitle: cand.questionTitle,
      marketPct: cand.marketPct,
      fairPct: fair,
      edgePp: edge,
      confidence: conf,
      reasoning: reason,
      suggestedUsd: 0, // filled by caller with Kelly fraction
    });
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Quarter-Kelly recommended size given an edge. Returns 0 if no edge. */
export function quarterKellyUsd(args: {
  marketPct: number;
  fairPct: number;
  freeUsdc: number;
}): number {
  const price = args.marketPct / 100;
  if (price <= 0 || price >= 1) return 0;
  const p = args.fairPct / 100;
  const q = 1 - p;
  const b = (1 - price) / price;
  const f = (b * p - q) / b;
  if (!Number.isFinite(f) || f <= 0) return 0;
  const usd = (f * args.freeUsdc) / 4;
  const capped = Math.min(usd, args.freeUsdc * 0.1);
  if (capped < 10) return 0;
  return Math.round(capped * 100) / 100;
}
