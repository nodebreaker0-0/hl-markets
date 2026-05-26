'use client';

// Delisting variant renderer. Card/Detail focus on ticker + (cross-ref with
// `meta`/`spotMeta` in Phase H) market info.

import type { VariantRenderer } from '../types';

function extractTicker(action: Record<string, unknown>): string {
  const D = action['D'];
  if (typeof D === 'string') return D;
  return '(unknown)';
}

export const delisting: VariantRenderer = {
  Card: ({ item }) => {
    const ticker = extractTicker(item.action);
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold leading-snug text-hl-text">
          Delist <span className="font-mono">{ticker}</span>
        </h3>
        <p className="text-sm text-hl-subtle">
          Validators are voting on removing this asset from the venue.
        </p>
      </div>
    );
  },
  Detail: ({ item }) => {
    const ticker = extractTicker(item.action);
    return (
      <article className="space-y-4">
        <header className="space-y-2">
          <span className="inline-block rounded-full bg-mainnet/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-mainnet ring-1 ring-mainnet/40">
            Delisting
          </span>
          <h1 className="text-2xl font-bold leading-tight text-hl-text sm:text-3xl">
            <span className="font-mono">{ticker}</span>
          </h1>
        </header>
        <section className="rounded-xl border border-hl-border bg-hl-surface p-4 text-sm text-hl-subtle">
          Market info (price, volume, OI) will appear here in Phase H once we cross-reference
          <code className="mono text-hl-text"> meta </code>/
          <code className="mono text-hl-text"> spotMeta </code>.
        </section>
      </article>
    );
  },
};
