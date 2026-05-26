'use client';

// Constitution IV — no default value. Constitution VI — mobile-first (large
// tap targets, no truncation under 375px).

import clsx from 'clsx';

export type Network = 'testnet' | 'mainnet';

export interface NetworkTabsProps {
  value: Network | null;
  onChange: (n: Network) => void;
}

export function NetworkTabs({ value, onChange }: NetworkTabsProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid grid-cols-2 gap-2 rounded-md border border-hl-border bg-hl-surface p-2 sm:inline-grid sm:w-auto">
        <button
          type="button"
          onClick={() => onChange('testnet')}
          aria-pressed={value === 'testnet'}
          className={clsx(
            'rounded px-4 py-3 text-sm font-medium transition-colors sm:py-2',
            value === 'testnet'
              ? 'bg-testnet/20 text-testnet ring-2 ring-testnet'
              : 'bg-hl-bg text-hl-subtle hover:text-hl-text hover:bg-hl-border',
          )}
        >
          Testnet
        </button>
        <button
          type="button"
          onClick={() => onChange('mainnet')}
          aria-pressed={value === 'mainnet'}
          className={clsx(
            'rounded px-4 py-3 text-sm font-medium transition-colors sm:py-2',
            value === 'mainnet'
              ? 'bg-mainnet/20 text-mainnet ring-2 ring-mainnet'
              : 'bg-hl-bg text-hl-subtle hover:text-hl-text hover:bg-hl-border',
          )}
        >
          Mainnet
        </button>
      </div>
      {value === null && (
        <p className="text-xs text-hl-subtle sm:text-right">Choose a network to continue.</p>
      )}
    </div>
  );
}
