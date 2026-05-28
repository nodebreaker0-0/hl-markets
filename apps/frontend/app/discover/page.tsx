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

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AIDiscovery } from '@/components/AIDiscovery';

function DiscoverContent(): JSX.Element {
  const sp = useSearchParams();
  const cat = sp.get('cat');
  const q = sp.get('q');

  // 카테고리 chip 으로 진입한 경우 hint label
  const headline = cat
    ? `${cat[0].toUpperCase()}${cat.slice(1)} markets, ranked by AI`
    : q
      ? `"${q}"`
      : 'Find your edge.';

  return (
    <div className="flex flex-col gap-2xl pb-2xl">
      <section className="flex flex-col gap-md pt-base">
        <span className="text-caption uppercase tracking-widest text-primary">
          ✨ AI Discovery
        </span>
        <h1 className="text-display font-bold leading-tight text-on-surface">
          {headline}
        </h1>
        <p className="max-w-2xl text-body-md text-on-surface-muted">
          Describe what you want or just hit "Find opportunities" — the AI
          scans every active outcome, enriches each with live data (crypto
          price / sports stats / macro indicators), and ranks by
          expected value. You decide which to bet on.
        </p>
      </section>

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
