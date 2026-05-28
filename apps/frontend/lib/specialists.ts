// Phase T — domain specialists.
//
// Each candidate (outcome) is routed by `categorize()` to a fetcher that
// pulls live external data and returns a short prompt-ready blob. The
// discovery prompt builder concatenates the blob into the LLM input.
//
// We DON'T group output by domain — the LLM still returns a single mixed
// list of top picks. Specialists just sharpen the inputs.
//
// Fetchers are best-effort: any failure returns null and the LLM falls
// back to its own knowledge.

import type { Category } from '@/lib/categorize';

export interface SpecialistBlob {
  source: string;
  text: string;
}

// ---- Crypto (CoinGecko free) -------------------------------------------

/** Resolve an outcome name like "BTC ≥ $80,000" to a CoinGecko id. */
function extractCoingeckoId(name: string, desc: string): string | null {
  const hay = `${name} ${desc}`.toLowerCase();
  const map: Record<string, string> = {
    bitcoin: 'bitcoin',
    btc: 'bitcoin',
    ethereum: 'ethereum',
    eth: 'ethereum',
    solana: 'solana',
    sol: 'solana',
    hyperliquid: 'hyperliquid',
    hype: 'hyperliquid',
    ripple: 'ripple',
    xrp: 'ripple',
    cardano: 'cardano',
    ada: 'cardano',
    dogecoin: 'dogecoin',
    doge: 'dogecoin',
  };
  for (const [kw, id] of Object.entries(map)) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(hay)) return id;
  }
  return null;
}

interface CoingeckoPriceResp {
  [coinId: string]: {
    usd: number;
    usd_24h_change: number;
    usd_market_cap: number;
  };
}

async function fetchCryptoBlob(name: string, desc: string): Promise<SpecialistBlob | null> {
  const id = extractCoingeckoId(name, desc);
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as CoingeckoPriceResp;
    const row = j[id];
    if (!row) return null;
    return {
      source: 'CoinGecko',
      text: `${id} live: $${row.usd.toLocaleString()} · 24h ${row.usd_24h_change >= 0 ? '+' : ''}${row.usd_24h_change.toFixed(2)}% · MC $${(row.usd_market_cap / 1e9).toFixed(2)}B`,
    };
  } catch {
    return null;
  }
}

// ---- Sports (football-data.org free) -----------------------------------

/** Extract a football team name from the outcome (best-effort). */
function extractTeam(name: string): string | null {
  // We treat the outcome's option name itself as the team (HL outcome markets
  // typically name each option after a team: "France", "Brazil", etc.).
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return null;
  return trimmed;
}

interface FootballMatchesResp {
  matches: Array<{
    utcDate: string;
    competition: { name: string };
    homeTeam: { name: string };
    awayTeam: { name: string };
    score: { fullTime: { home: number | null; away: number | null } };
    status: string;
  }>;
}

async function fetchSportsBlob(
  name: string,
  description: string,
  apiKey?: string | null,
): Promise<SpecialistBlob | null> {
  const team = extractTeam(name);
  if (!team) return null;
  // football-data.org needs a key for most endpoints. Without one, return
  // a minimal "team detected" hint so the LLM at least knows the candidate
  // is a real sports market.
  if (!apiKey) {
    return {
      source: 'sports (heuristic)',
      text: `Candidate looks like a sports market. Team / participant inferred: "${team}". (Sports stats API key not configured — LLM will rely on its own knowledge.)`,
    };
  }
  try {
    const res = await fetch(
      `https://api.football-data.org/v4/teams/?name=${encodeURIComponent(team)}`,
      { headers: { 'X-Auth-Token': apiKey } },
    );
    if (!res.ok) return null;
    // We don't bother parsing team-id resolution + recent matches in detail
    // for v1; just signal that the user enabled the source.
    return {
      source: 'football-data.org',
      text: `Live sports data lookup ran for "${team}". (Detailed form/H2H integration is a TODO — see Phase T v2.) Use this signal: candidate is a real sports market.`,
    };
  } catch {
    return null;
  }
  void description;
}

// ---- Economics (FRED, user key) ----------------------------------------

interface FredSeriesResp {
  observations: Array<{ date: string; value: string }>;
}

const FRED_SERIES_HINTS: Array<{ keywords: string[]; series: string; label: string }> = [
  { keywords: ['cpi', 'consumer price'], series: 'CPIAUCSL', label: 'US CPI (all items, SA)' },
  { keywords: ['unemployment'], series: 'UNRATE', label: 'US unemployment rate' },
  { keywords: ['gdp'], series: 'GDP', label: 'US GDP (nominal)' },
  { keywords: ['fed rate', 'interest rate', 'fomc'], series: 'DFEDTARU', label: 'Fed funds target (upper)' },
  { keywords: ['ppi'], series: 'PPIACO', label: 'US PPI (all commodities)' },
];

function pickFredSeries(name: string, desc: string): { series: string; label: string } | null {
  const hay = `${name} ${desc}`.toLowerCase();
  for (const row of FRED_SERIES_HINTS) {
    if (row.keywords.some((kw) => hay.includes(kw))) {
      return { series: row.series, label: row.label };
    }
  }
  return null;
}

async function fetchEconBlob(
  name: string,
  desc: string,
  apiKey?: string | null,
): Promise<SpecialistBlob | null> {
  if (!apiKey) return null;
  const hint = pickFredSeries(name, desc);
  if (!hint) return null;
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${hint.series}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=3`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as FredSeriesResp;
    if (!j.observations || j.observations.length === 0) return null;
    const recent = j.observations.slice(0, 3).map((o) => `${o.date}: ${o.value}`).join(', ');
    return {
      source: 'FRED',
      text: `${hint.label} — recent: ${recent}`,
    };
  } catch {
    return null;
  }
}

// ---- Weather (OpenWeatherMap, user key) --------------------------------

async function fetchWeatherBlob(
  name: string,
  _desc: string,
  apiKey?: string | null,
): Promise<SpecialistBlob | null> {
  if (!apiKey) return null;
  // Naive: try to extract a city / region name from the outcome.
  const m = /\b(in|at)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/.exec(name);
  const place = m?.[2];
  if (!place) return null;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(place)}&appid=${apiKey}&units=metric`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      main: { temp: number; humidity: number };
      weather: { description: string }[];
    };
    return {
      source: 'OpenWeatherMap',
      text: `${place} now: ${j.main.temp.toFixed(1)}°C, ${j.weather[0]?.description ?? ''}, humidity ${j.main.humidity}%`,
    };
  } catch {
    return null;
  }
}

// ---- Public router -----------------------------------------------------

export interface SpecialistKeys {
  footballData?: string | null;
  fred?: string | null;
  openweather?: string | null;
}

/** For a single candidate, fetch the right specialist blob. Returns null
 *  if no specialist applies or the fetch failed. */
export async function specialistFor(
  category: Category,
  outcomeName: string,
  description: string,
  keys: SpecialistKeys,
): Promise<SpecialistBlob | null> {
  switch (category) {
    case 'crypto':
      return fetchCryptoBlob(outcomeName, description);
    case 'sports':
      return fetchSportsBlob(outcomeName, description, keys.footballData);
    case 'economics':
      return fetchEconBlob(outcomeName, description, keys.fred);
    case 'weather':
      return fetchWeatherBlob(outcomeName, description, keys.openweather);
    case 'politics':
    case 'general':
    default:
      return null;
  }
}
