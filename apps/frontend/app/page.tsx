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
      {/* P3.10 — visual hierarchy 강화: 좌측 stat (markets count) + 우측 dual CTA */}
      <section className="rounded-xl border border-divider bg-surface-elevated p-lg">
        <div className="flex flex-col gap-md sm:flex-row sm:items-stretch sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-caption uppercase tracking-widest text-on-surface-muted">
              Manual browse
            </span>
            <h2 className="text-h1 font-bold text-on-surface">
              Browse all markets
            </h2>
            <p className="text-body-sm text-on-surface-muted">
              Skip AI and explore every active outcome — Pending governance,
              currently trading, settled history.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-sm sm:items-end sm:justify-center">
            <Link
              href="/markets"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-base py-md text-button font-bold text-on-primary transition-colors hover:bg-primary-bright"
            >
              Trading markets →
            </Link>
            <Link
              href="/markets/pending"
              className="text-body-sm text-on-surface-muted transition-colors hover:text-on-surface"
            >
              Pending governance · Historical →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
