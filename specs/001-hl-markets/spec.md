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

### Edge Cases

- HF /info endpoint 일시 down → backend indexer 가 마지막 성공 snapshot 유지. UI 가 "last fresh: NN min ago" 표시.
- 사용자 wallet 의 delegation 응답이 empty → "No delegations found" + 단순 explorer mode 로.
- Wallet 의 active chain 이 HyperEVM 아님 → 거버넌스 view 는 영향 0. 가상투표 sign 시 typed-data 의 chainId 만 일관 (sign chain agnostic 검증).
- DB 비어있는 첫 가동 (Phase E 초기) → API 가 빈 list 응답. SPA 는 HF info 직접 fetch 로 pending 만 보임.
- 새 variant (예: `G`) 가 publisher 에서 등장 → unknown variant 카드 + raw JSON dump + warning ("새 거버넌스 type, renderer 미구현").
- 모바일 가로 모드 / 세로 모드 둘 다 작동.
- 가상투표 sig 위조 시도 → 서버 recovery 결과가 declared signer 와 불일치 → reject.

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

#### 보안 / 운영 / 통합 요구사항

- **FR-080**: System MUST CORS allow-list — frontend origin 만. wildcard X.
- **FR-081**: System MUST API rate limit (per IP) — DoS 차단. 5 req/sec 한도 (조정 가능).
- **FR-082**: System MUST 외부 telemetry / analytics 0건.
- **FR-083**: System MUST EIP-712 도메인 sign + verify 가 byte-exact 호환 (golden fixture 필수, Phase G).
- **FR-084**: System MUST 사용자 wallet address 외 PII 수집 0.

### Success Criteria

- **SC-001**: Mac local 에서 `docker-compose up postgres && cd apps/api && npm run dev && cd apps/frontend && npm run dev` 로 전체 흐름 작동.
- **SC-002**: pending 거버넌스 page load → 카드 표시 P95 < 2초 (HF info latency 포함).
- **SC-003**: 모바일 viewport 375 px 에서 모든 페이지 한 손 조작 가능 + overflow 0.
- **SC-004**: Indexer 매분 cron 실패 < 5% (cumulative). 실패 시 `last fresh` UI 표시.
- **SC-005**: 가상투표 sig 검증 — golden fixture 100/100 (Phase G).
- **SC-006**: Docker image < 200 MB, frontend bundle gzip < 1.5 MB.
- **SC-007**: 새 거버넌스 variant 추가 = 1 renderer 파일 + 1 classify entry. 핵심 코드 변경 0.

## Out of Scope (모든 Phase)

- validator key 보유 / 서명 / submit (그건 hl-vote-web).
- Trading / orderbook / 가격 결정 / 자체 시장 (그건 app.hyperliquid.xyz).
- 가상투표 결과를 HF on-chain 거버넌스에 반영 (참고용 신호만).
- multi-tenant — 다른 validator 팀 자체 deploy 지원 (필요시 그들이 fork).
- Discussion / comment system (Phase 후순위 또는 외부 Discord link).
- Email / push notification (Phase X+).
