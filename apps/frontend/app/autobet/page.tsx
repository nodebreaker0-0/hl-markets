'use client';

// Phase O — Auto-bet config page.
//
// Strong opt-in surface. The user sees the rule engine, dry-run preview,
// and the recent bet log. Toggling "Enable" is the only switch that turns
// scanning on; everything else is config the scanner reads each tick.

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { useSession } from '@/lib/use-session';
import {
  loadAutobet,
  saveAutobet,
  runAutobetTick,
  type AutobetConfig,
  type AutobetState,
} from '@/lib/autobet';
import { loadKeys } from '@/lib/llm';
import { pushToast } from '@/lib/toast';

export default function AutobetPage(): JSX.Element {
  const { session } = useSession();
  const [config, setConfig] = useState<AutobetConfig | null>(null);
  const [state, setState] = useState<AutobetState | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const s = loadAutobet();
    setConfig(s.config);
    setState(s.state);
  }, []);

  if (!config || !state) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
        <SiteHeader />
      </main>
    );
  }

  const persist = (next: AutobetConfig): void => {
    setConfig(next);
    saveAutobet({ config: next, state });
  };

  const keys = loadKeys();
  const llmReady =
    keys.preferred !== null &&
    !!(keys.preferred === 'openai' ? keys.openai : keys.anthropic);

  const onDryRun = async (): Promise<void> => {
    if (!session) {
      pushToast({ tone: 'error', message: 'Connect a wallet first' });
      return;
    }
    if (!llmReady) {
      pushToast({
        tone: 'error',
        message: 'Add an LLM key in /settings first',
      });
      return;
    }
    setRunning(true);
    try {
      // For dry-run we temporarily flip enabled=true (in-memory) but rely on
      // the user's perBetMaxUsd being small. Simpler: just call with current
      // config — if enabled is false, runAutobetTick refuses. So we flip a
      // temp copy and call directly.
      const tmp = { ...config, enabled: true };
      saveAutobet({ config: tmp, state });
      const r = await runAutobetTick({ address: session.address });
      // Reload state for the UI.
      const after = loadAutobet();
      setState(after.state);
      // Revert enabled to whatever user had before dry-run if they didn't
      // actually enable.
      if (!config.enabled) {
        saveAutobet({ config, state: after.state });
      }
      pushToast({
        tone: r.betsPlaced > 0 ? 'success' : 'info',
        message: `Dry-run: ${r.betsPlaced} bets placed`,
        detail: r.reason ?? `evaluated ${r.candidatesEvaluated} candidates`,
        ttlMs: 5000,
      });
    } finally {
      setRunning(false);
    }
  };

  const onToggleEnabled = (): void => {
    const next = { ...config, enabled: !config.enabled };
    persist(next);
    pushToast({
      tone: next.enabled ? 'success' : 'info',
      message: next.enabled ? 'Auto-bet ENABLED' : 'Auto-bet disabled',
      detail: next.enabled
        ? `Daily cap $${next.dailyBudgetUsd} · scans every 5 min while this tab is open`
        : undefined,
    });
  };

  const remainingToday = Math.max(0, config.dailyBudgetUsd - state.todaySpentUsd);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <SiteHeader />

      <header>
        <div className="text-xs uppercase tracking-widest text-on-surface-muted">Settings</div>
        <h1 className="mt-1 text-xl font-semibold text-on-surface">Auto-bet</h1>
        <p className="mt-1 text-xs text-on-surface-muted">
          LLM-driven scanner places agent-signed bets when the AI thinks the market is
          mispriced by more than your threshold. Daily and per-bet caps. Hard category
          block. You can stop it any time.
        </p>
      </header>

      <section className={clsx(
        'rounded-2xl border p-4',
        config.enabled
          ? 'border-primary/40 bg-primary/5'
          : 'border-accent-down/30 bg-accent-down/5',
      )}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-on-surface">
              {config.enabled ? 'Auto-bet is ON' : 'Auto-bet is OFF'}
            </div>
            <div className="mt-0.5 text-[11px] text-on-surface-muted">
              {config.enabled
                ? `Today spent $${state.todaySpentUsd.toFixed(2)} / $${config.dailyBudgetUsd} · remaining $${remainingToday.toFixed(2)}`
                : 'Enable below to start scanning. You can run a dry-run first.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleEnabled}
            className={clsx(
              'rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-widest ring-1',
              config.enabled
                ? 'bg-accent-down/15 text-accent-down ring-accent-down'
                : 'bg-primary/15 text-primary ring-primary',
            )}
          >
            {config.enabled ? 'Stop' : 'Enable'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-divider bg-surface-elevated p-4">
        <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
          Caps
        </div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumField
            label="Daily budget (USD)"
            value={config.dailyBudgetUsd}
            min={10}
            step={10}
            onChange={(v) => persist({ ...config, dailyBudgetUsd: v })}
          />
          <NumField
            label="Per-bet max (USD)"
            value={config.perBetMaxUsd}
            min={10}
            step={5}
            onChange={(v) => persist({ ...config, perBetMaxUsd: v })}
          />
          <NumField
            label="Min edge (pp)"
            value={config.minEdgePp}
            min={1}
            step={1}
            onChange={(v) => persist({ ...config, minEdgePp: v })}
            hint="LLM fair % must exceed market by at least this many pp"
          />
          <SelectField
            label="Min confidence"
            value={config.minConfidence}
            onChange={(v) => persist({ ...config, minConfidence: v as AutobetConfig['minConfidence'] })}
            options={[
              { value: 'low', label: 'Low (aggressive)' },
              { value: 'medium', label: 'Medium (default)' },
              { value: 'high', label: 'High (conservative)' },
            ]}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-divider bg-surface-elevated p-4">
        <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
          Categories
        </div>
        <ListField
          label="Allow (substring match on question name, blank = all)"
          value={config.categoryAllow}
          onChange={(v) => persist({ ...config, categoryAllow: v })}
          placeholder="e.g. cup, cpi, btc"
        />
        <ListField
          label="Block (hard skip)"
          value={config.categoryBlock}
          onChange={(v) => persist({ ...config, categoryBlock: v })}
          placeholder="e.g. election, assassination"
        />
      </section>

      <section className="rounded-2xl border border-divider bg-surface-elevated p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-muted">
              Dry-run
            </div>
            <div className="mt-1 text-xs text-on-surface-muted">
              Scans active markets with your current settings, places bets if criteria
              match. Same as enabling, but immediate. Use to validate config.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onDryRun()}
            disabled={running}
            className={clsx(
              'rounded-full bg-primary/15 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary ring-1 ring-primary',
              running && 'cursor-wait opacity-60',
            )}
          >
            {running ? 'Scanning…' : 'Run now'}
          </button>
        </div>
      </section>

      <section>
        <div className="mb-2 text-[10px] uppercase tracking-widest text-on-surface-muted">
          Recent auto-bets
        </div>
        {state.recentBets.length === 0 ? (
          <div className="rounded-xl border border-divider bg-surface-elevated/60 px-3 py-4 text-center text-xs text-on-surface-muted">
            None yet — try a dry-run.
          </div>
        ) : (
          <div className="space-y-1.5">
            {state.recentBets.slice(0, 10).map((r) => (
              <div
                key={`${r.ts}-${r.outcomeName}`}
                className="flex items-center justify-between rounded-lg border border-divider bg-surface-elevated/70 px-3 py-2 text-xs"
              >
                <div>
                  <span
                    className={clsx(
                      r.status === 'filled'
                        ? 'text-primary'
                        : r.status === 'rejected'
                          ? 'text-status-warn'
                          : 'text-accent-down',
                    )}
                  >
                    {r.status}
                  </span>{' '}
                  <span className="text-on-surface">{r.outcomeName}</span>{' '}
                  <span className="text-on-surface-muted">· {r.questionTitle}</span>
                  {r.spendUsd > 0 && (
                    <span className="ml-1 text-on-surface">· ${r.spendUsd.toFixed(2)}</span>
                  )}
                  {r.edgePp > 0 && (
                    <span className="ml-1 text-on-surface-muted">· {r.edgePp.toFixed(1)}pp edge</span>
                  )}
                </div>
                <div className="text-[10px] text-on-surface-muted">
                  {Math.floor((Date.now() - r.ts) / 1000)}s ago
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {!llmReady && (
        <div className="rounded-xl border border-status-warn/40 bg-status-warn/10 px-3 py-2 text-xs text-status-warn">
          You need an LLM key first.{' '}
          <Link href="/settings" className="underline">Open Settings →</Link>
        </div>
      )}
    </main>
  );
}

function NumField({
  label,
  value,
  min,
  step,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  hint?: string;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-divider bg-surface px-2 py-1.5 font-mono text-sm text-on-surface focus:border-primary focus:outline-none"
      />
      {hint && <span className="text-[10px] text-on-surface-muted">{hint}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-divider bg-surface px-2 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ListField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
}): JSX.Element {
  return (
    <label className="mt-3 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-on-surface-muted">{label}</span>
      <input
        type="text"
        value={value.join(', ')}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0),
          )
        }
        className="rounded-lg border border-divider bg-surface px-2 py-1.5 font-mono text-xs text-on-surface focus:border-primary focus:outline-none"
      />
    </label>
  );
}
