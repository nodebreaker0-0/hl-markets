'use client';

// Renders a stack of toasts at the bottom-right corner. Each subscribes to
// the global `lib/toast` channel via subscribeToasts(). Self-dismisses after
// ttlMs. Tap to dismiss.

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { subscribeToasts, type ToastEvent } from '@/lib/toast';

export function Toaster(): JSX.Element {
  const [items, setItems] = useState<ToastEvent[]>([]);

  useEffect(() => {
    return subscribeToasts((t) => {
      setItems((prev) => [...prev, t]);
      if (t.ttlMs && t.ttlMs > 0) {
        window.setTimeout(() => {
          setItems((prev) => prev.filter((x) => x.id !== t.id));
        }, t.ttlMs);
      }
    });
  }, []);

  const dismiss = (id: string): void => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-3 sm:items-end sm:right-4 sm:left-auto">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={clsx(
            'pointer-events-auto w-full max-w-sm rounded-xl border bg-hl-surface px-3 py-2 text-left text-xs shadow-lg backdrop-blur transition',
            t.tone === 'success' && 'border-hl-mint/40 bg-hl-mint/10 text-hl-text',
            t.tone === 'error' && 'border-mainnet/40 bg-mainnet/10 text-hl-text',
            t.tone === 'info' && 'border-hl-border text-hl-text',
          )}
        >
          <div className="flex items-start gap-2">
            <span
              className={clsx(
                'mt-0.5 text-sm',
                t.tone === 'success' && 'text-hl-mint',
                t.tone === 'error' && 'text-mainnet',
              )}
            >
              {t.tone === 'success' ? '✓' : t.tone === 'error' ? '✕' : 'ⓘ'}
            </span>
            <div className="flex-1">
              <div className="font-semibold">{t.message}</div>
              {t.detail && (
                <div className="mt-0.5 text-[11px] text-hl-subtle">{t.detail}</div>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
