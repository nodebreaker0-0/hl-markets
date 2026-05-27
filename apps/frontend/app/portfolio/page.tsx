'use client';

// Phase J.8 — user portfolio page.
//
// Lists outcome holdings, open orders, and recent fills for the connected
// wallet. Each holding has a Cash out button (market sell at best bid via
// IOC, signed by the local agent privkey for popup-free execution).

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { useSession } from '@/lib/use-session';
import {
  fetchPortfolio,
  type PortfolioSnapshot,
  type Holding,
  type OpenOrder,
  type FillRow,
} from '@/lib/portfolio';
import { placeMarketSell, cancelOrder } from '@/lib/trade';
import { outcomeAssetId, assetIdFromKey } from '@/lib/asset-id';
import { CURRENT_NETWORK } from '@/lib/network';
import { pushToast } from '@/lib/toast';

const REFRESH_MS = 10_000;

function fmtUsd(n: number): string {
  return (
    (n < 0 ? '-' : '') +
    '$' +
    Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function relTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export default function PortfolioPage(): JSX.Element {
  const { session } = useSession();
  const [data, setData] = useState<PortfolioSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const snap = await fetchPortfolio(session.address);
      setData(snap);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [session, refresh]);

  if (!session) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <SiteHeader />
        <section className="rounded-2xl border border-hl-border bg-hl-surface p-6 text-center text-sm text-hl-subtle">
          Connect a wallet to see your portfolio.
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <SiteHeader />

      <header>
        <div className="text-xs uppercase tracking-widest text-hl-subtle">Portfolio</div>
        <div className="mono mt-0.5 text-sm text-hl-text">
          {session.address.slice(0, 6)}…{session.address.slice(-4)}
        </div>
      </header>

      <TotalsCard data={data} loading={loading} />

      {err && (
        <div className="rounded-xl border border-mainnet/40 bg-mainnet/10 px-3 py-2 text-xs text-mainnet">
          {err}
        </div>
      )}

      <Section title="Holdings">
        {loading && data === null ? (
          <Placeholder text="Loading holdings…" />
        ) : !data || data.holdings.length === 0 ? (
          <Placeholder text="No outcome positions yet. Place a bet to get started." />
        ) : (
          <div className="space-y-2">
            {data.holdings.map((h) => (
              <HoldingCard key={h.coin} h={h} onAfterSell={() => void refresh()} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Open orders">
        {!data || data.openOrders.length === 0 ? (
          <Placeholder text="No resting orders." />
        ) : (
          <div className="space-y-1.5">
            {data.openOrders.map((o) => (
              <OpenOrderRow key={o.oid} o={o} onAfterCancel={() => void refresh()} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent fills">
        {!data || data.fills.length === 0 ? (
          <Placeholder text="No fills yet." />
        ) : (
          <div className="space-y-1.5">
            {data.fills.map((f) => (
              <FillRowComp key={`${f.oid}-${f.tid}`} f={f} />
            ))}
          </div>
        )}
      </Section>

      <div className="text-center text-[10px] text-hl-subtle">
        Polls every {REFRESH_MS / 1000}s · {CURRENT_NETWORK}
      </div>
    </main>
  );
}

// ---- Subcomponents ------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section>
      <div className="mb-2 text-[10px] uppercase tracking-widest text-hl-subtle">{title}</div>
      {children}
    </section>
  );
}

function Placeholder({ text }: { text: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-hl-border bg-hl-surface/60 px-3 py-4 text-center text-xs text-hl-subtle">
      {text}
    </div>
  );
}

function TotalsCard({ data, loading }: { data: PortfolioSnapshot | null; loading: boolean }): JSX.Element {
  const totals = data?.totals;
  return (
    <section className="rounded-2xl border border-hl-border bg-hl-surface p-4">
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Stat
          label="Total value"
          value={totals ? fmtUsd(totals.mark) : '—'}
          loading={loading && !data}
        />
        <Stat
          label="Cost basis"
          value={totals ? fmtUsd(totals.cost) : '—'}
          loading={loading && !data}
        />
        <Stat
          label="Unrealized"
          value={totals ? fmtUsd(totals.unrealized) : '—'}
          tone={
            totals && totals.unrealized > 0
              ? 'pos'
              : totals && totals.unrealized < 0
                ? 'neg'
                : undefined
          }
          loading={loading && !data}
        />
        <Stat
          label="Realized"
          value={totals ? fmtUsd(totals.realized) : '—'}
          tone={
            totals && totals.realized > 0
              ? 'pos'
              : totals && totals.realized < 0
                ? 'neg'
                : undefined
          }
          loading={loading && !data}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
  loading?: boolean;
}): JSX.Element {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-hl-subtle">{label}</div>
      <div
        className={clsx(
          'mono mt-0.5 text-base font-semibold',
          tone === 'pos' && 'text-hl-mint',
          tone === 'neg' && 'text-mainnet',
          !tone && 'text-hl-text',
          loading && 'opacity-50',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function HoldingCard({ h, onAfterSell }: { h: Holding; onAfterSell: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { session } = useSession();

  const canCashOut =
    h.bestBid !== null && h.markValue !== null && h.markValue >= 10 && session !== null;

  const onCashOut = async (): Promise<void> => {
    if (!session || !h.bestBid || h.bestBid <= 0) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await placeMarketSell({
        address: session.address,
        assetId: outcomeAssetId(h.outcomeId, h.sideIdx),
        shares: h.shares,
        bestBidPx: h.bestBid,
        bestBidSz: h.shares, // upper-bound at own holding; IOC trims if book is thinner
      });
      // r is the raw HF response — surface filled / resting / error as a toast.
      const obj = r as { response?: { data?: { statuses?: Array<{ filled?: { totalSz?: string; avgPx?: string; oid?: number }; error?: string }> } } };
      const s = obj?.response?.data?.statuses?.[0];
      if (s?.filled) {
        pushToast({
          tone: 'success',
          message: `Cashed out ${h.outcomeName}`,
          detail: `${s.filled.totalSz} shares @ ${s.filled.avgPx} · OID ${s.filled.oid}`,
        });
      } else if (s?.error) {
        pushToast({ tone: 'error', message: 'Cash out rejected', detail: s.error });
      }
      onAfterSell();
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      pushToast({ tone: 'error', message: 'Cash out failed', detail: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-xl border border-hl-border bg-hl-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-hl-text">
            {h.outcomeName}
            {h.sideName && (
              <span className="ml-1 text-xs font-normal text-hl-subtle">
                · {h.sideName}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-hl-subtle">
            {h.shares} shares · entry {fmtUsd(h.entryNtl)}
          </div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              'mono text-sm font-semibold',
              h.unrealizedPnl !== null && h.unrealizedPnl > 0 && 'text-hl-mint',
              h.unrealizedPnl !== null && h.unrealizedPnl < 0 && 'text-mainnet',
            )}
          >
            {h.markValue !== null ? fmtUsd(h.markValue) : '—'}
          </div>
          {h.unrealizedPnl !== null && (
            <div
              className={clsx(
                'mono text-[11px]',
                h.unrealizedPnl > 0 ? 'text-hl-mint' : h.unrealizedPnl < 0 ? 'text-mainnet' : 'text-hl-subtle',
              )}
            >
              {fmtUsd(h.unrealizedPnl)}{' '}
              {h.unrealizedPnlPct !== null && `(${fmtPct(h.unrealizedPnlPct)})`}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[11px] text-hl-subtle">
          {h.bestBid !== null
            ? `Cash out at bid ${(h.bestBid * 100).toFixed(1)}%`
            : 'No buyers — cash out unavailable.'}
        </div>
        <button
          type="button"
          onClick={() => void onCashOut()}
          disabled={!canCashOut || busy}
          className={clsx(
            'rounded-full bg-hl-mint/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-hl-mint ring-1 ring-hl-mint',
            (!canCashOut || busy) && 'cursor-not-allowed opacity-40',
          )}
        >
          {busy ? 'Selling…' : 'Cash out'}
        </button>
      </div>

      {err && (
        <div className="mt-2 rounded-lg border border-mainnet/40 bg-mainnet/10 px-2 py-1 text-[11px] text-mainnet">
          {err}
        </div>
      )}
    </article>
  );
}

function OpenOrderRow({
  o,
  onAfterCancel,
}: {
  o: OpenOrder;
  onAfterCancel: () => void;
}): JSX.Element {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onCancel = async (): Promise<void> => {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      await cancelOrder({
        address: session.address,
        assetId: assetIdFromKey(o.coin),
        oid: o.oid,
      });
      pushToast({ tone: 'success', message: 'Order cancelled', detail: `OID ${o.oid}` });
      onAfterCancel();
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      pushToast({ tone: 'error', message: 'Cancel failed', detail: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-hl-border bg-hl-surface/70 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className={o.side === 'B' ? 'text-hl-mint' : 'text-mainnet'}>
            {o.side === 'B' ? 'Buy' : 'Sell'}
          </span>{' '}
          <span className="text-hl-text">{o.sz}</span>{' '}
          <span className="text-hl-subtle">{o.outcomeName ?? o.coin}</span>{' '}
          @ <span className="mono">{o.limitPx}</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="mono text-[10px] text-hl-subtle">#{o.oid}</code>
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={busy}
            className={clsx(
              'rounded-full bg-mainnet/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-mainnet ring-1 ring-mainnet/40',
              busy && 'cursor-wait opacity-50',
            )}
          >
            {busy ? '…' : 'Cancel'}
          </button>
        </div>
      </div>
      {err && (
        <div className="rounded border border-mainnet/40 bg-mainnet/10 px-2 py-1 text-[10px] text-mainnet">
          {err}
        </div>
      )}
    </div>
  );
}

function FillRowComp({ f }: { f: FillRow }): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-lg border border-hl-border bg-hl-surface/70 px-3 py-2 text-xs">
      <div>
        <span className={f.dir === 'Buy' ? 'text-hl-mint' : 'text-mainnet'}>
          {f.dir}
        </span>{' '}
        <span className="text-hl-text">{f.sz}</span>{' '}
        <span className="text-hl-subtle">{f.outcomeName ?? f.coin}</span>{' '}
        @ <span className="mono">{f.px}</span>
        {f.dir === 'Sell' && f.closedPnl !== 0 && (
          <span
            className={clsx(
              'ml-1 mono',
              f.closedPnl > 0 ? 'text-hl-mint' : 'text-mainnet',
            )}
          >
            ({fmtUsd(f.closedPnl)})
          </span>
        )}
      </div>
      <div className="text-[10px] text-hl-subtle">{relTime(f.time)} ago</div>
    </div>
  );
}
