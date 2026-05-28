'use client';

// Phase J.1 — header pill that drives sign-in / sign-out.
// Disconnected: "Connect" → triggers EIP-712 sign-in.
// Connected:    "0x12…34" → click to open a small dropdown with Sign out.

import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useSession } from '@/lib/use-session';

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ConnectButton() {
  const { session, loading, err, doSignIn, doSignOut } = useSession();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // close menu on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent): void {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!session) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            void doSignIn().catch(() => undefined);
          }}
          disabled={loading}
          className={clsx(
            'rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary ring-1 ring-primary transition-colors hover:bg-primary/25',
            loading && 'cursor-wait opacity-60',
          )}
        >
          {loading ? 'Connecting…' : 'Connect'}
        </button>
        {err && (
          <span className="max-w-[200px] truncate text-[10px] text-accent-down" title={err}>
            {err}
          </span>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary ring-1 ring-primary hover:bg-primary/25"
        title={session.address}
      >
        <span className="font-mono">{shortAddr(session.address)}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-70">
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-2xl border border-divider bg-surface shadow-xl">
          <div className="border-b border-divider px-3 py-2 text-[11px] text-on-surface-muted">
            <div className="font-mono text-on-surface">{shortAddr(session.address)}</div>
            <div className="mt-0.5">expires {new Date(session.expiresAt).toLocaleString()}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void doSignOut();
            }}
            className="block w-full px-3 py-2 text-left text-xs text-on-surface hover:bg-surface-elevated"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
