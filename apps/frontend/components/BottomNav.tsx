// Phase X — Mobile bottom nav (5 icon: Home / Discover / Basket / Portfolio
// / Settings). 모바일 only (sm: hidden). active route mint highlight. Basket
// 의 leg count badge.
//
// thumb 영역 친화 — height 64px, 각 icon tap 44×44px 이상.
// safe-area-inset-bottom respect (iOS notch).

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { loadBasket } from '@/lib/basket';

interface NavItem {
  href: string;
  /** match active state — true 면 startsWith */
  matchPrefix?: boolean;
  label: string;
  icon: string; // emoji or simple glyph (Phase X v1, future = icon component)
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

export function BottomNav(): JSX.Element {
  const pathname = usePathname();
  const [legCount, setLegCount] = useState(0);

  // localStorage 의 basket 변화 reflect — basket page / sheet 에서 leg add/remove.
  useEffect(() => {
    const sync = (): void => setLegCount(loadBasket().length);
    sync();
    const onStorage = (e: StorageEvent): void => {
      if (e.key && e.key.startsWith('hl-markets:basket')) sync();
    };
    // basket 변경 시 같은 tab 이면 storage event 안 발생 — custom event 도 listen
    window.addEventListener('storage', onStorage);
    window.addEventListener('hl-markets:basket-change', sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('hl-markets:basket-change', sync);
    };
  }, []);

  return (
    <nav
      aria-label="Primary navigation"
      className={clsx(
        'sticky bottom-0 z-30 border-t border-divider bg-surface/95 backdrop-blur',
        'sm:hidden',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = isActive(pathname ?? '/', item);
          const showBadge = item.href === '/basket' && legCount > 0;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex h-16 min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors',
                  active ? 'text-primary' : 'text-on-surface-muted hover:text-on-surface',
                )}
              >
                <span className="relative text-lg leading-none" aria-hidden>
                  {item.icon}
                  {showBadge && (
                    <span
                      className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-primary px-1 text-[9px] font-bold leading-[16px] text-on-primary"
                      aria-label={`${legCount} legs in basket`}
                    >
                      {legCount}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
