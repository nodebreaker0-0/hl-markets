'use client';

// Polymarket-style multi-option market detail.
// URL: /q/?network=<testnet|mainnet>&id=<questionId>
//
// outcomeMeta.questions describes a question + its `namedOutcomes` (option
// outcomeIds). Each option's % chance is the `Yes` side mid of that outcome
// (assetKey `#${outcomeId * 10}`). The user picks an option to populate the
// chart + orderbook for its Yes side.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { SiteHeader } from '@/components/SiteHeader';
import { OutcomePriceChart } from '@/components/OutcomePriceChart';
import { MiniOrderbook } from '@/components/MiniOrderbook';
import {
  fetchOutcomeMeta,
  fetchAllMids,
  fetchL2Book,
  fetchCandleSnapshot,
  type OutcomeMetaEntry,
  type OutcomeQuestion,
  type AllMidsResponse,
  type L2BookResponse,
  type Candle,
} from '@/lib/api';
import {
  questionLabel,
  optionLabel,
  expiryCountdown,
} from '@/lib/outcome-question';
import { walkAsks, fmtUsd, fmtSize, type AskWalk } from '@/lib/liquidity';
import { CURRENT_NETWORK, type Network } from '@/lib/network';
import { ChatPanel } from '@/components/ChatPanel';
import { TradeWidget } from '@/components/TradeWidget';

const REFRESH_MS = 30_000;
const CANDLE_WINDOW_MS = 24 * 60 * 60 * 1000;

function readMid(mids: AllMidsResponse, key: string): number | null {
  const v = mids[key];
  return v !== undefined && v !== null ? Number(v) : null;
}

function assetKeyYes(outcomeId: number): string {
  return `#${outcomeId * 10}`;
}

function pct(p: number | null, digits = 1): string {
  return p !== null ? `${(p * 100).toFixed(digits)}%` : '—';
}

function tradeUrl(network: Network, assetKey: string): string {
  const host =
    network === 'mainnet' ? 'https://app.hyperliquid.xyz' : 'https://app.hyperliquid-testnet.xyz';
  return `${host}/trade/${encodeURIComponent(assetKey)}`;
}

function QuestionInner() {
  const params = useSearchParams();
  // Network is build-time; the deprecated `?network=` query is ignored.
  const network: Network = CURRENT_NETWORK;
  const idStr = params.get('id');
  const questionId = idStr !== null && idStr.length > 0 ? Number(idStr) : null;
  const validId = questionId !== null && Number.isFinite(questionId);

  const [question, setQuestion] = useState<OutcomeQuestion | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomeMetaEntry[]>([]);
  const [mids, setMids] = useState<AllMidsResponse>({});
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [book, setBook] = useState<L2BookResponse | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  /** outcomeId → ask-side walk for that option's Yes asset. Populated for
   *  every namedOutcome on each refresh so the option list can show "how
   *  much can I buy and how much can I make". */
  const [askByOutcome, setAskByOutcome] = useState<Map<number, AskWalk>>(new Map());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const refresh = useCallback(
    async (n: Network, qid: number, selectedId: number | null) => {
      setLoading(true);
      setErr(null);
      try {
        const [meta, am] = await Promise.all([fetchOutcomeMeta(n), fetchAllMids(n)]);
        const q = meta.questions.find((x) => x.question === qid);
        if (!q) {
          setQuestion(null);
          throw new Error(`Question #${qid} not found in outcomeMeta`);
        }
        setQuestion(q);
        setOutcomes(meta.outcomes);
        setMids(am);

        const pickId = selectedId ?? q.namedOutcomes[0] ?? null;
        const now = Date.now();

        // Fan out: book for every option (so the list row can show depth) +
        // candle history only for the selected option. Books are tiny (top of
        // book + a handful of levels) so N≈3–6 calls per refresh is fine.
        const bookPromises = q.namedOutcomes.map((id) =>
          fetchL2Book(n, assetKeyYes(id))
            .then((b) => [id, b] as const)
            .catch(() => [id, null] as const),
        );
        const candlePromise =
          pickId !== null
            ? fetchCandleSnapshot(
                n,
                assetKeyYes(pickId),
                '1h',
                now - CANDLE_WINDOW_MS,
                now,
              ).catch(() => [] as Candle[])
            : Promise.resolve([] as Candle[]);

        const [bookPairs, cs] = await Promise.all([
          Promise.all(bookPromises),
          candlePromise,
        ]);

        const askMap = new Map<number, AskWalk>();
        let activeBook: L2BookResponse | null = null;
        for (const [id, b] of bookPairs) {
          askMap.set(id, walkAsks(b));
          if (id === pickId) activeBook = b;
        }
        setAskByOutcome(askMap);
        setBook(activeBook);
        setCandles(cs);

        setLoadedAt(Date.now());
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!validId) return;
    void refresh(network, questionId, selectedOutcomeId);
    const t = setInterval(() => {
      if (network && validId) void refresh(network, questionId, selectedOutcomeId);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [network, questionId, selectedOutcomeId, validId, refresh]);

  const outcomeMap = useMemo(() => {
    const m = new Map<number, OutcomeMetaEntry>();
    for (const o of outcomes) m.set(o.outcome, o);
    return m;
  }, [outcomes]);

  if (!validId) {
    return (
      <Fallback>
        Missing <code className="mono">id</code> in the URL.
      </Fallback>
    );
  }
  if (loading && !question) return <Fallback>Loading…</Fallback>;
  if (err && !question) return <Fallback>API error: {err}</Fallback>;
  if (!question) {
    return (
      <Fallback>
        Question <strong className="text-on-surface">#{questionId}</strong> not found on{' '}
        <strong className="text-on-surface">{network}</strong>.
      </Fallback>
    );
  }

  const options = question.namedOutcomes.map((id) => {
    const o = outcomeMap.get(id);
    return {
      outcomeId: id,
      name: o
        ? optionLabel(o.name, o.description ?? '', question.description ?? '')
        : `outcome ${id}`,
      yesPct: readMid(mids, assetKeyYes(id)),
    };
  });
  const qTitle = questionLabel(question.name, question.description ?? '');
  const exp = expiryCountdown(question.description);

  // "Best upside" = option whose ask-side walk has the largest cumulative
  // max profit (size − cost). The option a buyer would pile into if their
  // only goal is absolute payout, ignoring conviction. Null when no asks
  // exist on any option.
  const bestUpsideId = ((): number | null => {
    let best: { id: number; profit: number } | null = null;
    for (const opt of options) {
      const a = askByOutcome.get(opt.outcomeId);
      if (!a || a.size === 0) continue;
      if (!best || a.maxProfit > best.profit) {
        best = { id: opt.outcomeId, profit: a.maxProfit };
      }
    }
    return best?.id ?? null;
  })();
  const activeOutcomeId =
    selectedOutcomeId !== null ? selectedOutcomeId : question.namedOutcomes[0] ?? null;
  const activeOption =
    activeOutcomeId !== null ? options.find((o) => o.outcomeId === activeOutcomeId) : null;
  const activeAssetKey = activeOutcomeId !== null ? assetKeyYes(activeOutcomeId) : '';

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
          <span className="text-on-surface-muted/70">
            {loadedAt ? `updated ${new Date(loadedAt).toLocaleTimeString()}` : ''}
          </span>
        </div>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">
          {qTitle}
        </h1>
        {qTitle !== question.name && (
          <p className="text-xs text-on-surface-muted">{question.name}</p>
        )}
        <p className="text-[11px] text-on-surface-muted/70">
          question #{question.question} · {question.namedOutcomes.length} options · fallback
          outcome #{question.fallbackOutcome}
          {exp && (
            <>
              {' · '}
              <span className={exp.expired ? 'text-accent-down' : 'text-on-surface'}>
                {exp.label}
              </span>
            </>
          )}
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-on-surface-muted">Options</h2>
        <div className="space-y-2">
          {options.map((opt) => {
            const on = opt.outcomeId === activeOutcomeId;
            const ask = askByOutcome.get(opt.outcomeId);
            return (
              <button
                key={opt.outcomeId}
                type="button"
                onClick={() => setSelectedOutcomeId(opt.outcomeId)}
                aria-pressed={on}
                className={clsx(
                  'flex w-full flex-col gap-1.5 rounded-2xl border px-4 py-3 text-left transition-colors',
                  on
                    ? 'border-primary bg-primary/10'
                    : 'border-divider bg-surface-elevated hover:border-primary/50',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2 truncate font-medium text-on-surface">
                    <span className="truncate">{opt.name}</span>
                    {opt.outcomeId === bestUpsideId && (
                      <span
                        className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary ring-1 ring-primary/40"
                        title="Largest cumulative max profit across this question's options. Buying out all asks here returns the most if this option wins."
                      >
                        Best upside
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-lg font-semibold text-primary">
                    {pct(opt.yesPct, 1)}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full bg-primary/80 transition-all"
                    style={{
                      width: `${
                        opt.yesPct !== null
                          ? Math.max(0, Math.min(1, opt.yesPct)) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10px] text-on-surface-muted">
                  <span>outcome #{opt.outcomeId}</span>
                  {ask && ask.size > 0 ? (
                    <span className="font-mono text-on-surface">
                      buy <strong>{fmtSize(ask.size)}</strong> @{' '}
                      {ask.avgPrice.toFixed(3)} · win{' '}
                      <strong className="text-primary">
                        +{fmtUsd(ask.maxProfit)}
                      </strong>
                    </span>
                  ) : (
                    <span className="text-on-surface-muted/70">no offers</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {activeOption && (
        <>
          <OutcomePriceChart
            candles={candles}
            side={`${activeOption.name} · Yes`}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MiniOrderbook book={book} assetKey={activeAssetKey} />
            <div className="rounded-2xl border border-divider bg-surface-elevated p-4 text-xs text-on-surface-muted">
              <div className="mb-2 uppercase tracking-widest">Selected option</div>
              <dl className="space-y-1 font-mono text-[11px] text-on-surface">
                <Row label="name">{activeOption.name}</Row>
                <Row label="Yes mid">{pct(activeOption.yesPct)}</Row>
                <Row label="outcome">
                  <code className="mono">#{activeOption.outcomeId}</code>
                </Row>
                <Row label="asset">
                  <code className="mono">{activeAssetKey}</code>
                </Row>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/o?id=${activeOption.outcomeId}`}
                  className="rounded-full bg-surface-elevated px-3 py-1.5 text-[11px] font-medium text-on-surface ring-1 ring-divider hover:border-primary"
                >
                  Outcome detail →
                </Link>
                <a
                  href={tradeUrl(network, activeAssetKey)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary ring-1 ring-primary hover:bg-primary/25"
                >
                  Trade on Hyperliquid ↗
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      {question.description && (
        <section>
          <h2 className="mb-2 text-xs uppercase tracking-widest text-on-surface-muted">About</h2>
          <p className="whitespace-pre-wrap rounded-2xl border border-divider bg-surface-elevated p-4 text-sm leading-relaxed text-on-surface/90">
            {question.description}
          </p>
        </section>
      )}

      {activeOption && (
        <TradeWidget
          assetKey={activeAssetKey}
          sideName={`${activeOption.name} · Yes`}
          midPrice={activeOption.yesPct}
          outcomeLabel={activeOption.name}
          outcomeDescription={
            outcomeMap.get(activeOption.outcomeId)?.description ?? ''
          }
          questionTitle={qTitle}
          peerOutcomes={options
            .filter((o) => o.outcomeId !== activeOption.outcomeId)
            .map((o) => ({
              name: o.name,
              pct: (o.yesPct ?? 0) * 100,
            }))
            .filter((p) => p.pct > 0)
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 8)}
          peerSumPct={options.reduce((a, o) => a + (o.yesPct ?? 0), 0) * 100}
          expiry={exp?.label ?? undefined}
        />
      )}

      <ChatPanel marketKey={`q:${questionId}`} marketTitle={qTitle} />

      <details className="text-xs text-on-surface-muted">
        <summary className="cursor-pointer hover:text-primary">Raw question JSON</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-divider bg-surface p-3 text-[11px] leading-snug text-on-surface">
          {JSON.stringify(question, null, 2)}
        </pre>
      </details>
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

export default function QuestionPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Suspense fallback={<Fallback>Loading…</Fallback>}>
          <QuestionInner />
        </Suspense>
      </main>
    </>
  );
}
