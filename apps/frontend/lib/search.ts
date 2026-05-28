// Phase M Tier 2 — web search for AI Analyst context enrichment.
//
// Tavily is LLM-friendly: it returns short summaries per result that drop
// straight into a system prompt. Free tier covers ~1000 calls/month, plenty
// for personal use.
//
// Endpoint: https://api.tavily.com/search
//   { api_key, query, max_results, include_raw_content, search_depth }
//
// We keep the surface tiny — one function, plain shape — and the CSP only
// needs api.tavily.com whitelisted.

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilyResp {
  results: SearchResult[];
  answer?: string;
}

export async function searchTavily(
  key: string,
  query: string,
  maxResults = 5,
): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: maxResults,
      include_raw_content: false,
      search_depth: 'basic',
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Tavily ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j = (await res.json()) as TavilyResp;
  return j.results ?? [];
}

/** Compact one-paragraph blob LLM-friendly for prompt injection. */
export function formatSearchBlob(results: SearchResult[]): string {
  if (results.length === 0) return '';
  return results
    .slice(0, 5)
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\n${r.content.slice(0, 280).replace(/\s+/g, ' ').trim()}\n(${r.url})`,
    )
    .join('\n\n');
}
