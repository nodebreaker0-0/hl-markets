# AI Analyst — user-own-key LLM outcome 분석 spec

> Phase M — 사용자가 자기 OpenAI / Anthropic API key 를 입력해서, outcome 페이지
> 에서 1-click 으로 LLM 에게 "이 outcome 의 공정 확률은?" 을 물어보는 기능.
>
> Source: <https://platform.openai.com/docs/api-reference/chat>,
> <https://docs.anthropic.com/en/api/messages> (2026-05-27 fetched).
> 비교 대상: Polymarket 의 "Polymarket Insights" (서버 단 LLM, 광고형 코멘트) — 우리는
> 정반대로 **서버를 안 거치고 사용자가 자기 key 로 직접 호출**한다.
> Sibling: `agent.md` (Phase J.7 키 격리 모델), `basket-bet.md` (분석 결과로 leg 자동 pre-fill),
> `outcome-market.md` (LLM 에 먹일 outcome metadata 소스).

---

## §1. TL;DR

```
[ 사용자 ]
   │
   │ 1. /settings 에서 API key 입력 (OpenAI / Anthropic / Both)
   ▼
[ localStorage:hl-markets-llm-keys ]  ← plaintext, 서버 절대 안 거침
   │
   │ 2. outcome 페이지 진입
   ▼
[ SimpleTradeWidget ] [ AI Analyze ▸ ]   ← 보조 패널, 디폴트 collapsed
                              │
                              │ 3. 클릭
                              ▼
[ lib/llm.ts: analyzeOutcome(provider, key, prompt) ]
                              │
                              │ 4. 직접 fetch → api.openai.com / api.anthropic.com
                              │    (CSP connect-src 허용)
                              ▼
[ JSON 응답: { fairPct, confidence, reasoning[] } ]
                              │
                              ▼
[ 결과 카드 ] fair 62%  vs  current 53¢ │ Med │ 4 bullets
                              │
                              │ 5. "Bet on YES (suggested $X)" 클릭
                              ▼
[ SimpleTradeWidget 의 amount 칸 pre-fill ]   ← 사인은 사용자가 직접
```

핵심 단언:
1. **사용자 key 는 우리 백엔드를 통과하지 않는다.** 브라우저 → LLM provider 직결.
2. **LLM 추천은 단순 pre-fill 까지만.** 클릭/사인은 사용자 손가락이 한다 (Constitution 후보 XIV).
3. **provider 추상화 = 인터페이스 1 개.** OpenAI / Anthropic 동시 지원, 추후 Gemini / Mistral 도 같은 shape.

---

## §2. 사용자 흐름

### 2.1 Settings 페이지 신설 (`/settings`)

신규 라우트. 현재 hl-markets 에는 settings 페이지가 없음 (header 의 메뉴는 portfolio / connect / chat 뿐).
header dropdown 에 `⚙ Settings` 항목 추가.

```
/settings
┌─────────────────────────────────────────────────────────┐
│ Settings                                                │
├─────────────────────────────────────────────────────────┤
│ LLM Provider                                            │
│                                                         │
│ ( ) None   (•) OpenAI   ( ) Anthropic   ( ) Both        │
│                                                         │
│ OpenAI API key                                          │
│ [ sk-proj-•••••••••••••••••••••••••••• ]   [ Test ]    │
│ Status: ✓ verified · gpt-4o-mini default                │
│                                                         │
│ Anthropic API key                                       │
│ [                                       ]   [ Test ]    │
│ Status: not set                                         │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ ⚠ Privacy note                                          │
│ Your key is stored only in your browser (localStorage). │
│ It is never sent to hl-markets servers. Each "AI        │
│ Analyze" click calls OpenAI / Anthropic directly from   │
│ your browser, billing your own account.                 │
│                                                         │
│ [ Clear all LLM keys ]                                  │
└─────────────────────────────────────────────────────────┘
```

- provider 선택 = `none | openai | anthropic | both`.
  - `both` → outcome 페이지에서 사용자가 클릭 시 두 provider 응답 side-by-side.
  - `none` 일 때는 outcome 페이지의 `AI Analyze` 버튼 자체가 숨겨짐.
- `Test` 버튼:
  - OpenAI: `GET https://api.openai.com/v1/models` (싸고 빠른 ping).
  - Anthropic: `POST /v1/messages` 에 `model: claude-haiku, max_tokens: 1, content: "ping"` (Anthropic 은 GET 형 ping 없음 → minimal POST).
  - 응답 status 만 보고 ✓ / ✕. 응답 본문은 버림.
  - **Test 도 서버 안 거침.** 사용자 브라우저에서 직결 fetch.
- key 입력 칸은 type="password" + show/hide 토글.
- `Clear all LLM keys` → localStorage 의 `hl-markets-llm-keys` 삭제.

### 2.2 localStorage 스키마

key: `hl-markets-llm-keys`
value:
```jsonc
{
  "provider": "openai" | "anthropic" | "both" | "none",
  "openai":    { "key": "sk-...", "verifiedAt": 1748345600000 } | null,
  "anthropic": { "key": "sk-ant-...", "verifiedAt": 1748345600000 } | null,
  "updatedAt": 1748345600000
}
```

- plaintext 저장. (agent.md §3.2 의 결론과 동일 — AES 한 layer 는 obfuscation 일 뿐, 같은 origin JS 가 풀 수 있음.)
- `verifiedAt` 은 마지막 Test 통과 시각. UI 가 "verified" / "stale" / "not set" 표시 결정에 사용.

### 2.3 Outcome 페이지의 AI Analyze 진입점

기존 outcome 페이지 layout (`app/outcome/[symbol]/page.tsx`):
- 상단: outcome 카드 + 가격 + 만기.
- 중단: SimpleTradeWidget (BET 입력).
- 하단: chat + L2 + 최근 거래.

신규: SimpleTradeWidget **바로 옆 (데스크탑) / 바로 아래 (모바일)** 에 `AI Analyze` 보조 패널.

```
desktop (≥ 1024px):
┌──────────────────────────┐  ┌──────────────────────────┐
│ SimpleTradeWidget        │  │ AI Analyze ▸             │
│ Bet Yes  $ [ 50.00 ]     │  │ (collapsed by default)   │
│ → 166 shares             │  │                          │
│ [ BET ]                  │  │                          │
└──────────────────────────┘  └──────────────────────────┘

mobile (< 1024px):
┌──────────────────────────┐
│ SimpleTradeWidget        │
│ Bet Yes  $ [ 50.00 ]     │
│ [ BET ]                  │
└──────────────────────────┘
┌──────────────────────────┐
│ AI Analyze ▸             │
└──────────────────────────┘
```

- `none` provider → 패널 hide. Settings 로 가는 가벼운 inline 링크 ("Enable AI analysis →") 만 표시.
- `openai` / `anthropic` / `both` → `[ AI Analyze ]` 버튼.
- 버튼 클릭 → LLM 호출 시작, 패널이 expand 하면서 loading spinner.

---

## §3. 보안 모델

### 3.1 핵심 원칙

| 원칙 | 구현 |
|------|------|
| 사용자 key 는 우리 백엔드를 절대 거치지 않는다 | 모든 LLM 호출은 브라우저 → provider 직접 fetch. `/api/llm-*` 같은 우리 endpoint 없음. |
| key 는 사용자 브라우저에만 존재 | localStorage `hl-markets-llm-keys`. IndexedDB 대신 localStorage 인 이유: agent privkey 와 달리 사용자가 직접 입력한 값이라 export/copy 도 가능해야 함. |
| LLM 응답이 자동 거래를 트리거하지 않는다 | 분석 결과는 SimpleTradeWidget 의 amount 칸 pre-fill 까지만. BET 클릭과 agent 사인은 사용자 명시 액션. (Constitution XIV 후보) |
| LLM provider 외 third-party 에 key 가 노출되지 않는다 | CSP `connect-src` 를 화이트리스트로 좁힘 — 그 외 outbound 차단. |

### 3.2 CSP 영향

현재 (Constitution III + Phase J.6):
```
connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz
            wss://api.hyperliquid.xyz wss://api.hyperliquid-testnet.xyz;
```

Phase M 추가:
```
connect-src 'self'
            https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz
            wss://api.hyperliquid.xyz wss://api.hyperliquid-testnet.xyz
            https://api.openai.com
            https://api.anthropic.com;
```

- **only HTTPS 의 정확한 도메인.** wildcard 안 씀.
- Tavily 등 web-search 옵션은 §5.3 에서 별도 처리 (사용자 opt-in 시 dynamic 추가는 불가 — 미리 정적으로 추가하거나 미지원).

### 3.3 XSS 위협 모델

agent privkey 와 동일한 격을 갖는 secret. XSS 가 발생하면 leak.
방어선:
1. `script-src 'self'` (Constitution III) — third-party JS 차단.
2. 의존성 lockfile + `pnpm audit` (Constitution III) — supply chain 감사.
3. 사용자 입력 (chat message, outcome name 등) 은 React 의 자동 escape 에 의존. `dangerouslySetInnerHTML` 사용 금지.
4. Settings 페이지 입력 자체는 `<input type="password">` — 자동 capture 차단 (form autofill heuristic).

이건 HL agent privkey 가 받는 위협과 **동급**. 새로운 위협 추가 없음.

### 3.4 사용자 고지

Settings 페이지 + 첫 사용 시 한 번 띄우는 toast:

> "Your API key is stored only in your browser. hl-markets servers never see it.
> Each AI analysis call goes directly from your browser to OpenAI / Anthropic and
> is billed to your own account. Estimated cost per analysis: $0.005 ~ $0.03."

이 문구는 Settings 페이지에 영구 표시 + 첫 키 저장 직후 1 회 confirm 다이얼로그.

---

## §4. LLM provider 추상화

### 4.1 lib/llm.ts 인터페이스

```ts
// lib/llm.ts
export type LlmProvider = 'openai' | 'anthropic';

export interface AnalysisInput {
  outcome: {
    name: string;
    description?: string;
    sideSpecs?: string;       // governance.md 의 outcome side description
    expiresAt: number;        // unix ms
    currentYesAskCents: number;
    currentNoAskCents: number;
  };
  market: {
    candles6h: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
    recentFills?: Array<{ t: number; px: number; sz: number; side: 'B' | 'A' }>;
  };
  webContext?: string;         // §5.3 optional Tavily 결과
}

export interface AnalysisResult {
  fairPct: number;             // 0..100, fair probability YES resolves
  confidence: 'low' | 'med' | 'high';
  reasoning: string[];         // 3 ~ 6 bullets
  raw: string;                 // 디버깅용 원문
  provider: LlmProvider;
  modelId: string;
  costEstimateUsd: number;
  latencyMs: number;
}

export async function analyzeOutcome(
  provider: LlmProvider,
  apiKey: string,
  input: AnalysisInput,
  opts?: { signal?: AbortSignal; modelOverride?: string }
): Promise<AnalysisResult>;
```

- 단일 함수 시그니처. provider 분기 안에서 OpenAI / Anthropic 의 endpoint / headers / payload 차이를 흡수.
- `signal` 로 abort 지원 (사용자가 outcome 페이지 떠나면 fetch cancel).

### 4.2 OpenAI 구현

```http
POST https://api.openai.com/v1/chat/completions
Authorization: Bearer <key>
Content-Type: application/json

{
  "model": "gpt-4o-mini",
  "response_format": { "type": "json_schema",
                       "json_schema": { "name": "OutcomeAnalysis",
                                         "schema": { ...AnalysisResult JSON schema... },
                                         "strict": true } },
  "temperature": 0.3,
  "messages": [
    { "role": "system",  "content": SYSTEM_PROMPT },
    { "role": "user",    "content": USER_PROMPT(input) }
  ]
}
```

- **default model = `gpt-4o-mini`.** 빠르고 싸고 (1 call ≈ $0.001 ~ $0.005), JSON strict 지원.
- 사용자가 modelOverride 로 `gpt-4o` 또는 `gpt-4.1` 선택 가능 (Settings 의 옵션).
- `response_format.strict = true` → schema 위반 시 OpenAI 가 거부 → 우리 코드에서 try/catch + 재시도 1 회 (temperature 0).

### 4.3 Anthropic 구현

```http
POST https://api.anthropic.com/v1/messages
x-api-key: <key>
anthropic-version: 2023-06-01
content-type: application/json

{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "system": SYSTEM_PROMPT,
  "messages": [
    { "role": "user", "content": USER_PROMPT(input) + "\n\nRespond with ONLY a JSON object matching the schema." }
  ]
}
```

- **default model = `claude-sonnet-4-5`.** (haiku 는 reasoning quality 가 prediction market 분석에 부족 — 자체 평가에서 fairPct 변동성이 너무 큼.)
- Anthropic 은 `response_format` 같은 strict JSON 강제가 없음 → 응답을 우리가 파싱하면서 fallback 처리:
  1. 응답이 정상 JSON 인지 시도.
  2. 실패하면 ```json ... ``` 코드블록 추출.
  3. 그것도 실패하면 retry 1 회 (다음 turn 에 "Previous response was not valid JSON. Output ONLY the JSON object." 추가).
  4. 그래도 실패하면 UI 에 "AI response parsing failed" 표시 + raw 텍스트 보여줌.

### 4.4 prompt template

`lib/llm/prompts.ts`:

```ts
export const SYSTEM_PROMPT = `
You are a prediction-market analyst evaluating an outcome on Hyperliquid HIP-4
(Polymarket-style binary outcome). Your job is to estimate the FAIR probability
that this outcome resolves YES, independent of the current market price.

Output a JSON object:
{
  "fairPct":     number 0..100,           // your estimated YES probability
  "confidence":  "low" | "med" | "high",  // calibration on your estimate
  "reasoning":   string[]                 // 3-6 bullets, each <= 30 words
}

Rules:
- Do NOT echo the market price as the fair price. Your job is to disagree if warranted.
- "Confidence" should be "low" if you have no domain knowledge or context is sparse.
- Be honest about uncertainty. Outcome markets reward calibration, not bravado.
- Reasoning bullets must reference SPECIFIC facts (dates, prior probabilities, base rates).
- Never recommend a bet size or direction in the reasoning. The user decides.
`.trim();

export const USER_PROMPT = (input: AnalysisInput) => `
Outcome: ${input.outcome.name}
Description: ${input.outcome.description ?? '(none)'}
Side spec: ${input.outcome.sideSpecs ?? '(none)'}
Expires: ${new Date(input.outcome.expiresAt).toISOString()} (${daysUntil(input.outcome.expiresAt)}d)

Current market:
- YES ask: ${input.outcome.currentYesAskCents}¢
- NO ask:  ${input.outcome.currentNoAskCents}¢
- Implied YES probability: ${input.outcome.currentYesAskCents}%

Recent 6h candles (t,o,h,l,c,v):
${formatCandles(input.market.candles6h)}

${input.webContext ? `Web context:\n${input.webContext}\n` : ''}

Estimate the fair probability of YES resolution.
`.trim();
```

- system prompt 는 *outcome-시장 calibration* 을 핵심 가치로 둠. "추천 사이즈 출력 금지" 명시 — UI 의 "Bet on this" 는 우리 클라이언트가 *별도 계산* 으로 보여주는 것이지 LLM 출력이 아님.
- prompt 파일은 별도 모듈 — §9 Open question #3.

### 4.5 비용 표시

`lib/llm.ts` 안에 토큰 → 달러 추정 헬퍼:

| Model | $ / 1M input | $ / 1M output | Typical 1 analysis cost |
|-------|--------------|---------------|--------------------------|
| gpt-4o-mini | $0.15 | $0.60 | $0.001 ~ $0.002 |
| gpt-4o | $2.50 | $10.00 | $0.005 ~ $0.02 |
| gpt-4.1 | $2.00 | $8.00 | $0.004 ~ $0.015 |
| claude-sonnet-4-5 | $3.00 | $15.00 | $0.005 ~ $0.02 |
| claude-haiku-4 | $0.80 | $4.00 | $0.001 ~ $0.005 |

(2026-05 기준 가격, 실제 호출 시 `usage.input_tokens` / `usage.output_tokens` 로 정확 계산 → UI 의 결과 카드 우측 하단에 `~ $0.012` 표시.)

---

## §5. 데이터 컨텍스트 — LLM 에 무엇을 먹일 것인가

### 5.1 outcome 페이지에 이미 있는 데이터

| 출처 | 항목 | 비고 |
|------|------|------|
| `outcomeMeta` (backend GET /outcomes/:symbol) | name, description, sideSpecs, expiresAt, settle status | governance.md §2 의 outcome row |
| `useL2Book(symbol)` | best bid / ask (yes / no) | orderbook.ts |
| `useCandles(symbol, '6h', '5m')` | 최근 6h, 5m bucket → 72 봉 | 신규 hook 필요 (HL info `candleSnapshot`) |
| `useAllMids()` | 현재 mid price (sanity check) | 이미 portfolio 에서 사용 |
| `useRecentFills(symbol)` | 최근 24h fills (optional) | 신규 — 데이터 양 많으면 last 50 만 |

→ 이미 페이지가 갖고 있는 데이터를 그대로 `AnalysisInput` 으로 묶는다. 추가 API 호출 0 ~ 1.

### 5.2 컨텍스트 청크 사이즈 가이드

- outcome 설명: 그대로 (보통 300 ~ 800 자).
- candles 6h × 5m = 72 봉. 한 봉 ~ 30 토큰 → 약 2200 토큰.
- recentFills 50 개 × ~ 15 토큰 = 750 토큰.
- **총 input ≈ 3500 토큰.** gpt-4o-mini 기준 $0.0005, sonnet 기준 $0.010.

candles 6h 가 가장 무겁다. 만약 cost 가 부담되면:
- 첫 옵션: candles 를 5m → 30m 으로 다운샘플 (12 봉).
- 두 번째 옵션: candles 의 마지막 close 5 개 + 평균만 텍스트로 요약 → 100 토큰.

Phase M 첫 버전은 **5m × 72 봉 그대로**. 비용 부담 보고 Phase M.1 에서 조정.

### 5.3 Optional — web search 컨텍스트 (Tavily 등)

이건 §9 Open question #1 로 분리. 첫 버전에는 **미포함**.

만약 들어간다면:
- Settings 에 `Tavily API key` 칸 추가.
- `analyzeOutcome` 호출 전 `lib/llm/web-search.ts: searchTavily(outcome.name, 5 results) → string` 으로 컨텍스트 빌드.
- AnalysisInput 의 `webContext` 에 주입.
- CSP `connect-src` 에 `https://api.tavily.com` 추가.

→ Phase M 1차 버전은 web context **없이**, market data 만으로 분석. 보수적 시작.

---

## §6. UI 디자인

### 6.1 Outcome 페이지 통합 wireframe (desktop)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Back   France to win 2026 WC          Yes 30¢ / No 70¢     Expires Jul 15 │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ Chart 6h ▾ ]                                                                │
├─────────────────────────────────────────┬─────────────────────────────────────┤
│ SimpleTradeWidget                       │ AI Analyze              [ Analyze ] │
│                                         │ Provider: OpenAI (gpt-4o-mini)      │
│ Bet on  (•) Yes  ( ) No                 │                                     │
│ $ [ 50.00 ]                             │ ┌─────────────────────────────────┐ │
│ → 166 shares · win $166 if Yes          │ │ (collapsed)                     │ │
│ Fee: 0¢ (HIP-4 outcome — see J.5 note)  │ │                                 │ │
│                                         │ │ Click [ Analyze ] to get a fair │ │
│ [ BET ]                                 │ │ probability estimate using your │ │
│                                         │ │ own LLM key (~$0.002).          │ │
└─────────────────────────────────────────┴─────────────────────────────────────┘
```

### 6.2 Loading state

```
┌─────────────────────────────────────┐
│ AI Analyze                          │
│                                     │
│   ⟳ Calling gpt-4o-mini ...         │
│   Sent 3214 input tokens            │
│                                     │
│                       [ Cancel ]    │
└─────────────────────────────────────┘
```

`AbortController` 로 즉시 중단. cancel 후에는 기존 expand 상태로 복귀.

### 6.3 Result card

```
┌─────────────────────────────────────────────────────────────┐
│ AI Analyze                                                  │
│                                                             │
│   Fair YES probability                                      │
│      ╭─────────────╮                                        │
│      │     62%     │   vs current ask  30¢                  │
│      ╰─────────────╯                                        │
│                                                             │
│   Confidence: ●●○  Med                                      │
│                                                             │
│   Reasoning                                                 │
│   • France is current WC favorite per FIFA ranking (#2)     │
│   • Historical base rate of favorite winning: ~22%          │
│   • Mbappé fitness uncertain — flagged in 2026-05-20 news   │
│   • Market is wide (30¢ vs NO 70¢ implies 30% — 32pp gap)   │
│   • Group draw not announced yet, so adjust down            │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Suggested action (your call)                        │   │
│   │ [ Bet YES — pre-fill $50 ]   [ Bet NO — pre-fill ]  │   │
│   │ (No agent sign yet — uses your existing BET button) │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   Model: gpt-4o-mini · ~$0.0019 · 1.8s                      │
│                                              [ Re-analyze ] │
└─────────────────────────────────────────────────────────────┘
```

- 큰 fair % 숫자 + 현재 시장가 비교.
- confidence dot (3 단계) + 라벨.
- reasoning bullet (모델 출력 그대로, max 6).
- **Bet on this / against** 버튼은 **disabled-by-default 가 아니라 "pre-fill 동작만"** 명확화한 카피.
  - "Bet YES — pre-fill $50" 클릭 시:
    1. SimpleTradeWidget 의 side 를 YES 로.
    2. amount 칸을 50 (혹은 후술 §6.4 의 suggested size).
    3. **자동으로 BET 안 누름.** 사용자가 SimpleTradeWidget 의 BET 버튼을 직접 눌러야 사인.
  - 이 분리는 Constitution XIV 후보의 본문.
- "Re-analyze" 는 §9 Open question #2 의 캐시 정책에 따라 동작.

### 6.4 Suggested size 계산 (클라이언트 측 — LLM 안 부름)

`suggestedSize = round(userPortfolioCash * kelly_fraction, 2)`:
- `kelly_fraction = max(0, (fairPct/100 - askPx) / (1 - askPx))` × **0.25** (quarter Kelly, 보수적).
- userPortfolioCash 는 portfolio.ts 의 `clearinghouseState.crossMarginSummary.accountValue` 에서.
- 최소 $10 (HL min) 미달이면 $10.
- 사용자가 portfolio 연결 안 했으면 단순 $25 default.

→ **이 계산은 LLM 출력이 아니다.** 클라이언트의 결정. LLM 출력은 fairPct + reasoning 만. (안전 모델: LLM 이 size 를 좌우하지 않음.)

### 6.5 'both' provider 모드

`provider: 'both'` 일 때는 두 카드 side-by-side:

```
┌─────────────────────┐  ┌─────────────────────┐
│ OpenAI (gpt-4o-mini)│  │ Claude (sonnet-4-5) │
│ Fair 62%  Med       │  │ Fair 48%  High      │
│ • bullet ...        │  │ • bullet ...        │
│ ~$0.002             │  │ ~$0.011             │
└─────────────────────┘  └─────────────────────┘
```

- 두 모델 동시 호출 (Promise.all).
- 하나가 실패해도 다른 하나는 표시.
- "Bet on this" 버튼은 **각 카드마다** — 사용자가 어느 모델 의견을 채택할지 선택.

---

## §7. Constitution 영향

### 7.1 신규 조항 후보 XIV

> **XIV. LLM-driven advisory is strictly pre-fill, not auto-execute.**
> AI 분석 결과 (`fairPct`, `reasoning`) 는 SimpleTradeWidget 의 side / amount 칸을
> *채워주는 데 그친다*. BET 버튼 클릭 및 agent privkey 사인은 사용자 명시 액션이
> 있어야 한다. LLM 출력이 자동으로 사인 / submit 트리거하는 코드 경로는 금지.
>
> 본 조항은 Phase O (auto-bet) 에서 *명시적 opt-in + per-outcome rate limit + spend cap*
> 조건 하에 한해 완화될 수 있다. Phase O 이전에는 어떤 경우에도 자동 베팅 불가.

이 조항의 효과:
- code review 시 `analyzeOutcome().then(... placeMarketBuy(...))` 같은 자동 chain 금지.
- AI 분석 결과 카드의 버튼은 반드시 SimpleTradeWidget 의 입력 칸 변경에서 끝나야 함.

### 7.2 기존 조항과의 관계

- **Constitution III (CSP)**: §3.2 의 `connect-src` 화이트리스트 확장 필수.
- **Constitution VIII (network split build)**: testnet / mainnet 빌드 모두 동일 LLM 동작. LLM 호출은 HL network 와 무관 → 분기 없음.
- **Constitution XI (byte-for-byte L1 사인)**: LLM 분석은 사인 경로와 무관. 영향 없음.
- **Constitution XII (agent builder code)**: LLM 분석은 거래 사인 안 함. 영향 없음.

---

## §8. Task graph

| T# | Subject | Depends on |
|----|---------|------------|
| M-1 | `lib/llm.ts` — provider 추상화 + OpenAI + Anthropic 구현 + 비용 추정. unit test (mock fetch). | — |
| M-2 | `lib/llm/prompts.ts` — SYSTEM_PROMPT + USER_PROMPT(input). | — |
| M-3 | `lib/llm/storage.ts` — localStorage `hl-markets-llm-keys` CRUD + Test ping. | — |
| M-4 | `app/settings/page.tsx` — Settings 페이지 (provider 선택 + key 입력 + Test). | M-3 |
| M-5 | header dropdown 에 `⚙ Settings` 링크 추가. | M-4 |
| M-6 | `lib/llm/context.ts` — outcome 페이지 데이터 → `AnalysisInput` 변환 (candles / fills 포함). | — |
| M-7 | `components/AiAnalystPanel.tsx` — 결과 카드 + loading + cancel + re-analyze. | M-1, M-2, M-6 |
| M-8 | `app/outcome/[symbol]/page.tsx` 에 AiAnalystPanel 통합 (desktop 옆, 모바일 아래). | M-7 |
| M-9 | `next.config` / `_headers` 의 CSP `connect-src` 에 `api.openai.com`, `api.anthropic.com` 추가. | — |
| M-10 | suggested-size 계산 → SimpleTradeWidget pre-fill bridge (props/event). | M-7 |
| M-11 | "both" provider 모드 — side-by-side card. | M-7 |
| M-12 | testnet 검증 — gpt-4o-mini 1 회, sonnet 1 회, both 1 회, cancel 1 회, parsing 실패 retry 1 회. | all |
| M-13 | docs — `README.md` 의 Phase 표에 M 추가, `decisions/` 항목, Constitution XIV 후보 등재. | M-12 |

병렬:
- M-1 / M-2 / M-3 / M-6 / M-9 동시 진행 가능.
- M-4 / M-5 는 M-3 끝나면 시작.
- M-7 / M-8 / M-10 / M-11 은 M-1 + M-6 끝난 뒤 묶음.

---

## §9. Open questions

1. **Web search 컨텍스트 (Tavily 등) — 사용자가 또 key 등록해야 하나?**
   - 첫 안: **Phase M.1 으로 분리.** M 첫 버전은 market data only.
   - 만약 추가하면 Tavily / Perplexity 양자택일, 동일 BYOK 패턴. provider 선택 칸에 third option.
   - LLM 의 Function calling 으로 "search the web" tool 을 노출하는 방법도 있지만 (gpt-4o / sonnet 모두 지원), 그건 round-trip 비용 2배 → 신중.

2. **분석 캐시 정책 — 같은 outcome 1 분 내 재호출 시 LLM 안 부를지?**
   - 옵션 A: 캐시 없음, 매번 호출. (사용자 비용은 사용자 책임.)
   - 옵션 B: outcome × provider 키로 60s 캐시. "Re-analyze" 버튼 누르면 강제 무효화.
   - 옵션 C: localStorage 영구 캐시 (outcome × provider × hash(input)).
   - **잠정 결정: B.** 매 5m candle 업데이트 시 캐시 hit 미스 — 자연스럽게 1 시간 내 ~12 회 분석 가능. 비용 폭주 방지.

3. **Prompt template 어디서 관리?**
   - `lib/llm/prompts.ts` 에 hard-coded — 가장 단순.
   - 또는 `specs/001-hl-markets/prompts/` 폴더에 텍스트 파일로 두고 빌드 시 import — 운영자 입장에서 spec 과 prompt 가 한 곳에 모임.
   - **잠정 결정**: prompts.ts 에 두되, **상수 export 가 spec 의 §4.4 와 byte-equal** 한지 unit test 로 검증. spec 이 정답.

4. **OpenAI / Anthropic 외 provider (Gemini, Mistral, local Ollama) 지원 시점?**
   - 인터페이스는 이미 추상화. 추가 provider 는 `lib/llm/providers/<name>.ts` 한 파일.
   - 우선순위: Phase M.2 — Gemini (gemini-2.5-pro, JSON schema 지원). 그 다음 local Ollama (`http://localhost:11434`) — 단 CSP `connect-src` 가 localhost 면 prod 빌드에 어떻게 노출할지 결정 필요.

5. **AI 분석 후 사용자가 BET 안 누르고 떠나면 — 카드 상태 보존?**
   - 옵션 A: tab 전환 시 카드 유지 (in-memory state). 새로고침에는 사라짐.
   - 옵션 B: localStorage 에 outcome × provider × timestamp 로 24h 보존.
   - **잠정 결정: A.** 영구 보존은 stale 분석을 권위 있게 보여줘서 위험.

6. **테스트 시 실제 OpenAI / Anthropic 호출 비용 — CI 에서?**
   - unit test 는 fetch mock. CI 비용 0.
   - testnet 검증 (M-12) 만 사용자 (운영자) 가 자기 key 로 수동 실행. 1 라운드 ≈ $0.05 미만.

7. **`Test` 버튼이 모델 ID 자동 추론 — OpenAI 의 새 모델이 나오면 default 가 stale 됨**
   - 첫 안: 모델 ID 는 hard-code, 사용자가 Settings 에서 dropdown 으로 선택.
   - 미래: provider 의 `GET /v1/models` 응답에서 list 받아 dropdown 채움 (OpenAI 는 됨, Anthropic 은 list endpoint 없음 → hard-code 만 가능).

---

## §10. 비용 가이드 (사용자 공지용 카피)

Settings 페이지 하단에 영구 표시:

> **Cost guide (your own bill)**
> - gpt-4o-mini: $0.001 ~ $0.005 per analysis (recommended default)
> - gpt-4o:      $0.005 ~ $0.02
> - gpt-4.1:     $0.004 ~ $0.015
> - claude-haiku-4:    $0.001 ~ $0.005
> - claude-sonnet-4-5: $0.005 ~ $0.02
>
> Analyses are short (3-6 reasoning bullets, ~1024 max output tokens). Heavy
> users (50 analyses / day) at sonnet-4-5 = ~$1/day. Pricing as of 2026-05;
> check the provider's pricing page for current rates.

같은 문구의 축약본을 outcome 페이지의 AI Analyze 결과 카드 우측 하단에 모델별 1 줄로:
`gpt-4o-mini · ~$0.0019 · 1.8s`

---

다음 세션 시작 시: §9 Open question #1 (web search) 결정 보류 OK,
바로 M-1 (lib/llm.ts) + M-3 (storage) 부터 시작. M-9 (CSP) 는 PR 라스트 step.
