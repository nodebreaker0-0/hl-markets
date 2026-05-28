'use client';

// Phase K — basket bet UI.
//
// Two pieces, both rendered globally in app/layout.tsx:
//   - <BasketChip>  : floating bottom-right pill showing leg count, opens sheet.
//   - <BasketSheet> : drawer/modal listing legs + per-leg USD + place button.
//
// The basket lives in localStorage (lib/basket.ts) and persists across pages.
// Place flow: build N-leg HL `order` action via placeBasketBet → agent signs.

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  loadBasket,
  subscribeBasket,
  removeLeg,
  updateLegAmount,
  clearBasket,
  type BasketLeg,
} from '@/lib/basket';
import { fetchOrderBook, type OrderBook } from '@/lib/orderbook';
import { outcomeAssetId } from '@/lib/asset-id';
import { placeBasketBet, type BasketLegResolved } from '@/lib/trade';
import { useSession } from '@/lib/use-session';
import { pushToast } from '@/lib/toast';

interface BookMap {
  [coin: string]: OrderBook;
}

function coinKey(outcomeId: number, sideIdx: number): string {
  return `#${outcomeId * 10 + sideIdx}`;
}

export function BasketChip(): JSX.Element | null {
  const [legs, setLegs] = useState<BasketLeg[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLegs(loadBasket());
    return subscribeBasket(setLegs);
  }, []);

  if (legs.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-on-primary shadow-lg ring-1 ring-primary/60 hover:bg-primary-bright"
      >
        <span>Basket</span>
        <span className="rounded-full bg-surface/30 px-1.5 py-0.5 text-[10px] text-surface">
          {legs.length}
        </span>
      </button>
      <BasketSheet
        open={open}
        onClose={() => setOpen(false)}
        legs={legs}
        onChange={setLegs}
      />
    </>
  );
}

function BasketSheet({
  open,
  onClose,
  legs,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  legs: BasketLeg[];
  onChange: (legs: BasketLeg[]) => void;
}): JSX.Element | null {
  const { session } = useSession();
  const [books, setBooks] = useState<BookMap>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fetch fresh order books for every leg when the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      const entries = await Promise.all(
        legs.map(async (l) => {
          try {
            const b = await fetchOrderBook(coinKey(l.outcomeId, l.sideIdx));
            return [coinKey(l.outcomeId, l.sideIdx), b] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next: BookMap = {};
      for (const e of entries) if (e) next[e[0]] = e[1];
      setBooks(next);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 6_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, legs]);

  if (!open) return null;

  const totalUsd = legs.reduce((a, l) => a + l.usdAmount, 0);

  const onPlace = async (): Promise<void> => {
    if (!session) {
      setErr('Connect a wallet first.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const legInputs = legs.map((l) => {
        const key = coinKey(l.outcomeId, l.sideIdx);
        const book = books[key];
        if (!book || !book.bestAsk || !book.bestBid) {
          throw new Error(`${l.outcomeName} · ${l.sideName}: book not loaded yet.`);
        }
        return {
          assetId: outcomeAssetId(l.outcomeId, l.sideIdx),
          usdAmount: l.usdAmount,
          bestAskPx: book.bestAsk.px,
          bestAskSz: book.bestAsk.sz,
          bestBidPx: book.bestBid.px,
          asks: book.asks,
          label: `${l.outcomeName} · ${l.sideName}`,
        };
      });
      const { response } = await placeBasketBet({
        address: session.address,
        legs: legInputs,
      });
      // Aggregate per-leg status into a single toast.
      const obj = response as {
        response?: {
          data?: {
            statuses?: Array<{
              filled?: { totalSz?: string; avgPx?: string; oid?: number };
              error?: string;
            }>;
          };
        };
      };
      const statuses = obj?.response?.data?.statuses ?? [];
      let filled = 0;
      let errored = 0;
      const errors: string[] = [];
      statuses.forEach((s, i) => {
        if (s.filled) filled += 1;
        else if (s.error) {
          errored += 1;
          errors.push(`${legs[i]?.outcomeName ?? '?'}: ${s.error}`);
        }
      });
      pushToast({
        tone: errored > 0 ? 'info' : 'success',
        message: `Basket: ${filled} filled · ${errored} error · of ${legs.length}`,
        detail: errors.slice(0, 2).join(' · ') || undefined,
        ttlMs: 7000,
      });
      // Clear basket only when fully filled — leave failing legs behind so
      // the user can adjust amount/wait for book recovery and retry.
      if (errored === 0 && filled === legs.length) {
        clearBasket();
        onChange([]);
        onClose();
      }
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      pushToast({ tone: 'error', message: 'Basket bet failed', detail: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex w-full max-w-md flex-col rounded-t-xl bg-surface-overlay sm:rounded-xl">
        {/* Header — DESIGN.md modal (surface-overlay + xl rounded + 24px). */}
        <header className="flex items-center justify-between gap-3 px-lg pt-lg pb-md">
          <div className="flex flex-col gap-px">
            <span className="text-caption uppercase tracking-widest text-on-surface-muted">
              Basket bet
            </span>
            <h2 className="text-h2 font-semibold leading-snug text-on-surface">
              {legs.length === 0 ? 'Empty' : `${legs.length} leg${legs.length === 1 ? '' : 's'}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close basket"
            className="rounded-full p-2 text-on-surface-muted transition-colors hover:bg-surface-elevated hover:text-on-surface"
          >
            ✕
          </button>
        </header>

        {/* W-11 — step indicator (visual progress: edit → review → sign).
            현재 multi-page modal 은 아니지만 단일 sheet 안에서도 시각적 단계
            표시. busy state 가 sign 진행, err 가 fail. */}
        {legs.length > 0 && (
          <div className="flex items-center gap-xs px-lg pb-sm">
            {(['Edit', 'Review', 'Sign'] as const).map((label, i) => {
              const active = busy ? i === 2 : err ? i === 1 : i === 0;
              const done = busy ? i < 2 : err ? false : i < 0;
              return (
                <div key={label} className="flex flex-1 items-center gap-xs">
                  <div
                    className={clsx(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
                      active && 'bg-primary text-on-primary',
                      done && 'bg-primary/50 text-on-primary',
                      !active && !done && 'bg-divider text-on-surface-subtle',
                    )}
                  >
                    {i + 1}
                  </div>
                  <span
                    className={clsx(
                      'text-[10px] uppercase tracking-widest',
                      active ? 'text-on-surface' : 'text-on-surface-subtle',
                    )}
                  >
                    {label}
                  </span>
                  {i < 2 && <div className="h-px flex-1 bg-divider" />}
                </div>
              );
            })}
          </div>
        )}

        {/* Body */}
        {legs.length === 0 ? (
          <div className="px-lg py-2xl text-center text-body-sm text-on-surface-muted">
            Basket is empty. Add legs from any market.
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-2 overflow-y-auto px-lg pb-md">
            {legs.map((l) => (
              <LegRow
                key={l.id}
                leg={l}
                book={books[coinKey(l.outcomeId, l.sideIdx)] ?? null}
                onUsdChange={(usd) => onChange(updateLegAmount(l.id, usd))}
                onRemove={() => onChange(removeLeg(l.id))}
              />
            ))}
          </div>
        )}

        {/* Footer — Total intent hero + sticky CTA (DESIGN.md token).
            모바일 한 손 thumb 친화 — bottom sticky pattern (W-15 의도 흡수). */}
        {legs.length > 0 && (
          <div className="flex flex-col gap-md border-t border-divider bg-surface-elevated px-lg py-md">
            {/* Total intent — big-number-md hero. Polymarket "total" 시각. */}
            <div className="flex items-baseline justify-between">
              <span className="text-caption uppercase tracking-widest text-on-surface-muted">
                Total intent
              </span>
              <span className="mono text-big-number-md font-bold leading-none text-on-surface tabular-nums">
                ${totalUsd.toFixed(2)}
              </span>
            </div>

            {err && (
              <div className="rounded-md bg-accent-down/12 px-md py-sm text-body-sm text-accent-down">
                {err}
              </div>
            )}

            <div className="flex gap-sm">
              <button
                type="button"
                onClick={() => {
                  clearBasket();
                  onChange([]);
                }}
                disabled={busy}
                className="rounded-md bg-surface px-base py-md text-button font-semibold text-on-surface-muted transition-colors hover:bg-surface-elevated hover:text-on-surface disabled:opacity-40"
              >
                Clear
              </button>
              {/* Primary solid mint — DESIGN.md button-primary, full-width thumb-friendly */}
              <button
                type="button"
                onClick={() => void onPlace()}
                disabled={busy || !session}
                className={clsx(
                  'flex-1 rounded-md bg-primary px-base py-md text-button font-bold text-on-primary transition-colors hover:bg-primary-bright',
                  (busy || !session) && 'cursor-not-allowed bg-divider text-on-surface-disabled hover:bg-divider',
                )}
              >
                {busy
                  ? 'Signing & placing…'
                  : !session
                    ? 'Connect wallet'
                    : `Place ${legs.length}-leg basket · $${totalUsd.toFixed(0)}`}
              </button>
            </div>

            <div className="text-center text-[10px] text-on-surface-muted">
              One agent signature · IOC at best ask + 2% slip · builder fee on sell only
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LegRow({
  leg,
  book,
  onUsdChange,
  onRemove,
}: {
  leg: BasketLeg;
  book: OrderBook | null;
  onUsdChange: (usd: number) => void;
  onRemove: () => void;
}): JSX.Element {
  const ask = book?.bestAsk?.px ?? null;
  const sharesPreview =
    ask && leg.usdAmount > 0 ? Math.ceil(leg.usdAmount / ask) : 0;
  const payoutPreview = sharesPreview;

  return (
    <div className="rounded-xl border border-divider bg-surface-elevated p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-on-surface">
            {leg.outcomeName}
            <span className="ml-1 text-xs font-normal text-on-surface-muted">· {leg.sideName}</span>
          </div>
          {leg.questionTitle && (
            <div className="text-[10px] text-on-surface-muted/70">{leg.questionTitle}</div>
          )}
          {ask !== null && (
            <div className="mt-0.5 text-[10px] text-on-surface-muted">
              Current ask: {(ask * 100).toFixed(1)}%
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-[10px] text-on-surface-muted hover:text-accent-down"
        >
          remove
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">USD</span>
        <input
          value={String(leg.usdAmount)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onUsdChange(v);
          }}
          inputMode="decimal"
          className="w-24 rounded border border-divider bg-surface px-2 py-1 font-mono text-sm text-on-surface focus:border-primary focus:outline-none"
        />
        {sharesPreview > 0 && (
          <span className="text-[11px] text-on-surface-muted">
            → {sharesPreview} shares · wins ${payoutPreview.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
