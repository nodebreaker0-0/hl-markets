'use client';

// Phase X-020 — Discover page (full AI query expanded).
//
// Home 의 AIDiscovery 는 default auto-explore. /discover 는 자연어 query 의
// 본격 input + deep agent 활성화 + per-row "Add to basket".
//
// Query params:
//   ?cat=sports|crypto|economics|politics|weather  — category filter, home
//     의 quick chip 으로부터.
//   ?q=...  — 사용자 입력 query 의 deep link.

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { AIDiscovery } from '@/components/AIDiscovery';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'sports', label: '⚽ Sports' },
  { id: 'crypto', label: '₿ Crypto' },
  { id: 'economics', label: '📊 Macro' },
  { id: 'politics', label: '🗳 Politics' },
  { id: 'weather', label: '🌦 Weather' },
] as const;

const RECENT_KEY = 'hl-markets:discover-recent-v1';

function DiscoverContent(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname() ?? '/discover';
  const sp = useSearchParams();
  const cat = sp.get('cat') ?? 'all';
  const q = sp.get('q');

  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw).slice(0, 5));
    } catch {
      /* ignore */
    }
  }, []);

  const headline = cat !== 'all'
    ? `${CATEGORIES.find((c) => c.id === cat)?.label.replace(/^\S+\s/, '') ?? cat} markets, ranked by AI`
    : q
      ? `"${q}"`
      : 'Find your edge.';

  function setCat(c: string): void {
    const params = new URLSearchParams(sp.toString());
    if (c === 'all') params.delete('cat');
    else params.set('cat', c);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2xl pb-2xl">
      <section className="flex flex-col gap-md pt-base">
        <span className="text-caption uppercase tracking-widest text-primary">
          ✨ AI Discovery
        </span>
        <h1 className="text-display font-bold leading-tight text-on-surface">
          {headline}
        </h1>
      </section>

      {/* Category filter pill */}
      <section className="flex flex-col gap-sm">
        <span className="text-caption uppercase tracking-widest text-on-surface-muted">
          Filter by category
        </span>
        <div className="flex flex-wrap gap-sm">
          {CATEGORIES.map((c) => {
            const active = cat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={clsx(
                  'rounded-full px-base py-sm text-body-sm font-semibold transition-colors',
                  active
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-elevated text-on-surface hover:bg-surface-overlay',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent searches */}
      {recent.length > 0 && (
        <section className="flex flex-col gap-sm">
          <span className="text-caption uppercase tracking-widest text-on-surface-muted">
            Recent searches
          </span>
          <div className="flex flex-wrap gap-sm">
            {recent.map((r) => (
              <Link
                key={r}
                href={`/discover?q=${encodeURIComponent(r)}`}
                className="rounded-full bg-surface-elevated px-base py-sm text-body-sm text-on-surface-muted transition-colors hover:bg-surface-overlay hover:text-on-surface"
              >
                "{r.length > 40 ? r.slice(0, 40) + '…' : r}"
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* AI Discovery main */}
      <section>
        <AIDiscovery />
      </section>
    </div>
  );
}

export default function DiscoverPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="py-2xl text-center text-body-md text-on-surface-muted">Loading…</div>}>
      <DiscoverContent />
    </Suspense>
  );
}
