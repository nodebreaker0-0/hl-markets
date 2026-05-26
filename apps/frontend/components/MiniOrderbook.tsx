// 5-level bids vs asks readout for one outcome side asset.
// Bids are tinted hl-mint (buy-side), asks are tinted mainnet red (sell-side)
// — matching the Polymarket convention of "more demand on Yes" cues.

'use client';

import type { L2BookResponse } from '@/lib/api';

interface Props {
  book: L2BookResponse | null;
  /** Asset key like "#1010" — surfaces in the heading so the user knows
   *  which underlying market the book belongs to. */
  assetKey: string;
}

const DEPTH = 5;

function fmtPx(px: string): string {
  // Outcome prices are 0..1; show 4 decimals.
  return Number(px).toFixed(4);
}

function fmtSz(sz: string): string {
  // Sizes are coin units (Yes/No shares). Round; sizes are usually integers.
  const n = Number(sz);
  if (!Number.isFinite(n)) return sz;
  return n.toFixed(0);
}

export function MiniOrderbook({ book, assetKey }: Props) {
  if (!book) {
    return (
      <div className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-4 text-xs text-hl-subtle">
        Loading book for <code className="mono">{assetKey}</code>…
      </div>
    );
  }
  const [bids, asks] = book.levels;
  const bidsTop = bids.slice(0, DEPTH);
  const asksTop = asks.slice(0, DEPTH);

  return (
    <div className="rounded-2xl border border-hl-border bg-hl-surface p-4">
      <div className="mb-2 flex items-baseline justify-between text-xs text-hl-subtle">
        <span className="uppercase tracking-widest">Order book</span>
        <code className="mono text-[11px]">{assetKey}</code>
      </div>

      <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-hl-subtle">
            <span>bid</span>
            <span>size</span>
          </div>
          {bidsTop.length === 0 && (
            <div className="rounded bg-hl-bg/50 px-2 py-1 text-hl-subtle">—</div>
          )}
          {bidsTop.map((b) => (
            <div
              key={b.px}
              className="flex justify-between rounded bg-hl-mint/10 px-2 py-1 text-hl-mint"
            >
              <span>{fmtPx(b.px)}</span>
              <span className="text-hl-mint/80">{fmtSz(b.sz)}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-hl-subtle">
            <span>ask</span>
            <span>size</span>
          </div>
          {asksTop.length === 0 && (
            <div className="rounded bg-hl-bg/50 px-2 py-1 text-hl-subtle">—</div>
          )}
          {asksTop.map((a) => (
            <div
              key={a.px}
              className="flex justify-between rounded bg-mainnet/10 px-2 py-1 text-mainnet"
            >
              <span>{fmtPx(a.px)}</span>
              <span className="text-mainnet/80">{fmtSz(a.sz)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
