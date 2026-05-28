'use client';

// Full validator breakdown for the detail page. Mobile collapses each group.

import { useState } from 'react';
import clsx from 'clsx';
import type { ValidatorSummary } from '@/lib/api';

interface ColumnProps {
  title: string;
  count: number;
  rows: ValidatorSummary[];
  tone: 'voted' | 'not-voted';
  startOpen?: boolean;
}

function Column({ title, count, rows, tone, startOpen = true }: ColumnProps) {
  const [open, setOpen] = useState(startOpen);
  return (
    <section className="rounded-2xl border border-divider bg-surface-elevated">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex items-baseline gap-2">
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
              tone === 'voted'
                ? 'bg-primary/15 text-primary ring-primary/40'
                : 'bg-surface text-on-surface-muted ring-divider',
            )}
          >
            {title}
          </span>
          <span className="text-sm text-on-surface">{count}</span>
        </div>
        <span className="text-on-surface-muted">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="max-h-72 divide-y divide-divider overflow-y-auto border-t border-divider">
          {rows.length === 0 && (
            <li className="px-4 py-3 text-xs text-on-surface-muted/70">none</li>
          )}
          {rows.map((v) => (
            <li
              key={v.validator}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="truncate text-on-surface">{v.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-on-surface-muted">
                {(Number(v.stake) / 1e8).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}{' '}
                HYPE
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface VotersListProps {
  voted: ValidatorSummary[];
  notVoted: ValidatorSummary[];
  unknownVoters: string[];
}

export function VotersList({ voted, notVoted, unknownVoters }: VotersListProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Column title="Voted" count={voted.length} rows={voted} tone="voted" />
      <Column title="Not voted" count={notVoted.length} rows={notVoted} tone="not-voted" startOpen={false} />
      {unknownVoters.length > 0 && (
        <div className="col-span-full rounded-2xl border border-status-warn/40 bg-status-warn/5 p-3 text-xs text-status-warn">
          {unknownVoters.length} voter address{unknownVoters.length === 1 ? '' : 'es'} not in the
          active set (jailed / inactive / unknown):
          <ul className="mt-1 font-mono text-[11px] leading-snug text-on-surface/80">
            {unknownVoters.slice(0, 8).map((a) => (
              <li key={a}>{a}</li>
            ))}
            {unknownVoters.length > 8 && <li>+{unknownVoters.length - 8} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
