'use client';

// Phase Q — Settlement countdown banner.
//
// Lists questions that expire within the next 24 hours and surfaces options
// trading near settlement extremes (≥ 90% YES or ≤ 10%) where mispricing
// frequently shows up — late-day fades, slow market reactions, etc.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchAllMids,
  fetchOutcomeMeta,
  outcomeAssetKey,
  type OutcomeQuestion,
} from '@/lib/api';
import { CURRENT_NETWORK } from '@/lib/network';
import { expiryCountdown, questionLabel } from '@/lib/outcome-question';

const REFRESH_MS = 60_000;
const ENDING_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

interface EndingSoonRow {
  question: OutcomeQuestion;
  countdown: string;
  /** options with mid > 0.9 (= 90% YES). Often candidate for arb. */
  highConfidenceOptions: { outcomeId: number; name: string; mid: number }[];
}

export function EndingSoon(): JSX.Element | null {
  const [rows, setRows] = useState<EndingSoonRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const [meta, mids] = await Promise.all([
          fetchOutcomeMeta(CURRENT_NETWORK),
          fetchAllMids(CURRENT_NETWORK),
        ]);
        if (cancelled) return;
        const out: EndingSoonRow[] = [];
        for (const q of meta.questions) {
          if (q.settledNamedOutcomes.length > 0) continue; // already partly settled
          if (q.namedOutcomes.length === 0) continue;
          // Parse expiry from any of the option descriptions.
          let expiryInfo: { label: string; expired: boolean } | null = null;
          let exp = expiryCountdown(q.description ?? '');
          if (exp) expiryInfo = exp;
          for (const oid of q.namedOutcomes) {
            const o = meta.outcomes.find((x) => x.outcome === oid);
            if (!o?.description) continue;
            exp = expiryCountdown(o.description);
            if (exp) {
              expiryInfo = exp;
              break;
            }
          }
          if (!expiryInfo) continue;
          if (expiryInfo.expired) continue;

          // Parse 'expires in 1d 5h' → ms. expiryCountdown only gives a label so
          // we approximate by matching '24h' / 'd' patterns to time-bucket.
          const isWithin24h =
            /^expires in \d+h/.test(expiryInfo.label) ||
            /^expires in \d+m/.test(expiryInfo.label) ||
            /^expires in 1d/.test(expiryInfo.label);
          if (!isWithin24h) continue;

          const high: EndingSoonRow['highConfidenceOptions'] = [];
          for (const oid of q.namedOutcomes) {
            const key = outcomeAssetKey(oid, 0);
            const mid = mids[key];
            if (mid === undefined) continue;
            const m = Number(mid);
            if (m >= 0.9) {
              const o = meta.outcomes.find((x) => x.outcome === oid);
              high.push({ outcomeId: oid, name: o?.name ?? `${oid}`, mid: m });
            }
          }

          out.push({
            question: q,
            countdown: expiryInfo.label,
            highConfidenceOptions: high,
          });
        }
        // Sort by countdown text — shortest first (rough heuristic).
        out.sort((a, b) => {
          // Pull number out of "expires in Xh" / "expires in Xm"
          const num = (s: string): number => {
            const m = /(\d+)(h|m|d)/.exec(s);
            if (!m) return 1e9;
            const n = Number(m[1]);
            const unit = m[2];
            return unit === 'm' ? n : unit === 'h' ? n * 60 : n * 60 * 24;
          };
          return num(a.countdown) - num(b.countdown);
        });
        if (!cancelled) setRows(out.slice(0, 6));
      } catch {
        /* best effort */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (loading && rows.length === 0) return null;
  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-status-warn/30 bg-status-warn/5 p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-status-warn">
        <span>⏳ Ending soon</span>
        <span className="text-on-surface-muted">
          {rows.length} markets · settlement edge candidates
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <article
            key={r.question.question}
            className="flex flex-col gap-1 rounded-xl border border-status-warn/20 bg-surface/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <Link
                href={`/q/?id=${r.question.question}`}
                className="text-sm font-semibold text-on-surface hover:text-status-warn"
              >
                {questionLabel(r.question.name, r.question.description ?? '')}
              </Link>
              <div className="mt-0.5 text-[11px] text-on-surface-muted">
                {r.countdown}
                {r.highConfidenceOptions.length > 0 && (
                  <>
                    {' · likely winners: '}
                    {r.highConfidenceOptions
                      .map((o) => `${o.name} (${(o.mid * 100).toFixed(0)}%)`)
                      .join(', ')}
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
