'use client';

// Phase S — AI Basket Discovery tab.
//
// User types an instruction → we ship the full active outcome list to the
// LLM (own key) → LLM returns top picks → user can:
//   - Add individual picks to the basket
//   - Add all picks to the basket
//   - Place immediately as a multi-leg order
//
// All bets go through the agent sign path (popup-free after onboarding).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  fetchActiveCandidates,
  askLlmDiscover,
  quarterKellyUsd,
  type DiscoveryRecommendation,
} from '@/lib/discovery';
import { loadKeys } from '@/lib/llm';
import { addLeg as basketAddLeg, clearBasket } from '@/lib/basket';
import { pushToast } from '@/lib/toast';

const DEFAULT_QUERIES = [
  'Top 5 best risk/reward across all active markets right now',
  'Underpriced favorites (market < 50% but you think > 60%)',
  'Sports markets only, top 3 by expected value',
  'Ending within 7 days and looks mispriced',
  '70%+ confidence outcomes trading under 50¢',
];

export function AIDiscovery(): JSX.Element {
  const [query, setQuery] = useState<string>(DEFAULT_QUERIES[0]!);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<DiscoveryRecommendation[] | null>(null);
  const [candidateCount, setCandidateCount] = useState<number>(0);

  const onRun = async (): Promise<void> => {
    const keys = loadKeys();
    const provider = keys.preferred;
    const key = provider === 'openai' ? keys.openai : provider === 'anthropic' ? keys.anthropic : null;
    if (!provider || !key) {
      setErr('Add an LLM key in /settings first.');
      return;
    }
    setBusy(true);
    setErr(null);
    setResults(null);
    try {
      const { candidates } = await fetchActiveCandidates();
      setCandidateCount(candidates.length);
      const picks = await askLlmDiscover({
        provider,
        key,
        query: query.trim(),
        candidates,
        topK: 6,
      });
      // Compute Kelly suggestions (assumes $100 budget by default; user can
      // tweak in basket sheet).
      const FREE_BUDGET = 100;
      const enriched = picks.map((p) => ({
        ...p,
        suggestedUsd: quarterKellyUsd({
          marketPct: p.marketPct,
          fairPct: p.fairPct,
          freeUsdc: FREE_BUDGET,
        }),
      }));
      // Drop picks with no actionable size (negative edge or sub-$10 Kelly).
      const actionable = enriched.filter((p) => p.suggestedUsd >= 10);
      setResults(actionable);
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      pushToast({ tone: 'error', message: 'Discovery failed', detail: msg });
    } finally {
      setBusy(false);
    }
  };

  const addOne = (r: DiscoveryRecommendation): void => {
    try {
      basketAddLeg({
        outcomeId: r.outcomeId,
        sideIdx: 0,
        outcomeName: r.outcomeName,
        sideName: 'Yes',
        questionTitle: r.questionTitle,
        usdAmount: r.suggestedUsd,
      });
      pushToast({
        tone: 'success',
        message: `Added ${r.outcomeName} to basket`,
        detail: `$${r.suggestedUsd.toFixed(2)} · ${r.edgePp.toFixed(1)}pp edge`,
        ttlMs: 3500,
      });
    } catch (e) {
      pushToast({ tone: 'error', message: (e as Error).message });
    }
  };

  const addAll = (): void => {
    if (!results || results.length === 0) return;
    clearBasket();
    let n = 0;
    for (const r of results) {
      try {
        basketAddLeg({
          outcomeId: r.outcomeId,
          sideIdx: 0,
          outcomeName: r.outcomeName,
          sideName: 'Yes',
          questionTitle: r.questionTitle,
          usdAmount: r.suggestedUsd,
        });
        n++;
      } catch {
        /* cap or dup — skip silently */
      }
    }
    pushToast({
      tone: 'success',
      message: `Loaded ${n}-leg basket`,
      detail: 'Open the basket (bottom-right) to place.',
      ttlMs: 5000,
    });
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-hl-mint/30 bg-hl-mint/5 p-3">
        <div className="text-[10px] uppercase tracking-widest text-hl-mint">
          AI Basket Discovery
        </div>
        <p className="mt-1 text-xs text-hl-subtle">
          Type a plain-English request. AI scans every active market and returns
          a curated basket. You decide which to bet on — AI never auto-trades.
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={2}
          placeholder='e.g. "World Cup, top 5 underpriced favorites"'
          className="w-full resize-none rounded-xl border border-hl-border bg-hl-bg px-3 py-2 text-sm text-hl-text focus:border-hl-mint focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuery(q)}
              className="rounded-full border border-hl-border bg-hl-bg px-2.5 py-1 text-[10px] text-hl-subtle hover:text-hl-text"
            >
              {q.slice(0, 40)}{q.length > 40 ? '…' : ''}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void onRun()}
          disabled={busy || query.trim().length < 5}
          className={clsx(
            'w-full rounded-full bg-hl-mint/15 px-3 py-2.5 text-sm font-semibold uppercase tracking-widest text-hl-mint ring-1 ring-hl-mint hover:bg-hl-mint/25',
            (busy || query.trim().length < 5) && 'cursor-not-allowed opacity-60',
          )}
        >
          {busy ? 'Scanning markets…' : 'Find opportunities'}
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-mainnet/40 bg-mainnet/10 px-3 py-2 text-xs text-mainnet">
          {err}
          {err.includes('/settings') && (
            <>
              {' '}
              <Link href="/settings" className="underline">
                Open Settings →
              </Link>
            </>
          )}
        </div>
      )}

      {results !== null && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-hl-subtle">
              {results.length} picks · scanned {candidateCount} active outcomes
            </div>
            {results.length > 0 && (
              <button
                type="button"
                onClick={addAll}
                className="rounded-full bg-hl-mint/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-hl-mint ring-1 ring-hl-mint"
              >
                Add all → basket
              </button>
            )}
          </div>
          {results.length === 0 ? (
            <div className="rounded-xl border border-hl-border bg-hl-surface/60 px-3 py-4 text-center text-xs text-hl-subtle">
              No actionable opportunities for that query right now. Try another
              phrasing or relax the criteria.
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((r) => (
                <RecommendationCard key={r.outcomeId} r={r} onAdd={() => addOne(r)} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RecommendationCard({
  r,
  onAdd,
}: {
  r: DiscoveryRecommendation;
  onAdd: () => void;
}): JSX.Element {
  const edgeTone =
    r.edgePp > 5 ? 'text-hl-mint' : r.edgePp < -3 ? 'text-mainnet' : 'text-hl-subtle';
  const expectedPayout = r.suggestedUsd > 0 && r.marketPct > 0
    ? r.suggestedUsd / (r.marketPct / 100)
    : 0;

  return (
    <article className="rounded-xl border border-hl-border bg-hl-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-hl-text">
            {r.outcomeName}
            <span className="ml-1 text-[10px] font-normal text-hl-subtle">
              · {r.questionTitle}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-hl-subtle">{r.reasoning}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-xs text-hl-subtle">
            {r.marketPct.toFixed(1)}% mkt
          </div>
          <div className="mono text-sm font-semibold text-hl-mint">
            {r.fairPct.toFixed(1)}% fair
          </div>
          <div className={clsx('mono text-[11px]', edgeTone)}>
            {r.edgePp >= 0 ? '+' : ''}
            {r.edgePp.toFixed(1)}pp
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-hl-subtle">
          Suggest <strong className="text-hl-text">${r.suggestedUsd.toFixed(2)}</strong>
          {expectedPayout > 0 && (
            <>
              {' '}· wins{' '}
              <strong className="text-hl-mint">${expectedPayout.toFixed(2)}</strong>
            </>
          )}
          {' '}· conf {r.confidence}/5
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-full border border-hl-mint/40 bg-hl-mint/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-hl-mint hover:bg-hl-mint/15"
        >
          + Add
        </button>
      </div>
    </article>
  );
}
