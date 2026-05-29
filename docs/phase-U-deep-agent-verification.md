# Phase U — Deep Agent testnet verification record

> 2026-05-29 · U-7 sanity check on testnet build (localhost:3000). 두 단계로
> 나눠 진행: (A) **deterministic path** (key 불필요) — Claude 가 직접 검증
> 완료, (B) **LLM path** (builnad key 필요) — manual UI click 으로 마무리.

---

## A. Deterministic path — ✅ 검증 완료

LLM key 없이 Phase U 의 dispatch + fetcher + schema 가 정상 작동하는지 확인.
Browser console (Claude in Chrome `javascript_tool`) 로 실 query.

### A.1 `categorize()` keyword classifier

| outcomeId | name | questionTitle | expected | got | pass |
|---|---|---|---|---|---|
| 10287 | `BTC ≥ $74,031` | `BTC price bucket` | crypto | crypto | ✅ |
| 825 | `BTC < $71,504` | `BTC price bucket · expires 2026-05-29 06:00 UTC` | crypto | crypto | ✅ |
| 823 | `USA` | `2026 World Cup champion` | sports | sports | ✅ |
| 999 | `Above 4.3%` | `May CPI year-over-year` | economics | economics | ✅ |
| 998 | `PSG` | `Champions League winner` | sports | sports | ✅ |

→ 5/5 pass. orchestrator 의 `categoryToSkill()` dispatch 가 BTC outcome 을
crypto skill 로 정확히 routing.

### A.2 CoinGecko fetcher (no-key)

`https://api.coingecko.com/api/v3/coins/bitcoin?market_data=true&…` 직접 호출:

```
spotUsd             73551
change24hPct        -1.64
change7dPct         -4.59
change30dPct        -3.36
marketCapBnUsd      1472.7
vol24hBnUsd         43.5
high24h             75237
low24h              72669
realizedVol24hPct   3.49      (← high-low range / spot)
target_threshold    74031     (outcome 10287 strike)
target_distance     -0.65%    (현재가가 strike 보다 0.65% 낮음, ~ ATM)
```

→ Phase U `fetchCryptoSignals()` 가 LLM 한테 enrich 해주는 모든 numeric
signal 이 정상 수신. BTC outcome 10287 의 시장가 50.0% 는 ATM (현재가
≈ strike). LLM 이 받아서 fairPct 를 50 근처 + medium confidence 정도로
return 할 것으로 예상.

### A.3 Tavily / FRED / football-data / OpenWeather

Optional fetchers — 각 key 가 set 됐을 때만 호출. 미설정 시 fetcher 가
`emptySignals()` 반환 → LLM 은 CoinGecko signal 만 받아 분석. degraded
quality 지만 fallback 정상 작동 (orchestrator 124-line note).

### A.4 `AnalystOutputSchema` (Zod)

```
fairPct       z.number().min(0).max(100)
confidence    'low' | 'med' | 'high'
reasoning     1..6 bullets, each ≤ 160 chars
caveat        ≤ 200 chars (optional)
sources       max 8, each {label, url?}
rawSignals    Record<string, number | string | boolean>
```

→ schema 정의 명확. LLM 이 JSON 으로 안 주거나 schema 어기면
`fallbackOutput()` 으로 graceful degrade. discovery loop 가 stall 하지 않음.

---

## B. LLM path — ⏸ builnad 진행 필요

LLM call 부분은 사용자 own key (constitution V: 서버는 key 안 보유) 라
Claude 가 자동으로 fire 불가. 다음 절차로 마무리:

### B.1 Settings 에서 key 입력 (한 번만)

`http://localhost:3000/settings` 접속 → 다음 중 1개 이상 입력:

- **OpenAI API key** (`sk-proj-…`) — model: `gpt-4o-mini`, ~$0.001/analysis
- **Anthropic API key** (`sk-ant-…`) — model: `claude-3-5-sonnet`, ~$0.01/analysis

선택사항 (있으면 reasoning 풍부해짐):

- **Tavily** (`tvly-…`) — 5 web hits / call, dev tier 무료
- **FRED** — CPI/Fed rate 같은 macro outcome enrich
- **football-data.org** — 스포츠 outcome enrich
- **OpenWeatherMap** — 날씨 outcome enrich

각 key 입력 → **Save** → **Test** 클릭해 "✓ verified" toast 확인.

### B.2 BTC outcome 으로 deep agent fire

Path 1 — **AI Discovery** 에서 deep agent path:

1. `/` 또는 `/discover` 진입
2. 자동입력된 example query 중 `Top 5 best risk/reward across all active markets` 클릭 (또는 직접 `BTC ATM outcome which side has edge` 입력)
3. **FIND OPPORTUNITIES** 클릭
4. AI 가 candidates harvest → enrichWithDeepAnalysts (deep agent N call) → ranking call → top-N 표시
5. 결과 list 에 BTC outcome (10287 또는 825) 이 들어오면 deep agent 가 fire 된 것

확인 포인트:
- ✅ result row 에 `[deep crypto · fair X.X% · {low|med|high} conf]` prefix
- ✅ reasoning bullet 1-6 개 (CoinGecko 숫자 참조해야 함, 예: "BTC is currently $73.5K, −1.6% 24h, sitting 0.65% below the $74K strike — implied vol 3.5% over 24h supports ~50% fair")
- ✅ sources 에 `CoinGecko` (+ Tavily set 했으면 web 출처 1-3)
- ✅ rawSignals 에 spotUsd / change24hPct / realizedVol24hPct 등

Path 2 — **개별 outcome 의 ✨ Analyze**:

⚠ `AIAnalyzePanel` 은 Phase M shallow analyzer (`analyzeOutcome`) 호출.
deep agent (orchestrator.ts) 아님. shallow 만 검증. 별도 task —
필요시 AIAnalyzePanel 도 deep agent 로 swap (T-X-100 후보).

### B.3 결과 capture + 이 문서에 append

Discovery 결과 list 의 BTC row 를 screenshot 으로 잡고 본 문서
`## C. Run output` 섹션에 reasoning bullet + fairPct + 사용된 sources 를
복사. 그러면 U-7 완전 close.

---

## C. Run output

> _(builnad 가 B.2 실행 후 이 섹션에 결과 첨부)_

```
date:       _____________
provider:   openai | anthropic
candidates: _____ outcomes harvested
deep:       _____ deep agent calls fired
top:        _____ outcomes shown

BTC outcome 10287 (or 825) result:
  fairPct:     _____ %
  confidence:  low | med | high
  reasoning:
    - _____
    - _____
    - _____
  sources:     _____
  rawSignals:  spotUsd=_____, change24hPct=_____, realizedVol24hPct=_____
```

---

## D. 변경 history

| 날짜 | 변경 |
|---|---|
| 2026-05-29 | A. deterministic path 검증 완료 (categorize 5/5, CoinGecko OK, schema OK). B/C 는 builnad 진행 대기. |
