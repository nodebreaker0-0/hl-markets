// outcomeMeta → outcome_market upsert.
// For each outcome we predict the allMids #NNNN asset key per side using the
// formula outcomeId*10 + sideIdx, then verify against the current allMids
// snapshot. Mismatches log a warning but don't fail — Phase E.2 will replace
// the formula with a lookup-table fallback if testnet 5-digit IDs don't fit.
//
// linkDeployments() further joins each outcome to the governance row whose
// action deployed it, by matching (name, sideNames). Multiple governances can
// have the same outcome name (e.g. testnet's "Recurring Named Outcome") — in
// that case we attach the governance whose firstSeenAt is *closest before*
// the outcome's firstSeenAt.

import { db } from '@/db/client';
import { governance, outcomeMarket, outcomeQuestion } from '@/db/schema';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { fetchOutcomeMeta, fetchAllMids, type Network } from '@/hf';

function predictedAssetKeys(outcomeId: number, sideCount: number): string[] {
  return Array.from({ length: sideCount }, (_, i) => `#${outcomeId * 10 + i}`);
}

export async function runOutcomes(network: Network, nowMs: number): Promise<{
  upserted: number;
  mappingMismatch: number;
  questionsUpserted: number;
  questionsSettled: number;
}> {
  const meta = await fetchOutcomeMeta(network);
  const { outcomes, questions } = meta;
  const mids = await fetchAllMids(network);

  let upserted = 0;
  let mappingMismatch = 0;

  for (const o of outcomes) {
    const predicted = predictedAssetKeys(o.outcome, o.sideSpecs.length);
    const allPresent = predicted.every((k) => k in mids);
    if (!allPresent) {
      mappingMismatch++;
      // Keep the predicted keys anyway; downstream can detect missing prices.
    }

    await db
      .insert(outcomeMarket)
      .values({
        network,
        outcomeId: o.outcome,
        name: o.name,
        description: o.description ?? null,
        sideSpecs: o.sideSpecs,
        quoteToken: o.quoteToken ?? 'USDC',
        assetKeys: predicted,
        status: 'trading',
        firstSeenAt: BigInt(nowMs),
        lastSeenAt: BigInt(nowMs),
      })
      .onConflictDoUpdate({
        target: [outcomeMarket.network, outcomeMarket.outcomeId],
        set: {
          name: o.name,
          description: o.description ?? null,
          sideSpecs: o.sideSpecs,
          assetKeys: predicted,
          lastSeenAt: BigInt(nowMs),
        },
      });
    upserted++;
  }

  // TODO Phase E.2: detect outcomes that *disappeared* from outcomeMeta →
  // mark `status = settled`. For now we only refresh / insert.

  // ---- outcome_question mirror (Phase H.3) ------------------------------
  // We keep our own copy of `outcomeMeta.questions` so settled / removed
  // questions still appear in the historical view after HF drops them.
  let questionsUpserted = 0;
  const seenQids = new Set<number>();
  for (const q of questions) {
    seenQids.add(q.question);
    await db
      .insert(outcomeQuestion)
      .values({
        network,
        questionId: q.question,
        name: q.name,
        description: q.description ?? null,
        namedOutcomes: q.namedOutcomes,
        fallbackOutcome: q.fallbackOutcome,
        settledNamedOutcomes: q.settledNamedOutcomes,
        status: 'trading',
        firstSeenAt: BigInt(nowMs),
        lastSeenAt: BigInt(nowMs),
      })
      .onConflictDoUpdate({
        target: [outcomeQuestion.network, outcomeQuestion.questionId],
        set: {
          name: q.name,
          description: q.description ?? null,
          namedOutcomes: q.namedOutcomes,
          fallbackOutcome: q.fallbackOutcome,
          settledNamedOutcomes: q.settledNamedOutcomes,
          lastSeenAt: BigInt(nowMs),
        },
      });
    questionsUpserted++;
  }

  // Any question we previously saw but is no longer in outcomeMeta → settled.
  // (HF removes questions once they resolve, so disappearance = settled.)
  const trading = await db
    .select({ qid: outcomeQuestion.questionId })
    .from(outcomeQuestion)
    .where(
      and(eq(outcomeQuestion.network, network), eq(outcomeQuestion.status, 'trading')),
    );
  const missingQids = trading.map((r) => r.qid).filter((q) => !seenQids.has(q));
  let questionsSettled = 0;
  if (missingQids.length > 0) {
    await db
      .update(outcomeQuestion)
      .set({ status: 'settled', settledAt: BigInt(nowMs) })
      .where(
        and(
          eq(outcomeQuestion.network, network),
          inArray(outcomeQuestion.questionId, missingQids),
        ),
      );
    questionsSettled = missingQids.length;
  }

  return { upserted, mappingMismatch, questionsUpserted, questionsSettled };
}

// ---- governance ↔ outcome deploy linking --------------------------------
// Action shapes (governance.action.O):
//   { registerTokensAndStandaloneOutcome: { nameAndDescription:[name,desc], sideNames:[...] } }
//   { registerTokensAndQuestion:          { name, description, sideNames:[...] } }
// Both expose name + sideNames; outcome_market stores `name` and
// `sideSpecs:[{name}]` — match by those.

interface OutcomeShape {
  name: string;
  sideNames: string[];
}

function extractOutcomeShape(action: unknown): OutcomeShape | null {
  if (!action || typeof action !== 'object') return null;
  const O = (action as Record<string, unknown>)['O'];
  if (!O || typeof O !== 'object') return null;
  const inner = O as Record<string, unknown>;
  const op = Object.keys(inner)[0];
  if (!op) return null;
  const reg = inner[op] as Record<string, unknown> | undefined;
  if (!reg) return null;
  let name: string | undefined;
  if (Array.isArray(reg['nameAndDescription'])) {
    const nad = reg['nameAndDescription'] as unknown[];
    if (typeof nad[0] === 'string') name = nad[0];
  } else if (typeof reg['name'] === 'string') {
    name = reg['name'];
  }
  const sn = reg['sideNames'];
  if (!name || !Array.isArray(sn)) return null;
  const sideNames = (sn as unknown[]).filter((s): s is string => typeof s === 'string');
  if (sideNames.length === 0) return null;
  return { name, sideNames };
}

function shapeKey(s: OutcomeShape): string {
  return `${s.name}::${JSON.stringify(s.sideNames)}`;
}

export async function linkDeployments(network: Network): Promise<number> {
  // Only outcomes without a deployGovId — once linked, it doesn't change.
  const orphans = await db
    .select()
    .from(outcomeMarket)
    .where(and(eq(outcomeMarket.network, network), isNull(outcomeMarket.deployGovId)));
  if (orphans.length === 0) return 0;

  const govs = await db
    .select()
    .from(governance)
    .where(and(eq(governance.network, network), eq(governance.variant, 'outcome')));
  if (govs.length === 0) return 0;

  // Index governances by their outcome shape. For duplicate keys we keep the
  // full candidate list so we can pick the closest-by-time below.
  const byKey = new Map<string, typeof govs>();
  for (const g of govs) {
    const shape = extractOutcomeShape(g.action);
    if (!shape) continue;
    const k = shapeKey(shape);
    const list = byKey.get(k) ?? [];
    list.push(g);
    byKey.set(k, list);
  }

  let linked = 0;
  for (const o of orphans) {
    const sideNames = (o.sideSpecs as Array<{ name: string }>).map((s) => s.name);
    const k = shapeKey({ name: o.name, sideNames });
    const candidates = byKey.get(k);
    if (!candidates || candidates.length === 0) continue;

    // Pick the governance whose firstSeenAt is closest *before* the outcome's
    // firstSeenAt (the deploy was first observed *after* the gov passed). If
    // none fit, fall back to the closest overall — handles indexer-start cases
    // where both rows were first observed in the same tick.
    const oTs = o.firstSeenAt;
    let pick: typeof govs[number] | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const g of candidates) {
      const delta = oTs - g.firstSeenAt;
      const cost = delta >= 0n ? Number(delta) : Number(-delta) * 10;
      if (cost < bestDelta) {
        bestDelta = cost;
        pick = g;
      }
    }
    if (!pick) continue;

    await db
      .update(outcomeMarket)
      .set({ deployGovId: pick.govId })
      .where(
        and(eq(outcomeMarket.network, network), eq(outcomeMarket.outcomeId, o.outcomeId)),
      );
    linked++;
  }

  return linked;
}
