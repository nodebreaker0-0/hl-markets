# Feature Specification: hl-markets (Hyperliquid outcome markets public explorer)

**Feature Branch**: `001-hl-markets` (renamed from `001-hl-gov` in task #53)
**Created**: 2026-05-24
**Pivoted**: 2026-05-27 (was `hl-gov` — see CHARTER §1 for the pivot note)
**Last updated**: 2026-05-28 (Phases K-U landed: agent flow, basket bet, AI analyst, discovery, deep agents, autobet)
**Status**: Draft v0.5
**Input (original)**: builnad — "HL 전용 폴리마켓 앱. 진행 중인 outcome 거버넌스 + 현재 trading 마켓 + 정산된 마켓 히스토리. 거버넌스 일반 / delisting / delegations / 가상투표 모두 제외. Polymarket-스타일 multi-option 카드, 옵션별 % chance + 유동성 + 수익 기회 표시. 모바일 친화, testnet/mainnet 둘 다."
**Input (v0.5 expansion)**: builnad — "trade UI 만으로는 안 됨. 다리(leg) 여러 개를 한 번에 사는 basket bet, 사용자 자신의 LLM key 로 AI analyst, 도메인별 specialist + deep agent 로 candidate 마다 fair % 추산, 그리고 그걸 rule 기반으로 자동매수 하는 autobet. 단, key custody 절대 0, AI 는 항상 advisory only, autobet 은 명시 opt-in."

## User Scenarios & Testing

### User Story 1 — Markets 탭에서 현재 trading 중인 outcome 둘러본다 (P1, MVP)

**시나리오**: 사용자가 `hl-markets.bharvest.io` 접속 → testnet 또는 mainnet 선택 → Markets 탭 → 폴리마켓 식 question 카드 (multi-option) + standalone binary 카드 본다. 각 카드에 마켓 이름, 옵션별 % chance, 만료시간.

**Why P1**: 앱의 정체성. 이게 안 보이면 hl-markets 의미 0.

**Independent Test**: localhost frontend → mainnet → Markets 탭 → 최소 1개 question 카드 (e.g. "May CPI year-over-year") + 옵션 3개의 % chance 가 표시되면 통과.

**Acceptance Scenarios**:
1. **Given** 사용자가 `/` 진입, **When** network = Mainnet + tab = Markets, **Then** 1초 이내 outcomeMeta + allMids 가 fetch 되고 question 카드 + standalone 카드가 보임.
2. **Given** question 카드 (e.g. CPI), **When** 카드 클릭, **Then** `/q?network=&id=` 진입, 옵션 list + selected option 의 24h chart + orderbook + buy depth/max profit.
3. **Given** standalone 카드 (e.g. priceBinary), **When** 카드 클릭, **Then** `/o?network=&id=` 진입, side toggle + chart + orderbook.
4. **Given** mobile viewport (375px), **When** Markets 탭, **Then** 한 손 사용 가능, 카드 1열 grid, overflow 없음.
5. **Given** wallet 미연결, **When** 모든 탭 / 모든 detail, **Then** 정상 동작 (wallet 강제 X).

### User Story 2 — Pending 탭에서 새로 deploy 될 outcome 본다 (P1)

**시나리오**: HL 사용자가 Pending 탭 → 현재 validator pool 에서 vote 진행 중인 outcome 거버넌스 본다. 옵션 / 사이드 이름, 만료시간, voted/not-voted validator, quorum progress.

**Why P1**: "곧 거래 가능해질 마켓" 을 미리 본다. trader 가 launch 시점에 대비할 수 있음.

**Independent Test**: HF `validatorL1Votes` 응답 중 `O` (outcome variant) 액션이 있으면 카드 노출 + `D` (delisting) 는 안 보이면 통과.

**Acceptance Scenarios**:
1. **Given** Pending 탭, **When** 진입, **Then** HF validatorL1Votes 응답 중 variant=outcome 인 것만 카드로 표시.
2. **Given** 카드, **When** 클릭, **Then** `/g?network=&id=` 진입 — outcome renderer 가 마켓 이름 + 옵션 + 통과 quorum 표시.
3. **Given** delisting 또는 unknown variant 가 응답에 섞여 있음, **When** Pending 탭, **Then** 그것들은 노출 안 함.

### User Story 3 — Historical 탭에서 정산된 outcome 본다 (P2)

**시나리오**: 사용자가 Historical 탭 → indexer 에 저장된 settled / expired outcome 거버넌스 본다. 정산 시점, 최종 voter 카운트, quorum 도달 여부.

**Why P2**: 마켓 결과 + 과거 거버넌스 진행 패턴 분석. "어떤 outcome 들이 통과했는지" 의 ground truth.

**Independent Test**: backend `/governance?network=&status=historical&variant=outcome` 가 settled/expired row 만 반환, frontend 에서 카드로 표시되면 통과.

**Acceptance Scenarios**:
1. **Given** Historical 탭, **When** 진입, **Then** backend `/governance?status=historical&variant=outcome` 호출, 응답 row 들이 카드로 표시.
2. **Given** 빈 응답 (indexer 가 아직 settled mark 안 했음), **When** Historical 탭, **Then** "No historical outcomes yet — indexer marks pending → settled only after expireTime passes" 안내.
3. **Given** 카드, **When** 클릭, **Then** `/g?network=&id=` 진입, frontend 가 HF live list 에서 못 찾으면 backend detail 로 fallback.

### User Story 4 — Settled / expired 거버넌스 historical 본다 (P2)

**시나리오**: 사용자가 historical 탭 → 과거 settled outcome / delisted asset 목록 + 결과. delisting 은 `meta.universe.isDelisted` 도 즉시 사용 가능.

**Why P2**: archive 가치. 거버넌스 행동 분석.

**Acceptance Scenarios**:
1. **Given** historical 탭, **When** 진입, **Then** 시간순 (최신 우선) settled / expired 거버넌스 카드.
2. **Given** historical outcome, **When** detail 클릭, **Then** 최종 정산 결과 (어느 side 가 winner) + 시각.
3. **Given** historical delisting, **When** detail 클릭, **Then** 해당 asset 의 delisting 시점 + meta.universe 확인.

### User Story 5 — Outcome detail Polymarket-style (P3)

**시나리오**: outcome 거버넌스 detail 페이지가 Polymarket-스타일. 큰 제목, 설명, side 가격 (HF perp 시장), 시간순 가격 차트, validator voted/not-voted, 가상투표 leaderboard, 정산 조건, 만료.

**Why P3**: 시각적 매력 + 데이터 풍부도. 차별화 핵심.

**Acceptance Scenarios**:
1. **Given** outcome detail, **When** 진입, **Then** side perp 시장 현재가 (HF `metaAndAssetCtxs`) 표시.
2. **Given** 동일, **When** 차트 영역, **Then** HF `candleSnapshot` 의 24h 가격 (probability) 차트.
3. **Given** settled outcome, **When** 진입, **Then** 최종 winner side + 정산 가격 + 정산 시각.

### User Story 6 — Connected wallet user chats on the market they trade (P1, Phase J)

**시나리오**: `/q?id=` 또는 `/o?id=` 진입 → 우측 하단의 `Connect wallet` 클릭 → MetaMask 팝업 → EIP-712 typed data 1회 sign → backend 가 JWT (HttpOnly cookie, 24h) 발급 → chat composer 활성화 → 그 마켓의 chat room 에서 다른 trader 들과 대화. 자신의 wallet address 옆에 `Yes long` / `No long` / `—` 자동 표시.

**Why P1**: hl-markets 를 단순 explorer 에서 **trading community** 로 끌어올리는 변곡점. 폴리마켓의 가장 끈끈한 부분.

**Independent Test**: localhost 에서 testnet wallet 2개로 같은 `/q?id=` 페이지 열고 한 쪽에서 메시지 전송 → 다른 쪽에서 < 2초 안에 수신 + 양쪽 address 옆에 정확한 position badge.

**Acceptance Scenarios**:
1. **Given** wallet 미연결, **When** `/q?id=` 진입, **Then** chat list read-only + "Connect to chat" CTA.
2. **Given** wallet 연결 + sign 완료, **When** composer 에 텍스트 입력 + Enter, **Then** 1초 이내 자신의 메시지 보이고 다른 viewer 에게 WebSocket push.
3. **Given** 자신이 그 마켓에 < $1 position, **When** 메시지 전송, **Then** "Minimum position required to chat" 차단 + tooltip.
4. **Given** rate limit (10/min) 초과, **When** 11번째 메시지, **Then** "Slow down" 1분 차단.
5. **Given** session JWT 만료 (24h+), **When** 메시지 전송, **Then** 자동 재-sign 요청.
6. **Given** 메시지에 외부 link (http://attacker.com), **When** 전송 시도, **Then** automod 차단.

### User Story 7 — Trader places an order from the market page with builder code (P1, Phase J.5)

**시나리오**: 같은 페이지의 Trade widget. side / size / price / TIF 입력 → "Buy Yes at $0.43" 버튼 → confirm 모달이 **builder fee 5 bps (≈ $X)** 명시 → MetaMask HL action sign → backend `/trade-forward` 가 sig+action 을 byte-for-byte HF `/exchange` 로 forward → HF 응답 표시.

**Why P1**: builder code 수익 + 사용자 이탈 방지 (HL Trade 외부로 안 보냄).

**Independent Test**: testnet 에서 1개 outcome 의 Yes side 에 0.01 share 매수 → builder fee row 가 stats CSV 에 1건 기록 → backend 가 action 을 mutate 하지 않았다는 audit log.

**Acceptance Scenarios**:
1. **Given** wallet 연결 + builder approval 부재, **When** 첫 주문 시도, **Then** `approveBuilderFee` 1회 sign 흐름 트리거.
2. **Given** builder approval 완료, **When** 주문 sign, **Then** confirm 모달에 (side, size, price, TIF, asset key, builder fee) 6 항목 노출.
3. **Given** sign 완료, **When** backend `/trade-forward`, **Then** HF status 응답 그대로 UI 노출.
4. **Given** sign 한 action 의 `builder.f > 100` (= 0.1% perp 한도 초과), **When** /trade-forward, **Then** 400 reject (Constitution XI 가드).

### User Story 8 — Trader approves an agent and trades popup-free (P1, Phase K)

**시나리오**: 사용자가 첫 trade 시 "Enable Trading" 2-step onboarding 본다.
(1) 브라우저가 random 32 byte privkey 생성 → IndexedDB 에 wallet 서명으로
파생한 키로 암호화 저장. (2) 사용자가 1회 `approveAgent` HL action sign
→ HF 에 agent 등록. 이후 모든 buy/sell/basket/cancel 은 agent privkey 로
사인 → popup 0회.

**Why P1**: prediction-market trading 의 빈도 (분당 click) 가 wallet popup
한계를 넘는다. Polymarket 의 가장 사용자친화적인 부분이 popup-free 인데,
HL 의 `approveAgent` 가 정확히 그 구조 (HL 자체 trade 사이트 동일 pattern).

**Independent Test**: testnet wallet 으로 agent 한 번 approve 후
"Buy Yes $10" 5회 연속 → popup 1회 (approveAgent) + nothing more.

**Acceptance Scenarios**:
1. **Given** 사용자가 처음으로 buy 시도, **When** TradeWidget click,
   **Then** `<EnableTradingModal>` 노출 (2-step UI: agent 생성 → approve sign).
2. **Given** approve 완료, **When** 두 번째 buy, **Then** wallet popup 0회,
   agent privkey 로 즉시 sign → forward.
3. **Given** 같은 wallet 으로 다른 브라우저 / 다른 tab 에서 trade,
   **When** trade 시도, **Then** 그 브라우저에 IndexedDB 가 없으므로
   `<EnableTradingModal>` 다시 노출 (agent 가 device-specific).
4. **Given** 사용자가 wallet 을 잃었거나 brower clear,
   **When** trade 시도, **Then** 새 agent 생성 + 새 approve. 기존 agent 는
   HL 의 `disapproveAgent` 로 정리 가능 (수동).
5. **Given** IndexedDB 손상 / 키 복호화 실패,
   **When** trade 시도, **Then** "Agent unavailable, re-enable trading" UI +
   기존 agent 정리 흐름.

### User Story 9 — Trader builds and ships a multi-leg basket bet (P1, Phase L+M)

**시나리오**: 사용자가 Markets 에서 worldcup 의 France·Brazil·Argentina YES 옵션을
각각 ‘Add to basket’ → BasketSheet 에 3개 leg 누적 → leg 별 USD size 조정 →
"Ship basket" → HL `order` action 의 `orders` 배열에 3개 leg 동시 포함 →
agent privkey 1회 sign → backend forward → HF 가 3 fill 동시 응답.

**Why P1**: prediction-market 의 핵심 UX 는 "여러 outcome 에 분산" 인데
HL UI 는 outcome 마다 따로 사야 한다. basket 1회 사인은 우리만의 차별점.

**Independent Test**: testnet 에서 3 leg basket (각 $10) 한 번 click →
HF response 가 3 status row, builder fee row 가 3건 audit log 에 기록.

**Acceptance Scenarios**:
1. **Given** Markets 에서 outcome card, **When** "Add to basket" click,
   **Then** localStorage `basket-v1` 에 leg push, BasketSheet badge 갱신.
2. **Given** BasketSheet open, **When** leg row 에서 size 변경 / 제거,
   **Then** localStorage 동기화 + projected payout 표 갱신.
3. **Given** 3 leg, **When** "Ship basket", **Then** `order` action 의
   `orders: Order[]` 가 3개 leg + 각 leg builder fee 동일 → 1 sign → forward.
4. **Given** 사인된 action, **When** backend `/trade-forward`,
   **Then** Constitution XI 가드 (order field 수정 X, builder.b == env,
   builder.f ≤ max) 통과 후 byte-for-byte forward.
5. **Given** HF 응답이 partial fail (1 leg fail, 2 leg ok),
   **When** UI render, **Then** leg row 마다 status (filled / rejected / partial)
   visual 구분.

### User Story 10 — Trader closes a position partially from Portfolio (P1, Phase N)

**시나리오**: Portfolio 탭 → 보유 outcome row 에서 "Cash out 50%" slider
→ agent sign → HF sell. open order row 에서 "Cancel" → HF cancel.

**Why P1**: open 만 가능하고 close 가 안 되면 trader 가 다음 라운드에 안 옴.

**Acceptance Scenarios**:
1. **Given** Portfolio, **When** 진입, **Then** `clearinghouseState` +
   `openOrders` 조합으로 보유 outcome row + 진행중 order row 별도 섹션 표시.
2. **Given** 보유 row, **When** "Cash out 50%" slider + confirm,
   **Then** 보유의 50% 만큼 sell market 으로 agent sign → forward.
3. **Given** open order row, **When** "Cancel",
   **Then** `cancel` action 으로 agent sign → forward → HF 응답 표시.
4. **Given** sell fill 발생, **When** HF userFills push,
   **Then** Portfolio 즉시 갱신 + Fill toast notification.

### User Story 11 — AI analyzes a single outcome on the market page (P2, Phase P+Q)

**시나리오**: `/o?id=` 진입 → "Analyze with AI" 버튼 → AIAnalyzePanel 펼침 →
브라우저가 localStorage 의 OpenAI/Anthropic key 로 LLM 직접 호출 →
domain category (crypto/sports/macro/...) 자동 분류 → 그 도메인의 fetcher 가
raw 신호 수집 (no LLM) → SKILL prompt + raw 신호 → LLM 1회 호출 →
AnalystOutput (fairPct, edge, confidence, reasoning bullets, sources,
rawSignals) → 즉시 UI 표시.

**Why P2**: trader 의 "이 outcome 진짜로 가치가 있나?" 질문에 즉답.

**Acceptance Scenarios**:
1. **Given** Settings 에 OpenAI key 입력, **When** outcome 페이지 "Analyze",
   **Then** browser fetch 가 `api.openai.com` 직접 호출 (backend 통과 X
   — Network 탭에서 확인 가능).
2. **Given** Anthropic key 만, **When** Analyze, **Then** Anthropic 으로 라우팅.
3. **Given** key 미입력, **When** Analyze 버튼,
   **Then** "Set up your AI key" CTA (Settings 링크).
4. **Given** Analyze 응답, **When** UI render, **Then** fair % + edge bar +
   confidence (1-5) + reasoning bullets + cited sources (label + URL) +
   rawSignals 표시.
5. **Given** LLM 응답이 schema parse 실패, **When** UI,
   **Then** fallback (marketPct = fairPct, low confidence) + 디버그 메시지.

### User Story 12 — User asks AI to find best bets across all markets (P2, Phase S+T+U)

**시나리오**: Discovery 탭 → 자연어 query ("높은 confidence 50센트 미만"
또는 빈 query 로 "Auto-explore") → fetchActiveCandidates → 도메인별
specialist (live crypto price / FRED 데이터 / Tavily 검색 등) parallel
enrich → top 12 candidate 는 deep-agent 단일 LLM 분석 → 최종 ranking LLM
call → 도메인 mix 된 top-K list. 각 row: outcome 이름 + market % + fair %
+ edge + confidence + reasoning. 사용자가 각 row 를 basket 에 add.

**Why P2**: HL 의 200+ 활성 outcome 중 사람이 다 보기 불가능. AI 가
"오늘 가치 있어 보이는 N 개" 를 mixed-domain 으로 추천.

**Acceptance Scenarios**:
1. **Given** Discovery 탭 첫 진입, **When** auto-explore 활성,
   **Then** 자동으로 light pipeline 실행 → 1시간 캐시 (localStorage).
2. **Given** 자연어 query 입력 + Discover, **When** pipeline,
   **Then** specialist enrich → deep agents (top 12 만) → final rank → list.
3. **Given** result list, **When** row 의 "Add to basket",
   **Then** BasketSheet 에 leg 추가 + 추천 quarter-Kelly size 미리 채움.
4. **Given** result 의 reasoning, **When** UI,
   **Then** deep-agent 의 reasoning bullets + source 들 표시 (Tavily / FRED 등).
5. **Given** 모든 candidate edge 0 미만, **When** result,
   **Then** "No edge found" 표시 (Constitution XIV — 억지 추천 X).

### User Story 13 — User enables autobet with rules and caps (P2, Phase O)

**시나리오**: Autobet 페이지 → daily USDC cap + per-bet max + min edge pp +
category allow/block + emergency-stop config 입력 → Enable 토글 ON. 이후
브라우저가 열려 있는 한 5분마다 `AutobetTicker` 가 백그라운드 scan →
candidates 중 rule 통과 + edge ≥ min 인 것 → agent sign → forward →
recent log 에 row 추가. cap 도달 / consecutive failure / 사용자 Disable
시 즉시 stop.

**Why P2**: "AI 가 매수해 줘" 는 prediction-market 의 자연스러운 다음 step
이지만 안전 가드가 없으면 위험. Constitution XIV 가 가드.

**Acceptance Scenarios**:
1. **Given** Autobet 페이지 진입, **When** 처음, **Then** Enable = OFF
   (default-off, Constitution XIV.1).
2. **Given** rule 입력 + Enable, **When** 5분 ticker,
   **Then** scan 실행 → 통과 candidate 가 dry-run preview 에 노출.
3. **Given** dry-run 확인 후 "Execute pending",
   **When** click, **Then** 각 leg agent sign → forward → log row 추가.
4. **Given** consecutive 3 fail, **When** ticker, **Then** 즉시 Disable +
   "Emergency stop — 3 consecutive failures" 통지.
5. **Given** daily cap 도달, **When** ticker, **Then** Disable + "Daily cap
   reached" 통지.
6. **Given** browser tab close, **When** 다음 5분 tick, **Then** 자동 실행 X
   (browser-only 가 의도; serverless autobet 은 out of scope).

### Edge Cases

- HF /info endpoint 일시 down → backend indexer 가 마지막 성공 snapshot 유지. UI 가 "last fresh: NN min ago" 표시.
- DB 비어있는 첫 가동 → API 가 빈 list 응답. SPA 는 HF info 직접 fetch 로 pending + markets 만 보임.
- 새 variant 가 publisher 에서 등장 → unknown variant 카드 + raw JSON dump + warning.
- 모바일 가로 모드 / 세로 모드 둘 다 작동.
- chat 메시지 sig (JWT) 만료 → 다음 send 시 401, 클라이언트가 자동 재-sign 흐름.
- 마켓 정산 시점 → 그 room 의 chat_message 자동 삭제 (CHARTER §3 retention).
- Builder approval 한도 (사용자 → builder) 초과 trade → HF 가 reject. UI 에 "approve more" 안내.
- chat 메시지 위조 시도 (JWT 없이 WS 메시지) → backend reject + connection close.
- (Phase K) IndexedDB 손상 / corruption → agent 사용 불가, 사용자에게 re-enable 안내. backend 가 agent 재발급 시도 X.
- (Phase L) HF `/exchange` 에서 일부 leg 만 fill, 나머지 reject → UI 가 leg-by-leg status 표시. 자동 retry X.
- (Phase O) browser tab close 동안에는 autobet scan 안 됨 (browser-only 의도). 사용자가 "background" 옵션 요청해도 거부 (server-side autobet 은 zero-custody 위반).
- (Phase P-U) LLM provider rate limit / 429 → fallback (cache 또는 "AI temporarily unavailable") + 사용자에게 cost 안내.
- (Phase T) Tavily 무료 tier (1000 req/mo) 초과 → 안내 + 더 이상 fetch X (Constitution XV — fallback 우아).
- (Phase U) 한 도메인의 fetcher (e.g. football-data) 가 timeout 또는 500 → 그 candidate 만 deep-agent 결과 없이 progress, 다른 candidate 는 정상.

## Requirements

### Functional Requirements

#### Phase B — Frontend skeleton (P1)

- **FR-001**: System MUST Next.js 14 static export, HL 다크/민트 톤, mobile-first responsive.
- **FR-002**: System MUST 네트워크 selector (testnet/mainnet), default 없음, 색상 시각 단서.
- **FR-003**: System MUST 메인 페이지 layout — header + tabs (Active / My Delegations / Historical) + footer.

#### Phase C — Live data (P1)

- **FR-010**: System MUST `validatorL1Votes` + `validatorSummaries` + `meta` + `spotMeta` 를 HF 에 직접 fetch (CORS allow-list).
- **FR-011**: System MUST pending governance 카드 — variant (Outcome/Delisting/Unknown) + 요약 (제목, ticker) + 통과 진행도 (stake % + count %) + 만료.
- **FR-012**: System MUST 통과 기준 = **stake ≥ 20%** AND **count ≥ 50%** of active validators. 현재값은 active 의 합산 stake 와 count 로 계산.
- **FR-013**: System MUST 카드 클릭 시 `/g/<network>/<gov_id>` detail 페이지. variant 별 renderer.
- **FR-014**: System MUST `meta.universe[].isDelisted` 가 true 인 perp / spot 항목을 "Historical delistings" 탭에 표시 (Phase F 의 일부 historical).

#### Phase D — Delegation lookup (P1)

- **FR-020**: System MUST wallet 연결 (EIP-1193 직접) — MetaMask + 호환 wallet.
- **FR-021**: System MUST `delegations(user)` fetch → 내 delegation list + each row 의 validator name 매핑 (validatorSummaries cross-ref).
- **FR-022**: System MUST "My Delegations" 탭 — 각 row 가 (validator name, stake, current pending votes 표).
- **FR-023**: System MUST 내 validator 가 N시간 vote 안한 pending 거버넌스가 있으면 시각적 강조.

#### Phase E — Local backend (P1)

- **FR-030**: System MUST `apps/api` Hono Node single process. Mac local `docker-compose up postgres && cd apps/api && npm run dev` 로 동작.
- **FR-031**: System MUST in-process `node-cron` 매분 trigger — testnet + mainnet 각각 `validatorL1Votes` + `validatorSummaries` + `meta` fetch.
- **FR-032**: System MUST 새 pending governance 발견 시 `governance` 테이블 upsert. 기존 governance 가 다음 polling 에 사라지면 `status = settled or expired` 로 표시 (정확한 settled 판단은 quorum + 시간 기반).
- **FR-033**: System MUST validator snapshot (name/stake/active/jailed) 도 매 polling 마다 upsert (시계열 분석 위해).

#### Phase F — Historical API (P2)

- **FR-040**: System MUST GET `/governance?network=X&status=historical` 응답 — settled/expired 거버넌스 시간순.
- **FR-041**: System MUST GET `/governance/{network}/{gov_id}` 응답 — 한 거버넌스의 모든 정보 (action, votes timeseries, final status, settled_at).
- **FR-042**: SPA 가 pending (HF 직접) + historical (hl-markets API) 합쳐서 timeline 표시.

#### Phase G — 가상투표 (P2)

- **FR-050**: System MUST EIP-712 typed-data로 가상투표 sign. domain = `{ name: "hl-markets", version: "1", chainId: <wallet active>, verifyingContract: 0x0 }`. message = `{ network, govId, side, signedAt }`.
- **FR-051**: System MUST POST `/poll-vote` 받으면 sig 검증 (recovery → signer == declared). DB upsert.
- **FR-052**: System MUST 같은 (network, gov_id, voter_addr) duplicate 차단 또는 update (정책: **update — 사용자 마음 변경 OK**, 단 마지막 vote 만 카운트).
- **FR-053**: System MUST GET `/poll-results?network=X&gov_id=Y` 응답 — head count + stake-weighted (voter 의 `voter_stake` 합산).
- **FR-054**: System MUST 가상투표 결과 UI 에 "참고용 신호 — validator 실제 거버넌스 아님" 명시.

#### Phase H — Outcome detail Polymarket-style (P3)

> See `contracts/outcome-market.md` for the full lifecycle + data sources. HIP-4
> outcome contracts (binary, settle to 0|1) trade on HyperCore's standard
> orderbook; canonical outcomes (our case) are deployed + settled by validator
> vote. UI reference: user-provided screenshot of
> `app.hyperliquid.xyz/trade/btc-above-76877-yes-may-27-0600` (2026-05-24).

- **FR-060**: System MUST `outcomeMeta` polling — indexer 가 `(network, outcome_id) → outcome_market` row 누적. UI 가 deployed outcome 의 name/description/sideSpecs/quote_token 표시.
- **FR-061**: System MUST `allMids` `#NNNN` mapping — outcome 의 side 별 현재가 (% chance) UI 에 표시. 매핑 알고리즘 = `#` + str(outcome_id*10 + side_idx) 가설, indexer 가 cross-verify.
- **FR-062**: System MUST `l2Book` `coin=#NNNN` orderbook — Polymarket-style "Price / Size / Total" 표 + Spread row + Yes/No side toggle.
- **FR-063**: System MUST `candleSnapshot` `coin=#NNNN, interval=1h` — 24h candlestick chart (Recharts 또는 lightweight). 사용자 본 app.hyperliquid.xyz 의 chart 와 동등 정보.
- **FR-064**: System MUST settled outcome — `winner_side` (sideSpecs index) + 정산 시각 + 최종 가격 표시. trading 종료 표시.
- **FR-065**: System MUST multi-side outcome (sideSpecs 3+) 지원 — Polymarket "Below X / X-Y / Above Y" 같은 % chance 표 + 각 side 별 orderbook tab.
- **FR-066**: System MUST 거버넌스 ↔ outcome cross-ref — outcome detail 페이지에서 "deployed by governance #xxx" / "settled by governance #yyy" link (governance detail 페이지로).

#### Phase I — Polish + release host 결정 (P3)

- **FR-070**: System MUST Dockerfile 로 `apps/api` 빌드 가능, 200MB 이하 image.
- **FR-071**: System MUST 운영 host (builnad 추후 결정) 의 Postgres URL 등 env 한 곳 (.env) 으로 흡수.
- **FR-072**: System MUST custom domain `hl-markets.bharvest.io` 또는 결정 도메인.

#### Phase J.1 — Wallet connect + session sign-in (P1)

- **FR-100**: System MUST EIP-1193 wallet connect (MetaMask first). 다른 wallet 호환은 phase J.6+ 로 deferred.
- **FR-101**: System MUST EIP-712 typed-data 1회 sign 으로 sign-in. domain = `{ name: "hl-markets", version: "1", chainId: <wallet active>, verifyingContract: 0x0 }`. message = `{ address, network, nonce, issuedAt }`.
- **FR-102**: System MUST POST `/auth/sign-in` 받으면 (a) signature recovery → declared address 일치 검증, (b) `nonce` 가 24h 이내 새 nonce 인지 검증, (c) `chat_session` row insert, (d) HttpOnly cookie `hlm_session` 발급 (SameSite=Lax, Secure in prod, Path=/, Max-Age=86400). Lax 인 이유: SPA(`:3000`) 와 api(`:3001`) cross-origin fetch 에서 cookie 가 흐르도록.
- **FR-103**: System MUST POST `/auth/sign-out` — cookie clear + `chat_session.revoked_at = now()`.
- **FR-104**: System MUST GET `/auth/me` — 현재 session 의 address + expiresAt. cookie 없으면 401.

#### Phase J.2 — Chat backend (P1)

- **FR-110**: System MUST `chat_message` table — `(id, network, market_key, address, body, signed_at, deleted_at)`. `market_key` = `q:<questionId>` 또는 `o:<outcomeId>`.
- **FR-111**: System MUST WebSocket upgrade `/chat/ws?network=&marketKey=`. JWT cookie 미존재 = read-only (수신만, 전송 불가). 메시지 전송 시 server-side 가드 다음 5종 통과 필요:
  - (a) JWT 검증 + address 추출
  - (b) rate limit: 한 address 가 한 마켓에서 최근 60초 ≤ 10 메시지
  - (c) **position gate**: 그 마켓의 사용자 position notional ≥ $1 (HF `clearinghouseState`)
  - (d) automod: URL whitelist (`hyperliquid.xyz`, `x.com`, `twitter.com` 만), profanity filter (block-list), 메시지 길이 ≤ 500
  - (e) market 이 settled 시 전송 불가
- **FR-112**: System MUST GET `/chat?network=&marketKey=&before=<msgId>&limit=50` — 시간순 최신 N개. paginate.
- **FR-113**: System MUST DELETE `/chat/:id` — 메시지 작성자 본인 또는 `chat_admin` table 의 address 만. soft-delete (`deleted_at`).
- **FR-114**: System MUST 마켓 정산 시점 (question.status `trading→settled` 또는 outcome.status `trading→settled`) 그 `market_key` 의 모든 `chat_message` 자동 hard-delete (cron, 정산 후 24h 유예).

#### Phase J.3 — Chat UI per market (P1)

- **FR-120**: `/q?id=` 와 `/o?id=` 페이지가 `<ChatPanel>` 컴포넌트 노출. 모바일에서는 collapsible drawer (page 하단 sticky).
- **FR-121**: 메시지 row = `<address-display> <position-badge> <time-ago> <body>`. address-display = ENS / HL display name 우선, fallback `0x12…34`.
- **FR-122**: WebSocket 끊어지면 자동 재연결 (exp backoff 1s → 30s). 끊어진 동안의 메시지는 reconnect 시 GET `/chat?before=<lastReceivedId>` 로 fetch.
- **FR-123**: composer = textarea + Enter to send (Shift+Enter = newline). 차단 사유 (no position / rate limit / settled) UI inline 표시.

#### Phase J.4 — Position badge (P1)

- **FR-130**: Backend GET `/position?network=&address=&marketKey=` → `{ side: "yes-long" | "no-long" | "none", lastFetchedAt }`. HF `clearinghouseState` + 그 마켓의 outcome assetKeys cross-ref. cache 30s TTL.
- **FR-131**: ChatPanel 이 보이는 unique address 들의 position 을 batch fetch (한 번에 N개). 새 메시지 도착 시 그 address 가 cache 안에 없으면 lazy fetch.
- **FR-132**: 자기 자신의 position 만 정확. 다른 사람의 position 도 동일 endpoint 로 public read (HF data 가 public).

#### Phase J.5 — In-app trade with Builder Code (P1)

> Full spec: `contracts/builder-code.md`. Constitution XI 도 함께 참조.

- **FR-140**: 페이지의 `<TradeWidget>` — side toggle (Yes/No), size, price (mid 디폴트), TIF (Ioc/Gtc), confirm 버튼.
- **FR-141**: 첫 trade 전에 user 가 builder approve 안 했으면 (`info` `{type:"maxBuilderFee", user, builder}` 가 0) `<ApproveBuilderModal>` 자동 노출. 1회 sign + submit.
- **FR-142**: 주문 sign 전에 confirm 모달이 6 항목 prominent 표시: side / size / price / TIF / asset key / builder fee bps (≈ USD).
- **FR-143**: Backend POST `/trade-forward` — (a) JWT verify, (b) action.builder.b == env builder addr, (c) action.builder.f ≤ env max (default 50), (d) byte-for-byte HF `/exchange` 로 forward. (Constitution XI.)
- **FR-144**: HF 응답 (status + filled fills + 에러) 그대로 UI 노출. backend 가 응답 마사지 0.
- **FR-145**: Backend audit log — `{ts, address, action.coin, action.b, action.f, hfStatus}`. file log (Personal 운영, BI 별도 안 함).

#### 보안 / 운영 / 통합 요구사항

- **FR-080**: System MUST CORS allow-list — frontend origin 만. wildcard X.
- **FR-081**: System MUST API rate limit (per IP) — DoS 차단. 5 req/sec 한도 (조정 가능).
- **FR-082**: System MUST 외부 telemetry / analytics 0건.
- **FR-083**: System MUST EIP-712 sign-in golden fixture (byte-exact recovery) — phase J.1 verify gate.
- **FR-084**: System MUST 사용자 wallet address 외 PII 수집 0.
- **FR-085**: System MUST JWT secret 만 환경변수 (`SESSION_JWT_SECRET`, ≥ 32 bytes). 코드/repo 에 0건.
- **FR-086**: System MUST 만료된 `chat_session` row 일주일 후 자동 삭제 (cron). audit 용 7일 retain.

#### Phase K — Agent flow (popup-free trading) (P1)

> Full spec: `contracts/agent.md` + Constitution XII.

- **FR-150**: System MUST 브라우저가 random 32 byte privkey 생성 — `crypto.getRandomValues` 사용. backend 통과 X.
- **FR-151**: System MUST IndexedDB DB `hl-markets-agent-v1`, store `agents`, key = `(network, wallet)`. Value = ciphertext + IV + signed challenge string. 평문 privkey 디스크 / 메모리 dump 시 노출 0.
- **FR-152**: System MUST 암호화 key 는 wallet 의 EIP-191 signature on fixed challenge `"hl-markets-agent:v1:{wallet}:{network}"` 로부터 HKDF 도출. wallet 재서명 = 같은 key.
- **FR-153**: System MUST 사용자가 처음으로 buy/sell 시도 시 `<EnableTradingModal>` 2-step (a) "Create agent locally" — privkey 생성 + IndexedDB 저장, (b) "Approve agent on Hyperliquid" — `approveAgent` user-signed action sign.
- **FR-154**: System MUST 모든 trade (buy/sell/cancel/basket) 가 agent privkey 로 사인. wallet popup = 0회.
- **FR-155**: System MUST tab 열림 시 lazy decrypt — wallet 서명 1회 후 메모리 캐시. tab close = 메모리 wipe.
- **FR-156**: System MUST agent 복호화 실패 / IndexedDB 없음 → "Re-enable trading" 흐름 (Modal 재진입).
- **FR-157**: Backend MUST agent privkey 받지 않음. spec 자체에 entry 없음 (Constitution XII).

#### Phase L — Multi-leg basket bet (P1)

> Full spec: `contracts/basket-bet.md`.

- **FR-160**: System MUST `lib/basket.ts` localStorage key `hl-markets:basket-v1` 에 leg 배열 저장. leg = `{outcomeId, side, sizeUsd, addedAt}`.
- **FR-161**: System MUST `placeBasketBet(legs[], agentSigner)` — HL `order` action 의 `orders` 배열에 leg 별 row 합산. **단일 사인**.
- **FR-162**: Backend `/trade-forward` MUST `orders: Order[]` 의 모든 leg 에 builder field 가 동일하게 attach (env 기반). 모든 leg byte-for-byte forward.
- **FR-163**: HF 응답이 leg 별 status (filled / rejected) — UI 에 leg row 와 1:1 매핑하여 시각화.
- **FR-164**: System MUST basket 전체 size 가 사용자 freeUsdc 초과 시 사인 전 차단.
- **FR-165**: System MUST HIP-4 builder fee 정책 검증 — buy = fee 0 (HF가 zeroing), sell = fee 100%. 사용자 UI 에 솔직히 표시 (buy 시 "no fee", sell 시 "{x} bps").

#### Phase M — Basket UI (P1)

- **FR-170**: `<BasketSheet>` floating drawer (mobile bottom, desktop right rail). leg count badge + projected payout 표 (each leg 의 $ × 1/marketPct).
- **FR-171**: leg row = `<outcome name + question> <side> <USD size input> <remove>`.
- **FR-172**: "Ship basket" 버튼 — 모든 leg 한 번에 사인 + forward. 진행 중 row 별 spinner → 결과 표시.
- **FR-173**: localStorage 변경에 따라 sheet 즉시 sync (BroadcastChannel 또는 storage event).

#### Phase N — Portfolio + Cash out + Cancel (P1)

> Full spec: `contracts/portfolio.md`.

- **FR-180**: `/portfolio` route — `clearinghouseState` + `openOrders` HF 직접 fetch (10s polling). 보유 outcome row 와 진행중 order row 별도 섹션.
- **FR-181**: outcome row = `<outcome name> <side> <holding $> <mark $> <unrealized PnL>` + "Cash out" slider.
- **FR-182**: `placeMarketSell(outcomeId, sideIdx, holdingSize, percentToClose)` — 0-100% slider, agent sign.
- **FR-183**: open order row = `<outcome name> <side> <px> <sz remaining>` + "Cancel" button → HL `cancel` action.
- **FR-184**: Fill toast notification — HF userFills push 또는 polling 새 row 시 toast.

#### Phase O — Autobet (P2)

> Full spec: `contracts/autobet.md` + Constitution XIV.

- **FR-190**: `/autobet` 페이지 — config form: `dailyCapUsd, perBetMaxUsd, minEdgePp, allowCategories[], blockCategories[], emergencyStopConsecFails`. 기본값: cap = 0 (=== Disabled), perBetMax = 10, minEdgePp = 5.
- **FR-191**: System MUST `lib/autobet.ts` 가 `evaluateCandidate(c, rules)` → `{allowed: bool, reason: string, sizeUsd: number}` 순수함수. golden fixture verify gate.
- **FR-192**: `<AutobetTicker>` 컴포넌트가 global `_app.tsx` 에 mount. 5분 cron (browser-side setInterval) 으로 fetchActiveCandidates → enrichWithSpecialists → askLlmDiscover → evaluateCandidate 마다 통과 시 dry-run 큐에 추가.
- **FR-193**: 사용자가 명시 토글 = "Execute pending" 또는 "Auto-execute" (별도 토글, 둘 다 default OFF).
- **FR-194**: 일일 USDC 소비 누적 가 cap 도달 시 Enable 자동 OFF + "Daily cap reached" 토스트.
- **FR-195**: consecutive `emergencyStopConsecFails` 회 forward 실패 시 Enable 자동 OFF + 이메일/슬랙 알림 X (browser only) + UI 알림.
- **FR-196**: 모든 autobet 로그 (timestamp, outcomeId, sizeUsd, status, reason) localStorage `hl-markets:autobet-log-v1` 에 ring-buffer (최근 200건).
- **FR-197**: 첫 autobet enable 시 "I understand this places real trades. AI is advisory only." 명시 acknowledgement modal (Constitution XIV).

#### Phase P — AI Analyst (single outcome) (P2)

> Full spec: `contracts/ai-analyst.md`.

- **FR-200**: System MUST `lib/llm-raw.ts` 의 `analyzeOpenAiRaw(key, system, user, jsonMode)` / `analyzeAnthropicRaw(key, system, user)` — browser fetch 가 provider host 로 직접. backend 통과 X.
- **FR-201**: CSP allow-list — `api.openai.com`, `api.anthropic.com`, `api.tavily.com`, `api.stlouisfed.org`, `api.football-data.org`, `api.openweathermap.org`, `api.coingecko.com`. backend host 는 별개.
- **FR-202**: `<AIAnalyzePanel>` outcome 페이지 (`/o?id=`, `/q?id=`) 에 통합. "Analyze with AI" 버튼.
- **FR-203**: 분석 호출 = `analyzeOutcomeDeep(input, keys)` (Phase U orchestrator) — category 자동 분류 → fetcher → SKILL prompt + raw 신호 → LLM 1회 → `AnalystOutputSchema` 통과.
- **FR-204**: UI 가 fair % + edge + confidence + reasoning bullets + cited sources (label + URL) + rawSignals 표시.

#### Phase Q — Multi-provider AI keys (P2)

- **FR-210**: Settings 페이지 (`/settings`) — OpenAI + Anthropic + Tavily + FRED + football-data + OpenWeatherMap 키 각 input (password-type). Save 시 localStorage `hl-markets:llm-keys-v1` upsert.
- **FR-211**: "Wipe all keys" 버튼 — localStorage clear + UI 즉시 reflect.
- **FR-212**: 키 미입력 시 해당 provider 호출 0 (degrade gracefully).
- **FR-213**: 키 입력 후 "Test" 버튼 — 가장 가벼운 call (e.g. OpenAI `models` list) 로 키 유효성 검증.

#### Phase R — Settings UX consolidation (P2)

- **FR-220**: `/settings` 페이지 통합 — LLM keys + agent backup (Phase K 의 wallet+IndexedDB 가이드) + autobet rules + 데이터 wipe.
- **FR-221**: Agent backup section — wallet 분실 시 agent 도 분실됨을 명시. "your trading agent is bound to this browser" warning.

#### Phase S — AI Discovery (cross-market) (P2)

> Full spec: `contracts/discovery.md`.

- **FR-230**: `lib/discovery.ts` `fetchActiveCandidates()` — `outcomeMeta` + `allMids` 조합으로 모든 active YES side outcome 수집. 1% < px < 99% 만 포함 (extreme price 는 edge 0).
- **FR-231**: `enrichWithSpecialists(candidates, keys)` — 도메인 fetcher (`specialistFor`) 가 light Tier-2 blob (live crypto price, FRED 1-line summary 등) 을 candidate 마다 attach.
- **FR-232**: `enrichWithDeepAnalysts(candidates, keys, maxConcurrent=6)` — top N (기본 12) candidate 만 `analyzeOutcomeDeep` (Phase U) 호출. parallel 6 in-flight.
- **FR-233**: `askLlmDiscover({provider, key, query, candidates, topK=6})` — 모든 candidate (deep blob 포함) 를 LLM 에 1회 forward. JSON output `{picks: [{outcomeId, fairPct, edgePp, confidence, reasoning}]}`.
- **FR-234**: `<AIDiscovery>` 탭 — 자연어 query input + result list + "Add to basket" per row + quarter-Kelly suggested size.
- **FR-235**: Auto-explore mode — query 빈 채로 진입 시 자동 실행. 결과는 localStorage `hl-markets:discovery-cache-v1` 에 1시간 캐시.
- **FR-236**: System MUST mixed-domain output — 카테고리별 그룹화 X, 단일 ranking list.

#### Phase T — Domain specialists (Tier-3 signals) (P2)

- **FR-240**: `lib/categorize.ts` `categorize(outcomeName, description, questionTitle)` → `Category` (`crypto`/`sports`/`economics`/`politics`/`weather`/`general`).
- **FR-241**: `lib/specialists.ts` `specialistFor(category, name, description, keys)` → `SpecialistBlob | null`. 각 specialist 가 자기 도메인 API 호출 (CoinGecko / football-data / FRED 등).
- **FR-242**: Specialist 결과 = `{source: string, text: string}` light blob, candidate 의 `specialistBlob` 필드에 attach.
- **FR-243**: 외부 API 실패 시 fallback — candidate 는 그냥 specialistBlob 없이 진행. discovery loop 가 stall X (Constitution XV).

#### Phase U — Deep agents (anthropic/financial-services pattern) (P2)

> Full spec: `contracts/deep-agents.md`.

- **FR-250**: `lib/agents/types.ts` `AnalystOutputSchema` (Zod) — `{fairPct, confidence: "low"|"medium"|"high", reasoning: string[], caveat: string, sources: Source[], rawSignals: Record<string, unknown>}`.
- **FR-251**: `lib/agents/skills.ts` — 5개 도메인 SKILL prompt (crypto / sports / macro / politics / weather). 각 prompt 가 (a) workflow, (b) guardrails (no hallucination, cite sources), (c) JSON output contract 정의.
- **FR-252**: `lib/agents/fetchers.ts` — 도메인별 raw signal fetcher. **LLM 없음**, 순수 데이터 (CoinGecko 가격 + Tavily 검색 결과 + ...). `RawSignals = {blob: string, fields: Record<string, unknown>, sources: Source[]}`.
- **FR-253**: `lib/agents/orchestrator.ts` `analyzeOutcomeDeep(input, keys)` — categorize → fetcher → SKILL prompt + raw blob → LLM 1회 → JSON parse → Zod safeParse → 실패 시 fallback (marketPct = fairPct, low confidence) → 성공 시 fetcher의 sources + fields 를 결과에 fold.
- **FR-254**: 한 candidate 의 deep analysis 가 timeout / 실패해도 discovery loop 의 다른 candidate 는 계속 진행 (orchestrator 가 fallback 반환).
- **FR-255**: Discovery 의 최종 ranking call 은 deep blob 을 candidate 라인에 포함 — LLM 이 자체 analyst output 을 그대로 신뢰 가능.

### Success Criteria

- **SC-001**: Mac local 에서 `docker-compose up postgres && cd apps/api && npm run dev && cd apps/frontend && npm run dev` 로 전체 흐름 작동.
- **SC-002**: pending / markets / historical 페이지 load → 카드 표시 P95 < 2초.
- **SC-003**: 모바일 viewport 375 px 에서 모든 페이지 한 손 조작 가능 + overflow 0.
- **SC-004**: Indexer 매분 cron 실패 < 5% (cumulative). 실패 시 `last fresh` UI 표시.
- **SC-005**: ~~가상투표 sig 검증 — golden fixture~~ (Phase G removed in pivot).
- **SC-006**: Docker image < 200 MB, frontend bundle gzip < 1.5 MB.
- **SC-007**: 새 거버넌스 variant 추가 = 1 renderer 파일 + 1 classify entry. 핵심 코드 변경 0.

#### Phase J Success Criteria

- **SC-J-1**: testnet wallet 2개로 같은 `/q?id=` 페이지 열고 한 쪽에서 send → 다른 쪽 receive P95 < 2초 (WS).
- **SC-J-2**: sign-in golden fixture (`{address, network, nonce, issuedAt}` typed-data ↔ signature ↔ recovered address) 100/100.
- **SC-J-3**: position gate — 그 마켓에 position 0 인 wallet 의 전송이 100% backend reject.
- **SC-J-4**: rate limit — 11번째 메시지가 1분 내 100% reject.
- **SC-J-5**: Backend audit log — `/trade-forward` 가 받은 action.coin/side/sz/px/tif 와 HF 로 forward 한 action 의 동일 5 fields byte-equal (Constitution XI 검증).
- **SC-J-6**: Builder approval 안 한 user 의 첫 trade 시 100% `<ApproveBuilderModal>` 노출.
- **SC-J-7**: chat_message gzip footprint — 6 개월 운영 후 < 1 GB (메시지 길이 500 char × 평균 트래픽 가정).

#### Phase K-U Success Criteria

- **SC-K-1**: testnet 에서 agent approve 1회 후 buy/sell 10회 연속 — wallet popup 1회 (approveAgent) 만, 이후 0.
- **SC-K-2**: IndexedDB inspect — `hl-markets-agent-v1` 의 record 가 평문 privkey 를 포함하지 않음 (ciphertext + IV + signed challenge 만).
- **SC-K-3**: backend audit log — `/trade-forward` 에 agent privkey 가 들어온 적 0건 (Constitution XII).
- **SC-L-1**: testnet 3-leg basket 사인 1회 → HF 응답 3 fill, builder fee row 3건 (audit log).
- **SC-L-2**: HIP-4 fee 정책 검증 — testnet 100-unit sell 의 builder fee = 0.0265665 USDC (5 bps 환산), buy 의 builder fee = 0 (`docs/HIP4-fee-policy.md` 의 evidence 재현 가능).
- **SC-N-1**: Portfolio "Cash out 50%" — agent sign 1회 → HF fill 정확히 50% holding.
- **SC-N-2**: open order Cancel 1회 → HF response status `success`.
- **SC-O-1**: Autobet rule engine golden fixture — `evaluateCandidate(c, rules)` 의 10 known case 100/100 match.
- **SC-O-2**: Emergency stop 검증 — 3 consecutive failure 후 즉시 Disable, 4번째 tick 에 forward 호출 0.
- **SC-O-3**: Daily cap 검증 — 누적 USDC = cap 도달 후 다음 tick 의 forward 호출 0.
- **SC-P-1**: AIAnalyzePanel 호출 — Network 탭에서 `api.openai.com` 또는 `api.anthropic.com` 으로 직접 fetch (backend host 거치지 X).
- **SC-P-2**: `AnalystOutputSchema` 통과율 — 100 outcome 분석 중 schema parse 실패 5건 이하 (fallback path 가드 검증).
- **SC-Q-1**: Settings 에 OpenAI key 입력 후 wipe → localStorage 의 key 항목 즉시 삭제.
- **SC-Q-2**: backend audit log — 사용자 LLM key 가 backend 통과 0건 (Constitution I).
- **SC-S-1**: Discovery "Auto-explore" 첫 진입 → 30초 이내 ranking list 도달 (LLM provider 응답 정상 시).
- **SC-S-2**: Result 의 outcome 모두가 candidate list 에 존재 (LLM 의 hallucination 0건).
- **SC-T-1**: Tavily 무료 tier 초과 시 specialist 가 silent skip → discovery loop stall 0건.
- **SC-U-1**: deep agent 의 한 fetcher (e.g. football-data) timeout → 그 candidate 만 fallback (marketPct = fairPct), 다른 candidate 는 정상 진행.
- **SC-U-2**: `AnalystOutput.sources` 의 모든 URL 이 fetcher 가 실제 반환한 source (LLM 만들어낸 URL 0건).

## Out of Scope (모든 Phase)

- validator key 보유 / 서명 / submit (그건 hl-vote-web).
- 자체 orderbook / matching engine. HF `/exchange` 로만 forward.
- 가상투표 / EIP-712 straw poll (v0.3 pivot 에서 제거; Phase J 채팅이 대체).
- multi-tenant — 다른 운영팀 자체 deploy (필요시 fork).
- Email / push notification.
- nickname / handle 시스템 — wallet address 만 ID (ENS / HL display name resolve 만).
- Image / GIF / file upload — 텍스트 only (≤ 500 char).
- DM / private chat — public market room 만.
- (Phase K-U 추가)
- Server-side autobet — browser tab close 시 autobet 멈춤 (Constitution XII/XIV 가드).
- Backend-managed LLM key — provider 호출은 browser → provider 직접만.
- 다른 trader 의 agent 사용 / share — agent 는 device-specific.
- AI 가 사용자 사전동의 없이 거래 — autobet 외 path 자동 거래 X.
- Multi-domain ranking 그룹화 — Phase S 의 단일 mixed list 가 의도.
- Image / chart 생성 AI — text 분석만 (cost / privacy).
- LLM provider 외 third-party AI (Bedrock, Gemini, Mistral 등) — OpenAI + Anthropic 만 첫 단계.
