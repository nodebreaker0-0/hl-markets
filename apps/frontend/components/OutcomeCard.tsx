// Phase W-8 — Outcome card (Polymarket DNA).
//
// `app/page.tsx` 의 inline QuestionCard / StandaloneOutcomeCard 두 함수를
// 단일 컴포넌트로 통합. variant prop 으로 분기:
//   - `question` — 멀티 옵션 question. 우측에 큰 leading % + "View" CTA.
//   - `standalone` — 단일 binary outcome. 우측에 Buy YES / Buy NO 버튼 stack
//     (Polymarket 패턴). 현재는 click 시 detail 페이지 이동 (W-10 에서
//     quick trade modal 연결 예정).
//
// 토큰 사용 — DESIGN.md v1 의 component variants 정확히 1:1:
//   `outcome-card` (bg-surface-elevated + rounded-lg + p-base)
//   `button-up` / `button-down` (Buy YES / Buy NO)
//   `big-number-md` (현재 % chance) → utility 가 Tailwind 의 fontSize
//   token `text-big-number-md` 로 매핑됨 (design.md export 산출).
//
// 모바일: 1열 stack, CTA 가 카드 하단 full-width.
// 데스크탑 (sm:): 좌 60% info + 우 40% CTA flex.

import Link from 'next/link';
import clsx from 'clsx';
import type {
  AllMidsResponse,
  OutcomeMetaEntry,
  OutcomeQuestion,
} from '@/lib/api';
import {
  questionLabel,
  optionLabel,
  outcomeLabel,
  expiryCountdown,
} from '@/lib/outcome-question';
import { useUiMode } from '@/lib/uiMode';

// ---------------- shared helpers ----------------

/** assetKey 매핑 가설: `#${outcome_id * 10 + side_idx}`. */
function assetKeysFor(outcomeId: number, sideCount: number): string[] {
  return Array.from({ length: sideCount }, (_, i) => `#${outcomeId * 10 + i}`);
}

function readMid(mids: AllMidsResponse, key: string): number | null {
  const v = mids[key];
  return v !== undefined && v !== null ? Number(v) : null;
}

function pctText(p: number | null, digits = 1): string {
  return p !== null ? `${(p * 100).toFixed(digits)}%` : '—';
}

// ---------------- discriminated union props ----------------

type Props =
  | {
      variant: 'question';
      question: OutcomeQuestion;
      outcomeMap: Map<number, OutcomeMetaEntry>;
      mids: AllMidsResponse;
    }
  | {
      variant: 'standalone';
      outcome: OutcomeMetaEntry;
      mids: AllMidsResponse;
    };

export function OutcomeCard(props: Props): JSX.Element {
  if (props.variant === 'question') {
    return <QuestionCardImpl {...props} />;
  }
  return <StandaloneCardImpl {...props} />;
}

// ---------------- question variant ----------------

const MAX_OPTIONS_PREVIEW = 5;

function QuestionCardImpl({
  question,
  outcomeMap,
  mids,
}: Extract<Props, { variant: 'question' }>) {
  const { mode } = useUiMode();
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

  const leading = options.reduce<{ name: string; pct: number } | null>(
    (best, cur) => {
      if (cur.yesPct === null) return best;
      if (!best || cur.yesPct > best.pct) return { name: cur.name, pct: cur.yesPct };
      return best;
    },
    null,
  );

  const sortedByPct = [...options].sort((a, b) => (b.yesPct ?? 0) - (a.yesPct ?? 0));
  const previewOptions = sortedByPct.slice(0, MAX_OPTIONS_PREVIEW);
  const hiddenCount = Math.max(0, options.length - MAX_OPTIONS_PREVIEW);

  // W-17 Pro mode — 1-line dense row. 한 화면에 더 많은 question 표시.
  if (mode === 'pro') {
    return (
      <Link
        href={`?sheet=outcome&id=${question.fallbackOutcome}&qid=${question.question}`}
        scroll={false}
        className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-divider px-sm py-sm hover:bg-surface-elevated"
      >
        <div className="min-w-0">
          <div className="truncate text-body-sm font-semibold text-on-surface">
            {qTitle}
          </div>
          {leading && (
            <div className="truncate text-[10px] text-on-surface-muted">
              leader: {leading.name}
            </div>
          )}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-muted">
          {options.length} opts
        </span>
        <span className="mono text-mono-md font-semibold tabular-nums text-primary">
          {leading ? `${(leading.pct * 100).toFixed(0)}%` : '—'}
        </span>
        {exp && (
          <span className={clsx('mono text-[10px] tabular-nums', exp.expired ? 'text-accent-down' : 'text-on-surface-muted')}>
            {exp.label}
          </span>
        )}
      </Link>
    );
  }

  // Simple mode — Polymarket 패턴 (left info + right CTA).
  return (
    <Link
      href={`?sheet=outcome&id=${question.fallbackOutcome}&qid=${question.question}`}
      scroll={false}
      className={clsx(
        // outcome-card base — DESIGN.md `components.outcome-card` 1:1
        'group flex flex-col rounded-lg bg-surface-elevated p-base',
        'transition-colors hover:bg-surface-overlay',
        'sm:flex-row sm:items-stretch sm:gap-base',
      )}
    >
      {/* LEFT — info */}
      <div className="flex min-w-0 flex-1 flex-col gap-md">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-h2 font-semibold leading-snug text-on-surface">
            {qTitle}
          </h3>
          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary ring-1 ring-primary/40">
            {options.length} options
          </span>
        </div>

        {/* big-number-md — DESIGN.md typography.big-number-md, "leading option 의 현재 % chance" */}
        {leading && (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-big-number-md font-bold leading-none text-primary tabular-nums">
              {pctText(leading.pct, 0)}
            </span>
            <span className="truncate text-caption uppercase tracking-widest text-on-surface-muted">
              {leading.name}
            </span>
          </div>
        )}

        {/* options preview list — bar 는 primary mint. bg 는 surface (darker). */}
        <ul className="space-y-1.5">
          {previewOptions.map((opt) => (
            <li key={opt.outcomeId} className="space-y-0.5">
              <div className="flex justify-between text-[11px]">
                <span className="truncate pr-2 text-on-surface">{opt.name}</span>
                <span className="shrink-0 font-mono text-primary tabular-nums">
                  {pctText(opt.yesPct, 1)}
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
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="pt-1 text-[11px] text-primary">
              +{hiddenCount} more · view all →
            </li>
          )}
        </ul>

        <div className="mt-auto flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-on-surface-muted">
          <span>question #{question.question}</span>
          {exp && (
            <span className={exp.expired ? 'text-accent-down' : 'text-on-surface'}>
              {exp.label}
            </span>
          )}
          <span>fallback #{question.fallbackOutcome}</span>
        </div>
      </div>

      {/* RIGHT — CTA. 모바일 하단 stack, 데스크탑 우측 column. */}
      <div className="mt-base flex shrink-0 flex-col items-stretch gap-sm sm:mt-0 sm:w-32 sm:justify-center">
        <span
          className={clsx(
            'inline-flex min-h-[44px] items-center justify-center rounded-md',
            'bg-primary px-base py-md',
            'text-button font-semibold text-on-primary',
            'transition-colors group-hover:bg-primary-bright',
          )}
        >
          View →
        </span>
      </div>
    </Link>
  );
}

// ---------------- standalone (binary) variant ----------------

function StandaloneCardImpl({
  outcome,
  mids,
}: Extract<Props, { variant: 'standalone' }>) {
  const { mode } = useUiMode();
  const keys = assetKeysFor(outcome.outcome, outcome.sideSpecs.length);
  const pcts = keys.map((k) => readMid(mids, k));
  const primaryPct = pcts[0] ?? null;
  const secondaryPct = pcts[1] ?? null;
  const primaryName = outcome.sideSpecs[0]?.name ?? 'Yes';
  const secondaryName = outcome.sideSpecs[1]?.name ?? 'No';
  const hasPair = outcome.sideSpecs.length === 2;

  const label = outcomeLabel(outcome.name, outcome.description ?? '');
  const exp = expiryCountdown(outcome.description);

  // W-17 Pro mode — 1-line dense row.
  if (mode === 'pro') {
    return (
      <Link
        href={`?sheet=outcome&id=${outcome.outcome}`}
        className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-divider px-sm py-sm hover:bg-surface-elevated"
      >
        <div className="min-w-0 truncate text-body-sm font-semibold text-on-surface">
          {label}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-muted">
          {primaryName}
        </span>
        <span className="mono text-mono-md font-semibold tabular-nums text-primary">
          {primaryPct !== null ? `${(primaryPct * 100).toFixed(1)}%` : '—'}
        </span>
        {exp && (
          <span className={clsx('mono text-[10px] tabular-nums', exp.expired ? 'text-accent-down' : 'text-on-surface-muted')}>
            {exp.label}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={`?sheet=outcome&id=${outcome.outcome}`}
      className={clsx(
        'group flex flex-col rounded-lg bg-surface-elevated p-base',
        'transition-colors hover:bg-surface-overlay',
        'sm:flex-row sm:items-stretch sm:gap-base',
      )}
    >
      {/* LEFT — info */}
      <div className="flex min-w-0 flex-1 flex-col gap-md">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-h2 font-semibold leading-snug text-on-surface">
            {label}
          </h3>
          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-on-surface-muted ring-1 ring-divider">
            binary
          </span>
        </div>

        {/* big-number — primary % chance hero (DESIGN.md `big-number-md`) */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-big-number-md font-bold leading-none text-primary tabular-nums">
            {pctText(primaryPct, 0)}
          </span>
          <span className="text-caption uppercase tracking-widest text-on-surface-muted">
            {primaryName}
          </span>
        </div>

        {/* split bar */}
        {hasPair && primaryPct !== null && secondaryPct !== null ? (
          <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-accent-down/15">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(1, primaryPct)) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-on-surface-muted">
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
            <div className="text-[10px] text-on-surface-muted">
              sides: {outcome.sideSpecs.map((s) => s.name).join(' · ')}
            </div>
          )
        )}

        <div className="mt-auto flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-on-surface-muted">
          <span>outcome #{outcome.outcome}</span>
          {exp && (
            <span className={exp.expired ? 'text-accent-down' : 'text-on-surface'}>
              {exp.label}
            </span>
          )}
          <span>{outcome.quoteToken}</span>
        </div>
      </div>

      {/* RIGHT — single View CTA. W-10 후속에서 quick trade modal 연결 시
          듀얼 Buy YES / Buy NO 패턴으로 전환 (e.stopPropagation + modal).
          현재는 카드 click = detail 페이지 이동만 — Buy 버튼 가짜는 혼란. */}
      <div className="mt-base flex shrink-0 flex-col items-stretch gap-sm sm:mt-0 sm:w-32 sm:justify-center">
        <span
          className={clsx(
            'inline-flex min-h-[44px] items-center justify-center rounded-md',
            'bg-primary px-base py-md',
            'text-button font-semibold text-on-primary',
            'transition-colors group-hover:bg-primary-bright',
          )}
        >
          View →
        </span>
      </div>
    </Link>
  );
}
