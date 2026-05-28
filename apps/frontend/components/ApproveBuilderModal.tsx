'use client';

// Phase J.5 — one-time approveBuilderFee modal.
// Opens automatically when the user first tries to trade and HF reports their
// approved max for our builder is below our configured fee.

import { useState } from 'react';
import clsx from 'clsx';
import { approveBuilderFee } from '@/lib/trade';
import { getBuilderConfig } from '@/lib/builder';
import { useSession } from '@/lib/use-session';

interface Props {
  open: boolean;
  onClose: () => void;
  onApproved: () => void;
}

export function ApproveBuilderModal({ open, onClose, onApproved }: Props) {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const builder = getBuilderConfig();

  if (!open) return null;

  const onApprove = async (): Promise<void> => {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      await approveBuilderFee({ address: session.address });
      onApproved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-divider bg-surface p-6">
        <h2 className="text-lg font-semibold text-on-surface">Approve builder fee</h2>
        <p className="mt-2 text-sm leading-relaxed text-on-surface-muted">
          Trading on hl-markets routes orders through Hyperliquid with a small
          builder fee. You need to approve the maximum fee for our builder
          address one time — this signs an <code className="mono">approveBuilderFee</code> action
          with your main wallet.
        </p>

        <dl className="mt-4 space-y-1.5 rounded-xl border border-divider bg-surface-elevated p-3 font-mono text-[11px]">
          <Row label="builder">
            <code className="mono text-primary">
              {builder.address.slice(0, 10)}…{builder.address.slice(-6)}
            </code>
          </Row>
          <Row label="max fee">{builder.maxFeeRatePct}</Row>
          <Row label="per-order">
            {builder.feeBpsHuman} bps ({(builder.feeBpsHuman / 100).toFixed(3)}%)
          </Row>
        </dl>

        {err && (
          <div className="mt-3 rounded-xl border border-accent-down/40 bg-accent-down/10 px-3 py-2 text-xs text-accent-down">
            {err}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-full bg-surface-elevated px-3 py-2 text-xs text-on-surface-muted ring-1 ring-divider hover:bg-divider"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onApprove()}
            disabled={busy || !session}
            className={clsx(
              'flex-1 rounded-full bg-primary/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary ring-1 ring-primary',
              busy ? 'cursor-wait opacity-60' : 'hover:bg-primary/25',
            )}
          >
            {busy ? 'Signing…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-on-surface-muted">{label}</dt>
      <dd className="text-right text-on-surface">{children}</dd>
    </div>
  );
}
