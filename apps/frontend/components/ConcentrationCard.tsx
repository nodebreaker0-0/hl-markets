'use client';

// Phase P — Position concentration / correlation visualization.
//
// Two simple metrics calculated client-side from the portfolio snapshot:
//   - HHI (Herfindahl-Hirschman Index): sum of squared % weights. 0 (perfectly
//     diversified) → 1 (single-position concentration). We display as 0-100.
//   - "By question": legs grouped by the underlying question. A user betting
//     on 5 different World Cup teams in the same question is more diversified
//     than 5 single-option bets across 5 questions.

import { useMemo } from 'react';
import clsx from 'clsx';
import type { Holding } from '@/lib/portfolio';

interface Props {
  holdings: Holding[];
}

export function ConcentrationCard({ holdings }: Props): JSX.Element | null {
  const stats = useMemo(() => computeConcentration(holdings), [holdings]);
  if (!stats) return null;

  return (
    <section className="rounded-2xl border border-hl-border bg-hl-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-hl-subtle">
          Concentration
        </div>
        <div className="mono text-xs text-hl-text">
          HHI {stats.hhi.toFixed(0)} / 100
        </div>
      </div>

      <div className="space-y-1.5">
        {stats.bars.map((b) => (
          <div key={b.outcomeId} className="flex items-center gap-2 text-[11px]">
            <span className="w-28 truncate text-hl-subtle">{b.name}</span>
            <div className="relative h-2 flex-1 rounded-full bg-hl-bg">
              <div
                className={clsx(
                  'absolute inset-y-0 left-0 rounded-full',
                  b.pct >= 50
                    ? 'bg-mainnet'
                    : b.pct >= 25
                      ? 'bg-testnet'
                      : 'bg-hl-mint',
                )}
                style={{ width: `${b.pct.toFixed(1)}%` }}
              />
            </div>
            <span className="mono w-10 text-right text-hl-text">
              {b.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[10px] text-hl-subtle">
        {stats.note}
      </div>
    </section>
  );
}

interface Stats {
  hhi: number; // 0-100
  bars: { outcomeId: number; name: string; pct: number }[];
  note: string;
}

function computeConcentration(holdings: Holding[]): Stats | null {
  if (holdings.length === 0) return null;
  const total = holdings.reduce((a, h) => a + (h.markValue ?? 0), 0);
  if (total <= 0) return null;
  const bars = holdings
    .map((h) => ({
      outcomeId: h.outcomeId,
      name: `${h.outcomeName} · ${h.sideName}`,
      pct: ((h.markValue ?? 0) / total) * 100,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);
  // HHI in 0-1 then scale to 0-100.
  const weights = holdings.map((h) => (h.markValue ?? 0) / total);
  const hhi = weights.reduce((a, w) => a + w * w, 0) * 100;
  let note: string;
  if (hhi >= 70) note = 'Heavily concentrated — single outcome dominates.';
  else if (hhi >= 40) note = 'Concentrated — 2-3 outcomes carry the portfolio.';
  else if (hhi >= 20) note = 'Moderately diversified.';
  else note = 'Well diversified across outcomes.';
  return { hhi, bars, note };
}
