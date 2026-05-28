---
description: "hl-markets implementation tasks (Phase A~V)"
---

# Tasks: hl-markets

**Input**: `specs/001-hl-markets/{spec.md, plan.md, contracts/{governance,api,data-model}.md, quickstart.md}` + `CHARTER.md`, `delegation_matrix.md`, `.specify/memory/constitution.md`

**Prerequisites**: Phase A 완료 (charter / spec / plan / contracts / quickstart / 본 tasks).

**Tests**: 포함. signing 같은 crypto 코드는 golden fixture 필수.

**Organization**: phase 별 + 우선순위.

## Format

`[T###] [P?] [Phase-X] Description (path)`

- `[P]` — 다른 파일·의존성 없어 병렬 가능
- `[Phase-X]` — B/C/D/E/F/G/H/I
- 모든 경로는 `hl-markets/` 기준

---

## Phase B — Frontend skeleton + HL 톤 (P1)

- [ ] **T001** [Phase-B] Repo 골격 — workspace `package.json` (root) + `apps/frontend/package.json`. Frontend deps: next 14, react 18, tailwindcss, @noble/hashes, clsx. dev deps: typescript, vitest, eslint, prettier.
- [ ] **T002** [P] [Phase-B] `.gitignore` — node_modules, .next, out, .env*, postgres-data, .venv, dist.
- [ ] **T003** [P] [Phase-B] `Makefile` — install / lint / typecheck / test / build / verify / db / db-reset.
- [ ] **T004** [P] [Phase-B] `docker-compose.yml` — Postgres 15 service (5432, hl_gov DB, dev/dev creds), `postgres-data` volume.
- [ ] **T005** [Phase-B] `apps/frontend/{next.config.mjs, tsconfig.json, tailwind.config.ts, postcss.config.mjs, .eslintrc.cjs}` — hl-vote-web 패턴 + brand tokens 복사.
- [ ] **T006** [Phase-B] `apps/frontend/app/layout.tsx` + `globals.css` — 다크 background, 민트 accent, mobile-first body.
- [ ] **T007** [Phase-B] `apps/frontend/app/page.tsx` skeleton — header, NetworkTabs, 빈 list 영역.
- [ ] **T008** [P] [Phase-B] `apps/frontend/components/NetworkTabs.tsx` — Constitution IV (default 없음).
- [ ] **T009** [P] [Phase-B] CSP meta in layout.tsx — `connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz`. Phase E 후에 backend host 추가.

**Checkpoint B**: `npm run dev` 가 빈 dark page + NetworkTabs 표시.

---

## Phase C — Live data (P1)

- [ ] **T020** [Phase-C] `apps/frontend/lib/api.ts` — HF info POST wrappers (validatorL1Votes / validatorSummaries / meta / spotMeta / candleSnapshot / delegations).
- [ ] **T021** [Phase-C] `apps/frontend/lib/validators.ts` — hl-vote-web/lib/validators.ts 복사 + 일부 (governanceForSignerAccount, splitVoters, displayName).
- [ ] **T022** [P] [Phase-C] `apps/frontend/lib/governance/types.ts`, `classify.ts`, `thresholds.ts` — contracts/governance.md 그대로.
- [ ] **T023** [P] [Phase-C] `apps/frontend/lib/governance/renderers/{outcome,delisting,unknown}.tsx` 골격 (Card + Detail empty).
- [ ] **T024** [Phase-C] `apps/frontend/lib/governance/renderers/index.ts` — registry.
- [ ] **T025** [Phase-C] `apps/frontend/components/QuorumBar.tsx` — stake + count progress bars (HL 민트), threshold 표시.
- [ ] **T026** [Phase-C] `apps/frontend/components/GovernanceCard.tsx` — variant 별 renderer.Card 위임 + QuorumBar.
- [ ] **T027** [Phase-C] `apps/frontend/app/page.tsx` — HF fetch + state + 카드 리스트 렌더.
- [ ] **T028** [Phase-C] `apps/frontend/app/g/[network]/[id]/page.tsx` — detail route. classify → renderer.Detail.
- [ ] **T029** [Phase-C] `apps/frontend/components/outcome/OutcomeDetail.tsx` — 제목 / 설명 / side / 만료.
- [ ] **T030** [Phase-C] `apps/frontend/components/DelistingDetail.tsx` — ticker + 만료. `meta` 에서 cross-ref 한 시장 정보 (Phase H 까지는 placeholder OK).
- [ ] **T031** [P] [Phase-C] unit tests — classify / thresholds (computeQuorum 검증).
- [ ] **T032** [P] [Phase-C] 모바일 viewport 375 px 시각 회귀 (스크린샷 또는 manual).

**Checkpoint C**: testnet/mainnet 둘 다 pending 카드 + detail 표시. QuorumBar 정확.

---

## Phase D — Delegation lookup (P1)

- [ ] **T040** [Phase-D] `apps/frontend/lib/wallet/eip1193.ts` — connectMetaMask, getAccount, getActiveChainId. hl-vote-web 의 metamask.ts 일부 차용 (ensureHLPhantomChain 빼고).
- [ ] **T041** [Phase-D] `apps/frontend/components/WalletConnect.tsx` — 연결 / 주소 / chainId 표시.
- [ ] **T042** [Phase-D] `apps/frontend/components/MyDelegations.tsx` — `delegations(user)` fetch + validator name 매핑 + 현재 pending votes cross-ref.
- [ ] **T043** [Phase-D] `apps/frontend/app/delegations/page.tsx` — wallet connect 흐름 + MyDelegations.
- [ ] **T044** [P] [Phase-D] N시간 vote 안한 표시 — `voteSilentSince` 계산.
- [ ] **T045** [P] [Phase-D] 모바일 viewport 검증.

**Checkpoint D**: 실 wallet 으로 본인 delegation + validator pending votes 표 보임.

---

## Phase E — Local backend (P1)

- [ ] **T100** [Phase-E] `apps/api/package.json` — hono, drizzle-orm, postgres, node-cron, zod, @noble/hashes, @noble/curves. dev deps: typescript, tsx, vitest, drizzle-kit.
- [ ] **T101** [P] [Phase-E] `apps/api/tsconfig.json`, `drizzle.config.ts`, `.eslintrc.cjs`, `Dockerfile`.
- [ ] **T102** [Phase-E] `apps/api/src/env.ts` — Zod schema for DATABASE_URL / PORT / ALLOWED_ORIGINS / ... `.env.example` 작성.
- [ ] **T103** [Phase-E] `apps/api/src/db/schema.ts` — Drizzle schemas for governance / vote_snapshot / validator_snapshot / poll_vote (contracts/data-model.md 그대로).
- [ ] **T104** [Phase-E] `apps/api/src/db/client.ts` — postgres connection pool.
- [ ] **T105** [Phase-E] `apps/api/src/db/migrations/` 초기 migration (drizzle-kit generate).
- [ ] **T106** [Phase-E] `apps/api/src/hf/index.ts` — HF /info wrappers (frontend lib/api 와 mirror).
- [ ] **T107** [Phase-E] `apps/api/src/indexer/govId.ts` — sha256(msgpack(action)) 계산.
- [ ] **T108** [Phase-E] `apps/api/src/indexer/governance.ts` — validatorL1Votes → governance + vote_snapshot upsert.
- [ ] **T109** [Phase-E] `apps/api/src/indexer/validators.ts` — validatorSummaries → validator_snapshot upsert.
- [ ] **T110** [Phase-E] `apps/api/src/indexer/settle-detect.ts` — 사라진 pending 의 settle/expire 판단.
- [ ] **T111** [Phase-E] `apps/api/src/indexer/run.ts` — main loop (network × endpoint cartesian).
- [ ] **T112** [Phase-E] `apps/api/src/routes/governance.ts` — GET /governance (list, filter, paginate) + GET /governance/{network}/{id}.
- [ ] **T113** [Phase-E] `apps/api/src/routes/validators.ts` — GET /validators.
- [ ] **T114** [Phase-E] `apps/api/src/routes/health.ts` — GET /health.
- [ ] **T115** [Phase-E] `apps/api/src/routes/cors.ts` — Hono CORS middleware.
- [ ] **T116** [Phase-E] `apps/api/src/index.ts` — Hono app + node-cron startup + graceful shutdown.
- [ ] **T117** [P] [Phase-E] `apps/api/tests/` — indexer unit tests (settle-detect / govId stability).
- [ ] **T118** [P] [Phase-E] Hono routes unit tests (zod validation, idempotent GET).
- [ ] **T119** [Phase-E] `docker build` 검증 — image < 200MB.

**Checkpoint E**: `docker-compose up postgres && cd apps/api && npm run dev` → `curl /health` ok, `curl /governance?network=testnet` 응답, 1분 후 DB row 누적.

---

## Phase F — Historical (P2)

- [ ] **T140** [Phase-F] settle-detect 로직 강화 — quorum_reached 의 이력 / expire vs settle 정확 판단.
- [ ] **T141** [Phase-F] GET /governance 의 `status=historical` 옵션 implementation + `?cursor=` 페이지네이션.
- [ ] **T142** [Phase-F] GET /governance/{id} 의 `voteTimeline` — vote_snapshot 으로부터 added/removed voters timeseries.
- [ ] **T143** [Phase-F] `apps/frontend/app/historical/page.tsx` — historical 탭 + API integration.
- [ ] **T144** [Phase-F] `apps/frontend/components/HistoricalList.tsx` — settled / expired 시간순 카드.
- [ ] **T145** [Phase-F] `meta.universe.isDelisted` 기반 즉시 historical delisting — Phase F 의 일부.
- [ ] **T146** [P] [Phase-F] unit tests — historical query, timeline 정확성.

**Checkpoint F**: settled 거버넌스가 historical 탭에 시간순 표시.

---

## Phase G — 가상투표 (P2)

- [ ] **T170** [Phase-G] `apps/frontend/lib/wallet/poll-sign.ts` — EIP-712 typed-data sign helper (contracts/api.md §3 spec).
- [ ] **T171** [Phase-G] `apps/frontend/components/PollVotePanel.tsx` — wallet connect + side 선택 + sign + POST.
- [ ] **T172** [Phase-G] `apps/api/src/poll/verify.ts` — sig recovery + signedAt 검증.
- [ ] **T173** [Phase-G] `apps/api/src/routes/poll.ts` — POST /poll-vote, GET /poll-results.
- [ ] **T174** [Phase-G] `apps/api/src/poll/stake-snapshot.ts` — vote 시점에 voter 의 delegations(user) fetch + voter_stake 저장.
- [ ] **T175** [Phase-G] golden fixture — `tests/golden/poll-sig.json` (Python 또는 ethers 으로 100 row 생성).
- [ ] **T176** [P] [Phase-G] vitest golden test — TS verify === fixture.
- [ ] **T177** [P] [Phase-G] frontend PollVotePanel mobile responsive.
- [ ] **T178** [P] [Phase-G] api rate limit middleware — per IP token bucket.

**Checkpoint G**: testnet 거버넌스에 1건 가상투표 → DB row + /poll-results 응답 update.

---

## Phase H — Polymarket detail (P3)

- [ ] **T210** [Phase-H] frontend dep 추가 — `recharts` (또는 lightweight).
- [ ] **T211** [Phase-H] `apps/frontend/components/outcome/PriceChart.tsx` — HF `candleSnapshot(coin, 1h, start, end)` fetch + 차트.
- [ ] **T212** [Phase-H] `apps/frontend/components/outcome/SideCards.tsx` — side1/side2 현재가 (HF `metaAndAssetCtxs`) + 시각화.
- [ ] **T213** [Phase-H] OutcomeDetail 통합 — 큰 헤더 + 설명 + sides + chart + voters + quorum + 가상투표.
- [ ] **T214** [Phase-H] settled outcome 의 winner side + 정산 시각 + 최종 가격.
- [ ] **T215** [P] [Phase-H] 모바일 차트 responsive — height / 축 label 가독성.

**Checkpoint H**: 1 outcome 의 full lifecycle (등록 → trading → settled) 한 페이지에서 추적.

---

## Phase I — Release + host 결정 (P3)

- [ ] **T240** [Phase-I] Dockerfile 최적화 (multistage build, distroless base) — image < 200MB.
- [ ] **T241** [Phase-I] `.github/workflows/ci.yml` — verify gate (frontend + api + migrations).
- [ ] **T242** [Phase-I] `.github/workflows/release.yml` — tag v* → frontend zip + SHA-256, Docker image push.
- [ ] **T243** [Phase-I] README — operator quickstart (Mac local), 운영 host 옵션 비교 표 (Railway / Fly / AWS ECS / VPS).
- [ ] **T244** [Phase-I] custom domain 설정 가이드 — `hl-markets.bharvest.io` Route 53 또는 CloudFlare DNS.
- [ ] **T245** [Phase-I] 모바일 responsive 풀 검증 — sm/md/lg 모든 페이지 스크린샷 캡쳐.
- [ ] **T246** [Phase-I] release notes — SHA-256 + 운영 host 결정 (builnad).

**Checkpoint I**: 공개 endpoint 작동 + 운영 host 확정.

---

## Parallel Execution Hint

같은 Phase 안에서 `[P]` 라벨 task 는 병렬 가능. Phase 간엔 sequential.

Phase B의 T001 후 T002~T009 병렬. Phase C의 T020~T022 후 T023~T031 병렬.

## Test Coverage Targets

- `lib/governance/*` — 100% line.
- `lib/wallet/poll-sign.ts` + `apps/api/src/poll/verify.ts` — golden 100/100.
- `apps/api/src/indexer/*` — settle-detect / govId 결정성 unit 100%.
- 컴포넌트 — guard 컴포넌트 (NetworkTabs, PollVotePanel) 핵심 유닛.

---

## Phase J — Wallet + Chat + Builder-Code Trade (P1) — ✓ DONE

> Detailed task list lives in Cowork task system (#58–#82).
> Summary checkpoint: `/q?id=`/`/o?id=` pages have wallet connect, EIP-712
> sign-in → JWT cookie, chat WebSocket + rate-limit + position-gate,
> position badge, in-app trade widget with builder code attached.
> Constitution XI 검증: `/trade-forward` 가 user-signed action 의
> order/coin/side/sz/px 를 byte-for-byte 보존.

---

## Phase K — Agent flow (popup-free trading) — ✓ DONE

> Detailed task list: Cowork #79–#91. Spec: `contracts/agent.md`.

- [x] **K-1** `lib/agent.ts` — IndexedDB store `hl-markets-agent-v1`. generate / save (ciphertext) / load (decrypt) / delete.
- [x] **K-2** `lib/signing/agent-sign.ts` — agent privkey 로 HL L1 action 사인 (msgpack hash + secp256k1).
- [x] **K-3** `lib/signing/user-signed/approveAgent.ts` — `approveAgent` user-signed action.
- [x] **K-4** `lib/trade.ts` — buy/sell/cancel 가 agent privkey 사인 우선.
- [x] **K-5** `components/EnableTradingModal.tsx` — 2-step (create agent → approve on HL).
- [x] **K-6** TradeWidget / SimpleTradeWidget — 첫 trade 시 modal 트리거.
- [x] **K-7** Agent invalidation / 만료 처리.
- [x] **K-8** testnet 검증 — popup 1회 (approveAgent) 만, 이후 0.

**Checkpoint K**: 모든 trade 가 wallet popup 0회. IndexedDB inspect 시
ciphertext 만, 평문 privkey 없음.

---

## Phase L — Multi-leg basket bet — ✓ DONE

> Detailed task list: Cowork #113–#119, #82. Spec: `contracts/basket-bet.md`.

- [x] **L-1** `lib/basket.ts` — localStorage `hl-markets:basket-v1` leg array.
- [x] **L-2** `lib/trade.ts` — `placeBasketBet(legs, agentSigner)` → 단일 `order` action 의 `orders[]` 다 leg.
- [x] **L-3** `components/BasketSheet.tsx` — floating drawer + leg editor + ship.
- [x] **L-4** "Add to basket" 트리거 — SimpleTradeWidget / question page.
- [x] **L-5** testnet 3-leg basket 검증 — 1 sign → 3 fill → builder fee 3건.
- [x] **L.fee** HIP-4 outcome 시장 builder fee 정책 조사. 발견: buy=0, sell=100%. evidence: testnet 100-unit sell → 0.0265665 USDC.

**Checkpoint L**: 3-leg basket 1 사인 + builder fee 정책 확정 +
`docs/HIP4-fee-policy.md` 작성.

---

## Phase M — Basket UI — ✓ DONE

(Phase L 의 `BasketSheet.tsx` 가 Phase M 이기도 — task #117).

---

## Phase N — Portfolio + close + cancel — ✓ DONE

> Detailed task list: Cowork #92–#111. Spec: `contracts/portfolio.md`.

- [x] **N-1** `app/portfolio/page.tsx` — `clearinghouseState` + `openOrders` 표시.
- [x] **N-2** `lib/portfolio.ts` — data aggregation, holdings × marks.
- [x] **N-3** `lib/trade.ts` `placeMarketSell` — Cash out slider 동작.
- [x] **N-4** Cancel open order 버튼.
- [x] **N-5** Fill toast notification.
- [x] **N-6** Multi-level walk-the-book (큰 베팅 지원).
- [x] **N-7** Partial cash out (slider/%input).
- [x] **N-8** testnet 검증 — 보유 share 표시 + Cash out 50% 정확.

**Checkpoint N**: Portfolio 페이지가 holding + open order + close + cancel
모두 정상 작동.

---

## Phase O — Autobet — ✓ DONE

> Detailed task list: Cowork #127, #134–#136. Spec: `contracts/autobet.md`.

- [x] **O-1** `lib/autobet.ts` — rule engine + golden fixture.
- [x] **O-2** `app/autobet/page.tsx` — config form + dry-run + log.
- [x] **O-3** `components/AutobetTicker.tsx` — global 5-min background scan.
- [x] **O-4** Acknowledgement modal — "AI advisory only" 명시 (Constitution XIV).
- [x] **O-5** Daily cap / consecutive-fail emergency stop.

**Checkpoint O**: default-OFF, opt-in 1 acknowledgement, cap 도달 시 즉시
disable, emergency stop verify.

---

## Phase P — AI Analyst (single outcome) — ✓ DONE

> Detailed task list: Cowork #125, #128–#133. Spec: `contracts/ai-analyst.md`.

- [x] **P-1** `lib/llm-raw.ts` — `analyzeOpenAiRaw` / `analyzeAnthropicRaw` browser fetch.
- [x] **P-2** `app/settings/page.tsx` — API key 입력 + test.
- [x] **P-3** `components/AIAnalyzePanel.tsx` — outcome 페이지 통합.
- [x] **P-4** CSP — `api.openai.com` / `api.anthropic.com` 화이트리스트.
- [x] **P-5** AIAnalyzePanel 컨텍스트 enrich (orderbook / position).
- [x] **P-6** Tier 2 web search 통합 (Tavily).

**Checkpoint P**: outcome 페이지에서 Analyze → Network 탭에 provider host
직접 호출 (backend 통과 X). fair % + edge + reasoning + sources 표시.

---

## Phase Q — Multi-provider AI keys — ✓ DONE

Phase P 의 settings 와 합쳐짐. Tavily / FRED / football-data / OpenWeatherMap
키도 같은 페이지에 추가.

---

## Phase R — Settings UX consolidation — ✓ DONE

Phase Q 와 합쳐짐.

---

## Phase S — AI Discovery (cross-market) — ✓ DONE

> Detailed task list: Cowork #137–#140. Spec: `contracts/discovery.md`.

- [x] **S-1** `lib/discovery.ts` — `fetchActiveCandidates`, `enrichWithSpecialists`, `askLlmDiscover`.
- [x] **S-2** `components/AIDiscovery.tsx` — query input + result list + add-to-basket.
- [x] **S-3** 메인 page 에 Discovery 탭 추가.
- [x] **S-4** Auto-explore + 1h localStorage cache.

**Checkpoint S**: query 없이 진입 → 30초 이내 ranking list 도달.
hallucinated outcomeId 0건 (sanitize 가드).

---

## Phase T — Domain specialists — ✓ DONE

> Detailed task list: Cowork #141–#146.

- [x] **T-1** `lib/categorize.ts` — outcome → Category.
- [x] **T-2** `lib/specialists.ts` (또는 `lib/specialists/*`) — CoinGecko / football-data / FRED / Tavily / OpenWeatherMap.
- [x] **T-3** `discovery.enrichWithSpecialists` 통합.
- [x] **T-4** CSP + Settings 추가 API 화이트리스트.

**Checkpoint T**: 도메인별 raw 신호가 discovery candidate 라인에 한 줄 요약
attach. 외부 API timeout 시 silent fallback.

---

## Phase U — Deep agents — ✓ DONE (testnet 검증 1건 pending)

> Detailed task list: Cowork #147–#155, U-7 (testnet 검증) #156 pending.
> Spec: `contracts/deep-agents.md`.

- [x] **U-1** `lib/agents/types.ts` — `AnalystOutputSchema` (Zod).
- [x] **U-2** `lib/agents/skills.ts` — 5 도메인 SKILL prompt (crypto/sports/macro/politics/weather).
- [x] **U-3** `lib/agents/fetchers.ts` — 도메인별 RawSignals fetcher 확장.
- [x] **U-4** ~~`lib/agents/analyst.ts` (절대 단일 함수로 분리될 필요 없어 orchestrator 에 흡수)~~.
- [x] **U-5** `lib/agents/orchestrator.ts` — `analyzeOutcomeDeep` (categorize → fetcher → SKILL → LLM 1회 → safeParse → fold).
- [x] **U-6** `discovery.enrichWithDeepAnalysts` — top 12 candidate 만 parallel 6.
- [ ] **U-7** testnet 검증 — BTC outcome 1개 골라서 deep analysis 결과 (fair % + reasoning + sources) sanity check.

**Checkpoint U**: AnalystOutputSchema 통과율 ≥ 95%. fetcher 실패 시 fallback,
discovery loop stall 0건. cited URL 이 모두 fetcher 의 실제 반환값.

---

## Phase V — Mainnet rollout — pending

- [ ] **V-1** `contracts/mainnet-rollout.md` 갱신 — AI features 운영 고려사항 + Constitution XII-XV 검증 체크리스트.
- [ ] **V-2** Builder address 의 mainnet `approveBuilderFee` 실행 (builnad).
- [ ] **V-3** Mainnet build env 의 `NEXT_PUBLIC_BUILDER_*` set.
- [ ] **V-4** Autobet emergency-stop end-to-end test on mainnet (소액).
- [ ] **V-5** Monitoring — `/trade-forward` uptime + error rate 알림.
- [ ] **V-6** 1차 launch announcement (Discord / X — builnad).

**Checkpoint V**: mainnet 에서 trade 1건 정상 forward, basket 1건 정상 forward,
autobet emergency-stop 정상 작동.

---

## Test Coverage Targets (Phase K-U 추가)

- `lib/agent.ts` — 암호화 round-trip golden fixture.
- `lib/signing/agent-sign.ts` — Python SDK 의 sign_l1_action 과 byte-equal golden fixture (이미 J 시점 확보).
- `lib/basket.ts` — localStorage upsert / remove / clear 단위 100%.
- `lib/trade.ts` `placeBasketBet` — `orders[]` 가 leg 순서 + builder 정확 attach 검증.
- `lib/autobet.ts` `evaluateCandidate` — 10 known case golden 100/100.
- `lib/categorize.ts` — 20 sample outcome 의 category mapping 정확.
- `lib/discovery.ts` — `fetchActiveCandidates` 가 1% < px < 99% 만 포함, sanitize 가 hallucinated id 100% drop.
- `lib/agents/orchestrator.ts` — fetcher failure / LLM non-JSON / Zod parse fail 3 fallback path 100% 검증.
