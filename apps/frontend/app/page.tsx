'use client';

// Phase C — live data wiring. Replaces placeholder cards with real
// validatorL1Votes + validatorSummaries via lib/api.

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { SiteHeader } from '@/components/SiteHeader';
import { Hero } from '@/components/Hero';
import { ArbAlerts } from '@/components/ArbAlerts';
import { EndingSoon } from '@/components/EndingSoon';
import { CURRENT_NETWORK, type Network } from '@/lib/network';
import { SearchBar } from '@/components/SearchBar';
import { GovernanceCard } from '@/components/GovernanceCard';
import Link from 'next/link';
import {
  fetchValidatorL1Votes,
  fetchValidatorSummaries,
  fetchBackendGovernanceList,
  fetchBackendQuestionList,
  fetchOutcomeMeta,
  fetchAllMids,
  type ValidatorL1VotePending,
  type ValidatorSummary,
  type BackendGovernanceRow,
  type BackendOutcomeQuestionRow,
  type OutcomeMetaEntry,
  type OutcomeQuestion,
  type AllMidsResponse,
} from '@/lib/api';
import { classify } from '@/lib/governance/classify';
import { computeGovId } from '@/lib/governance/govId';
import {
  questionLabel,
  optionLabel,
  outcomeLabel,
  expiryCountdown,
} from '@/lib/outcome-question';
import type { GovernanceItem } from '@/lib/governance/types';

type Tab = 'active' | 'markets' | 'historical';

const REFRESH_MS = 30_000;

function pendingToItem(p: ValidatorL1VotePending, network: Network): GovernanceItem {
  const action = { type: 'validatorL1Vote' as const, ...p.action };
  const { variant, innerKey } = classify(action);
  return {
    network,
    govId: computeGovId(action),
    action,
    variant,
    innerKey,
    expireTime: p.expireTime,
    votes: p.votes,
    quorumReached: p.quorumReached,
  };
}

/** Backend row → GovernanceItem. Backend stores the *inner* action (without
 *  the `type` wrapper) and emits all bigint columns as decimal strings via
 *  the BigInt-to-JSON polyfill on the API side. */
function backendRowToItem(r: BackendGovernanceRow): GovernanceItem {
  const action = { type: 'validatorL1Vote' as const, ...r.action };
  return {
    network: r.network,
    govId: r.govId,
    action,
    variant: r.variant,
    innerKey: r.innerKey,
    expireTime: Number(r.expireTime),
    votes: r.latestVotes,
    quorumReached: r.latestQuorumReached,
  };
}

function titleFor(item: GovernanceItem): string {
  // Used for search match only — not rendered.
  if (item.variant === 'outcome') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = (item.action['O'] as any) ?? {};
    const innerKey = Object.keys(o)[0];
    const reg = innerKey ? o[innerKey] : null;
    const nad = reg?.nameAndDescription;
    if (Array.isArray(nad) && typeof nad[0] === 'string') return nad[0] as string;
    return innerKey ?? 'outcome';
  }
  if (item.variant === 'delisting') {
    const D = item.action['D'];
    return typeof D === 'string' ? D : 'delisting';
  }
  return item.innerKey ?? 'unknown';
}

// sessionStorage key for the last tab so navigating to /o /q /g and pressing
// Back lands on the same view. Network is build-time, no longer state.
const SS_TAB = 'hl-markets:tab';
const TABS: readonly Tab[] = ['active', 'markets', 'historical'] as const;

function readStoredTab(): Tab {
  if (typeof window === 'undefined') return 'active';
  const v = window.sessionStorage.getItem(SS_TAB);
  return v && (TABS as readonly string[]).includes(v) ? (v as Tab) : 'active';
}

export default function HomePage() {
  // network is build-time (NEXT_PUBLIC_HL_NETWORK). The site is deployed
  // twice — once per network — so there's no in-app toggle.
  const network: Network = CURRENT_NETWORK;

  const [tab, setTab] = useState<Tab>('active');
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setTab(readStoredTab());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(SS_TAB, tab);
  }, [tab, hydrated]);

  const [items, setItems] = useState<GovernanceItem[]>([]);
  const [validators, setValidators] = useState<ValidatorSummary[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeMetaEntry[]>([]);
  const [questions, setQuestions] = useState<OutcomeQuestion[]>([]);
  const [settledQuestions, setSettledQuestions] = useState<BackendOutcomeQuestionRow[]>([]);
  const [mids, setMids] = useState<AllMidsResponse>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  // Active tab: HF /info direct (lowest latency, no indexer lag). We only
  // surface `outcome` variant — hl-markets is an outcome-market app, so
  // delisting / unknown governance items are filtered out client-side.
  const loadActive = useCallback(async (n: Network) => {
    setLoading(true);
    setErr(null);
    try {
      const [votes, summaries] = await Promise.all([
        fetchValidatorL1Votes(n),
        fetchValidatorSummaries(n),
      ]);
      setItems(
        votes
          .map((p) => pendingToItem(p, n))
          .filter((it) => it.variant === 'outcome'),
      );
      setValidators(summaries);
      setLoadedAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Historical tab: settled / expired outcome governance + settled questions.
  // Questions persist in the indexer's outcome_question table once HF removes
  // them from outcomeMeta. Validator metadata still comes from HF.
  const loadHistorical = useCallback(async (n: Network) => {
    setLoading(true);
    setErr(null);
    try {
      const [govResp, qResp, summaries] = await Promise.all([
        fetchBackendGovernanceList({
          network: n,
          status: 'historical',
          variant: 'outcome',
          limit: 100,
        }),
        fetchBackendQuestionList(n, 'settled'),
        fetchValidatorSummaries(n),
      ]);
      setItems(govResp.rows.map(backendRowToItem));
      setSettledQuestions(qResp.rows);
      setValidators(summaries);
      setLoadedAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Markets tab: HF outcomeMeta directly (it returns BOTH `outcomes` and
  // `questions` — the latter is the polymarket-style multi-option grouping).
  // We bypass the indexer here because:
  //   1. questions are not yet stored in the DB (Phase H.3 task #50),
  //   2. live HF gives us the same data with one fewer round-trip,
  //   3. only currently-trading markets matter for the Markets list — settled
  //      markets show up in Historical via the indexer.
  const loadMarkets = useCallback(async (n: Network) => {
    setLoading(true);
    setErr(null);
    try {
      const [meta, am] = await Promise.all([fetchOutcomeMeta(n), fetchAllMids(n)]);
      setOutcomes(meta.outcomes);
      setQuestions(meta.questions);
      setMids(am);
      setLoadedAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch on tab change + 30s auto-refresh. Network is constant per
  // build, so it's not a dependency.
  useEffect(() => {
    const fn =
      tab === 'active' ? loadActive : tab === 'markets' ? loadMarkets : loadHistorical;
    void fn(network);
    const t = setInterval(() => void fn(network), REFRESH_MS);
    return () => clearInterval(t);
  }, [network, tab, loadActive, loadHistorical, loadMarkets]);

  // Default sort: Pending → earliest expiry first (closing soon).
  // Historical → most recently settled (= latest expireTime) first.
  const visible = useMemo(() => {
    let xs = items;
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      xs = xs.filter((it) => titleFor(it).toLowerCase().includes(q));
    }
    const cmp =
      tab === 'historical'
        ? (a: GovernanceItem, b: GovernanceItem) => b.expireTime - a.expireTime
        : (a: GovernanceItem, b: GovernanceItem) => a.expireTime - b.expireTime;
    return [...xs].sort(cmp);
  }, [items, query, tab]);

  return (
    <>
      <SiteHeader />

      <main className="space-y-6 pb-12">
        <Hero />

        <ArbAlerts />

        <EndingSoon />

        <nav className="flex shrink-0 gap-1 overflow-x-auto rounded-full bg-hl-surface p-1 ring-1 ring-hl-border self-start">
          {(['active', 'markets', 'historical'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4',
                tab === t
                  ? 'bg-hl-mint/15 text-hl-mint ring-1 ring-hl-mint'
                  : 'text-hl-subtle hover:text-hl-text',
              )}
            >
              {t === 'active' ? 'Pending' : t === 'markets' ? 'Markets' : 'Historical'}
            </button>
          ))}
        </nav>

        <SearchBar query={query} onQueryChange={setQuery} placeholder="Search outcome markets…" />

        {tab === 'active' ? (
          <ActiveSection
            items={visible}
            validators={validators}
            network={network}
            loading={loading}
            err={err}
            loadedAt={loadedAt}
            onRefresh={() => loadActive(network)}
            label="active"
          />
        ) : tab === 'markets' ? (
          <MarketsSection
            outcomes={outcomes}
            questions={questions}
            mids={mids}
            network={network}
            loading={loading}
            err={err}
            loadedAt={loadedAt}
            onRefresh={() => loadMarkets(network)}
          />
        ) : (
          <HistoricalSection
            items={visible}
            validators={validators}
            settledQuestions={settledQuestions}
            network={network}
            loading={loading}
            err={err}
            loadedAt={loadedAt}
            onRefresh={() => loadHistorical(network)}
          />
        )}

        <footer className="border-t border-hl-border pt-4 text-[11px] text-hl-subtle">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>
              hl-markets · HIP-4 outcome markets · no analytics · no key custody
            </span>
            <span>
              data: HF <code className="mono">/info</code> · indexer (Postgres)
            </span>
          </div>
        </footer>
      </main>
    </>
  );
}

function ActiveSection(props: {
  items: GovernanceItem[];
  validators: ValidatorSummary[];
  network: Network;
  loading: boolean;
  err: string | null;
  loadedAt: number | null;
  onRefresh: () => void;
  /** Drives empty-state copy + the source label. */
  label: 'active' | 'historical';
}) {
  const { items, validators, network, loading, err, loadedAt, onRefresh, label } = props;
  const sourceLabel = label === 'active' ? 'HF live' : 'indexer';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-xs text-hl-subtle">
        <span>
          {loading
            ? 'loading…'
            : loadedAt
              ? `fresh as of ${new Date(loadedAt).toLocaleTimeString()} · ${sourceLabel} · auto-refresh 30s`
              : ' '}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-full bg-hl-surface px-3 py-1 text-xs text-hl-text ring-1 ring-hl-border hover:bg-hl-border disabled:opacity-40"
        >
          refresh
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-mainnet/40 bg-mainnet/10 p-3 text-sm text-mainnet">
          {err}
        </div>
      )}

      {!err && items.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-8 text-center text-sm text-hl-subtle">
          {label === 'active'
            ? `No active governance on ${network}.`
            : `No historical governance on ${network} yet — the indexer marks pending → settled / expired only after expireTime passes.`}
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <GovernanceCard
              key={`${item.network}-${item.govId}`}
              item={item}
              ctx={{ validators }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HistoricalSection(props: {
  items: GovernanceItem[];
  validators: ValidatorSummary[];
  settledQuestions: BackendOutcomeQuestionRow[];
  network: Network;
  loading: boolean;
  err: string | null;
  loadedAt: number | null;
  onRefresh: () => void;
}) {
  const {
    items,
    validators,
    settledQuestions,
    network,
    loading,
    err,
    loadedAt,
    onRefresh,
  } = props;

  // Most-recently-settled first.
  const sortedQ = useMemo(
    () =>
      [...settledQuestions].sort(
        (a, b) => Number(b.settledAt ?? 0) - Number(a.settledAt ?? 0),
      ),
    [settledQuestions],
  );

  const empty = items.length === 0 && sortedQ.length === 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-xs text-hl-subtle">
        <span>
          {loading
            ? 'loading…'
            : loadedAt
              ? `fresh as of ${new Date(loadedAt).toLocaleTimeString()} · indexer · auto-refresh 30s`
              : ' '}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-full bg-hl-surface px-3 py-1 text-xs text-hl-text ring-1 ring-hl-border hover:bg-hl-border disabled:opacity-40"
        >
          refresh
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-mainnet/40 bg-mainnet/10 p-3 text-sm text-mainnet">
          {err}
        </div>
      )}

      {!err && empty && !loading && (
        <div className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-8 text-center text-sm text-hl-subtle">
          No historical outcomes on {network} yet — the indexer captures
          settled questions and expired governance after they fall off HF.
        </div>
      )}

      {sortedQ.length > 0 && (
        <>
          <h2 className="pt-2 text-xs uppercase tracking-widest text-hl-subtle">
            Settled questions
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sortedQ.map((q) => (
              <SettledQuestionCard key={`${network}-q-${q.questionId}`} q={q} />
            ))}
          </div>
        </>
      )}

      {items.length > 0 && (
        <>
          {sortedQ.length > 0 && (
            <h2 className="pt-2 text-xs uppercase tracking-widest text-hl-subtle">
              Settled / expired governance
            </h2>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <GovernanceCard
                key={`${item.network}-${item.govId}`}
                item={item}
                ctx={{ validators }}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** A question that fell off HF outcomeMeta — the indexer remembered it.
 *  Surfaces the winner (settledNamedOutcomes[0]) when known. */
function SettledQuestionCard({ q }: { q: BackendOutcomeQuestionRow }) {
  const title = questionLabel(q.name, q.description ?? '');
  const winnerId = q.settledNamedOutcomes[0] ?? null;
  const settledAt = q.settledAt ? new Date(Number(q.settledAt)) : null;
  return (
    <Link
      href={`/q?id=${q.questionId}`}
      className="flex flex-col gap-2 rounded-2xl border border-hl-border bg-hl-surface p-4 transition-colors hover:border-hl-mint/50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug text-hl-text">
          {title}
        </h3>
        <span className="shrink-0 rounded-full bg-hl-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-hl-subtle ring-1 ring-hl-border">
          resolved
        </span>
      </div>

      {winnerId !== null ? (
        <div className="rounded-xl border border-hl-mint/40 bg-hl-mint/10 p-2 text-[12px] text-hl-mint">
          <span className="mr-1 text-[10px] uppercase tracking-widest">winner</span>
          outcome <code className="mono">#{winnerId}</code>
        </div>
      ) : (
        <div className="text-[11px] text-hl-subtle">
          resolved with no winning option (fallback wins)
        </div>
      )}

      <div className="text-[10px] text-hl-subtle">
        {q.namedOutcomes.length} options · fallback #{q.fallbackOutcome}
      </div>
      <div className="flex justify-between text-[10px] text-hl-subtle">
        <span>question #{q.questionId}</span>
        {settledAt && (
          <span>
            settled{' '}
            {settledAt.toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>
    </Link>
  );
}

function MarketsSection(props: {
  outcomes: OutcomeMetaEntry[];
  questions: OutcomeQuestion[];
  mids: AllMidsResponse;
  network: Network;
  loading: boolean;
  err: string | null;
  loadedAt: number | null;
  onRefresh: () => void;
}) {
  const { outcomes, questions, mids, network, loading, err, loadedAt, onRefresh } = props;

  // Build {outcomeId → entry}; collect outcomeIds that are referenced as
  // members of a question so we don't double-render them as standalone cards.
  const { outcomeMap, ownedByQuestion } = useMemo(() => {
    const map = new Map<number, OutcomeMetaEntry>();
    for (const o of outcomes) map.set(o.outcome, o);
    const owned = new Set<number>();
    for (const q of questions) {
      for (const id of q.namedOutcomes) owned.add(id);
      // The fallback outcome is the "none of the above" twin — also tied to
      // the question, no need to show it on its own.
      owned.add(q.fallbackOutcome);
    }
    return { outcomeMap: map, ownedByQuestion: owned };
  }, [outcomes, questions]);

  // Sort questions by `question` number desc (newest first — HL assigns
  // monotonically increasing ids).
  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => b.question - a.question),
    [questions],
  );

  // Standalone outcomes = not in any question + name != "Fallback".
  const standalone = useMemo(() => {
    return outcomes
      .filter(
        (o) =>
          !ownedByQuestion.has(o.outcome) && o.name.toLowerCase() !== 'fallback',
      )
      .sort((a, b) => b.outcome - a.outcome);
  }, [outcomes, ownedByQuestion]);

  const total = sortedQuestions.length + standalone.length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-xs text-hl-subtle">
        <span>
          {loading
            ? 'loading…'
            : loadedAt
              ? `fresh as of ${new Date(loadedAt).toLocaleTimeString()} · HF live · auto-refresh 30s`
              : ' '}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-full bg-hl-surface px-3 py-1 text-xs text-hl-text ring-1 ring-hl-border hover:bg-hl-border disabled:opacity-40"
        >
          refresh
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-mainnet/40 bg-mainnet/10 p-3 text-sm text-mainnet">
          {err}
        </div>
      )}

      {!err && total === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-hl-border bg-hl-surface/50 p-8 text-center text-sm text-hl-subtle">
          No outcome markets trading on {network} right now.
        </div>
      )}

      {sortedQuestions.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sortedQuestions.map((q) => (
            <QuestionCard
              key={`${network}-q-${q.question}`}
              question={q}
              outcomeMap={outcomeMap}
              mids={mids}
            />
          ))}
        </div>
      )}

      {standalone.length > 0 && (
        <>
          {sortedQuestions.length > 0 && (
            <h2 className="pt-2 text-xs uppercase tracking-widest text-hl-subtle">
              Standalone markets
            </h2>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {standalone.map((o) => (
              <StandaloneOutcomeCard
                key={`${network}-o-${o.outcome}`}
                outcome={o}
                mids={mids}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// Helpers ----------------------------------------------------------------

function assetKeysFor(outcomeId: number, sideCount: number): string[] {
  // Matches the indexer hypothesis (verified for both 4-digit and 5-digit ids):
  // assetKey = `#${outcomeId * 10 + sideIdx}`.
  return Array.from({ length: sideCount }, (_, i) => `#${outcomeId * 10 + i}`);
}

function readMid(mids: AllMidsResponse, key: string): number | null {
  const v = mids[key];
  return v !== undefined && v !== null ? Number(v) : null;
}

function pctText(p: number | null, digits = 1): string {
  return p !== null ? `${(p * 100).toFixed(digits)}%` : '—';
}

/** Polymarket-style multi-option card. Each option = one outcome; the option's
 *  % chance is its `Yes` (side 0) mid. */
function QuestionCard({
  question,
  outcomeMap,
  mids,
}: {
  question: OutcomeQuestion;
  outcomeMap: Map<number, OutcomeMetaEntry>;
  mids: AllMidsResponse;
}) {
  // For each named outcome: try to read its Yes (side 0) mid.
  // We label by the DSL when the outcome's own name is generic
  // ("Recurring Named Outcome") — falls through to `name` otherwise.
  const options = question.namedOutcomes
    .map((id) => {
      const o = outcomeMap.get(id);
      if (!o) return null;
      const keys = assetKeysFor(id, o.sideSpecs.length);
      const yesKey = keys[0];
      const yesPct = yesKey ? readMid(mids, yesKey) : null;
      const label = optionLabel(o.name, o.description ?? '', question.description ?? '');
      return { outcomeId: id, name: label, yesPct };
    })
    .filter((x): x is { outcomeId: number; name: string; yesPct: number | null } => x !== null);

  const qTitle = questionLabel(question.name, question.description ?? '');
  const exp = expiryCountdown(question.description);

  // "Leading" = the option with the highest yesPct (skipping nulls).
  const leading = options.reduce<{ name: string; pct: number } | null>(
    (best, cur) => {
      if (cur.yesPct === null) return best;
      if (!best || cur.yesPct > best.pct) return { name: cur.name, pct: cur.yesPct };
      return best;
    },
    null,
  );

  // Keep the card height consistent across questions: show the top-N by
  // current % chance, link out to /q for the rest. Long multi-option markets
  // (e.g. 49 World Cup teams) would otherwise dominate the grid row.
  const MAX_OPTIONS_PREVIEW = 5;
  const sortedByPct = [...options].sort((a, b) => (b.yesPct ?? 0) - (a.yesPct ?? 0));
  const previewOptions = sortedByPct.slice(0, MAX_OPTIONS_PREVIEW);
  const hiddenCount = Math.max(0, options.length - MAX_OPTIONS_PREVIEW);

  return (
    <Link
      href={`/q?id=${question.question}`}
      className="flex flex-col gap-3 rounded-2xl border border-hl-border bg-hl-surface p-4 transition-colors hover:border-hl-mint/50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug text-hl-text">
          {qTitle}
        </h3>
        <span className="shrink-0 rounded-full bg-hl-mint/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-hl-mint ring-1 ring-hl-mint/40">
          {options.length} options
        </span>
      </div>

      {leading && (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold leading-none text-hl-mint">
            {pctText(leading.pct, 0)}
          </span>
          <span className="truncate text-xs uppercase tracking-widest text-hl-subtle">
            {leading.name}
          </span>
        </div>
      )}

      <ul className="space-y-1.5">
        {previewOptions.map((opt) => (
          <li key={opt.outcomeId} className="space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span className="truncate pr-2 text-hl-text">{opt.name}</span>
              <span className="shrink-0 font-mono text-hl-mint">
                {pctText(opt.yesPct, 1)}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-hl-bg">
              <div
                className="h-full bg-hl-mint/80 transition-all"
                style={{
                  width: `${
                    opt.yesPct !== null
                      ? Math.max(0, Math.min(1, opt.yesPct)) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </li>
        ))}
        {hiddenCount > 0 && (
          <li className="pt-1 text-[11px] text-hl-mint">
            +{hiddenCount} more · view all →
          </li>
        )}
      </ul>

      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-hl-subtle">
        <span>question #{question.question}</span>
        {exp && (
          <span className={exp.expired ? 'text-mainnet' : 'text-hl-text'}>
            {exp.label}
          </span>
        )}
        <span>fallback #{question.fallbackOutcome}</span>
      </div>
    </Link>
  );
}

/** Binary standalone outcome (not part of any question). One % readout + split bar. */
function StandaloneOutcomeCard({
  outcome,
  mids,
}: {
  outcome: OutcomeMetaEntry;
  mids: AllMidsResponse;
}) {
  const keys = assetKeysFor(outcome.outcome, outcome.sideSpecs.length);
  const pcts = keys.map((k) => readMid(mids, k));
  const primaryPct = pcts[0] ?? null;
  const secondaryPct = pcts[1] ?? null;
  const primaryName = outcome.sideSpecs[0]?.name ?? 'Yes';
  const secondaryName = outcome.sideSpecs[1]?.name ?? 'No';
  const hasPair = outcome.sideSpecs.length === 2;

  const label = outcomeLabel(outcome.name, outcome.description ?? '');
  const exp = expiryCountdown(outcome.description);

  return (
    <Link
      href={`/o?id=${outcome.outcome}`}
      className="flex flex-col gap-4 rounded-2xl border border-hl-border bg-hl-surface p-4 transition-colors hover:border-hl-mint/50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug text-hl-text">
          {label}
        </h3>
        <span className="shrink-0 rounded-full bg-hl-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-hl-subtle ring-1 ring-hl-border">
          binary
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-4xl font-semibold leading-none text-hl-mint">
          {pctText(primaryPct, 0)}
        </span>
        <span className="text-xs uppercase tracking-widest text-hl-subtle">
          {primaryName}
        </span>
      </div>

      {hasPair && primaryPct !== null && secondaryPct !== null ? (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-mainnet/15">
            <div
              className="h-full bg-hl-mint transition-all"
              style={{ width: `${Math.max(0, Math.min(1, primaryPct)) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-hl-subtle">
            <span>
              {primaryName} {(primaryPct * 100).toFixed(1)}%
            </span>
            <span>
              {(secondaryPct * 100).toFixed(1)}% {secondaryName}
            </span>
          </div>
        </div>
      ) : (
        outcome.sideSpecs.length > 2 && (
          <div className="text-[10px] text-hl-subtle">
            sides: {outcome.sideSpecs.map((s) => s.name).join(' · ')}
          </div>
        )
      )}

      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-hl-subtle">
        <span>outcome #{outcome.outcome}</span>
        {exp && (
          <span className={exp.expired ? 'text-mainnet' : 'text-hl-text'}>
            {exp.label}
          </span>
        )}
        <span>{outcome.quoteToken}</span>
      </div>
    </Link>
  );
}
