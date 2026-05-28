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
import { fetchOrderBook, maxUsdAtTopOfBook, walkAsks, type OrderBook } from '@/lib/orderbook';
import { EnableTradingModal } from '@/components/EnableTradingModal';
import { CURRENT_NETWORK } from '@/lib/network';
import { assetIdFromKey } from '@/lib/asset-id';
import { loadAgent } from '@/lib/agent';
import { pushToast } from '@/lib/toast';
import { fetchHolding } from '@/lib/portfolio';
import Link from 'next/link';
import { addLeg as basketAddLeg, isInBasket } from '@/lib/basket';
import { parseOutcomeAssetKey } from '@/lib/asset-id';
import { AIAnalyzePanel } from '@/components/AIAnalyzePanel';

interface Props {
  /** "#NNNN" asset key. */
  assetKey: string;
  /** Human label (Yes / Algeria / Below 4.3% / ...). */
  sideName: string;
  /** Optional question / outcome label (e.g. "Algeria") for the CTA copy. */
  outcomeLabel?: string;
  /** Optional resolver text from outcomeMeta — fed straight into AI Analyze. */
  outcomeDescription?: string;
  /** Optional umbrella question title (for AI peer context). */
  questionTitle?: string;
  /** Optional peer prices in the same question (top 8). */
  peerOutcomes?: { name: string; pct: number }[];
  peerSumPct?: number;
  /** Human expiry label, e.g. "expires in 138d 15h". */
  expiry?: string;
}

/** HL refuses any order whose notional is below this dollar threshold —
 *  the rejection comes back as `"Order must have minimum value of 10 USDC."`
 *  We mirror it client-side to avoid wasting a wallet signature. */
const MIN_USD = 10;

export function SimpleTradeWidget({
  assetKey,
  sideName,
  outcomeLabel,
  outcomeDescription,
  questionTitle,
  peerOutcomes,
  peerSumPct,
  expiry,
}: Props) {
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
  const [holding, setHolding] = useState<{ shares: number; entryNtl: number } | null>(null);
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

  // Poll user's holding on this specific asset every 10s so the chip refreshes
  // after a successful Bet without a manual page reload.
  useEffect(() => {
    if (!session) {
      setHolding(null);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      try {
        const h = await fetchHolding(session.address, assetKey);
        if (!cancelled) setHolding(h);
      } catch {
        /* network blip — keep last value */
      } finally {
        if (!cancelled) timer = window.setTimeout(() => void tick(), 10_000);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [session, assetKey]);

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

  /** Total USD the ask side can absorb (Phase J.10 — across all levels,
   *  not just top of book). */
  const maxUsd = useMemo(
    () => (book?.asks ? book.asks.reduce((a, l) => a + l.px * l.sz, 0) : 0),
    [book],
  );
  const topOfBookUsd = useMemo(() => (book ? maxUsdAtTopOfBook(book) : 0), [book]);
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
  // Phase J.10 — walk asks to compute realistic preview (avg + levels touched).
  const walkPreview = useMemo(() => {
    if (!book?.asks?.length || cappedUsd <= 0) return null;
    return walkAsks(book.asks, cappedUsd, 2);
  }, [book, cappedUsd]);
  const previewContracts = walkPreview
    ? Math.max(walkPreview.contracts, minContracts)
    : 0;
  const actualSpendUsd = walkPreview ? walkPreview.spendUsd : 0;
  const avgFillPx = walkPreview ? walkPreview.avgPx : (askPx ?? 0);
  const levelsTouched = walkPreview ? walkPreview.levelsTouched : 0;
  const previewPayout = previewContracts; // each share pays $1 on win
  const belowMin = usdValid && cappedUsd < minUsd;
  const insufficientLiquidity = usdValid && maxUsd > 0 && maxUsd < minUsd;
  /** User asked for more than the visible top-of-book can absorb. Surface
   *  in red so they don't believe the typed $ number will spend in full. */
  const overLiquidity = usdValid && maxUsd > 0 && usdNum > maxUsd + 0.01;

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
        asks: book?.asks ?? undefined, // J.10 — walk-the-book
      });
      setResult(r);
      // Surface fill / partial / reject as a toast.
      const status = extractFillStatus(r);
      if (status.kind === 'filled') {
        pushToast({
          tone: 'success',
          message: `Bet on ${label} filled`,
          detail: `${status.sz} shares @ ${status.px} · OID ${status.oid}`,
        });
      } else if (status.kind === 'resting') {
        pushToast({
          tone: 'info',
          message: `Order resting on ${label}`,
          detail: `OID ${status.oid}`,
        });
      } else if (status.kind === 'error') {
        pushToast({ tone: 'error', message: 'HL rejected order', detail: status.error });
      }
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      pushToast({ tone: 'error', message: 'Bet failed', detail: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-divider bg-surface-elevated p-4">
        {/* Header — outcome + current odds */}
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-on-surface-muted">
              Bet on
            </div>
            <div className="mt-0.5 text-base font-semibold text-on-surface">
              {label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-on-surface-muted">
              Current odds
            </div>
            <div
              className={clsx(
                'mt-0.5 font-mono text-lg font-semibold',
                probPct === null ? 'text-on-surface-muted' : 'text-primary',
              )}
            >
              {probPct === null ? '—' : `${probPct.toFixed(1)}%`}
            </div>
          </div>
        </div>

        {/* Your holding chip (J.8 polish) */}
        {holding && (
          <Link
            href="/portfolio"
            className="mb-2 block rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[11px] text-on-surface hover:bg-primary/15"
          >
            <span className="text-on-surface-muted">You hold</span>{' '}
            <strong className="text-primary">{holding.shares} shares</strong>
            {bidPx !== null && (
              <span className="text-on-surface-muted"> · now ${(holding.shares * bidPx).toFixed(2)}</span>
            )}
            <span className="float-right text-primary">Portfolio →</span>
          </Link>
        )}

        {/* Amount input + Max */}
        <div className="space-y-3">
          {/* W-10 — Big-number amount input (토스 DNA). 사용자 시각이 숫자에
              집중. `$` prefix 가 input 좌측에, mono+tnum 으로 column align. */}
          <label className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">
              Amount
            </span>
            <div
              className={clsx(
                'flex items-center gap-1 border-b-2 pb-2 transition-colors',
                overLiquidity
                  ? 'border-accent-down'
                  : usdInput
                    ? 'border-primary'
                    : 'border-divider',
              )}
            >
              <span
                className={clsx(
                  'mono text-big-number-md font-bold tabular-nums leading-none',
                  overLiquidity ? 'text-accent-down' : 'text-on-surface-muted',
                )}
              >
                $
              </span>
              <input
                value={usdInput}
                onChange={(e) => setUsdInput(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                aria-label="Bet amount in USD"
                className={clsx(
                  'mono flex-1 bg-transparent text-big-number-md font-bold tabular-nums leading-none focus:outline-none placeholder:text-on-surface-subtle',
                  overLiquidity ? 'text-accent-down' : 'text-on-surface',
                )}
              />
              <button
                type="button"
                onClick={() => setUsdInput(maxUsd > 0 ? String(maxUsd.toFixed(2)) : '')}
                disabled={maxUsd <= 0}
                className="shrink-0 rounded-full bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-on-surface-muted hover:text-on-surface disabled:opacity-40"
              >
                Max
              </button>
            </div>
            {/* Quick-amount chips (토스 패턴). 4개 preset 으로 thumb 친화. */}
            <div className="flex gap-2">
              {[10, 25, 50, 100].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setUsdInput(String(amt))}
                  disabled={maxUsd > 0 && amt > maxUsd}
                  className="flex-1 rounded-md bg-surface px-2 py-1.5 text-xs font-semibold text-on-surface-muted hover:bg-surface-overlay hover:text-on-surface disabled:opacity-40"
                >
                  ${amt}
                </button>
              ))}
            </div>
          </label>

          {/* Liquidity / max / min line — red when user exceeds total ask depth */}
          <div
            className={clsx(
              'text-[11px]',
              overLiquidity ? 'text-accent-down font-semibold' : 'text-on-surface-muted',
            )}
          >
            {bookLoading
              ? 'Loading orderbook…'
              : bookErr
                ? `Book error: ${bookErr}`
                : askPx === null
                  ? 'No sellers right now — nothing to fill against.'
                  : insufficientLiquidity
                    ? `Only $${maxUsd.toFixed(2)} on offer — below this market's $${minUsd.toFixed(2)} min.`
                    : overLiquidity
                      ? `⚠ Only $${maxUsd.toFixed(2)} of total ask depth — your $${usdNum.toFixed(2)} will cap there.`
                      : `Min $${minUsd.toFixed(2)} · Top of book $${topOfBookUsd.toFixed(2)} @ ${(askPx * 100).toFixed(1)}% · Total depth $${maxUsd.toFixed(2)}`}
          </div>

          {/* Payout preview */}
          {cappedUsd > 0 && askPx && previewContracts > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-2 text-[11px] text-on-surface">
              <div>
                Spend{' '}
                <strong className="text-primary">${actualSpendUsd.toFixed(2)}</strong>{' '}
                → {previewContracts} shares
                {' '}
                <span className="text-on-surface-muted">
                  · avg fill {(avgFillPx * 100).toFixed(1)}%
                  {levelsTouched > 1 && ` across ${levelsTouched} levels`}
                </span>
              </div>
              <div>
                Wins{' '}
                <strong className="text-primary">${previewPayout.toFixed(2)}</strong>{' '}
                if {label} wins
                {overLiquidity && (
                  <span className="text-accent-down font-semibold">
                    {' '}
                    (capped from ${usdNum.toFixed(2)} → ${maxUsd.toFixed(2)} total ask)
                  </span>
                )}
              </div>
            </div>
          )}

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

          {/* W-10 — Primary CTA solid mint (DESIGN.md button-primary). 모바일
              thumb 친화 (min-h 44px = py-md + text-button 충분). full-width
              hero CTA + bold uppercase. */}
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={busy || !usdValid || !askPx || belowMin}
            className={clsx(
              'mt-2 w-full rounded-md bg-primary px-base py-md text-button font-bold text-on-primary transition-colors hover:bg-primary-bright',
              (busy || !usdValid || !askPx || belowMin) &&
                'cursor-not-allowed bg-divider text-on-surface-disabled hover:bg-divider',
            )}
          >
            {busy
              ? 'Placing bet…'
              : belowMin
                ? `Min $${minUsd.toFixed(2)}`
                : `Bet $${usdValid && usdNum > 0 ? usdNum.toFixed(0) : '?'} on ${label}`}
          </button>

          {/* Phase K — Add to basket as a secondary action. Builds toward a
              multi-leg order placed in one signature from the basket sheet. */}
          <button
            type="button"
            onClick={() => {
              const parsed = parseOutcomeAssetKey(assetKey);
              if (!parsed) return;
              try {
                basketAddLeg({
                  outcomeId: parsed.outcomeId,
                  sideIdx: parsed.sideIdx,
                  outcomeName: outcomeLabel ?? sideName,
                  sideName,
                  usdAmount: usdValid && usdNum > 0 ? usdNum : 10,
                });
                pushToast({
                  tone: 'success',
                  message: `Added ${label} to basket`,
                  detail: 'Open the basket (bottom-right) to place a multi-leg bet.',
                  ttlMs: 3500,
                });
              } catch (e) {
                pushToast({ tone: 'error', message: (e as Error).message });
              }
            }}
            disabled={!askPx}
            className="mt-1 w-full rounded-full border border-divider bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-on-surface-muted ring-1 ring-divider hover:text-primary disabled:opacity-40"
          >
            {isInBasket(parseOutcomeAssetKey(assetKey)?.outcomeId ?? -1, parseOutcomeAssetKey(assetKey)?.sideIdx ?? -1)
              ? '✓ In basket — update amount'
              : '+ Add to basket'}
          </button>

          <div className="text-center text-[10px] text-on-surface-muted">
            Outcome buys are <strong>fee 0</strong> on HL · IOC market at best ask + 2% slip
            <br />
            Cash out later collects HL{"'"}s {builder.feeBpsHuman} bps fee on the USDC you receive.
          </div>
        </div>
      </section>

      <AIAnalyzePanel
        outcomeName={outcomeLabel ?? sideName}
        sideName={sideName}
        description={
          outcomeDescription && outcomeDescription.trim().length > 0
            ? outcomeDescription
            : `(no resolver text provided) Market is pricing ${probPct !== null ? probPct.toFixed(1) : '—'}% for ${outcomeLabel ?? sideName}.`
        }
        currentPct={probPct ?? 0}
        expiry={expiry}
        questionTitle={questionTitle}
        peerOutcomes={peerOutcomes}
        peerSumPct={peerSumPct}
        bookSummary={
          askPx !== null && bidPx !== null
            ? `ask ${(askPx * 100).toFixed(1)}% × ${askSz} · bid ${(bidPx * 100).toFixed(1)}% × ${book?.bestBid?.sz ?? 0} · spread ${((askPx - bidPx) * 100).toFixed(1)}pp`
            : undefined
        }
        userPositionUsd={
          holding && bidPx !== null ? holding.shares * bidPx : undefined
        }
        onSuggestAmount={(usd) => setUsdInput(String(usd))}
      />

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

/** Parse HF /exchange response to a shape suitable for the toast layer. */
interface HfStatusEntry {
  filled?: { totalSz?: string; avgPx?: string; oid?: number };
  resting?: { oid?: number };
  error?: string;
}
interface HfResponse {
  status?: 'ok' | 'err';
  response?: { type?: string; data?: { statuses?: HfStatusEntry[] } };
}
type FillStatus =
  | { kind: 'filled'; sz: string; px: string; oid: number }
  | { kind: 'resting'; oid: number }
  | { kind: 'error'; error: string }
  | { kind: 'unknown' };

function extractFillStatus(r: unknown): FillStatus {
  const obj = r as HfResponse;
  const entry = obj?.response?.data?.statuses?.[0];
  if (!entry) return { kind: 'unknown' };
  if (entry.filled) {
    return {
      kind: 'filled',
      sz: entry.filled.totalSz ?? '',
      px: entry.filled.avgPx ?? '',
      oid: entry.filled.oid ?? 0,
    };
  }
  if (entry.resting) {
    return { kind: 'resting', oid: entry.resting.oid ?? 0 };
  }
  if (entry.error) {
    return { kind: 'error', error: entry.error };
  }
  return { kind: 'unknown' };
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
