// Phase O — Auto-bet rule engine.
//
// Strong opt-in. Without explicit `enabled=true` AND budget caps set, the
// scanner is inert. Even when enabled, every cycle re-checks the user's
// spend caps and the emergency-stop flag before signing anything.
//
// State lives in localStorage so refreshing the tab keeps progress; we do
// NOT persist any LLM analysis cache here (Phase M owns that).

import { placeMarketBuy } from '@/lib/trade';
import {
  analyzeOutcome,
  loadKeys,
  type AnalysisResult,
} from '@/lib/llm';
import { searchTavily, formatSearchBlob } from '@/lib/search';
import {
  fetchAllMids,
  fetchL2Book,
  fetchOutcomeMeta,
  outcomeAssetKey,
  type OutcomeQuestion,
  type OutcomeMetaResponse,
} from '@/lib/api';
import { outcomeAssetId } from '@/lib/asset-id';
import { CURRENT_NETWORK } from '@/lib/network';
import { pushToast } from '@/lib/toast';

const STORAGE_KEY = 'hl-markets-autobet';

export interface AutobetConfig {
  enabled: boolean;
  /** Max USD/day across all auto-bets. */
  dailyBudgetUsd: number;
  /** Max USD per single auto-bet (per leg). */
  perBetMaxUsd: number;
  /** Minimum edge (LLM fairPct − marketPct) in percentage points. e.g. 5
   *  means we only bet when AI thinks the market is at least 5pp off. */
  minEdgePp: number;
  /** Minimum LLM confidence to act on. */
  minConfidence: 'low' | 'medium' | 'high';
  /** Substrings (case-insensitive) we whitelist for the question name. */
  categoryAllow: string[];
  /** Substrings we hard-block — never bet on these questions. */
  categoryBlock: string[];
}

export interface AutobetState {
  /** Date string (YYYY-MM-DD) — resets `todaySpentUsd` on new day. */
  todayDate: string;
  todaySpentUsd: number;
  lastRunAt: number;
  recentBets: AutobetRecord[];
}

export interface AutobetRecord {
  ts: number;
  outcomeName: string;
  questionTitle: string;
  spendUsd: number;
  edgePp: number;
  oid: number | null;
  status: 'filled' | 'rejected' | 'error';
  detail?: string;
}

const DEFAULT_CONFIG: AutobetConfig = {
  enabled: false,
  dailyBudgetUsd: 100,
  perBetMaxUsd: 20,
  minEdgePp: 8,
  minConfidence: 'medium',
  categoryAllow: [],
  categoryBlock: ['election', 'death', 'assassination'],
};

const DEFAULT_STATE: AutobetState = {
  todayDate: todayKey(),
  todaySpentUsd: 0,
  lastRunAt: 0,
  recentBets: [],
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Stored {
  config: AutobetConfig;
  state: AutobetState;
}

export function loadAutobet(): Stored {
  if (typeof window === 'undefined')
    return { config: { ...DEFAULT_CONFIG }, state: { ...DEFAULT_STATE } };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { config: { ...DEFAULT_CONFIG }, state: { ...DEFAULT_STATE } };
    const parsed = JSON.parse(raw) as Stored;
    const cfg: AutobetConfig = { ...DEFAULT_CONFIG, ...(parsed.config ?? {}) };
    const st: AutobetState = { ...DEFAULT_STATE, ...(parsed.state ?? {}) };
    // Daily reset
    if (st.todayDate !== todayKey()) {
      st.todayDate = todayKey();
      st.todaySpentUsd = 0;
    }
    return { config: cfg, state: st };
  } catch {
    return { config: { ...DEFAULT_CONFIG }, state: { ...DEFAULT_STATE } };
  }
}

export function saveAutobet(s: Stored): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function emergencyStop(): void {
  const s = loadAutobet();
  s.config.enabled = false;
  saveAutobet(s);
  pushToast({ tone: 'info', message: 'Auto-bet disabled', detail: 'Emergency stop' });
}

// ---- Helpers ------------------------------------------------------------

function confidenceRank(c: 'low' | 'medium' | 'high'): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

function questionAllowed(q: OutcomeQuestion, cfg: AutobetConfig): boolean {
  const name = q.name.toLowerCase();
  if (cfg.categoryBlock.some((b) => b && name.includes(b.toLowerCase()))) return false;
  if (cfg.categoryAllow.length === 0) return true;
  return cfg.categoryAllow.some((a) => name.includes(a.toLowerCase()));
}

interface ScanCandidate {
  question: OutcomeQuestion;
  outcomeId: number;
  outcomeName: string;
  description: string;
  marketPct: number;
}

async function gatherCandidates(
  meta: OutcomeMetaResponse,
  cfg: AutobetConfig,
  maxCandidates: number,
): Promise<ScanCandidate[]> {
  const mids = await fetchAllMids(CURRENT_NETWORK);
  const out: ScanCandidate[] = [];
  for (const q of meta.questions) {
    if (q.settledNamedOutcomes.length > 0) continue;
    if (!questionAllowed(q, cfg)) continue;
    for (const oid of q.namedOutcomes) {
      const o = meta.outcomes.find((x) => x.outcome === oid);
      if (!o) continue;
      const key = outcomeAssetKey(oid, 0);
      const mid = mids[key];
      if (mid === undefined) continue;
      const m = Number(mid);
      // Skip outcomes already extremely confident — small edge unlikely.
      if (m < 0.05 || m > 0.95) continue;
      out.push({
        question: q,
        outcomeId: oid,
        outcomeName: o.name,
        description: o.description ?? '',
        marketPct: m * 100,
      });
    }
  }
  // Sample-shuffle to spread across question categories.
  out.sort(() => Math.random() - 0.5);
  return out.slice(0, maxCandidates);
}

async function bookSummary(
  outcomeId: number,
): Promise<{ ask: number; bid: number; askSz: number; asks: { px: number; sz: number }[] } | null> {
  try {
    const key = outcomeAssetKey(outcomeId, 0);
    const book = await fetchL2Book(CURRENT_NETWORK, key);
    const ask = book.levels?.[1]?.[0];
    const bid = book.levels?.[0]?.[0];
    if (!ask || !bid) return null;
    return {
      ask: Number(ask.px),
      askSz: Number(ask.sz),
      bid: Number(bid.px),
      asks: (book.levels?.[1] ?? []).map((l) => ({ px: Number(l.px), sz: Number(l.sz) })),
    };
  } catch {
    return null;
  }
}

// ---- Public scanner -----------------------------------------------------

export interface ScanResult {
  ran: boolean;
  reason?: string;
  betsPlaced: number;
  candidatesEvaluated: number;
}

export async function runAutobetTick(args: {
  address: `0x${string}`;
}): Promise<ScanResult> {
  const stored = loadAutobet();
  const cfg = stored.config;
  const st = stored.state;

  if (!cfg.enabled) return { ran: false, reason: 'disabled', betsPlaced: 0, candidatesEvaluated: 0 };
  if (st.todaySpentUsd >= cfg.dailyBudgetUsd) {
    return {
      ran: false,
      reason: `daily cap $${cfg.dailyBudgetUsd} reached`,
      betsPlaced: 0,
      candidatesEvaluated: 0,
    };
  }

  const keys = loadKeys();
  const provider = keys.preferred;
  const llmKey = provider === 'openai' ? keys.openai : provider === 'anthropic' ? keys.anthropic : null;
  if (!provider || !llmKey) {
    return { ran: false, reason: 'no LLM key', betsPlaced: 0, candidatesEvaluated: 0 };
  }

  const meta = await fetchOutcomeMeta(CURRENT_NETWORK);
  const candidates = await gatherCandidates(meta, cfg, 5);
  let placed = 0;

  for (const c of candidates) {
    // Pre-bet recheck of caps (state may have updated mid-loop).
    const remaining = cfg.dailyBudgetUsd - st.todaySpentUsd;
    if (remaining < 10) break; // can't satisfy HL $10 floor
    const spendCap = Math.min(cfg.perBetMaxUsd, remaining);

    let book: Awaited<ReturnType<typeof bookSummary>> = null;
    try {
      book = await bookSummary(c.outcomeId);
    } catch {
      /* skip */
    }
    if (!book) continue;

    // Tavily search context if available
    let webContext: string | undefined;
    if (keys.tavily) {
      try {
        const hits = await searchTavily(
          keys.tavily,
          `${c.question.name} ${c.outcomeName} odds news`,
          4,
        );
        webContext = formatSearchBlob(hits);
      } catch {
        /* skip */
      }
    }

    let analysis: AnalysisResult;
    try {
      analysis = await analyzeOutcome(provider, llmKey, {
        outcomeName: c.outcomeName,
        sideName: 'Yes',
        description: c.description,
        currentPct: c.marketPct,
        questionTitle: c.question.name,
        bookSummary: `ask ${(book.ask * 100).toFixed(1)}% × ${book.askSz} · bid ${(book.bid * 100).toFixed(1)}%`,
        webContext,
      });
    } catch (e) {
      st.recentBets.unshift({
        ts: Date.now(),
        outcomeName: c.outcomeName,
        questionTitle: c.question.name,
        spendUsd: 0,
        edgePp: 0,
        oid: null,
        status: 'error',
        detail: (e as Error).message.slice(0, 120),
      });
      continue;
    }

    const edgePp = analysis.fairPct - c.marketPct;
    if (edgePp < cfg.minEdgePp) continue;
    if (confidenceRank(analysis.confidence) < confidenceRank(cfg.minConfidence)) continue;

    // Place market buy at spendCap.
    try {
      const r = await placeMarketBuy({
        address: args.address,
        assetId: outcomeAssetId(c.outcomeId, 0),
        usdAmount: spendCap,
        bestAskPx: book.ask,
        bestAskSz: book.askSz,
        bestBidPx: book.bid,
        asks: book.asks,
      });
      const resp = r as { response?: { data?: { statuses?: Array<{ filled?: { oid?: number; totalSz?: string; avgPx?: string }; error?: string }> } } };
      const status = resp?.response?.data?.statuses?.[0];
      if (status?.filled) {
        const spend = Number(status.filled.totalSz) * Number(status.filled.avgPx);
        st.todaySpentUsd += spend;
        st.recentBets.unshift({
          ts: Date.now(),
          outcomeName: c.outcomeName,
          questionTitle: c.question.name,
          spendUsd: spend,
          edgePp,
          oid: status.filled.oid ?? null,
          status: 'filled',
        });
        placed += 1;
        pushToast({
          tone: 'success',
          message: `Auto-bet · ${c.outcomeName}`,
          detail: `${edgePp.toFixed(1)}pp edge · $${spend.toFixed(2)} · OID ${status.filled.oid}`,
          ttlMs: 5500,
        });
      } else if (status?.error) {
        st.recentBets.unshift({
          ts: Date.now(),
          outcomeName: c.outcomeName,
          questionTitle: c.question.name,
          spendUsd: 0,
          edgePp,
          oid: null,
          status: 'rejected',
          detail: status.error.slice(0, 120),
        });
      }
    } catch (e) {
      st.recentBets.unshift({
        ts: Date.now(),
        outcomeName: c.outcomeName,
        questionTitle: c.question.name,
        spendUsd: 0,
        edgePp,
        oid: null,
        status: 'error',
        detail: (e as Error).message.slice(0, 120),
      });
    }

    // Keep last 30 records max.
    if (st.recentBets.length > 30) st.recentBets.length = 30;
  }

  st.lastRunAt = Date.now();
  saveAutobet({ config: cfg, state: st });
  return { ran: true, betsPlaced: placed, candidatesEvaluated: candidates.length };
}
