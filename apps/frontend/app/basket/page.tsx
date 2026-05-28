'use client';

// Phase X-030 — Basket page (BasketSheet modal 의 full page 버전).
//
// 모바일 bottom nav 의 [🛒 Basket] 으로 진입. 한 leg 없어도 visible (empty
// state). leg edit / remove / ship 모두 한 page 에서.

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
import { CURRENT_NETWORK } from '@/lib/network';
import { loadAgent } from '@/lib/agent';
import { EnableTradingModal } from '@/components/EnableTradingModal';
import { fetchOutcomeMeta } from '@/lib/api';

interface BookMap {
  [coin: string]: OrderBook;
}

function coinKey(outcomeId: number, sideIdx: number): string {
  return `#${outcomeId * 10 + sideIdx}`;
}

export default function BasketPage(): JSX.Element {
  const { session } = useSession();
  const [legs, setLegs] = useState<BasketLeg[]>([]);
  const [books, setBooks] = useState<BookMap>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needAgent, setNeedAgent] = useState(false);

  // subscribe basket state
  useEffect(() => {
    setLegs(loadBasket());
    return subscribeBasket(setLegs);
  }, []);

  // fetch orderbooks for each leg
  useEffect(() => {
    if (legs.length === 0) return;
    let cancel = false;
    (async () => {
      const out: BookMap = {};
      await Promise.all(
        legs.map(async (l) => {
          const key = coinKey(l.outcomeId, l.sideIdx);
          try {
            const b = await fetchOrderBook(CURRENT_NETWORK, key);
            if (!cancel) out[key] = b;
          } catch {
            // ignore
          }
        }),
      );
      if (!cancel) setBooks(out);
    })();
    return () => {
      cancel = true;
    };
  }, [legs]);

  const totalUsd = legs.reduce((s, l) => s + (l.usdAmount > 0 ? l.usdAmount : 0), 0);

  async function onPlace(): Promise<void> {
    if (!session) {
      pushToast({ tone: 'error', message: 'Connect wallet first.' });
      return;
    }
    const agent = await loadAgent(session.address, CURRENT_NETWORK);
    if (!agent) {
      setNeedAgent(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const meta = await fetchOutcomeMeta(CURRENT_NETWORK);
      const resolved: BasketLegResolved[] = legs.map((l) => {
        const key = coinKey(l.outcomeId, l.sideIdx);
        const book = books[key];
        if (!book || book.asks.length === 0) {
          throw new Error(`No liquidity for ${l.outcomeName}`);
        }
        const askPx = book.asks[0].px;
        const askSz = book.asks[0].sz;
        const bidPx = book.bids[0]?.px ?? 0;
        return {
          outcomeId: l.outcomeId,
          sideIdx: l.sideIdx,
          assetId: outcomeAssetId(l.outcomeId, l.sideIdx, meta),
          usdAmount: l.usdAmount,
          bestAskPx: askPx,
          bestAskSz: askSz,
          bestBidPx: bidPx,
          asks: book.asks,
          slippagePct: 2,
        };
      });
      await placeBasketBet({
        agent,
        wallet: session.address,
        network: CURRENT_NETWORK,
        legs: resolved,
      });
      pushToast({ tone: 'success', message: `${legs.length}-leg basket placed.` });
      clearBasket();
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      pushToast({ tone: 'error', message: 'Basket failed', detail: msg });
    } finally {
      setBusy(false);
    }
  }

  // ----- Empty state -----
  if (legs.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-md py-2xl text-center">
        <span className="text-6xl" aria-hidden>🛒</span>
        <h1 className="text-h1 font-bold text-on-surface">Your basket is empty.</h1>
        <p className="max-w-md text-body-md text-on-surface-muted">
          Add multiple outcome bets and place them all with one wallet
          signature. Start by browsing markets or asking AI for picks.
        </p>
        <div className="mt-md flex flex-col gap-sm sm:flex-row">
          <Link
            href="/"
            className="rounded-md bg-primary px-base py-md text-button font-bold text-on-primary transition-colors hover:bg-primary-bright"
          >
            ✨ Ask AI for picks
          </Link>
          <Link
            href="/markets"
            className="rounded-md bg-surface-elevated px-base py-md text-button font-semibold text-on-surface transition-colors hover:bg-surface-overlay"
          >
            Browse all markets →
          </Link>
        </div>
      </div>
    );
  }

  // ----- Filled state -----
  return (
    <div className="flex flex-col gap-2xl pb-2xl">
      <section className="flex flex-col gap-md pt-base">
        <span className="text-caption uppercase tracking-widest text-on-surface-muted">
          Basket bet · {legs.length} leg{legs.length === 1 ? '' : 's'}
        </span>
        <h1 className="text-h1 font-bold leading-tight text-on-surface">
          One signature, multi-leg.
        </h1>
        <p className="max-w-2xl text-body-sm text-on-surface-muted">
          Each leg fires IOC at best ask + 2% slip. Buy fee 0 (HIP-4) · sell
          fee 5 bps on close. Browser agent privkey, no popup.
        </p>
      </section>

      {/* Leg list */}
      <section className="flex flex-col gap-sm">
        {legs.map((l) => (
          <LegCard
            key={l.id}
            leg={l}
            book={books[coinKey(l.outcomeId, l.sideIdx)] ?? null}
            onUsdChange={(usd) => updateLegAmount(l.id, usd)}
            onRemove={() => removeLeg(l.id)}
          />
        ))}
      </section>

      {/* Total intent hero */}
      <section className="rounded-lg bg-surface-elevated p-lg">
        <div className="flex items-baseline justify-between">
          <span className="text-caption uppercase tracking-widest text-on-surface-muted">
            Total intent
          </span>
          <span className="mono text-big-number font-bold leading-none text-on-surface tabular-nums">
            ${totalUsd.toFixed(2)}
          </span>
        </div>
      </section>

      {err && (
        <div className="rounded-md border border-accent-down/40 bg-accent-down/10 px-base py-md text-body-sm text-accent-down">
          {err}
        </div>
      )}

      {/* Sticky bottom CTA */}
      <div className="sticky bottom-base flex gap-sm sm:bottom-auto">
        <button
          type="button"
          onClick={() => clearBasket()}
          disabled={busy}
          className="rounded-md bg-surface px-base py-md text-button font-semibold text-on-surface-muted transition-colors hover:bg-surface-elevated hover:text-on-surface disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => void onPlace()}
          disabled={busy || !session}
          className={clsx(
            'flex-1 rounded-md px-base py-md text-button font-bold transition-colors',
            busy || !session
              ? 'cursor-not-allowed bg-divider text-on-surface-disabled'
              : 'bg-primary text-on-primary hover:bg-primary-bright',
          )}
        >
          {busy
            ? 'Signing & placing…'
            : !session
              ? 'Connect wallet first'
              : `Place ${legs.length}-leg basket · $${totalUsd.toFixed(0)}`}
        </button>
      </div>

      {needAgent && session && (
        <EnableTradingModal
          wallet={session.address}
          onDone={() => {
            setNeedAgent(false);
            void onPlace();
          }}
          onCancel={() => setNeedAgent(false)}
        />
      )}
    </div>
  );
}

// ----- Leg card -----
function LegCard({
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
  const askPx = book?.asks[0]?.px ?? 0;
  const askPct = askPx > 0 ? askPx * 100 : null;
  const shares = askPx > 0 ? Math.ceil(leg.usdAmount / askPx) : 0;
  const winPayout = shares;

  return (
    <div className="rounded-lg bg-surface-elevated p-md">
      <div className="flex items-start justify-between gap-md">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-body-md font-semibold text-on-surface">
            {leg.outcomeName}
          </span>
          <span className="text-caption uppercase tracking-widest text-on-surface-muted">
            {leg.sideName} · current{' '}
            {askPct !== null ? (
              <span className="mono text-primary">{askPct.toFixed(1)}%</span>
            ) : (
              <span className="text-on-surface-subtle">—</span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${leg.outcomeName}`}
          className="shrink-0 text-caption text-on-surface-muted transition-colors hover:text-accent-down"
        >
          remove
        </button>
      </div>

      <div className="mt-md flex items-center gap-md">
        <label className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">
            USD
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={leg.usdAmount === 0 ? '' : String(leg.usdAmount)}
            onChange={(e) => onUsdChange(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
            className="mono w-24 rounded-md bg-surface px-2 py-1 text-mono-md tabular-nums text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Bet amount"
          />
        </label>
        <div className="text-body-sm text-on-surface-muted">
          → <span className="mono tabular-nums text-on-surface">{shares}</span> shares
          {shares > 0 && askPct !== null && (
            <>
              {' '}· wins{' '}
              <span className="mono tabular-nums text-primary">${winPayout.toFixed(2)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
