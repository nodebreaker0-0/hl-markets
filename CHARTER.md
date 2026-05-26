# hl-gov — Project Charter

> **Status**: Draft v0.2 (2026-05-24)
> **One-line**: Hyperliquid 거버넌스(outcome / delisting / 향후 variant) public explorer — Polymarket-스타일 UX, 가상투표, delegation lookup, HL 브랜드 톤. **Host-agnostic full-stack** (Postgres + Node API server + Next.js static SPA, Dockerized — Railway / Fly / AWS / self-hosted VPS 어디든 deploy).

---

## 1. Why this exists

### 1.1 현재 정보 비대칭

- Hyperliquid 거버넌스(outcome registration, settle, delisting, 향후 추가 variant)는 validator 풀에서 처리되지만, **일반 사용자/delegator 가 보는 곳이 없다**.
- `validatorL1Votes` info endpoint 는 pending 만 응답. settled/expired 거버넌스, 통과 기준 충족 여부, 누가 vote 했는지 등을 **하나로 묶어주는 도구가 부재**.
- Outcome 거버넌스의 핵심 — 통과 기준 (Jeff 인용: **20% stake + 50% count, tentative, no specific deadline**) 가 어디서도 시각화되지 않음.
- HL outcome market 자체는 perp 시장으로 trading 되지만, **거버넌스 → 등록 → trading → settle** 의 lifecycle 을 한 view 에서 보는 곳이 없다.

### 1.2 Delegator 의 사각지대

- 내가 stake 한 validator 가 거버넌스에 어떻게 행동하는지 (어떤 outcome 에 vote, 어떤 delisting 에 vote, 침묵 등) 알 길이 없다.
- 그 정보가 보이면 **delegator → validator 으로 압력**: 내 validator 가 거버넌스에 무관심하면 다른 validator 로 옮길 동기.

### 1.3 hl-gov 의 가치

- **모든 거버넌스를 한 곳에 가시화** — pending + historical, outcome + delisting + 향후 variant.
- **Polymarket-스타일 detail view** — outcome 거버넌스는 등록 → perp 시장 가격 차트 → settle 까지 하나의 페이지에서 추적.
- **가상투표** — wallet 연결한 delegator 가 의견 표시 (head count + stake-weighted 양쪽).
- **My delegation lookup** — wallet 입력 시 내가 stake 한 validator 들의 거버넌스 행동표.
- **확장성** — 다른 거버넌스 variant 가 추가되면 plugin/renderer 만 추가, 핵심 코드 변경 X.

### 1.4 hl-vote-web 과의 관계

| | hl-vote-web | hl-gov |
|---|---|---|
| 사용자 | validator key 보유자 | 일반 사용자 / delegator |
| 핵심 동작 | sign + submit | read-only explorer + 가상투표 |
| 백엔드 | **없음** (static SPA) | **있음** (Node API + Postgres) |
| Key custody | 사용자 wallet (또는 imported Ledger) | **없음** (key 처리 0) |
| Constitution §I | "Static-Only, No Backend" | **폐기** (다른 Constitution 적용) |
| Repo | `validator/hl-vote-web/` | `validator/hl-gov/` |
| Deploy | S3 + CloudFront | host-agnostic (Mac local Postgres for dev; Railway / Fly / AWS / VPS for prod — 추후 결정) |

두 도구는 **보완 관계**. hl-vote-web 의 "Vote on this" 가 hl-gov 의 거버넌스 detail 로 cross-link.

## 2. Non-goals

- ❌ validator key 보유 / 서명 / submit (그건 hl-vote-web).
- ❌ Trading / orderbook / 가격 결정 (그건 app.hyperliquid.xyz).
- ❌ 가상투표를 실제 거버넌스에 반영. **참고용 신호**만.
- ❌ 외부 분석 (gov 외 generic HL 분석).
- ❌ Multi-tenant / 다른 validator 팀 자체 deploy 지원 (필요시 그들이 fork).

## 3. Users & roles

| Role | 누구 | 무엇을 한다 |
|---|---|---|
| Observer | HL 일반 사용자 | 거버넌스 진행 상황 보기 — wallet 없이 가능 |
| Delegator | HYPE staker | wallet 연결 → 내 delegation 상태 + 내가 stake 한 validator 들의 vote 행동표 |
| Pollster | wallet 보유자 | 거버넌스에 가상투표 (head + stake-weighted 양쪽 카운트) |
| Researcher | HF / 다른 validator | historical 거버넌스 분석 |
| Hostile | DOS / sybil 공격자 | API rate limit + signed message 검증으로 차단 |

## 4. Stack (decision)

### 4.1 Frontend

| 결정 | 채택 | 이유 |
|---|---|---|
| Framework | **Next.js 14 App Router with `output: 'export'`** | hl-vote-web 패턴, static export |
| Language | **TypeScript strict** | type safety |
| Styling | **Tailwind CSS + mobile-first** | breakpoint 가벼움, base styles 갱신 (sm/md/lg) |
| Wallet | **EIP-1193 직접** | wagmi/viem 미사용 (bundle 절약) |
| Sign | **EIP-712 typed-data** (가상투표 message) | sybil 방어 |
| Hash | **@noble/hashes** | keccak256 |
| Test | **vitest** | hl-vote-web 패턴 |
| Deploy | **S3 + CloudFront** | 사용자 명시 |

### 4.2 Backend (host-agnostic)

| 결정 | 채택 | 이유 |
|---|---|---|
| Runtime | **Node 20** (single process — API + indexer in one) | frontend 와 언어 통일, dev iteration 빠름 |
| Web framework | **Hono** | lightweight, Node/Bun/Lambda/Cloudflare Worker 어디든 동작 — host portability 핵심 |
| ORM | **Drizzle ORM** | TypeScript-first, Postgres native SQL, migrations 가벼움 |
| DB | **Postgres 15+** | Mac local = Docker Compose, 운영 = managed (Railway / RDS / Supabase / Neon 등 추후) |
| Cron (indexer) | **node-cron** in-process | 별도 Lambda 불요, single deploy artifact |
| Container | **Dockerfile + docker-compose.yml** | Mac local + 운영 어디든 동일 image |
| Frontend host | **S3 + CloudFront** (hl-vote-web 패턴) | 정적 SPA 는 어디든 부담 0 |
| Backend host | **추후 결정** — Railway / Fly.io / AWS ECS / Render / 자체 VPS. Dockerfile 한 개면 모두 가능 | |
| Domain | `hl-gov.bharvest.io` | |

### 4.3 Single-process 구성

`apps/api/` 한 Node process 안에:
- **HTTP server (Hono)**: GET `/governance` (list, network 필터), GET `/governance/{id}`, POST `/poll-vote` (EIP-712 sig 검증 후 save), GET `/poll-results`.
- **In-process cron**: node-cron 매분 → 양 network 의 `validatorL1Votes` + `validatorSummaries` + `meta` fetch → Postgres upsert. expired/settled 시 status 업데이트.

운영 host 가 cron + HTTP 같은 process 지원해야 (Railway / Fly / VPS 모두 OK; Lambda 같은 stateless 환경이면 추후 분리).

### 4.4 Postgres tables (초안 — Drizzle schema)

| Table | PK | Cols |
|---|---|---|
| `governance` | `(network, gov_id)` | action JSONB, variant ENUM, status (pending/settled/expired), expire_time, first_seen_at, last_seen_at, settled_at, votes JSONB |
| `validator_snapshot` | `(network, validator, signer)` | name, stake NUMERIC, is_active, is_jailed, snapshot_at |
| `poll_vote` | `(network, gov_id, voter_addr)` | side TEXT, signature BYTEA, signed_at TIMESTAMP, voter_stake NUMERIC |

가상투표 sybil 방어: 한 wallet = 1 vote per governance (composite PK).

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  USER (브라우저, 모바일 포함)                                  │
│       ↓                                                      │
│  [ CloudFront / Vercel / GH Pages ] ─── [ static SPA ]      │
│       │                                                      │
│       ├─→ HF info direct (live data, no backend touch)      │
│       │   api.hyperliquid.xyz / api.hyperliquid-testnet.xyz │
│       │                                                      │
│       └─→ hl-gov backend (historical + 가상투표)            │
│            ↓                                                 │
│  [ Single Node process (Hono) — Dockerized ]                │
│            │   - HTTP routes: /governance, /poll-vote, ...   │
│            │   - In-process node-cron: 1m HF poll → upsert   │
│            ↓                                                 │
│       [ Postgres ]                                          │
│       Mac local = Docker Compose                             │
│       Prod = managed (Railway/Fly/RDS/Neon — 추후 결정)      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 6. Threat model

| 위협 | Mitigation |
|---|---|
| API DoS / spam | API GW rate limit + DynamoDB on-demand throttling + CloudFront caching |
| 가상투표 sybil (한 사람이 다 vote) | EIP-712 signed message + 한 wallet = 1 vote per governance (composite PK) |
| 가상투표 결과 조작 (host 탈취) | signed message 자체로 검증 가능 — sig 모두 verify 가능, audit 가능 |
| Indexer drift | snapshot_time 기록 + 운영자가 fresh check |
| Cross-site (다른 도메인이 API 호출) | CORS allowlist (hl-gov.bharvest.io + localhost 개발) |
| 가상투표 결과를 "실제 거버넌스" 처럼 오해 | UI 에 명시 "validator 거버넌스 아님 — 참고용 신호" |
| AWS account 탈취 | 별도 account / IAM Roles for Service Accounts / 운영자 MFA |

## 7. Versioning & release

- branch: `main` only. feature: `feat/NNN-*` short-lived.
- tag: `v0.1.0` (MVP) → `v0.2.0` (가상투표) → `v1.0.0` (Polymarket detail page).
- artifact: CDK `cdk synth` output + frontend `out/` 묶음. SHA-256 게시.
- deployment: `cdk deploy` (manual until CI 설정).

## 8. Phases

| Phase | 범위 | exit criteria |
|---|---|---|
| **A — Charter / spec-kit** | 본 charter + delegation_matrix + spec.md / plan.md / contracts/ / tasks.md / quickstart.md | builnad confirm |
| **B — Frontend skeleton + HL 톤** | Next.js + Tailwind + mobile-first + HL 다크/민트 | localhost / S3 빈 페이지 |
| **C — Live data (no backend)** | `validatorL1Votes` + `validatorSummaries` + `meta` 직접 fetch, 거버넌스 리스트 + detail (Polymarket card) | testnet/mainnet 둘 다 pending 거버넌스 보임 |
| **D — Delegation lookup** | wallet 연결 → `delegations(user)` → 내가 stake 한 validator 의 vote 상태 표 | 시험 wallet 으로 데이터 보임 |
| **E — Local backend (Postgres + Hono)** | Docker Compose (Postgres) + `apps/api` Hono Node process + Drizzle schema + indexer cron. Mac local 에서 `docker-compose up postgres && npm run dev` 한 줄로 모든 흐름 작동 | `curl localhost:3000/governance?network=testnet` 가 indexer 결과 응답 |
| **F — Historical** | indexer 가 expire/settle 된 governance row archive. API `/governance?status=historical` 에서 노출. SPA 가 historical 합쳐서 보여줌 | settled/expired 거버넌스 보임 |
| **G — 가상투표** | EIP-712 sign + POST `/poll-vote`, 결과 표시 (head + stake-weighted). 서버 측 sig 검증 | testnet 가상투표 N건 수집 |
| **H — Polymarket-style detail page** | outcome 시장 perp 가격 차트 (HF `candleSnapshot`), volume, 정산 조건, side 결과표 | 1 outcome 의 full lifecycle 표시 |
| **I — Polish + Release host 결정** | Dockerfile 검증, host 선택 (Railway / Fly / VPS / AWS — 추후 builnad 결정), custom domain `hl-gov.bharvest.io`, mobile responsive 검증 | 운영 endpoint 공개 |

## 9. Repository layout

```
hl-gov/
├── CHARTER.md
├── delegation_matrix.md
├── CLAUDE.md
├── README.md
├── Makefile                     # verify gate
├── docker-compose.yml           # Postgres for local dev
├── .specify/
│   ├── feature.json
│   └── memory/constitution.md
├── specs/001-hl-gov/
│   ├── spec.md
│   ├── plan.md
│   ├── contracts/
│   │   ├── governance.md        # variant 분류 + renderer interface
│   │   ├── api.md               # HTTP routes contract (host-agnostic)
│   │   └── data-model.md        # Postgres schema (Drizzle)
│   ├── quickstart.md
│   └── tasks.md
├── apps/
│   ├── frontend/                # Next.js static export
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── api.ts           # HF + hl-gov backend wrappers
│   │   │   ├── validators.ts    # 복사: hl-vote-web/lib/validators.ts
│   │   │   ├── governance/      # variant plugin/renderer
│   │   │   └── poll/            # 가상투표 client sign
│   │   └── tests/
│   └── api/                     # Hono Node server (HTTP + cron in-process)
│       ├── package.json
│       ├── Dockerfile           # 운영 host 어디든
│       ├── src/
│       │   ├── index.ts         # app entry
│       │   ├── routes/          # /governance, /poll-vote, /poll-results
│       │   ├── indexer/         # node-cron polling
│       │   ├── db/              # Drizzle schema + migrations
│       │   └── poll/            # server-side sig verify
│       └── tests/
└── .github/workflows/
    ├── ci.yml                   # verify gate
    └── release.yml              # tag v* → frontend SHA-256 + Docker image build
```

## 10. Verify gate (`make verify`)

다음 모두 통과 시에만 commit / push:

1. `frontend: npm run lint / typecheck / test / build`
2. `lambdas/indexer: npm run lint / typecheck / test`
3. `lambdas/api: npm run lint / typecheck / test`
4. `infra: npm run lint / typecheck / cdk synth` (template generation 검증)
5. `make constitution-gate` (별도 §11)
6. `make bundle-size` (frontend gzip < 1.5 MB — Polymarket-style component 까지 포함하니 hl-vote-web 보다 살짝 큼)
7. Golden 같은 게 있나? Phase F (가상투표 sig 검증) 시점에 sig fixture 통과 강제.

## 11. Constitution principles (preview — 별도 .specify/memory/constitution.md 에 자세히)

1. **I. Backend has zero key custody** — validator/delegator private key 를 절대 받지 않는다. signed message 만 검증.
2. **II. Signed messages over trust** — 가상투표는 EIP-712 sign + 서버 측 검증.
3. **III. Idempotent reads** — API GET 호출은 모두 idempotent. POST 만 변경.
4. **IV. Network selector explicit** — testnet/mainnet 토글, default 없음.
5. **V. Plugin/renderer extensibility** — 거버넌스 variant 추가가 코드 1개 파일 추가로 끝나야.
6. **VI. Mobile-first** — 모든 화면이 < 380px 에서 작동.
7. **VII. HL brand tokens** — 색 / 폰트 / 톤은 HL 시그니처 (다크 + 민트). Polymarket UX 패턴은 layout 만 차용, 색 가져오지 않음.
8. **VIII. No telemetry** — 외부 analytics SDK 0개.
9. **IX. Host-agnostic** — backend artifact 는 단일 Docker image. Mac local, Railway, Fly, AWS ECS, self-hosted VPS 어디든 docker run 으로 동작. host-specific 코드 (CDK / DynamoDB query / EventBridge handler) 0건.
10. **X. Tier gating** — Phase B → C → ... → I 순서 엄격.

---

## ✋ Confirmation request (builnad)

위 charter 의 결정 사항:

1. 이름 `hl-gov`, repo path `validator/hl-gov/`. → OK?
2. AWS serverless 풀스택 (Lambda + API GW + DynamoDB + EventBridge + S3 + CloudFront, IaC = CDK TS). → OK?
3. Phase A~I 분할. MVP 출발 = Phase B (frontend skeleton). → OK?
4. Constitution 10 원칙 위 preview. → OK?
5. 도메인 `hl-gov.bharvest.io`. → OK 또는 다른 안?

OK 면 delegation_matrix + .specify/memory/constitution + spec-kit 7파일 즉시 작성 + T001 (frontend skeleton) 시작.
