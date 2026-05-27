'use client';

// Phase J.6 — Polymarket-style Simple Mode trade widget.
//
// Mental model: user sees a single outcome ("Algeria wins 2026 WC"), picks
// an amount, hits "Bet on Algeria" → IOC market buy at best ask + 2% slip.
// No order book, no TIF, no Buy/Sell jargon.

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useSession } from '@/lib/use-session';
import { getBuilderConfig } from '@/lib/builder';
import {
  placeMarketBuy,
  fetchMaxBuilderFee,
  parsePctToTenthsBps,
} from '@/lib/trade';
import { fetchOrderBook, maxUsdAtTopOfBook, type OrderBook } from '@/lib/orderbook';
import { EnableTradingModal } from '@/components/EnableTradingModal';
import { CURRENT_NETWORK } from '@/lib/network';
import { assetIdFromKey } from '@/lib/asset-id';
import { loadAgent } from '@/lib/agent';

interface Props {
  /** "#NNNN" asset key. */
  assetKey: string;
  /** Human label (Yes / Algeria / Below 4.3% / ...). */
  sideName: string;
  /** Optional question / outcome label (e.g. "Algeria") for the CTA copy. */
  outcomeLabel?: string;
}

/** HL refuses any order whose notional is below this dollar threshold —
 *  the rejection comes back as `"Order must have minimum value of 10 USDC."`
 *  We mirror it client-side to avoid wasting a wallet signature. */
const MIN_USD = 10;

export function SimpleTradeWidget({ assetKey, sideName, outcomeLabel }: Props) {
  const { session } = useSession();
  const builder = getBuilderConfig();
  const [approved, setApproved] = useState<boolean | null>(null);
  const [hasAgent, setHasAgent] = useState<boolean | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  /** Set when the user clicked Bet but onboarding ran first. Drives a
   *  post-onboarding effect that auto-resumes the bet once hasAgent +
   *  approved transition to true (avoids the stale closure pitfall when
   *  resuming from inside the modal's onEnabled). */
  const resumeBetRef = useRef(false);

  const [book, setBook] = useState<OrderBook | null>(null);
  const [bookErr, setBookErr] = useState<string | null>(null);
  const [bookLoading, setBookLoading] = useState(true);
  const [usdInput, setUsdInput] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  const label = outcomeLabel ?? sideName;

  // Polled book — refresh every 4s while widget is mounted.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      try {
        const b = await fetchOrderBook(assetKey);
        if (cancelled) return;
        setBook(b);
        setBookErr(null);
      } catch (e) {
        if (cancelled) return;
        setBookErr((e as Error).message);
      } finally {
        if (!cancelled) {
          setBookLoading(false);
          timer = window.setTimeout(() => void tick(), 4000);
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [assetKey]);

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

  // Check whether an agent (API wallet) is already onboarded for this user.
  useEffect(() => {
    if (!session) {
      setHasAgent(null);
      return;
    }
    let cancelled = false;
    void loadAgent(session.address, CURRENT_NETWORK).then((a) => {
      if (cancelled) return;
      setHasAgent(a !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Post-onboarding auto-resume. When the modal completes, hasAgent and
  // approved flip to true; if resumeBetRef.current is set we re-invoke
  // onSubmit() in this effect so it captures the fresh state values.
  useEffect(() => {
    if (resumeBetRef.current && hasAgent === true && approved === true && !showOnboard && !busy) {
      resumeBetRef.current = false;
      void onSubmit();
    }
    // We intentionally don't depend on `onSubmit` to avoid an infinite loop;
    // the closure is recreated each render but the effect only triggers on
    // the state transitions above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAgent, approved, showOnboard, busy]);

  const maxUsd = useMemo(() => (book ? maxUsdAtTopOfBook(book) : 0), [book]);
  const askPx = book?.bestAsk?.px ?? null;
  const askSz = book?.bestAsk?.sz ?? 0;
  const bidPx = book?.bestBid?.px ?? null;

  // HF's bid-based notional check is enforced server-side. We mirror it
  // client-side so the user sees "Min $X" reflecting actual reachability.
  // contracts × bidPx ≥ $10 → minContracts = ceil(10 / bidPx)
  // minUsd at ask = minContracts × askPx.
  const minContracts = bidPx ? Math.ceil(10 / bidPx) : 0;
  const dynamicMinUsd = bidPx && askPx ? minContracts * askPx : MIN_USD;
  const minUsd = Math.max(MIN_USD, dynamicMinUsd);

  // Probability is the implied likelihood = ask price (or mid if no ask).
  const probPct = useMemo(() => {
    if (askPx !== null) return askPx * 100;
    if (book?.bestBid) return book.bestBid.px * 100;
    return null;
  }, [askPx, book]);

  const usdNum = Number(usdInput);
  const usdValid = Number.isFinite(usdNum) && usdNum > 0;
  const cappedUsd = usdValid ? Math.min(usdNum, maxUsd) : 0;
  // Same logic as placeMarketBuy: take max(user budget, bid-notional floor).
  const contractsFromUsd =
    cappedUsd > 0 && askPx ? Math.ceil(cappedUsd / askPx) : 0;
  const actualContracts = Math.max(contractsFromUsd, minContracts);
  const actualSpendUsd = askPx ? actualContracts * askPx : 0;
  const previewContracts = actualContracts;
  const previewPayout = previewContracts; // each share pays $1 on win
  const belowMin = usdValid && cappedUsd < minUsd;
  const insufficientLiquidity = usdValid && maxUsd > 0 && maxUsd < minUsd;

  if (!session) {
    return (
      <Banner>Connect a wallet to bet on this market.</Banner>
    );
  }
  if (!builder.configured) {
    return (
      <Banner tone="warn">
        Builder not configured for {CURRENT_NETWORK}. Set{' '}
        <code className="mono">NEXT_PUBLIC_BUILDER_ADDR_{CURRENT_NETWORK.toUpperCase()}</code>{' '}
        and rebuild.
      </Banner>
    );
  }

  const onSubmit = async (): Promise<void> => {
    if (busy) return;
    if (!usdValid) {
      setErr('Enter an amount in USD.');
      return;
    }
    if (!askPx || askSz <= 0) {
      setErr('No sellers right now — try again in a moment.');
      return;
    }
    if (cappedUsd < minUsd) {
      setErr(`Minimum bet is $${minUsd.toFixed(2)} (HL's $${MIN_USD} bid-notional floor in this market).`);
      return;
    }
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      // J.7: If we don't yet have an agent OR builder fee isn't approved,
      // run the onboarding modal which does BOTH in one flow. The resumeBetRef
      // flag drives the post-onboarding effect that auto-fires this fn again
      // with fresh state values (avoids stale-closure footgun).
      if (hasAgent !== true || approved !== true) {
        resumeBetRef.current = true;
        setShowOnboard(true);
        setBusy(false);
        return;
      }
      const r = await placeMarketBuy({
        address: session.address,
        assetId: assetIdFromKey(assetKey),
        usdAmount: cappedUsd,
        bestAskPx: askPx,
        bestAskSz: askSz,
        bestBidPx: bidPx ?? 0,
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
        {/* Header — outcome + current odds */}
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-hl-subtle">
              Bet on
            </div>
            <div className="mt-0.5 text-base font-semibold text-hl-text">
              {label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-hl-subtle">
              Current odds
            </div>
            <div
              className={clsx(
                'mt-0.5 font-mono text-lg font-semibold',
                probPct === null ? 'text-hl-subtle' : 'text-hl-mint',
              )}
            >
              {probPct === null ? '—' : `${probPct.toFixed(1)}%`}
            </div>
          </div>
        </div>

        {/* Amount input + Max */}
        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-hl-subtle">
              Amount (USD)
            </span>
            <div className="flex gap-2">
              <input
                value={usdInput}
                onChange={(e) => setUsdInput(e.target.value)}
                placeholder="$"
                inputMode="decimal"
                className="w-full rounded-lg border border-hl-border bg-hl-bg px-2 py-1.5 font-mono text-sm text-hl-text focus:border-hl-mint focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setUsdInput(maxUsd > 0 ? String(maxUsd.toFixed(2)) : '')}
                disabled={maxUsd <= 0}
                className="rounded-lg border border-hl-border bg-hl-bg px-3 py-1.5 text-xs font-semibold text-hl-text hover:border-hl-mint disabled:opacity-40"
              >
                Max
              </button>
            </div>
          </label>

          {/* Liquidity / max / min line */}
          <div className="text-[11px] text-hl-subtle">
            {bookLoading
              ? 'Loading orderbook…'
              : bookErr
                ? `Book error: ${bookErr}`
                : askPx === null
                  ? 'No sellers right now — nothing to fill against.'
                  : insufficientLiquidity
                    ? `Only $${maxUsd.toFixed(2)} on offer — below this market's $${minUsd.toFixed(2)} min.`
                    : `Min $${minUsd.toFixed(2)} · Max fillable $${maxUsd.toFixed(2)} at ${(askPx * 100).toFixed(1)}%`}
          </div>

          {/* Payout preview */}
          {cappedUsd > 0 && askPx && actualContracts > 0 && (
            <div className="rounded-xl border border-hl-mint/30 bg-hl-mint/5 p-2 text-[11px] text-hl-text">
              <div>
                Spend{' '}
                <strong className="text-hl-mint">${actualSpendUsd.toFixed(2)}</strong>{' '}
                → {previewContracts} shares
                {actualSpendUsd > usdNum + 0.01 && (
                  <span className="text-hl-subtle">
                    {' '}
                    (bumped from ${usdNum.toFixed(2)} to clear HL's ${MIN_USD} bid-notional floor)
                  </span>
                )}
              </div>
              <div>
                Wins{' '}
                <strong className="text-hl-mint">${previewPayout.toFixed(2)}</strong>{' '}
                if {label} wins
                {usdNum > maxUsd && (
                  <span className="text-hl-subtle">
                    {' '}
                    (capped from ${usdNum.toFixed(2)} → ${maxUsd.toFixed(2)} liquidity)
                  </span>
                )}
              </div>
            </div>
          )}

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
            disabled={busy || !usdValid || !askPx || belowMin}
            className={clsx(
              'mt-1 w-full rounded-full bg-hl-mint/15 px-3 py-2.5 text-sm font-semibold uppercase tracking-widest text-hl-mint ring-1 ring-hl-mint hover:bg-hl-mint/25',
              (busy || !usdValid || !askPx || belowMin) && 'cursor-not-allowed opacity-60',
            )}
          >
            {busy
              ? 'Placing bet…'
              : belowMin
                ? `Min $${minUsd.toFixed(2)}`
                : `Bet on ${label}`}
          </button>

          <div className="text-center text-[10px] text-hl-subtle">
            Builder fee: {builder.feeBpsHuman} bps · IOC market at best ask + 2% slippage cap
          </div>
        </div>
      </section>

      <EnableTradingModal
        open={showOnboard}
        onClose={() => {
          resumeBetRef.current = false;
          setShowOnboard(false);
        }}
        onEnabled={() => {
          // Setting state triggers re-render. The post-onboarding effect
          // below sees hasAgent=true + approved=true + resumeBetRef=true
          // and re-invokes onSubmit with fresh closure state.
          setShowOnboard(false);
          setHasAgent(true);
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
