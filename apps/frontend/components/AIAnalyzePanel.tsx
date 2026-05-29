'use client';

// T-X-100 — AIAnalyzePanel deep agent swap.
//
// 기존 Phase M shallow analyzer (`analyzeOutcome`) → Phase U deep agent
// (`analyzeOutcomeDeep`) 로 교체. 차이:
//
//   • shallow = single LLM call with markdown context (peer prices, book summary).
//   • deep    = category dispatch → SKILL.md system prompt → domain fetcher
//               (CoinGecko / Tavily / FRED / football-data / OpenWeather) →
//               LLM call with structured signals → Zod-validated AnalystOutput.
//
// UI 는 fairPct + edge + confidence gauge + reasoning bullets + (new) sources
// links + (new) raw signals chip 표시. quarter-Kelly 사이즈 제안 + onSuggestAmount
// callback 은 그대로 보존.
//
// Constitution V (keys are user-owned, server never sees them) 정합 — keys 는
// 여전히 localStorage 에서 load + 직접 browser → provider 호출.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { loadKeys } from '@/lib/llm';
import { analyzeOutcomeDeep, type DeepAgentKeys } from '@/lib/agents/orchestrator';
import type { AnalystOutput } from '@/lib/agents/types';
import type { LlmProvider } from '@/lib/llm-raw';
import { pushToast } from '@/lib/toast';

interface Props {
  outcomeName: string;
  sideName: string;
  description: string;
  currentPct: number;
  expiry?: string;
  /** Multi-option question umbrella, when applicable. */
  questionTitle?: string;
  /** Outcome id — used for diagnostics / future logging. Optional. */
  outcomeId?: number;
  /** Peer outcome prices for relative context (top 8). Currently unused by
   *  deep agent (which uses fetcher signals instead), but kept in the prop
   *  signature so existing callers don't break. */
  peerOutcomes?: { name: string; pct: number }[];
  peerSumPct?: number;
  /** One-line orderbook summary. Unused by deep agent — kept for compat. */
  bookSummary?: string;
  /** User's existing position on this side, USD. Unused by deep agent. */
  userPositionUsd?: number;
  /** Recent candle summary. Unused by deep agent. */
  recentPriceBlob?: string;
  /** Called when user clicks "Use $X" — receives suggested USD amount. */
  onSuggestAmount?: (usd: number) => void;
  /** Used to derive a sensible default bet size from the user's free USDC. */
  freeUsdc?: number;
}

export function AIAnalyzePanel({
  outcomeName,
  description,
  currentPct,
  questionTitle,
  outcomeId,
  onSuggestAmount,
  freeUsdc,
}: Props): JSX.Element {
  const [keys, setKeys] = useState(() => loadKeys());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AnalystOutput | null>(null);

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
      const agentKeys: DeepAgentKeys = {
        provider,
        llmKey: activeKey,
        tavily: keys.tavily ?? null,
        footballData: keys.footballData ?? null,
        fred: keys.fred ?? null,
        openweather: keys.openweather ?? null,
      };
      const r = await analyzeOutcomeDeep(
        {
          outcomeId: outcomeId ?? 0,
          outcomeName,
          description,
          questionTitle,
          marketPct: currentPct,
        },
        agentKeys,
      );
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
          AI Analyze · deep · {provider}
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
          {result.sources.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {result.sources.map((s, i) => (
                <SourceChip key={i} source={s} />
              ))}
            </div>
          )}
          {Object.keys(result.rawSignals).length > 0 && (
            <details className="rounded-lg bg-surface/40 px-2 py-1.5">
              <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-on-surface-muted hover:text-on-surface">
                Raw signals ({Object.keys(result.rawSignals).length})
              </summary>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                {Object.entries(result.rawSignals).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="truncate text-on-surface-muted">{k}</dt>
                    <dd className="mono shrink-0 tabular-nums text-on-surface">
                      {typeof v === 'number' ? formatSignal(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
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
            You sign every bet · AI never auto-trades
          </div>
        </div>
      )}
    </section>
  );
}

function SourceChip({ source }: { source: { label: string; url?: string } }): JSX.Element {
  const cls =
    'inline-flex max-w-[140px] truncate rounded-full bg-surface px-2 py-0.5 text-[10px] text-on-surface-muted ring-1 ring-divider hover:text-on-surface';
  if (source.url) {
    return (
      <a href={source.url} target="_blank" rel="noopener noreferrer" className={cls}>
        {source.label}
      </a>
    );
  }
  return <span className={cls}>{source.label}</span>;
}

/** Compact number formatter — keeps signals readable.
 *  72669.5  → "72,670"
 *  -1.6371  → "-1.64"
 *  43505047487 → "43.51B"
 *  3.49     → "3.49" */
function formatSignal(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs === 0) return '0';
  if (abs < 0.01) return n.toExponential(2);
  return n.toFixed(2);
}

function Gauge({
  fairPct,
  marketPct,
  confidence,
}: {
  fairPct: number;
  marketPct: number;
  confidence: 'low' | 'med' | 'high';
}): JSX.Element {
  const edge = fairPct - marketPct;
  const edgeTone =
    Math.abs(edge) < 3 ? 'text-on-surface-muted' : edge > 0 ? 'text-primary' : 'text-accent-down';
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-md">
      <div className="flex items-baseline justify-between gap-md">
        <div className="flex flex-col gap-px">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">
            AI fair
          </span>
          <span className="mono text-big-number-md font-bold leading-none text-primary tabular-nums">
            {fairPct.toFixed(1)}%
          </span>
        </div>
        <div className="flex flex-col items-end gap-px">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">
            Market
          </span>
          <span className="mono text-mono-big tabular-nums text-on-surface">
            {marketPct.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="mt-sm flex items-center justify-between text-[11px]">
        <span className={clsx('mono font-semibold tabular-nums', edgeTone)}>
          {edge >= 0 ? '+' : ''}
          {edge.toFixed(1)}pp edge
        </span>
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest',
            confidence === 'high'
              ? 'bg-primary/15 text-primary'
              : confidence === 'med'
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
  result: AnalystOutput | null,
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
