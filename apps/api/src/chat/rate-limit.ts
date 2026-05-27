// In-memory rolling-window rate limiter, keyed by (address, marketKey).
// 10 sends per 60s. Single-process backend — no Redis. Eviction is lazy at
// touch time, plus a sweep every 5 minutes so an idle key doesn't leak.

interface Window {
  /** Timestamps (ms) of recent posts, oldest first. */
  ts: number[];
}

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const SWEEP_INTERVAL_MS = 5 * 60_000;

const map = new Map<string, Window>();

function keyFor(address: string, marketKey: string): string {
  return `${address.toLowerCase()}::${marketKey}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, w] of map) {
    while (w.ts.length > 0 && w.ts[0]! < now - WINDOW_MS) w.ts.shift();
    if (w.ts.length === 0) map.delete(k);
  }
}, SWEEP_INTERVAL_MS).unref?.();

export interface RateLimitResult {
  ok: boolean;
  /** Remaining sends allowed in this window. */
  remaining: number;
  /** ms until the oldest in-window send drops off (i.e. another slot opens). */
  retryAfterMs: number;
}

export function takeRateLimit(address: string, marketKey: string): RateLimitResult {
  const now = Date.now();
  const k = keyFor(address, marketKey);
  let w = map.get(k);
  if (!w) {
    w = { ts: [] };
    map.set(k, w);
  }
  // Drop stale.
  while (w.ts.length > 0 && w.ts[0]! < now - WINDOW_MS) w.ts.shift();
  if (w.ts.length >= MAX_PER_WINDOW) {
    const oldest = w.ts[0]!;
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: WINDOW_MS - (now - oldest),
    };
  }
  w.ts.push(now);
  return {
    ok: true,
    remaining: MAX_PER_WINDOW - w.ts.length,
    retryAfterMs: 0,
  };
}
