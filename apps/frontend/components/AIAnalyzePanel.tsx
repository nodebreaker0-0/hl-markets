'use client';

// Phase M — AI Analyze panel.
//
// Sits below SimpleTradeWidget (or anywhere with outcome context). User
// clicks "Analyze" → direct browser → LLM call with stored key → fair %
// gauge + reasoning bullets + "Use $X" CTA that pre-fills the bet input.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  loadKeys,
  analyzeOutcome,
  type LlmProvider,
  type AnalysisResult,
  type AnalyzeInput,
} from '@/lib/llm';
import { searchTavily, formatSearchBlob } from '@/lib/search';
import { pushToast } from '@/lib/toast';

interface Props {
  outcomeName: string;
  sideName: string;
  description: string;
  currentPct: number;
  expiry?: string;
  /** Multi-option question umbrella, when applicable. */
  questionTitle?: string;
  /** Peer outcome prices for relative context (top 8). */
  peerOutcomes?: { name: string; pct: number }[];
  peerSumPct?: number;
  /** One-line orderbook summary. */
  bookSummary?: string;
  /** User's existing position on this side, USD. */
  userPositionUsd?: number;
  /** Recent candle summary, e.g. "48.4% → +2.3pp in 24h". */
  recentPriceBlob?: string;
  /** Called when user clicks "Use $X" — receives suggested USD amount. */
  onSuggestAmount?: (usd: number) => void;
  /** Used to derive a sensible default bet size from the user's free USDC. */
  freeUsdc?: number;
}

export function AIAnalyzePanel({
  outcomeName,
  sideName,
  description,
  currentPct,
  expiry,
  questionTitle,
  peerOutcomes,
  peerSumPct,
  bookSummary,
  userPositionUsd,
  recentPriceBlob,
  onSuggestAmount,
  freeUsdc,
}: Props): JSX.Element {
  const [keys, setKeys] = useState(() => loadKeys());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Refresh keys from localStorage in case user updated them in another tab
  // or just came back from /settings.
  useEffect(() => {
    const onStorage = (): void => setKeys(loadKeys());
    window.addEventListener('focus', onStorage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', onStorage);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const provider: LlmProvider | null = keys.preferred;
  const activeKey: string | null =
    provider === 'openai' ? keys.openai : provider === 'anthropic' ? keys.anthropic : null;
  const configured = provider !== null && !!activeKey;

  const onAnalyze = async (): Promise<void> => {
    if (!provider || !activeKey) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      // Tier 2 — if user supplied a Tavily key, do a quick search first and
      // inject the top hits into the LLM prompt.
      let webContext: string | undefined;
      if (keys.tavily) {
        try {
          const query = `${questionTitle ?? outcomeName} ${outcomeName} probability news`;
          const hits = await searchTavily(keys.tavily, query, 5);
          webContext = formatSearchBlob(hits);
        } catch (e) {
          // Search failed — degrade gracefully, run LLM without web context.
          pushToast({
            tone: 'info',
            message: 'Web search skipped',
            detail: (e as Error).message,
            ttlMs: 3000,
          });
        }
      }

      const input: AnalyzeInput = {
        outcomeName,
        sideName,
        description,
        currentPct,
        expiry,
        questionTitle,
        peerOutcomes,
        peerSumPct,
        bookSummary,
        userPositionUsd,
        recentPriceBlob,
        webContext,
      };
      const r = await analyzeOutcome(provider, activeKey, input);
      setResult(r);
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      pushToast({ tone: 'error', message: 'AI analyze failed', detail: msg });
    } finally {
      setBusy(false);
    }
  };

  // Suggest a quarter-Kelly sized bet when we have an edge + free USDC.
  // f* = (b*p - q) / b where b = (1-price)/price, p = fairPct/100, q = 1-p.
  // Quarter-Kelly = f* / 4. Cap at 10% of free USDC.
  const suggestedUsd = computeSuggestedUsd(result, currentPct, freeUsdc);

  if (!configured) {
    return (
      <section className="rounded-2xl border border-divider bg-surface-elevated/60 p-3 text-xs text-on-surface-muted">
        <div className="font-semibold text-on-surface">AI Analyze (off)</div>
        <p className="mt-1">
          Add your own OpenAI or Anthropic key in{' '}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>
          . hl-markets servers never see the key — direct browser → provider.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-divider bg-surface-elevated p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
          AI Analyze · {provider}
        </div>
        <button
          type="button"
          onClick={() => void onAnalyze()}
          disabled={busy}
          className={clsx(
            'rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary ring-1 ring-primary',
            busy && 'cursor-wait opacity-60',
          )}
        >
          {busy ? 'Thinking…' : result ? 'Re-analyze' : 'Analyze'}
        </button>
      </div>

      {err && (
        <div className="mt-2 rounded-lg border border-accent-down/40 bg-accent-down/10 px-2 py-1.5 text-[11px] text-accent-down">
          {err}
        </div>
      )}

      {result && (
        <div className="mt-3 space-y-3">
          <Gauge fairPct={result.fairPct} marketPct={currentPct} confidence={result.confidence} />
          {result.reasoning.length > 0 && (
            <ul className="space-y-1 text-[11px] text-on-surface">
              {result.reasoning.map((b, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-primary">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {result.caveat && (
            <div className="text-[10px] italic text-on-surface-muted">⚠ {result.caveat}</div>
          )}
          {suggestedUsd > 0 && onSuggestAmount && (
            <button
              type="button"
              onClick={() => {
                onSuggestAmount(suggestedUsd);
                pushToast({
                  tone: 'success',
                  message: `Suggested $${suggestedUsd.toFixed(2)} loaded into Amount`,
                  detail: 'Sign yourself — AI never auto-bets.',
                });
              }}
              className="w-full rounded-full bg-primary/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary ring-1 ring-primary hover:bg-primary/25"
            >
              Use ${suggestedUsd.toFixed(2)} (quarter-Kelly)
            </button>
          )}
          <div className="text-center text-[10px] text-on-surface-muted">
            Est cost: ${result.estCostUsd.toFixed(4)} · You sign every bet · AI never auto-trades
          </div>
        </div>
      )}
    </section>
  );
}

function Gauge({
  fairPct,
  marketPct,
  confidence,
}: {
  fairPct: number;
  marketPct: number;
  confidence: 'low' | 'medium' | 'high';
}): JSX.Element {
  const edge = fairPct - marketPct;
  const edgeTone =
    Math.abs(edge) < 3 ? 'text-on-surface-muted' : edge > 0 ? 'text-primary' : 'text-accent-down';
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-2">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
            AI fair
          </div>
          <div className="mono text-2xl font-bold text-primary">{fairPct.toFixed(1)}%</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
            Market
          </div>
          <div className="mono text-base text-on-surface">{marketPct.toFixed(1)}%</div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className={clsx('font-semibold', edgeTone)}>
          {edge >= 0 ? '+' : ''}
          {edge.toFixed(1)}pp edge
        </span>
        <span
          className={clsx(
            'rounded-full px-1.5 py-0 text-[9px] font-semibold uppercase tracking-widest',
            confidence === 'high'
              ? 'bg-primary/15 text-primary'
              : confidence === 'medium'
                ? 'bg-status-warn/15 text-status-warn'
                : 'bg-surface text-on-surface-muted',
          )}
        >
          {confidence} conf
        </span>
      </div>
    </div>
  );
}

function computeSuggestedUsd(
  result: AnalysisResult | null,
  marketPct: number,
  freeUsdc?: number,
): number {
  if (!result) return 0;
  const free = freeUsdc ?? 100; // when wallet has no balance, default to a $10-$25 educational suggestion
  const price = marketPct / 100;
  if (price <= 0 || price >= 1) return 0;
  const p = result.fairPct / 100;
  const q = 1 - p;
  const b = (1 - price) / price;
  const kellyFraction = (b * p - q) / b;
  if (!Number.isFinite(kellyFraction) || kellyFraction <= 0) return 0;
  const quarterKelly = kellyFraction / 4;
  const cap = free * 0.1; // never suggest more than 10% of free USDC
  const usd = Math.min(quarterKelly * free, cap);
  // Floor at HL's $10 minimum so the suggestion is actually placeable.
  if (usd < 10) return 0;
  return Math.round(usd * 100) / 100;
}
