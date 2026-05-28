'use client';

// Phase X-040 — Outcome detail sheet.
//
// URL ?sheet=outcome&id=<outcomeId>[&qid=<questionId>] 기반.
// 모바일 = bottom sheet (slide up). 데스크탑 = center modal.
// page transition 없음 — 사용자가 home / markets context 잃지 않음.
//
// Content (compact):
//   - outcome name + question title
//   - big-number-md % chance + market $
//   - Buy YES / Buy NO CTA → /trade?id=N&step=1&side=...
//   - ✨ Analyze with AI button → AIAnalystSheet (T-X-061)
//   - orderbook top 3 levels
//   - "Open full page →" (deep link to /o or /q)
//
// Deep link: /?sheet=outcome&id=10287 — 직접 URL 로 진입 시에도 sheet 자동 open.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
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

export function OutcomeDetailSheet(): JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const sheet = sp.get('sheet');
  const id = sp.get('id');

  const isOpen = sheet === 'outcome' && id !== null;
  const outcomeId = id !== null ? Number(id) : null;

  // Data
  const [outcome, setOutcome] = useState<OutcomeMetaEntry | null>(null);
  const [mids, setMids] = useState<AllMidsResponse>({});
  const [book, setBook] = useState<OrderBook | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || outcomeId === null || Number.isNaN(outcomeId)) {
      setOutcome(null);
      setBook(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    Promise.all([fetchOutcomeMeta(CURRENT_NETWORK), fetchAllMids(CURRENT_NETWORK)])
      .then(([meta, m]) => {
        if (cancel) return;
        const o = meta.outcomes.find((x) => x.outcome === outcomeId);
        setOutcome(o ?? null);
        setMids(m);
        // top side orderbook
        if (o) {
          const key = outcomeAssetKey(outcomeId, 0);
          fetchOrderBook(CURRENT_NETWORK, key).then((b) => {
            if (!cancel) setBook(b);
          }).catch(() => undefined);
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

  // ESC to close
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
    params.delete('sheet');
    params.delete('id');
    params.delete('qid');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname ?? '/');
  }

  if (!isOpen || outcomeId === null) return null;

  const pctYes = outcome
    ? Number(mids[outcomeAssetKey(outcomeId, 0)] ?? 0) * 100
    : null;
  const pctNo = outcome && outcome.sideSpecs.length === 2
    ? Number(mids[outcomeAssetKey(outcomeId, 1)] ?? 0) * 100
    : null;
  const yesName = outcome?.sideSpecs[0]?.name ?? 'Yes';
  const noName = outcome?.sideSpecs[1]?.name ?? 'No';
  const title = outcome
    ? outcomeLabel(outcome.name, outcome.description ?? '')
    : `Outcome #${outcomeId}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="outcome-sheet-title"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSheet();
      }}
    >
      <div className="flex w-full max-w-lg flex-col rounded-t-xl bg-surface-overlay sm:rounded-xl">
        {/* Header */}
        <header className="flex items-start justify-between gap-md px-lg pt-lg pb-md">
          <div className="flex min-w-0 flex-col gap-px">
            <span className="text-caption uppercase tracking-widest text-on-surface-muted">
              outcome #{outcomeId}
            </span>
            <h2
              id="outcome-sheet-title"
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

        {loading && !outcome ? (
          <div className="px-lg pb-lg text-center text-body-sm text-on-surface-muted">
            Loading…
          </div>
        ) : !outcome ? (
          <div className="px-lg pb-lg text-center text-body-sm text-on-surface-muted">
            Outcome not found on {CURRENT_NETWORK}.
          </div>
        ) : (
          <>
            {/* % chance hero */}
            <div className="flex items-baseline gap-md px-lg pb-md">
              <span className="mono text-big-number font-bold leading-none text-primary tabular-nums">
                {pctYes !== null ? `${pctYes.toFixed(1)}%` : '—'}
              </span>
              <span className="text-caption uppercase tracking-widest text-on-surface-muted">
                {yesName}
              </span>
              {pctNo !== null && (
                <span className="ml-auto text-caption text-on-surface-muted">
                  {noName}: <span className="mono tabular-nums">{pctNo.toFixed(1)}%</span>
                </span>
              )}
            </div>

            {/* Buy CTA — dual Polymarket pattern */}
            <div className="flex gap-sm px-lg pb-md">
              <Link
                href={`/trade?id=${outcomeId}&step=1&side=yes`}
                className="flex-1 rounded-md bg-accent-up/15 px-base py-md text-center text-button font-bold text-accent-up transition-colors hover:bg-accent-up/25"
                onClick={closeSheet}
              >
                ↑ Buy {yesName}
              </Link>
              {pctNo !== null && (
                <Link
                  href={`/trade?id=${outcomeId}&step=1&side=no`}
                  className="flex-1 rounded-md bg-accent-down/15 px-base py-md text-center text-button font-bold text-accent-down transition-colors hover:bg-accent-down/25"
                  onClick={closeSheet}
                >
                  ↓ Buy {noName}
                </Link>
              )}
            </div>

            {/* AI Analyze (✨ inline, T-X-060) */}
            <div className="px-lg pb-md">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-base py-md text-button font-semibold text-primary transition-colors hover:bg-primary/10"
                onClick={() => {
                  // Phase X-060 — AI Analyst sheet trigger. Stub: navigate to
                  // /trade 와 비슷한 패턴으로 다음 turn 에서 AIAnalystSheet 연결.
                  const params = new URLSearchParams(sp.toString());
                  params.set('analyze', String(outcomeId));
                  router.push(`${pathname}?${params.toString()}`);
                }}
              >
                ✨ Analyze with AI
              </button>
            </div>

            {/* Orderbook top 3 */}
            {book && (book.bids.length > 0 || book.asks.length > 0) && (
              <div className="border-t border-divider px-lg py-md">
                <div className="mb-sm text-[10px] uppercase tracking-widest text-on-surface-muted">
                  Order book · {yesName}
                </div>
                <div className="grid grid-cols-2 gap-md text-body-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
                      Bids
                    </div>
                    {book.bids.slice(0, 3).map((b, i) => (
                      <div key={i} className="mono flex justify-between tabular-nums">
                        <span className="text-accent-up">{(b.px * 100).toFixed(1)}%</span>
                        <span className="text-on-surface-muted">{b.sz.toFixed(0)}</span>
                      </div>
                    ))}
                    {book.bids.length === 0 && (
                      <div className="mono text-on-surface-subtle">—</div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
                      Asks
                    </div>
                    {book.asks.slice(0, 3).map((a, i) => (
                      <div key={i} className="mono flex justify-between tabular-nums">
                        <span className="text-accent-down">{(a.px * 100).toFixed(1)}%</span>
                        <span className="text-on-surface-muted">{a.sz.toFixed(0)}</span>
                      </div>
                    ))}
                    {book.asks.length === 0 && (
                      <div className="mono text-on-surface-subtle">—</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Deep link to full page */}
            <div className="border-t border-divider px-lg py-md">
              <Link
                href={`/o?id=${outcomeId}`}
                onClick={closeSheet}
                className="inline-flex items-center gap-1 text-body-sm text-on-surface-muted transition-colors hover:text-on-surface"
              >
                Open full page →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
