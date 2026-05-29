'use client';

// Phase C — live data wiring. Replaces placeholder cards with real
// validatorL1Votes + validatorSummaries via lib/api.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { ArbAlerts } from '@/components/ArbAlerts';
import { EndingSoon } from '@/components/EndingSoon';
import { CURRENT_NETWORK, type Network } from '@/lib/network';
import { SearchBar } from '@/components/SearchBar';
import { GovernanceCard } from '@/components/GovernanceCard';
import { OutcomeCard } from '@/components/OutcomeCard';
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
import { questionLabel } from '@/lib/outcome-question';
import type { GovernanceItem } from '@/lib/governance/types';

// Phase X-084: AI Basket 탭 제거 — Home (`/`) 와 `/discover` 가 AI 진입점.
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

/** T-X-107 — URL `?tab=` query alias → Tab. 'pending' is friendlier than
 *  'active' in URLs and matches the home page link. */
const URL_TAB_ALIAS: Record<string, Tab> = {
  active: 'active',
  pending: 'active',
  markets: 'markets',
  trading: 'markets',
  historical: 'historical',
  settled: 'historical',
};

function tabFromUrl(v: string | null): Tab | null {
  if (!v) return null;
  return URL_TAB_ALIAS[v.toLowerCase()] ?? null;
}

function readStoredTab(): Tab {
  if (typeof window === 'undefined') return 'active';
  const v = window.sessionStorage.getItem(SS_TAB);
  return v && (TABS as readonly string[]).includes(v) ? (v as Tab) : 'active';
}

export default function HomePage() {
  // network is build-time (NEXT_PUBLIC_HL_NETWORK). The site is deployed
  // twice — once per network — so there's no in-app toggle.
  const network: Network = CURRENT_NETWORK;

  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>('active');
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    // T-X-107 — priority: URL `?tab=` > sessionStorage > default 'active'.
    // URL-driven so home page deep-link (e.g. ?tab=pending) lands on the
    // right tab. sessionStorage holds the user's last manual selection.
    const urlTab = tabFromUrl(sp.get('tab'));
    setTab(urlTab ?? readStoredTab());
    setHydrated(true);
    // intentional: read query only at mount. SearchParams change within the
    // page (e.g. ?sheet=outcome&id=…) shouldn't reshuffle the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      

      <div className="space-y-6 pb-12">
        {/* P2.4 — Markets 가 secondary page 라 Hero 짧게. Home 과 무게중심 분리. */}
        <header className="flex flex-col gap-1 pt-base">
          <span className="text-caption uppercase tracking-widest text-on-surface-muted">
            Browse all markets
          </span>
          <h1 className="text-h1 font-bold text-on-surface">
            Pending · Trading · Historical
          </h1>
        </header>

        <ArbAlerts />

        <EndingSoon />

        <nav className="flex shrink-0 gap-1 overflow-x-auto rounded-full bg-surface-elevated p-1 ring-1 ring-divider self-start">
          {(['active', 'markets', 'historical'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4',
                tab === t
                  ? 'bg-primary/15 text-primary ring-1 ring-primary'
                  : 'text-on-surface-muted hover:text-on-surface',
              )}
            >
              {t === 'active'
                ? 'Pending'
                : t === 'markets'
                  ? 'Markets'
                  : t === 'historical'
                    ? 'Historical'
                    : '✨ AI Basket'}
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

        <footer className="border-t border-divider pt-4 text-[11px] text-on-surface-muted">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>
              hl-markets · HIP-4 outcome markets · no analytics · no key custody
            </span>
            <span>
              data: HF <code className="mono">/info</code> · indexer (Postgres)
            </span>
          </div>
        </footer>
      </div>
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
      <div className="flex items-center justify-between text-xs text-on-surface-muted">
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
          className="rounded-full bg-surface-elevated px-3 py-1 text-xs text-on-surface ring-1 ring-divider hover:bg-divider disabled:opacity-40"
        >
          refresh
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-accent-down/40 bg-accent-down/10 p-3 text-sm text-accent-down">
          {err}
        </div>
      )}

      {!err && items.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-divider bg-surface-elevated/50 p-8 text-center text-sm text-on-surface-muted">
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
      <div className="flex items-center justify-between text-xs text-on-surface-muted">
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
          className="rounded-full bg-surface-elevated px-3 py-1 text-xs text-on-surface ring-1 ring-divider hover:bg-divider disabled:opacity-40"
        >
          refresh
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-accent-down/40 bg-accent-down/10 p-3 text-sm text-accent-down">
          {err}
        </div>
      )}

      {!err && empty && !loading && (
        <div className="rounded-2xl border border-dashed border-divider bg-surface-elevated/50 p-8 text-center text-sm text-on-surface-muted">
          No historical outcomes on {network} yet — the indexer captures
          settled questions and expired governance after they fall off HF.
        </div>
      )}

      {sortedQ.length > 0 && (
        <>
          <h2 className="pt-2 text-xs uppercase tracking-widest text-on-surface-muted">
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
            <h2 className="pt-2 text-xs uppercase tracking-widest text-on-surface-muted">
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
  // T-X-108 — "first settled namedOutcome" 은 winner 아님 (단순 settle event 순).
  // 정확한 winner 는 outcome-level winnerSide 가 필요 → 카드에서 fetch 안 함
  // (N+1 비용). 대신 "named outcome resolved Yes / fallback wins" 2-state
  // 구분만 표시하고, 정확한 winner 이름은 detail (/q/?id=…) 페이지에서.
  const namedWinnerSettled = q.settledNamedOutcomes.length > 0;
  const settledAt = q.settledAt ? new Date(Number(q.settledAt)) : null;
  return (
    <Link
      href={`/q/?id=${q.questionId}`}
      className={clsx(
        'group flex flex-col gap-md rounded-xl border bg-surface-elevated p-base',
        'transition-colors',
        namedWinnerSettled
          ? 'border-primary/30 hover:border-primary/60'
          : 'border-divider hover:border-status-warn/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-h2 font-semibold leading-snug text-on-surface">
          {title}
        </h3>
        <span
          className={clsx(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
            namedWinnerSettled
              ? 'bg-primary/15 text-primary ring-primary/40'
              : 'bg-status-warn/15 text-status-warn ring-status-warn/40',
          )}
        >
          {namedWinnerSettled ? '✓ Settled' : '⚠ Fallback'}
        </span>
      </div>

      {namedWinnerSettled ? (
        <div className="text-body-sm text-on-surface-muted">
          One of {q.namedOutcomes.length} named options resolved Yes.{' '}
          <span className="text-primary group-hover:underline">Open to see winner →</span>
        </div>
      ) : (
        <div className="text-body-sm text-on-surface-muted">
          No named option resolved Yes — fallback option paid out (oracle
          fallback or all-No outcome).{' '}
          <span className="text-primary group-hover:underline">Open details →</span>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-caption text-on-surface-muted">
        <span>question #{q.questionId}</span>
        <span>{q.namedOutcomes.length} options</span>
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
      <div className="flex items-center justify-between text-xs text-on-surface-muted">
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
          className="rounded-full bg-surface-elevated px-3 py-1 text-xs text-on-surface ring-1 ring-divider hover:bg-divider disabled:opacity-40"
        >
          refresh
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-accent-down/40 bg-accent-down/10 p-3 text-sm text-accent-down">
          {err}
        </div>
      )}

      {!err && total === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-divider bg-surface-elevated/50 p-8 text-center text-sm text-on-surface-muted">
          No outcome markets trading on {network} right now.
        </div>
      )}

      {sortedQuestions.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sortedQuestions.map((q) => (
            <OutcomeCard
              key={`${network}-q-${q.question}`}
              variant="question"
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
            <h2 className="pt-2 text-xs uppercase tracking-widest text-on-surface-muted">
              Standalone markets
            </h2>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {standalone.map((o) => (
              <OutcomeCard
                key={`${network}-o-${o.outcome}`}
                variant="standalone"
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

