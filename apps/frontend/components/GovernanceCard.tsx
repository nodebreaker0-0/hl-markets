'use client';

// Live governance card — Pending + Historical 탭의 카드. variant 별
// renderer.Card 를 inner content 로 위임. 카드 shell 은 OutcomeCard 와 동등
// 한 톤 (Polymarket left info + right CTA + Pro variant) 으로 W-26 에서
// 통일. 핵심 정보 = quorum 진행도 (`stake ≥ 20% AND count ≥ 50%`).

import Link from 'next/link';
import clsx from 'clsx';
import { renderers } from '@/lib/governance/renderers';
import type { GovernanceItem, RendererContext } from '@/lib/governance/types';
import { QuorumBar } from '@/components/QuorumBar';
import {
  computeQuorum,
  STAKE_THRESHOLD,
  COUNT_THRESHOLD,
} from '@/lib/governance/thresholds';
import { splitVoters, buildValidatorIndex } from '@/lib/validators';
import { useUiMode } from '@/lib/uiMode';
import type { Variant } from '@/lib/governance/classify';

function fmtExpire(unixMs: number): string {
  const ms = unixMs - Date.now();
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

const variantBadge: Record<Variant, string> = {
  outcome: 'bg-primary/15 text-primary ring-primary/40',
  delisting: 'bg-accent-down/15 text-accent-down ring-accent-down/40',
  unknown: 'bg-status-warn/15 text-status-warn ring-status-warn/40',
};

const variantLabel: Record<Variant, string> = {
  outcome: 'Outcome',
  delisting: 'Delisting',
  unknown: 'Unknown',
};

export interface GovernanceCardProps {
  item: GovernanceItem;
  ctx: RendererContext;
}

export function GovernanceCard({ item, ctx }: GovernanceCardProps) {
  const { mode } = useUiMode();
  const idx = buildValidatorIndex(ctx.validators);
  const quorum = computeQuorum(idx.active, item.votes);
  const split = splitVoters(idx, item.votes);
  const Renderer = renderers[item.variant];

  // quorum 진행도 — primary metric. stake 와 count 가 둘 다 통과해야 한다는
  // 의미를 단일 % 로 압축: min(stake/20%, count/50%) × 100 — 둘 중 더 뒤처진
  // 쪽 기준 진행. 100% 이상 = 통과 임박/통과.
  // X-099 hotfix: 기존 코드가 존재하지 않는 `quorum.stakeThreshold` 를 참조해서
  // 항상 0% 가 나왔다. computeQuorum 은 stakeRatio (0..1) / countRatio (0..1) 만
  // 노출 → STAKE_THRESHOLD / COUNT_THRESHOLD 상수로 나눠 progress 계산.
  const stakeProgress = STAKE_THRESHOLD > 0 ? quorum.stakeRatio / STAKE_THRESHOLD : 0;
  const countProgress = COUNT_THRESHOLD > 0 ? quorum.countRatio / COUNT_THRESHOLD : 0;
  const progressPct = Math.round(Math.min(stakeProgress, countProgress) * 100);
  const expired = item.expireTime - Date.now() < 0;
  const nearlyPass = progressPct >= 100;

  // ----- W-26 Pro mode — 1-line dense row -----
  if (mode === 'pro') {
    return (
      <Link
        href={`/g/?network=${item.network}&id=${item.govId}`}
        className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-divider px-sm py-sm hover:bg-surface-elevated"
      >
        <span
          className={clsx(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
            variantBadge[item.variant],
          )}
        >
          {variantLabel[item.variant]}
        </span>
        <div className="min-w-0 truncate text-body-sm font-semibold text-on-surface">
          <Renderer.Card item={item} ctx={ctx} />
        </div>
        <span
          className={clsx(
            'mono text-mono-md font-semibold tabular-nums',
            nearlyPass ? 'text-primary' : 'text-on-surface-muted',
          )}
          title="quorum progress"
        >
          {progressPct}%
        </span>
        <span className="mono text-mono-sm tabular-nums text-on-surface-muted">
          {split.voted.length}/{idx.active.length}
        </span>
        <span
          className={clsx(
            'mono text-[10px] tabular-nums',
            expired ? 'text-accent-down' : 'text-on-surface-muted',
          )}
        >
          {fmtExpire(item.expireTime)}
        </span>
      </Link>
    );
  }

  // ----- Simple mode — Polymarket-스타일 left info + right CTA -----
  return (
    <Link
      href={`/g/?network=${item.network}&id=${item.govId}`}
      className={clsx(
        'group flex flex-col rounded-lg bg-surface-elevated p-base',
        'transition-colors hover:bg-surface-overlay',
        'sm:flex-row sm:items-stretch sm:gap-base',
      )}
    >
      {/* LEFT — info */}
      <div className="flex min-w-0 flex-1 flex-col gap-md">
        <div className="flex items-center justify-between gap-2">
          <span
            className={clsx(
              'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
              variantBadge[item.variant],
            )}
          >
            {variantLabel[item.variant]}
          </span>
          <span
            className={clsx(
              'text-[10px] uppercase tracking-widest',
              expired ? 'text-accent-down' : 'text-on-surface-muted',
            )}
          >
            {item.network} · {fmtExpire(item.expireTime)}
          </span>
        </div>

        <Renderer.Card item={item} ctx={ctx} />

        <QuorumBar quorum={quorum} compact />

        <div className="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] text-on-surface-muted">
          <span>
            <span className="text-on-surface">{split.voted.length}</span> / {idx.active.length} voted
          </span>
          {split.voted.length > 0 && (
            <span className="min-w-0 truncate">
              · {split.voted.slice(0, 3).map((v) => v.name).join(', ')}
              {split.voted.length > 3 && ` +${split.voted.length - 3}`}
            </span>
          )}
        </div>
      </div>

      {/* RIGHT — quorum hero + "Open →" CTA (mobile bottom stack) */}
      <div className="mt-base flex shrink-0 flex-col items-stretch gap-sm sm:mt-0 sm:w-32 sm:justify-center">
        <div className="flex flex-col items-end gap-px sm:items-stretch sm:text-center">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">
            Quorum
          </span>
          <span
            className={clsx(
              'mono text-big-number-md font-bold leading-none tabular-nums',
              nearlyPass ? 'text-primary' : 'text-on-surface',
            )}
          >
            {progressPct}%
          </span>
        </div>
        <span
          className={clsx(
            'inline-flex min-h-[44px] items-center justify-center rounded-md',
            'bg-primary px-base py-md',
            'text-button font-semibold text-on-primary',
            'transition-colors group-hover:bg-primary-bright',
          )}
        >
          Open →
        </span>
      </div>
    </Link>
  );
}
