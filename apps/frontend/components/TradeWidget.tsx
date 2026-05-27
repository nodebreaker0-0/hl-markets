'use client';

// Phase J.5 — in-app trade widget for one outcome side.
//
// State machine:
//   - wallet not connected → "Connect to trade" banner
//   - builder not configured (env zero addr)     → "Builder not configured" banner
//   - builder configured + no approval           → ApproveBuilderModal trigger
//   - builder configured + approved              → order form (side / size / price / tif)
//
// HL action `order` requires a numeric `a` (asset id). For outcome markets
// the mapping from `#NNNN` → asset id is currently a TODO (Phase J.5b R&D),
// so the form ships with an explicit input for now.

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useSession } from '@/lib/use-session';
import { getBuilderConfig } from '@/lib/builder';
import { placeOrder, fetchMaxBuilderFee, parsePctToTenthsBps } from '@/lib/trade';
import { ApproveBuilderModal } from '@/components/ApproveBuilderModal';
import { CURRENT_NETWORK } from '@/lib/network';

interface TradeWidgetProps {
  /** "#NNNN" asset key the user is currently looking at. */
  assetKey: string;
  /** Human side label (Yes / No / Change / ...). */
  sideName: string;
  /** Current mid price ([0, 1]) — used as the default price. */
  midPrice: number | null;
}

export function TradeWidget({ assetKey, sideName, midPrice }: TradeWidgetProps) {
  const { session } = useSession();
  const builder = getBuilderConfig();
  const [approved, setApproved] = useState<boolean | null>(null);
  const [showApprove, setShowApprove] = useState(false);

  // Form state
  const [isBuy, setIsBuy] = useState(true);
  const [assetIdStr, setAssetIdStr] = useState('');
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

      const assetId = Number(assetIdStr.trim());
      if (!Number.isFinite(assetId)) throw new Error('asset id must be an integer');
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
      <section className="rounded-2xl border border-hl-border bg-hl-surface p-4">
        <div className="mb-3 flex items-baseline justify-between text-xs text-hl-subtle">
          <span className="uppercase tracking-widest">Trade · {sideName}</span>
          <code className="mono">{assetKey}</code>
        </div>

        <div className="space-y-3 text-sm">
          {/* Side toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsBuy(true)}
              className={clsx(
                'rounded-xl px-3 py-2 text-xs font-semibold ring-1',
                isBuy
                  ? 'bg-hl-mint/15 text-hl-mint ring-hl-mint'
                  : 'bg-hl-bg text-hl-subtle ring-hl-border',
              )}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setIsBuy(false)}
              className={clsx(
                'rounded-xl px-3 py-2 text-xs font-semibold ring-1',
                !isBuy
                  ? 'bg-mainnet/15 text-mainnet ring-mainnet'
                  : 'bg-hl-bg text-hl-subtle ring-hl-border',
              )}
            >
              Sell
            </button>
          </div>

          {/* Asset id (Phase J.5b will resolve this automatically from assetKey). */}
          <Field
            label="asset id"
            hint="HL universe index for this side. Phase J.5b will auto-resolve."
          >
            <input
              value={assetIdStr}
              onChange={(e) => setAssetIdStr(e.target.value)}
              placeholder="e.g. 1010"
              inputMode="numeric"
              className="w-full rounded-lg border border-hl-border bg-hl-bg px-2 py-1.5 font-mono text-sm text-hl-text focus:border-hl-mint focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="size">
              <input
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. 10"
                inputMode="decimal"
                className="w-full rounded-lg border border-hl-border bg-hl-bg px-2 py-1.5 font-mono text-sm text-hl-text focus:border-hl-mint focus:outline-none"
              />
            </Field>
            <Field label="price (0–1)">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 0.43"
                inputMode="decimal"
                className="w-full rounded-lg border border-hl-border bg-hl-bg px-2 py-1.5 font-mono text-sm text-hl-text focus:border-hl-mint focus:outline-none"
              />
            </Field>
          </div>

          <Field label="time in force">
            <select
              value={tif}
              onChange={(e) => setTif(e.target.value as 'Ioc' | 'Gtc')}
              className="w-full rounded-lg border border-hl-border bg-hl-bg px-2 py-1.5 text-sm text-hl-text focus:border-hl-mint focus:outline-none"
            >
              <option value="Gtc">Gtc (resting limit)</option>
              <option value="Ioc">Ioc (immediate or cancel)</option>
            </select>
          </Field>

          <div className="rounded-xl border border-hl-mint/30 bg-hl-mint/5 p-2 text-[11px] text-hl-mint">
            Builder fee:{' '}
            <strong>
              {builder.feeBpsHuman} bps ({(builder.feeBpsHuman / 100).toFixed(3)}%)
            </strong>
            {approved === false && ' · approval pending'}
            {approved === null && ' · checking approval…'}
          </div>

          {err && (
            <div className="rounded-xl border border-mainnet/40 bg-mainnet/10 px-3 py-2 text-xs text-mainnet">
              {err}
            </div>
          )}
          {result !== null && (
            <details className="rounded-xl border border-hl-border bg-hl-bg p-2 text-[11px] text-hl-subtle">
              <summary className="cursor-pointer">HF response</summary>
              <pre className="mt-1 overflow-x-auto text-[10px] text-hl-text">
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
                ? 'bg-hl-mint/15 text-hl-mint ring-hl-mint hover:bg-hl-mint/25'
                : 'bg-mainnet/15 text-mainnet ring-mainnet hover:bg-mainnet/25',
              busy && 'cursor-wait opacity-60',
            )}
          >
            {busy ? 'Signing…' : isBuy ? `Buy ${sideName}` : `Sell ${sideName}`}
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
        'rounded-2xl border bg-hl-surface/60 p-4 text-xs',
        tone === 'warn' ? 'border-testnet/40 text-testnet' : 'border-hl-border text-hl-subtle',
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
      <span className="text-[10px] uppercase tracking-widest text-hl-subtle">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-hl-subtle/70">{hint}</span>}
    </label>
  );
}

