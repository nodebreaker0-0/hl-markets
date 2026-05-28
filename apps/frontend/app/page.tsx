'use client';

// Phase X-010 — AI-First home.
//
// 첫 진입 = "What do you want to bet on?" + AI auto-explore + quick filters
// + "Browse all markets → /markets".
//
// 기존 4-tab page (Pending/Markets/Historical/AI Basket) 는 /markets 로
// 이주 (T-X-080). AI Basket 탭은 /discover (T-X-020) 로.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AIDiscovery } from '@/components/AIDiscovery';
import { WelcomeOnboarding } from '@/components/WelcomeOnboarding';

const CATEGORIES = [
  { label: 'Sports', icon: '⚽', href: '/discover?cat=sports' },
  { label: 'Crypto', icon: '₿', href: '/discover?cat=crypto' },
  { label: 'Macro', icon: '📊', href: '/discover?cat=economics' },
  { label: 'Politics', icon: '🗳', href: '/discover?cat=politics' },
  { label: 'Weather', icon: '🌦', href: '/discover?cat=weather' },
] as const;

export default function HomePage(): JSX.Element {
  const [greeting, setGreeting] = useState('Hello');

  // Time-based greeting (D-013 의 Robinhood 친화 패턴).
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
  }, []);

  return (
    <div className="flex flex-col gap-2xl pb-2xl">
      {/* ─── Welcome (첫 방문만, T-X-070) ─── */}
      <WelcomeOnboarding />

      {/* ─── Hero ─── */}
      <section className="flex flex-col gap-md pt-base">
        <span className="text-caption uppercase tracking-widest text-on-surface-muted">
          {greeting}.
        </span>
        <h1 className="text-display font-bold leading-tight text-on-surface">
          What do you want to bet on{' '}
          <span className="text-primary">today?</span>
        </h1>
        <p className="max-w-2xl text-body-md text-on-surface-muted">
          AI scans every HIP-4 outcome market on Hyperliquid and surfaces the
          highest expected-value bets. No custody. No analytics. Your AI key
          stays in your browser.
        </p>
      </section>

      {/* ─── AI Discovery (auto-explore default) ─── */}
      <section>
        <AIDiscovery />
      </section>

      {/* ─── Quick filters by category ─── */}
      <section className="flex flex-col gap-md">
        <h2 className="text-caption uppercase tracking-widest text-on-surface-muted">
          Or browse by category
        </h2>
        <div className="flex flex-wrap gap-sm">
          {CATEGORIES.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="inline-flex items-center gap-2 rounded-full bg-surface-elevated px-base py-sm text-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-overlay"
            >
              <span aria-hidden>{c.icon}</span>
              <span>{c.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Browse all markets (secondary CTA) ─── */}
      <section className="rounded-lg bg-surface-elevated p-lg">
        <div className="flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-h2 font-semibold text-on-surface">
              Browse all markets
            </h2>
            <p className="text-body-sm text-on-surface-muted">
              Skip AI and explore every active outcome market — Pending,
              Trading, Historical.
            </p>
          </div>
          <Link
            href="/markets"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-surface px-base py-md text-button font-semibold text-on-surface transition-colors hover:bg-surface-overlay"
          >
            Open →
          </Link>
        </div>
      </section>
    </div>
  );
}
