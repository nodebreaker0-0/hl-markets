# Implementation Plan: hl-gov

**Branch**: `001-hl-gov` | **Date**: 2026-05-24 | **Spec**: ./spec.md

**Input**: ./spec.md (User Stories US1~US5, FR-001..084, SC-001..007)

## Summary

Hyperliquid 거버넌스 public explorer 를 host-agnostic full-stack 으로 구현.
- Frontend: Next.js 14 static export (Mac local + S3/CloudFront deploy, hl-vote-web 패턴).
- Backend: Hono on Node 20 single process (HTTP + in-process `node-cron`), Postgres + Drizzle ORM, Dockerfile + docker-compose.
- 운영 host = builnad 추후 결정 (Railway / Fly / AWS ECS / VPS — Docker image 1개로 모두 가능).
- 거버넌스 variant 확장 = plugin/renderer 1파일 추가.

Phase A (charter/spec-kit) → B (frontend skel) → C (live data) → D (delegation lookup) → E (local backend) → F (historical API) → G (가상투표) → H (Polymarket detail) → I (release + host 결정).

## Technical Context

**Language/Version**: TypeScript 5.5 strict, both frontend and backend.

**Frontend**:
- Next.js 14 App Router with `output: 'export'` (static export).
- Tailwind CSS mobile-first.
- EIP-1193 직접 (wallet) — wagmi/viem 미사용. EIP-712 sign 은 `eth_signTypedData_v4` 호출.
- `@noble/hashes` (keccak256), `@msgpack/msgpack` 미사용 (signing 안 함).
- Charts: `recharts` (Phase H).
- Test: `vitest`.

**Backend (`apps/api/`)**:
- Hono framework on Node 20 native HTTP.
- Drizzle ORM + Postgres driver (`postgres` package).
- `node-cron` for in-process scheduled polling.
- `viem` (사용 안 함) — sig verify 만 `@noble/curves/secp256k1` + keccak (가벼움).
- Zod for request validation (Hono 와 호환).
- Test: vitest.

**DB**: Postgres 15+. Mac local = Docker Compose. Prod = managed (Railway / Neon / Supabase 등 추후 결정).

**Target Platform**: 
- Frontend = 모바일/데스크탑 Chromium / Safari iOS / Firefox.
- Backend = Linux Docker (Mac M1 / arm64 + x86_64 둘 다 build).

**Project Type**: Monorepo — `apps/frontend` + `apps/api`.

**Performance Goals**:
- Frontend: initial page load P95 < 2s (HF info fetch 포함).
- Backend: GET /governance P95 < 100ms (DB only). POST /poll-vote P95 < 300ms (sig verify + DB write).
- Indexer cron: 1 polling cycle < 30s.

**Constraints**:
- Bundle (frontend) gzip < 1.5 MB.
- Docker image < 200 MB.
- API GET 모두 idempotent + cacheable (CDN-friendly).
- Postgres connection pool ≤ 10.
- Cost: Mac local 무료. Prod managed ≤ $10/월 (Railway / Neon free tier).

**Scale/Scope**:
- pending governance: 10~50 active 동시 (sub-resource는 거의 없음).
- 가상투표: governance 당 1000건 정도 예상 (한 wallet = 1 vote).
- Indexer: 매분 2 network × 4 endpoint = 8 fetch/min. 부담 거의 0.

## Constitution Check

> Gate: pass before Phase 0 research. Re-check after each Phase.

| 원칙 | 통과 | 비고 |
|---|---|---|
| I. Backend Zero Key Custody | ✅ | API spec 에 `privateKey`/`mnemonic` 입력 없음. sig only. |
| II. Signed Messages Over Trust | ✅ | 모든 mutating action (POST /poll-vote) 가 EIP-712 sig 검증 |
| III. Idempotent Reads | ✅ | GET 라우트가 DB write 안 함 (verify-gate grep) |
| IV. Network Selector Explicit | ✅ | testnet/mainnet 토글 default 없음 (hl-vote-web 패턴) |
| V. Plugin/Renderer Extensibility | ✅ | renderers/<variant>.tsx + classify.ts 추가만으로 new variant 지원 |
| VI. Mobile-First | ✅ | Tailwind sm/md/lg, 375px 한 손 조작 검증 |
| VII. HL Brand Tokens | ✅ | tailwind.config 에 brand tokens, 다른 hex 0 |
| VIII. No Telemetry | ✅ | analytics SDK import 0 |
| IX. Host-Agnostic | ✅ | aws-sdk / aws-cdk-lib import 0. Dockerfile 만으로 deploy |
| X. Tier Gating | ✅ | Phase 순서 강제 |

위반 항목 없음.

## Project Structure

### Documentation (this feature)

```text
specs/001-hl-gov/
├── spec.md              # WHAT / WHY
├── plan.md              # 이 파일 — HOW
├── contracts/
│   ├── governance.md    # variant 분류 + renderer interface + 통과 기준
│   ├── api.md           # HTTP routes contract
│   └── data-model.md    # Postgres schema (Drizzle)
├── quickstart.md        # 검증 시나리오 QS-1~9
└── tasks.md             # T001~T0NN
```

### Source Code

```text
hl-gov/
├── CHARTER.md
├── delegation_matrix.md
├── CLAUDE.md
├── README.md
├── Makefile                        # verify gate
├── docker-compose.yml              # Postgres local
├── .gitignore
├── .specify/
│   ├── feature.json
│   └── memory/constitution.md
├── specs/001-hl-gov/...
├── apps/
│   ├── frontend/                   # Next.js
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── .eslintrc.cjs
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           # active governance list
│   │   │   ├── g/[network]/[id]/page.tsx   # detail
│   │   │   ├── delegations/page.tsx        # my delegations
│   │   │   ├── historical/page.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── NetworkTabs.tsx
│   │   │   ├── GovernanceCard.tsx
│   │   │   ├── QuorumBar.tsx       # stake + count progress bars
│   │   │   ├── PollVotePanel.tsx   # wallet sign + result
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── MyDelegations.tsx
│   │   │   ├── ValidatorRow.tsx
│   │   │   ├── HistoricalList.tsx
│   │   │   └── outcome/
│   │   │       ├── OutcomeDetail.tsx
│   │   │       └── PriceChart.tsx          # Phase H
│   │   ├── lib/
│   │   │   ├── api.ts                      # HF + hl-gov backend wrappers
│   │   │   ├── validators.ts               # 복사: hl-vote-web/lib/validators.ts
│   │   │   ├── env.ts
│   │   │   ├── wallet/
│   │   │   │   ├── eip1193.ts
│   │   │   │   └── poll-sign.ts            # EIP-712 가상투표 sign
│   │   │   └── governance/
│   │   │       ├── types.ts
│   │   │       ├── classify.ts             # variant 분류 (O/D/unknown)
│   │   │       ├── thresholds.ts           # quorum 계산
│   │   │       └── renderers/
│   │   │           ├── index.ts            # registry
│   │   │           ├── outcome.tsx
│   │   │           ├── delisting.tsx
│   │   │           └── unknown.tsx
│   │   └── tests/
│   └── api/                                # Hono Node server
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       ├── .eslintrc.cjs
│       ├── drizzle.config.ts
│       ├── src/
│       │   ├── index.ts                    # app entry — Hono + node-cron startup
│       │   ├── env.ts                      # zod env schema
│       │   ├── db/
│       │   │   ├── client.ts
│       │   │   ├── schema.ts               # Drizzle schema
│       │   │   └── migrations/
│       │   ├── hf/                         # HF /info wrappers (mirror frontend)
│       │   │   └── index.ts
│       │   ├── indexer/
│       │   │   ├── run.ts                  # main cron loop
│       │   │   ├── governance.ts           # validatorL1Votes → DB upsert
│       │   │   ├── validators.ts           # validatorSummaries → snapshot
│       │   │   └── settle-detect.ts        # 사라진 pending row 의 settle/expire 판단
│       │   ├── routes/
│       │   │   ├── governance.ts           # GET /governance, /governance/{id}
│       │   │   ├── poll.ts                 # POST /poll-vote, GET /poll-results
│       │   │   ├── health.ts
│       │   │   └── cors.ts
│       │   └── poll/
│       │       └── verify.ts               # EIP-712 sig recovery
│       └── tests/
└── .github/workflows/
    ├── ci.yml                              # verify gate
    └── release.yml                         # tag v* → frontend SHA-256 + Docker image
```

**Structure Decision**:
- Monorepo `apps/frontend` + `apps/api`. 공유 코드 없음 (validator 매핑은 양쪽에 복사 — 가벼움 + 의존 0).
- `apps/api` 는 single Node process (HTTP + cron 같이). prod 에서 worker 분리 필요해지면 Phase X+.
- Frontend 빌드 산출물 (`out/`) 는 S3 sync. backend 는 Docker image push.

## Phases

(spec.md §Phases 와 동일 — 본 plan 의 각 Phase 시점에 Constitution Check 재실행)

### Phase A — Charter / Spec-Kit (now)
완료 시점: CHARTER + delegation + constitution + spec + plan + contracts + quickstart + tasks 모두 ✅.

### Phase B — Frontend skeleton + HL 톤
T001~T020 — package.json, next config, layout, NetworkTabs, 빈 GovernanceCard.

### Phase C — Live data
T030~T050 — lib/api 에 HF wrappers, GovernanceCard 채움, QuorumBar, classify/renderers (O/D/unknown), detail page route.

### Phase D — Delegation lookup
T060~T080 — WalletConnect, MyDelegations 탭, ValidatorRow.

### Phase E — Local backend
T100~T130 — apps/api scaffold, Hono routes (stub), Drizzle schema, indexer cron, Docker Compose Postgres, basic /governance GET.

### Phase F — Historical
T140~T160 — settle-detect 로직, /governance?status=historical, frontend historical 탭 통합.

### Phase G — 가상투표
T170~T200 — EIP-712 typed-data 정의, poll-sign client, poll-verify server, sig golden fixture, /poll-vote + /poll-results.

### Phase H — Polymarket detail
T210~T230 — recharts 도입, OutcomeDetail + PriceChart (HF candleSnapshot), market metadata 표시.

### Phase I — Release + host 결정
T240~ — Dockerfile 최적화, frontend bundle 검증, custom domain 설정 가이드, host 비교 표 (Railway vs Fly vs ECS vs VPS).

## Key Rules

- Constitution §V (plugin 확장) — 새 variant 추가는 1 renderer 파일 + 1 classify entry. core 변경 X.
- Mobile-first — 모든 새 컴포넌트는 base style 부터 모바일. desktop 은 `md:` 이상에서만 width 확장.
- Brand — hex literal hardcode 0건. `tailwind.config.ts` 의 `hl` 팔레트만 사용.
- 사용자 데이터 — wallet address + signature + side 외 PII 0.
- Cost — Mac local 무료. Prod 도 free tier 내 운영 가능하도록 cron 빈도 / DB row 수 / image size 최적화.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| — | — | — |

위반 없음.
