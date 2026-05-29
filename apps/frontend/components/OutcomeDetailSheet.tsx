'use client';

// Phase X-040 — Outcome detail sheet.
//
// URL ?sheet=outcome&id=<outcomeId>[&qid=<questionId>] 기반.
// 모바일 = bottom sheet (slide up). 데스크탑 = center modal.
// page transition 없음 — 사용자가 home / markets context 잃지 않음.
//
// Content (compact):
//   - outcome name + question title
//   - big-number-md % chance + market $
//   - Buy YES / Buy NO CTA → /trade?id=N&step=1&side=...
//   - ✨ Analyze with AI button → AIAnalystSheet (T-X-061)
//   - orderbook top 3 levels
//   - "Open full page →" (deep link to /o or /q)
//
// Deep link: /?sheet=outcome&id=10287 — 직접 URL 로 진입 시에도 sheet 자동 open.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import {
  fetchOutcomeMeta,
  fetchAllMids,
  outcomeAssetKey,
  type OutcomeMetaEntry,
  type OutcomeQuestion,
  type AllMidsResponse,
} from '@/lib/api';
import { fetchOrderBook, type OrderBook } from '@/lib/orderbook';
import { CURRENT_NETWORK } from '@/lib/network';
import { outcomeLabel, questionLabel, optionLabel } from '@/lib/outcome-question';

export function OutcomeDetailSheet(): JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const sheet = sp.get('sheet');
  const id = sp.get('id');

  const isOpen = sheet === 'outcome' && id !== null;
  const outcomeId = id !== null ? Number(id) : null;

  // Data
  const [outcome, setOutcome] = useState<OutcomeMetaEntry | null>(null);
  const [outcomesById, setOutcomesById] = useState<Map<number, OutcomeMetaEntry>>(new Map());
  const [question, setQuestion] = useState<OutcomeQuestion | null>(null);
  const [mids, setMids] = useState<AllMidsResponse>({});
  const [book, setBook] = useState<OrderBook | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || outcomeId === null || Number.isNaN(outcomeId)) {
      setOutcome(null);
      setQuestion(null);
      setBook(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    Promise.all([fetchOutcomeMeta(CURRENT_NETWORK), fetchAllMids(CURRENT_NETWORK)])
      .then(([meta, m]) => {
        if (cancel) return;
        const o = meta.outcomes.find((x) => x.outcome === outcomeId);
        setOutcome(o ?? null);
        // T-X-104 — find the question that contains this outcome (either as a
        // named option or as the fallback). null = true standalone outcome.
        const q = meta.questions.find(
          (qq) =>
            qq.namedOutcomes.includes(outcomeId) || qq.fallbackOutcome === outcomeId,
        );
        setQuestion(q ?? null);
        // build outcomeId -> entry map so we can show sibling option names + %.
        const byId = new Map<number, OutcomeMetaEntry>();
        for (const x of meta.outcomes) byId.set(x.outcome, x);
        setOutcomesById(byId);
        setMids(m);
        // top side orderbook
        if (o) {
          const key = outcomeAssetKey(outcomeId, 0);
          fetchOrderBook(CURRENT_NETWORK, key).then((b) => {
            if (!cancel) setBook(b);
          }).catch(() => undefined);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [isOpen, outcomeId]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function closeSheet(): void {
    const params = new URLSearchParams(sp.toString());
    params.delete('sheet');
    params.delete('id');
    params.delete('qid');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname ?? '/');
  }

  if (!isOpen || outcomeId === null) return null;

  const pctYes = outcome
    ? Number(mids[outcomeAssetKey(outcomeId, 0)] ?? 0) * 100
    : null;
  const pctNo = outcome && outcome.sideSpecs.length === 2
    ? Number(mids[outcomeAssetKey(outcomeId, 1)] ?? 0) * 100
    : null;
  const yesName = outcome?.sideSpecs[0]?.name ?? 'Yes';
  const noName = outcome?.sideSpecs[1]?.name ?? 'No';

  // T-X-104 — title resolution:
  //   • question 의 fallback outcome 이면 title = "None of the above (fallback)"
  //   • question 의 named option 이면 outcome.name (e.g., "USA") 그대로 사용
  //   • standalone 이면 outcomeLabel() 헬퍼로 "BTC ≥ $74,031 · expires …" 만든다.
  let title: string;
  if (!outcome) {
    title = `Outcome #${outcomeId}`;
  } else if (question && question.fallbackOutcome === outcomeId) {
    title = 'None of the above (fallback)';
  } else if (question && question.namedOutcomes.includes(outcomeId)) {
    // T-X-105: priceBucket DSL 알면 "BTC < $71,504" 같이 resolved. 그 외는 그대로.
    title = optionLabel(outcome.name, outcome.description ?? '', question.description ?? '');
  } else {
    title = outcomeLabel(outcome.name, outcome.description ?? '');
  }

  // Question 컨텍스트 (있을 때만). Caption + sibling options preview 에 사용.
  const questionTitle = question
    ? questionLabel(question.name, question.description ?? '')
    : null;

  // Phase L — settled state. allSettled = 모든 named outcome 이 settle 완료.
  // thisOutcomeSettled = 이 outcome 만 settle (조기 settle 케이스). winner =
  // Yes mid >= 0.99 인 outcome.
  const settledSet = question ? new Set(question.settledNamedOutcomes) : new Set<number>();
  const allSettled = Boolean(
    question &&
      question.namedOutcomes.length > 0 &&
      question.namedOutcomes.every((id) => settledSet.has(id)),
  );
  const thisOutcomeSettled = settledSet.has(outcomeId);
  const isWinner = thisOutcomeSettled && (pctYes ?? 0) >= 99;
  const isLoser = thisOutcomeSettled && !isWinner;

  // T-X-104 — sibling options top 5 by % YES. (자신은 제외).
  // T-X-105 hotfix: outcomeLabel(name, desc) 거쳐서 generic "Recurring Named
  // Outcome" → "BTC < $71,504" 같이 resolved 라벨 표시. 단, question 의
  // priceBucket DSL 을 알면 더 정확한 bucket 라벨 (`< $71,504`) 도출 가능 —
  // optionLabel() 사용 (questionDescription + outcome description 필요).
  const siblings: { id: number; name: string; pctYes: number }[] = [];
  if (question) {
    for (const oid of question.namedOutcomes) {
      if (oid === outcomeId) continue;
      const o = outcomesById.get(oid);
      if (!o) continue;
      const p = Number(mids[outcomeAssetKey(oid, 0)] ?? 0) * 100;
      const label = optionLabel(o.name, o.description ?? '', question.description ?? '');
      siblings.push({ id: oid, name: label, pctYes: p });
    }
    siblings.sort((a, b) => b.pctYes - a.pctYes);
  }

  // Open full page deep link target:
  //   • question 의 일부면 /q?id=questionId — 49 options 다 보임.
  //   • standalone 이면 /o?id=outcomeId — single outcome page.
  const fullPageHref = question
    ? `/q/?id=${question.question}`
    : `/o/?id=${outcomeId}`;
  const fullPageLabel = question
    ? `Open question (${question.namedOutcomes.length} options) →`
    : 'Open full page →';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="outcome-sheet-title"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSheet();
      }}
    >
      <div className="flex w-full max-w-lg flex-col rounded-t-xl bg-surface-overlay sm:rounded-xl">
        {/* Header */}
        <header className="flex items-start justify-between gap-md px-lg pt-lg pb-md">
          <div className="flex min-w-0 flex-col gap-px">
            <span className="text-caption uppercase tracking-widest text-on-surface-muted">
              {questionTitle
                ? <>question · <span className="text-on-surface">{questionTitle}</span></>
                : <>outcome #{outcomeId}</>}
            </span>
            <h2
              id="outcome-sheet-title"
              className="text-h1 font-bold leading-tight text-on-surface"
            >
              {title}
            </h2>
            {question && (
              <span className="mt-1 text-[10px] uppercase tracking-widest text-on-surface-muted">
                option {question.namedOutcomes.includes(outcomeId)
                  ? `${question.namedOutcomes.indexOf(outcomeId) + 1} of ${question.namedOutcomes.length}`
                  : `fallback · ${question.namedOutcomes.length} other options`}
                {isWinner && (
                  <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-on-primary">
                    ✓ Won
                  </span>
                )}
                {isLoser && (
                  <span className="ml-2 rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-on-surface-subtle">
                    Lost
                  </span>
                )}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close"
            className="rounded-full p-2 text-on-surface-muted transition-colors hover:bg-surface-elevated hover:text-on-surface"
          >
            ✕
          </button>
        </header>

        {loading && !outcome ? (
          <div className="px-lg pb-lg text-center text-body-sm text-on-surface-muted">
            Loading…
          </div>
        ) : !outcome ? (
          <div className="px-lg pb-lg text-center text-body-sm text-on-surface-muted">
            Outcome not found on {CURRENT_NETWORK}.
          </div>
        ) : (
          <>
            {/* % chance hero */}
            <div className="flex items-baseline gap-md px-lg pb-md">
              <span className="mono text-big-number font-bold leading-none text-primary tabular-nums">
                {pctYes !== null ? `${pctYes.toFixed(1)}%` : '—'}
              </span>
              <span className="text-caption uppercase tracking-widest text-on-surface-muted">
                {yesName}
              </span>
              {pctNo !== null && (
                <span className="ml-auto text-caption text-on-surface-muted">
                  {noName}: <span className="mono tabular-nums">{pctNo.toFixed(1)}%</span>
                </span>
              )}
            </div>

            {/* Phase L — settled outcome 은 거래 불가 (resolution price 고정).
                T-X-105 — fallback option 은 esoteric (모든 namedOutcome 이 No
                일 때만 Yes). 사용자 베팅 가치 거의 0 → Buy CTA 자체 숨기고
                강한 안내. 정상 옵션은 "Open question" 으로 가도록 유도. */}
            {thisOutcomeSettled ? (
              <div className={clsx(
                'mx-lg mb-md rounded-lg px-base py-md text-body-sm',
                isWinner
                  ? 'border border-primary/40 bg-primary/10 text-on-surface'
                  : 'border border-divider bg-surface/40 text-on-surface-muted',
              )}>
                {isWinner ? (
                  <>✓ <strong>Settled — this outcome won.</strong> 1 share = $1.00.
                  Existing holders auto-receive payout; no further trading.</>
                ) : (
                  <>Settled — this outcome resolved <strong>No</strong>. 1 share = $0.00.
                  No further trading.</>
                )}
              </div>
            ) : question && question.fallbackOutcome === outcomeId ? (
              <div className="mx-lg mb-md rounded-lg border border-status-warn/30 bg-status-warn/5 px-base py-md text-body-sm text-on-surface">
                This is the <strong>fallback</strong> option of the question — only
                resolves Yes if every other option resolves No. Usually 0% real
                probability; the 50% you see is just the default mid (no orderbook).
                <div className="mt-sm text-caption text-on-surface-muted">
                  → Browse the {question.namedOutcomes.length} real options below.
                </div>
              </div>
            ) : (
              <>
                {/* Buy CTA — dual Polymarket pattern. T-X-105: 유동성 없으면 disable.
                    Yes: asks > 0 가 있어야 buy 가능. No: bids > 0 (실은 asks 의 No side). */}
                <div className="flex gap-sm px-lg pb-md">
                  {(() => {
                    const yesHasOffers = (book?.asks?.length ?? 0) > 0;
                    return yesHasOffers ? (
                      <Link
                        href={`/trade?id=${outcomeId}&step=1&side=yes`}
                        className="flex-1 rounded-md bg-accent-up/15 px-base py-md text-center text-button font-bold text-accent-up transition-colors hover:bg-accent-up/25"
                        onClick={closeSheet}
                      >
                        ↑ Buy {yesName}
                      </Link>
                    ) : (
                      <div
                        aria-disabled="true"
                        title="No offers right now — orderbook empty"
                        className="flex-1 cursor-not-allowed rounded-md bg-surface px-base py-md text-center text-button font-semibold text-on-surface-subtle"
                      >
                        Buy {yesName} · no offers
                      </div>
                    );
                  })()}
                  {pctNo !== null && (() => {
                    const noHasOffers = (book?.bids?.length ?? 0) > 0;
                    return noHasOffers ? (
                      <Link
                        href={`/trade?id=${outcomeId}&step=1&side=no`}
                        className="flex-1 rounded-md bg-accent-down/15 px-base py-md text-center text-button font-bold text-accent-down transition-colors hover:bg-accent-down/25"
                        onClick={closeSheet}
                      >
                        ↓ Buy {noName}
                      </Link>
                    ) : (
                      <div
                        aria-disabled="true"
                        title="No offers right now — orderbook empty"
                        className="flex-1 cursor-not-allowed rounded-md bg-surface px-base py-md text-center text-button font-semibold text-on-surface-subtle"
                      >
                        Buy {noName} · no offers
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

            {/* AI Analyze (✨ inline, T-X-060) */}
            <div className="px-lg pb-md">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-base py-md text-button font-semibold text-primary transition-colors hover:bg-primary/10"
                onClick={() => {
                  // P1.3 fix — analyst 열 때 outcome sheet 자동 close.
                  // modal nesting 회피, swap 패턴.
                  const params = new URLSearchParams(sp.toString());
                  params.delete('sheet');
                  params.delete('id');
                  params.delete('qid');
                  params.set('analyze', String(outcomeId));
                  router.push(`${pathname}?${params.toString()}`);
                }}
              >
                ✨ Analyze with AI
              </button>
            </div>

            {/* Orderbook top 3 */}
            {book && (book.bids.length > 0 || book.asks.length > 0) && (
              <div className="border-t border-divider px-lg py-md">
                <div className="mb-sm text-[10px] uppercase tracking-widest text-on-surface-muted">
                  Order book · {yesName}
                </div>
                <div className="grid grid-cols-2 gap-md text-body-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
                      Bids
                    </div>
                    {book.bids.slice(0, 3).map((b, i) => (
                      <div key={i} className="mono flex justify-between tabular-nums">
                        <span className="text-accent-up">{(b.px * 100).toFixed(1)}%</span>
                        <span className="text-on-surface-muted">{b.sz.toFixed(0)}</span>
                      </div>
                    ))}
                    {book.bids.length === 0 && (
                      <div className="mono text-on-surface-subtle">—</div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
                      Asks
                    </div>
                    {book.asks.slice(0, 3).map((a, i) => (
                      <div key={i} className="mono flex justify-between tabular-nums">
                        <span className="text-accent-down">{(a.px * 100).toFixed(1)}%</span>
                        <span className="text-on-surface-muted">{a.sz.toFixed(0)}</span>
                      </div>
                    ))}
                    {book.asks.length === 0 && (
                      <div className="mono text-on-surface-subtle">—</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* T-X-104 — sibling options preview (top 5 by % YES) for question
                outcomes. 49 옵션 모두 보려면 "Open question (N options) →" 클릭. */}
            {siblings.length > 0 && (
              <div className="border-t border-divider px-lg py-md">
                <div className="mb-sm text-[10px] uppercase tracking-widest text-on-surface-muted">
                  Other options in this question
                </div>
                <ul className="flex flex-col gap-0.5">
                  {siblings.slice(0, 5).map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-md text-body-sm"
                    >
                      <span className="min-w-0 truncate text-on-surface">{s.name}</span>
                      <span className="mono shrink-0 tabular-nums text-on-surface-muted">
                        {s.pctYes.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
                {siblings.length > 5 && (
                  <div className="mt-1 text-[10px] text-on-surface-subtle">
                    +{siblings.length - 5} more — open question page below
                  </div>
                )}
              </div>
            )}

            {/* Deep link to full page — question 이면 /q (모든 옵션), 아니면 /o */}
            <div className="border-t border-divider px-lg py-md">
              <Link
                href={fullPageHref}
                onClick={closeSheet}
                className="inline-flex items-center gap-1 text-body-sm text-primary transition-colors hover:underline"
              >
                {fullPageLabel}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
