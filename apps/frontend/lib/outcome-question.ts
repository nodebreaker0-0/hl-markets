// outcomeMeta.questions / outcomes use the `name` field for human-readable
// labels, but for Hyperliquid's *recurring* markets (price buckets, price
// binaries) the name is generic ("Recurring", "Recurring Named Outcome") and
// the real semantics live in `description` as a pipe-delimited DSL:
//
//   question.description  = "class:priceBucket|underlying:BTC|expiry:20260527-0600|priceThresholds:75339,78414|period:1d"
//   outcome.description   = "index:0" | "index:1" | ... (for namedOutcomes)
//                          = "other"  (for fallback)
//   standalone outcome    = "class:priceBinary|underlying:BTC|...|targetPrice:76877"
//
// This module is the single place that knows that DSL. The page/components
// just call `questionLabel(...)` / `optionLabel(...)` / `outcomeLabel(...)`
// and get a string back ready for rendering.

export type RecurringClass = 'priceBucket' | 'priceBinary' | string;

export interface RecurringDSL {
  class?: RecurringClass;
  underlying?: string;
  /** "20260527-0600" — YYYYMMDD-HHMM (UTC). */
  expiry?: string;
  /** priceBucket: sorted ascending thresholds. e.g. [75339, 78414]. */
  priceThresholds?: number[];
  /** priceBinary: single threshold. */
  targetPrice?: number;
  /** Snapshot/cadence label — "1d" etc. Not used for labels currently. */
  period?: string;
}

/** Parse the pipe-delimited DSL. Unknown keys land on the result as-is (as
 *  strings). Returns an empty object on null/empty input — caller decides what
 *  fields to require. */
export function parseRecurringDSL(s: string | null | undefined): RecurringDSL {
  if (!s) return {};
  const out: Record<string, unknown> = {};
  for (const part of s.split('|')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    if (k === 'priceThresholds') {
      const nums = v
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n));
      if (nums.length > 0) out[k] = nums;
    } else if (k === 'targetPrice') {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    } else {
      out[k] = v;
    }
  }
  return out as RecurringDSL;
}

/** "20260527-0600" → "2026-05-27 06:00 UTC". Pass-through on unparseable. */
export function formatExpiry(s: string | undefined): string {
  if (!s) return '';
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC`;
}

export function formatPrice(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/** Generic-looking name → "Recurring", "Recurring Named Outcome", etc.
 *  These names alone don't tell the user what the market is about. */
function isGenericName(name: string): boolean {
  const n = name.toLowerCase();
  return n === 'recurring' || n.startsWith('recurring ') || n === 'fallback';
}

/** Build a human label for a question card / detail page heading.
 *  Falls back to `name` when the DSL doesn't help. */
export function questionLabel(name: string, description: string): string {
  if (!isGenericName(name)) return name;
  const dsl = parseRecurringDSL(description);
  if (dsl.class === 'priceBucket' && dsl.underlying && dsl.priceThresholds) {
    const exp = formatExpiry(dsl.expiry);
    const expSuffix = exp ? ` · expires ${exp}` : '';
    return `${dsl.underlying} price bucket${expSuffix}`;
  }
  return name;
}

/** Build a label for one option of a question, given the question's
 *  description (which carries thresholds) and the outcome's own description
 *  (which carries the option index). */
export function optionLabel(
  outcomeName: string,
  outcomeDescription: string,
  questionDescription: string,
): string {
  if (!isGenericName(outcomeName)) return outcomeName;
  const q = parseRecurringDSL(questionDescription);
  if (q.class !== 'priceBucket' || !q.priceThresholds || q.priceThresholds.length === 0) {
    return outcomeName;
  }
  const t = q.priceThresholds;
  const u = q.underlying ?? '';
  const idxMatch = /^index:(\d+)$/.exec(outcomeDescription.trim());
  if (!idxMatch) return outcomeName;
  const idx = Number(idxMatch[1]);

  // thresholds [t0, t1, ...] generate buckets:
  //   idx 0          → underlying < t0
  //   1..t.length-1  → t[idx-1] ≤ underlying < t[idx]
  //   idx t.length   → underlying ≥ t_last
  if (idx === 0 && t[0] !== undefined) return `${u} < ${formatPrice(t[0])}`;
  if (idx < t.length && idx > 0) {
    const lo = t[idx - 1];
    const hi = t[idx];
    if (lo !== undefined && hi !== undefined) {
      return `${formatPrice(lo)} ≤ ${u} < ${formatPrice(hi)}`;
    }
  }
  if (idx === t.length) {
    const last = t[t.length - 1];
    if (last !== undefined) return `${u} ≥ ${formatPrice(last)}`;
  }
  return outcomeName;
}

/** Build a label for a *standalone* outcome (not part of any question).
 *  Currently handles priceBinary; other unknown classes fall back to `name`. */
export function outcomeLabel(name: string, description: string): string {
  if (!isGenericName(name)) return name;
  const dsl = parseRecurringDSL(description);
  if (dsl.class === 'priceBinary' && dsl.underlying && dsl.targetPrice !== undefined) {
    const exp = formatExpiry(dsl.expiry);
    const expSuffix = exp ? ` · expires ${exp}` : '';
    return `${dsl.underlying} ≥ ${formatPrice(dsl.targetPrice)}${expSuffix}`;
  }
  return name;
}

/** Extract a Date from the description. Tries two sources, in order:
 *  1. DSL `expiry:YYYYMMDD-HHMM` (UTC) — used by priceBucket / priceBinary.
 *  2. Free-text "scheduled for / by Month DD, YYYY [at HH:MM AM/PM TZ]" —
 *     used by curated questions like the CPI release.
 *  Returns null when neither pattern matches. */
export function expiryDate(description: string | null | undefined): Date | null {
  if (!description) return null;

  const dsl = parseRecurringDSL(description);
  if (dsl.expiry) {
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(dsl.expiry);
    if (m) {
      const [, y, mo, d, h, mi] = m;
      return new Date(
        Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)),
      );
    }
  }

  return parseFreeTextExpiry(description);
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;
const MONTH_RE = MONTHS.join('|');

/** US time-zone abbreviations → UTC offset hours.
 *  E.g. ET in summer is EDT (-4h), in winter EST (-5h). We don't know the
 *  date's actual DST state without a full TZ library, so we approximate ET
 *  as -4h since CPI / Fed releases are during DST most of the year. */
const TZ_OFFSET_H: Record<string, number> = {
  UTC: 0,
  GMT: 0,
  ET: 4,
  EDT: 4,
  EST: 5,
  CT: 5,
  CDT: 5,
  CST: 6,
  MT: 6,
  MDT: 6,
  MST: 7,
  PT: 7,
  PDT: 7,
  PST: 8,
};

function parseFreeTextExpiry(desc: string): Date | null {
  // "scheduled for June 10, 2026 at 8:30 AM ET"
  const reSched = new RegExp(
    `scheduled for (${MONTH_RE})\\s+(\\d{1,2}),?\\s+(\\d{4})(?:\\s+at\\s+(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\s*([a-z]{2,4})?)?`,
    'i',
  );
  const m1 = reSched.exec(desc);
  if (m1) return buildDate(m1);

  // Deadline-style "by July 15, 2026"
  const reBy = new RegExp(
    `\\bby\\s+(${MONTH_RE})\\s+(\\d{1,2}),?\\s+(\\d{4})`,
    'i',
  );
  const m2 = reBy.exec(desc);
  if (m2) return buildDate(m2);

  return null;
}

function buildDate(m: RegExpExecArray): Date {
  // Indices align with the regexes above:
  // [_, monthName, day, year, hour?, min?, ampm?, tz?]
  const monthName = (m[1] ?? '').toLowerCase();
  const day = Number(m[2]);
  const year = Number(m[3]);
  let h = 0;
  let mi = 0;
  if (m[4] && m[5]) {
    h = Number(m[4]);
    mi = Number(m[5]);
    const ampm = m[6]?.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
  }
  const tz = m[7]?.toUpperCase();
  const offsetHours = tz && TZ_OFFSET_H[tz] !== undefined ? TZ_OFFSET_H[tz] : 0;
  const monthIdx = MONTHS.findIndex((x) => x === monthName);
  return new Date(Date.UTC(year, monthIdx, day, h + offsetHours, mi));
}

/** Human "expires in 5d 3h" / "expired 2d ago" — null when no expiry known. */
export function expiryCountdown(
  description: string | null | undefined,
  now: number = Date.now(),
): { label: string; expired: boolean } | null {
  const exp = expiryDate(description);
  if (!exp) return null;
  const diff = exp.getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  let label: string;
  if (d > 0) label = `${d}d ${h % 24}h`;
  else if (h > 0) label = `${h}h ${m % 60}m`;
  else label = `${m}m`;
  return diff <= 0
    ? { label: `expired ${label} ago`, expired: true }
    : { label: `expires in ${label}`, expired: false };
}
