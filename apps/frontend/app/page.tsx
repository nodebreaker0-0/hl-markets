'use client';

// Phase C — live data wiring. Replaces placeholder cards with real
// validatorL1Votes + validatorSummaries via lib/api.

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { SiteHeader } from '@/components/SiteHeader';
import { Hero } from '@/components/Hero';
import { NetworkTabs, type Network } from '@/components/NetworkTabs';
import { SearchSortBar, type Sort } from '@/components/SearchSortBar';
import { GovernanceCard } from '@/components/GovernanceCard';
import {
  fetchValidatorL1Votes,
  fetchValidatorSummaries,
  type ValidatorL1VotePending,
  type ValidatorSummary,
} from '@/lib/api';
import { classify } from '@/lib/governance/classify';
import { computeGovId } from '@/lib/governance/govId';
import type { GovernanceItem } from '@/lib/governance/types';

type Tab = 'active' | 'delegations' | 'historical';

const REFRESH_MS = 30_000;

function pendingToItem(p: ValidatorL1VotePending, network: Network): GovernanceItem {
  const action = { type: 'validatorL1Vote' as const, ...p.action };
  const { variant, innerKey } = classify(action);
  return {
    network,
    govId: computeGovId(action),
    action,
    variant,
    innerKey,
    expireTime: p.expireTime,
    votes: p.votes,
    quorumReached: p.quorumReached,
  };
}

function titleFor(item: GovernanceItem): string {
  // Used for search match only — not rendered.
  if (item.variant === 'outcome') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = (item.action['O'] as any) ?? {};
    const innerKey = Object.keys(o)[0];
    const reg = innerKey ? o[innerKey] : null;
    const nad = reg?.nameAndDescription;
    if (Array.isArray(nad) && typeof nad[0] === 'string') return nad[0] as string;
    return innerKey ?? 'outcome';
  }
  if (item.variant === 'delisting') {
    const D = item.action['D'];
    return typeof D === 'string' ? D : 'delisting';
  }
  return item.innerKey ?? 'unknown';
}

export default function HomePage() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('closing-soon');

  const [items, setItems] = useState<GovernanceItem[]>([]);
  const [validators, setValidators] = useState<ValidatorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = useCallback(async (n: Network) => {
    setLoading(true);
    setErr(null);
    try {
      const [votes, summaries] = await Promise.all([
        fetchValidatorL1Votes(n),
        fetchValidatorSummaries(n),
      ]);
      setItems(votes.map((p) => pendingToItem(p, n)));
      setValidators(summaries);
      setLoadedAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch on network change + 30s auto-refresh.
  useEffect(() => {
    if (!network || tab !== 'active') return;
    void load(network);
    const t = setInterval(() => void load(network), REFRESH_MS);
    return () => clearInterval(t);
  }, [network, tab, load]);

  const visible = useMemo(() => {
    let xs = items;
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      xs = xs.filter((it) => titleFor(it).toLowerCase().includes(q));
    }
    const sortFn: Record<Sort, (a: GovernanceItem, b: GovernanceItem) => number> = {
      'closing-soon': (a, b) => a.expireTime - b.expireTime,
      'most-voted': (a, b) => b.votes.length - a.votes.length,
      recent: (a, b) => b.expireTime - a.expireTime,
    };
    return [...xs].sort(sortFn[sort]);
  }, [items, query, sort]);

  return (
    <>
      <SiteHeader wallet={null} />

      <main className="space-y-6 pb-12">
        <Hero />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <NetworkTabs value={network} onChange={setNetwork} />
          <nav className="flex shrink-0 gap-1 overflow-x-auto rounded-full bg-hl-surface p-1 ring-1 ring-hl-border">
            {(['active', 'delegations', 'historical'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4',
                  tab === t
                    ? 'bg-hl-mint/15 text-hl-mint ring-1 ring-hl-mint'
                    : 'text-hl-subtle hover:text-hl-text',
                )}
              >
                {t === 'active' ? 'Active' : t === 'delegations' ? 'My Delegations' : 'Historical'}
              </button>
            ))}
          </nav>
        </div>

        <SearchSortBar query={query} onQueryChange={setQuery} sort={sort} onSortChange={setSort} />

        {network === null ? (
          <div className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-8 text-center text-sm text-hl-subtle">
            Pick a network above to see governance.
          </div>
        ) : tab === 'active' ? (
          <ActiveSection
            items={visible}
            validators={validators}
            network={network}
            loading={loading}
            err={err}
            loadedAt={loadedAt}
            onRefresh={() => network && load(network)}
          />
        ) : tab === 'delegations' ? (
          <div className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-8 text-center text-sm text-hl-subtle">
            Phase D: connect wallet to see how the validators you stake with voted.
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-8 text-center text-sm text-hl-subtle">
            Phase F: settled / expired governance, time-sorted, from the indexer.
          </div>
        )}

        <footer className="border-t border-hl-border pt-4 text-[11px] text-hl-subtle">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>
              hl-gov · sibling of hl-vote-web · no analytics · no key custody
            </span>
            <span>
              quorum: <strong className="text-hl-text">20%</strong> stake ·{' '}
              <strong className="text-hl-text">50%</strong> count{' '}
              <em className="text-hl-subtle/70">(tentative)</em>
            </span>
          </div>
        </footer>
      </main>
    </>
  );
}

function ActiveSection(props: {
  items: GovernanceItem[];
  validators: ValidatorSummary[];
  network: Network;
  loading: boolean;
  err: string | null;
  loadedAt: number | null;
  onRefresh: () => void;
}) {
  const { items, validators, network, loading, err, loadedAt, onRefresh } = props;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-xs text-hl-subtle">
        <span>
          {loading
            ? 'loading…'
            : loadedAt
              ? `fresh as of ${new Date(loadedAt).toLocaleTimeString()} · auto-refresh 30s`
              : ' '}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-full bg-hl-surface px-3 py-1 text-xs text-hl-text ring-1 ring-hl-border hover:bg-hl-border disabled:opacity-40"
        >
          refresh
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-mainnet/40 bg-mainnet/10 p-3 text-sm text-mainnet">
          {err}
        </div>
      )}

      {!err && items.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-8 text-center text-sm text-hl-subtle">
          No active governance on {network}.
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <GovernanceCard
              key={`${item.network}-${item.govId}`}
              item={item}
              ctx={{ validators }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
