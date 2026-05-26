'use client';

// Two-bar progress: stake (20% threshold) + count (50% threshold).
// Uses HL mint when reached, mint-dim when below.

import clsx from 'clsx';
import { STAKE_THRESHOLD, COUNT_THRESHOLD } from '@/lib/governance/thresholds';
import type { QuorumStatus } from '@/lib/governance/thresholds';

function Bar({ pct, threshold, label }: { pct: number; threshold: number; label: string }) {
  const clamped = Math.max(0, Math.min(1, pct));
  const reached = clamped >= threshold;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-hl-subtle">
        <span>
          {label} <span className="text-hl-subtle/70">· {(threshold * 100).toFixed(0)}%</span>
        </span>
        <span
          className={clsx(
            'font-mono',
            reached ? 'text-hl-mint' : 'text-hl-text',
          )}
        >
          {(clamped * 100).toFixed(1)}%
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-hl-bg">
        <div
          className={clsx(
            'h-full rounded-full transition-all',
            reached ? 'bg-hl-mint' : 'bg-hl-mint-dim/70',
          )}
          style={{ width: `${clamped * 100}%` }}
        />
        {/* threshold notch */}
        <div
          className="absolute top-0 h-full w-px bg-hl-text/40"
          style={{ left: `${threshold * 100}%` }}
          title={`${(threshold * 100).toFixed(0)}% threshold`}
        />
      </div>
    </div>
  );
}

export interface QuorumBarProps {
  quorum: QuorumStatus;
  compact?: boolean;
}

export function QuorumBar({ quorum, compact = false }: QuorumBarProps) {
  return (
    <div className={clsx('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2')}>
      <Bar pct={quorum.stakeRatio} threshold={STAKE_THRESHOLD} label="stake" />
      <Bar pct={quorum.countRatio} threshold={COUNT_THRESHOLD} label="count" />
    </div>
  );
}
