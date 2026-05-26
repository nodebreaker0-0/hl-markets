# Feature Specification: hl-markets (Hyperliquid outcome markets public explorer)

**Feature Branch**: `001-hl-markets` (renamed from `001-hl-gov` in task #53)
**Created**: 2026-05-24
**Pivoted**: 2026-05-27 (was `hl-gov` — see CHARTER §1 for the pivot note)
**Status**: Draft v0.3
**Input**: builnad — "HL 전용 폴리마켓 앱. 진행 중인 outcome 거버넌스 + 현재 trading 마켓 + 정산된 마켓 히스토리. 거버넌스 일반 / delisting / delegations / 가상투표 모두 제외. Polymarket-스타일 multi-option 카드, 옵션별 % chance + 유동성 + 수익 기회 표시. 모바일 친화, testnet/mainnet 둘 다."

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

### Edge Cases

- HF /info endpoint 일시 down → backend indexer 가 마지막 성공 snapshot 유지. UI 가 "last fresh: NN min ago" 표시.
- DB 비어있는 첫 가동 → API 가 빈 list 응답. SPA 는 HF info 직접 fetch 로 pending + markets 만 보임.
- 새 variant 가 publisher 에서 등장 → unknown variant 카드 + raw JSON dump + warning.
- 모바일 가로 모드 / 세로 모드 둘 다 작동.
- chat 메시지 sig (JWT) 만료 → 다음 send 시 401, 클라이언트가 자동 재-sign 흐름.
- 마켓 정산 시점 → 그 room 의 chat_message 자동 삭제 (CHARTER §3 retention).
- Builder approval 한도 (사용자 → builder) 초과 trade → HF 가 reject. UI 에 "approve more" 안내.
- chat 메시지 위조 시도 (JWT 없이 WS 메시지) → backend reject + connection close.

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

## Out of Scope (모든 Phase)

- validator key 보유 / 서명 / submit (그건 hl-vote-web).
- 자체 orderbook / matching engine. HF `/exchange` 로만 forward.
- 가상투표 / EIP-712 straw poll (v0.3 pivot 에서 제거; Phase J 채팅이 대체).
- multi-tenant — 다른 운영팀 자체 deploy (필요시 fork).
- Email / push notification.
- nickname / handle 시스템 — wallet address 만 ID (ENS / HL display name resolve 만).
- Image / GIF / file upload — 텍스트 only (≤ 500 char).
- DM / private chat — public market room 만.
