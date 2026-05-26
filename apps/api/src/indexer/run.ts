// Main indexer loop. Runs once per node-cron tick: testnet + mainnet ×
// (governance, validators, outcomes). Errors per network are isolated so
// a single HF outage doesn't cascade.

import { runGovernance } from './governance';
import { runValidators } from './validators';
import { runOutcomes, linkDeployments } from './outcome';
import type { Network } from '@/hf';

const NETWORKS: Network[] = ['testnet', 'mainnet'];

export async function runIndexerOnce(): Promise<void> {
  const nowMs = Date.now();
  const startedAt = new Date(nowMs).toISOString();
  const results: string[] = [];

  for (const n of NETWORKS) {
    try {
      const g = await runGovernance(n, nowMs);
      const v = await runValidators(n, nowMs);
      const o = await runOutcomes(n, nowMs);
      // Run *after* runGovernance + runOutcomes so both tables are fresh.
      const linked = await linkDeployments(n);
      results.push(
        `[${n}] gov=${g.upserted} marked=${g.marked} validators=${v}` +
          ` outcomes=${o.upserted} questions=${o.questionsUpserted}` +
          (o.questionsSettled > 0 ? ` qsettled=${o.questionsSettled}` : '') +
          (o.mappingMismatch > 0 ? ` mismatch=${o.mappingMismatch}` : '') +
          (linked > 0 ? ` linked=${linked}` : ''),
      );
    } catch (e) {
      results.push(`[${n}] ERR: ${(e as Error).message}`);
    }
  }

  console.info(`[indexer ${startedAt}] ${results.join(' | ')}`);
}
