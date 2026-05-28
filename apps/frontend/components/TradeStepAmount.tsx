'use client';

// Phase X-051 — TradeFlow Step 1: amount input.
// 토스 패턴 — 한 화면 한 액션. big-number $ input + quick chips + Continue.
// outcome / side / 현재 % chance 는 hero 에 미리 보여 사용자 confidence.

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import clsx from 'clsx';
import type { TradeContext } from '@/app/trade/page';

const MIN_USD = 10;
const QUICK_CHIPS = [10, 25, 50, 100] as const;

export function TradeStepAmount({ ctx }: { ctx: TradeContext }): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [usdInput, setUsdInput] = useState<string>(sp.get('amount') ?? '');

  const usdNum = Number(usdInput);
  const usdValid = Number.isFinite(usdNum) && usdNum > 0;
  const belowMin = usdValid && usdNum < MIN_USD;
  const canContinue = usdValid && !belowMin;

  function goNext(): void {
    if (!canContinue) return;
    const params = new URLSearchParams(sp.toString());
    params.set('step', '2');
    params.set('amount', String(usdNum));
    router.push(`${pathname}?${params.toString()}`);
  }

  // 가격이 0~100 % 표시. potential payout — $X at marketPct → wins ~X/marketPct
  const potentialPayout = usdValid && ctx.midPct > 0
    ? usdNum / (ctx.midPct / 100)
    : 0;

  return (
    <div className="flex flex-col gap-2xl">
      {/* Hero — outcome + side + current % */}
      <section className="flex flex-col gap-md">
        <span className="text-caption uppercase tracking-widest text-on-surface-muted">
          {ctx.sideIdx === 0 ? 'Buy YES' : 'Buy NO'} on
        </span>
        <h1 className="text-h1 font-bold leading-tight text-on-surface">
          {ctx.outcomeName}
        </h1>
        <div className="flex items-baseline gap-md">
          <span className="mono text-big-number-md font-bold leading-none text-primary tabular-nums">
            {ctx.midPct.toFixed(1)}%
          </span>
          <span className="text-caption uppercase tracking-widest text-on-surface-muted">
            current {ctx.sideName}
          </span>
        </div>
      </section>

      {/* Amount input — big-number, $ prefix, tnum */}
      <section className="flex flex-col gap-md">
        <label className="flex flex-col gap-sm">
          <span className="text-caption uppercase tracking-widest text-on-surface-muted">
            How much?
          </span>
          <div
            className={clsx(
              'flex items-center gap-2 border-b-2 pb-sm transition-colors',
              belowMin ? 'border-accent-down' : usdInput ? 'border-primary' : 'border-divider',
            )}
          >
            <span
              className={clsx(
                'mono text-big-number font-bold tabular-nums leading-none',
                belowMin ? 'text-accent-down' : 'text-on-surface-muted',
              )}
            >
              $
            </span>
            <input
              autoFocus
              value={usdInput}
              onChange={(e) => setUsdInput(e.target.value.replace(/[^0-9.]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') goNext();
              }}
              placeholder="0"
              inputMode="decimal"
              aria-label="Bet amount in USD"
              className={clsx(
                'mono flex-1 bg-transparent text-big-number font-bold tabular-nums leading-none focus:outline-none placeholder:text-on-surface-subtle',
                belowMin ? 'text-accent-down' : 'text-on-surface',
              )}
            />
          </div>
        </label>

        {/* Quick chips — 토스 친화 4 preset */}
        <div className="flex flex-wrap gap-sm">
          {QUICK_CHIPS.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setUsdInput(String(amt))}
              className="rounded-full bg-surface-elevated px-base py-sm text-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-overlay"
            >
              ${amt}
            </button>
          ))}
        </div>

        {/* Helper */}
        <div className="text-body-sm text-on-surface-muted">
          {belowMin ? (
            <span className="text-accent-down">Minimum bet ${MIN_USD}.</span>
          ) : usdValid ? (
            <>
              If <strong className="text-on-surface">{ctx.sideName}</strong> wins,
              you receive{' '}
              <strong className="text-primary">${potentialPayout.toFixed(2)}</strong>.
            </>
          ) : (
            <>HL min ${MIN_USD}. Buy fee 0 · sell fee applies later.</>
          )}
        </div>
      </section>

      {/* Continue button — sticky bottom on mobile */}
      <div className="sticky bottom-base mt-auto sm:bottom-auto">
        <button
          type="button"
          onClick={goNext}
          disabled={!canContinue}
          className={clsx(
            'w-full rounded-md px-base py-md text-button font-bold transition-colors',
            canContinue
              ? 'bg-primary text-on-primary hover:bg-primary-bright'
              : 'cursor-not-allowed bg-divider text-on-surface-disabled',
          )}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
