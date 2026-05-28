// Phase X-070~074 — Welcome onboarding hero.
//
// 첫 방문 detection — localStorage `hl-markets:visited` flag. 없으면 hero
// 표시 (Home page 상단). 두 옵션:
//   - Connect wallet to trade   → ConnectButton 같은 시각, MetaMask trigger
//   - Try without wallet         → dismiss, localStorage set, browse only
//
// 이후 방문 시 안 보임. wallet 연결 또는 dismiss 후 visited 마크.
// EnableTradingModal (Phase K) + AI key inline prompt 는 trigger 시점에서
// 자체 처리.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ConnectButton } from '@/components/ConnectButton';
import { useSession } from '@/lib/use-session';

const VISITED_KEY = 'hl-markets:visited';

export function WelcomeOnboarding(): JSX.Element | null {
  const { session } = useSession();
  const [visited, setVisited] = useState<boolean | null>(null); // null = SSR

  useEffect(() => {
    try {
      setVisited(window.localStorage.getItem(VISITED_KEY) === 'true');
    } catch {
      setVisited(true); // storage 차단 시 onboarding 안 보임
    }
  }, []);

  // wallet 연결되면 자동 visited (한 번 connect = 사용자 진입 의도 확정)
  useEffect(() => {
    if (session) markVisited();
  }, [session]);

  function markVisited(): void {
    try {
      window.localStorage.setItem(VISITED_KEY, 'true');
    } catch {
      /* ignore */
    }
    setVisited(true);
  }

  // SSR / 이미 방문 / 세션 있음 → hide
  if (visited === null || visited === true || session) return null;

  return (
    <section
      className={clsx(
        'flex flex-col gap-lg rounded-xl bg-surface-elevated p-xl',
        'border border-primary/30',
      )}
    >
      <div className="flex flex-col gap-sm">
        <span className="text-caption uppercase tracking-widest text-primary">
          ✨ Welcome to hl-markets
        </span>
        <h2 className="text-display font-bold leading-tight text-on-surface">
          AI-driven outcome markets on Hyperliquid.
        </h2>
        <p className="max-w-2xl text-body-md text-on-surface-muted">
          Browse with no wallet, or connect to trade. Either way — your keys
          stay in your browser, no analytics, no key custody. AI helps you find
          mispriced bets but never auto-trades unless you opt in.
        </p>
      </div>

      <div className="flex flex-col gap-md sm:flex-row">
        {/* Primary — Connect wallet (ConnectButton 의 시각). markVisited via session effect. */}
        <div className="flex flex-1 flex-col gap-2">
          <ConnectButton />
          <span className="text-[10px] text-on-surface-muted">
            EIP-712 sign-in · cookie session · no password
          </span>
        </div>

        {/* Secondary — Browse only */}
        <div className="flex flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={markVisited}
            className="w-full rounded-md bg-surface px-base py-md text-button font-semibold text-on-surface transition-colors hover:bg-surface-overlay"
          >
            Try without wallet →
          </button>
          <span className="text-[10px] text-on-surface-muted">
            Read-only browse · markets, AI Discovery, no trading
          </span>
        </div>
      </div>

      {/* Tiny links to docs / Constitution */}
      <div className="flex flex-wrap gap-md text-[10px] text-on-surface-muted">
        <Link href="/settings" className="hover:text-on-surface">
          Add AI key (OpenAI / Anthropic)
        </Link>
        <span aria-hidden>·</span>
        <span>Zero key custody</span>
        <span aria-hidden>·</span>
        <span>HIP-4 buy fee 0</span>
      </div>
    </section>
  );
}
