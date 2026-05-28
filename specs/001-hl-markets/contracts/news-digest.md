# News Digest Agent — daily proactive outcome impact spec

> **⚠️ DEPRECATED (2026-05-28)**: The "daily news digest" model was superseded
> by the on-demand AI Discovery pipeline (Phase S/T/U). Discovery does the
> same job — outcome × news × LLM ranking — but: (a) runs when the user asks
> rather than on a cron, (b) is sandboxed in the browser with the user's own
> key (no backend cron storing news), and (c) integrates domain specialists
> (Tier-3 signals) for a stronger signal than headline-only digests. See
> `contracts/discovery.md` and `contracts/deep-agents.md` for the active
> spec. This document is kept for historical context only.

> Phase R (originally proposed) — 매일 정해진 시각에 cron 이 active outcome 50 ~ 100 개 + 최근 24h 뉴스
> 헤드라인을 LLM 에 batch 입력해서 outcome 별 "영향 정도 / 방향 / 1-줄 reasoning" 을
> 산출하고, 사용자에게 banner / sidebar / 메일로 노출한다.
>
> Source: <https://docs.tavily.com/docs/welcome>, <https://newsapi.org/docs>,
> <https://platform.openai.com/docs/api-reference/chat>,
> <https://docs.anthropic.com/en/api/messages>,
> <https://github.com/node-cron/node-cron> (2026-05-27 fetched).
> 비교 대상: Polymarket 의 daily newsletter (서버측 큐레이션 + 광고형 문구) — 우리는
> *사용자 own key + 사용자 own outcome 관심사*. Kalshi 의 "What moved markets" 일일
> 요약은 가격 변동 기반이지 뉴스 기반이 아님 — 우리는 **뉴스 → 가격 사전 예측** 방향.
> Sibling: `ai-analyst.md` (Phase M — 사용자가 직접 outcome 1 개를 분석. 본 Phase R 은
> 그 위에 daily proactive layer), `agent.md` (key 격리 — R 은 사용자 LLM key 를
> backend cron 에 위탁해야 하므로 다른 모델), `outcome-market.md` (LLM 에 먹일 outcome
> metadata), `basket-bet.md` (digest 카드 → basket 으로 leg 자동 추가).

---

## §1. TL;DR

```
[ node-cron 09:00 KST ]
        │
        │ 1. user loop (digest-enabled users)
        ▼
[ news fetch ]  Tavily / NewsAPI / RSS  →  최근 24h 헤드라인 100 개
        │
        │ 2. outcome 큐레이션
        ▼
[ active outcomes ]  50 ~ 100 개  (sorted by user watchlist / volume)
        │
        │ 3. batch
        ▼
[ K=5 outcome × N=20 headline ]  →  20 LLM call (사용자 own key)
        │
        │ 4. parse → store
        ▼
[ DB: news_digest(user_id, generated_at, results[] JSON) ]
        │
        │ 5. notify
        ▼
[ banner / /digest page / email ]   "📈 3 strong, 5 weak impacts today"
```

핵심 단언:
1. **Phase M 의 BYOK 모델을 backend 로 확장.** 사용자가 명시적으로 "daily digest" 를 옵트인하면 LLM key 가 backend DB 에 저장됨 — Phase M (브라우저-only) 와 격이 다른 신뢰 모델 → §7 의 별도 고지.
2. **outcome × news 매트릭스를 batch.** K=5 × N=20 이 token cap + cost sweet spot. outcome 100 개 → 20 call ≈ $0.10/user/day.
3. **digest 는 advisory.** 카드의 CTA 는 Phase M / Basket 으로 deep-link 만 — 자동 베팅 절대 없음 (Constitution XIV 후보 그대로 유효).

---

## §2. 사용자 흐름

### 2.1 Settings 페이지 확장 (`/settings` — Phase M 에 추가)

```
/settings (existing Phase M section 아래)
┌──────────────────────────────────────────────────────────┐
│ Daily News Digest                              [ on ●○ ] │
├──────────────────────────────────────────────────────────┤
│ Run time      [ 09:00 ] [ Asia/Seoul ▾ ]                 │
│ News source   (•) Tavily   ( ) NewsAPI   ( ) RSS only    │
│ Tavily key    [ tvly-•••••••••••••• ] [ Test ]           │
│ Outcome scope (•) All active                             │
│                ( ) Watchlist only ( 12 outcomes )        │
│                ( ) Top 50 by volume                      │
│                                                          │
│ ⚠ Privacy note                                           │
│ Daily digest requires storing your LLM key on hl-markets │
│ servers (encrypted) so the cron can call OpenAI /        │
│ Anthropic on your behalf at the scheduled time. This is  │
│ different from "AI Analyze" which runs only in your      │
│ browser. Toggle off to delete the stored copy.           │
│                                                          │
│ Yesterday's spend: $0.08 (17 outcomes analyzed)          │
│ [ View digest history ]                                  │
└──────────────────────────────────────────────────────────┘
```

- 토글 ON 시 **명시적 confirm 다이얼로그**: "Your LLM API key will be stored on our servers (encrypted at rest) to enable daily digests. Continue?"
- 토글 OFF → backend DB 에서 즉시 key + 미생성 digest 삭제 (soft delete 아님, hard delete).
- run time 은 IANA timezone + HH:MM. 사용자별 다른 cron expression 으로 변환.

### 2.2 Digest 결과 노출 (3 surface)

**(a) /digest 페이지 신규**

```
/digest
┌────────────────────────────────────────────────────────────────────┐
│ Today's News Digest                           2026-05-27 09:00 KST │
│ Source: Tavily · Model: gpt-4o-mini · Cost: $0.08 · 17/63 impacted │
├────────────────────────────────────────────────────────────────────┤
│ 📈 Strong YES impact (3)                                            │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ France to win 2026 WC               YES 30¢ → fair 62% (M est) │ │
│ │ 📈 France beat Germany 3-1 in friendly — Mbappé scored twice    │ │
│ │ [ AI Analyze ▸ ]   [ + Add to basket ]   [ View outcome ]      │ │
│ └────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ BTC ≥ $200k EOY                     YES 18¢                    │ │
│ │ 📈 Fed signals 2 more cuts in H2 — risk-on tone in 24h         │ │
│ │ [ AI Analyze ▸ ]   [ + Add to basket ]   [ View outcome ]      │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ 📉 Strong NO impact (0)                                             │
│                                                                    │
│ ⚠ Weak impact (5)                              [ expand ▾ ]        │
│                                                                    │
│ — No impact (46) —                             [ expand ▾ ]        │
└────────────────────────────────────────────────────────────────────┘
```

**(b) 메인 페이지 상단 banner** (digest 가 있는 날만)

```
┌────────────────────────────────────────────────────────────────────┐
│ 🗞  Today's digest: 3 strong, 5 weak impacts on your outcomes      │
│                                          [ View digest ]   [ × ]   │
└────────────────────────────────────────────────────────────────────┘
```

dismissable. 다음 cron 까지 dismissed 상태 유지 (localStorage `hl-markets-digest-dismissed:YYYY-MM-DD`).

**(c) 이메일** (Phase R.1 으로 분리 — first cut 은 in-app only)

§9 Open question #4 참고.

### 2.3 카드 → Phase M deep-link

`AI Analyze ▸` 클릭 시:
- outcome 페이지로 navigate + URL query `?source=digest&direction=yes&prefillCents=...`
- 페이지 진입 시 Phase M 의 AiAnalystPanel 자동 expand + analyze 자동 실행 (digest 의 reasoning 을 prompt 컨텍스트로 같이 전달).
- 결과 fairPct 가 digest 의 direction 과 일관되는지 사용자가 직접 검증.

`+ Add to basket` 클릭 시:
- Phase K 의 basket sheet 열림 + 해당 outcome 의 direction (YES/NO) 으로 leg pre-fill ($25 default).
- 사용자가 다른 strong-impact outcome 도 같이 담아서 한 사인으로 베팅 가능.

---

## §3. 뉴스 source 비교

| 옵션 | 비용 | LLM-친화 | query 분류 | RSS dedup | 비고 |
|------|------|----------|------------|-----------|------|
| RSS aggregator (Reuters/AP/BBC/CoinDesk 등 N feed) | $0 | ✕ (raw HTML 섞임) | ✕ (전체 fetch 후 우리가 keyword 필터) | 직접 구현 | 무료 but 노이즈 많음 |
| NewsAPI.org | dev $0 (100 req/day, 24h delay), production $449/mo | △ (JSON, headline + description) | ○ (query param) | dedup 직접 | 가격 절벽 — 무료티어로 daily digest 가능 but rate limit 빡빡 |
| Tavily Search | $0 first 1K/mo, $10/mo for 4K | ◎ (LLM-tuned, AI summary 옵션) | ◎ (자연어 query) | API 가 dedup | **추천** |

**추천: Tavily 우선.**
- LLM 친화적 API 디자인 (라이센스 위반 회피 위해 snippet 만, full text 안 보냄).
- 자연어 query 가능 → outcome 이름을 그대로 query 로 던질 수 있음.
- 무료티어 1K req/mo = 사용자 1 명이 daily 1 회 × 30 일 × 1 query/outcome batch ≈ 600 req → **무료 안에서 가능**.
- 사용자 own key → Phase M 의 BYOK 패턴 그대로.

대안 fallback:
- 사용자가 Tavily key 없으면 RSS-only 모드 (우리가 미리 큐레이션한 ~20 feed). LLM 분류 정확도는 떨어짐 — 정확도 expectation 낮춰 카피에 명시.
- NewsAPI 는 production 가격 절벽 ($0 → $449) 때문에 우리 default 추천 X.

---

## §4. Cron 구조

### 4.1 Stack

- **backend**: Next.js API route 가 아닌 별도 long-running process — `backend/cron/digest.ts` (tsx).
- **scheduler**: `node-cron` v3. per-user cron expression (사용자 timezone 반영).
- **runner**: 사용자별 독립 task. 한 사용자 실패가 다른 사용자에 영향 없음 (try/catch per user).
- **deployment**: Docker container 내 PM2 또는 systemd. Vercel serverless 는 long-running 불가 → 별도 호스트 (Fly.io 또는 our own VPS).

### 4.2 Per-user pipeline

```
function runUserDigest(userId) {
  const user = await db.users.get(userId);
  if (!user.digestEnabled) return;

  const llmKey = decrypt(user.llmKeyCiphertext);            // §7.2
  const newsKey = decrypt(user.newsKeyCiphertext);

  const headlines = await fetchHeadlines(user.newsSource, newsKey);   // ~100 개
  const outcomes = await selectOutcomes(user.scope);                  // 50 ~ 100 개

  const batches = chunk(outcomes, 5);                                 // K=5
  const results = [];
  for (const batch of batches) {
    const res = await analyzeBatch(batch, headlines, llmKey, user.provider);
    results.push(...res);
  }

  await db.newsDigest.insert({ userId, generatedAt: Date.now(), results });
  await notifyUser(userId, summarize(results));
}
```

### 4.3 처리량 / 비용

- outcome 100 개, K=5 → 20 batch
- 각 batch ≈ input 5K + output 1K 토큰 (gpt-4o-mini)
- 20 batch × $0.005 ≈ **$0.10/user/day** (gpt-4o-mini 기준)
- sonnet-4-5 사용 시 ≈ **$0.40/user/day** (4x)

사용자 100 명 × 30 일 = $300/mo (mini) or $1.2K/mo (sonnet) — 사용자 본인 부담이라 우리 cost 0. 단 cron infra cost ≈ $20/mo VPS.

### 4.4 실패 / 재시도

- news fetch 실패: 1 회 재시도, 그래도 실패면 digest skip + user 에게 알림.
- LLM batch 1 개 실패: 해당 batch 만 retry 1 회. 모든 batch 실패 시 digest 카드 비우고 "No digest today — LLM API errored" 표시.
- 사용자 key 401: backend DB 에서 key 무효 표시 + 사용자에게 "Re-enter your key" toast (다음 로그인 시).

---

## §5. LLM Batch Prompt

### 5.1 prompt 본문

`backend/cron/prompts.ts`:

```ts
export const DIGEST_SYSTEM_PROMPT = `
You are a prediction-market analyst evaluating how today's news affects active
outcome markets. For each outcome, decide whether the news affects it, and if
so, in which direction.

Output a JSON array, one entry per outcome:
[
  {
    "outcomeId": string,                // copy from input
    "impact":    "none" | "weak" | "strong",
    "direction": "yes" | "no" | "unclear",
    "reasoning": string                  // ONE line, <= 25 words, must cite specific headline
  },
  ...
]

Rules:
- Be conservative. Most outcomes are NOT affected by random news. Default to "none".
- "strong" = direct, named, dated event in the headlines that materially shifts the base rate.
- "weak" = adjacent / indirect signal (e.g. macro news for a crypto market).
- "unclear" direction = news happened but could push either way.
- Reasoning must reference the SPECIFIC headline (by quoting 3-5 words from it).
- Never recommend bet sizes. The user decides.
`.trim();

export const DIGEST_USER_PROMPT = (outcomes, headlines) => `
Outcomes (${outcomes.length}):
${outcomes.map((o, i) => `[${o.id}] ${o.name} — Expires ${o.expiresIso}. Current YES ${o.yesPct}%.`).join('\n')}

Recent 24h headlines (${headlines.length}):
${headlines.map((h, i) => `(${i + 1}) ${h.title} — ${h.source}, ${h.timeIso}`).join('\n')}

Evaluate each outcome against the headlines. Output JSON array.
`.trim();
```

### 5.2 batch size 선택

| K outcomes × N headlines | ~input tokens | ~output tokens | gpt-4o-mini cost | sonnet cost |
|--|--|--|--|--|
| 5 × 20 | 2.5K | 0.8K | $0.0008 | $0.020 |
| 10 × 20 | 4.5K | 1.6K | $0.0017 | $0.038 |
| 20 × 20 | 8.5K | 3.2K | $0.0033 | $0.080 |
| 5 × 50 | 5.5K | 0.8K | $0.0013 | $0.029 |

**선택: K=5 × N=20.**
- token cap 여유 (gpt-4o-mini 128K context — overkill 이지만 output quality 가 batch 작을수록 좋음).
- reasoning 1 줄당 outcome 5 개면 LLM 이 각 outcome 에 충분히 attention.
- 100 outcome → 20 call → mini 기준 $0.016/day. 여유분 reserve.

### 5.3 headlines 큐레이션

100 개 headline 을 모든 batch 에 똑같이 던지면 비용 = batch 수 × 100 headline. → 비용 폭주.

대안: outcome 카테고리 (sports/crypto/politics/macro) 별로 headline 필터.
- Phase R 1차 버전: **카테고리 매칭 단순 구현.** outcome metadata 에 `category` 필드 (governance.md 의 outcome row 확장).
- Tavily query 를 outcome 이름으로 던지면 자동으로 관련 headline 만 옴 — 카테고리 매칭보다 더 정확.
- **잠정: outcome batch 마다 Tavily query 1 회 (outcome 이름 5 개 OR-join).** 비용 +20 Tavily call/day/user — 무료티어 안.

---

## §6. UI 세부

### 6.1 Banner 컴포넌트

`components/DigestBanner.tsx`:
- 메인 페이지 (`/`) 상단, header 아래.
- props: `{ digest: TodayDigest | null }`.
- `null` 또는 dismissed → render null.
- 클릭 시 `/digest` 로 navigate.

### 6.2 /digest 페이지

`app/digest/page.tsx`:
- server component → backend DB 에서 오늘 digest 1 row fetch.
- 카테고리 (strong YES / strong NO / weak / none) 별 collapsible section.
- 카드 컴포넌트 `<DigestCard outcome={...} impact={...} />` 재사용.
- 우상단 history 링크 → `/digest/history` (지난 30 일).

### 6.3 카드 CTA 동작

- **AI Analyze ▸** → `/outcome/<symbol>?source=digest&hint=<impactReasoning>`.
  - 페이지 진입 시 `searchParams.source === 'digest'` 면 Phase M 의 AiAnalystPanel 을 expand + auto-run.
  - prompt 의 webContext 슬롯에 digest reasoning 주입.
- **+ Add to basket** → basket store 에 leg 추가 (direction = digest 의 direction, amount = $25 default).
  - basket sheet 가 sticky 상태로 뜸.
- **View outcome** → 평범한 outcome 페이지 navigate (분석 자동실행 없음).

---

## §7. Privacy / 비용 분리

### 7.1 핵심 trade-off

Phase M 의 *"사용자 key 는 우리 서버 절대 안 거침"* 원칙을 **R 에서는 깰 수밖에 없다**. cron 이 서버에서 돌기 때문.

→ 이걸 **사용자에게 명시적으로 고지** + **opt-in 토글** 이 디폴트 off + **언제든 hard delete**.

### 7.2 Key 저장 — DB ciphertext

```
users 테이블 확장 (Postgres):
  llm_provider           text     ('openai' | 'anthropic')
  llm_key_ciphertext     bytea    (AES-256-GCM with server master key)
  llm_key_iv             bytea
  news_source            text     ('tavily' | 'newsapi' | 'rss')
  news_key_ciphertext    bytea
  news_key_iv            bytea
  digest_enabled         boolean
  digest_run_local_time  text     ('HH:MM')
  digest_timezone        text     (IANA tz)
  digest_scope           text     ('all' | 'watchlist' | 'top_volume')
```

- AES-256-GCM. master key 는 process env (`DIGEST_KMS_KEY` — 32 byte hex).
- master key 가 서버 메모리에 있는 한 leak 위험 = 일반 backend secret 과 동일 격.
- Future: AWS KMS / HashiCorp Vault 로 이전 (Phase R.2).

대안: **time-bound key** (사용자가 매일 아침 key 입력 → 1 회 사용 후 backend memory 에서만 처리 후 destroy).
- 장점: at-rest 저장 0.
- 단점: 사용자가 매일 아침 의식해서 키 입력 → digest 의 "proactive" 가치 사라짐.
- → **at-rest ciphertext** 채택. §9 Open question #2.

### 7.3 비용 투명성

`/digest` 페이지 상단 + Settings 의 "Yesterday's spend":
- `digest.totalCostUsd` 를 매 cron 실행 시 기록 (LLM usage.input_tokens / output_tokens 합산).
- Settings 에 7-day spend chart.
- spend cap 옵션 (Phase R.1): 사용자가 "월 $5 cap" 설정 시 cap 도달하면 cron skip + 알림.

### 7.4 Off 토글

토글 OFF 클릭 시:
1. cron schedule 즉시 제거 (in-memory job map 에서 delete).
2. DB `digest_enabled = false`, key ciphertext 컬럼 NULL 처리 (hard delete).
3. 기존 digest row 는 보존 (사용자가 과거 결과 보고 싶을 수 있음). 사용자가 명시적 "Delete all my digest history" 누르면 그것도 삭제.

---

## §8. Phase M 통합

### 8.1 fairPct 포맷 일관성

Phase M 의 `AnalysisResult.fairPct` 와 Phase R 의 digest reasoning 은 다른 출력:
- M: 단일 outcome 의 fair % 추정 (정량).
- R: 다수 outcome 의 영향 분류 (정성: none/weak/strong + direction).

→ **R 의 digest 카드는 fair % 를 안 보임.** "impact + direction" 만. 정확한 fair % 가 궁금하면 카드의 "AI Analyze" 로 deep-link → Phase M 이 진짜 fair % 산출.

### 8.2 deep-link 시 컨텍스트 전달

`/outcome/<sym>?source=digest&direction=yes&hint=<urlencoded reasoning>`:
- Phase M 의 AiAnalystPanel 이 mount 시 `searchParams.hint` 를 prompt 의 `webContext` 슬롯에 주입.
- 사용자가 "AI Analyze" 버튼 안 눌러도 자동 1 회 실행 (source=digest 일 때).
- 한 번 실행 후에는 일반 Phase M 동작.

### 8.3 Constitution XIV 그대로 적용

> "LLM-driven advisory is strictly pre-fill, not auto-execute."

R 의 모든 CTA 도 pre-fill 까지만:
- + Add to basket → basket leg 추가 (사용자가 basket sheet 의 Place 클릭해야 사인).
- AI Analyze → Phase M 페이지 진입 (사용자가 BET 클릭해야 사인).
- digest 자체가 자동 베팅을 트리거하는 경로는 없음.

→ Phase O (auto-bet) 이전에는 어떤 경우에도 digest → 자동 베팅 불가. R 은 advisory layer.

---

## §9. Task Graph

| T# | Subject | Depends on |
|----|---------|------------|
| R-1 | DB schema migration — users 테이블 확장 + `news_digest` 테이블. | — |
| R-2 | `backend/lib/crypto.ts` — AES-256-GCM key envelope. unit test. | — |
| R-3 | `backend/news/tavily.ts` + `newsapi.ts` + `rss.ts` — 헤드라인 fetch 추상화. | — |
| R-4 | `backend/cron/digest.ts` — node-cron scheduler + per-user runner. | R-1, R-2, R-3 |
| R-5 | `backend/cron/prompts.ts` — DIGEST_SYSTEM_PROMPT + USER_PROMPT. spec §5.1 와 byte-equal unit test. | — |
| R-6 | `backend/cron/llm-batch.ts` — analyzeBatch(K outcomes, N headlines, key) + retry + parse. | R-5 |
| R-7 | `app/settings/page.tsx` 확장 — Daily Digest 섹션 (토글 + run time + source + scope + spend). | R-1 |
| R-8 | `app/digest/page.tsx` + `components/DigestCard.tsx` + `components/DigestBanner.tsx`. | R-1 |
| R-9 | Phase M deep-link 통합 — `searchParams.source === 'digest'` 처리. | R-8, Phase M done |
| R-10 | testnet 검증 — 사용자 1 명, outcome 30 개, 1 day cron 실행, 결과 확인. | all |
| R-11 | docs — README phase 표 R 추가, decisions log, Constitution XIV 재확인. | R-10 |

병렬:
- R-1 / R-2 / R-3 / R-5 동시 진행 가능.
- R-7 / R-8 은 R-1 후 동시.
- R-4 / R-6 은 R-1 + R-2 + R-3 + R-5 끝난 뒤.

---

## §10. Open Questions

1. **사용자 cron 시간대 — DST 처리?**
   - IANA tz string 으로 저장 (`Asia/Seoul`) → node-cron 의 `timezone` 옵션으로 직접 전달. DST 자동 처리.
   - 단 node-cron 의 timezone 옵션은 v2+ 부터 안정 — version pin 필수.
   - **잠정: IANA tz 저장.**

2. **Key 안전성 — DB ciphertext vs time-bound 사용자 재입력?**
   - 옵션 A (채택): AES-256-GCM ciphertext + master key in env. 잘 알려진 backend secret 모델.
   - 옵션 B: 매 cron 실행 직전 사용자에게 push notification → 사용자 앱 열어서 key 입력 → backend 가 1 회만 사용. UX 최악, "proactive" 가치 사라짐.
   - 옵션 C: 사용자 브라우저가 매 cron 시간에 자동으로 깨어나서 LLM 호출 (Service Worker periodic background sync). 브라우저 한정 + 지원 spotty.
   - **잠정: A.** Phase R.2 에서 KMS 로 master key 분리.

3. **뉴스 deduplication — 같은 사건 여러 source 가 보도하면?**
   - Tavily 가 API 측에서 dedup 해줌 (URL canonical + title similarity).
   - RSS 옵션은 우리가 직접 — title cosine similarity > 0.8 이면 drop, source 다양성 우선.
   - NewsAPI 는 dedup 없음 — 우리가 처리.
   - **잠정: Tavily 의존, RSS 는 단순 title-prefix 매칭.**

4. **이메일 발송 — Phase R 첫 버전 포함?**
   - 옵션 A: in-app banner + /digest 페이지만. 첫 버전.
   - 옵션 B: + 이메일 (사용자 이메일 옵트인 + SendGrid / Resend 사용).
   - **잠정: A 우선 (R 첫 버전).** B 는 Phase R.1 으로 분리.

5. **사용자 watchlist — 어디서 관리?**
   - Phase J / portfolio 의 보유 outcome + 사용자가 "★ Star" 한 outcome 합집합.
   - 신규: 각 outcome 페이지에 ★ 토글 + portfolio.ts 의 watchlist 컬렉션.
   - **잠정: Phase R-1 마이그레이션에 `user_watchlist (user_id, outcome_id)` 테이블 포함.**

6. **digest 가 outcome 가격 변동을 트리거하지 않을지 (front-running / slippage)?**
   - digest 결과가 동시에 발송되면 (예: 모든 사용자 09:00 KST), 사용자들이 같은 outcome 으로 몰려서 self-fulfilling 가격 변동 가능.
   - 완화: 사용자별 cron 시각 분산 권장 (Settings 의 default 가 09:00 ± 사용자별 random 5분).
   - 또는 mainnet 에서는 explicit 경고 표시.
   - **잠정: default time 에 ± 5분 jitter 추가. mainnet rollout 시 재평가.**

7. **카테고리 메타데이터 — outcome 마다 누가 태깅?**
   - HF 가 outcome 생성 시 category 지정 (sports/crypto/politics/macro/misc) → governance.md §2 의 outcome row 에 컬럼 추가.
   - 우리 backend 가 자체 추론 (LLM 1 회 호출로 분류) — 비용 발생 + 부정확.
   - **잠정: HF metadata 가 있으면 그것 사용, 없으면 unclassified (모든 헤드라인 후보).**

8. **digest 결과 보존 기간?**
   - 30 일 (사용자 history). 그 이전 row 는 nightly cleanup 으로 삭제.
   - 사용자가 "permanent archive" 옵션으로 표시한 digest 는 무기한.
   - **잠정: 30 일 + 사용자 표시 시 무기한.**

---

다음 세션 시작 시: §10 Open question #2 (key 안전성) 와 #6 (front-running) 은
Phase R 진입 전에 결정해야 함. R-1 (DB schema) + R-2 (crypto) + R-3 (news fetch)
부터 병렬 시작. R-7 (settings UI) 가 사용자 노출 표면 — 카피 review 필요.
