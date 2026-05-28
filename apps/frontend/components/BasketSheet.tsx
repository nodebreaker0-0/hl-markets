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
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-hl-mint px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-hl-bg shadow-lg ring-1 ring-hl-mint/60 hover:bg-hl-mint/90"
      >
        <span>Basket</span>
        <span className="rounded-full bg-hl-bg/30 px-1.5 py-0.5 text-[10px] text-hl-bg">
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
      <div className="w-full max-w-md rounded-t-2xl border border-hl-border bg-hl-bg p-4 sm:rounded-2xl">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-hl-text">
            Basket bet · {legs.length} legs
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-hl-subtle hover:text-hl-text"
          >
            Close
          </button>
        </header>

        {legs.length === 0 ? (
          <div className="py-8 text-center text-xs text-hl-subtle">
            Basket is empty. Add legs from any market.
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
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

        {legs.length > 0 && (
          <>
            <div className="mt-3 flex items-center justify-between border-t border-hl-border pt-3 text-xs">
              <span className="text-hl-subtle">Total intent</span>
              <span className="mono font-semibold text-hl-text">${totalUsd.toFixed(2)}</span>
            </div>

            {err && (
              <div className="mt-2 rounded-lg border border-mainnet/40 bg-mainnet/10 px-2 py-1 text-[11px] text-mainnet">
                {err}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  clearBasket();
                  onChange([]);
                }}
                disabled={busy}
                className="flex-1 rounded-full border border-hl-border bg-hl-surface px-3 py-2 text-xs text-hl-subtle hover:text-hl-text"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => void onPlace()}
                disabled={busy || !session}
                className={clsx(
                  'flex-[2] rounded-full bg-hl-mint/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-hl-mint ring-1 ring-hl-mint',
                  busy && 'cursor-wait opacity-60',
                )}
              >
                {busy ? 'Placing…' : `Place ${legs.length}-leg basket`}
              </button>
            </div>
            <div className="mt-2 text-center text-[10px] text-hl-subtle">
              One agent signature · each leg IOC at best ask + 2% slip · builder fee on sell only
            </div>
          </>
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
    <div className="rounded-xl border border-hl-border bg-hl-surface p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-hl-text">
            {leg.outcomeName}
            <span className="ml-1 text-xs font-normal text-hl-subtle">· {leg.sideName}</span>
          </div>
          {leg.questionTitle && (
            <div className="text-[10px] text-hl-subtle/70">{leg.questionTitle}</div>
          )}
          {ask !== null && (
            <div className="mt-0.5 text-[10px] text-hl-subtle">
              Current ask: {(ask * 100).toFixed(1)}%
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-[10px] text-hl-subtle hover:text-mainnet"
        >
          remove
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-hl-subtle">USD</span>
        <input
          value={String(leg.usdAmount)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onUsdChange(v);
          }}
          inputMode="decimal"
          className="w-24 rounded border border-hl-border bg-hl-bg px-2 py-1 font-mono text-sm text-hl-text focus:border-hl-mint focus:outline-none"
        />
        {sharesPreview > 0 && (
          <span className="text-[11px] text-hl-subtle">
            → {sharesPreview} shares · wins ${payoutPreview.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
