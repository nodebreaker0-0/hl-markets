// Phase X — Desktop left sidebar (280px fixed). Brand + 5 nav + Simple/Pro
// toggle + network badge + Connect button.
//
// Mobile = hidden (sm: 부터 보임). Mobile 은 BottomNav 가 nav 책임.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { CURRENT_NETWORK } from '@/lib/network';
import { ConnectButton } from '@/components/ConnectButton';
import { UiModeToggle } from '@/components/UiModeToggle';
import { loadBasket } from '@/lib/basket';

interface NavItem {
  href: string;
  matchPrefix?: boolean;
  label: string;
  icon: string;
}

const ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/discover', label: 'Discover', icon: '✨', matchPrefix: true },
  { href: '/basket', label: 'Basket', icon: '🛒', matchPrefix: true },
  { href: '/portfolio', label: 'Portfolio', icon: '📊', matchPrefix: true },
  { href: '/settings', label: 'Settings', icon: '⚙', matchPrefix: true },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/';
  return item.matchPrefix ? pathname.startsWith(item.href) : pathname === item.href;
}

export function Sidebar(): JSX.Element {
  const pathname = usePathname();
  const [legCount, setLegCount] = useState(0);

  useEffect(() => {
    const sync = (): void => setLegCount(loadBasket().length);
    sync();
    window.addEventListener('hl-markets:basket-change', sync);
    return () => window.removeEventListener('hl-markets:basket-change', sync);
  }, []);

  return (
    <aside
      aria-label="Primary navigation"
      className="hidden h-screen w-[280px] shrink-0 flex-col gap-base border-r border-divider bg-surface px-md py-lg sm:flex sm:sticky sm:top-0"
    >
      {/* Brand */}
      <Link href="/" className="flex items-baseline gap-2 px-sm py-sm">
        <span className="text-xl font-bold tracking-tight text-primary">hl-markets</span>
      </Link>
      <span className="px-sm text-[10px] uppercase tracking-widest text-on-surface-muted">
        hyperliquid · prediction markets
      </span>

      {/* Nav */}
      <ul className="mt-md flex flex-col gap-px">
        {ITEMS.map((item) => {
          const active = isActive(pathname ?? '/', item);
          const showBadge = item.href === '/basket' && legCount > 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex items-center gap-3 rounded-md px-md py-sm transition-colors',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-on-surface-muted hover:bg-surface-elevated hover:text-on-surface',
                )}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span className="flex-1 text-body-md font-semibold">{item.label}</span>
                {showBadge && (
                  <span
                    className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-[18px] text-on-primary"
                    aria-label={`${legCount} legs in basket`}
                  >
                    {legCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex-1" />

      {/* Footer — Simple/Pro toggle + network + Connect.
          items-start = 각 child 자기 폭만. ConnectButton 은 self-stretch 로 full-width. */}
      <div className="flex flex-col items-start gap-sm">
        <UiModeToggle />
        <span
          className={clsx(
            'inline-flex justify-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ring-1',
            CURRENT_NETWORK === 'mainnet'
              ? 'bg-accent-down/15 text-accent-down ring-accent-down/40'
              : 'bg-status-warn/15 text-status-warn ring-status-warn/40',
          )}
        >
          {CURRENT_NETWORK}
        </span>
        <div className="w-full">
          <ConnectButton />
        </div>
      </div>
    </aside>
  );
}
