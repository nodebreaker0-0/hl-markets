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
      candidates.push({
        outcomeId: oid,
        sideIdx: 0,
        outcomeName: o.name,
        questionTitle: q.name,
        description: (o.description ?? '').slice(0, 240),
        marketPct: pct,
        questionSumPct: sum * 100,
      });
    }
  }
  return { meta, candidates };
}

/** Build the system + user prompt for discovery. We deliberately tell the
 *  LLM to return a JSON array, never advice on size, and to ground its
 *  recommendations in the candidate list (no hallucinating outcomes). */
function buildDiscoveryPrompt(args: {
  query: string;
  candidates: CompactCandidate[];
  topK: number;
}): { system: string; user: string } {
  const system = `You are a prediction-market analyst helping a user discover the best basket of bets across many open markets.

You will receive:
- a user instruction (natural language, e.g. "World Cup top 5 ROI" or "70%+ confidence under 50 cents").
- a list of candidate outcomes, one per line, in the format: "<outcomeId>\t<questionTitle>\t<outcomeName>\t<marketPct>%\t<questionSumPct>%\t<description>".

Rules:
- Output ONLY a JSON object: {"picks": [{"outcomeId": int, "fairPct": number, "edgePp": number, "confidence": int 1-5, "reasoning": string}]}
- "picks" should contain at most ${args.topK} entries — your best matches for the user's instruction.
- "outcomeId" MUST be one from the input list. Never invent outcomes.
- "fairPct" is your point estimate (0-100) for that outcome resolving YES.
- "edgePp" = fairPct - marketPct.
- "confidence": 5 = strong evidence, 1 = pure guess.
- "reasoning" is one short sentence, no fluff.
- If no candidates match the user's instruction, return {"picks": []}.
- Never recommend a bet size.
`;

  const lines = args.candidates.map(
    (c) =>
      `${c.outcomeId}\t${c.questionTitle}\t${c.outcomeName}\t${c.marketPct.toFixed(1)}%\t${c.questionSumPct.toFixed(0)}%\t${c.description.replace(/\s+/g, ' ').slice(0, 180)}`,
  );
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
