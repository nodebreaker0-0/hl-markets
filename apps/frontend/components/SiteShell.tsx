// Phase X — Root layout shell.
//
// Mobile (< sm): vertical stack
//   - top brand header (minimal)
//   - main scroll
//   - bottom nav (sticky)
//
// Desktop (sm+): horizontal
//   - left Sidebar (280px fixed)
//   - main (scroll, max-w-4xl in main)
//   - (right panel = T-X-090, per-page)
//
// `<SiteShell>` 가 root layout 에서 호출됨. 각 page 는 children 만 제공.

'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { CURRENT_NETWORK } from '@/lib/network';
import { BottomNav } from '@/components/BottomNav';
import { Sidebar } from '@/components/Sidebar';

interface Props {
  children: React.ReactNode;
}

export function SiteShell({ children }: Props): JSX.Element {
  return (
    <div className="min-h-screen sm:flex">
      {/* Desktop sidebar — sm+ 만. mobile 은 hidden in Sidebar 자체. */}
      <Sidebar />

      {/* Main column */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Mobile-only top header (brand + network). 데스크탑은 sidebar 가 처리. */}
        <header
          className={clsx(
            'sticky top-0 z-20 flex h-14 items-center justify-between gap-3',
            'border-b border-divider bg-surface/95 backdrop-blur',
            'px-base sm:hidden',
          )}
        >
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-base font-bold tracking-tight text-primary">hl-markets</span>
          </Link>
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest ring-1',
              CURRENT_NETWORK === 'mainnet'
                ? 'bg-accent-down/15 text-accent-down ring-accent-down/40'
                : 'bg-status-warn/15 text-status-warn ring-status-warn/40',
            )}
          >
            {CURRENT_NETWORK}
          </span>
        </header>

        {/* Main scroll area */}
        <main className="mx-auto w-full max-w-4xl flex-1 px-base py-lg sm:px-xl">
          {children}
        </main>

        {/* Mobile bottom nav — sticky. 데스크탑은 hidden. */}
        <BottomNav />
      </div>
    </div>
  );
}
