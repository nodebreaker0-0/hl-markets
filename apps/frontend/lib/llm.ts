// Phase M — LLM provider abstraction.
//
// hl-markets calls LLM APIs DIRECTLY from the browser using the user's own
// API key (stored in localStorage). Our backend never sees the key. This
// keeps the trust model identical to the agent privkey flow (Phase J.7):
// the user is exposed to standard browser-app risks (XSS, devtools), not to
// us holding their secret.
//
// Provider list:
//   - OpenAI Chat Completions (gpt-4o-mini default, JSON schema strict)
//   - Anthropic Messages (claude-3-5-sonnet, JSON code-block parse + retry)
//
// Public surface:
//   - loadKeys() / saveKeys() / clearKeys()
//   - testKey(provider, key) — quick auth check ($0 cost on most providers)
//   - analyzeOutcome(provider, key, input) → AnalysisResult

export type LlmProvider = 'openai' | 'anthropic';

const STORAGE_KEY = 'hl-markets-llm-keys';

export interface LlmKeys {
  /** Preferred provider for new analyses. */
  preferred: LlmProvider | null;
  openai: string | null;
  anthropic: string | null;
  /** Optional Tavily search key — when set, AI Analyze enriches its prompt
   *  with the top web results for the outcome before calling the LLM. */
  tavily?: string | null;
}

export function loadKeys(): LlmKeys {
  if (typeof window === 'undefined') {
    return { preferred: null, openai: null, anthropic: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { preferred: null, openai: null, anthropic: null };
    const parsed = JSON.parse(raw) as LlmKeys;
    return {
      preferred: parsed.preferred ?? null,
      openai: parsed.openai ?? null,
      anthropic: parsed.anthropic ?? null,
    };
  } catch {
    return { preferred: null, openai: null, anthropic: null };
  }
}

export function saveKeys(k: LlmKeys): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(k));
}

export function clearKeys(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

// ---- Analysis input / output -------------------------------------------

export interface AnalyzeInput {
  /** Outcome name, e.g. "France" or "BELOW 4.3% YES". */
  outcomeName: string;
  /** Side label, e.g. "Yes" / "No". */
  sideName: string;
  /** Plain-text question + outcome description (the REAL resolver text). */
  description: string;
  /** Current best ask (= what the market thinks YES probability is). */
  currentPct: number;
  /** Time-to-expiry human label, e.g. "expires in 5d 3h". */
  expiry?: string;
  /** Optional recent price history blob (compact). */
  recentPriceBlob?: string;

  // ---- Phase M-5 enriched context ----
  /** Question umbrella name, when applicable (e.g. "2026 World Cup champion"). */
  questionTitle?: string;
  /** For multi-option questions: top peer outcomes for relative pricing context.
   *  e.g. [{name: "Germany", pct: 53}, {name: "England", pct: 52.5}, ...]. */
  peerOutcomes?: { name: string; pct: number }[];
  /** Sum of all option YES prices. Sanity-check signal (~1.0 expected). */
  peerSumPct?: number;
  /** Order book one-liner: "ask 48.4% × 1061 / bid 16.9% × 2500 · spread 31.5pp". */
  bookSummary?: string;
  /** User's existing position on this outcome side, USD. */
  userPositionUsd?: number;
  /** Web search results blob (from Tavily / Brave) — recent news / data
   *  that helps the LLM ground its estimate. */
  webContext?: string;
}

export interface AnalysisResult {
  /** LLM's estimated probability (0-100). */
  fairPct: number;
  /** Confidence bucket. */
  confidence: 'low' | 'medium' | 'high';
  /** 3-6 short bullets explaining the estimate. */
  reasoning: string[];
  /** Free-form caveat / data limitation note. */
  caveat?: string;
  /** Raw provider tag for the result card. */
  provider: LlmProvider;
  /** Approximate billed cost in USD. */
  estCostUsd: number;
}

const SYSTEM_PROMPT = `You are a prediction-market analyst. The user shows you a market outcome and the current trading price. Estimate the fair probability (0-100) of the outcome resolving YES.

Strict rules:
- Output a JSON object: { "fairPct": number, "confidence": "low"|"medium"|"high", "reasoning": string[], "caveat": string }.
- Never recommend a bet size. Never recommend buying or selling.
- "fairPct" is your point estimate, not the market price.
- "reasoning" is 3-6 short bullets explaining your number. No fluff.
- "caveat" is a single sentence on what's missing or uncertain in your input.
- If you don't have enough information to be more than 50/50, set confidence to "low" and say so in caveat.
`;

function buildUserPrompt(input: AnalyzeInput): string {
  const lines: (string | null)[] = [
    input.questionTitle ? `Question: ${input.questionTitle}` : null,
    `Outcome: ${input.outcomeName} (${input.sideName})`,
    '',
    'Resolver text (what HL will check at expiry):',
    input.description,
    '',
    `Market price: ${input.currentPct.toFixed(1)}% (this is what the order book is pricing right now).`,
    input.expiry ? `${input.expiry}.` : null,
    input.bookSummary ? `Order book: ${input.bookSummary}.` : null,
  ];
  if (input.peerOutcomes && input.peerOutcomes.length > 0) {
    lines.push('');
    lines.push('Peer options in the same question (top by market price):');
    for (const p of input.peerOutcomes.slice(0, 8)) {
      lines.push(`  - ${p.name}: ${p.pct.toFixed(1)}%`);
    }
    if (input.peerSumPct !== undefined) {
      lines.push(
        `Sum of all YES prices ≈ ${input.peerSumPct.toFixed(1)}% (should be ~100% in a well-priced market).`,
      );
    }
  }
  if (input.recentPriceBlob) {
    lines.push('');
    lines.push(`Recent price moves: ${input.recentPriceBlob}`);
  }
  if (input.userPositionUsd !== undefined && input.userPositionUsd > 0) {
    lines.push('');
    lines.push(
      `Note: the user already holds ~$${input.userPositionUsd.toFixed(2)} on this side.`,
    );
  }
  if (input.webContext && input.webContext.trim().length > 0) {
    lines.push('');
    lines.push('Recent web search results (use them, but verify before trusting):');
    lines.push(input.webContext);
  }
  return lines.filter((l) => l !== null).join('\n');
}

// ---- OpenAI -------------------------------------------------------------

interface OpenAiChoice {
  message: { content: string };
}
interface OpenAiResp {
  choices: OpenAiChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

async function analyzeOpenAi(key: string, input: AnalyzeInput): Promise<AnalysisResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j = (await res.json()) as OpenAiResp;
  const raw = j.choices[0]?.message.content;
  if (!raw) throw new Error('OpenAI: empty response');
  const parsed = parseAnalysisJson(raw, 'openai');
  const tokens = (j.usage?.prompt_tokens ?? 0) + (j.usage?.completion_tokens ?? 0);
  // gpt-4o-mini ≈ $0.15/M input, $0.60/M output. Approximate at $0.40/M.
  parsed.estCostUsd = (tokens / 1_000_000) * 0.4;
  return parsed;
}

// ---- Anthropic ----------------------------------------------------------

interface AnthropicContentBlock { type: string; text: string }
interface AnthropicResp {
  content: AnthropicContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
}

async function analyzeAnthropic(
  key: string,
  input: AnalyzeInput,
): Promise<AnalysisResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j = (await res.json()) as AnthropicResp;
  const txt = j.content.find((c) => c.type === 'text')?.text;
  if (!txt) throw new Error('Anthropic: empty response');
  const parsed = parseAnalysisJson(txt, 'anthropic');
  const tokens = (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0);
  // claude-3-5-sonnet ≈ $3/M input, $15/M output. Approximate at $9/M weighted.
  parsed.estCostUsd = (tokens / 1_000_000) * 9;
  return parsed;
}

// ---- JSON parser --------------------------------------------------------

function parseAnalysisJson(raw: string, provider: LlmProvider): AnalysisResult {
  // First try strict JSON.
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    // Fallback: extract first {...} block from the text.
    const m = /\{[\s\S]*\}/.exec(raw);
    if (m) {
      try {
        obj = JSON.parse(m[0]);
      } catch {
        throw new Error(`${provider}: failed to parse JSON response`);
      }
    } else {
      throw new Error(`${provider}: no JSON in response`);
    }
  }
  const r = obj as Partial<AnalysisResult>;
  const fairPct = clamp(Number(r.fairPct), 0, 100);
  if (!Number.isFinite(fairPct)) {
    throw new Error(`${provider}: invalid fairPct`);
  }
  const confidence =
    r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low'
      ? r.confidence
      : 'low';
  const reasoning = Array.isArray(r.reasoning)
    ? r.reasoning.map((s) => String(s)).slice(0, 8)
    : [];
  const caveat = typeof r.caveat === 'string' ? r.caveat : undefined;
  return {
    fairPct,
    confidence,
    reasoning,
    caveat,
    provider,
    estCostUsd: 0,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ---- Public API ---------------------------------------------------------

export async function analyzeOutcome(
  provider: LlmProvider,
  key: string,
  input: AnalyzeInput,
): Promise<AnalysisResult> {
  if (!key) throw new Error('No API key set.');
  if (provider === 'openai') return analyzeOpenAi(key, input);
  if (provider === 'anthropic') return analyzeAnthropic(key, input);
  throw new Error(`Unknown provider: ${provider as string}`);
}

/** Quick auth check — small prompt to verify the key actually works. */
export async function testKey(provider: LlmProvider, key: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    await analyzeOutcome(provider, key, {
      outcomeName: 'Test',
      sideName: 'Yes',
      description: 'Will the integer 2 be greater than 1?',
      currentPct: 50,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
