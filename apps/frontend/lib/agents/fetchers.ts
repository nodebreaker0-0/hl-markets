// Phase U — domain fetchers (enriched).
//
// Each fetcher returns a "RawSignals" object: structured fields the
// analyst LLM can quote as numeric evidence + a small list of sources. We
// keep one fetcher per domain so the orchestrator stays a flat dispatch.
//
// All HTTP calls are best-effort: partial signals are better than no
// signals. Each leaf catches its own error and just omits the field.

import type { Source } from '@/lib/agents/types';
import { searchTavily } from '@/lib/search';

export interface RawSignals {
  /** Numeric / string facts the LLM can quote. */
  fields: Record<string, number | string | boolean>;
  /** Cited sources (label + url). */
  sources: Source[];
  /** Pretty-printable blob for prompt injection (≤ 600 chars). */
  blob: string;
}

const emptySignals = (note?: string): RawSignals => ({
  fields: {},
  sources: [],
  blob: note ?? '',
});

// ---- Crypto -------------------------------------------------------------

const COINGECKO_MAP: Record<string, string> = {
  bitcoin: 'bitcoin', btc: 'bitcoin',
  ethereum: 'ethereum', eth: 'ethereum',
  solana: 'solana', sol: 'solana',
  hyperliquid: 'hyperliquid', hype: 'hyperliquid',
  ripple: 'ripple', xrp: 'ripple',
  cardano: 'cardano', ada: 'cardano',
  dogecoin: 'dogecoin', doge: 'dogecoin',
  bnb: 'binancecoin', binance: 'binancecoin',
};

function pickCoin(name: string, desc: string): string | null {
  const hay = `${name} ${desc}`.toLowerCase();
  for (const [kw, id] of Object.entries(COINGECKO_MAP)) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(hay)) return id;
  }
  return null;
}

export async function fetchCryptoSignals(
  outcomeName: string,
  description: string,
  tavilyKey?: string | null,
): Promise<RawSignals> {
  const coin = pickCoin(outcomeName, description);
  if (!coin) return emptySignals();

  const fields: Record<string, number | string> = { coin };
  const sources: Source[] = [];
  const lines: string[] = [];

  // 1. CoinGecko spot + 24h + 7d.
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coin}?localization=false&market_data=true&community_data=false&developer_data=false&tickers=false`,
    );
    if (res.ok) {
      const j = (await res.json()) as {
        market_data: {
          current_price: { usd: number };
          price_change_percentage_24h: number;
          price_change_percentage_7d: number;
          price_change_percentage_30d: number;
          market_cap: { usd: number };
          total_volume: { usd: number };
          high_24h: { usd: number };
          low_24h: { usd: number };
        };
      };
      const m = j.market_data;
      fields.spotUsd = m.current_price.usd;
      fields.change24hPct = m.price_change_percentage_24h ?? 0;
      fields.change7dPct = m.price_change_percentage_7d ?? 0;
      fields.change30dPct = m.price_change_percentage_30d ?? 0;
      fields.marketCapUsd = m.market_cap.usd;
      fields.volume24hUsd = m.total_volume.usd;
      // Crude realized vol proxy: 24h high-low range %.
      const range = (m.high_24h.usd - m.low_24h.usd) / m.current_price.usd;
      fields.realizedVol24hPct = range * 100;
      sources.push({ label: 'CoinGecko', url: `https://www.coingecko.com/coins/${coin}` });
      lines.push(
        `${coin}: $${m.current_price.usd.toLocaleString()} · 24h ${(m.price_change_percentage_24h ?? 0).toFixed(2)}% · 7d ${(m.price_change_percentage_7d ?? 0).toFixed(2)}% · 30d ${(m.price_change_percentage_30d ?? 0).toFixed(2)}% · MC $${(m.market_cap.usd / 1e9).toFixed(2)}B · vol $${(m.total_volume.usd / 1e9).toFixed(2)}B · 24h range ${range.toFixed(3)}`,
      );
    }
  } catch {
    /* fall through */
  }

  // 2. Tavily — recent news + ETF flow + funding rate (1 call covers many).
  if (tavilyKey) {
    try {
      const query = `${coin} price target funding rate ETF flow last 24 hours news`;
      const hits = await searchTavily(tavilyKey, query, 5);
      if (hits.length > 0) {
        sources.push(
          ...hits.slice(0, 3).map((h) => ({
            label: `Tavily: ${h.title.slice(0, 40)}`,
            url: h.url,
          })),
        );
        const newsBlob = hits
          .slice(0, 3)
          .map((h) => h.content.slice(0, 200).replace(/\s+/g, ' ').trim())
          .join(' · ');
        lines.push(`news: ${newsBlob.slice(0, 350)}`);
        fields.newsResults = hits.length;
      }
    } catch {
      /* skip */
    }
  }

  if (lines.length === 0) return emptySignals();
  return { fields, sources, blob: lines.join('\n').slice(0, 600) };
}

// ---- Sports -------------------------------------------------------------

interface FootballTeam {
  id: number;
  name: string;
}
interface FootballTeamsSearchResp {
  teams: FootballTeam[];
}
interface FootballMatch {
  utcDate: string;
  competition: { name: string };
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  score: { fullTime: { home: number | null; away: number | null } };
  status: string;
}
interface FootballMatchesResp {
  matches: FootballMatch[];
}

export async function fetchSportsSignals(
  outcomeName: string,
  _description: string,
  apiKey?: string | null,
  tavilyKey?: string | null,
): Promise<RawSignals> {
  const team = outcomeName.trim();
  if (!team || team.length < 2 || team.length > 40) return emptySignals();

  const fields: Record<string, number | string> = { team };
  const sources: Source[] = [];
  const lines: string[] = [];

  if (apiKey) {
    try {
      // 1. Resolve team id.
      const tres = await fetch(
        `https://api.football-data.org/v4/teams/?name=${encodeURIComponent(team)}`,
        { headers: { 'X-Auth-Token': apiKey } },
      );
      if (tres.ok) {
        const tjs = (await tres.json()) as FootballTeamsSearchResp;
        const t = tjs.teams?.[0];
        if (t) {
          fields.teamId = t.id;

          // 2. Recent matches (last 10 finished).
          const mres = await fetch(
            `https://api.football-data.org/v4/teams/${t.id}/matches?status=FINISHED&limit=10`,
            { headers: { 'X-Auth-Token': apiKey } },
          );
          if (mres.ok) {
            const mjs = (await mres.json()) as FootballMatchesResp;
            const matches = mjs.matches ?? [];
            let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
            for (const m of matches) {
              const isHome = m.homeTeam.id === t.id;
              const ours = isHome ? m.score.fullTime.home ?? 0 : m.score.fullTime.away ?? 0;
              const theirs = isHome ? m.score.fullTime.away ?? 0 : m.score.fullTime.home ?? 0;
              goalsFor += ours; goalsAgainst += theirs;
              if (ours > theirs) wins++;
              else if (ours < theirs) losses++;
              else draws++;
            }
            fields.recentWins = wins;
            fields.recentDraws = draws;
            fields.recentLosses = losses;
            fields.recentGoalDiff = goalsFor - goalsAgainst;
            sources.push({ label: 'football-data.org', url: `https://www.football-data.org/v4/teams/${t.id}` });
            lines.push(
              `${team} (last 10): ${wins}W-${draws}D-${losses}L · GD ${goalsFor - goalsAgainst}`,
            );
          }
        }
      }
    } catch {
      /* skip */
    }
  } else {
    lines.push(`Sports candidate detected: "${team}". (No football-data key set — using LLM prior only.)`);
  }

  // Tavily — recent injury / lineup / venue news.
  if (tavilyKey) {
    try {
      const hits = await searchTavily(tavilyKey, `${team} recent injuries lineup form 2026`, 3);
      if (hits.length > 0) {
        sources.push(
          ...hits.slice(0, 3).map((h) => ({
            label: `Tavily: ${h.title.slice(0, 40)}`,
            url: h.url,
          })),
        );
        const blob = hits
          .map((h) => h.content.slice(0, 180).replace(/\s+/g, ' ').trim())
          .join(' · ');
        lines.push(`news: ${blob.slice(0, 350)}`);
      }
    } catch {
      /* skip */
    }
  }

  if (lines.length === 0) return emptySignals();
  return { fields, sources, blob: lines.join('\n').slice(0, 600) };
}

// ---- Macro --------------------------------------------------------------

const FRED_HINTS: Array<{ kws: string[]; series: string; label: string }> = [
  { kws: ['cpi', 'consumer price', 'inflation'], series: 'CPIAUCSL', label: 'US CPI (NSA)' },
  { kws: ['core cpi'], series: 'CPILFESL', label: 'US Core CPI' },
  { kws: ['pce'], series: 'PCEPI', label: 'US PCE' },
  { kws: ['unemployment', 'jobless'], series: 'UNRATE', label: 'US unemployment rate' },
  { kws: ['nonfarm', 'payroll', 'jobs report'], series: 'PAYEMS', label: 'US nonfarm payrolls' },
  { kws: ['gdp'], series: 'GDP', label: 'US GDP' },
  { kws: ['fed rate', 'fed funds', 'fomc', 'interest rate'], series: 'DFEDTARU', label: 'Fed funds target (upper)' },
  { kws: ['ppi'], series: 'PPIACO', label: 'US PPI' },
];

export async function fetchMacroSignals(
  outcomeName: string,
  description: string,
  fredKey?: string | null,
  tavilyKey?: string | null,
): Promise<RawSignals> {
  const hay = `${outcomeName} ${description}`.toLowerCase();
  const hit = FRED_HINTS.find((h) => h.kws.some((kw) => hay.includes(kw)));
  if (!hit) return emptySignals();

  const fields: Record<string, number | string> = { fredSeries: hit.series };
  const sources: Source[] = [];
  const lines: string[] = [];

  if (fredKey) {
    try {
      const res = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=${hit.series}&api_key=${fredKey}&file_type=json&sort_order=desc&limit=6`,
      );
      if (res.ok) {
        const j = (await res.json()) as { observations: Array<{ date: string; value: string }> };
        const obs = j.observations ?? [];
        if (obs.length > 0) {
          const numeric = obs
            .map((o) => ({ date: o.date, value: Number(o.value) }))
            .filter((o) => Number.isFinite(o.value));
          if (numeric.length >= 2) {
            const latest = numeric[0]!;
            const prev = numeric[1]!;
            const yoy = numeric[Math.min(numeric.length - 1, 12)];
            fields.fredLatest = latest.value;
            fields.fredLatestDate = latest.date;
            fields.fredMomPct = ((latest.value - prev.value) / prev.value) * 100;
            if (yoy) fields.fredYoYPct = ((latest.value - yoy.value) / yoy.value) * 100;
            sources.push({
              label: `FRED:${hit.series}`,
              url: `https://fred.stlouisfed.org/series/${hit.series}`,
            });
            lines.push(
              `${hit.label} — latest ${latest.date}: ${latest.value}` +
                ` · MoM ${fields.fredMomPct.toFixed(2)}%` +
                (yoy ? ` · YoY ${(fields.fredYoYPct as number).toFixed(2)}%` : ''),
            );
            // include the last 3 raw obs for the LLM to eyeball the trend.
            lines.push(
              `recent: ${numeric.slice(0, 3).map((o) => `${o.date}=${o.value}`).join(', ')}`,
            );
          }
        }
      }
    } catch {
      /* skip */
    }
  } else {
    lines.push(`Macro candidate (${hit.label}). No FRED key set — LLM uses prior only.`);
  }

  if (tavilyKey) {
    try {
      const hits = await searchTavily(
        tavilyKey,
        `${hit.label} consensus forecast next release`,
        3,
      );
      if (hits.length > 0) {
        sources.push(
          ...hits.slice(0, 2).map((h) => ({
            label: `Tavily: ${h.title.slice(0, 40)}`,
            url: h.url,
          })),
        );
        const blob = hits
          .map((h) => h.content.slice(0, 180).replace(/\s+/g, ' ').trim())
          .join(' · ');
        lines.push(`consensus: ${blob.slice(0, 350)}`);
      }
    } catch {
      /* skip */
    }
  }

  if (lines.length === 0) return emptySignals();
  return { fields, sources, blob: lines.join('\n').slice(0, 600) };
}

// ---- Politics -----------------------------------------------------------

export async function fetchPoliticsSignals(
  outcomeName: string,
  description: string,
  tavilyKey?: string | null,
): Promise<RawSignals> {
  if (!tavilyKey) return emptySignals('No Tavily key — political analyst will use LLM prior only.');
  const fields: Record<string, number | string> = {};
  const sources: Source[] = [];
  const lines: string[] = [];
  try {
    const hits = await searchTavily(
      tavilyKey,
      `${outcomeName} poll average 2026 election prediction market`,
      5,
    );
    if (hits.length > 0) {
      sources.push(
        ...hits.slice(0, 4).map((h) => ({
          label: `Tavily: ${h.title.slice(0, 40)}`,
          url: h.url,
        })),
      );
      const blob = hits
        .map((h) => h.content.slice(0, 200).replace(/\s+/g, ' ').trim())
        .join(' · ');
      lines.push(`polls/news: ${blob.slice(0, 500)}`);
      fields.newsResults = hits.length;
    }
  } catch {
    /* skip */
  }
  if (lines.length === 0) return emptySignals();
  return { fields, sources, blob: lines.join('\n').slice(0, 600) };
  void description;
}

// ---- Weather ------------------------------------------------------------

export async function fetchWeatherSignals(
  outcomeName: string,
  description: string,
  apiKey?: string | null,
  tavilyKey?: string | null,
): Promise<RawSignals> {
  const m = /\b(in|at|near|over)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/.exec(
    outcomeName + ' ' + description,
  );
  const place = m?.[2];
  if (!place) return emptySignals();

  const fields: Record<string, number | string> = { place };
  const sources: Source[] = [];
  const lines: string[] = [];

  if (apiKey) {
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(place)}&appid=${apiKey}&units=metric&cnt=8`,
      );
      if (res.ok) {
        const j = (await res.json()) as {
          list: Array<{
            dt_txt: string;
            main: { temp: number; humidity: number };
            weather: { description: string }[];
            wind: { speed: number };
          }>;
        };
        const list = j.list ?? [];
        if (list.length > 0) {
          const temps = list.map((e) => e.main.temp);
          const maxT = Math.max(...temps);
          const minT = Math.min(...temps);
          fields.forecastMaxC = maxT;
          fields.forecastMinC = minT;
          fields.forecastHours = list.length * 3;
          sources.push({ label: 'OpenWeatherMap', url: `https://openweathermap.org/city` });
          lines.push(
            `${place} next ${list.length * 3}h forecast: min ${minT.toFixed(1)}°C · max ${maxT.toFixed(1)}°C · ${list[0]?.weather[0]?.description ?? ''}`,
          );
        }
      }
    } catch {
      /* skip */
    }
  }

  if (tavilyKey) {
    try {
      const hits = await searchTavily(
        tavilyKey,
        `${place} weather forecast climate normal NOAA`,
        2,
      );
      if (hits.length > 0) {
        sources.push(
          ...hits.slice(0, 2).map((h) => ({
            label: `Tavily: ${h.title.slice(0, 40)}`,
            url: h.url,
          })),
        );
        lines.push(
          `climate context: ${hits
            .map((h) => h.content.slice(0, 150).replace(/\s+/g, ' ').trim())
            .join(' · ')
            .slice(0, 300)}`,
        );
      }
    } catch {
      /* skip */
    }
  }

  if (lines.length === 0) return emptySignals();
  return { fields, sources, blob: lines.join('\n').slice(0, 600) };
}
