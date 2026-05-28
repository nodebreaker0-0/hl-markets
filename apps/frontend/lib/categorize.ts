// Phase T — outcome category classifier.
//
// Fast keyword-based classifier so the AI Discovery loop can decide which
// specialist (sports / crypto / economics / politics / weather) to call
// before the LLM step. The classifier is intentionally cheap — no network,
// no LLM — so it can be applied to every candidate in the batch.
//
// Heuristic rules:
//   - sports: team / league / cup / champion / final / match / vs.
//   - crypto: btc / eth / bitcoin / ethereum / sol / wormhole / hype.
//   - economics: cpi / inflation / fed / rates / gdp / unemployment.
//   - politics: election / president / vote / senate / governor.
//   - weather: temperature / hurricane / rain / storm / snow.
//   - default: general.

export type Category =
  | 'sports'
  | 'crypto'
  | 'economics'
  | 'politics'
  | 'weather'
  | 'general';

const KW: Record<Exclude<Category, 'general'>, string[]> = {
  sports: [
    'cup', 'champion', 'final', 'tournament', 'league', 'match', 'game',
    'football', 'soccer', 'basketball', 'baseball', 'hockey', 'tennis',
    'world cup', 'super bowl', 'nba', 'nfl', 'mlb', 'nhl',
    'wins', 'beat', 'vs', 'versus', 'fifa', 'uefa',
  ],
  crypto: [
    'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'crypto',
    'hyperliquid', 'hype', 'usdc', 'stablecoin', 'token', 'coin',
    'altcoin', 'defi', 'memecoin', 'nft', 'price target',
  ],
  economics: [
    'cpi', 'inflation', 'fed', 'fomc', 'rate', 'interest rate', 'gdp',
    'recession', 'unemployment', 'jobs report', 'payroll', 'jobless',
    'consumer price', 'ppi', 'pce',
  ],
  politics: [
    'election', 'president', 'presidential', 'vote', 'voter', 'senate',
    'governor', 'mayor', 'congress', 'parliament', 'minister',
    'democrat', 'republican', 'party',
  ],
  weather: [
    'temperature', 'hurricane', 'rain', 'rainfall', 'storm', 'snow', 'snowfall',
    'tornado', 'flood', 'heatwave', 'climate',
  ],
};

/** Classify an outcome by question + outcome name + description. */
export function categorize(
  outcomeName: string,
  description: string,
  questionTitle?: string,
): Category {
  const hay = `${questionTitle ?? ''}\n${outcomeName}\n${description}`.toLowerCase();
  for (const cat of ['sports', 'crypto', 'economics', 'politics', 'weather'] as const) {
    for (const kw of KW[cat]) {
      // Word-boundary match to avoid 'btc' inside 'arctic'.
      const re = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (re.test(hay)) return cat;
    }
  }
  return 'general';
}

/** Group an array of items by category for batch specialist fetch. */
export function groupByCategory<T extends { outcomeName: string; description: string; questionTitle?: string }>(
  items: T[],
): Map<Category, T[]> {
  const out = new Map<Category, T[]>();
  for (const it of items) {
    const cat = categorize(it.outcomeName, it.description, it.questionTitle);
    const list = out.get(cat) ?? [];
    list.push(it);
    out.set(cat, list);
  }
  return out;
}
