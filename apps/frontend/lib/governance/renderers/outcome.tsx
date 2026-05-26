'use client';

// Outcome variant renderer. Card = title + side names + brief. Detail = full
// description + sides + (Phase H) perp price + chart.

import type { VariantRenderer } from '../types';

function extractOutcome(action: Record<string, unknown>): {
  innerOp: string | null;
  title: string;
  description: string;
  sideNames: string[];
} {
  const O = action['O'];
  if (!O || typeof O !== 'object') {
    return { innerOp: null, title: '(malformed outcome)', description: '', sideNames: [] };
  }
  const o = O as Record<string, unknown>;
  const innerOp = Object.keys(o)[0] ?? null;
  // The schema differs between known inner ops:
  //   - registerTokensAndStandaloneOutcome → { nameAndDescription:[t,d], sideNames }
  //   - registerTokensAndQuestion          → { name, description, sideNames }
  //   - settle / future variants           → unknown shape, fall back gracefully
  // Be forgiving and check both shapes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = innerOp ? (o[innerOp] as any) : null;
  let title: string;
  let description: string;
  if (Array.isArray(reg?.nameAndDescription)) {
    const nad = reg.nameAndDescription as unknown[];
    title = (nad[0] as string | undefined) ?? `(${innerOp ?? 'outcome'})`;
    description = (nad[1] as string | undefined) ?? '';
  } else if (typeof reg?.name === 'string') {
    title = reg.name as string;
    description = (reg.description as string | undefined) ?? '';
  } else {
    title = `(${innerOp ?? 'outcome'})`;
    description = '';
  }
  const sideNames = Array.isArray(reg?.sideNames) ? (reg.sideNames as string[]) : [];
  return { innerOp, title, description, sideNames };
}

export const outcome: VariantRenderer = {
  Card: ({ item }) => {
    const { title, sideNames, innerOp } = extractOutcome(item.action);
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold leading-snug text-hl-text">{title}</h3>
        {sideNames.length >= 2 && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {sideNames.slice(0, 4).map((s, i) => (
              <span
                key={i}
                className="rounded-full bg-hl-bg px-2 py-0.5 font-medium text-hl-text ring-1 ring-hl-border"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        {innerOp && innerOp !== 'registerTokensAndStandaloneOutcome' && (
          <span className="text-[10px] uppercase tracking-widest text-hl-subtle">
            inner op: <code className="mono">{innerOp}</code>
          </span>
        )}
      </div>
    );
  },
  Detail: ({ item }) => {
    const { title, description, sideNames, innerOp } = extractOutcome(item.action);
    return (
      <article className="space-y-4">
        <header className="space-y-2">
          <span className="inline-block rounded-full bg-hl-mint/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-hl-mint ring-1 ring-hl-mint/40">
            Outcome {innerOp ? `· ${innerOp}` : ''}
          </span>
          <h1 className="text-2xl font-bold leading-tight text-hl-text sm:text-3xl">{title}</h1>
        </header>
        {sideNames.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-widest text-hl-subtle">Sides</h2>
            <div className="grid grid-cols-2 gap-2">
              {sideNames.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-hl-border bg-hl-surface p-3 text-center"
                >
                  <div className="text-xs uppercase tracking-wider text-hl-subtle">side {i + 1}</div>
                  <div className="mt-1 font-semibold text-hl-text">{s}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        {description && (
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-widest text-hl-subtle">About</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-hl-text/90">
              {description}
            </p>
          </section>
        )}
      </article>
    );
  },
};
