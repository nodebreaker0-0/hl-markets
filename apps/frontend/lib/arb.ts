// Phase N — cross-outcome arbitrage scanner.
//
// For every active multi-option question, sum the best-ask price of each
// option's Yes token. If the sum is below $1, buying one share of each
// option is a guaranteed-positive trade: exactly one Yes resolves to $1
// while the others settle to $0, so the basket payout is exactly $1
// regardless of which option wins.
//
// We respect:
//   - HL min order $10 USDC per leg (so basket cost ≥ 10 * N options)
//   - 1.5% safety buffer (spread / slippage) before flagging
//
// The scanner uses HF `allMids` for a cheap first pass (one call covers
// every market), then escalates to `l2Book` for the candidates that look
// arb-able to confirm with real asks.

import {
  fetchAllMids,
  fetchL2Book,
  fetchOutcomeMeta,
  outcomeAssetKey,
  type Network,
  type OutcomeMetaResponse,
  type OutcomeQuestion,
} from '@/lib/api';

const HL_MIN_PER_LEG_USD = 10;
/** Below this threshold (after-fee) we consider it a true arb. 0.985 means
 *  the basket has to be cheap by at least 1.5%. */
const ARB_PROFIT_THRESHOLD = 0.985;

export interface ArbOpportunity {
  question: OutcomeQuestion;
  /** Sum of best ask prices across all of the question's Yes legs. */
  askSum: number;
  /** Total notional cost to buy ≥1 share of each option (= sum × shares).
   *  We aim for HL_MIN_PER_LEG_USD per leg. */
  minBasketCost: number;
  /** Estimated payout (always $1 × shares × N? no — one winner × shares). */
  estimatedPayout: number;
  /** profit = payout - cost (USDC). */
  estimatedProfit: number;
  /** ROI = profit / cost. */
  estimatedRoi: number;
  /** How many options the question has (cost driver). */
  optionCount: number;
  /** Per-option price snapshot for basket pre-fill. */
  legs: Array<{
    outcomeId: number;
    name: string;
    askPx: number;
    sharesPerLeg: number;
  }>;
}

/** Per-leg basket size: we buy enough shares so that each leg clears HL's
 *  $10 per-order minimum. For arb math, all legs must have the same share
 *  count (else payout is uneven). So we pick shares = ceil(10 / max askPx)
 *  across the question. */
function planBasketShares(askPrices: number[]): number {
  const maxAsk = Math.max(...askPrices);
  if (!Number.isFinite(maxAsk) || maxAsk <= 0) return 0;
  return Math.ceil(HL_MIN_PER_LEG_USD / maxAsk);
}

/** Quick scan using `allMids`. Mids != asks but mids tend to track close,
 *  so flagging "mid sum < 0.95" is a cheap signal for "asks likely < 0.985". */
export async function quickScanMids(
  network: Network,
  meta?: OutcomeMetaResponse,
): Promise<{ question: OutcomeQuestion; midSum: number; optionCount: number }[]> {
  const [mids, m] = await Promise.all([
    fetchAllMids(network),
    meta ? Promise.resolve(meta) : fetchOutcomeMeta(network),
  ]);
  const out: { question: OutcomeQuestion; midSum: number; optionCount: number }[] = [];
  for (const q of m.questions) {
    if (q.namedOutcomes.length < 2) continue;
    // Skip questions where any option already settled.
    if (q.settledNamedOutcomes.length > 0) continue;
    let sum = 0;
    let missing = false;
    for (const oid of q.namedOutcomes) {
      const key = outcomeAssetKey(oid, 0); // Yes side
      const px = mids[key];
      if (px === undefined || px === null) {
        missing = true;
        break;
      }
      sum += Number(px);
    }
    if (missing) continue;
    if (sum < 0.97) {
      // Possible arb — escalate. (0.97 generous so we don't miss spread-tight ones.)
      out.push({ question: q, midSum: sum, optionCount: q.namedOutcomes.length });
    }
  }
  // Cheapest sum first (= best apparent arb).
  out.sort((a, b) => a.midSum - b.midSum);
  return out;
}

/** Confirm a candidate question by walking its order book. Returns null if
 *  the real ask side doesn't survive the arb threshold. */
export async function confirmArb(
  network: Network,
  meta: OutcomeMetaResponse,
  question: OutcomeQuestion,
): Promise<ArbOpportunity | null> {
  // Fetch l2Book for every leg (Yes side). Run in parallel; bail early if
  // any book is empty.
  const legBooks = await Promise.all(
    question.namedOutcomes.map(async (oid) => {
      const key = outcomeAssetKey(oid, 0);
      try {
        const book = await fetchL2Book(network, key);
        const ask = book.levels?.[1]?.[0];
        const askPx = ask ? Number(ask.px) : null;
        const askSz = ask ? Number(ask.sz) : 0;
        const m = meta.outcomes.find((o) => o.outcome === oid);
        return { oid, askPx, askSz, name: m?.name ?? `Outcome ${oid}` };
      } catch {
        return { oid, askPx: null, askSz: 0, name: `Outcome ${oid}` };
      }
    }),
  );

  // All legs need an ask.
  if (legBooks.some((l) => l.askPx === null)) return null;

  const askPrices = legBooks.map((l) => l.askPx as number);
  const askSum = askPrices.reduce((a, b) => a + b, 0);

  if (askSum >= ARB_PROFIT_THRESHOLD) return null;

  const sharesPerLeg = planBasketShares(askPrices);
  if (sharesPerLeg <= 0) return null;

  // Each leg must have enough ask size to support `sharesPerLeg` purchases.
  for (let i = 0; i < legBooks.length; i++) {
    if (legBooks[i]!.askSz < sharesPerLeg) return null;
  }

  const minBasketCost = legBooks.reduce(
    (a, l) => a + (l.askPx as number) * sharesPerLeg,
    0,
  );
  const estimatedPayout = sharesPerLeg; // one option will resolve $1; others $0.
  const estimatedProfit = estimatedPayout - minBasketCost;
  const estimatedRoi = estimatedProfit / minBasketCost;

  // Final gate: skip dust opportunities (< $1 profit).
  if (estimatedProfit < 1) return null;

  return {
    question,
    askSum,
    minBasketCost,
    estimatedPayout,
    estimatedProfit,
    estimatedRoi,
    optionCount: question.namedOutcomes.length,
    legs: legBooks.map((l) => ({
      outcomeId: l.oid,
      name: l.name,
      askPx: l.askPx as number,
      sharesPerLeg,
    })),
  };
}

/** Full scan: cheap mids pass → confirm top-K with l2Book. Returns
 *  confirmed opportunities, sorted by profit desc. */
export async function scanArb(
  network: Network,
  options: { maxConfirmed?: number } = {},
): Promise<ArbOpportunity[]> {
  const maxConfirmed = options.maxConfirmed ?? 10;
  const meta = await fetchOutcomeMeta(network);
  const candidates = await quickScanMids(network, meta);
  if (candidates.length === 0) return [];

  const top = candidates.slice(0, maxConfirmed);
  const confirmed = await Promise.all(
    top.map((c) => confirmArb(network, meta, c.question)),
  );
  return confirmed
    .filter((x): x is ArbOpportunity => x !== null)
    .sort((a, b) => b.estimatedProfit - a.estimatedProfit);
}
