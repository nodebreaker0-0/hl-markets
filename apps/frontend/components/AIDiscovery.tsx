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
  enrichWithSpecialists,
  enrichWithDeepAnalysts,
  askLlmDiscover,
  quarterKellyUsd,
  type DiscoveryRecommendation,
} from '@/lib/discovery';
import { loadKeys } from '@/lib/llm';
import { addLeg as basketAddLeg, clearBasket } from '@/lib/basket';
import { useUiMode } from '@/lib/uiMode';
import { pushToast } from '@/lib/toast';

const DEFAULT_QUERIES = [
  'Top 5 best risk/reward across all active markets right now',
  'Underpriced favorites (market < 50% but you think > 60%)',
  'Ending within 7 days and looks mispriced',
  '70%+ confidence outcomes trading under 50¢',
  'Hidden long-shots with strong recent signal',
];

/** Default "no-input" query when auto-explore fires on tab open. */
const AUTO_EXPLORE_QUERY =
  'Across all active markets, find the highest-expected-value bets right now using whatever live data is available. Mix domains; do not group.';

const AUTO_CACHE_KEY = 'hl-markets:ai-picks-cache';
const AUTO_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

export function AIDiscovery(): JSX.Element {
  const [query, setQuery] = useState<string>(AUTO_EXPLORE_QUERY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<DiscoveryRecommendation[] | null>(null);
  const [candidateCount, setCandidateCount] = useState<number>(0);
  const [autoStatus, setAutoStatus] = useState<'idle' | 'running' | 'cached' | 'failed'>('idle');

  const runDiscovery = async (q: string): Promise<void> => {
    const keys = loadKeys();
    const provider = keys.preferred;
    const llmKey = provider === 'openai' ? keys.openai : provider === 'anthropic' ? keys.anthropic : null;
    if (!provider || !llmKey) {
      setErr('Add an LLM key in /settings first.');
      return;
    }
    setBusy(true);
    setErr(null);
    setResults(null);
    try {
      const { candidates } = await fetchActiveCandidates();
      setCandidateCount(candidates.length);
      // Phase T — lightweight specialist blobs (no LLM, just live data fetch).
      const tierTwoEnriched = await enrichWithSpecialists(candidates, {
        footballData: keys.footballData ?? null,
        fred: keys.fred ?? null,
        openweather: keys.openweather ?? null,
      });
      // Phase U — deep analyst pass on the top 12 most promising candidates.
      // We pick by "interesting" = market price not at extremes, prefer ones
      // that already got a specialist blob (= we have data to work with).
      const promising = tierTwoEnriched
        .filter((c) => c.marketPct >= 5 && c.marketPct <= 95)
        .sort((a, b) => {
          const aHas = a.specialistBlob ? 1 : 0;
          const bHas = b.specialistBlob ? 1 : 0;
          return bHas - aHas;
        })
        .slice(0, 12);
      const deepResolved = await enrichWithDeepAnalysts(promising, {
        provider,
        llmKey,
        tavily: keys.tavily ?? null,
        footballData: keys.footballData ?? null,
        fred: keys.fred ?? null,
        openweather: keys.openweather ?? null,
      });
      // Merge deep results back into the full candidate list so the final
      // ranker sees both tiers.
      const deepById = new Map(deepResolved.map((c) => [c.outcomeId, c] as const));
      const finalCandidates = tierTwoEnriched.map((c) =>
        deepById.has(c.outcomeId) ? deepById.get(c.outcomeId)! : c,
      );
      const picks = await askLlmDiscover({
        provider,
        key: llmKey,
        query: q,
        candidates: finalCandidates,
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
      const actionable = enriched.filter((p) => p.suggestedUsd >= 10);
      setResults(actionable);
      // Cache so the next AI Basket tab open is instant.
      try {
        window.localStorage.setItem(
          AUTO_CACHE_KEY,
          JSON.stringify({ ts: Date.now(), query: q, picks: actionable, candidateCount: candidates.length }),
        );
      } catch {
        /* ignore quota */
      }
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      pushToast({ tone: 'error', message: 'Discovery failed', detail: msg });
    } finally {
      setBusy(false);
    }
  };

  const onRun = (): void => {
    setAutoStatus('idle');
    void runDiscovery(query.trim());
  };

  // Auto-explore: on tab mount, show last hour's cached picks instantly;
  // if no cache or stale, run the no-input query in the background.
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = window.localStorage.getItem(AUTO_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          ts: number;
          query: string;
          picks: DiscoveryRecommendation[];
          candidateCount: number;
        };
        if (Date.now() - parsed.ts < AUTO_CACHE_TTL_MS) {
          if (!cancelled) {
            setResults(parsed.picks);
            setCandidateCount(parsed.candidateCount);
            setAutoStatus('cached');
            return;
          }
        }
      }
    } catch {
      /* ignore */
    }
    // No fresh cache → kick off an auto run.
    const keys = loadKeys();
    const provider = keys.preferred;
    const llmKey = provider === 'openai' ? keys.openai : provider === 'anthropic' ? keys.anthropic : null;
    if (!provider || !llmKey) return; // user hasn't set keys yet — wait for manual run.
    setAutoStatus('running');
    void runDiscovery(AUTO_EXPLORE_QUERY).then(() => {
      if (!cancelled) setAutoStatus('idle');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-primary">
            ✨ AI Picks · live data + every active market
          </div>
          {autoStatus === 'running' && (
            <span className="text-[10px] text-on-surface-muted">running auto-scan…</span>
          )}
          {autoStatus === 'cached' && (
            <span className="text-[10px] text-on-surface-muted">cached · re-scan to refresh</span>
          )}
        </div>
        <p className="mt-1 text-xs text-on-surface-muted">
          AI scans every active market (mixing sports, crypto, politics, weather…) and
          enriches each candidate with live external data before picking the highest-EV
          basket. You decide which to bet — AI never auto-trades.
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={2}
          placeholder='e.g. "World Cup, top 5 underpriced favorites"'
          className="w-full resize-none rounded-xl border border-divider bg-surface px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuery(q)}
              className="rounded-full border border-divider bg-surface px-2.5 py-1 text-[10px] text-on-surface-muted hover:text-on-surface"
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
            'w-full rounded-full bg-primary/15 px-3 py-2.5 text-sm font-semibold uppercase tracking-widest text-primary ring-1 ring-primary hover:bg-primary/25',
            (busy || query.trim().length < 5) && 'cursor-not-allowed opacity-60',
          )}
        >
          {busy ? 'Scanning markets…' : 'Find opportunities'}
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-accent-down/40 bg-accent-down/10 px-3 py-2 text-xs text-accent-down">
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
            <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
              {results.length} picks · scanned {candidateCount} active outcomes
            </div>
            {results.length > 0 && (
              <button
                type="button"
                onClick={addAll}
                className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary ring-1 ring-primary"
              >
                Add all → basket
              </button>
            )}
          </div>
          {results.length === 0 ? (
            <div className="rounded-xl border border-divider bg-surface-elevated/60 px-3 py-4 text-center text-xs text-on-surface-muted">
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
  const { mode } = useUiMode();
  const edgeTone =
    r.edgePp > 5 ? 'text-primary' : r.edgePp < -3 ? 'text-accent-down' : 'text-on-surface-muted';
  const expectedPayout = r.suggestedUsd > 0 && r.marketPct > 0
    ? r.suggestedUsd / (r.marketPct / 100)
    : 0;

  // W-19 Pro mode — dense 1-line table-row. 12+ candidate 한 화면에 보임.
  if (mode === 'pro') {
    return (
      <article className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-3 border-b border-divider px-sm py-sm hover:bg-surface-elevated">
        <div className="min-w-0">
          <div className="truncate text-body-sm font-semibold text-on-surface">
            {r.outcomeName}
            <span className="ml-1 text-[10px] font-normal text-on-surface-muted">
              · {r.questionTitle}
            </span>
          </div>
          <div className="truncate text-[10px] text-on-surface-muted">{r.reasoning}</div>
        </div>
        <span className="mono text-mono-sm tabular-nums text-on-surface-muted" title="market">
          {r.marketPct.toFixed(1)}%
        </span>
        <span className="mono text-mono-md font-semibold tabular-nums text-primary" title="fair">
          {r.fairPct.toFixed(1)}%
        </span>
        <span className={clsx('mono text-mono-sm tabular-nums', edgeTone)} title="edge">
          {r.edgePp >= 0 ? '+' : ''}
          {r.edgePp.toFixed(1)}pp
        </span>
        <span className="mono text-mono-sm tabular-nums text-on-surface" title="suggested USD">
          ${r.suggestedUsd.toFixed(0)}
        </span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${r.outcomeName} to basket`}
          className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-on-primary hover:bg-primary-bright"
        >
          +
        </button>
      </article>
    );
  }

  // Simple mode — original card layout.
  return (
    <article className="rounded-xl border border-divider bg-surface-elevated p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-on-surface">
            {r.outcomeName}
            <span className="ml-1 text-[10px] font-normal text-on-surface-muted">
              · {r.questionTitle}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-on-surface-muted">{r.reasoning}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-xs text-on-surface-muted">
            {r.marketPct.toFixed(1)}% mkt
          </div>
          <div className="mono text-sm font-semibold text-primary">
            {r.fairPct.toFixed(1)}% fair
          </div>
          <div className={clsx('mono text-[11px]', edgeTone)}>
            {r.edgePp >= 0 ? '+' : ''}
            {r.edgePp.toFixed(1)}pp
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-on-surface-muted">
          Suggest <strong className="text-on-surface">${r.suggestedUsd.toFixed(2)}</strong>
          {expectedPayout > 0 && (
            <>
              {' '}· wins{' '}
              <strong className="text-primary">${expectedPayout.toFixed(2)}</strong>
            </>
          )}
          {' '}· conf {r.confidence}/5
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary hover:bg-primary/15"
        >
          + Add
        </button>
      </div>
    </article>
  );
}
