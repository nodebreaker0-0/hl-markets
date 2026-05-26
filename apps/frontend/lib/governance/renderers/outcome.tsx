'use client';

// Outcome variant renderer. Card = title + side names + brief. Detail = full
// description + sides + (Phase H) perp price + chart.

import type { VariantRenderer } from '../types';

/** Normalized view of one outcome-variant governance action.
 *  Sources:
 *    - registerTokensAndStandaloneOutcome →
 *        { nameAndDescription:[t,d], sideNames:[...], quoteToken }
 *      `options` = sideNames (Yes/No, Change/No Change, ...) — binary market.
 *    - registerTokensAndQuestion →
 *        { questionNameAndDescription:[t,d], fallbackNameAndDescription:[t,d],
 *          namedOutcomes:[[name,desc],...], quoteToken }
 *      `options` = namedOutcomes[*][0] — multi-option polymarket-style. */
function extractOutcome(action: Record<string, unknown>): {
  innerOp: string | null;
  title: string;
  description: string;
  options: string[];
} {
  const O = action['O'];
  if (!O || typeof O !== 'object') {
    return { innerOp: null, title: '(malformed outcome)', description: '', options: [] };
  }
  const o = O as Record<string, unknown>;
  const innerOp = Object.keys(o)[0] ?? null;
  const reg = innerOp ? (o[innerOp] as Record<string, unknown> | undefined) : undefined;
  if (!reg) {
    return { innerOp, title: `(${innerOp ?? 'outcome'})`, description: '', options: [] };
  }

  // 1) namedAndDescription tuple — common to both shapes (under different keys).
  const tupleKey = Array.isArray(reg['questionNameAndDescription'])
    ? 'questionNameAndDescription'
    : Array.isArray(reg['nameAndDescription'])
      ? 'nameAndDescription'
      : null;

  let title: string;
  let description: string;
  if (tupleKey) {
    const nad = reg[tupleKey] as unknown[];
    title = (typeof nad[0] === 'string' ? nad[0] : undefined) ?? `(${innerOp ?? 'outcome'})`;
    description = (typeof nad[1] === 'string' ? nad[1] : undefined) ?? '';
  } else if (typeof reg['name'] === 'string') {
    title = reg['name'];
    description = typeof reg['description'] === 'string' ? reg['description'] : '';
  } else {
    title = `(${innerOp ?? 'outcome'})`;
    description = '';
  }

  // 2) Options — multi-option (namedOutcomes) or binary (sideNames).
  let options: string[] = [];
  const named = reg['namedOutcomes'];
  if (Array.isArray(named)) {
    // namedOutcomes is [[name, desc], ...] — pull the first element of each.
    options = named
      .map((row) => (Array.isArray(row) && typeof row[0] === 'string' ? row[0] : null))
      .filter((s): s is string => s !== null);
  } else if (Array.isArray(reg['sideNames'])) {
    options = (reg['sideNames'] as unknown[]).filter(
      (s): s is string => typeof s === 'string',
    );
  }

  return { innerOp, title, description, options };
}

/** Map the gov action's inner op to a one-word kind label.
 *  - registerTokensAndQuestion             → "question" (multi-option market)
 *  - registerTokensAndStandaloneOutcome    → "market"   (single binary)
 *  - settleOutcome / settleQuestion / ...  → that name verbatim
 *  - unknown                               → the raw op (degraded gracefully) */
function opKind(innerOp: string | null): string {
  if (innerOp === 'registerTokensAndQuestion') return 'question';
  if (innerOp === 'registerTokensAndStandaloneOutcome') return 'market';
  return innerOp ?? 'outcome';
}

export const outcome: VariantRenderer = {
  Card: ({ item }) => {
    const { title, description, options, innerOp } = extractOutcome(item.action);
    const kind = opKind(innerOp);
    const isQuestion = innerOp === 'registerTokensAndQuestion';

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold leading-snug text-hl-text">{title}</h3>
          <span
            className={
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1 ' +
              (isQuestion
                ? 'bg-hl-mint/15 text-hl-mint ring-hl-mint/40'
                : 'bg-hl-bg text-hl-subtle ring-hl-border')
            }
          >
            {kind}
          </span>
        </div>

        {description && (
          <p className="line-clamp-2 text-[11px] leading-snug text-hl-subtle">
            {description}
          </p>
        )}

        {options.length >= 2 && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {options.slice(0, 6).map((s, i) => (
              <span
                key={i}
                className="rounded-full bg-hl-bg px-2 py-0.5 font-medium text-hl-text ring-1 ring-hl-border"
              >
                {s}
              </span>
            ))}
            {options.length > 6 && (
              <span className="rounded-full bg-hl-bg px-2 py-0.5 text-hl-subtle ring-1 ring-hl-border">
                +{options.length - 6}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
  Detail: ({ item }) => {
    const { title, description, options, innerOp } = extractOutcome(item.action);
    const kind = opKind(innerOp);
    const optionsLabel = innerOp === 'registerTokensAndQuestion' ? 'Options' : 'Sides';
    return (
      <article className="space-y-4">
        <header className="space-y-2">
          <span className="inline-block rounded-full bg-hl-mint/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-hl-mint ring-1 ring-hl-mint/40">
            {kind}
            {innerOp ? ` · ${innerOp}` : ''}
          </span>
          <h1 className="text-2xl font-bold leading-tight text-hl-text sm:text-3xl">{title}</h1>
        </header>
        {options.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-widest text-hl-subtle">
              {optionsLabel}
            </h2>
            <div
              className={
                options.length <= 2
                  ? 'grid grid-cols-2 gap-2'
                  : 'grid grid-cols-2 gap-2 sm:grid-cols-3'
              }
            >
              {options.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-hl-border bg-hl-surface p-3 text-center"
                >
                  <div className="text-xs uppercase tracking-wider text-hl-subtle">#{i + 1}</div>
                  <div className="mt-1 text-sm font-semibold text-hl-text">{s}</div>
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
