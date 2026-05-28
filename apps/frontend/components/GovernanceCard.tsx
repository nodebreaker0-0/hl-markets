'use client';

// Live governance card. variant 별 renderer.Card 를 위임. 카드 shell 은 공통:
// variant badge + Polymarket-스타일 elevation + QuorumBar + voted/not-voted.

import Link from 'next/link';
import clsx from 'clsx';
import { renderers } from '@/lib/governance/renderers';
import type { GovernanceItem, RendererContext } from '@/lib/governance/types';
import { QuorumBar } from '@/components/QuorumBar';
import { computeQuorum } from '@/lib/governance/thresholds';
import { splitVoters, buildValidatorIndex } from '@/lib/validators';

function fmtExpire(unixMs: number): string {
  const ms = unixMs - Date.now();
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

import type { Variant } from '@/lib/governance/classify';

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
  const idx = buildValidatorIndex(ctx.validators);
  const quorum = computeQuorum(idx.active, item.votes);
  const split = splitVoters(idx, item.votes);
  const Renderer = renderers[item.variant];

  return (
    <Link
      href={`/g/?network=${item.network}&id=${item.govId}`}
      className={clsx(
        'group relative flex flex-col gap-4 rounded-2xl border border-divider bg-surface-elevated p-5 shadow-card transition-all',
        'hover:-translate-y-0.5 hover:shadow-card-hover',
        item.network === 'mainnet'
          ? 'hover:ring-1 hover:ring-accent-down/40'
          : 'hover:ring-1 hover:ring-status-warn/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
            variantBadge[item.variant],
          )}
        >
          {variantLabel[item.variant]}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">
          {item.network} · expires in {fmtExpire(item.expireTime)}
        </span>
      </div>

      <Renderer.Card item={item} ctx={ctx} />

      <QuorumBar quorum={quorum} compact />

      <div className="flex items-center justify-between gap-2 border-t border-divider pt-3 text-xs text-on-surface-muted">
        <div className="min-w-0 truncate">
          <span className="text-on-surface">{split.voted.length}</span> / {idx.active.length} voted
          {split.voted.length > 0 && (
            <span className="ml-1 truncate text-on-surface-muted/80">
              · {split.voted.slice(0, 3).map((v) => v.name).join(', ')}
              {split.voted.length > 3 && ` +${split.voted.length - 3}`}
            </span>
          )}
        </div>
        <span className="shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Open →
        </span>
      </div>
    </Link>
  );
}
