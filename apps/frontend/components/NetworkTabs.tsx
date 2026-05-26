'use client';

// Constitution IV — no default value. Polymarket-style pill segment.
// Mobile: full width 2-col. Desktop: inline pill.

import clsx from 'clsx';

export type Network = 'testnet' | 'mainnet';

export interface NetworkTabsProps {
  value: Network | null;
  onChange: (n: Network) => void;
}

export function NetworkTabs({ value, onChange }: NetworkTabsProps) {
  return (
    <div className="inline-flex w-full rounded-full bg-hl-surface p-1 ring-1 ring-hl-border sm:w-auto">
      <button
        type="button"
        onClick={() => onChange('testnet')}
        aria-pressed={value === 'testnet'}
        className={clsx(
          'flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors sm:px-5',
          value === 'testnet'
            ? 'bg-testnet/20 text-testnet ring-1 ring-testnet'
            : 'text-hl-subtle hover:text-hl-text',
        )}
      >
        Testnet
      </button>
      <button
        type="button"
        onClick={() => onChange('mainnet')}
        aria-pressed={value === 'mainnet'}
        className={clsx(
          'flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors sm:px-5',
          value === 'mainnet'
            ? 'bg-mainnet/20 text-mainnet ring-1 ring-mainnet'
            : 'text-hl-subtle hover:text-hl-text',
        )}
      >
        Mainnet
      </button>
    </div>
  );
}
