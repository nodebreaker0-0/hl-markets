'use client';

// Phase X-060/061 — AI Analyst sheet wrapper.
//
// URL ?analyze=<outcomeId> 기반. AIAnalyzePanel 의 sheet wrapper.
// 어디서든 (OutcomeCard 의 ✨ icon, OutcomeDetailSheet 의 ✨ Analyze button)
// URL params 만 set 하면 sheet 자동 open.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  fetchOutcomeMeta,
  fetchAllMids,
  outcomeAssetKey,
  type OutcomeMetaEntry,
} from '@/lib/api';
import { CURRENT_NETWORK } from '@/lib/network';
import { outcomeLabel } from '@/lib/outcome-question';
import { AIAnalyzePanel } from '@/components/AIAnalyzePanel';

export function AIAnalystSheet(): JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const analyze = sp.get('analyze');
  const outcomeId = analyze !== null ? Number(analyze) : null;
  const isOpen = analyze !== null && !Number.isNaN(outcomeId);

  const [outcome, setOutcome] = useState<OutcomeMetaEntry | null>(null);
  const [midPct, setMidPct] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || outcomeId === null) {
      setOutcome(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    Promise.all([fetchOutcomeMeta(CURRENT_NETWORK), fetchAllMids(CURRENT_NETWORK)])
      .then(([meta, mids]) => {
        if (cancel) return;
        const o = meta.outcomes.find((x) => x.outcome === outcomeId);
        if (o) {
          setOutcome(o);
          setMidPct(Number(mids[outcomeAssetKey(outcomeId, 0)] ?? 0) * 100);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [isOpen, outcomeId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function closeSheet(): void {
    const params = new URLSearchParams(sp.toString());
    params.delete('analyze');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname ?? '/');
  }

  if (!isOpen || outcomeId === null) return null;

  const title = outcome
    ? outcomeLabel(outcome.name, outcome.description ?? '')
    : `Outcome #${outcomeId}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="analyst-sheet-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSheet();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-xl bg-surface-overlay sm:rounded-xl">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-start justify-between gap-md border-b border-divider bg-surface-overlay px-lg pt-lg pb-md">
          <div className="flex min-w-0 flex-col gap-px">
            <span className="text-caption uppercase tracking-widest text-primary">
              ✨ AI Analyst
            </span>
            <h2
              id="analyst-sheet-title"
              className="text-h1 font-bold leading-tight text-on-surface"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close"
            className="rounded-full p-2 text-on-surface-muted transition-colors hover:bg-surface-elevated hover:text-on-surface"
          >
            ✕
          </button>
        </header>

        <div className="px-lg py-md">
          {loading && !outcome ? (
            <div className="py-2xl text-center text-body-sm text-on-surface-muted">
              Loading market data…
            </div>
          ) : !outcome ? (
            <div className="py-2xl text-center text-body-sm text-on-surface-muted">
              Outcome not found.
            </div>
          ) : (
            <AIAnalyzePanel
              outcomeName={outcome.sideSpecs[0]?.name ?? title}
              sideName={outcome.sideSpecs[0]?.name ?? 'Yes'}
              description={outcome.description ?? ''}
              currentPct={midPct}
            />
          )}
        </div>
      </div>
    </div>
  );
}
