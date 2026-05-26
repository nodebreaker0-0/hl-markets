'use client';

// Forward-compat: new validatorL1Vote shape that classify.ts hasn't learned.
// Show a warning + raw JSON. Still routes through the same Card/Detail surface
// so the rest of the app keeps working (Constitution V).

import type { VariantRenderer } from '../types';

export const unknown: VariantRenderer = {
  Card: ({ item }) => (
    <div className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold leading-snug text-hl-text">
        Unknown variant{' '}
        {item.innerKey && (
          <span className="font-mono text-hl-subtle">· {item.innerKey}</span>
        )}
      </h3>
      <p className="text-sm text-testnet">
        New validatorL1Vote shape — renderer not implemented. Open to inspect raw JSON.
      </p>
    </div>
  ),
  Detail: ({ item }) => (
    <article className="space-y-4">
      <header className="space-y-2">
        <span className="inline-block rounded-full bg-testnet/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-testnet ring-1 ring-testnet/40">
          Unknown variant
        </span>
        <h1 className="text-2xl font-bold leading-tight text-hl-text sm:text-3xl">
          inner key: <code className="mono">{item.innerKey ?? '(none)'}</code>
        </h1>
        <p className="text-sm text-testnet">
          classify.ts has no renderer for this shape. Treat votes here with extra scrutiny.
        </p>
      </header>
      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-hl-subtle">Raw action</h2>
        <pre className="overflow-x-auto rounded-xl border border-hl-border bg-hl-surface p-3 text-[11px] leading-snug text-hl-text">
          {JSON.stringify(item.action, null, 2)}
        </pre>
      </section>
    </article>
  ),
};
