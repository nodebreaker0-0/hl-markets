---
description: "hl-markets implementation tasks (Phase A~I)"
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
