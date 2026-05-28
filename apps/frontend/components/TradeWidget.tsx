'use client';

// Phase J.5 + J.6 — in-app trade widget.
//
// Two modes:
//   - Simple (default, Polymarket-style) → SimpleTradeWidget (Bet/Cash out,
//     market IOC at top of book + slippage). For most users.
//   - Advanced (toggle, persisted) → this file's Buy/Sell/Price/TIF form for
//     limit orders. Same Builder Code flow, just exposes the trading
//     primitives.
//
// Mode preference is stored in localStorage so a user who flips Advanced
// stays there across reloads.

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useSession } from '@/lib/use-session';
import { getBuilderConfig } from '@/lib/builder';
import { placeOrder, fetchMaxBuilderFee, parsePctToTenthsBps } from '@/lib/trade';
import { ApproveBuilderModal } from '@/components/ApproveBuilderModal';
import { CURRENT_NETWORK } from '@/lib/network';
import { assetIdFromKey } from '@/lib/asset-id';
import { SimpleTradeWidget } from '@/components/SimpleTradeWidget';

interface TradeWidgetProps {
  /** "#NNNN" asset key the user is currently looking at. */
  assetKey: string;
  /** Human side label (Yes / No / Change / ...). */
  sideName: string;
  /** Current mid price ([0, 1]) — used as the default price. */
  midPrice: number | null;
  /** Optional human outcome label (e.g. "Algeria") for Simple CTA copy. */
  outcomeLabel?: string;
}

type Mode = 'simple' | 'advanced';
const MODE_KEY = 'hl-markets:tradeMode';

function readStoredMode(): Mode {
  if (typeof window === 'undefined') return 'simple';
  const v = window.localStorage.getItem(MODE_KEY);
  return v === 'advanced' ? 'advanced' : 'simple';
}

export function TradeWidget(props: TradeWidgetProps) {
  const [mode, setMode] = useState<Mode>('simple');
  // Hydrate from localStorage after mount — avoids SSR hydration mismatch.
  useEffect(() => {
    setMode(readStoredMode());
  }, []);
  const flip = (m: Mode): void => {
    setMode(m);
    if (typeof window !== 'undefined') window.localStorage.setItem(MODE_KEY, m);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="inline-flex rounded-full border border-divider bg-surface p-0.5 text-[10px] uppercase tracking-widest">
          <button
            type="button"
            onClick={() => flip('simple')}
            className={clsx(
              'rounded-full px-3 py-1 transition',
              mode === 'simple'
                ? 'bg-primary/15 text-primary'
                : 'text-on-surface-muted hover:text-on-surface',
            )}
          >
            Simple
          </button>
          <button
            type="button"
            onClick={() => flip('advanced')}
            className={clsx(
              'rounded-full px-3 py-1 transition',
              mode === 'advanced'
                ? 'bg-primary/15 text-primary'
                : 'text-on-surface-muted hover:text-on-surface',
            )}
          >
            Advanced
          </button>
        </div>
      </div>
      {mode === 'simple' ? (
        <SimpleTradeWidget
          assetKey={props.assetKey}
          sideName={props.sideName}
          outcomeLabel={props.outcomeLabel}
        />
      ) : (
        <AdvancedTradeWidget {...props} />
      )}
    </div>
  );
}

function AdvancedTradeWidget({ assetKey, sideName, midPrice }: TradeWidgetProps) {
  const { session } = useSession();
  const builder = getBuilderConfig();
  const [approved, setApproved] = useState<boolean | null>(null);
  const [showApprove, setShowApprove] = useState(false);

  // Form state
  const [isBuy, setIsBuy] = useState(true);
  const [size, setSize] = useState('');
  const [price, setPrice] = useState(midPrice !== null ? midPrice.toFixed(3) : '');
  const [tif, setTif] = useState<'Ioc' | 'Gtc'>('Gtc');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  // Refresh price default when mid moves (only when user hasn't typed).
  useEffect(() => {
    if (midPrice !== null && price === '') setPrice(midPrice.toFixed(3));
  }, [midPrice, price]);

  // Check approval state once we have a session.
  useEffect(() => {
    if (!session || !builder.configured) {
      setApproved(null);
      return;
    }
    let cancelled = false;
    void fetchMaxBuilderFee(session.address).then((pct) => {
      if (cancelled) return;
      const approvedTbp = parsePctToTenthsBps(pct);
      setApproved(approvedTbp >= builder.feeTenthsBps);
    });
    return () => {
      cancelled = true;
    };
  }, [session, builder.configured, builder.feeTenthsBps]);

  if (!session) {
    return (
      <Banner>Connect a wallet to place orders on this market.</Banner>
    );
  }

  if (!builder.configured) {
    return (
      <Banner tone="warn">
        Builder not configured for {CURRENT_NETWORK}. Set{' '}
        <code className="mono">NEXT_PUBLIC_BUILDER_ADDR_{CURRENT_NETWORK.toUpperCase()}</code>{' '}
        and rebuild — see <code className="mono">contracts/builder-code.md</code>.
      </Banner>
    );
  }

  const onSubmit = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      // Re-check approval right before submit (it may have just been granted
      // in another tab).
      if (approved !== true) {
        const pct = await fetchMaxBuilderFee(session.address);
        const ok = parsePctToTenthsBps(pct) >= builder.feeTenthsBps;
        if (!ok) {
          setShowApprove(true);
          setBusy(false);
          return;
        }
        setApproved(true);
      }

      const assetId = assetIdFromKey(assetKey);
      if (!size.trim() || Number(size) <= 0) throw new Error('size must be positive');
      if (!price.trim() || Number(price) < 0 || Number(price) > 1) {
        throw new Error('price must be between 0 and 1');
      }

      const r = await placeOrder({
        address: session.address,
        assetId,
        isBuy,
        price: price.trim(),
        size: size.trim(),
        tif,
      });
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-divider bg-surface-elevated p-4">
        <div className="mb-3 flex items-baseline justify-between text-xs text-on-surface-muted">
          <span className="uppercase tracking-widest">Trade · {sideName}</span>
          <code className="mono">{assetKey}</code>
        </div>

        <div className="space-y-3 text-sm">
          {/* Side toggle — Bet (open) / Cash out (close existing position).
              We keep the underlying isBuy=true/false semantics so the order
              action stays bog-standard for HF; only labels change. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsBuy(true)}
              className={clsx(
                'rounded-xl px-3 py-2 text-xs font-semibold ring-1',
                isBuy
                  ? 'bg-primary/15 text-primary ring-primary'
                  : 'bg-surface text-on-surface-muted ring-divider',
              )}
            >
              Bet
            </button>
            <button
              type="button"
              onClick={() => setIsBuy(false)}
              className={clsx(
                'rounded-xl px-3 py-2 text-xs font-semibold ring-1',
                !isBuy
                  ? 'bg-accent-down/15 text-accent-down ring-accent-down'
                  : 'bg-surface text-on-surface-muted ring-divider',
              )}
            >
              Cash out
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="size">
              <input
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. 10"
                inputMode="decimal"
                className="w-full rounded-lg border border-divider bg-surface px-2 py-1.5 font-mono text-sm text-on-surface focus:border-primary focus:outline-none"
              />
            </Field>
            <Field label="price (0–1)">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 0.43"
                inputMode="decimal"
                className="w-full rounded-lg border border-divider bg-surface px-2 py-1.5 font-mono text-sm text-on-surface focus:border-primary focus:outline-none"
              />
            </Field>
          </div>

          <Field label="time in force">
            <select
              value={tif}
              onChange={(e) => setTif(e.target.value as 'Ioc' | 'Gtc')}
              className="w-full rounded-lg border border-divider bg-surface px-2 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="Gtc">Gtc (resting limit)</option>
              <option value="Ioc">Ioc (immediate or cancel)</option>
            </select>
          </Field>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-2 text-[11px] text-primary">
            Builder fee:{' '}
            <strong>
              {builder.feeBpsHuman} bps ({(builder.feeBpsHuman / 100).toFixed(3)}%)
            </strong>
            {approved === false && ' · approval pending'}
            {approved === null && ' · checking approval…'}
          </div>

          {err && (
            <div className="rounded-xl border border-accent-down/40 bg-accent-down/10 px-3 py-2 text-xs text-accent-down">
              {err}
            </div>
          )}
          {result !== null && (
            <details className="rounded-xl border border-divider bg-surface p-2 text-[11px] text-on-surface-muted">
              <summary className="cursor-pointer">HF response</summary>
              <pre className="mt-1 overflow-x-auto text-[10px] text-on-surface">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          )}

          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={busy}
            className={clsx(
              'w-full rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-widest ring-1',
              isBuy
                ? 'bg-primary/15 text-primary ring-primary hover:bg-primary/25'
                : 'bg-accent-down/15 text-accent-down ring-accent-down hover:bg-accent-down/25',
              busy && 'cursor-wait opacity-60',
            )}
          >
            {busy ? 'Signing…' : isBuy ? `Bet on ${sideName}` : `Cash out ${sideName}`}
          </button>
        </div>
      </section>

      <ApproveBuilderModal
        open={showApprove}
        onClose={() => setShowApprove(false)}
        onApproved={() => {
          setShowApprove(false);
          setApproved(true);
        }}
      />
    </>
  );
}

function Banner({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border bg-surface-elevated/60 p-4 text-xs',
        tone === 'warn' ? 'border-status-warn/40 text-status-warn' : 'border-divider text-on-surface-muted',
      )}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-on-surface-muted/70">{hint}</span>}
    </label>
  );
}

