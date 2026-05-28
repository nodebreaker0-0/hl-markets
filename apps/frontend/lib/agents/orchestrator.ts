// Phase U — deep agent orchestrator.
//
// Public entrypoint: analyzeOutcomeDeep(candidate, keys) →
//   1. classify the candidate (categorize.ts, already there)
//   2. load the right SKILL.md
//   3. fetch domain RawSignals (no LLM call — pure data)
//   4. call the analyst LLM ONCE with:
//        system  = SKILL prompt
//        user    = outcome metadata + market price + RawSignals.blob
//        json    = strict (OpenAI) / fallback parse (Anthropic)
//   5. validate against AnalystOutputSchema → AnalystOutput
//   6. fold rawSignals.fields + sources into the returned object
//
// If any step fails, the function returns a minimal fallback object
// (fairPct = marketPct, low confidence) so the discovery loop doesn't
// stall on one bad candidate.

import { categorize } from '@/lib/categorize';
import type { LlmProvider } from '@/lib/llm-raw';
import { analyzeOpenAiRaw, analyzeAnthropicRaw } from '@/lib/llm-raw';
import { AnalystOutputSchema, type AnalystOutput } from '@/lib/agents/types';
import { loadSkill, type SkillName } from '@/lib/agents/skills';
import {
  fetchCryptoSignals,
  fetchSportsSignals,
  fetchMacroSignals,
  fetchPoliticsSignals,
  fetchWeatherSignals,
  type RawSignals,
} from '@/lib/agents/fetchers';
import type { Category } from '@/lib/categorize';

export interface DeepAgentKeys {
  provider: LlmProvider;
  llmKey: string;
  tavily?: string | null;
  footballData?: string | null;
  fred?: string | null;
  openweather?: string | null;
}

export interface DeepAgentInput {
  outcomeId: number;
  outcomeName: string;
  description: string;
  questionTitle?: string;
  marketPct: number;
}

function categoryToSkill(c: Category): SkillName | null {
  switch (c) {
    case 'crypto':    return 'crypto';
    case 'sports':    return 'sports';
    case 'economics': return 'macro';
    case 'politics':  return 'politics';
    case 'weather':   return 'weather';
    default:          return null;
  }
}

async function fetchRawSignals(
  skill: SkillName,
  input: DeepAgentInput,
  keys: DeepAgentKeys,
): Promise<RawSignals> {
  switch (skill) {
    case 'crypto':
      return fetchCryptoSignals(input.outcomeName, input.description, keys.tavily);
    case 'sports':
      return fetchSportsSignals(
        input.outcomeName,
        input.description,
        keys.footballData,
        keys.tavily,
      );
    case 'macro':
      return fetchMacroSignals(
        input.outcomeName,
        input.description,
        keys.fred,
        keys.tavily,
      );
    case 'politics':
      return fetchPoliticsSignals(input.outcomeName, input.description, keys.tavily);
    case 'weather':
      return fetchWeatherSignals(
        input.outcomeName,
        input.description,
        keys.openweather,
        keys.tavily,
      );
  }
}

function buildUserPrompt(input: DeepAgentInput, signals: RawSignals): string {
  const lines = [
    input.questionTitle ? `Question: ${input.questionTitle}` : null,
    `Outcome: ${input.outcomeName}`,
    '',
    'Resolver text:',
    input.description || '(no description provided)',
    '',
    `Market price (probability of YES): ${input.marketPct.toFixed(1)}%`,
    '',
  ];
  if (signals.blob && signals.blob.trim().length > 0) {
    lines.push('Live signals (cite these in your reasoning when used):');
    lines.push(signals.blob);
  } else {
    lines.push('No live signals were fetched for this outcome. Use LLM prior only.');
  }
  return lines.filter((l) => l !== null).join('\n');
}

function parseAnalystJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const m = /\{[\s\S]*\}/.exec(raw);
    if (m) return JSON.parse(m[0]);
    throw new Error('analyst: no JSON in response');
  }
}

/** Lower-confidence fallback when no LLM key, no skill applies, or the LLM
 *  call fails. We mirror the market price (no edge claimed). */
function fallbackOutput(marketPct: number, note: string): AnalystOutput {
  return {
    fairPct: marketPct,
    confidence: 'low',
    reasoning: [note],
    caveat: 'No deep analysis was performed for this candidate.',
    sources: [],
    rawSignals: {},
  };
}

export async function analyzeOutcomeDeep(
  input: DeepAgentInput,
  keys: DeepAgentKeys,
): Promise<AnalystOutput> {
  const cat = categorize(input.outcomeName, input.description, input.questionTitle);
  const skill = categoryToSkill(cat);
  if (!skill) {
    return fallbackOutput(input.marketPct, `Category "${cat}" has no specialist; market price stands.`);
  }

  const signals = await fetchRawSignals(skill, input, keys);
  const system = loadSkill(skill);
  const user = buildUserPrompt(input, signals);

  let raw: string;
  try {
    if (keys.provider === 'openai') {
      raw = await analyzeOpenAiRaw(keys.llmKey, system, user, true);
    } else {
      raw = await analyzeAnthropicRaw(keys.llmKey, system, user);
    }
  } catch (e) {
    return fallbackOutput(input.marketPct, `LLM call failed (${(e as Error).message}).`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = parseAnalystJson(raw);
  } catch {
    return fallbackOutput(input.marketPct, `LLM returned non-JSON. raw start: "${raw.slice(0, 60)}…"`);
  }
  const safe = AnalystOutputSchema.safeParse(parsedJson);
  if (!safe.success) {
    return fallbackOutput(input.marketPct, `LLM JSON failed schema (${safe.error.issues[0]?.message ?? '?'}).`);
  }

  // Fold our fetcher-derived sources + numeric signals INTO the result so
  // every cited source has a real URL and downstream UI can render facts.
  return {
    ...safe.data,
    sources: [...safe.data.sources, ...signals.sources].slice(0, 8),
    rawSignals: { ...safe.data.rawSignals, ...signals.fields },
  };
}
