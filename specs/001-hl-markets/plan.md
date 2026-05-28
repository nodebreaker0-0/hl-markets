# Implementation Plan: hl-markets

**Branch**: `001-hl-markets` | **Date**: 2026-05-24 (last update 2026-05-28) | **Spec**: ./spec.md

**Input**: ./spec.md (User Stories US1~US13, FR-001..255, SC-001..U-2)

## Summary

Hyperliquid HIP-4 outcome market 의 public explorer + 사용자 wallet 기반 거래 클라이언트 + AI 분석/discovery + 사용자 설정 기반 autobet 을 host-agnostic full-stack 으로 구현. 사용자의 wallet, agent privkey, LLM API key 모두 브라우저 안에서만 존재하며 backend 는 어느 것도 보지 못한다.

- Frontend: Next.js 14 static export (S3/CloudFront/Cloudflare Pages 또는 기타 static 호스트).
- Backend: Hono on Node 20 (HTTP + WebSocket + in-process `node-cron`), Postgres 15 + Drizzle ORM, Docker.
- Browser-side state: IndexedDB (agent privkey ciphertext), localStorage (LLM keys / basket / autobet rules / discovery cache).
- AI provider: 사용자의 OpenAI 또는 Anthropic 키. 브라우저에서 `api.openai.com` / `api.anthropic.com` 으로 직접 fetch.
- Domain data fetchers: CoinGecko, FRED, football-data, OpenWeatherMap, Tavily — 모두 브라우저 → provider direct.

Phases A → I 가 explorer 본체 (Charter / skeleton / live / backend / historical / detail / polish).
Phases J 가 wallet + chat + builder-code trade.
Phases K → U 가 agent flow / basket / portfolio / autobet / AI analyst / discovery / domain specialists / deep agents.

## Technical Context

**Language/Version**: TypeScript 5.5 strict, both frontend and backend.

**Frontend (`apps/frontend/`)**:
- Next.js 14 App Router with `output: 'export'` (static export).
- Tailwind CSS mobile-first.
- EIP-1193 직접 — wagmi/viem 미사용.
- EIP-712 sign 은 `eth_signTypedData_v4`. HL L1 action sign 은 `@noble/curves/secp256k1` + msgpack-encoded action hash.
- IndexedDB (agent privkey): `idb` lightweight wrapper.
- Charts: `recharts`.
- LLM: provider별 fetch wrapper (`analyzeOpenAiRaw`, `analyzeAnthropicRaw`). JSON 강제: OpenAI는 `response_format: {type: "json_object"}`, Anthropic은 instruction + JSON 추출 fallback.
- Schema validation: `zod`.
- Test: `vitest`.

**Backend (`apps/api/`)**:
- Hono framework on Node 20 native HTTP + WebSocket upgrade.
- Drizzle ORM + Postgres driver (`postgres` package).
- `node-cron` for in-process scheduled polling.
- `@noble/curves/secp256k1` + keccak for EIP-712 sig recovery.
- Zod for request validation.
- Test: vitest.
- **Constitution XI 가드** — `/trade-forward` 가 action 의 byte 변경 검증을 위해 다음과 같이 구현:
  - Zod schema parse 는 별도 (response 검증용); 실제 forward 는 raw request body 를 그대로 HF `/exchange` 로 송신.
  - builder 필드만 env 에서 attach.

**DB**: Postgres 15+. Mac local = Docker Compose. Prod = managed.

**Target Platform**:
- Frontend = 모바일/데스크탑 Chromium / Safari iOS / Firefox.
- Backend = Linux Docker.

**Project Type**: Monorepo — `apps/frontend` + `apps/api` + `apps/backend` (Hono server; some refs say `apps/api`).

**Performance Goals**:
- Frontend: initial page load P95 < 2s.
- Backend: GET /governance P95 < 100ms. POST /trade-forward P95 < 500ms (HF passthrough 시간 포함).
- Indexer cron: 1 polling cycle < 30s.
- AI Discovery: 30s 이내 (provider 응답 평균 8-12s × pipeline 단계 3).
- Deep agent (per candidate): 3-8s (LLM 단일 호출 시간 + fetcher).

**Constraints**:
- Bundle (frontend) gzip < 1.5 MB.
- Docker image < 200 MB.
- API GET 모두 idempotent + cacheable.
- Postgres connection pool ≤ 10.
- Cost: Mac local 무료. Prod managed ≤ $10/월.
- **AI cost (사용자 부담)**: discovery 1회 ~$0.003 (gpt-4o-mini). 사용자가 cost 인식하도록 Settings 에 안내.

**Scale/Scope**:
- pending governance: 10~50 active 동시.
- chat 메시지: market 당 ~ 1000건 (수 개월 운영 가정), 정산 후 wipe.
- Trade forward: 사용자 1명이 minutes 단위로 spike 가능, autobet ON 시 5분 1회 burst.
- Discovery candidates: 100-300 active outcome.
- Deep agent: discovery 1회당 top 12 candidate.

## Constitution Check

> Gate: pass before Phase 0 research. Re-check after each Phase.

| 원칙 | 통과 | 비고 |
|---|---|---|
| I. Backend Zero Key Custody | ✅ | API spec 에 privkey/mnemonic/LLM key 입력 없음. |
| II. Signed Messages Over Trust | ✅ | 모든 mutating action (chat, trade) 가 sig 검증. |
| III. Idempotent Reads | ✅ | GET 라우트가 DB write 안 함. |
| IV. Network Selector Explicit | ✅ | build-time 네트워크 분리. |
| V. Plugin/Renderer Extensibility | ✅ | renderers + categorize entry 추가만으로 확장. |
| VI. Mobile-First | ✅ | Tailwind sm/md/lg, 375px 한 손 조작. |
| VII. HL Brand Tokens | ✅ | tailwind brand tokens, hex hardcode 0. |
| VIII. No Telemetry | ✅ | analytics SDK import 0. |
| IX. Host-Agnostic | ✅ | Docker image 1개. |
| X. Tier Gating | ✅ | Phase 순서 강제. |
| XI. Trade Safety | ✅ | `/trade-forward` 가 byte-for-byte forward; builder 만 env 에서 attach. |
| XII. Agent Flow Isolation | ✅ | agent privkey IndexedDB 만, backend 통과 X. |
| XIII. Single Builder Code | ✅ | env 한 곳에서만 builder addr / fee bps 결정. |
| XIV. AI Advisory Only | ✅ | autobet default-off + opt-in + cap + emergency stop. |
| XV. Untrusted Fetch | ✅ | fetcher 실패 시 silent fallback, schema 검증 후 render. |

위반 항목 없음.

## Project Structure

### Documentation (this feature)

```text
specs/001-hl-markets/
├── spec.md
├── plan.md
├── contracts/
│   ├── governance.md
│   ├── outcome-market.md
│   ├── api.md
│   ├── data-model.md
│   ├── chat-protocol.md
│   ├── builder-code.md
│   ├── agent.md
│   ├── portfolio.md
│   ├── basket-bet.md
│   ├── ai-analyst.md
│   ├── deep-agents.md
│   ├── news-digest.md           (deprecated/superseded)
│   ├── mainnet-rollout.md
│   ├── discovery.md             (Phase S/T/U)
│   ├── autobet.md               (Phase O)
│   └── revenue-model.md         (Phase L finding)
├── quickstart.md
└── tasks.md
```

### Source Code (post Phase U)

```text
hl-markets/
├── CHARTER.md, delegation_matrix.md, README.md, CLAUDE.md
├── Makefile
├── docker-compose.yml
├── docs/
│   └── HIP4-fee-policy.md       (revenue model evidence)
├── .specify/, specs/001-hl-markets/...
├── apps/
│   ├── frontend/
│   │   ├── app/
│   │   │   ├── layout.tsx, page.tsx, globals.css
│   │   │   ├── q/[network]/[id]/page.tsx
│   │   │   ├── o/[network]/[id]/page.tsx
│   │   │   ├── g/[network]/[id]/page.tsx
│   │   │   ├── historical/page.tsx
│   │   │   ├── portfolio/page.tsx       # Phase N
│   │   │   ├── autobet/page.tsx         # Phase O
│   │   │   ├── settings/page.tsx        # Phase Q + R
│   │   │   └── discovery/page.tsx       # Phase S
│   │   ├── components/
│   │   │   ├── NetworkTabs.tsx, WalletConnect.tsx
│   │   │   ├── ChatPanel.tsx, PositionBadge.tsx
│   │   │   ├── TradeWidget.tsx, SimpleTradeWidget.tsx
│   │   │   ├── EnableTradingModal.tsx   # Phase K
│   │   │   ├── BasketSheet.tsx          # Phase L+M
│   │   │   ├── AIAnalyzePanel.tsx       # Phase P
│   │   │   ├── AIDiscovery.tsx          # Phase S/T/U
│   │   │   ├── AutobetTicker.tsx        # Phase O
│   │   │   └── outcome/, governance/renderers/
│   │   ├── lib/
│   │   │   ├── api.ts, env.ts, network.ts
│   │   │   ├── wallet/
│   │   │   ├── signing/
│   │   │   │   ├── agent-sign.ts        # Phase K
│   │   │   │   └── user-signed/approveAgent.ts
│   │   │   ├── agent.ts                 # Phase K (IndexedDB)
│   │   │   ├── basket.ts                # Phase L
│   │   │   ├── trade.ts                 # placeMarketBuy/Sell + placeBasketBet
│   │   │   ├── portfolio.ts             # Phase N
│   │   │   ├── orderbook.ts
│   │   │   ├── llm-raw.ts               # Phase P (provider abstraction)
│   │   │   ├── categorize.ts            # Phase T
│   │   │   ├── specialists.ts           # Phase T
│   │   │   ├── discovery.ts             # Phase S
│   │   │   ├── autobet.ts               # Phase O (rule engine)
│   │   │   └── agents/                  # Phase U
│   │   │       ├── types.ts             # AnalystOutputSchema
│   │   │       ├── skills.ts            # 5 domain SKILL prompts
│   │   │       ├── fetchers.ts          # raw signal fetchers
│   │   │       └── orchestrator.ts      # analyzeOutcomeDeep
│   │   └── tests/
│   └── api/   (or apps/backend/)
│       ├── src/
│       │   ├── index.ts                 # Hono + WS + node-cron
│       │   ├── db/ (schema, migrations)
│       │   ├── indexer/
│       │   ├── routes/
│       │   │   ├── governance.ts
│       │   │   ├── chat.ts, chat-ws.ts
│       │   │   ├── auth.ts
│       │   │   ├── trade-forward.ts     # Phase J.5 (XI 가드)
│       │   │   ├── position.ts
│       │   │   └── health.ts
│       │   └── signing/verify.ts
│       └── tests/
└── .github/workflows/
```

**Structure Decision**:
- Monorepo `apps/frontend` + `apps/api`. 공유 코드 없음.
- backend single Node process (HTTP + WS + cron 같이).
- Phase K-U 의 거의 모든 신규 코드는 frontend (browser-only). backend 신규 endpoint 는 `/trade-forward` (Phase J.5) 외 없음.
- AI / autobet / discovery 데이터는 모두 client-side. 서버 stateful 데이터는 chat + indexer 뿐.

## Phases

### Phase A — Charter / Spec-Kit ✓
Completion: CHARTER + delegation + constitution + spec + plan + contracts + quickstart + tasks 모두 ✅.

### Phase B — Frontend skeleton ✓
T001~T020.

### Phase C — Live data ✓
T030~T050.

### Phase D — Delegation lookup
**Removed in pivot (v0.3)**.

### Phase E — Local backend ✓
T100~T130.

### Phase F — Historical API ✓
T140~T160.

### Phase G — 가상투표
**Removed in pivot (v0.3) — superseded by Phase J chat**.

### Phase H — Polymarket detail ✓
T210~T230. H.1 binary detail, H.2 question grouping, H.3 backend persistence.

### Phase I — Release + host pick
Pending — Dockerfile 최적화, frontend bundle 검증, custom domain 설정 가이드.

### Phase J — Wallet + chat + builder-code trade ✓
J.1 sign-in, J.2 chat backend (WS + sig + rate + position gate), J.3 chat UI, J.4 position badge, J.5 trade-forward + TradeWidget, J.5 silent killer fixes.

### Phase K — Agent flow ✓
Browser-only random privkey + IndexedDB ciphertext + `approveAgent` user-signed action + agent-signed L1 trades. wallet popup 1회만.

### Phase L — Basket bet ✓
`placeBasketBet` (single sign, multi-leg `orders[]`). Constitution XI 가드 확장. HIP-4 fee 정책 발견 (buy=0, sell=100% builder fee).

### Phase M — Basket UI ✓
`<BasketSheet>` floating drawer + add/remove/size edit + ship.

### Phase N — Portfolio + close + cancel ✓
`/portfolio` page with `clearinghouseState` + `openOrders` + "Cash out 50%" slider + Cancel.

### Phase O — Autobet ✓
`lib/autobet.ts` rule engine + `/autobet` page + `<AutobetTicker>` 5분 background scan. Constitution XIV 가드 (default-off, cap, emergency stop).

### Phase P — AI Analyst (single outcome) ✓
`lib/llm-raw.ts` browser → provider direct. `<AIAnalyzePanel>` outcome 페이지 통합.

### Phase Q — Multi-provider AI keys ✓
Settings 페이지 OpenAI/Anthropic toggle + wipe.

### Phase R — Settings UX consolidation ✓
LLM keys + agent backup + autobet rules 한곳에.

### Phase S — AI Discovery (cross-market) ✓
`lib/discovery.ts` 의 `fetchActiveCandidates` + `enrichWithSpecialists` + `enrichWithDeepAnalysts` + `askLlmDiscover`. `<AIDiscovery>` 탭 + auto-explore + 1h cache.

### Phase T — Domain specialists ✓
`lib/categorize.ts` + `lib/specialists.ts` (CoinGecko/football-data/FRED/Tavily/OpenWeatherMap fetcher light blob).

### Phase U — Deep agents ✓
`lib/agents/` — types/skills/fetchers/orchestrator. anthropic/financial-services pattern: SKILL prompt + raw signals → LLM 1회 → AnalystOutputSchema → fold sources/fields.

### Phase V — Mainnet rollout
Pending — gas/fee policy 재검토, autobet emergency-stop 통합 검증, monitoring set up, `contracts/mainnet-rollout.md` 갱신.

## Key Rules

- Constitution §V (plugin 확장) — 새 variant 추가는 1 renderer 파일 + 1 categorize entry. core 변경 X.
- Mobile-first — 모든 새 컴포넌트는 base style 부터 모바일.
- Brand — hex literal hardcode 0건. `tailwind.config.ts` 의 `hl` 팔레트만 사용.
- 사용자 데이터 — wallet address + signature + chat body 외 PII 0.
- Cost — Mac local 무료. Prod 도 free tier 내 운영 가능하도록 cron 빈도 / DB row 수 / image size 최적화.
- **Phase K-U 추가 rules**:
  - Agent privkey 가 backend 로 보내질 가능성 발견 시 (코드 또는 API spec) 즉시 stop + boost (Constitution XII).
  - LLM key 가 backend 로 보내질 가능성 발견 시 즉시 stop + boost (Constitution I 의 확장).
  - Autobet 의 default 가 OFF 인지, emergency stop 이 hard-coded 인지 매 commit verify.
  - Fetcher 가 untrusted data 를 user-visible 경로에 schema parse 없이 흘리는지 매 PR verify.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `lib/agents/` 의 5개 SKILL prompt — 코드 복잡도 증가 | 도메인별 prior + fetcher mapping 이 LLM ranking 정확도에 크게 기여 (testnet 실측). 단일 generic prompt 로는 Tier-3 신호를 거의 못 활용. | 단일 prompt 만 — 시도했으나 deep-agent 결과의 reasoning 이 generic 해짐. |
| `lib/discovery.ts` 의 3단 pipeline (`fetchActiveCandidates` → `enrichWithSpecialists` → `enrichWithDeepAnalysts` → `askLlmDiscover`) | LLM cost 최소화 (deep 은 top 12만), 외부 API rate limit 보호, 단일 LLM 호출에 전부 던지면 token 한도 + cost 폭발. | 단일 LLM 호출에 모든 200+ candidate 던지기 — gpt-4o-mini 128k 한도 안전하지만 cost × 정확도 trade-off 가 안 좋음. |

위반 외 항목 없음.
