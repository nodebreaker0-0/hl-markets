'use client';

// Phase X-050 — TradeFlow 3-step page transition (토스 패턴).
//
// URL state machine — searchParams 가 source of truth:
//   /trade?id=N&side=yes|no&step=1[&amount=X]    Step 1 (amount input)
//   /trade?id=N&side=yes|no&step=2&amount=X      Step 2 (confirm + sign)
//   /trade?id=N&side=yes|no&step=3&fillId=...    Step 3 (result)
//
// Browser back = previous step (URL natural). Step 별 transition slide
// 200ms (CSS animation). 한 page 한 액션 (한 화면 한 step).
//
// outcome metadata + best ask/bid 는 parent 에서 fetch, child step 에 prop.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TradeStepAmount } from '@/components/TradeStepAmount';
import { TradeStepConfirm } from '@/components/TradeStepConfirm';
import { TradeStepResult } from '@/components/TradeStepResult';
import {
  fetchOutcomeMeta,
  fetchAllMids,
  outcomeAssetKey,
  type OutcomeMetaEntry,
  type AllMidsResponse,
} from '@/lib/api';
import { fetchOrderBook, type OrderBook } from '@/lib/orderbook';
import { CURRENT_NETWORK } from '@/lib/network';
import { outcomeLabel } from '@/lib/outcome-question';
import { assetIdFromKey } from '@/lib/asset-id';

export interface TradeContext {
  outcomeId: number;
  sideIdx: 0 | 1;
  sideName: string;
  outcomeName: string;
  outcomeDescription: string;
  assetKey: string;
  assetId: number;
  midPct: number;
  book: OrderBook | null;
}

export default function TradePage(): JSX.Element {
  const sp = useSearchParams();
  const id = sp.get('id');
  const sideParam = sp.get('side');
  const step = sp.get('step') ?? '1';
  const outcomeId = id !== null ? Number(id) : null;
  const sideIdx: 0 | 1 = sideParam === 'no' ? 1 : 0;

  const [ctx, setCtx] = useState<TradeContext | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (outcomeId === null || Number.isNaN(outcomeId)) {
      setErr('Invalid outcome id.');
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);
    (async () => {
      try {
        const [meta, mids] = await Promise.all([
          fetchOutcomeMeta(CURRENT_NETWORK),
          fetchAllMids(CURRENT_NETWORK),
        ]);
        if (cancel) return;
        const outcome = meta.outcomes.find((x) => x.outcome === outcomeId);
        if (!outcome) {
          setErr('Outcome not found.');
          return;
        }
        const assetKey = outcomeAssetKey(outcomeId, sideIdx);
        const sideName = outcome.sideSpecs[sideIdx]?.name ?? (sideIdx === 0 ? 'Yes' : 'No');
        const mid = Number(mids[assetKey] ?? 0);
        const book = await fetchOrderBook(CURRENT_NETWORK, assetKey).catch(() => null);
        const assetId = assetIdFromKey(assetKey, meta);
        if (cancel) return;
        setCtx({
          outcomeId,
          sideIdx,
          sideName,
          outcomeName: outcomeLabel(outcome.name, outcome.description ?? ''),
          outcomeDescription: outcome.description ?? '',
          assetKey,
          assetId,
          midPct: mid * 100,
          book,
        });
      } catch (e) {
        if (!cancel) setErr((e as Error).message);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [outcomeId, sideIdx]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="text-body-md text-on-surface-muted">Loading…</span>
      </div>
    );
  }

  if (err || !ctx) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-md text-center">
        <h2 className="text-h1 font-bold text-on-surface">Couldn't load this market</h2>
        <p className="text-body-md text-on-surface-muted">{err ?? 'Outcome data unavailable.'}</p>
      </div>
    );
  }

  // step transition — 각 step 별도 컴포넌트. URL change = remount = 자연스러운
  // page transition (CSS transition 추가 가능, 일단 instant).
  return (
    <div className="flex min-h-[60vh] flex-col gap-lg">
      <StepIndicator current={step} />
      {step === '1' && <TradeStepAmount ctx={ctx} />}
      {step === '2' && <TradeStepConfirm ctx={ctx} />}
      {step === '3' && <TradeStepResult ctx={ctx} />}
    </div>
  );
}

function StepIndicator({ current }: { current: string }): JSX.Element {
  const steps: { id: '1' | '2' | '3'; label: string }[] = [
    { id: '1', label: 'Amount' },
    { id: '2', label: 'Confirm' },
    { id: '3', label: 'Done' },
  ];
  return (
    <div className="flex items-center gap-xs">
      {steps.map((s, i) => {
        const isActive = current === s.id;
        const isDone = Number(current) > Number(s.id);
        return (
          <div key={s.id} className="flex flex-1 items-center gap-xs">
            <div
              className={
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ' +
                (isActive
                  ? 'bg-primary text-on-primary'
                  : isDone
                    ? 'bg-primary/50 text-on-primary'
                    : 'bg-divider text-on-surface-subtle')
              }
            >
              {isDone ? '✓' : s.id}
            </div>
            <span
              className={
                'text-[10px] uppercase tracking-widest ' +
                (isActive ? 'text-on-surface' : 'text-on-surface-subtle')
              }
            >
              {s.label}
            </span>
            {i < 2 && <div className="h-px flex-1 bg-divider" />}
          </div>
        );
      })}
    </div>
  );
}
