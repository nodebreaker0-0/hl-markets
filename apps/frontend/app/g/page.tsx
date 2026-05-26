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
  type ValidatorL1VotePending,
  type ValidatorSummary,
} from '@/lib/api';
import { classify } from '@/lib/governance/classify';
import { computeGovId } from '@/lib/governance/govId';
import { computeQuorum } from '@/lib/governance/thresholds';
import { buildValidatorIndex, splitVoters } from '@/lib/validators';
import { renderers } from '@/lib/governance/renderers';
import type { GovernanceItem } from '@/lib/governance/types';
import type { Network } from '@/components/NetworkTabs';

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
  const network = (params.get('network') as Network | null) ?? null;
  const id = params.get('id');

  const [items, setItems] = useState<GovernanceItem[]>([]);
  const [validators, setValidators] = useState<ValidatorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (network) void load(network);
  }, [network, load]);

  const item = useMemo(() => items.find((it) => it.govId === id) ?? null, [items, id]);

  if (!network || !id) {
    return (
      <Fallback>
        <p className="text-sm text-mainnet">
          Missing <code className="mono">network</code> or <code className="mono">id</code> in the URL.
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
        Governance not found on <strong className="text-hl-text">{network}</strong>. It may have
        settled or expired since you opened the link — Phase F will surface historical entries
        from the indexer.
        <div className="mt-3">
          <Link href="/" className="text-hl-mint hover:underline">
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
      <div className="flex items-center justify-between gap-3 text-xs text-hl-subtle">
        <Link href="/" className="text-hl-mint hover:underline">
          ← Back
        </Link>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
              network === 'mainnet'
                ? 'bg-mainnet/15 text-mainnet ring-mainnet/40'
                : 'bg-testnet/15 text-testnet ring-testnet/40',
            )}
          >
            {network}
          </span>
          <span>expires in {fmtExpire(item.expireTime)}</span>
        </div>
      </div>

      <Renderer.Detail item={item} ctx={{ validators }} />

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-hl-subtle">Quorum</h2>
        <div className="rounded-2xl border border-hl-border bg-hl-surface p-4">
          <QuorumBar quorum={quorum} />
          <p className="mt-2 text-[11px] text-hl-subtle">
            Threshold (tentative): <strong className="text-hl-text">20%</strong> stake AND{' '}
            <strong className="text-hl-text">50%</strong> count of active validators.
            {quorum.quorumReached && (
              <span className="ml-2 rounded-full bg-hl-mint/15 px-2 py-0.5 text-hl-mint">
                quorum reached
              </span>
            )}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-hl-subtle">Validators</h2>
        <VotersList
          voted={split.voted}
          notVoted={split.notVoted}
          unknownVoters={split.unknownVoters}
        />
      </section>

      <section className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-4 text-xs text-hl-subtle">
        <strong className="text-hl-text">Phase G:</strong> sign an EIP-712 virtual poll with
        your wallet — head + stake-weighted aggregation. Reference-only signal, not the
        validator vote.
      </section>

      <section className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-4 text-xs text-hl-subtle">
        <strong className="text-hl-text">Phase H:</strong> for outcome variants, the registered
        perp market&apos;s current price + 24h candle chart will land here.
      </section>

      <details className="text-xs text-hl-subtle">
        <summary className="cursor-pointer hover:text-hl-mint">Raw action JSON</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-hl-border bg-hl-bg p-3 text-[11px] leading-snug text-hl-text">
          {JSON.stringify(item.action, null, 2)}
        </pre>
        <p className="mt-1 text-[10px] text-hl-subtle/70">
          govId: <code className="mono">{item.govId}</code>
        </p>
      </details>
    </div>
  );
}

function Fallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 pb-12">
      <Link href="/" className="text-xs text-hl-mint hover:underline">
        ← Back to list
      </Link>
      <div className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-8 text-center text-sm text-hl-subtle">
        {children}
      </div>
    </div>
  );
}

export default function DetailPage() {
  return (
    <>
      <SiteHeader wallet={null} />
      <main>
        <Suspense fallback={<Fallback>Loading…</Fallback>}>
          <DetailInner />
        </Suspense>
      </main>
    </>
  );
}
