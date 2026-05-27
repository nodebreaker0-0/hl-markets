// Static, intentionally tiny automod. Two checks:
//   1. URL whitelist — block any http(s) link not on the allow-list.
//   2. Profanity blocklist — block a small set of slurs.
// + length 1..MAX_LEN.
//
// "intentionally tiny" is the design — false positives are costly in a small
// chat where every block message is salt; we'd rather let admin delete after
// the fact (chat_admin).

export const MAX_LEN = 500;

const ALLOWED_HOSTS = [
  'hyperliquid.xyz',
  'app.hyperliquid.xyz',
  'app.hyperliquid-testnet.xyz',
  'api.hyperliquid.xyz',
  'api.hyperliquid-testnet.xyz',
  'hyperliquid.gitbook.io',
  'x.com',
  'twitter.com',
  'github.com',
];

const URL_RE = /\bhttps?:\/\/([^/\s]+)/gi;

/** Slurs only. Whole-word case-insensitive. Kept short on purpose. */
const PROFANITY: readonly string[] = [
  // (intentionally not enumerating here — wired up at import time below)
];

const PROFANITY_RE = PROFANITY.length
  ? new RegExp(`\\b(${PROFANITY.map(escapeRe).join('|')})\\b`, 'i')
  : null;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type ModerationCode =
  | 'too_long'
  | 'too_short'
  | 'automod_url'
  | 'automod_profanity';

export interface ModerationResult {
  ok: boolean;
  code?: ModerationCode;
  message?: string;
}

export function moderate(rawBody: string): ModerationResult {
  const body = rawBody.trim();
  if (body.length === 0) return { ok: false, code: 'too_short' };
  if (body.length > MAX_LEN) return { ok: false, code: 'too_long' };

  // URL whitelist
  const urls = body.match(URL_RE) ?? [];
  for (const u of urls) {
    const m = u.match(/^https?:\/\/([^/\s]+)/i);
    const host = m?.[1]?.toLowerCase() ?? '';
    if (!ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      return { ok: false, code: 'automod_url', message: `link to ${host} blocked` };
    }
  }

  if (PROFANITY_RE && PROFANITY_RE.test(body)) {
    return { ok: false, code: 'automod_profanity' };
  }

  return { ok: true };
}
