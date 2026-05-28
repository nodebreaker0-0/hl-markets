'use client';

// Outcome (HIP-4) market detail. URL: /o/?network=<testnet|mainnet>&id=<outcomeId>
// Static-export friendly — query params, not dynamic route segments
// (matches /g/?network=&id=).
//
// Composition:
//   - backend  /outcome/:network/:id  → name, description, sideSpecs, assetKeys, status
//   - HF       allMids                → current price per side asset
//   - HF       l2Book                 → mini orderbook for the selected side
//   - HF       candleSnapshot 1h 24h  → % chance line chart for the selected side
//
// Trade link sends the user to app.hyperliquid.xyz/trade with the side asset
// pre-selected (we read it but do not execute — Constitution I).

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { OutcomePriceChart } from '@/components/OutcomePriceChart';
import { MiniOrderbook } from '@/components/MiniOrderbook';
import {
  fetchBackendOutcomeDetail,
  fetchBackendGovernanceDetail,
  fetchAllMids,
  fetchL2Book,
  fetchCandleSnapshot,
  type BackendOutcomeRow,
  type BackendGovernanceDetail,
  type AllMidsResponse,
  type L2BookResponse,
  type Candle,
} from '@/lib/api';
import { expiryCountdown } from '@/lib/outcome-question';
import { walkAsks, fmtUsd, fmtSize } from '@/lib/liquidity';
import { CURRENT_NETWORK, type Network } from '@/lib/network';
import { ChatPanel } from '@/components/ChatPanel';
import { TradeWidget } from '@/components/TradeWidget';

const REFRESH_MS = 30_000;
const CANDLE_WINDOW_MS = 24 * 60 * 60 * 1000;

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function tradeUrl(network: Network, assetKey: string): string {
  // app.hyperliquid.xyz/trade accepts `#NNNN` directly. Testnet has a separate
  // host but the path scheme is the same.
  const host =
    network === 'mainnet' ? 'https://app.hyperliquid.xyz' : 'https://app.hyperliquid-testnet.xyz';
  return `${host}/trade/${encodeURIComponent(assetKey)}`;
}

function OutcomeInner() {
  const params = useSearchParams();
  // Network is build-time; the deprecated `?network=` query is ignored.
  const network: Network = CURRENT_NETWORK;
  const idStr = params.get('id');
  const outcomeId = idStr !== null && idStr.length > 0 ? Number(idStr) : null;
  const validId = outcomeId !== null && Number.isFinite(outcomeId);

  const [meta, setMeta] = useState<BackendOutcomeRow | null>(null);
  const [mids, setMids] = useState<AllMidsResponse>({});
  const [book, setBook] = useState<L2BookResponse | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [sideIdx, setSideIdx] = useState(0);
  const [deployGov, setDeployGov] = useState<BackendGovernanceDetail | null>(null);
  const [settleGov, setSettleGov] = useState<BackendGovernanceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  // Meta + mids (cheap, all sides at once) — fetched once per (network, id).
  // Linked governances are best-effort: failure to fetch a deploy/settle gov
  // doesn't surface as an error to the user — we just hide that row.
  const loadMetaAndMids = useCallback(async (n: Network, id: number) => {
    const [m, am] = await Promise.all([fetchBackendOutcomeDetail(n, id), fetchAllMids(n)]);
    setMeta(m);
    setMids(am);

    const govPromises: Array<Promise<unknown>> = [];
    if (m.deployGovId) {
      govPromises.push(
        fetchBackendGovernanceDetail(n, m.deployGovId)
          .then(setDeployGov)
          .catch(() => setDeployGov(null)),
      );
    } else {
      setDeployGov(null);
    }
    if (m.settleGovId) {
      govPromises.push(
        fetchBackendGovernanceDetail(n, m.settleGovId)
          .then(setSettleGov)
          .catch(() => setSettleGov(null)),
      );
    } else {
      setSettleGov(null);
    }
    await Promise.all(govPromises);
    return m;
  }, []);

  // Per-side data (orderbook + 24h candles) — refetched when side changes.
  const loadSide = useCallback(async (n: Network, assetKey: string) => {
    const now = Date.now();
    const [l2, cs] = await Promise.all([
      fetchL2Book(n, assetKey),
      fetchCandleSnapshot(n, assetKey, '1h', now - CANDLE_WINDOW_MS, now),
    ]);
    setBook(l2);
    setCandles(cs);
  }, []);

  // Full refresh tick. Wraps both fetches in a try/finally so a single error
  // doesn't strand `loading=true`.
  const refresh = useCallback(
    async (n: Network, id: number, sIdx: number) => {
      setLoading(true);
      setErr(null);
      try {
        const m = await loadMetaAndMids(n, id);
        const assetKey = m.assetKeys[sIdx] ?? m.assetKeys[0];
        if (assetKey) await loadSide(n, assetKey);
        setLoadedAt(Date.now());
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loadMetaAndMids, loadSide],
  );

  // Trigger on mount / network / id / side change + 30s auto-refresh.
  useEffect(() => {
    if (!validId) return;
    void refresh(network, outcomeId, sideIdx);
    const t = setInterval(() => {
      if (network && validId) void refresh(network, outcomeId, sideIdx);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [network, outcomeId, sideIdx, validId, refresh]);

  const currentSidePct = useMemo(() => {
    if (!meta) return null;
    const k = meta.assetKeys[sideIdx];
    if (!k) return null;
    const v = mids[k];
    return v !== undefined ? Number(v) : null;
  }, [meta, mids, sideIdx]);

  if (!validId) {
    return (
      <Fallback>
        Missing <code className="mono">id</code> in the URL.
      </Fallback>
    );
  }
  if (loading && !meta) return <Fallback>Loading outcome market…</Fallback>;
  if (err) return <Fallback>API error: {err}</Fallback>;
  if (!meta) {
    return (
      <Fallback>
        Outcome <strong className="text-on-surface">#{outcomeId}</strong> not found on{' '}
        <strong className="text-on-surface">{network}</strong>. It may not be indexed yet, or the id
        is wrong.
      </Fallback>
    );
  }

  const currentAssetKey = meta.assetKeys[sideIdx] ?? meta.assetKeys[0] ?? '';
  const currentSideName = meta.sideSpecs[sideIdx]?.name ?? `side ${sideIdx}`;

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
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
              meta.status === 'trading'
                ? 'bg-primary/15 text-primary ring-primary/40'
                : 'bg-surface-elevated text-on-surface-muted ring-divider',
            )}
          >
            {meta.status}
          </span>
        </div>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">
          {meta.name}
        </h1>
        {meta.description && (
          <p className="text-sm text-on-surface-muted">{meta.description}</p>
        )}
        <p className="text-[11px] text-on-surface-muted/70">
          outcome #{meta.outcomeId} · {meta.quoteToken} quoted ·{' '}
          {meta.sideSpecs.length} sides
        </p>
      </header>

      {/* side toggle */}
      <SideToggle
        sides={meta.sideSpecs.map((s) => s.name)}
        active={sideIdx}
        onChange={setSideIdx}
        midsByKey={meta.assetKeys.map((k) => (mids[k] !== undefined ? Number(mids[k]) : null))}
      />

      <OutcomePriceChart candles={candles} side={currentSideName} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MiniOrderbook book={book} assetKey={currentAssetKey} />
        <div className="rounded-2xl border border-divider bg-surface-elevated p-4 text-xs text-on-surface-muted">
          <div className="mb-2 uppercase tracking-widest">Now</div>
          <dl className="space-y-1 font-mono text-[11px] text-on-surface">
            <Row label="mid">
              {currentSidePct !== null ? fmtPct(currentSidePct) : '—'}
            </Row>
            <Row label="asset">
              <code className="mono">{currentAssetKey}</code>
            </Row>
            {(() => {
              const ex = expiryCountdown(meta.description);
              if (!ex) return null;
              return (
                <Row label="expiry">
                  <span className={ex.expired ? 'text-accent-down' : ''}>
                    {ex.label}
                  </span>
                </Row>
              );
            })()}
            <Row label="updated">
              {loadedAt ? new Date(loadedAt).toLocaleTimeString() : '—'}
            </Row>
          </dl>

          {(() => {
            const ask = walkAsks(book);
            if (ask.size === 0) {
              return (
                <p className="mt-3 text-[11px] text-on-surface-muted">
                  No offers on this side right now.
                </p>
              );
            }
            return (
              <div className="mt-3 space-y-1 border-t border-divider pt-3 font-mono text-[11px] text-on-surface">
                <Row label="depth">
                  <strong>{fmtSize(ask.size)}</strong> shares
                </Row>
                <Row label="avg buy">{ask.avgPrice.toFixed(3)}</Row>
                <Row label="cost">{fmtUsd(ask.cost)}</Row>
                <Row label="max profit">
                  <strong className="text-primary">
                    +{fmtUsd(ask.maxProfit)}
                  </strong>{' '}
                  <span className="text-on-surface-muted/70">
                    if {currentSideName} wins
                  </span>
                </Row>
              </div>
            );
          })()}

          <a
            href={tradeUrl(network, currentAssetKey)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary ring-1 ring-primary hover:bg-primary/25"
          >
            Trade on Hyperliquid ↗
          </a>
        </div>
      </div>

      {/* Governance lineage — which gov action deployed (and later settles) this market. */}
      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-widest text-on-surface-muted">
          Governance lineage
        </h2>
        {!meta.deployGovId && !meta.settleGovId ? (
          <div className="rounded-2xl border border-dashed border-divider bg-surface-elevated/50 p-4 text-xs text-on-surface-muted">
            No governance link yet. Hyperliquid&apos;s public API only exposes{' '}
            <em>pending</em> governance — markets deployed before the indexer
            started observing won&apos;t have a deploy gov attached. Future
            deploy + settle actions will link automatically.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {meta.deployGovId && (
              <GovLineageCard
                role="deploy"
                govId={meta.deployGovId}
                detail={deployGov}
              />
            )}
            {meta.settleGovId && (
              <GovLineageCard
                role="settle"
                govId={meta.settleGovId}
                detail={settleGov}
              />
            )}
          </div>
        )}
      </section>

      <TradeWidget
        assetKey={currentAssetKey}
        sideName={currentSideName}
        midPrice={currentSidePct}
        outcomeLabel={meta.name}
        outcomeDescription={meta.description ?? ''}
      />

      <ChatPanel marketKey={`o:${meta.outcomeId}`} marketTitle={meta.name} />

      <details className="text-xs text-on-surface-muted">
        <summary className="cursor-pointer hover:text-primary">Raw outcome JSON</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-divider bg-surface p-3 text-[11px] leading-snug text-on-surface">
          {JSON.stringify(meta, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SideToggle({
  sides,
  active,
  onChange,
  midsByKey,
}: {
  sides: string[];
  active: number;
  onChange: (i: number) => void;
  midsByKey: (number | null)[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {sides.map((s, i) => {
        const mid = midsByKey[i];
        const isOn = i === active;
        return (
          <button
            key={`${s}-${i}`}
            type="button"
            onClick={() => onChange(i)}
            aria-pressed={isOn}
            className={clsx(
              'flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition-colors',
              isOn
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-divider bg-surface-elevated text-on-surface hover:border-primary/50',
            )}
          >
            <span className="text-xs uppercase tracking-widest text-on-surface-muted">
              {s}
            </span>
            <span className="mt-1 font-mono text-2xl font-semibold">
              {mid !== null && mid !== undefined ? `${(mid * 100).toFixed(1)}%` : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-on-surface-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function GovLineageCard({
  role,
  govId,
  detail,
}: {
  role: 'deploy' | 'settle';
  govId: string;
  detail: BackendGovernanceDetail | null;
}) {
  // Inner op = first non-`type` key of the action. We don't classify it
  // further here; the icon + role label is enough context for the click-through.
  const innerOp = detail
    ? Object.keys(detail.action).find((k) => k !== 'type') ?? null
    : null;

  return (
    <Link
      href={`/g?id=${govId}`}
      className="flex flex-col gap-2 rounded-2xl border border-divider bg-surface-elevated p-4 text-xs transition-colors hover:border-primary/50"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
            role === 'deploy'
              ? 'bg-primary/15 text-primary ring-primary/40'
              : 'bg-accent-down/15 text-accent-down ring-accent-down/40',
          )}
        >
          {role}
        </span>
        {detail && (
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
              detail.status === 'pending'
                ? 'bg-status-warn/15 text-status-warn ring-status-warn/40'
                : detail.status === 'settled'
                  ? 'bg-primary/15 text-primary ring-primary/40'
                  : 'bg-surface text-on-surface-muted ring-divider',
            )}
          >
            {detail.status}
          </span>
        )}
      </div>

      {innerOp && (
        <div className="font-mono text-sm text-on-surface">{innerOp}</div>
      )}
      {!detail && (
        <div className="text-on-surface-muted">loading governance…</div>
      )}

      <div className="flex flex-col gap-0.5 text-[11px] text-on-surface-muted">
        <span>
          gov{' '}
          <code className="mono text-primary">
            {govId.slice(0, 10)}…{govId.slice(-6)}
          </code>
        </span>
        {detail && (
          <>
            <span>
              first seen{' '}
              {new Date(Number(detail.firstSeenAt)).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {detail.settledAt && (
              <span>
                {detail.status === 'settled' ? 'passed' : 'expired'}{' '}
                {new Date(Number(detail.settledAt)).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <span>
              votes:{' '}
              <strong className="text-on-surface">
                {detail.latestVotes.length}
              </strong>{' '}
              {detail.latestQuorumReached && (
                <span className="ml-1 text-primary">· quorum</span>
              )}
            </span>
          </>
        )}
      </div>

      <span className="text-[10px] text-primary">View governance →</span>
    </Link>
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

export default function OutcomePage() {
  return (
    <>
      
      <div>
        <Suspense fallback={<Fallback>Loading…</Fallback>}>
          <OutcomeInner />
        </Suspense>
      </div>
    </>
  );
}
