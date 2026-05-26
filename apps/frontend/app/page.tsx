'use client';

// Phase B skeleton — list + tabs scaffold. Phase C will fill in actual fetching.

import { useState } from 'react';
import { NetworkTabs, type Network } from '@/components/NetworkTabs';
import { BUILD_TIME } from '@/lib/env';

type Tab = 'active' | 'delegations' | 'historical';

export default function HomePage() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [tab, setTab] = useState<Tab>('active');

  return (
    <main className="space-y-5">
      <header className="space-y-2 border-b border-hl-border pb-4">
        <h1 className="text-2xl font-semibold text-hl-mint sm:text-3xl">hl-gov</h1>
        <p className="text-sm leading-relaxed text-hl-subtle">
          Hyperliquid governance public explorer — outcome, delisting, future variants. Polymarket-style
          detail, virtual polls, my delegation lookup. No key custody.
        </p>
      </header>

      <NetworkTabs value={network} onChange={setNetwork} />

      <nav className="-mx-3 flex gap-1 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {(['active', 'delegations', 'historical'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={[
              'shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tab === t
                ? 'bg-hl-mint/15 text-hl-mint ring-1 ring-hl-mint'
                : 'bg-hl-surface text-hl-subtle hover:text-hl-text hover:bg-hl-border',
            ].join(' ')}
          >
            {t === 'active' ? 'Active' : t === 'delegations' ? 'My Delegations' : 'Historical'}
          </button>
        ))}
      </nav>

      <section className="rounded-md border border-dashed border-hl-border bg-hl-surface p-4 text-sm text-hl-subtle">
        {network === null ? (
          <p>Pick Testnet or Mainnet to see {tab}.</p>
        ) : tab === 'active' ? (
          <p>
            Phase C will populate <code className="mono text-hl-text">{network}</code> active governance
            cards here.
          </p>
        ) : tab === 'delegations' ? (
          <p>Phase D will populate your delegated validators&apos; vote behavior here (wallet required).</p>
        ) : (
          <p>Phase F will populate settled / expired governance from the indexer here.</p>
        )}
      </section>

      <footer className="border-t border-hl-border pt-3 text-[10px] text-hl-subtle">
        build {BUILD_TIME} &middot; static SPA &middot; no analytics &middot; backend optional (Phase E+)
      </footer>
    </main>
  );
}
