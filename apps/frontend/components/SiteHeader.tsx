'use client';

// Top bar: brand + portfolio nav + network badge + Connect/wallet pill.
// Network is build-time (NEXT_PUBLIC_HL_NETWORK). ConnectButton drives the
// Phase J.1 sign-in flow.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { CURRENT_NETWORK } from '@/lib/network';
import { ConnectButton } from '@/components/ConnectButton';
import { UiModeToggle } from '@/components/UiModeToggle';
import { useSession } from '@/lib/use-session';

export function SiteHeader() {
  const { session } = useSession();
  const pathname = usePathname();
  const onPortfolio = pathname === '/portfolio';

  return (
    <header className="sticky top-0 z-30 -mx-3 mb-4 border-b border-divider bg-surface/85 px-3 backdrop-blur sm:-mx-4 sm:px-4">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-primary">hl-markets</span>
            <span className="hidden text-[11px] uppercase tracking-widest text-on-surface-muted sm:inline">
              hyperliquid · prediction markets
            </span>
          </Link>
          {session && (
            <Link
              href="/portfolio"
              className={clsx(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest ring-1 transition',
                onPortfolio
                  ? 'bg-primary/15 text-primary ring-primary'
                  : 'text-on-surface-muted ring-divider hover:text-on-surface',
              )}
            >
              Portfolio
            </Link>
          )}
          {session && (
            <Link
              href="/autobet"
              className={clsx(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest ring-1 transition',
                pathname === '/autobet'
                  ? 'bg-primary/15 text-primary ring-primary'
                  : 'text-on-surface-muted ring-divider hover:text-on-surface',
              )}
            >
              Auto-bet
            </Link>
          )}
          <Link
            href="/settings"
            className={clsx(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest ring-1 transition',
              pathname === '/settings'
                ? 'bg-primary/15 text-primary ring-primary'
                : 'text-on-surface-muted ring-divider hover:text-on-surface',
            )}
          >
            ⚙
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {/* W-16: Simple / Pro density toggle. 모바일에서는 숨김 (sm 이상에서만). */}
          <UiModeToggle className="hidden sm:inline-flex" />
          <span
            className={clsx(
              'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ring-1',
              CURRENT_NETWORK === 'mainnet'
                ? 'bg-accent-down/15 text-accent-down ring-accent-down/40'
                : 'bg-status-warn/15 text-status-warn ring-status-warn/40',
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
