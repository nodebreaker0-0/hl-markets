// 24h close-price line chart for one outcome side.
// Inline SVG (no chart library) — outcome prices are bounded 0..1, so the
// y-axis is fixed to that range and we draw a single polyline. This keeps
// the bundle small (Constitution VII) and is the same approach used in
// hl-vote-web for tiny visualizations.

'use client';

import clsx from 'clsx';
import type { Candle } from '@/lib/api';

interface Props {
  candles: Candle[];
  /** Side label rendered above the % readout (e.g. "Yes", "Change"). */
  side: string;
}

const VIEW_W = 600;
const VIEW_H = 200;
const PAD_X = 30;
const PAD_Y = 18;

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function OutcomePriceChart({ candles, side }: Props) {
  if (candles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-divider bg-surface-elevated/50 p-6 text-center text-xs text-on-surface-muted">
        No price history for the last 24h. The outcome market may be paused or
        too new to have candles yet.
      </div>
    );
  }

  const xs = candles.map((c) => c.t);
  const ys = candles.map((c) => Number(c.c));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const xRange = Math.max(1, maxX - minX);

  const xScale = (x: number): number =>
    PAD_X + ((VIEW_W - 2 * PAD_X) * (x - minX)) / xRange;
  const yScale = (y: number): number => VIEW_H - PAD_Y - (VIEW_H - 2 * PAD_Y) * y;

  const points = candles.map((c, i) => {
    const x = xScale(c.t);
    const y = yScale(Number(c.c));
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = points.join(' ');

  // Subtle area fill under the curve.
  const areaPath = `${path} L${xScale(maxX).toFixed(1)},${(VIEW_H - PAD_Y).toFixed(
    1,
  )} L${xScale(minX).toFixed(1)},${(VIEW_H - PAD_Y).toFixed(1)} Z`;

  const lastClose = ys[ys.length - 1] ?? 0;
  const firstOpen = Number(candles[0]?.o ?? lastClose);
  const deltaPp = (lastClose - firstOpen) * 100;
  const up = deltaPp >= 0;

  return (
    <div className="rounded-2xl border border-divider bg-surface-elevated p-4">
      <div className="mb-2 flex items-baseline gap-3">
        <span className="text-xs uppercase tracking-widest text-on-surface-muted">
          {side}
        </span>
        <span className="font-mono text-3xl font-semibold text-primary">
          {pct(lastClose)}
        </span>
        <span
          className={clsx(
            'font-mono text-sm',
            up ? 'text-primary' : 'text-accent-down',
          )}
        >
          {up ? '+' : ''}
          {deltaPp.toFixed(1)}pp · 24h
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-44 w-full text-primary"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={PAD_X}
            x2={VIEW_W - PAD_X}
            y1={yScale(g)}
            y2={yScale(g)}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth="1"
          />
        ))}
        {[0, 0.5, 1].map((g) => (
          <text
            key={g}
            x={PAD_X - 6}
            y={yScale(g) + 3}
            textAnchor="end"
            fontSize="9"
            className="fill-on-surface-muted/70"
          >
            {(g * 100).toFixed(0)}%
          </text>
        ))}

        <path d={areaPath} fill="currentColor" fillOpacity="0.08" />
        <path
          d={path}
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={xScale(maxX)} cy={yScale(lastClose)} r="3" fill="currentColor" />
      </svg>
    </div>
  );
}
