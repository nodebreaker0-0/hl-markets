'use client';

// Phase J.7 — one-time onboarding modal.
//
// Flow when triggered (e.g. by the first Bet click in SimpleTradeWidget):
//   1. Generate ephemeral agent EOA (stored in IndexedDB).
//   2. Sign approveAgent with the main wallet → POST to /trade-forward.
//   3. Sign approveBuilderFee with the main wallet → POST to /trade-forward.
//   4. Both ok → onEnabled() → modal closes, original Bet resumes.
//   5. Any error → delete the agent record so a retry starts clean.
//
// After this runs once, every subsequent L1 action is signed by the agent
// privkey in the browser. No more MetaMask popups for trades.

import { useState } from 'react';
import clsx from 'clsx';
import { useSession } from '@/lib/use-session';
import { getBuilderConfig } from '@/lib/builder';
import { CURRENT_NETWORK } from '@/lib/network';
import {
  generateAndStoreAgent,
  deleteAgent,
  type AgentRecord,
} from '@/lib/agent';
import { signApproveAgent, signApproveBuilderFee } from '@/lib/signing/user-signed';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fires after both approveAgent and approveBuilderFee succeed. */
  onEnabled: () => void;
}

const API_BASE: string =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_API_BASE as string | undefined)) ||
  'http://localhost:3001';

type Step = 'idle' | 'creating-agent' | 'approving-agent' | 'approving-builder' | 'done';

export function EnableTradingModal({ open, onClose, onEnabled }: Props) {
  const { session } = useSession();
  const builder = getBuilderConfig();
  const [step, setStep] = useState<Step>('idle');
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;
  if (!session) return null;
  if (!builder.configured) return null;

  const onEnable = async (): Promise<void> => {
    setErr(null);
    let agent: AgentRecord | null = null;
    try {
      setStep('creating-agent');
      agent = await generateAndStoreAgent(session.address, CURRENT_NETWORK);

      // 1. approveAgent with main wallet.
      setStep('approving-agent');
      const aa = await signApproveAgent({
        address: session.address,
        network: CURRENT_NETWORK,
        agentAddress: agent.address,
        agentName: 'hl-markets',
      });
      await postForward(aa.action, aa.nonce, aa.signature);

      // 2. approveBuilderFee with main wallet.
      setStep('approving-builder');
      const ab = await signApproveBuilderFee({
        address: session.address,
        network: CURRENT_NETWORK,
        maxFeeRate: builder.maxFeeRatePct,
        builder: builder.address,
      });
      await postForward(ab.action, ab.nonce, ab.signature);

      setStep('done');
      onEnabled();
    } catch (e) {
      // Roll back the agent so a retry starts clean.
      if (agent) {
        try {
          await deleteAgent(session.address, CURRENT_NETWORK);
        } catch (_) {
          // best effort
        }
      }
      setErr((e as Error).message);
      setStep('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-divider bg-surface p-6">
        <h2 className="text-lg font-semibold text-on-surface">Enable trading</h2>
        <p className="mt-2 text-sm leading-relaxed text-on-surface-muted">
          Sign once to enable popup-free trading on hl-markets. We&apos;ll create a
          local trading key in this browser and register it with Hyperliquid. The
          key can <strong className="text-on-surface">trade and cancel</strong> only — it
          cannot withdraw your funds or change account settings.
        </p>

        <ol className="mt-4 space-y-2 rounded-xl border border-divider bg-surface-elevated p-3 text-xs text-on-surface-muted">
          <Step label="Create a fresh trading key in this browser" done={step !== 'idle' && step !== 'creating-agent'} busy={step === 'creating-agent'} />
          <Step label="Register the key with Hyperliquid (1 wallet signature)" done={step === 'approving-builder' || step === 'done'} busy={step === 'approving-agent'} />
          <Step label={`Approve a max ${builder.feeBpsHuman} bps builder fee (1 wallet signature)`} done={step === 'done'} busy={step === 'approving-builder'} />
        </ol>

        {err && (
          <div className="mt-3 rounded-xl border border-accent-down/40 bg-accent-down/10 px-3 py-2 text-xs text-accent-down">
            {err}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={step !== 'idle'}
            className="flex-1 rounded-full bg-surface-elevated px-3 py-2 text-xs text-on-surface-muted ring-1 ring-divider hover:bg-divider disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onEnable()}
            disabled={step !== 'idle'}
            className={clsx(
              'flex-1 rounded-full bg-primary/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary ring-1 ring-primary',
              step !== 'idle' ? 'cursor-wait opacity-60' : 'hover:bg-primary/25',
            )}
          >
            {step === 'idle' ? 'Enable' : labelFor(step)}
          </button>
        </div>
      </div>
    </div>
  );
}

function labelFor(step: Step): string {
  switch (step) {
    case 'creating-agent': return 'Creating key…';
    case 'approving-agent': return 'Sign approve agent…';
    case 'approving-builder': return 'Sign builder fee…';
    case 'done': return 'Done';
    default: return '';
  }
}

async function postForward(action: object, nonce: bigint, signature: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}/trade-forward`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network: CURRENT_NETWORK,
      action,
      nonce: Number(nonce),
      signature,
      vaultAddress: null,
    }),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const e: { status?: 'err' | 'ok' } = parsed as { status?: 'err' | 'ok' };
    throw new Error(`HF ${res.status}: ${text.slice(0, 200)}`);
    void e;
  }
  // HF returns 200 even for errors — also surface those.
  const obj = parsed as { status?: 'ok' | 'err'; response?: unknown };
  if (obj.status === 'err') {
    throw new Error(`HF rejected: ${JSON.stringify(obj.response).slice(0, 200)}`);
  }
  return parsed;
}

function Step({
  label,
  done,
  busy,
}: {
  label: string;
  done: boolean;
  busy: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={clsx(
          'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold',
          done
            ? 'border-primary bg-primary/20 text-primary'
            : busy
              ? 'border-primary text-primary'
              : 'border-divider text-on-surface-muted',
        )}
      >
        {done ? '✓' : busy ? '…' : ''}
      </span>
      <span className={done ? 'text-on-surface' : busy ? 'text-primary' : ''}>{label}</span>
    </li>
  );
}

// Re-export the helper for use elsewhere if needed.
export const postForwardForOnboarding = postForward;
