'use client';

// Polymarket-style top bar: logo + nav + (eventually) wallet connect.
// Mobile-first: logo + condensed nav. Desktop: nav inline.

import clsx from 'clsx';

export interface SiteHeaderProps {
  // Phase D 가서 wallet 연결 시 채워짐
  wallet?: { account: `0x${string}` } | null;
}

export function SiteHeader({ wallet }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-30 -mx-3 mb-4 border-b border-hl-border bg-hl-bg/85 px-3 backdrop-blur sm:-mx-4 sm:px-4">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight text-hl-mint">hl-gov</span>
          <span className="hidden text-[11px] uppercase tracking-widest text-hl-subtle sm:inline">
            governance · explorer
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="Phase D will enable wallet connect"
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors',
              wallet
                ? 'bg-hl-mint/15 text-hl-mint ring-hl-mint'
                : 'cursor-not-allowed bg-hl-surface text-hl-subtle ring-hl-border opacity-60',
            )}
          >
            {wallet
              ? `${wallet.account.slice(0, 6)}…${wallet.account.slice(-4)}`
              : 'Connect (Phase D)'}
          </button>
        </div>
      </div>
    </header>
  );
}
