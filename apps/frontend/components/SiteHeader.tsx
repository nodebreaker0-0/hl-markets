'use client';

// Top bar: brand + network badge + Connect/wallet pill.
// Network is build-time (NEXT_PUBLIC_HL_NETWORK). ConnectButton drives the
// Phase J.1 sign-in flow.

import Link from 'next/link';
import clsx from 'clsx';
import { CURRENT_NETWORK } from '@/lib/network';
import { ConnectButton } from '@/components/ConnectButton';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 -mx-3 mb-4 border-b border-hl-border bg-hl-bg/85 px-3 backdrop-blur sm:-mx-4 sm:px-4">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight text-hl-mint">hl-markets</span>
          <span className="hidden text-[11px] uppercase tracking-widest text-hl-subtle sm:inline">
            hyperliquid · prediction markets
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ring-1',
              CURRENT_NETWORK === 'mainnet'
                ? 'bg-mainnet/15 text-mainnet ring-mainnet/40'
                : 'bg-testnet/15 text-testnet ring-testnet/40',
            )}
            title={
              CURRENT_NETWORK === 'mainnet'
                ? 'Production · real HL outcome markets'
                : 'Dev · HL testnet outcome markets'
            }
          >
            {CURRENT_NETWORK}
          </span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
