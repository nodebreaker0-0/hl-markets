# Feature Specification: hl-gov (Hyperliquid 거버넌스 public explorer)

**Feature Branch**: `001-hl-gov`
**Created**: 2026-05-24
**Status**: Draft
**Input**: builnad — "hl-vote-web 옆에 별도 SPA, 일반 사용자가 HL 거버넌스를 보고, 가상투표 가능. outcome 거버넌스는 Polymarket-스타일 detail page (perp 가격 차트, side 결과표). HF 가 historical endpoint 안 주니 자체 indexer. 모바일 친화. testnet/mainnet 둘 다. 확장 가능 (다른 variant 추가 쉽게)."

## User Scenarios & Testing

### User Story 1 — 일반 사용자가 현재 pending 거버넌스 본다 (P1, MVP)

**시나리오**: HL 사용자 (wallet 미연결도 가능) 가 `hl-gov.bharvest.io` 접속 → testnet 또는 mainnet 선택 → 현재 pending 거버넌스 목록 본다. outcome / delisting 별 카드, 통과 기준 (stake %, count %) progress bar, 만료 시간, 누가 voted/not-voted.

**Why P1**: 핵심 가치. 거버넌스 가시성 없으면 hl-gov 의 의미 0.

**Independent Test**: localhost 에서 frontend 띄우고 testnet 선택 시, HF `validatorL1Votes` 응답이 카드 리스트로 표시되면 통과.

**Acceptance Scenarios**:
1. **Given** 사용자가 `/` 진입, **When** network = Testnet 클릭, **Then** 1초 이내 pending governance 카드 리스트 로드.
2. **Given** 카드 리스트, **When** 카드 클릭, **Then** `/g/<gov_id>` detail 페이지로 이동, variant 별 renderer (outcome / delisting) 표시.
3. **Given** outcome 카드, **When** progress bar 영역, **Then** stake % (voted stake / total active stake) + count % (voted / active count) 가 시각화 (HL 민트 색).
4. **Given** mobile viewport (375px), **When** 카드 리스트 / detail, **Then** 한 손 사용 가능 (overflow 없음, terminal-friendly font).
5. **Given** wallet 미연결, **When** 페이지 진입, **Then** 모든 view 정상 (wallet 강제 X).

### User Story 2 — Delegator 가 내 stake 한 validator 의 vote 상태 본다 (P1)

**시나리오**: HYPE staker 가 wallet 연결 → `delegations(user)` fetch → 내가 stake 한 validator 들의 이름 + 그들이 현재 pending 거버넌스에 어떻게 vote 했는지 표.

**Why P1**: hl-gov 의 두 번째 핵심 가치. delegator → validator 압력 mechanism.

**Independent Test**: 실제 mainnet wallet 연결 → 내 delegation 목록 표시 + 각 validator 의 현재 pending vote 표 cross-ref.

**Acceptance Scenarios**:
1. **Given** wallet 연결 + delegation 있음, **When** "My Delegations" 탭, **Then** 내 validator 들 이름 + stake amount + 그들의 현재 pending votes 표.
2. **Given** validator 가 N 시간 vote 안 함, **When** 표시, **Then** 시각적 강조 (testnet 색 또는 경고 아이콘).
3. **Given** wallet 미연결, **When** "My Delegations" 클릭, **Then** "Connect wallet" prompt.

### User Story 3 — 사용자가 가상투표 한다 (P2)

**시나리오**: wallet 연결 → 거버넌스 카드 / detail 에서 "Poll vote" 클릭 → side 선택 → EIP-712 sign → POST /poll-vote → 서버 sig 검증 + DB save. 결과 = head count + stake-weighted 양쪽.

**Why P2**: 거버넌스 가시성 강화. validator 에게 delegator 의견 신호.

**Independent Test**: testnet pending 거버넌스 1건에 가상투표 1건 → DB 에 row 1개 → /poll-results 응답에 카운트 +1.

**Acceptance Scenarios**:
1. **Given** wallet 연결 + pending gov, **When** "Poll: Yes" 클릭, **Then** MetaMask EIP-712 popup → confirm → 1초 이내 "voted" 표시.
2. **Given** 같은 wallet 이 같은 gov 에 다시 vote, **When** "Poll: No" 클릭, **Then** 서버가 reject (duplicate) 또는 update (개정 정책에 따라 spec 결정).
3. **Given** 가상투표 결과 view, **When** 페이지 reload, **Then** head count 와 stake-weighted % 둘 다 표시. stake-weighted 는 voter 의 `delegated` 합산 비례.

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
- **FR-042**: SPA 가 pending (HF 직접) + historical (hl-gov API) 합쳐서 timeline 표시.

#### Phase G — 가상투표 (P2)

- **FR-050**: System MUST EIP-712 typed-data로 가상투표 sign. domain = `{ name: "hl-gov", version: "1", chainId: <wallet active>, verifyingContract: 0x0 }`. message = `{ network, govId, side, signedAt }`.
- **FR-051**: System MUST POST `/poll-vote` 받으면 sig 검증 (recovery → signer == declared). DB upsert.
- **FR-052**: System MUST 같은 (network, gov_id, voter_addr) duplicate 차단 또는 update (정책: **update — 사용자 마음 변경 OK**, 단 마지막 vote 만 카운트).
- **FR-053**: System MUST GET `/poll-results?network=X&gov_id=Y` 응답 — head count + stake-weighted (voter 의 `voter_stake` 합산).
- **FR-054**: System MUST 가상투표 결과 UI 에 "참고용 신호 — validator 실제 거버넌스 아님" 명시.

#### Phase H — Outcome detail Polymarket-style (P3)

- **FR-060**: System MUST outcome detail 에서 등록된 perp 의 현재가 (HF `metaAndAssetCtxs`).
- **FR-061**: System MUST 24h candlestick chart (HF `candleSnapshot`) — Recharts 또는 lightweight 라이브러리.
- **FR-062**: System MUST settled outcome 의 최종 winner side + 정산 시각.

#### Phase I — Polish + release host 결정 (P3)

- **FR-070**: System MUST Dockerfile 로 `apps/api` 빌드 가능, 200MB 이하 image.
- **FR-071**: System MUST 운영 host (builnad 추후 결정) 의 Postgres URL 등 env 한 곳 (.env) 으로 흡수.
- **FR-072**: System MUST custom domain `hl-gov.bharvest.io` 또는 결정 도메인.

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
