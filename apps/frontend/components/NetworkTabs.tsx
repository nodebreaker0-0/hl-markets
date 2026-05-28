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
    <div className="inline-flex w-full rounded-full bg-surface-elevated p-1 ring-1 ring-divider sm:w-auto">
      <button
        type="button"
        onClick={() => onChange('testnet')}
        aria-pressed={value === 'testnet'}
        className={clsx(
          'flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors sm:px-5',
          value === 'testnet'
            ? 'bg-status-warn/20 text-status-warn ring-1 ring-status-warn'
            : 'text-on-surface-muted hover:text-on-surface',
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
            ? 'bg-accent-down/20 text-accent-down ring-1 ring-accent-down'
            : 'text-on-surface-muted hover:text-on-surface',
        )}
      >
        Mainnet
      </button>
    </div>
  );
}
