// Phase W-16 — Simple / Pro toggle button.
//
// SiteHeader sub-nav 에 placement. 토글 segmented control 시각.
// DESIGN.md token: bg-surface-elevated + text-on-surface (selected: bg-primary).

'use client';

import clsx from 'clsx';
import { useUiMode, type UiMode } from '@/lib/uiMode';

const OPTIONS: { id: UiMode; label: string }[] = [
  { id: 'simple', label: 'Simple' },
  { id: 'pro', label: 'Pro' },
];

export function UiModeToggle({ className }: { className?: string }): JSX.Element {
  const { mode, setMode } = useUiMode();
  return (
    <div
      role="tablist"
      aria-label="UI density mode"
      className={clsx(
        // Phase X polish: flex-col parent (Sidebar footer) 에서 stretch 막기 위해
        // `self-start`. inline-flex 만으로 부족 (parent align-items 가 우선).
        'inline-flex w-fit shrink-0 items-center gap-px self-start rounded-full bg-surface-elevated p-0.5',
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const selected = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setMode(opt.id)}
            className={clsx(
              'min-w-[64px] rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
              selected
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-muted hover:text-on-surface',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
