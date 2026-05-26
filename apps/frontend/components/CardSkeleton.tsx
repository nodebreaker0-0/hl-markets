'use client';

// Empty card while Phase C wires up data. Polymarket-style:
//   variant badge · big title · stake/count progress · meta row · click-through.

import clsx from 'clsx';

export interface CardSkeletonProps {
  variant: 'outcome' | 'delisting' | 'unknown';
  title: string;
  detail: string;
  stakePct: number;   // 0..1
  countPct: number;   // 0..1
  expiresIn: string;  // "3h", "1d", ...
  votedNames: string[];
  network: 'testnet' | 'mainnet';
}

function Bar({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-hl-subtle">
        <span>{label}</span>
        <span className="font-mono text-hl-text">{(clamped * 100).toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-hl-bg">
        <div
          className={clsx(
            'h-full rounded-full transition-all',
            clamped >= 0.5 ? 'bg-hl-mint' : 'bg-hl-mint-dim/70',
          )}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
    </div>
  );
}

export function CardSkeleton({
  variant,
  title,
  detail,
  stakePct,
  countPct,
  expiresIn,
  votedNames,
  network,
}: CardSkeletonProps) {
  const variantLabel =
    variant === 'outcome' ? 'Outcome' : variant === 'delisting' ? 'Delisting' : 'Unknown';
  const variantColor =
    variant === 'outcome'
      ? 'bg-hl-mint/15 text-hl-mint ring-hl-mint/40'
      : variant === 'delisting'
        ? 'bg-mainnet/15 text-mainnet ring-mainnet/40'
        : 'bg-testnet/15 text-testnet ring-testnet/40';

  return (
    <article
      className={clsx(
        'group relative flex flex-col gap-4 rounded-2xl border border-hl-border bg-hl-surface p-5 shadow-card transition-all',
        'hover:-translate-y-0.5 hover:bg-hl-surface hover:shadow-card-hover',
        'cursor-pointer',
        network === 'mainnet' ? 'hover:ring-1 hover:ring-mainnet/40' : 'hover:ring-1 hover:ring-testnet/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1',
            variantColor,
          )}
        >
          {variantLabel}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-hl-subtle">
          {network} · expires in {expiresIn}
        </span>
      </div>

      <div>
        <h3 className="text-lg font-semibold leading-snug text-hl-text">{title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-hl-subtle">{detail}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Bar pct={stakePct} label="stake · 20%" />
        <Bar pct={countPct} label="count · 50%" />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-hl-border pt-3 text-xs text-hl-subtle">
        <div className="min-w-0 truncate">
          <span className="text-hl-text">{votedNames.length}</span> voted
          {votedNames.length > 0 && (
            <span className="ml-1 truncate text-hl-subtle/80">· {votedNames.slice(0, 3).join(', ')}{votedNames.length > 3 ? ` +${votedNames.length - 3}` : ''}</span>
          )}
        </div>
        <span className="shrink-0 text-hl-mint opacity-0 transition-opacity group-hover:opacity-100">
          Open →
        </span>
      </div>
    </article>
  );
}
