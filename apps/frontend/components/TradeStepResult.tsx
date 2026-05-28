'use client';

// Phase X-053 — TradeFlow Step 3: result. ✓ icon + filled summary + CTA.
//
// fillId 가 URL 에 있어야 (Step 2 의 sign 결과). 없으면 fallback.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { TradeContext } from '@/app/trade/page';

export function TradeStepResult({ ctx }: { ctx: TradeContext }): JSX.Element {
  const sp = useSearchParams();
  const amount = Number(sp.get('amount') ?? '0');
  const fillId = sp.get('fillId') ?? '';

  return (
    <div className="flex flex-col items-center gap-2xl py-2xl text-center">
      {/* ✓ icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-on-primary text-4xl font-bold">
        ✓
      </div>

      <section className="flex flex-col gap-md">
        <h1 className="text-h1 font-bold leading-tight text-on-surface">
          Bet placed.
        </h1>
        <p className="max-w-md text-body-md text-on-surface-muted">
          Your <strong className="text-on-surface">${amount.toFixed(2)}</strong> bet on{' '}
          <strong className="text-on-surface">{ctx.sideName}</strong> for{' '}
          <strong className="text-on-surface">{ctx.outcomeName}</strong> has
          been forwarded to Hyperliquid. You can monitor it in Portfolio.
        </p>
        {fillId && fillId !== 'ok' && (
          <span className="mono text-caption text-on-surface-subtle tabular-nums">
            fill #{fillId}
          </span>
        )}
      </section>

      {/* CTAs */}
      <div className="flex w-full max-w-md flex-col gap-sm">
        <Link
          href="/portfolio"
          className="w-full rounded-md bg-primary px-base py-md text-center text-button font-bold text-on-primary transition-colors hover:bg-primary-bright"
        >
          View position →
        </Link>
        <Link
          href="/"
          className="w-full rounded-md bg-surface-elevated px-base py-md text-center text-button font-semibold text-on-surface transition-colors hover:bg-surface-overlay"
        >
          Back to home
        </Link>
        <Link
          href={`/trade?id=${ctx.outcomeId}&side=${ctx.sideIdx === 0 ? 'yes' : 'no'}&step=1`}
          className="w-full text-center text-body-sm text-on-surface-muted transition-colors hover:text-on-surface"
        >
          Bet again on this outcome
        </Link>
      </div>
    </div>
  );
}
