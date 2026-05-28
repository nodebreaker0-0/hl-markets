'use client';

// Phase N — Arb scanner banner. Polls the active outcome questions every
// 60 seconds, surfaces guaranteed-positive baskets at the top of the home
// page, and lets the user pre-fill the basket with one click.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { scanArb, type ArbOpportunity } from '@/lib/arb';
import { CURRENT_NETWORK } from '@/lib/network';
import { addLeg as basketAddLeg, clearBasket } from '@/lib/basket';
import { pushToast } from '@/lib/toast';

const REFRESH_MS = 60_000;

export function ArbAlerts(): JSX.Element | null {
  const [opps, setOpps] = useState<ArbOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const r = await scanArb(CURRENT_NETWORK);
        if (!cancelled) {
          setOpps(r);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (loading && opps.length === 0) return null;
  if (opps.length === 0) return null;

  return (
    <section className="rounded-2xl border border-hl-mint/40 bg-hl-mint/5 p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-hl-mint">
        <span>⚡ Arb opportunities</span>
        <span className="text-hl-subtle">
          {opps.length} found · refreshes every {REFRESH_MS / 1000}s
        </span>
      </div>
      <div className="space-y-1.5">
        {opps.slice(0, 5).map((o) => (
          <ArbRow key={o.question.question} opp={o} />
        ))}
      </div>
      {error && (
        <div className="mt-2 text-[10px] text-hl-subtle">scanner: {error}</div>
      )}
    </section>
  );
}

function ArbRow({ opp }: { opp: ArbOpportunity }): JSX.Element {
  return (
    <article className="flex flex-col gap-1 rounded-xl border border-hl-mint/30 bg-hl-bg/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Link
          href={`/q/?id=${opp.question.question}`}
          className="text-sm font-semibold text-hl-text hover:text-hl-mint"
        >
          {opp.question.name}
        </Link>
        <div className="mt-0.5 text-[11px] text-hl-subtle">
          {opp.optionCount} options · ask sum{' '}
          <strong className="text-hl-mint">${opp.askSum.toFixed(3)}</strong>
          {' · spend '}
          <strong className="text-hl-text">${opp.minBasketCost.toFixed(2)}</strong>
          {' → guaranteed '}
          <strong className="text-hl-mint">+${opp.estimatedProfit.toFixed(2)}</strong>
          {' ('}
          {(opp.estimatedRoi * 100).toFixed(2)}
          {'%)'}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          // Replace whatever was in the basket and pre-fill with this arb.
          clearBasket();
          for (const leg of opp.legs) {
            try {
              basketAddLeg({
                outcomeId: leg.outcomeId,
                sideIdx: 0, // Yes side
                outcomeName: leg.name,
                sideName: 'Yes',
                questionTitle: opp.question.name,
                usdAmount: Math.max(10, leg.askPx * leg.sharesPerLeg),
              });
            } catch {
              /* skip if cap reached */
            }
          }
          pushToast({
            tone: 'success',
            message: `Arb basket loaded · ${opp.optionCount} legs`,
            detail: `Open the basket (bottom-right) to place. Spend ~$${opp.minBasketCost.toFixed(2)} → +$${opp.estimatedProfit.toFixed(2)}`,
            ttlMs: 6000,
          });
        }}
        className={clsx(
          'self-start rounded-full bg-hl-mint/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-hl-mint ring-1 ring-hl-mint',
          'hover:bg-hl-mint/25',
        )}
      >
        Load to basket →
      </button>
    </article>
  );
}
