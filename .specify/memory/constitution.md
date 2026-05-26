# hl-markets Constitution

## Core Principles

### I. Backend Has Zero Key Custody (NON-NEGOTIABLE)

hl-markets 의 백엔드는 사용자 / validator / delegator 의 private key, mnemonic, agent key 를 **절대 받지 않는다**. 가상투표는 client-side EIP-712 sign 후 서버에 signed message + signature 만 보낸다. 서버는 signature 만 검증하고 voter 주소는 recovery 로만 결정. **key 가 서버에 도달하는 path 자체가 존재하지 않는다**.

### II. Signed Messages Over Trust (NON-NEGOTIABLE)

가상투표 / 의견 등록 모든 mutating action 은 EIP-712 typed-data sign 으로 인증한다. 서버는 항상 signature recovery → expected signer 검증 → DB save. **Auth header / Cookie / API key 같은 long-lived 토큰 없음** (운영자용 admin 가 필요해지면 별도 검토).

### III. Idempotent Reads

API 의 모든 GET 호출은 idempotent + cacheable. CloudFront / Cloudflare 등 edge cache 가 안전하게 캐싱 가능. side effect 는 POST 에만.

### IV. Network Selector Explicit

UI 의 testnet / mainnet 토글은 default 없음. 사용자가 명시 클릭. 색 / URL 으로 강한 시각 단서 (testnet=노랑, mainnet=빨강). 잘못된 network 로 가상투표하면 결과 무의미.

### V. Plugin / Renderer Extensibility (NON-NEGOTIABLE)

거버넌스 variant 추가 (`O`, `D`, 향후 `G`, `X`, ...) 는 코드 한 파일 추가로 끝나야 한다:
- `apps/frontend/lib/governance/renderers/<variant>.tsx` — detail view
- `apps/frontend/lib/governance/classify.ts` — 분류 매핑
- `apps/api/src/indexer/variant-handlers/<variant>.ts` — 인덱싱 시 별도 추출 필요 시

핵심 코드 (`index`, `api routes`, `db schema`) 는 새 variant 마다 변경 X.

### VI. Mobile-First

모든 화면이 < 380px 너비에서 작동. Tailwind sm/md/lg breakpoint 활용. desktop 은 보너스. 한 손 사용 가능.

### VII. HL Brand Tokens

색 / 폰트 / 톤은 HL 시그니처 — 다크 background (`#0F1A1F`) + 민트 accent (`#97FCE4`). Polymarket UX 패턴은 **layout / 정보 구조만** 차용, 색 / 폰트 가져오지 않는다.

### VIII. No Telemetry

외부 analytics SDK (Google Analytics, Sentry, RUM, Datadog 등) 0개. bug report 는 GitHub issue. 사용자 행동 추적 X.

### IX. Host-Agnostic (NON-NEGOTIABLE)

backend artifact 는 단일 Docker image. Mac local (`docker-compose up`), Railway, Fly, AWS ECS, self-hosted VPS 어디든 docker run 으로 동작. host-specific 코드 (CDK / DynamoDB query / EventBridge handler / S3 SDK 등) 0건. 환경 차이는 `.env` 한 곳에서 흡수.

### X. Tier Gating

Phase A → B → C → D → E → F → G → H → I 순서. 앞 Phase 의 exit criteria 미충족 시 다음 Phase 의 핵심 코드는 dead-path 로만.

## Operational Constraints

- **Bundle size (frontend)**: gzip 후 < 1.5 MB (Polymarket-style chart 라이브러리 포함하니 vote-web 보다 살짝 큼).
- **Browser support**: 모바일 Chromium / Safari iOS + 데스크탑 Chrome / Edge / Brave / Firefox.
- **Hosting target**: frontend = S3 + CloudFront (또는 동등). backend = Docker image 어디든.
- **CSP**: `connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz https://<backend-host>`.
- **Backend cost**: managed Postgres (Railway / Neon / Supabase) free / 작은 tier 안에서 운영 가능. Docker image < 200MB.

## Verify Gate (`make verify`)

모두 통과 시에만 commit / push:

1. `frontend: npm run lint / typecheck / test / build`
2. `apps/api: npm run lint / typecheck / test` + `docker build` 성공
3. `make migration-check` — Drizzle migration 파일이 schema 와 일치
4. `make constitution-gate` — 본 10 원칙 grep 가드
5. `make bundle-size` — frontend gzip < 1.5 MB
6. `make api-shape-test` — Hono routes 의 input/output 이 `contracts/api.md` 와 일치 (Zod schema 또는 OpenAPI export 비교)
7. `make sig-fixture` — 가상투표 sig 검증 golden (Phase G 이후)

### Constitution gate grep (예시)

- I/II: `apps/api/src/` 내 `privateKey|mnemonic|secret` literal grep 0건. routes 에서 sig 안 검증하는 path 0건.
- III: GET routes 에서 DB write 없음 (`db.insert|update|delete` grep on GET handler).
- IV: NetworkSelector 에 default 0건.
- V: `governance/renderers/index.ts` 가 dynamic registry (switch 또는 lookup) — hardcoded variant 0건 in routes.
- VI: Tailwind `sm:` / `md:` 클래스 사용. `min-width:` 1024px 같은 desktop-only 0건.
- VII: `tailwind.config.ts` 의 brand tokens 외 색상 hardcoded 0건.
- VIII: `analytics|sentry|googletagmanager` import 0건.
- IX: `aws-cdk-lib|@aws-sdk|aws-lambda` import 0건 in `apps/api/src/`.

## Governance

본 헌법은 hl-markets 의 모든 design / code / PR 결정에 우선한다. 위반 시 `plan.md` Complexity Tracking + builnad 명시 승인. **Non-negotiable 표기 원칙 (I, II, V, IX)** 은 예외 없음.

**Version**: 1.0.0 | **Ratified**: 2026-05-24 | **Last Amended**: 2026-05-24
