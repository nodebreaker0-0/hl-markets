# AI Discovery — Cross-Market Ranking (Phase S/T/U)

> 사용자가 자연어 query (또는 빈 query, auto-explore) 를 보내면 모든 active
> outcome 중 best expected-value bets 의 mixed-domain ranking list 를 반환.
> Browser-only, 사용자 자신의 LLM key + domain API key 로 실행.
>
> Three-phase evolution:
> - Phase S: 단일 LLM call 로 모든 candidate 보고 ranking.
> - Phase T: candidate 마다 light Tier-2 신호 attach (CoinGecko, FRED, Tavily 한 줄).
> - Phase U: top N (12) candidate 에만 deep-agent 단일 LLM 분석을 더 붙이고, 최종 ranking 에 그 분석 결과를 candidate row 에 포함.

---

## 1. Pipeline

```
fetchActiveCandidates(network)
    ↓
candidates: CompactCandidate[]   (1% < price < 99%)
    ↓
enrichWithSpecialists(candidates, keys)        ← Phase T
    ↓                                            (parallel, best-effort)
candidates with .specialistBlob
    ↓
enrichWithDeepAnalysts(candidates, keys, max=6) ← Phase U
    ↓                                            (top 12 만, parallel 6)
candidates with .deep   (AnalystOutput)
    ↓
askLlmDiscover({provider, key, query, candidates, topK=6})
    ↓
DiscoveryRecommendation[]   ({outcomeId, outcomeName, marketPct, fairPct, edgePp, confidence, reasoning, suggestedUsd})
    ↓
quarterKellyUsd(rec, freeUsdc) → suggestedUsd  ← Kelly 1/4 cap
    ↓
UI: <AIDiscovery> result list, each row "Add to basket"
```

---

## 2. Module: `lib/discovery.ts`

### 2.1 `CompactCandidate`

```ts
interface CompactCandidate {
  outcomeId: number;
  sideIdx: 0;   // 우리는 YES side 만 ranking — NO side 는 1-YES_marketPct 로 대칭 계산
  outcomeName: string;
  questionTitle: string;
  description: string;
  marketPct: number;       // 0-100, allMids 의 mid × 100
  questionSumPct: number;  // sanity: multi-option 의 sum (이상치 detect)
  expiresHint?: string;    // 만료 force-extract 결과
  category?: Category;     // Phase T
  specialistBlob?: SpecialistBlob | null;   // Phase T
  deep?: AnalystOutput | null;              // Phase U
}
```

### 2.2 `fetchActiveCandidates(network)`

- `outcomeMeta` 와 `allMids` 동시 fetch.
- `meta.questions` 순회. settled question 제외 (`settledNamedOutcomes.length > 0` 인 거).
- 각 question 의 `namedOutcomes` 의 mid 합산 → `questionSumPct` 계산 (다른 candidate 에 attach).
- 각 outcome 의 price 가 `1 < pct < 99` 일 때만 push (extreme 은 edge 0).
- 카테고리 분류 (Phase T 의 `categorize`) — Tier-3 fetcher routing 용.

returns `{meta, candidates}`.

### 2.3 `enrichWithSpecialists(candidates, keys)` (Phase T)

- 각 candidate parallel `specialistFor(category, name, description, keys)` 호출.
- specialist 가 도메인 API (CoinGecko, FRED, football-data, OpenWeatherMap, Tavily) 호출 → `{source, text}` light blob 반환.
- 실패 / no key → blob 없이 통과. 절대 throw 0.

### 2.4 `enrichWithDeepAnalysts(candidates, keys, maxConcurrent=6)` (Phase U)

- top N (caller 가 N=12 으로 자름) candidate 만 `analyzeOutcomeDeep` 호출.
- in-flight 6 까지만 동시 진행 (LLM provider rate limit 보호).
- 각 candidate 의 result = `AnalystOutput | null`. null = fallback (orchestrator 가 marketPct = fairPct 반환).
- 실패해도 다른 candidate progress 정상.

### 2.5 `buildDiscoveryPrompt({query, candidates, topK})`

- **System prompt**: "prediction-market analyst" 역할, "mixed-domain ranking" 명시, JSON output schema 강제, candidate list 외 새 outcome 만들지 말 것, bet size 추천 금지 (Constitution XIV — sizing 은 quarterKellyUsd 에서).
- **User prompt**:
  ```
  User instruction:
  {query 또는 "Find best bets across all categories"}

  Candidates ({n}):
  {oid}\t{questionTitle}\t{outcomeName}\t{marketPct}%\t{questionSumPct}%\t{description180}\t[live ...] or [deep ...]
  ...
  ```
- candidate 의 deep blob 우선, 없으면 specialist blob, 없으면 base.
- 각 line 700 char 이하로 truncate (token 절약).

### 2.6 `askLlmDiscover({provider, key, query, candidates, topK})`

- `analyzeOpenAiRaw(key, system, user, jsonMode=true)` 또는 `analyzeAnthropicRaw(key, system, user)` 호출.
- response = JSON `{picks: [{outcomeId, fairPct, edgePp, confidence, reasoning}]}`.
- **Sanitize**:
  - `outcomeId` 가 candidate list 에 있는 것만 keep (hallucination 차단).
  - `fairPct` clamp 0-100.
  - `confidence` clamp 1-5.
  - `reasoning` 220 char truncate.
- returns `DiscoveryRecommendation[]` — `suggestedUsd` 는 caller 가 quarterKelly 로 채움.

### 2.7 `quarterKellyUsd({marketPct, fairPct, freeUsdc})`

- Kelly fraction `f = (b·p - q) / b` 에서 `p = fairPct/100`, `q = 1-p`, `b = (1-price)/price`.
- f ≤ 0 → 0 반환.
- USD = `f × freeUsdc / 4` (quarter-Kelly, 안전 margin).
- 단일 bet cap = freeUsdc × 10%.
- min $10 미만 → 0.
- round to cent.

---

## 3. Component: `<AIDiscovery>`

### 3.1 UI

- **Query input** — placeholder "World Cup top 5 ROI" / "ending soon mispriced" / "70%+ confidence under 50¢" 등.
- **Discover 버튼** + **Auto-explore 토글** (default ON).
- **Result list**:
  - row: `{outcomeName} ({questionTitle})` + `marketPct → fairPct` bar + `edge` badge (green if + / red if −) + `confidence ★★★☆☆` + `reasoning` (1-line, expandable) + `sources` (cited URLs) + "Add to basket ($X)".
  - Add to basket → BasketSheet 에 leg + quarter-Kelly 사이즈 채움.
- **Pipeline status** — light specialist fetch → deep agent 진행률 → final rank.

### 3.2 Caching

- localStorage `hl-markets:discovery-cache-v1` 에 `{network, query, candidates, recs, fetchedAt}` 저장.
- 1시간 TTL. expired 시 자동 재실행 (auto-explore mode).
- query 가 바뀌면 cache miss, deep-agent 단계만 새 실행 (specialist blob 은 candidate 별 cache 가능).

### 3.3 Auto-explore mode

- 탭 첫 진입 시 빈 query 로 pipeline 자동 실행.
- 사용자가 query 입력하면 즉시 새 실행.
- 결과 0건 ("no edge found") 인 경우 — "AI couldn't find clear edge right now" 텍스트 표시 (Constitution XIV — 억지 추천 X).

---

## 4. Cost / Performance

### 4.1 LLM token math

- Candidate 1개 = ~70 tokens (oid + name + question + price + 180-char description + specialist 200-char blob + deep 700-char blob).
- 200 candidates × 70 = 14k tokens user side + ~500 tokens system + ~500 response = ~15k total.
- gpt-4o-mini: $0.15 / 1M input, $0.60 / 1M output → discovery 1회 **~$0.003**.
- Anthropic Haiku 3.5: $0.80 / 1M input, $4 / 1M output → discovery 1회 **~$0.015**.

### 4.2 Deep agent cost (Phase U)

- 1 candidate = ~2k token input + ~500 output = ~2.5k total.
- gpt-4o-mini × 12 candidate = ~30k token → **~$0.005**.
- 결국 discovery 1회 ≈ $0.01 미만 (top 12 deep + final rank 포함).

### 4.3 Latency

- fetchActiveCandidates: ~500ms (HF 2 endpoint).
- enrichWithSpecialists: 200ms ~ 2s (외부 API parallel).
- enrichWithDeepAnalysts: 8s ~ 25s (LLM 12회, in-flight 6).
- askLlmDiscover: 5s ~ 12s.
- **Total**: 15s ~ 40s.
- 사용자에게는 progress bar 로 단계 표시.

---

## 5. Constitution alignment

- **I**. LLM key 가 backend 통과 0. browser fetch 가 provider host 로 직접.
- **XIV**. AI advisory only — discovery 가 "Add to basket" 만 가능, 자동 매수 X (그건 autobet path).
- **XV**. fetcher 결과는 schema parse 후 UI render. timeout / 실패 silent fallback.

---

## 6. Open items

- LLM provider 추가 (Bedrock / Gemini / Mistral) — Phase Q 의 multi-provider 패턴 확장.
- specialist 추가 (election results / sports live score API 등) — Phase T 의 `specialistFor` switch 확장.
- Discovery 결과의 "Why" 가 cited source 의 schema 변화 없이 그대로 render 되는지 — Constitution XV 정기 audit.
- deep agent N (현재 12) tuning — discovery quality vs LLM cost trade-off 관찰 후 조정.
- auto-execute (basket 에 추가 후 1-click "Buy all" 단축) — Constitution XIV 와의 정합 검토 필요. 일단 manual confirm 유지.
