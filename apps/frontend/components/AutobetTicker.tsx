'use client';

// Phase O — Auto-bet background scanner.
//
// Mounted globally (layout). When config.enabled is true AND a session
// exists, run a tick every 5 minutes. Each tick:
//   1. loadKeys / loadAutobet
//   2. analyze a small batch of candidate outcomes
//   3. place bets that clear the user's thresholds
//   4. toast each placement / cap-reached
//
// The scanner DOES NOT run if the tab is hidden — we use the Page
// Visibility API to pause. Multi-tab safety is not provided yet (each tab
// scans on its own); this is fine while testnet, will revisit for mainnet.

import { useEffect } from 'react';
import { loadAutobet, runAutobetTick } from '@/lib/autobet';
import { useSession } from '@/lib/use-session';

const TICK_MS = 5 * 60 * 1000;

export function AutobetTicker(): null {
  const { session } = useSession();

  useEffect(() => {
    if (!session) return;
    let timer: number | undefined;
    let cancelled = false;

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      const { config } = loadAutobet();
      if (!config.enabled) return;
      if (document.hidden) return;
      try {
        await runAutobetTick({ address: session.address });
      } catch {
        /* surface via toast inside the runner; ignore here */
      }
    };

    const schedule = (): void => {
      timer = window.setTimeout(async () => {
        await tick();
        if (!cancelled) schedule();
      }, TICK_MS);
    };

    // First tick after a short delay (let the page settle).
    timer = window.setTimeout(async () => {
      await tick();
      if (!cancelled) schedule();
    }, 30_000);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [session]);

  return null;
}
