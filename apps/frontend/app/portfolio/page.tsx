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
import { ConcentrationCard } from '@/components/ConcentrationCard';

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
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
        <SiteHeader />
        <section className="rounded-2xl border border-divider bg-surface-elevated p-6 text-center text-sm text-on-surface-muted">
          Connect a wallet to see your portfolio.
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <SiteHeader />

      <header>
        <div className="text-xs uppercase tracking-widest text-on-surface-muted">Portfolio</div>
        <div className="mono mt-0.5 text-sm text-on-surface">
          {session.address.slice(0, 6)}…{session.address.slice(-4)}
        </div>
      </header>

      <PortfolioHero data={data} loading={loading} />

      {err && (
        <div className="rounded-xl border border-accent-down/40 bg-accent-down/10 px-3 py-2 text-xs text-accent-down">
          {err}
        </div>
      )}

      {data && data.holdings.length >= 2 && (
        <ConcentrationCard holdings={data.holdings} />
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

      <div className="text-center text-[10px] text-on-surface-muted">
        Polls every {REFRESH_MS / 1000}s · {CURRENT_NETWORK}
      </div>
    </main>
  );
}

// ---- Subcomponents ------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section>
      <div className="mb-2 text-[10px] uppercase tracking-widest text-on-surface-muted">{title}</div>
      {children}
    </section>
  );
}

function Placeholder({ text }: { text: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-divider bg-surface-elevated/60 px-3 py-4 text-center text-xs text-on-surface-muted">
      {text}
    </div>
  );
}

// Phase W-9 — Portfolio hero (Robinhood DNA).
//
// 화면의 무게중심 = Total value (big-number, mono, tnum). 그 아래 Unrealized
// PnL 1줄 (arrow + signed amount + %). 그 아래 컴팩트 3 KPI (cost basis,
// realized, holdings count). Sparkline 은 V2 (시간순 portfolio value
// snapshot 이 lib/portfolio.ts 에 아직 없음 — Phase W 후속).
//
// DESIGN.md tokens: hero-summary (bg-surface + p-xl + 한 페이지 1개), big-number,
// accent-up / accent-down.
function PortfolioHero({
  data,
  loading,
}: {
  data: PortfolioSnapshot | null;
  loading: boolean;
}): JSX.Element {
  const totals = data?.totals;
  const pnl = totals?.unrealized ?? 0;
  const cost = totals?.cost ?? 0;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const tone: 'pos' | 'neg' | undefined =
    pnl > 0.01 ? 'pos' : pnl < -0.01 ? 'neg' : undefined;
  const holdingsCount = data?.holdings.length ?? 0;
  const arrow = tone === 'pos' ? '↑' : tone === 'neg' ? '↓' : '';

  return (
    <section className="-mx-3 sm:-mx-4">
      <div
        className={clsx(
          'flex flex-col gap-md bg-surface px-lg py-xl sm:px-xl',
          loading && !data && 'opacity-60',
        )}
      >
        {/* Total value — big-number hero. mono + tnum 으로 column align. */}
        <div className="flex flex-col gap-xs">
          <span className="text-caption uppercase tracking-widest text-on-surface-muted">
            Total value
          </span>
          <div className="mono text-big-number font-bold leading-none text-on-surface tabular-nums">
            {totals ? fmtUsd(totals.mark) : '—'}
          </div>
        </div>

        {/* Unrealized 1줄 — Robinhood 시각. arrow + signed amount + %. */}
        <div
          className={clsx(
            'mono flex items-center gap-2 text-h2 font-semibold tabular-nums',
            tone === 'pos' && 'text-accent-up',
            tone === 'neg' && 'text-accent-down',
            !tone && 'text-on-surface-muted',
          )}
          aria-label="Unrealized profit / loss"
        >
          {arrow && <span aria-hidden>{arrow}</span>}
          <span>{totals ? fmtUsd(Math.abs(pnl)) : '—'}</span>
          <span>({totals ? fmtPct(pnlPct) : '—'})</span>
          <span className="text-caption font-normal uppercase tracking-widest text-on-surface-muted">
            unrealized
          </span>
        </div>

        {/* Compact KPI row — 3 stats. */}
        <div className="grid grid-cols-3 gap-md border-t border-divider pt-md">
          <KpiInline
            label="Cost basis"
            value={totals ? fmtUsd(totals.cost) : '—'}
          />
          <KpiInline
            label="Realized"
            value={totals ? fmtUsd(totals.realized) : '—'}
            tone={
              totals && totals.realized > 0.01
                ? 'pos'
                : totals && totals.realized < -0.01
                  ? 'neg'
                  : undefined
            }
          />
          <KpiInline
            label="Holdings"
            value={data ? `${holdingsCount}` : '—'}
          />
        </div>
      </div>
    </section>
  );
}

function KpiInline({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
}): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">
        {label}
      </span>
      <span
        className={clsx(
          'mono text-body-md font-semibold tabular-nums',
          tone === 'pos' && 'text-accent-up',
          tone === 'neg' && 'text-accent-down',
          !tone && 'text-on-surface',
        )}
      >
        {value}
      </span>
    </div>
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
      <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">{label}</div>
      <div
        className={clsx(
          'mono mt-0.5 text-base font-semibold',
          tone === 'pos' && 'text-primary',
          tone === 'neg' && 'text-accent-down',
          !tone && 'text-on-surface',
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
  /** Portion of the holding to sell — 25 / 50 / 75 / 100. */
  const [sellPct, setSellPct] = useState<25 | 50 | 75 | 100>(100);
  const { session } = useSession();

  const sharesToSell = Math.max(1, Math.floor((h.shares * sellPct) / 100));
  const sellNotional = h.bestBid !== null ? sharesToSell * h.bestBid : null;
  const canCashOut =
    h.bestBid !== null &&
    sellNotional !== null &&
    sellNotional >= 10 &&
    session !== null &&
    sharesToSell > 0;

  const onCashOut = async (): Promise<void> => {
    if (!session || !h.bestBid || h.bestBid <= 0) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await placeMarketSell({
        address: session.address,
        assetId: outcomeAssetId(h.outcomeId, h.sideIdx),
        shares: sharesToSell,
        bestBidPx: h.bestBid,
        bestBidSz: sharesToSell, // upper-bound at our own slice; IOC trims if book is thinner
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
    <article className="rounded-xl border border-divider bg-surface-elevated p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-on-surface">
            {h.outcomeName}
            {h.sideName && (
              <span className="ml-1 text-xs font-normal text-on-surface-muted">
                · {h.sideName}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-on-surface-muted">
            {h.shares} shares · entry {fmtUsd(h.entryNtl)}
          </div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              'mono text-sm font-semibold',
              h.unrealizedPnl !== null && h.unrealizedPnl > 0 && 'text-primary',
              h.unrealizedPnl !== null && h.unrealizedPnl < 0 && 'text-accent-down',
            )}
          >
            {h.markValue !== null ? fmtUsd(h.markValue) : '—'}
          </div>
          {h.unrealizedPnl !== null && (
            <div
              className={clsx(
                'mono text-[11px]',
                h.unrealizedPnl > 0 ? 'text-primary' : h.unrealizedPnl < 0 ? 'text-accent-down' : 'text-on-surface-muted',
              )}
            >
              {fmtUsd(h.unrealizedPnl)}{' '}
              {h.unrealizedPnlPct !== null && `(${fmtPct(h.unrealizedPnlPct)})`}
            </div>
          )}
        </div>
      </div>

      {/* Partial cash out — pick a fraction */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[11px] text-on-surface-muted">
          {h.bestBid !== null
            ? `Cash out at bid ${(h.bestBid * 100).toFixed(1)}%`
            : 'No buyers — cash out unavailable.'}
        </div>
        <div className="inline-flex gap-1">
          {([25, 50, 75, 100] as const).map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setSellPct(pct)}
              className={clsx(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
                sellPct === pct
                  ? 'bg-primary/15 text-primary ring-primary'
                  : 'text-on-surface-muted ring-divider hover:text-on-surface',
              )}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-on-surface-muted">
          Selling{' '}
          <strong className="text-on-surface">
            {sharesToSell} shares
          </strong>
          {sellNotional !== null && (
            <>
              {' '}
              → <strong className="text-on-surface">${sellNotional.toFixed(2)}</strong>
            </>
          )}
          {sellNotional !== null && sellNotional < 10 && (
            <span className="ml-1 text-accent-down">· below $10 min</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void onCashOut()}
          disabled={!canCashOut || busy}
          className={clsx(
            'rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary ring-1 ring-primary',
            (!canCashOut || busy) && 'cursor-not-allowed opacity-40',
          )}
        >
          {busy ? 'Selling…' : `Cash out ${sellPct}%`}
        </button>
      </div>

      {err && (
        <div className="mt-2 rounded-lg border border-accent-down/40 bg-accent-down/10 px-2 py-1 text-[11px] text-accent-down">
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
    <div className="flex flex-col gap-1 rounded-lg border border-divider bg-surface-elevated/70 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className={o.side === 'B' ? 'text-primary' : 'text-accent-down'}>
            {o.side === 'B' ? 'Buy' : 'Sell'}
          </span>{' '}
          <span className="text-on-surface">{o.sz}</span>{' '}
          <span className="text-on-surface-muted">{o.outcomeName ?? o.coin}</span>{' '}
          @ <span className="mono">{o.limitPx}</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="mono text-[10px] text-on-surface-muted">#{o.oid}</code>
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={busy}
            className={clsx(
              'rounded-full bg-accent-down/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent-down ring-1 ring-accent-down/40',
              busy && 'cursor-wait opacity-50',
            )}
          >
            {busy ? '…' : 'Cancel'}
          </button>
        </div>
      </div>
      {err && (
        <div className="rounded border border-accent-down/40 bg-accent-down/10 px-2 py-1 text-[10px] text-accent-down">
          {err}
        </div>
      )}
    </div>
  );
}

function FillRowComp({ f }: { f: FillRow }): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-lg border border-divider bg-surface-elevated/70 px-3 py-2 text-xs">
      <div>
        <span className={f.dir === 'Buy' ? 'text-primary' : 'text-accent-down'}>
          {f.dir}
        </span>{' '}
        <span className="text-on-surface">{f.sz}</span>{' '}
        <span className="text-on-surface-muted">{f.outcomeName ?? f.coin}</span>{' '}
        @ <span className="mono">{f.px}</span>
        {f.dir === 'Sell' && f.closedPnl !== 0 && (
          <span
            className={clsx(
              'ml-1 mono',
              f.closedPnl > 0 ? 'text-primary' : 'text-accent-down',
            )}
          >
            ({fmtUsd(f.closedPnl)})
          </span>
        )}
      </div>
      <div className="text-[10px] text-on-surface-muted">{relTime(f.time)} ago</div>
    </div>
  );
}
