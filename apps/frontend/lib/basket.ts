// Phase K — basket bet state.
//
// A "basket" is a working list of outcome legs the user is preparing to bet
// on in a single HL multi-leg order. The list persists in localStorage so
// the user can curate a basket across page navigations / browser reloads.
//
// Design choices (see specs/.../contracts/basket-bet.md):
// - Cross-question: legs from different question pages may coexist.
// - Cap 20 legs (matches HL practical action limit; final cap re-tested K-5).
// - 7-day stale auto-purge on read.
// - Each leg owns its own USD amount; user can edit per-leg.

const STORAGE_KEY = 'hl-markets-basket';
const MAX_LEGS = 20;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface BasketLeg {
  /** Stable id within the basket (timestamp-random). */
  id: string;
  /** HL outcome id (e.g. 10249 for France). */
  outcomeId: number;
  /** 0 = Yes, 1 = No. */
  sideIdx: number;
  /** Cached display labels (refreshed on write). */
  outcomeName: string;
  sideName: string;
  /** Cached question label so the basket can group by question. */
  questionTitle?: string;
  /** USD amount the user intends to bet on this leg. */
  usdAmount: number;
  /** When the user added it. */
  addedAt: number;
}

interface StoredBasket {
  v: 1;
  legs: BasketLeg[];
}

function readRaw(): StoredBasket | null {
  if (typeof window === 'undefined') return null;
  try {
    const s = window.localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s) as StoredBasket;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.legs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRaw(b: StoredBasket): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* quota / blocked — best effort */
  }
}

/** Drop legs older than STALE_MS so a forgotten basket doesn't haunt the user. */
function pruneStale(legs: BasketLeg[]): BasketLeg[] {
  const cutoff = Date.now() - STALE_MS;
  return legs.filter((l) => l.addedAt >= cutoff);
}

/** Subscribers — components that want live updates. */
const subscribers = new Set<(legs: BasketLeg[]) => void>();
function emit(legs: BasketLeg[]): void {
  for (const fn of subscribers) fn(legs);
}

export function subscribeBasket(fn: (legs: BasketLeg[]) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Cross-tab sync — listen to storage events. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) emit(loadBasket());
  });
}

// ---- Public API ---------------------------------------------------------

export function loadBasket(): BasketLeg[] {
  const raw = readRaw();
  if (!raw) return [];
  const fresh = pruneStale(raw.legs);
  if (fresh.length !== raw.legs.length) {
    writeRaw({ v: 1, legs: fresh });
  }
  return fresh;
}

export function clearBasket(): void {
  writeRaw({ v: 1, legs: [] });
  emit([]);
}

/** Stable basket-leg key for dedup: (outcomeId, sideIdx). User can't have two
 *  legs on the same outcome-side; second add merges into existing. */
function legKey(outcomeId: number, sideIdx: number): string {
  return `${outcomeId}:${sideIdx}`;
}

export function addLeg(input: {
  outcomeId: number;
  sideIdx: number;
  outcomeName: string;
  sideName: string;
  questionTitle?: string;
  /** Defaults to $10 (HL minimum). User can edit in the sheet. */
  usdAmount?: number;
}): BasketLeg[] {
  const current = loadBasket();
  const key = legKey(input.outcomeId, input.sideIdx);
  const existingIdx = current.findIndex(
    (l) => legKey(l.outcomeId, l.sideIdx) === key,
  );
  if (existingIdx >= 0) {
    // Already in basket — refresh labels but keep usdAmount as-is.
    const cur = current[existingIdx]!;
    const updated: BasketLeg = {
      ...cur,
      outcomeName: input.outcomeName,
      sideName: input.sideName,
      questionTitle: input.questionTitle ?? cur.questionTitle,
    };
    const next = [...current];
    next[existingIdx] = updated;
    writeRaw({ v: 1, legs: next });
    emit(next);
    return next;
  }
  if (current.length >= MAX_LEGS) {
    throw new Error(`Basket full (max ${MAX_LEGS} legs).`);
  }
  const leg: BasketLeg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    outcomeId: input.outcomeId,
    sideIdx: input.sideIdx,
    outcomeName: input.outcomeName,
    sideName: input.sideName,
    questionTitle: input.questionTitle,
    usdAmount: input.usdAmount ?? 10,
    addedAt: Date.now(),
  };
  const next = [...current, leg];
  writeRaw({ v: 1, legs: next });
  emit(next);
  return next;
}

export function removeLeg(id: string): BasketLeg[] {
  const current = loadBasket();
  const next = current.filter((l) => l.id !== id);
  writeRaw({ v: 1, legs: next });
  emit(next);
  return next;
}

export function updateLegAmount(id: string, usdAmount: number): BasketLeg[] {
  const current = loadBasket();
  const next = current.map((l) => (l.id === id ? { ...l, usdAmount } : l));
  writeRaw({ v: 1, legs: next });
  emit(next);
  return next;
}

/** Convenience: is (outcomeId, sideIdx) currently in the basket? */
export function isInBasket(outcomeId: number, sideIdx: number): boolean {
  const key = legKey(outcomeId, sideIdx);
  return loadBasket().some((l) => legKey(l.outcomeId, l.sideIdx) === key);
}
