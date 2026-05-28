'use client';

// Detail page. URL: /g/?network=<testnet|mainnet>&id=<govId>
// Static export friendly — query params, not dynamic route segments.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { SiteHeader } from '@/components/SiteHeader';
import { QuorumBar } from '@/components/QuorumBar';
import { VotersList } from '@/components/VotersList';
import {
  fetchValidatorL1Votes,
  fetchValidatorSummaries,
  fetchBackendGovernanceDetail,
  type ValidatorL1VotePending,
  type ValidatorSummary,
  type BackendGovernanceDetail,
} from '@/lib/api';
import { classify } from '@/lib/governance/classify';
import { computeGovId } from '@/lib/governance/govId';
import { computeQuorum } from '@/lib/governance/thresholds';
import { buildValidatorIndex, splitVoters } from '@/lib/validators';
import { renderers } from '@/lib/governance/renderers';
import type { GovernanceItem } from '@/lib/governance/types';
import { CURRENT_NETWORK, type Network } from '@/lib/network';

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

function backendDetailToItem(d: BackendGovernanceDetail): GovernanceItem {
  const action = { type: 'validatorL1Vote' as const, ...d.action };
  return {
    network: d.network,
    govId: d.govId,
    action,
    variant: d.variant,
    innerKey: d.innerKey,
    expireTime: Number(d.expireTime),
    votes: d.latestVotes,
    quorumReached: d.latestQuorumReached,
  };
}

function fmtExpire(unixMs: number): string {
  const ms = unixMs - Date.now();
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function DetailInner() {
  const params = useSearchParams();
  // Network is build-time. The deprecated `?network=` query param is ignored.
  const network: Network = CURRENT_NETWORK;
  const id = params.get('id');

  const [items, setItems] = useState<GovernanceItem[]>([]);
  const [validators, setValidators] = useState<ValidatorSummary[]>([]);
  const [backendItem, setBackendItem] = useState<GovernanceItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Try the HF live list first (cheapest for active governance). If our id
  // isn't there, fall back to hl-markets-api /governance/:network/:govId so
  // historical / settled items still render.
  const load = useCallback(
    async (n: Network, govId: string) => {
      setLoading(true);
      setErr(null);
      try {
        const [votes, summaries] = await Promise.all([
          fetchValidatorL1Votes(n),
          fetchValidatorSummaries(n),
        ]);
        const mapped = votes.map((p) => pendingToItem(p, n));
        setItems(mapped);
        setValidators(summaries);

        if (!mapped.some((it) => it.govId === govId)) {
          try {
            const detail = await fetchBackendGovernanceDetail(n, govId);
            setBackendItem(backendDetailToItem(detail));
          } catch {
            setBackendItem(null);
          }
        } else {
          setBackendItem(null);
        }
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (id) void load(network, id);
  }, [network, id, load]);

  const item = useMemo(() => {
    const fromLive = items.find((it) => it.govId === id);
    return fromLive ?? backendItem ?? null;
  }, [items, backendItem, id]);

  if (!id) {
    return (
      <Fallback>
        <p className="text-sm text-accent-down">
          Missing <code className="mono">id</code> in the URL.
        </p>
      </Fallback>
    );
  }
  if (loading && !item) {
    return <Fallback>Loading…</Fallback>;
  }
  if (err) {
    return <Fallback>HF /info error: {err}</Fallback>;
  }
  if (!item) {
    return (
      <Fallback>
        Governance not found on <strong className="text-on-surface">{network}</strong>. Either it
        was never observed by the indexer, or the id is malformed.
        <div className="mt-3">
          <Link href="/" className="text-primary hover:underline">
            ← Back to list
          </Link>
        </div>
      </Fallback>
    );
  }

  const Renderer = renderers[item.variant];
  const idx = buildValidatorIndex(validators);
  const quorum = computeQuorum(idx.active, item.votes);
  const split = splitVoters(idx, item.votes);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between gap-3 text-xs text-on-surface-muted">
        <Link href="/" className="text-primary hover:underline">
          ← Back
        </Link>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
              network === 'mainnet'
                ? 'bg-accent-down/15 text-accent-down ring-accent-down/40'
                : 'bg-status-warn/15 text-status-warn ring-status-warn/40',
            )}
          >
            {network}
          </span>
          <span>expires in {fmtExpire(item.expireTime)}</span>
        </div>
      </div>

      <Renderer.Detail item={item} ctx={{ validators }} />

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-on-surface-muted">Quorum</h2>
        <div className="rounded-2xl border border-divider bg-surface-elevated p-4">
          <QuorumBar quorum={quorum} />
          <p className="mt-2 text-[11px] text-on-surface-muted">
            Threshold (tentative): <strong className="text-on-surface">20%</strong> stake AND{' '}
            <strong className="text-on-surface">50%</strong> count of active validators.
            {quorum.quorumReached && (
              <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                quorum reached
              </span>
            )}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-on-surface-muted">Validators</h2>
        <VotersList
          voted={split.voted}
          notVoted={split.notVoted}
          unknownVoters={split.unknownVoters}
        />
      </section>

    </div>
  );
}

function Fallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 pb-12">
      <Link href="/" className="text-xs text-primary hover:underline">
        ← Back to list
      </Link>
      <div className="rounded-2xl border border-dashed border-divider bg-surface-elevated/50 p-8 text-center text-sm text-on-surface-muted">
        {children}
      </div>
    </div>
  );
}

export default function DetailPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Suspense fallback={<Fallback>Loading…</Fallback>}>
          <DetailInner />
        </Suspense>
      </main>
    </>
  );
}
